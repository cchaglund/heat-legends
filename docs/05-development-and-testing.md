# Developing and testing easily

## Principles
- **Engine is pure TS** → fast unit tests with Vitest, no browser needed. Most bugs will be rules bugs, so this is where most tests go. The first test case is the rulebook example (Green, Red, Blue, Yellow).
- **Vision is tested on recorded fixtures, not on a live camera.** Detection changes become measurable, e.g. "France fixtures: 46/48 cars found and labeled correctly". Run the fixture suite before and after every vision change.
- **Desktop first.** Every camera screen also accepts an uploaded photo or video as its source, so most iteration happens on a laptop.

## Fixture set (France)

128 handheld phone photos (2048×1536 JPEG) of the real France board, shot from all four sides, mostly at **shallow angles** (standing at the table). Raw files are in `fixtures-raw/france/`; that folder is git-ignored (the photos contain GPS EXIF).

| Set | Photos | Cars | Lighting | Purpose |
|---|---|---|---|---|
| `empty-light-a` | 23 | none | daylight | Registration; false-positive check |
| `empty-light-b` | 31 | none | daylight + ceiling light | same, other lighting |
| `pos-a-light-a` | 21 | all 6, positions A | daylight | Detection + assignment |
| `pos-b-light-a` | 23 | all 6, positions B | daylight | Detection + assignment |
| `pos-b-light-b` | 30 | all 6, positions B | daylight + ceiling light | Lighting normalization (same positions, other light) |

Added 2026-11-02 (close-ups, the realistic use case, D30). **light-c = ceiling lamp off, light-d = ceiling lamp on** (both daytime):

| Set | Items | What |
|---|---|---|
| `closeup-light-c` | 12 photos | Close-ups. The file name lists the cars of interest (`red-silver-2.jpg`); positions differ per photo. Includes a full space (green + yellow side by side). |
| `closeup-light-d` | 20 photos | Same, with the lamp on |
| `scan-light-c` | 23 frames | 1 fps frames from a ~23s video sweep of the empty board (the board-scan use case) |
| `scan-light-d` | 21 frames | Same, with the lamp on |

Close-up truth is per photo (`truth.json` → `photos.<name>.<colour> = [x, y]` in reference px, or `null` = absent), entered via `npm run review` → `/photos`.

Missing so far: **full spaces** (2 cars side by side) and cars right on a diamond space. To be shot later as `pos-c-*`.

What the photos show:
- Cars are **small**, roughly 30–50px long at 2048px, and seen at shallow angles. The car-height shift is large, and the black car on dark asphalt is barely visible. The quality-gate thresholds (D19) must be set from this data, not guessed: these photos *are* how the app will be used.

### Ground truth by review, not by typing (D24)

Nobody types car positions in by hand. Instead, the detection is reviewed iteratively:

1. Run the detector over a set → it renders a **review page**: each photo with its labeled detections, plus all detections projected onto the reference image.
2. You mark each detection correct or wrong. A wrong or missing car → click its true position on the reference image.
3. Those verdicts are saved as `truth.json` **per set**, as positions in reference-image pixels. Because every photo in a set shares the same car positions, and every detection is mapped into reference coordinates, one review covers the whole set (~25 photos).
4. From then on, accuracy is measured automatically (`npm run test:vision`). You only review new failures. Tune → re-run → compare, repeated.

Guard against overfitting: 128 photos of one room, one board and one afternoon are a narrow sample. Hold out one set (e.g. `pos-b-light-b`) for final checks only, and add photos from another evening or room before calling detection "done".

Committed fixtures: downscaled copies with EXIF stripped, in `fixtures/france/<set>/`, plus `truth.json`.

## Phone testing
- The camera requires HTTPS. Options:
  - `vite --host` with `@vitejs/plugin-basic-ssl` → open `https://<laptop-ip>:5173` on the phone and accept the certificate warning.
  - Or a tunnel (`cloudflared tunnel --url http://localhost:5173`) for a real certificate.
- Remote debugging: Safari Web Inspector (iPhone over USB) or `chrome://inspect` (Android).
- Debug overlay toggle: shows matched features, projected spot polygons, the blobs found, assignment scores and the quality-gate verdict.
- Every push to `main` deploys to GitHub Pages, so the real installed PWA can be tested, including the update prompt.

## Commands (planned)
```
npm run dev        # local dev server with HTTPS
npm test           # engine unit tests
npm run test:vision  # fixture suite → accuracy report
npm run build      # static build → dist/
```
