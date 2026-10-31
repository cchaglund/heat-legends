# Progress & handoff

**The single source of truth for "where are we".** Any agent or person picking up the work starts here. Update it at the end of every work session, and whenever a task is finished (see "Handoff routine" in [CLAUDE.md](../CLAUDE.md)).

- Plan (what and why): [04-implementation-plan.md](04-implementation-plan.md)
- Decisions (D1…): [06-open-questions.md](06-open-questions.md)

## Current focus

**M1, steps 2–4: car detection on the France fixtures.**

### Results so far (consensus check: is each colour's detection at its set's median position, within 40px?)
| Set | red | blue | green | yellow | black | silver |
|---|---|---|---|---|---|---|
| pos-a-light-a (21) | 20 | 19 | 18 | 21 | 15 | 18 |
| pos-b-light-a (23) | 20 | 21 | 21 | 19 | 19 | 19 |

False detections on `empty-light-a`: 15 over 22 photos (yellow 7 at a fixed spot, silver 5, black 2, red 1). D27 wants ≤1 per 20 photos.
The consensus check is a proxy until the user confirms `truth.json` via the review page.

### Next actions (in order)
1. **Own-board reference experiment** (running at the end of 2026-10-31): `tools/build-own-reference.ts` builds a per-pixel median of the empty-board photos in reference space (`reports/ref/france-empty-light-a.png`). `DETECT_REF=<png> DETECT_OUT=france-ownref npm run vision:detect -- france <set>` runs detection against it. Compare with the BGG reference on pos-a, pos-b-*, and **empty-light-b** (not -a: the reference was built from -a). If it's clearly better, propose to the user (new decision): the app builds and refines an own-board reference automatically from its own snapshots during play (per-pixel median over turns, with cars masked out), starting from the BGG scan.
2. Remaining false positives: fixed-location ones (print differences) → solved by (1) if adopted. Otherwise add an "ignore" mask.
3. Build the review page → `fixtures/france/<set>/truth.json` (D24): consensus position per colour per set, the user confirms or drags it.
4. Replace the Python consensus check with `npm run test:vision` (TS): metrics vs truth, D27 bar, held-out `pos-b-light-b`.
5. → M1b phone benchmark. Note: detection is also slow (~2–3s/photo in Node at 2000px reference) and needs the same diet as registration.

Analysis helpers: `npm run vision:detect` writes `_<set>-blobs.json` (every blob with features and the assigned colour) next to the report. A throwaway Python consensus script was used for the table above; port it into the TS eval in step 4.

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
- [x] Track mask from the reference: asphalt by **chroma** (not saturation, which is unstable on near-black), components ≥15% of the largest. To be replaced by the annotated track in M3.
- [x] Lighting normalization: histogram matching + local offset (glare)
- [x] Car finding: per-pixel candidate classes (colourful / darker-than-asphalt / brighter-grey) on a misalignment-tolerant diff → blobs
- [x] Joint colour assignment: DP one-to-one. Costs: hue for coloured cars; black = large + mostly dark; silver = two-tone (bright + some dark)
- [~] False positives on empty boards (15/22 photos) → own-board reference experiment
- [x] Registration cache for fast iteration (`reports/cache/`)
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
- Use **chroma** (max−min), not HSV saturation, for "is this colourful" on dark pixels: saturation explodes near black.
- Silver and black cars are two-tone in the data (body + wheels/shadow/highlights). Single-class rules miss them.
- Fixture photos are shallow-angle and handheld, by design (D25). Cars are ~30–50px long in a 2048px photo.
- Registration takes ~4s/photo in Node. The detection report re-registers every photo, so a full run takes several minutes. Pass a set filter (`-- france pos-a`) while iterating.
- `fixtures-raw/` holds the original photos **with GPS EXIF**. It's git-ignored; never commit it. `reports/` is git-ignored too: regenerate it.

## Session log
- **2026-10-29**: Design Q&A with the user → docs 01–07, decisions D1–D28, card data.
- **2026-10-30**: M0 scaffold; repo created and pushed; Pages deploy working; fixtures prepared; registration 127/128; detection pipeline first version (clusters visible on `pos-a`, too noisy).
- **2026-10-31**: Added CLAUDE.md + this file for handoff. Detection: candidate classes, chroma-based track mask, two-tone silver / large-dark black → coloured cars ~90–100%, black/silver ~70–90% (consensus proxy). Started the own-board reference experiment.
