// Experiment: build a reference image of the user's own board by warping a
// set of fixture photos into reference space and taking the per-pixel median.
// Pixels covered by fewer than MIN_COVER photos fall back to the BGG scan.
//
//   npx tsx tools/build-own-reference.ts <track> <set> → reports/ref/<track>-<set>.png
//
// Uses the registration cache written by vision:detect.
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { loadRgb } from "./lib/images";

const [track = "france", set = "empty-light-a"] = process.argv.slice(2);
const REF_WIDTH = 2000;
const MIN_COVER = 3;

const cv = await loadCv();
const ref = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const { width, height } = ref;
const n = width * height;

const warped: Uint8Array[] = [];
const covers: Uint8Array[] = [];
const dir = join("fixtures", track, set);
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
  const reg = JSON.parse(await readFile(join("reports", "cache", track, `${set}-${file}.json`), "utf8"));
  if (!reg.ok) continue;
  const photo = await loadRgb(join(dir, file));
  const src = new cv.Mat(photo.height, photo.width, cv.CV_8UC3);
  src.data.set(photo.data);
  const one = new cv.Mat(photo.height, photo.width, cv.CV_8UC1, new cv.Scalar(255));
  const H = cv.matFromArray(3, 3, cv.CV_64F, reg.H);
  const dst = new cv.Mat(), cov = new cv.Mat();
  cv.warpPerspective(src, dst, H, new cv.Size(width, height));
  cv.warpPerspective(one, cov, H, new cv.Size(width, height), cv.INTER_NEAREST);
  warped.push(new Uint8Array(dst.data));
  covers.push(new Uint8Array(cov.data));
  [src, one, H, dst, cov].forEach((m) => m.delete());
}

const out = new Uint8Array(ref.data);
const vals = new Uint8Array(warped.length);
for (let i = 0; i < n; i++) {
  for (let c = 0; c < 3; c++) {
    let k = 0;
    for (let p = 0; p < warped.length; p++) if (covers[p][i]) vals[k++] = warped[p][i * 3 + c];
    if (k < MIN_COVER) continue;
    const sorted = vals.subarray(0, k).sort();
    out[i * 3 + c] = sorted[k >> 1];
  }
}

await mkdir(join("reports", "ref"), { recursive: true });
const path = join("reports", "ref", `${track}-${set}.png`);
await sharp(Buffer.from(out), { raw: { width, height, channels: 3 } }).png().toFile(path);
console.log(`wrote ${path} from ${warped.length} photos`);
