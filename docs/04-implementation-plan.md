# Implementation plan

The order is set by risk: **car detection on real photos is the make-or-break part, so it comes first** (D26). Each later milestone ends with something usable.

## M0 — Scaffold (small)
- Create the git repo `github.com/cchaglund/<repo>`, public.
- Vite + TypeScript + Preact/signals + Vitest scaffold (D18). Deploy to GitHub Pages via a GitHub Action (D21).
- Fixture prep script: `fixtures-raw/` → strip EXIF, keep ≤2048px → `fixtures/france/<set>/`.

## M1 — Vision spike: registration + car detection (the risk)
No app UI and no track annotation. TypeScript + OpenCV.js running in Node. The same modules later run in the browser Worker.

1. **Registration.** Fixture photo → homography to `circuits/france.png` (ORB/AKAZE + RANSAC).
   - Measure on all 128 photos: success rate and reprojection error.
   - Check visually: warp each photo onto the reference and overlay them.
   - If markerless fails at these angles → try ArUco (D2).
2. **Track mask, derived automatically.** Threshold the asphalt in the reference image to get a "where cars can be" mask, so no annotation is needed yet.
3. **Lighting normalization** against the reference image (D20).
4. **Car finding + joint color assignment** for the 6 colors (D20).
5. **Review loop** (D24). Generate a review page per set → you mark correct/wrong and click the true positions → `truth.json` per set, in reference-image pixels → automatic metrics from then on.
6. Iterate: tune → `npm run test:vision` → compare against the go/no-go bar (Q-BAR).

### Status (2026-10-30)
- ✅ **Step 1, registration: 127/128 photos (99%)** pass the D27 bar (≥95%). See `npm run vision:register` → `reports/registration/france/index.html`.
  - Two-pass ORB: a coarse pass with **tilt simulation** (the frame stretched vertically ×1, 1.7, 2.5 to undo shallow-angle foreshortening), then a refine pass on the frame pre-warped to top-down.
  - Successful photos have ~1.5–4k refine inliers at ~1.5px reprojection error. The checkerboard overlays show track lines continuing cleanly.
  - The single failure (`empty-light-a/13`) is a blurry, low-quality shot. That's the quality gate's job.
- ⚠️ **Speed: ~4s per photo in Node on a laptop.** Too slow for a phone as it stands. To do before M5: smaller images (coarse at ~1000px), fewer features, caching the reference descriptors, and only re-running tilts on failure. For M6 live mode, track between frames (optical flow) instead of full re-registration.
- 🚧 **Steps 2–4, detection: in progress** (`npm run vision:detect -- france pos-a` → `reports/detection/france/index.html`). Approach in `src/vision/detect.ts`:
  - warp the photo into reference space;
  - global histogram matching, then a local offset correction (large median filter) for glare;
  - difference against the empty reference board, tolerant of misalignment (outside the local min/max range of the reference);
  - limited to an automatic track mask (asphalt components of the reference);
  - blobs → HSV colour costs → one-to-one DP assignment.

  **Where it stands:** on `pos-a`, the six cars form tight consistent clusters across photos, but there's still noise: some photos give 20–80 spurious blobs (glare on asphalt, lane-line edges), so assignments are sometimes wrong. **Next:**
  1. look at the effect of the glare correction just added;
  2. filter blobs by car shape and size;
  3. tune the colour priors per colour (black/silver especially);
  4. run all sets, including the false-positive check on the `empty` sets;
  5. build the review page (consensus position per colour per set → you confirm or correct → `truth.json`), then automatic metrics against D27;
  6. then M1b phone benchmark.
- ℹ️ The npm OpenCV.js build only has **ORB**: no AKAZE, SIFT or ArUco. That's fine so far. If a fallback is ever needed: a custom OpenCV.js build, or `js-aruco2`.

**Exit:** the go/no-go bar is met on the training sets *and* the held-out set. If it can't be met → rethink: ArUco, a stand-alone ML detector, a different capture UX, or fall back to tap-first.

## M1b — Phone benchmark (concept check, right after M1 detection)
Before building any app on top of it: does the pipeline run fast enough on a **real phone**?
- A bare bench page (`/bench.html`) runs the M1 pipeline (registration → normalization → detection) in a Web Worker, on (a) bundled fixture photos and (b) a fresh camera capture.
- It reports the time per stage, plus the OpenCV.js download and init time. Run it on your phone, plus at least one older or cheaper phone (iOS and Android if possible).
- Served from the laptop over LAN HTTPS (`npm run dev`), so no deployment is needed.
- **Targets:** snapshot ≤ ~1.5s from tap to overlay on a mid-range phone; registration-only ≤ ~150ms per frame for M6 live.
- **If it misses:** optimize first (resolution, feature count, fewer tilt passes, cached reference descriptors). If that's still not enough, rework the concept: e.g. snapshot-only with no live mode, or ask for a steadier, closer shot.

## M2 — Rules engine (no UI; can run in parallel with M1)
- Track model types, plus a tiny synthetic test track.
- `resolveLegendMove`, covering all the rule branches: behind the Legends Line, between line and corner, the 2-corner cap, full spaces → back to the first free spot, raceline spot choice (D13).
- Deck: shuffle, one card per round, reshuffle when empty (D4).
- `raceOrder()` exposed for the future (D6).
- **Done when** a table-driven test suite covers each rule. The rulebook example is test #1.

## M3 — Track annotator + France annotation
- Page: load the reference image → click both ends of each boundary across the track, in race order (D12). Tag Corner Line + speed limit, Legends Line and finish. Raceline side carries over from the previous boundary, with a toggle at swaps (D14).
- Overlay the derived diamonds 0–3 to check them against the board print.
- Annotate France. Convert `truth.json` from M1 (pixel positions) → space/spot positions, to check detection end-to-end.

## M4 — App shell + tap mode (dev milestone, later the fallback/correction tool, D9)
- Setup: track, each color's role (Legend / human / not playing) (D7).
- Round flow: [Next round], Legend buttons, card flip on the first Legend tap, undo (D6).
- Tap the Legend's position → target + explanation text. Full-space hint.
- Persist after every action; offer "Resume race?" (D23). Updatable PWA (D22).

## M5 — Snapshot mode
- Camera screen: capture a frame → the M1 pipeline in a Worker → BoardState → engine → overlay on the frozen photo, labeled "Green →".
- Quality gate with user hints (D19, thresholds from the fixtures).
- [Wrong car] cycles through guesses → tap to correct. Learning from silence (D20).
- Partial views / unknown occupancy / off-screen target arrow (D16).

## M6 — Hybrid live mode (D15)
- After detection, registration only, on downscaled frames at ~5–10 fps. Smoothed H, the last good H held through brief dropouts, snapshot fallback when the board is lost.

## Later
See [07-future-enhancements.md](07-future-enhancements.md).
