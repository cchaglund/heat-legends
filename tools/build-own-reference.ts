// Experiment: build a reference image of the user's own board by warping a
// set of fixture photos into reference space and taking the per-pixel median.
// Only *sharp* views count: a shallow photo stretches its far side, so for
// each reference pixel a photo contributes only if it samples that spot at
// ≥ MIN_DENSITY photo px per reference px (from the homography's Jacobian).
// Pixels with fewer than MIN_COVER sharp views fall back to the sharpest
// available views, then to the BGG scan.
//
//   npx tsx tools/build-own-reference.ts <track> <set> → reports/ref/<track>-<set>.png
//
// Uses the registration cache written by vision:detect.
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { invert, type H3 } from "../src/vision/homography";
import { loadRgb } from "./lib/images";

const [track = "france", set = "empty-light-a"] = process.argv.slice(2);
const REF_WIDTH = 2000;
const MIN_COVER = 3;
const MIN_DENSITY = 0.8;

const cv = await loadCv();
const ref = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const { width, height } = ref;
const n = width * height;

const warped: Uint8Array[] = [];
const covers: Uint8Array[] = [];
// Per photo and reference pixel: photo-pixel area per reference-pixel area.
const densities: Float32Array[] = [];
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
  densities.push(density(invert(reg.H)));
  covers.push(new Uint8Array(cov.data));
  [src, one, H, dst, cov].forEach((m) => m.delete());
}

const out = new Uint8Array(ref.data);
const vals = new Uint8Array(warped.length);
const order = warped.map((_, p) => p);
let sharpPx = 0;
for (let i = 0; i < n; i++) {
  // Sharpest views first; take the sharp ones, or at least MIN_COVER.
  const cands = order.filter((p) => covers[p][i]).sort((p, q) => densities[q][i] - densities[p][i]);
  let k = cands.filter((p) => densities[p][i] >= MIN_DENSITY).length;
  if (k >= MIN_COVER) sharpPx++;
  k = Math.max(k, Math.min(MIN_COVER, cands.length));
  if (k < MIN_COVER) continue;
  for (let c = 0; c < 3; c++) {
    for (let m = 0; m < k; m++) vals[m] = warped[cands[m]][i * 3 + c];
    out[i * 3 + c] = vals.subarray(0, k).sort()[k >> 1];
  }
}
console.log(`${((100 * sharpPx) / n).toFixed(0)}% of reference pixels have ≥${MIN_COVER} sharp views`);

/** |det J| of reference → photo for every reference pixel: det(Hinv) / w³. */
function density(hinv: H3): Float32Array {
  const [a, b, c, d, e, f, g, h, k] = hinv;
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const outD = new Float32Array(n);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const w = g * x + h * y + k;
      outD[i] = Math.abs(det / (w * w * w));
    }
  }
  return outD;
}

await mkdir(join("reports", "ref"), { recursive: true });
const path = join("reports", "ref", `${track}-${set}.png`);
await sharp(Buffer.from(out), { raw: { width, height, channels: 3 } }).png().toFile(path);
console.log(`wrote ${path} from ${warped.length} photos`);
