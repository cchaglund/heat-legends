// M1 steps 2–4: register + detect cars on every fixture photo, write an HTML
// report to reports/detection/<track>/.
//
//   npm run vision:detect [-- <track> [<set-filter>]]
//
// Per set, a summary image plots every photo's detections on the reference.
// Since all photos in a set share car positions, good detection shows as
// tight single-colour clusters.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type CarColor, type DetectResult } from "../src/vision/detect";
import { prepareReference, register } from "../src/vision/registration";
import { loadRgb, toGray, type Rgb } from "./lib/images";

const track = process.argv[2] ?? "france";
const setFilter = process.argv[3];
const REF_WIDTH = 2000;
const OUT = join("reports", "detection", track);

export const SWATCH: Record<CarColor, string> = {
  red: "#ff2a2a", blue: "#2a7bff", green: "#22cc44", yellow: "#ffd400", black: "#000000", silver: "#c8c8c8",
};

const cv = await loadCv();
const refRgb = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const ref = prepareReference(cv, toGray(refRgb));
const model = buildReferenceModel(cv, refRgb);
await mkdir(OUT, { recursive: true });
await saveMask(model.track, refRgb, join(OUT, "_track-mask.jpg"));

const sections: string[] = [];
for (const set of (await readdir(join("fixtures", track))).sort()) {
  if (setFilter && !set.includes(setFilter)) continue;
  const colors: CarColor[] = set.startsWith("empty") ? [] : CAR_COLORS;
  const dir = join("fixtures", track, set);
  const all: { photo: string; result: DetectResult | null }[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const photo = await loadRgb(join(dir, file));
    const reg = register(cv, ref, toGray(photo));
    const name = `${set}-${file.replace(".jpg", "")}`;
    if (!reg.ok) {
      all.push({ photo: name, result: null });
      console.log(`${set}/${file}: registration failed`);
      continue;
    }
    // Empty sets still run detection against all colours so false positives show up.
    const result = detectCars(cv, model, photo, reg.H!, colors.length ? colors : CAR_COLORS);
    all.push({ photo: name, result });
    await photoImage(result, join(OUT, `${name}.jpg`));
    await diffImage(result, join(OUT, `${name}-diff.jpg`));
    console.log(`${set}/${file}: ${result.blobs.length} blobs → ${result.detections.map((d) => d.color).join(", ") || "none"}`);
  }
  await summaryImage(all, join(OUT, `_${set}-summary.jpg`));
  sections.push(section(set, all));
}

await writeFile(join(OUT, "index.html"), page(sections.join("\n")));
console.log(`\nwrote ${join(OUT, "index.html")}`);

async function photoImage(r: DetectResult, path: string) {
  const svg = r.blobs
    .map((b) => {
      const d = r.detections.find((d) => d.blob === b);
      const stroke = d ? SWATCH[d.color] : "#ff00ff";
      const label = d ? `${d.color} ${d.cost.toFixed(1)}` : `? h${b.hsv[0].toFixed(0)} s${b.hsv[1].toFixed(2)} v${b.hsv[2].toFixed(2)}`;
      return `<rect x="${b.box[0] - 4}" y="${b.box[1] - 4}" width="${b.box[2] + 8}" height="${b.box[3] + 8}" fill="none" stroke="${stroke}" stroke-width="4"/>
        <text x="${b.box[0]}" y="${b.box[1] - 10}" font-size="26" font-family="sans-serif" fill="${stroke}" stroke="#fff" stroke-width="0.8">${label}</text>`;
    })
    .join("");
  await overlay(r.normalized, svg, path, 1400);
}

async function diffImage(r: DetectResult, path: string) {
  const { width, height } = r.normalized;
  const g = new Uint8Array(width * height);
  for (let i = 0; i < g.length; i++) g[i] = Math.min(255, r.diff[i] * 2);
  await sharp(Buffer.from(g), { raw: { width, height, channels: 1 } }).resize(1400).jpeg({ quality: 70 }).toFile(path);
}

async function summaryImage(all: { result: DetectResult | null }[], path: string) {
  const dots = all
    .flatMap((a) => a.result?.detections ?? [])
    .map((d) => `<circle cx="${d.blob.x}" cy="${d.blob.y}" r="9" fill="${SWATCH[d.color]}" stroke="#fff" stroke-width="2.5"/>`)
    .join("");
  await overlay(refRgb, dots, path, 1400);
}

async function overlay(img: Rgb, svg: string, path: string, width: number) {
  const composed = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}">${svg}</svg>`) }])
    .png()
    .toBuffer();
  await sharp(composed).resize(width).jpeg({ quality: 78 }).toFile(path);
}

async function saveMask(mask: Uint8Array, img: Rgb, path: string) {
  const data = new Uint8Array(img.data);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) for (let c = 0; c < 3; c++) data[i * 3 + c] >>= 2;
  await sharp(Buffer.from(data), { raw: { width: img.width, height: img.height, channels: 3 } }).resize(1400).jpeg().toFile(path);
}

function section(set: string, all: { photo: string; result: DetectResult | null }[]) {
  const imgs = all
    .map((a) => (a.result ? `<figure><img src="${a.photo}.jpg" loading="lazy"><figcaption>${a.photo}: ${a.result.detections.map((d) => d.color).join(", ") || "none"}</figcaption></figure>` : `<p>${a.photo}: registration failed</p>`))
    .join("");
  return `<h2>${set}</h2><img class="summary" src="_${set}-summary.jpg"><details><summary>${all.length} photos</summary>${imgs}</details>`;
}

function page(body: string) {
  return `<!doctype html><meta charset="utf-8"><title>Detection ${track}</title>
<style>body{font:14px system-ui;margin:16px;background:#222;color:#ddd}img{max-width:100%}img.summary{max-width:1400px}
figure{margin:8px 0}</style><h1>Detection — ${track}</h1>
<p>Summary per set: every photo's detections plotted on the reference. Magenta boxes in photos = blobs not assigned to a car.</p>
<p><a href="_track-mask.jpg">track mask</a></p>${body}`;
}
