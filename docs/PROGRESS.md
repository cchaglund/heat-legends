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

**Decided (D29):** a one-time board scan per track builds the own-board reference. Scan UX decided in D32–D34, role UI in D31.

Closer look at the "fixed-spot yellow" false positive (`reports/yellow-false-positive.png`): it's the grass verge right next to the track. The track mask is dilated 25px onto the verge (for car height), and the verge is pale yellow-green in the BGG scan but saturated yellow on the user's board. So it's a colour-reproduction difference, which the own-board reference removes.

### State on 2026-11-02
New fixtures (close-ups + video scans, see 05-development-and-testing.md). The detection reference is now built from a **video sweep** (`npx tsx tools/build-own-reference.ts france scan-light-d` → `reports/ref/france-scan-light-d.png`): 91–92% of the board has ≥3 sharp views (vs 57% from the bird's-eye photos).

`DETECT_REF=reports/ref/france-scan-light-d.png npm run test:vision -- france closeup empty scan`:

Close-ups are now **confirmed by the user** (`truth.json` "photos", 2026-11-02). Hit = the right colour within 40px of the marked spot.

| Close-ups (32 photos) | red | blue | green | yellow | black | silver |
|---|---|---|---|---|---|---|
| names-only (before review) | 13/13 | 17/17 | 10/10 | 10/10 | 3/5 | 5/13 |
| **confirmed**, before today's fixes | 13/13 | 16/16 | 9/10 | 8/10 | 0/5 | 1/13 |
| **confirmed**, now | 13/13 | 16/16 | 9/10 | 10/10 | 1/5 | 5/13 |

False detections now: empty-light-a 1.26/photo, empty-light-b 1.65, scan-light-c 0.96, scan-light-d 0.29. Almost all black/silver (silver rose with the all-bright rule, e.g. empty-light-b 14 → 27).

Findings:
- **Names-only hid the black/silver problem:** the detector found "a silver" in most photos, but in the wrong place.
- **At the true silver spot** there is nearly always a blob (≤11px off): compact (500–850 px²), almost all BRIGHT, no dark. The old two-tone rule rejected it → added an "all-bright" alternative in `colorCost`. It also accepts glare/markings, hence the false-positive rise.
- **At the true black spot** the evidence is poor (a tiny blob, a bright blob, or one merged with neighbours). Black is "best effort" in D27.
- **Coloured blobs swallow their shadow** and the centroid drifts 40–70px → `makeBlob` now centres on the colourful pixels (yellow 8 → 10).
- The remaining green miss (`closeup-light-d/yellow-green-blue-2`): a yellow+green group of 4390 px² that `splitByHue` didn't split.
- **Cross-lighting works:** a reference scanned with the lamp on detects the coloured cars on lamp-off close-ups (and the reverse).
- Video frames include **motion blur** (e.g. scan-light-c/03); the quality gate (D19) should reject them.

**Likely way forward for black/silver: stop tuning pixels and use the track.** A car can only stand on a space. Once M3 annotates the spaces, a blob counts only when it sits on a space, and only one car fits per spot. Most black/silver false blobs (verges, markings, glare streaks) are not on a space centre. Measure this on the fixtures as soon as `tracks/france.json` exists.

### Next actions (in order)
1. Quality gate: a blur metric (Laplacian variance) per frame, threshold from the fixtures. Rejected frames don't count as false positives; the app asks to hold steady.
2. Pull M3's annotation forward far enough to get space positions for France, then test "blob must be on a space" against the black/silver false positives (see above). This is probably the big lever, not more pixel rules.
3. Optional black/silver pixel work: why the silver assignment still picks a wrong bright blob in 8/13 close-ups (regenerate blobs with `DETECT_REF=reports/ref/france-scan-light-d.png npm run vision:detect -- france closeup-light-d` and compare costs).
4. Board scan is decided (D32–D34); build it in M4/M5 using `tools/build-own-reference.ts` as the algorithm.
5. → M1b phone benchmark.

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
- [x] New fixtures delivered 2026-11-02: `closeup-light-c/d` (c = lamp off, d = lamp on), `scan-light-c/d` (video frames). See 05-development-and-testing.md.
- [x] User reviewed the close-ups (2026-11-02). The review page now saves left-in-place guesses as confirmed (earlier saves were backfilled from the guesses shown).
- [x] Decided D32: board scan = film, auto-pick sharp frames, coverage map.
- [x] Decided D33: scan the empty board right after choosing the track.
- [x] Decided D34: store scans, suggest a rescan on unusual noise.

## Findings & gotchas (read before touching vision code)
- **OpenCV.js (`@techstark/opencv-js`)** only has **ORB** for features: no AKAZE/SIFT/ArUco. Load it via `loadCv()` in `src/vision/cv.ts`.
- `new cv.Mat(h, w, type)` is **not zero-initialized**. Use `cv.Mat.zeros(...)` for masks. (This caused a "0 blobs" bug.)
- Every `cv.Mat` / vector must be `.delete()`d. WASM memory isn't garbage collected.
- **sharp** applies `resize` *before* `composite` in one pipeline. Composite to a buffer first, then resize in a second `sharp()` call.
- All vision work happens in **reference space**: `circuits/<track>.png` downscaled to 2000px wide. H maps photo px → reference px. Ground truth will be stored in the same space.
- Use **chroma** (max−min), not HSV saturation, for "is this colourful" on dark pixels: saturation explodes near black.
- Silver and black cars are two-tone in the data (body + wheels/shadow/highlights). Single-class rules miss them.
- Fixture photos are shallow-angle and handheld, by design (D25). Cars are ~30–50px long in a 2048px photo.
- **Names-only scores lie** for black/silver: a detection of the right colour somewhere isn't a hit. Use confirmed truth.
- Registration takes ~4s/photo in Node. The detection report re-registers every photo, so a full run takes several minutes. Pass a set filter (`-- france pos-a`) while iterating.
- `fixtures-raw/` holds the original photos **with GPS EXIF**. It's git-ignored; never commit it. `reports/` is git-ignored too: regenerate it.

## Session log
- **2026-11-02 (c)**: User agreed D32–D34 (scan by filming, empty board after track choice, store + suggest rescan).
- **2026-11-02 (b)**: User confirmed close-up positions; review save bug fixed + backfilled; real-position scoring exposed black/silver; paint-centred blobs (yellow 10/10); all-bright silver rule (5/13, more FPs). Next: blur gate, on-space prior.
- **2026-11-02**: Close-up + video fixtures; prep keeps names and extracts video frames; per-photo review mode; close-up scoring; references built from video; blob hue-splitting (full spaces); black/silver size penalty. Coloured cars 45/45 on close-ups (names-only).
- **2026-11-01**: M2 rules engine (subagent, 52 tests); review page; `test:vision`; blob grouping; own-board reference experiments (plain median, then sharpness-gated); adaptive thresholds and the edge cue tried and reverted. Awaiting close-up fixtures + a video sweep from the user.
- **2026-10-29**: Design Q&A with the user → docs 01–07, decisions D1–D28, card data.
- **2026-10-30**: M0 scaffold; repo created and pushed; Pages deploy working; fixtures prepared; registration 127/128; detection pipeline first version (clusters visible on `pos-a`, too noisy).
- **2026-10-31**: Added CLAUDE.md + this file for handoff. Detection: candidate classes, chroma-based track mask, two-tone silver / large-dark black → coloured cars ~90–100%, black/silver ~70–90% (consensus proxy). Started the own-board reference experiment.
