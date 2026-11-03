// Runs the on-phone board scan (src/vision/scan.ts) over a fixture set, so its
// reference can be compared with tools/build-own-reference.ts.
//
//   npx tsx tools/scan-sim.ts <track> <set> → reports/ref/<track>-<set>-scan.png
// Uses the registration cache written by vision:detect.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { ScanAccumulator } from "../src/vision/scan";
import { prepareReference, track as trackFrame } from "../src/vision/registration";
import { loadRgb, toGray } from "./lib/images";

const [track = "france", set = "scan-light-d"] = process.argv.slice(2);
const cv = await loadCv();
const base = await loadRgb(join("circuits", `${track}.png`), 2000);
const acc = new ScanAccumulator(base);
// POLISH=<px>: one more local match within <px> of the cached H before adding the frame.
const polish = Number(process.env.POLISH) || 0;
const ref = polish ? prepareReference(cv, toGray(base)) : null;
const dir = join("fixtures", track, set);
const t0 = performance.now();
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
  const reg = JSON.parse(await readFile(join("reports", process.env.CACHE ?? "cache", track, `${set}-${file}.json`), "utf8"));
  if (!reg.ok) continue;
  const rgb = await loadRgb(join(dir, file));
  let H = reg.H;
  if (ref) {
    const p = trackFrame(cv, ref, toGray(rgb), H, 12000, polish);
    if (p.ok) H = p.H!;
  }
  acc.add(cv, rgb, H);
}
const ms = (performance.now() - t0) / acc.frames;
const out = acc.build();
const path = join("reports", "ref", `${track}-${set}-scan.png`);
await sharp(Buffer.from(out.data), { raw: { width: out.width, height: out.height, channels: 3 } }).png().toFile(path);
console.log(`${acc.frames} frames, ${ms.toFixed(0)} ms/frame (incl. decode) → ${path}`);
