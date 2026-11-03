// Sweep experiment (D35): how far must the camera move between two views for
// the multi-view check to reject glare? Runs the per-frame pipeline the app
// uses (register once, then track from the previous frame; detect on each
// frame) over the empty-board videos at 10 fps, caches the per-frame results,
// then simulates sweeps: any confirmed car on an empty board is false.
//
//   npx tsx tools/sweep-eval.ts            (frames → reports/sweep/<set>/)
//
// The detection reference is the *other* video's scan, so a video is never
// judged against a reference built from itself.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveTrack, spaceAtPoint } from "../src/engine/track";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars } from "../src/vision/detect";
import { apply } from "../src/vision/homography";
import { prepareReference, register, track, type Registration } from "../src/vision/registration";
import { confirmCars, type View } from "../src/vision/sweep";
import { loadRgb, toGray } from "./lib/images";

const VIDEOS = [
  { set: "closeup-light-c", video: "fixtures-raw/france/closeup-light-c/IMG_2041.mov", ref: "reports/ref/france-scan-light-d.png" },
  { set: "closeup-light-d", video: "fixtures-raw/france/closeup-light-d/IMG_2040.mov", ref: "reports/ref/france-scan-light-c.png" },
];
const FPS = 10;

const cv = await loadCv();
const refRgb = await loadRgb("public/tracks/france.jpg");
const ref = prepareReference(cv, toGray(refRgb));
const board = deriveTrack(JSON.parse(await readFile("tracks/france.json", "utf8")));
const accept = (b: { x: number; y: number }) => spaceAtPoint(board, b.x, b.y) >= 0;

const all: Record<string, View[]> = {};
for (const { set, video, ref: detRef } of VIDEOS) {
  const dir = join("reports", "sweep", set);
  const cache = join(dir, "views.json");
  if (existsSync(cache)) { all[set] = JSON.parse(await readFile(cache, "utf8")); continue; }
  await mkdir(dir, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=${FPS}`, "-q:v", "3", join(dir, "%04d.jpg")]);
  const model = buildReferenceModel(cv, await loadRgb(detRef));
  const views: View[] = [];
  let H: number[] | null = null;
  let tReg = 0, tDet = 0;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const rgb = await loadRgb(join(dir, file));
    const gray = toGray(rgb);
    let t0 = performance.now();
    let reg: Registration = H ? track(cv, ref, gray, H) : { ok: false, H: null } as any;
    if (!reg.ok) reg = register(cv, ref, gray);
    tReg += performance.now() - t0;
    H = reg.ok ? reg.H : null;
    if (!H) { views.push({ H: null, width: rgb.width, height: rgb.height, detections: [] }); continue; }
    t0 = performance.now();
    const res = detectCars(cv, model, rgb, H, CAR_COLORS, accept);
    tDet += performance.now() - t0;
    views.push({ H, width: rgb.width, height: rgb.height, detections: res.detections.map((d) => ({ color: d.color, x: d.blob.x, y: d.blob.y })) });
  }
  console.log(`${set}: ${views.length} frames, ${views.filter((v) => !v.H).length} unregistered, register/track ${(tReg / views.length).toFixed(0)} ms, detect ${(tDet / views.length).toFixed(0)} ms per frame`);
  await writeFile(cache, JSON.stringify(views));
  all[set] = views;
}

// Single-frame false cars, then sweeps: every window of WINDOW frames, taking
// every STRIDE-th frame (≈ what the phone manages), confirmed by confirmCars.
const center = (v: View) => apply(v.H!, { x: v.width / 2, y: v.height / 2 });
for (const [set, views] of Object.entries(all)) {
  const ok = views.filter((v) => v.H);
  const single = ok.reduce((s, v) => s + v.detections.length, 0);
  console.log(`\n${set}: single frame ${single} false cars in ${ok.length} frames (${(single / ok.length).toFixed(2)}/frame)`);
  const steps = ok.slice(1).map((v, i) => Math.hypot(center(v).x - center(ok[i]).x, center(v).y - center(ok[i]).y));
  console.log(`  camera motion: median ${median(steps).toFixed(0)} ref px per 0.1 s`);
  for (const stride of [1, 3]) for (const window of [10, 15, 20]) for (const minBaseline of [0, 20, 40, 80]) {
    let sweeps = 0, falseCars = 0;
    for (let s = 0; s + window <= views.length; s += 5) {
      const picked = views.slice(s, s + window).filter((_, i) => i % stride === 0);
      sweeps++;
      falseCars += confirmCars(picked, { minBaseline }).length;
    }
    console.log(`  window ${window / FPS}s, every ${stride}: baseline ≥${minBaseline}px → ${falseCars} false cars in ${sweeps} sweeps`);
  }
}

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; }
