# Progress & handoff

**The single source of truth for "where are we".** Any agent or person picking up the work starts here. Update it at the end of every work session, and whenever a task is finished (see "Handoff routine" in [CLAUDE.md](../CLAUDE.md)).

- Plan (what and why): [04-implementation-plan.md](04-implementation-plan.md)
- Decisions (D1…): [06-open-questions.md](06-open-questions.md)

## Current focus

**M1, steps 2–4: car detection on the France fixtures.**

### Next actions (in order)
1. Re-run `npm run vision:detect -- france pos-a` and judge the local glare correction (`removeLocalOffset` in `src/vision/detect.ts`), which was added at the end of the last session but not evaluated. Look at `reports/detection/france/_pos-a-light-a-summary.jpg` and the `*-diff.jpg` images.
2. Reduce spurious blobs: filter by car size/shape in reference space (a car ≈ one spot; measure the actual area range from the clusters), and/or raise the threshold adaptively per photo.
3. Tune the colour costs (`colorCost`), especially black and silver. Print per-blob HSV for the cluster positions to set the priors from data.
4. Run all sets (`npm run vision:detect`). Check that the `empty-*` sets produce (almost) no detections.
5. Build the review page → `fixtures/france/<set>/truth.json` (D24). Proposal: per set, take the consensus position per colour (median of the detections), plot it on the reference, and let the user drag/confirm each marker; a "copy JSON" button.
6. `npm run test:vision`: automatic metrics against the D27 bar.
7. → M1b phone benchmark.

## Task checklist

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

### M0 — Scaffold
- [x] Planning docs (01–07) and decisions D1–D28
- [x] Git repo, public at https://github.com/cchaglund/heat-legends. Commits use the no-reply email `40951536+cchaglund@users.noreply.github.com`, set in the repo-local git config.
- [x] Vite + TS + Preact/signals + Vitest scaffold; `npm run dev / build / test / typecheck`
- [x] GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) → https://cchaglund.github.io/heat-legends/ (runs tests + build on push to `main`)
- [x] Fixture prep: `npm run fixtures:prep` (`fixtures-raw/` → `fixtures/`, EXIF/GPS stripped)
- [x] Legend cards as data: `data/legend-cards.json`
- [ ] PWA setup (`vite-plugin-pwa`, prompt-to-update, D22). Planned for M4.

### M1 — Vision spike
- [x] Registration: two-pass ORB with tilt simulation, **127/128 (99%)**. `src/vision/registration.ts`, report `npm run vision:register`
- [~] Track mask from the reference (asphalt components). Works; it loses some grid-area pieces. Revisit once the annotator exists.
- [~] Lighting normalization: histogram matching + local offset (glare). The local part is unevaluated.
- [~] Car finding: misalignment-tolerant diff vs the empty reference → blobs. Too many spurious blobs.
- [~] Joint colour assignment: DP one-to-one with a missing penalty. The colour priors are hand-set.
- [ ] Run all 5 sets; false-positive check on the empty sets
- [ ] Review page → `truth.json` per set
- [ ] `npm run test:vision` metrics vs D27; hold out `pos-b-light-b`
- [ ] Registration speed-up (currently ~4s/photo on the laptop)

### M1b — Phone benchmark
- [ ] `/bench.html` + Worker running the pipeline, with timings per stage
- [ ] Run on the user's phone (+ an older one). Compare with the targets in the plan.

### M2 — Rules engine
- [ ] Track model types + synthetic test track
- [ ] `resolveLegendMove` (all branches, D13 full spaces, 2-corner cap)
- [ ] Deck (one card per round, reshuffle)
- [ ] `raceOrder()`
- [ ] Table-driven tests; the rulebook example is test #1

### M3 — Annotator + France track data
- [ ] Annotator page (boundaries, tags, raceline toggle, printed-distance check D28)
- [ ] `tracks/france.json`
- [ ] Convert `truth.json` pixel positions → spaces

### M4 — App shell + tap mode · M5 — Snapshot mode · M6 — Hybrid live
- [ ] Not started. See the plan.

### Open items needing the user
- [ ] Shoot a `pos-c` fixture set: full spaces (2 cars side by side) and cars on diamond spaces. Needed before M5.

## Findings & gotchas (read before touching vision code)
- **OpenCV.js (`@techstark/opencv-js`)** only has **ORB** for features: no AKAZE/SIFT/ArUco. Load it via `loadCv()` in `src/vision/cv.ts`.
- `new cv.Mat(h, w, type)` is **not zero-initialized**. Use `cv.Mat.zeros(...)` for masks. (This caused a "0 blobs" bug.)
- Every `cv.Mat` / vector must be `.delete()`d. WASM memory isn't garbage collected.
- **sharp** applies `resize` *before* `composite` in one pipeline. Composite to a buffer first, then resize in a second `sharp()` call.
- All vision work happens in **reference space**: `circuits/<track>.png` downscaled to 2000px wide. H maps photo px → reference px. Ground truth will be stored in the same space.
- Fixture photos are shallow-angle and handheld, by design (D25). Cars are ~30–50px long in a 2048px photo.
- Registration takes ~4s/photo in Node. The detection report re-registers every photo, so a full run takes several minutes. Pass a set filter (`-- france pos-a`) while iterating.
- `fixtures-raw/` holds the original photos **with GPS EXIF**. It's git-ignored; never commit it. `reports/` is git-ignored too: regenerate it.

## Session log
- **2026-10-29**: Design Q&A with the user → docs 01–07, decisions D1–D28, card data.
- **2026-10-30**: M0 scaffold; repo created and pushed; Pages deploy working; fixtures prepared; registration 127/128; detection pipeline first version (clusters visible on `pos-a`, too noisy).
- **2026-10-31**: Added CLAUDE.md + this file for handoff.
