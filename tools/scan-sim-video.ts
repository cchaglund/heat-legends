// The app's scan loop (vision.worker.ts "scan" mode) in Node, over the 10 fps
// frames that tools/sweep-eval.ts extracted: track from the previous frame,
// register when lost, blur gate, polish, accumulate.
//
//   npx tsx tools/scan-sim-video.ts <set> → reports/ref/france-<set>-video-scan.png
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { sharpness } from "../src/vision/quality";
import { prepareReference, register, track, type Registration } from "../src/vision/registration";
import { ScanAccumulator } from "../src/vision/scan";
import { loadRgb, toGray } from "./lib/images";

const [set = "closeup-light-d"] = process.argv.slice(2);
const cv = await loadCv();
const base = await loadRgb("public/tracks/france.jpg");
const ref = prepareReference(cv, toGray(base));
const acc = new ScanAccumulator(base);
const dir = join("reports", "sweep", set);
let H: number[] | null = null;
let recent: number[] = [];
let used = 0, lost = 0, i = 0;
// EVERY=<n>: add at most every n-th frame (the app: one per INTAKE_MS).
const every = Number(process.env.EVERY) || 1;
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
  const rgb = await loadRgb(join(dir, file));
  const gray = toGray(rgb);
  let reg: Registration | null = H ? track(cv, ref, gray, H) : null;
  if (!reg?.ok) reg = register(cv, ref, gray);
  if (!reg.ok) { H = null; lost++; continue; }
  H = reg.H!;
  const s = sharpness(gray);
  const typical = recent.length ? [...recent].sort((a, b) => a - b)[recent.length >> 1] : 0;
  recent = [...recent.slice(-14), s];
  if (s < 0.5 * typical) continue;
  if (i++ % every) continue;
  const p = track(cv, ref, gray, H, 12000, 24);
  acc.add(cv, rgb, p.ok ? p.H! : H);
  used++;
}
const out = acc.build();
const path = join("reports", "ref", `france-${set}-video-scan.png`);
await sharp(Buffer.from(out.data), { raw: { width: out.width, height: out.height, channels: 3 } }).png().toFile(path);
console.log(`${used} frames used, ${lost} lost → ${path}`);
