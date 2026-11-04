# Open questions & decisions

Resolved items move to the Decisions log at the bottom.

| ID | Question | My recommendation |
|---|---|---|
| Q-REPO | Repo name? | `heat-legends` |
| Q-FULLPHOTOS | Shoot a `pos-c` set with full spaces + cars on diamonds | Before M5 |

## Decisions log
- **D1 — Any phone, no WebXR.** Target iOS (any browser = WebKit) and Android Chrome. Use only getUserMedia, canvas and WASM. A 2D homography overlay replaces SLAM.
- **D2 — Registration: markerless first, ArUco as fallback.** The choice is made on measured accuracy against photo fixtures in the M1 vision spike.
- **D3 — Card data** transcribed into `data/legend-cards.json`. `B` = Blue; the source file has been corrected too.
- **D4 — One Legend card per round**, revealed when the first Legend is due to move. The "clarification" in the rules file was corrected to match.
- **D5 — 2D overlay arrows** for now.
- **D6 — The user drives the turn order.** One button per Legend, plus [Next round]. The card is flipped on the first Legend tap of the round, and there is undo. Alternatives 2 and 3 are in `07-future-enhancements.md`.
- **D7 — Setup assigns each of the 6 colors** (red, blue, green, yellow, black, silver) a role: Legend, human or not playing.
- **D8 — All participating cars are detected automatically**, humans included, so full spaces are handled correctly. The user doesn't tap car positions. Black and silver are uncommon but supported: dark-car detection is a known risk and needs dedicated fixtures.
- **D9 — Tap mode is a dev milestone plus a fallback.** Built first to exercise the track data and rules. It then stays as a correction tool when detection is wrong or unsure, and as a backup when the camera can't be used. It is never a required step.
- **D10 — Reference images are the BGG board photos in `circuits/`** (~4000px; copyright isn't a concern). They're slightly perspective photos with fold creases. That's fine, since homography works between any two views of a plane. The app ships a ~2000px WebP/JPEG; the annotator uses the full resolution.
- **D11 — France is the first track.** Base rules only; expansions later.
- **D12 — Annotation by space boundaries.** Click both ends of each line across the track between spaces. Spaces are the 4-sided shapes between consecutive lines, split along the center into 2 spots. Corner Lines and Legends Lines are tags on boundaries.
- **D13 — Full spaces:** take the raceline spot if both are free. If the space is full, go back to the first space with a free spot. This applies to every Legend outcome.
- **D14 — The raceline is annotated per space.** It's a white line beside the track and swaps sides along the circuit (France: right side from the start until the speed-limit-4 corner).
- **D15 — Snapshot first, then hybrid live.** Detect once on a clean frame, then keep only board alignment running on live video. No fully live detection. Snapshot is the fallback when alignment is lost.
- **D16 — Partial views are allowed.** The Legend must be in view. Unknown occupancy at the target → show the hint instead of guessing. Off-screen target → arrow at the edge of the screen.
- **D17 — No lap tracking in v1.** Movement doesn't depend on the lap. Starting-grid spaces are normal spaces.
- **D18 — Stack:** Vite + TypeScript, Preact + signals, Vitest. OpenCV.js runs in a Web Worker and is loaded the first time the camera is opened. No backend; state is kept in localStorage.
- **D19 — Handheld only, never a fixed camera.** Every snapshot and live frame is realigned. The app needs a frame-quality gate (blur, too-shallow angle, too little of the board aligned) that rejects a bad frame and tells the user why ("hold the phone higher"). Test photos must cover shallow angles and glare.
- **D20 — No calibration step.**
  - Lighting is normalized per frame against the known board art.
  - All car blobs are matched to the participating colors jointly, one-to-one.
  - The overlay names the car it found, and [Wrong car] cycles to the next-best guess, with tap-to-correct as the last resort.
  - Unrejected detections are learned as examples once the user moves on. Old examples decay.
- **D21 — Hosting:** a public repo `github.com/cchaglund/<repo>`, deployed to GitHub Pages by a GitHub Action on every push to `main`.
- **D22 — An installable, offline-capable PWA that stays updatable** (`vite-plugin-pwa`, `registerType: "prompt"`).
  - The app checks for a new version on launch and when it returns to the foreground, and shows "Update available → Reload".
  - It **never auto-reloads mid-race**. Reloading is safe anyway, because the game state is persisted.
  - The version and build date are shown in settings.
- **D23 — Game state is saved after every action** (setup, deck order, round, card, undo history). Reopening offers "Resume race?".
- **D24 — Ground truth comes from reviewing detector output**, not from typing positions in.
  - Verdicts are saved per set as reference-image coordinates.
  - After that, accuracy is measured automatically.
  - One set is held out to guard against overfitting.
- **D25 — The France fixtures are the design target for camera angle.** Shallow, handheld shots with small cars. Quality-gate thresholds are derived from them.
- **D26 — Vision spike first, before track annotation.** Registration + car detection on the France fixtures, in TypeScript + OpenCV.js running in Node (same code as the browser Worker later). Ground truth is in reference-image pixels, so no annotation is needed. The track mask is derived automatically from the asphalt in the reference image. The rules engine can be built in parallel.
- **D27 — Go/no-go bar for the vision spike** (training *and* held-out sets):
  - registration ≥95% of photos;
  - red/blue/green/yellow right color + position ≥95%, and within the top-2 guesses ≥99%;
  - silver ≥85%;
  - black best effort, no bar (tap-to-correct);
  - false cars on empty boards ≤1 per 20 photos.

  Time box ~2 weekends, then rethink rather than polish.
- **D28 — Annotation is validated against the printed board.** The board prints distance-to-corner beside each space (diamonds 0–3, then 4, 5, 6…), and a helmet icon marks each Legends Line. The annotator overlays its computed distances so they can be checked against the print. It also refuses a Legends Line that sits closer to the corner than diamond 3; on France it's ~5 spaces before the corner. As a defense, the engine never moves a Legend backwards from its own space.
- **D29 — Detection uses a reference of the user's own board,** made by a one-time **board scan per track**, stored on the phone (IndexedDB; a ~2000px image per track). The scan is a per-pixel median of many aligned views of the **empty** board. Measured: it removes the false coloured detections caused by the BGG scan's colours differing from the user's print. Setup flow: choose track → "use stored board" (only if one exists) or "scan board" → car roles. Scan UX: D32–D34. Role UI: D31.
- **D30 — Close-up shots are the realistic use case,** not a bird's-eye view of the whole board: a Legend moves a short distance, so the user frames just that part of the track. Fixtures and thresholds must cover close-ups. A partial view already registers well (pos-b-light-a/21: 2,495 refine inliers).
- **D31 — Car-roles screen:** three areas (Human / AI / Not in play), all cars start under Human. Tapping a car moves it to the next area; dragging also works. Remembers the last setup. At least one AI car is required to continue.
- **D32 — Board scan = filming.** The user sweeps the phone over the empty board; the app picks sharp, well-aligned frames itself (sharpness gate: ≥0.8 photo px per reference px) and shows a small track map that fills in as each part gets ≥3 sharp views. No manual photo-taking. Evidence: two video sweeps gave 91–92% sharp coverage.
- **D33 — Scan timing:** right after choosing the track, with the board **empty** ("remove all cars"); a car present during the scan would become part of the reference.
- **D34 — Scans are stored and reused** (IndexedDB, per track). The app *suggests* a rescan (how: D36), rather than requiring one each game. Evidence: a lamp-on scan works on lamp-off close-ups and vice versa; lighting is normalized per frame.
- **D35 — Moving a Legend = a short sideways sweep, then a live AR arrow** (agreed 2026-11-03). Replaces the single-photo snapshot of M5 and merges M5 with M6. Flow: tap the Legend's button → the camera opens → the user moves the phone slowly about a hand's width sideways over that part of the track (1–2 s, progress bar) → a car counts only when ≥2 views from clearly different positions agree (glare moves with the viewpoint, a car doesn't; holding still would repeat the same glare) → the engine resolves the move → the camera keeps running with alignment-only tracking, and an arrow from the car to its target spot is drawn on the live picture until the user taps Done. Evidence: multi-view check on the fixtures, 0 false cars in 98 empty photos (vs 0.1–0.8 per single photo); phone tracking 70–96 ms/frame.
- **D36 — Light changes: rescan mid-race with the cars on the board** (agreed 2026-11-03; refines D34). The user's play-test showed detection nearly stopping after a lighting change until a rescan. (1) Trigger: after **2 sweeps in a row** that aligned the board but didn't find the Legend, the camera screen suggests "Rescan board" (also always in the settings sheet). An automatic "the light has changed" statistic was tried and dropped: per-frame noise doesn't track recall (the printed board scores the lowest noise yet finds 24/42 vs 33/42; `tools/light-check.ts`). (2) The rescan starts from the old scan and never takes pixels near a car: the known positions, plus cars detected on a space in ≥2 scan frames (a car stays put; a false detection rarely repeats on a spot). Measured (`RESCAN_FROM=… tools/scan-sim-video.ts`): a lamp-off rescan on top of a lamp-on scan scores the same as a fresh lamp-off scan; the other way round recall 34/42 vs 33/42 fresh. Leaving out every candidate blob froze 26–31% of the board, because candidates recur exactly where the light changed. Fitting the old scan's colours to the new light didn't help (detection normalizes lighting per frame), so the old scan is kept as is. Rejected: lifting the cars off (clumsy), no rescan at all.
- **D37 — Visual style: "Chequered Flag"** (picked by the user 2026-11-04 from five proposals: Pit Wall, Race Programme, Chequered Flag, Night Race, Game Night). Black and white only, square corners, 2px black rules, Barlow Condensed 800 italic for titles and buttons, Barlow for text, a chequered strip on titles, sheets, the scan dialog and the sweep progress. The cars are the only colour on screen. Filled Legend button = not yet moved (kept from the gallery feedback). Fonts are bundled (`@fontsource`, latin only) and precached, so it works offline. Replaces the dark theme with crimson buttons.
- **Known detection risk:** black cars on dark asphalt (France, USA) and silver on the light grey track (Italy).
