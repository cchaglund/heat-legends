# Architecture

## Comparing the two proposals, and my recommendation

The project started from two AI-generated proposals, one from Claude and one from Gemini. They aren't kept in the repo; this table records what each proposed and what was kept.

| Topic | Claude's take | Gemini's spec | Recommendation |
|---|---|---|---|
| Legends rules | Card-driven, interleaved turns | Batch "at end of round", sorted by index | **Claude.** Batch resolution breaks the rules for full spaces and for interleaving with humans. |
| Board registration | 4 printed ArUco markers → homography | Markerless ORB feature matching against the track art | **Markerless first, ArUco as fallback, decided by measurement.** The board art is rich and unique, and cars cover little of it. Markerless also works on *partial* views. Corner markers force the whole board into frame, which makes the cars small. Risks: glare, shallow angles, low light. Both are tested on photo fixtures in M4. |
| AR layer | Canvas overlay on getUserMedia, no WebXR | WebXR + Three.js, with SLAM anchoring | **Canvas, no WebXR.** WebXR AR doesn't exist on iOS, in any browser: they all run on WebKit. A flat board viewed from any pose maps to the image by a homography, which we recompute per photo or frame. No SLAM needed. |
| Capture | Video frames | ImageCapture API for 12MP stills | **Video frames** (`drawImage` from `<video>`). ImageCapture doesn't exist in Safari, and a 1080p frame is plenty for colored cars. |
| Track data | Hand-annotated per track | JSON of polygons per space, template art from TTS/BGG | **Both**: Gemini's polygon-per-spot data model, filled in with Claude's annotation tool. Use the art from your own photo or from community scans. |
| Car detection | Color inside each spot, plus a calibration step | HSV mean inside each polygon | Same idea. **HSV + per-session calibration.** |
| Delivery | Staged: annotator → tap → photo → live | Straight to full AR | **Staged.** |

Short version: Claude's plan, with Gemini's data model and HSV detail. Drop WebXR, ImageCapture and end-of-round batching.

## Components

```
┌──────────────────── static web app (Vite + TypeScript + Preact/signals) ─────────────────┐
│                                                                                           │
│  track-data/        JSON per track: spaces, spots (polygons), corners, Legends Lines       │
│        │                                                                                  │
│        ▼                                                                                  │
│  engine/            PURE TS, no DOM. Deck, Legend move resolution, occupancy, race order │
│        ▲                                                                                  │
│        │ BoardState { carColor → spotId }                                                 │
│  input/                                                                                   │
│    tap.ts           tap on the reference image → spotId                                   │
│    vision/          (Web Worker) OpenCV.js: ArUco → homography → HSV per spot → BoardState│
│        │                                                                                  │
│        ▼                                                                                  │
│  render/            draws highlights on the reference image / photo / live video (canvas) │
│                                                                                           │
│  annotator/         separate page: build track JSON by clicking on a reference image      │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Track model (draft)

The annotation stores **space boundaries**: the lines across the track between spaces (D12). Spaces and spots are derived from them.

```ts
type Track = {
  id: string;                 // "france"
  referenceImage: string;     // circuits/france.png; every coordinate is in its pixels
  boundaries: Boundary[];     // in race order; boundary i is the line *before* space i
  laps: number;               // default lap count (printed on the board)
};
type Boundary = {
  a: Point; b: Point;         // ends of the line across the track. a = same side every time (e.g. left in driving direction)
  raceline: "a" | "b";        // side of the raceline for the space AFTER this boundary (a white line beside the track;
                              // it swaps sides along the circuit). The annotator copies it from the previous boundary, and you toggle it at swaps.
  tags?: Array<
    | { kind: "corner"; speedLimit: number }   // Corner Line
    | { kind: "legends" }                      // Legends Line
    | { kind: "finish" }>;
};
// Derived at load time:
type Space = { index: number; quad: [Point, Point, Point, Point]; spots: [Spot, Spot] };
type Spot  = { id: string; polygon: Point[] };   // quad split at the midpoints of a–b; spots[0] = raceline spot
```

- The circuit is a loop: the space after the last one is space 0. Distance is index arithmetic modulo the number of spaces.
- The diamond spaces 0–3 don't need annotating: they're "the N-th space before a corner boundary". The annotator overlays them so they can be checked against the printed diamonds.

The circuit is a loop of spaces. A car's position is (lap, spaceIndex, spot). Distance is index arithmetic modulo track length.

### Engine (pure functions, easy to test)

```ts
resolveLegendMove(track, board, legendColor, card): { from: SpotId; to: SpotId; reason: string }
raceOrder(track, board): CarColor[]
```

`reason` is a human-readable explanation, for example "behind Legends Line, speed 12 would cross corner 3 → stop 2 before". It builds trust and makes debugging easier.

### Vision (modes B and C)

All of this runs in a Web Worker. OpenCV.js is a ~8–10MB WASM download, cached after the first load.

1. **Registration** (pluggable): markerless ORB/AKAZE feature matching against the reference image + RANSAC `findHomography`, *or* ArUco markers. Output: homography H, camera → reference.
2. **Frame-quality gate** (handheld only, D19). Reject the frame and say why if: it's blurry (low Laplacian variance), the alignment has too few inliers or a high reprojection error, or the view is too shallow (recovered tilt > ~55°). Show a hint like "hold higher / steadier / less glare".
3. **Lighting normalization** (D20). Using H, pair camera pixels with reference-image pixels across the board (excluding the track spots, where cars may sit). Fit a per-channel color transform from camera to reference, with robust regression to ignore hands and cars, and apply it to the frame. The cars are now classified in "reference lighting". No calibration step.
4. **Car finding.** Look for car-sized, saturated or high-contrast blobs on the track. **Cars have height**: at oblique angles a car's top appears shifted away from the camera, off its spot. So each blob is assigned to the spot with the best overlap, using a slightly enlarged spot region.
5. **Joint color assignment** (D20). Score each blob against each participating color's model: built-in priors plus learned examples. Solve **one-to-one** (Hungarian), allowing a color to be missing (occluded or out of frame). Black and silver are scored on brightness and contrast vs. the asphalt, not on hue. Output: BoardState plus a confidence per car, and the ranked alternatives for each color.
6. **Feedback loop** (D20).
   - The overlay always labels the car it believes is the active Legend ("Green →").
   - **[Wrong car]** forbids that blob↔color pair and re-solves → next-best guess. When there are no guesses left → tap to correct (D9).
   - **Learning from silence:** when the user moves on (next Legend or [Next round]) without rejecting, the accepted blobs' normalized color samples are stored as examples, in localStorage. Corrections are stored as both negative and positive examples. Old examples decay, so recent games dominate.

### Rendering

A canvas on top of the `<video>`. Target and source polygons are projected through H⁻¹ and drawn as a filled outline plus an arrow. In mode C, H is recomputed on every frame, smoothed, and the last good H is kept when the markers are briefly hidden.

## Hosting

A static site over HTTPS (camera access requires it), for example GitHub Pages, Netlify or Cloudflare Pages. No backend and no accounts. State lives in localStorage (deck order, calibration).
