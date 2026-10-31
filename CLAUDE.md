# Heat Legends Helper

A phone web app (static PWA, no backend) that runs the **Legends**, the AI drivers in the board game *Heat: Pedal to the Metal*. You point the phone camera at the board; the app detects the cars, applies the Legend rules and draws where each Legend should move.

## Start here
1. **[docs/PROGRESS.md](docs/PROGRESS.md)**: current focus, next actions, task checklist, gotchas. Read it first, every time.
2. [docs/04-implementation-plan.md](docs/04-implementation-plan.md): milestones (M0–M6) and their scope.
3. [docs/06-open-questions.md](docs/06-open-questions.md): numbered decisions (D1…). Don't re-open a decision without asking the user.
4. Background, as needed: [01-idea](docs/01-idea.md), [02-how-it-works](docs/02-how-it-works.md) (rules, round flow), [03-architecture](docs/03-architecture.md), [05-development-and-testing](docs/05-development-and-testing.md), [07-future-enhancements](docs/07-future-enhancements.md).

Source material: `legends-module-rules.txt`, `legend-cards.txt` → `data/legend-cards.json`, `legends-example.png` (rulebook example = first engine test), `circuits/*.png` (reference images).

## Commands
```
npm run dev                          # Vite dev server, HTTPS, on LAN (phone testing)
npm test                             # Vitest
npm run typecheck                    # tsc --noEmit (CI runs this via build)
npm run build                        # static build → dist/
npm run fixtures:prep                # fixtures-raw/ → fixtures/ (strips GPS EXIF)
npm run vision:register [-- track]   # registration report → reports/registration/<track>/index.html
npm run vision:detect [-- track set] # detection report → reports/detection/<track>/index.html
```

## Layout
- `src/vision/`: OpenCV.js pipeline (registration, detection, homography helpers). Must run in both Node and a browser Worker: no DOM, no Node APIs.
- `src/`: app (Preact). Mostly empty so far.
- `tools/`: Node-only dev scripts (reports, fixture prep). They may use `sharp` and `fs`.
- `fixtures/<track>/<set>/`: committed test photos (EXIF-stripped). `fixtures-raw/` holds the originals with GPS: **git-ignored, never commit**.
- `reports/`: generated, git-ignored.

## Conventions
- TypeScript, strict. Match the existing style: short header comment per module explaining *why*, sparse inline comments.
- The vision code works in **reference space** (reference image at 2000px wide). Homographies map photo → reference.
- Commit as the repo-local identity (already configured; the no-reply email). End commit messages with the `Co-Authored-By` line given in the session. Pushing to `main` deploys to GitHub Pages, so run `npm run typecheck && npm test` first.
- The repo is public. Never commit photos with EXIF, secrets or personal data.

## Handoff routine (do this before ending a session)
1. Update **docs/PROGRESS.md**: tick the checklist, rewrite "Current focus" and "Next actions" so a context-free agent can continue, add any new gotcha, and add a one-line session log entry.
2. If a design decision was made with the user, add it to the decisions log in `docs/06-open-questions.md` (next D-number) and update the affected doc.
3. Make sure `npm run typecheck && npm test` pass, then commit (and push if the user has allowed pushing; they have, for this repo).
