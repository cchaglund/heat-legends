# Progress & handoff

**The single source of truth for "where are we".** Any agent or person picking up the work starts here. Update it at the end of every work session, and whenever a task is finished (see "Handoff routine" in [CLAUDE.md](../CLAUDE.md)).

- Plan (what and why): [04-implementation-plan.md](04-implementation-plan.md)
- Decisions (D1…): [06-open-questions.md](06-open-questions.md)

## Current focus

**2026-11-03: first real play-test on the phone went well ("works great", fast). Waiting for the user's annotated screenshots from the UI gallery (`?gallery`).** One finding: after a lighting change the camera barely worked until the user rescanned the board, so the stored scan is tied to the lighting it was made in (see the gotcha; makes D34's "suggest a rescan" more important).

**UI gallery:** `/?gallery` (deployed: https://cchaglund.github.io/heat-legends/?gallery) shows all 34 screen states in 390×844 iframes; `/?state=<id>` renders one state alone. States are in `src/app/gallery/states.tsx` (real components with made-up data; camera screens use the printed board as a still picture). For this the camera screens were split into a container and a view (`MoveCameraView`, `ScanBoardView`, `drawOverlay`), and a few screens take an optional starting state (`StartScreen saved`, `BoardScreen scanDate`, `RolesScreen initial`, `TapMode initial`, `UpdateBannerView`). In `?state` mode storage writes are disabled, so a tap there can't overwrite the real saved race. Add a state there when adding a screen state.

**Earlier on 2026-11-03: the whole flow is built (M4 + M5 per D35).** App: https://cchaglund.github.io/heat-legends/ (or `npm run dev` → `https://<LAN IP>:5173/`). Flow: France → Scan board (film the empty board ~30 s; map fills; Done) → roles → race → tap a Legend → sweep sideways over it → live arrow → Done. "By hand" = tap mode.

**Sweep + scan results (2026-11-03):**
- Sweep consensus `src/vision/sweep.ts` = a pair of views ≥40 ref px apart agree **and** ≥60% of the views showing the spot see the car. On the 10 fps empty-board videos (`npx tsx tools/sweep-eval.ts`, detection reference = the *other* video's scan): 0 false cars in 44 sweeps (lamp off), 1–2 in 39 (lamp on, a persistent silver glare). The pair rule alone: ~0.3 per sweep. Recall on close-up groups (`npx tsx tools/sweep-recall.ts`): 12/12 named cars.
- On-phone board scan `src/vision/scan.ts` (median of the 3 sharpest views per pixel, ~40 MB): needs (a) a polish pass per frame (`track` within 24px, 12000 features), because the fast registration is up to ~25px off on some frames, and (b) **≤1 frame/s intake**: with all 10 fps frames the 3 sharpest views are the closest ones, the reference gets too crisp, silver drops 7/8 → 0/8 and false blacks appear. With both: 0 false cars, silver 7/8 (`npx tsx tools/scan-sim-video.ts closeup-light-d` with `EVERY=10`, then `DETECT_REF=… npm run test:vision`).
- Browser-tested with a fake camera (Chrome `--use-file-for-fake-video-capture` with a y4m panning over `closeup-light-d/yellow-green-blue.jpg`, and IMG_2040 as the scan video): the sweep found yellow at space 6 (= truth), the arrow is drawn on the live picture; the scan stored and the board step offers "Use stored board". Also checked on the production build (`vite preview`).

---

**Earlier: M1, steps 2–4: car detection on the France fixtures.**

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

**Quality gate (2026-11-02):** `src/vision/quality.ts`. The plain Laplacian variance (`sharpness`) depends on the scene, so it doesn't separate blurry from sharp. `relativeSharpness` (detail of the warped frame ÷ detail of the reference, on the visible track) is returned by `detectCars` as `sharpness`. Measured (`SHARPNESS_LOG=<file> npm run test:vision`): close-ups 1.9–8.9; still photos 0.66–3.5; the visibly motion-blurred video frames ~0.5–0.8 (scan-light-c/14 0.50, scan-light-d/12 0.81). **Blur does not explain the black/silver false positives:** they're spread across all sharpness levels (rejecting <0.5 changes 1.11 → 1.09/photo). The gate is for the UX ("hold steady"); a threshold of ~0.6 is a starting point. Values above 1 are normal: a single photo has more noise than the median reference.

**On-space filter + silver edge cue (2026-11-02, with the confirmed `tracks/france.json`):** `SPACES=0 DETECT_REF=reports/ref/france-scan-light-d.png npm run test:vision`
- "Blob centre must be inside a space" (`detectCars(..., accept)`; eval: `SPACES=<margin px>`): black false positives 47 → 13 on the empty sets, no recall loss. A 10px margin brings most of them back (they sit just off the asphalt). Silver false positives unchanged: they're **glare on the asphalt**, all-bright and car-sized (`FP_LOG=<file>` logs them).
- New blob feature `edge` = frame gradient beyond the reference's local max gradient. Real silver blobs 34–82, glare mostly 2.5–30 → silver cost penalty below `SILVER_MIN_EDGE` 30.
- Result: close-up silver 5/13 → **10/13**; false detections empty-light-a 1.26 → 0.65/photo, empty-light-b 1.65 → 0.71, scan-light-c 0.96 → 0.30, scan-light-d 0.29 → 0.10. Coloured cars unchanged. Black close-ups still 1/5.
- Caveat: `edge` grows with photo sharpness (close-ups are sharper than the empty sets). If silver misses on far shots, scale the threshold by `relativeSharpness`.

**Speed + multi-view (2026-11-02, later):**
- Registration: the coarse pass matches 2000 frame features against 4000 reference features; the refine pass matches only within 24px (`matchLocal`, grid buckets + JS popcount) and is the real check (`MIN_REFINE_INLIERS` 150, coarse may be as low as 10). Node: 4s → **0.6s/photo**, 200/204 registered (old 203). `npx tsx tools/compare-registration.ts` compares with the cache. The old cache is in `reports/cache-old/`.
- Detection: 2.6s → **0.4s**. Most of it was OpenCV.js `Mat.data` being a getter (a new view per access) inside per-pixel loops: always hoist `const d = mat.data` (gotcha below). The offset field is now at 1/8 resolution; the reference gradient for `edge` is precomputed in the model.
- Live mode: `track(cv, ref, frame, Hprev)` = local match only, around the previous H (radius `TRACK_PX` 72). 10 fps frames from the video (`reports/live/`, extracted locally): 0 lost, ~107ms/frame at 640px, ≤4.5px from a full registration.
- Bench page `bench.html` (dev server): Chrome on the laptop → snapshot 0.8–1.7s, live tracking ~110ms/frame, lock-on ~250ms.
- **Phone bench (2026-11-03, user's iPhone, iOS 26.6, Chrome = WebKit, 4 cores):** snapshot **0.62–1.34s** (register 0.28–0.9s, detect 0.29–0.35s, decode 30–116ms), live tracking **70–96ms/frame**, lock-on 0.18–0.46s. Both targets met. Startup 15.7s on the dev server: reference decode 2.1s + model 2.2s + features 0.3s; the rest is loading the unbundled OpenCV.js over Wi-Fi. For the app: cache OpenCV (service worker) and store the built reference model with the scan (D34). Register is ~0.85s when the first tilt doesn't give a good coarse match, ~0.28s otherwise. Phone detections on the fixtures match the photos (truth lists only the named cars; the other cars are in the photos too); misses: black in `blue`, silver in `yellow-green-blue`; false: `yellow@0` in `red-silver-black` and `black-red-silver`.
- **Multi-view** (eval `MULTIVIEW=25 MULTIVIEW_WIN=2`: keep a detection if one of the 2 neighbouring photos sees the same colour within 25px): **false detections 0 in 98 empty photos**, with no recall loss. Close-ups: coloured 47/49, silver 11/13, black 1/5 (green 8/10, was 9/10 before the 1/8 offset field).
- **D27 status:** registration ✓, coloured ✓ (96%), silver ✓ (85%, just), false positives ✓ (multi-view only), black best effort (1/5). The multi-view result assumes the app looks at several frames: see the open question in "Open items".

**Earlier idea, now partly done:** stop tuning pixels and use the track.** A car can only stand on a space. Once M3 annotates the spaces, a blob counts only when it sits on a space, and only one car fits per spot. Most black/silver false blobs (verges, markings, glare streaks) are not on a space centre. Measure this on the fixtures as soon as `tracks/france.json` exists.

### Next actions (in order)
1. **Light changes (user: important).** Proposed to the user 2026-11-03: (a) automatic light compensation per sweep (robust per-channel colour fit of the scan to the current frame on track pixels), measured on the lamp-on/lamp-off videos; (b) a "the light has changed" check (track pixels still unlike the scan after compensation, or the Legend not found twice while the board is aligned) that offers a rescan or By hand. Open question for the user: how a mid-race rescan works with cars on the board. Gallery feedback round 1 is applied.
2. Things known to be missing (pick by what the play-test shows): D20 [Wrong car] cycling; D19 quality-gate hints during the sweep ("hold steadier"); M6 polish (smoothed H, holding the last H through dropouts, an off-screen target arrow, D16); D34 "suggest a rescan" on unusual noise (now confirmed needed: a lighting change broke detection until a rescan); caching the built detection model so startup skips ~2 s; black detection (best effort, 1/5); the roles screen's drag (D31, optional).
3. Tuning knobs once there is real phone data: `SWEEP_BASELINE` 100 ref px and `MIN_VIEWS` 4 (`MoveCamera.tsx`), `MIN_FRACTION` 0.6 / `MIN_BASELINE` 40 (`sweep.ts`), `SCAN_INTAKE_MS` 1000 (`vision.worker.ts`).
4. Check the "Update available → Reload" prompt across two deploys (only testable on the deployed PWA).

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
- [x] PWA setup (`vite-plugin-pwa`, prompt-to-update, D22), done in M4. Update prompt not yet seen across two deploys.

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
- [x] Meet D27 on the close-ups (multi-view for false positives; black best effort)
- [x] Registration speed-up (4s → 0.6s/photo in Node); detection 2.6s → 0.4s; live `track()` ~107ms/frame

### M1b — Phone benchmark
- [x] `/bench.html` + Worker running the pipeline, with timings per stage (incl. live lock-on + tracking)
- [x] Run on the user's phone (2026-11-03): snapshot 0.62–1.34s, tracking 70–96ms. Both targets met.
- [x] Older phone: none available

### M2 — Rules engine ✅ (2026-11-01)
- [x] `src/engine/`: types, `deriveTrack` (annotation → spaces/corners, validates D28), loop arithmetic, `syntheticAnnotation` for tests
- [x] `resolveLegendMove` (rules A/B, 2-corner cap, D13 full spaces, D28 defence) with human-readable `reason`
- [x] Deck state machine (`newDeck` / `nextRound` / `revealCard`, one card per round, reshuffle)
- [x] `raceOrder()` (lap-unaware, D17)
- [x] 52 tests; test #1 = the rulebook example with real card 4
- Rule readings are documented in the header of `src/engine/move.ts` (e.g. ending on diamond 0 is not crossing; the 2-corner cap = aim at the second corner's diamond 0, then D13). Known nit: `spaceLabel` calls any space 0–3 before the *next* corner "diamond N", even when the explanation is about another corner.

### M3 — Annotator + France track data
- [x] Automatic draft: `tools/find-boundaries.ts` finds all 60 France boundaries, the finish (checker band), 4/5 corners (thick lines), all 5 Legends Lines (tan), and the race order (cut the road into spaces, walk from the finish away from the grid). The raceline side can't be read from the print (both edges carry white bands): the annotator sets it.
- [x] Annotator page `npm run annotate` (tags, speed, raceline flip, drag/add/delete lines, distance-to-corner overlay for D28, save validated by `deriveTrack`)
- [x] User confirmed the France annotation (`tracks/france.json`, 2026-11-02; corner #47 = speed 4; raceline right 0–26, left 27–38, right 39–59)
- [ ] `tracks/france.json`
- [ ] Convert `truth.json` pixel positions → spaces

### M4 — App shell + tap mode ✅ (2026-11-03)
- [x] Setup: track → board step (stored scan / scan / skip) → roles (D31, tap to cycle; no drag) → race
- [x] Round flow (D6): Next round, Legend buttons, card on first tap, undo; move log
- [x] Tap mode (D9): zoomable board, place cars, arrow + reason, full spaces
- [x] Persistence + "Resume race?" (D23); PWA with update prompt + version/build date (D22)
- [x] Game-state logic in `src/app/game.ts` (tested); camera screens behind `src/app/camera/index.tsx`

### M5 — Sweep + live AR (D35) ✅ first version (2026-11-03)
- [x] Vision worker `src/app/camera/vision.worker.ts` (modes scan / sweep / live; H always video px → reference)
- [x] Board scan screen with coverage map, stored in IndexedDB (`scanStore.ts`), used for detection from then on
- [x] Move screen: sweep with progress bar → consensus → engine → live arrow along the track, target outline, "couldn't see the target space" hint (D16), Sweep again / By hand / Done
- [ ] Play-tested on the phone
- [ ] D20 Wrong car · D19 hints during the sweep

### M6 — Live polish
- [ ] Smoothed H, hold through dropouts, off-screen target arrow

### Open items needing the user
- [x] Decided D35 (2026-11-03): a short sideways sweep, then a live AR arrow.
- [ ] Play-test the app on the phone (Next actions 1).
- [x] New fixtures delivered 2026-11-02: `closeup-light-c/d` (c = lamp off, d = lamp on), `scan-light-c/d` (video frames). See 05-development-and-testing.md.
- [x] User reviewed the close-ups (2026-11-02). The review page now saves left-in-place guesses as confirmed (earlier saves were backfilled from the guesses shown).
- [x] Decided D32: board scan = film, auto-pick sharp frames, coverage map.
- [x] Decided D33: scan the empty board right after choosing the track.
- [x] Decided D34: store scans, suggest a rescan on unusual noise.

## Findings & gotchas (read before touching vision code)
- **The stored scan is tied to the lighting it was made in.** In the user's play-test (2026-11-03) detection nearly stopped working after the lighting changed, and a rescan fixed it at once. Expected: detection compares against the scanned board's colours. Rescan when the light changes; D34's rescan suggestion should catch this.
- **Testing camera screens on the laptop:** Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>.y4m` (playwright-cli `--config` with `browser.launchOptions.args`). Make the y4m with ffmpeg (e.g. a `crop` that pans over a fixture photo); playwright-cli screenshots must be saved under the repo (`.playwright-cli/`, git-ignored). The first worker load in dev can trigger a Vite dependency re-optimisation and a page reload: just retry.
- **Fast registration (`register`) is up to ~25px off on some frames.** Fine for detection; not for the board scan's median, which is why scan frames get a `track(…, 12000, 24)` polish pass.
- **OpenCV.js (`@techstark/opencv-js`)** only has **ORB** for features: no AKAZE/SIFT/ArUco. Load it via `loadCv()` in `src/vision/cv.ts`.
- `new cv.Mat(h, w, type)` is **not zero-initialized**. Use `cv.Mat.zeros(...)` for masks. (This caused a "0 blobs" bug.)
- Every `cv.Mat` / vector must be `.delete()`d. WASM memory isn't garbage collected.
- **sharp** applies `resize` *before* `composite` in one pipeline. Composite to a buffer first, then resize in a second `sharp()` call.
- All vision work happens in **reference space**: `circuits/<track>.png` downscaled to 2000px wide. H maps photo px → reference px. Ground truth will be stored in the same space.
- Use **chroma** (max−min), not HSV saturation, for "is this colourful" on dark pixels: saturation explodes near black.
- Silver and black cars are two-tone in the data (body + wheels/shadow/highlights). Single-class rules miss them.
- Fixture photos are shallow-angle and handheld, by design (D25). Cars are ~30–50px long in a 2048px photo.
- OpenCV.js `mat.data` / `data32F` are **getters that create a new typed-array view on every access**. Never index them inside a per-pixel loop: hoist `const d = mat.data` first (this was 2s of a 2.6s detection).
- **Names-only scores lie** for black/silver: a detection of the right colour somewhere isn't a hit. Use confirmed truth.
- Registration takes ~4s/photo in Node. The detection report re-registers every photo, so a full run takes several minutes. Pass a set filter (`-- france pos-a`) while iterating.
- `fixtures-raw/` holds the original photos **with GPS EXIF**. It's git-ignored; never commit it. `reports/` is git-ignored too: regenerate it.

## Session log
- **2026-11-03 (d)**: User feedback on the gallery: scan-complete dialog (#11); race screen: Legend buttons first, filled colour = not moved this round, dark = moved (#17); card and move history folded by default; no boxed placeholder at round 0 (#15).
- **2026-11-03 (c)**: User's play-test: works and fast; a lighting change needed a rescan. Built the UI gallery (`?gallery`, 34 states) for the user's annotated feedback.
- **2026-11-03 (b)**: D35 agreed. M4 app shell (subagent) + M5 sweep/scan/live arrow; sweep consensus with majority vote; on-phone scan needs polish + 1 frame/s; fake-camera browser tests pass in dev and production builds.
- **2026-11-03**: Phone bench on the user's iPhone: snapshot ≤1.34s, tracking ≤96ms (targets met). Bench page now confirms each queued run.
- **2026-11-02 (g)**: Multi-view check (0 false positives); registration 6.6× faster, detection 6× faster; live `track()`; bench page. Waiting for the phone bench run.
- **2026-11-02 (f)**: User confirmed tracks/france.json; on-space filter (black FPs −70%); silver edge cue (silver 10/13, FPs roughly halved).
- **2026-11-02 (e)**: M3 started: automatic boundary draft for France (60 spaces, matches the printed distances) + annotator page.
- **2026-11-02 (d)**: Quality gate metric (relative sharpness); blur is not the cause of black/silver false positives.
- **2026-11-02 (c)**: User agreed D32–D34 (scan by filming, empty board after track choice, store + suggest rescan).
- **2026-11-02 (b)**: User confirmed close-up positions; review save bug fixed + backfilled; real-position scoring exposed black/silver; paint-centred blobs (yellow 10/10); all-bright silver rule (5/13, more FPs). Next: blur gate, on-space prior.
- **2026-11-02**: Close-up + video fixtures; prep keeps names and extracts video frames; per-photo review mode; close-up scoring; references built from video; blob hue-splitting (full spaces); black/silver size penalty. Coloured cars 45/45 on close-ups (names-only).
- **2026-11-01**: M2 rules engine (subagent, 52 tests); review page; `test:vision`; blob grouping; own-board reference experiments (plain median, then sharpness-gated); adaptive thresholds and the edge cue tried and reverted. Awaiting close-up fixtures + a video sweep from the user.
- **2026-10-29**: Design Q&A with the user → docs 01–07, decisions D1–D28, card data.
- **2026-10-30**: M0 scaffold; repo created and pushed; Pages deploy working; fixtures prepared; registration 127/128; detection pipeline first version (clusters visible on `pos-a`, too noisy).
- **2026-10-31**: Added CLAUDE.md + this file for handoff. Detection: candidate classes, chroma-based track mask, two-tone silver / large-dark black → coloured cars ~90–100%, black/silver ~70–90% (consensus proxy). Started the own-board reference experiment.
