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

### Own-board reference experiment (2026-10-31)
Reference = per-pixel median of the 22 `empty-light-a` photos warped into reference space.

| | BGG scan reference | Own-board reference |
|---|---|---|
| Coloured cars (pos-a / pos-b-a / pos-b-b) | 18–21/21, 19–21/23 | 14–21/21, 18–22/23, 27–30/30 |
| Black / silver | 15–19 of 21–23 | **collapsed** (0–9): blobs fragment into separate dark and bright parts; thresholds were tuned for the BGG reference |
| False positives on `empty-light-b` (31 photos) | 40 (yellow 27 at one fixed spot = print difference) | 37 (coloured only 4; black 25, silver 8) |

Reading: the own-board reference **removes the print-difference false positives for coloured cars**, but the black/silver rules need re-tuning for it (merge nearby dark+bright fragments into one blob; recalibrate the dark/bright margins). **Caveat:** `pos-b-light-b` was meant to be the held-out set and has now been looked at. Pick a new hold-out (ideally new photos from another day) before final numbers.

**Decided (D29):** a one-time board scan per track builds the own-board reference. **Pending:** the scan UX (auto-capture while sweeping vs guided photos), the car-role UI, and new close-up fixtures (D30).

Closer look at the "fixed-spot yellow" false positive (`reports/yellow-false-positive.png`): it's the grass verge right next to the track. The track mask is dilated 25px onto the verge (for car height), and the verge is pale yellow-green in the BGG scan but saturated yellow on the user's board. So it's a colour-reproduction difference, which the own-board reference removes.

### Next actions (in order)
1. Get the user's answers on the scan UX, the role UI and the new fixtures (see the chat on 2026-11-01).
2. Merge nearby blob fragments (a larger closing, or merge blobs whose boxes are within ~15px) and re-tune the black/silver margins for whichever reference wins.
3. Build the review page → `fixtures/france/<set>/truth.json` (D24): consensus position per colour per set, the user confirms or drags it.
4. Port the Python consensus check to `npm run test:vision` (TS): metrics vs truth, D27 bar, new hold-out set.
5. → M1b phone benchmark. Detection is also slow (~2–3s/photo in Node at 2000px) and needs the same diet as registration.

Analysis helpers: `npm run vision:detect` writes `_<set>-blobs.json` (every blob with features and the assigned colour) next to the report.

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
- [x] Review page: `npm run review` → http://localhost:4600 (needs `npm run vision:detect -- france <set>` first for photos and consensus). Saves `fixtures/<track>/<set>/truth.json`.
- [ ] User reviews `pos-a-light-a` and `pos-b-light-a` (`pos-b-light-b` has the same positions: copy its truth file)
- [x] `npm run test:vision`: per-colour hit rate vs truth (or consensus) + false detections on empty sets; `DETECT_REF` selects the reference
- [ ] Meet D27 on a fresh hold-out (the user's new close-up photos)
- [ ] Registration speed-up (currently ~4s/photo on the laptop)

### M1b — Phone benchmark
- [ ] `/bench.html` + Worker running the pipeline, with timings per stage
- [ ] Run on the user's phone (+ an older one). Compare with the targets in the plan.

### M2 — Rules engine ✅ (2026-11-01)
- [x] `src/engine/`: types, `deriveTrack` (annotation → spaces/corners, validates D28), loop arithmetic, `syntheticAnnotation` for tests
- [x] `resolveLegendMove` (rules A/B, 2-corner cap, D13 full spaces, D28 defence) with human-readable `reason`
- [x] Deck state machine (`newDeck` / `nextRound` / `revealCard`, one card per round, reshuffle)
- [x] `raceOrder()` (lap-unaware, D17)
- [x] 52 tests; test #1 = the rulebook example with real card 4
- Rule readings are documented in the header of `src/engine/move.ts` (e.g. ending on diamond 0 is not crossing; the 2-corner cap = aim at the second corner's diamond 0, then D13). Known nit: `spaceLabel` calls any space 0–3 before the *next* corner "diamond N", even when the explanation is about another corner.

### M3 — Annotator + France track data
- [ ] Annotator page (boundaries, tags, raceline toggle, printed-distance check D28)
- [ ] `tracks/france.json`
- [ ] Convert `truth.json` pixel positions → spaces

### M4 — App shell + tap mode · M5 — Snapshot mode · M6 — Hybrid live
- [ ] Not started. See the plan.

### Open items needing the user
- [ ] **New fixtures (the user plans to shoot them on 2026-11-02):** close-up sets like `pos-b-light-a/21`, two positions per lighting; at least one full space + a car on a diamond space; a slow video sweep of the empty board (for the board-scan feature and live mode). These become the new hold-out set.
- [ ] Decide: board-scan capture = film and auto-pick frames with a coverage map (proposed) vs manual guided photos.
- [ ] Decide: scan with the board empty, right after choosing the track (proposed).
- [ ] Decide: store scans + suggest a rescan on unusual noise (proposed) vs scan every game. The user's concern is lighting; the evidence says lighting is handled per frame.

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
