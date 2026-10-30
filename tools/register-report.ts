// M1 step 1: register every fixture photo against the reference circuit and
// write an HTML contact sheet to reports/registration/.
//
//   npm run vision:register [-- <track>]
//
// Per photo: the reference outline projected onto the photo (left) and a
// checkerboard of reference / warped photo (right). If registration is good,
// the track lines continue cleanly across the checker squares.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import { apply, invert } from "../src/vision/homography";
import { prepareReference, register, type Registration } from "../src/vision/registration";
import { loadRgb, saveRgb, toGray, type Rgb } from "./lib/images";

const track = process.argv[2] ?? "france";
const REF_WIDTH = 2000;
const OUT = join("reports", "registration", track);
const TILE = 80;

const cv = await loadCv();
const refRgb = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const ref = prepareReference(cv, toGray(refRgb));
console.log(`reference ${ref.width}×${ref.height}, ${ref.keypoints.size()} keypoints`);

await mkdir(OUT, { recursive: true });
const rows: string[] = [];
const summary: Record<string, { ok: number; total: number }> = {};

for (const set of (await readdir(join("fixtures", track))).sort()) {
  const dir = join("fixtures", track, set);
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const photo = await loadRgb(join(dir, file));
    const t0 = performance.now();
    const reg = register(cv, ref, toGray(photo));
    const ms = Math.round(performance.now() - t0);
    const name = `${set}-${file.replace(".jpg", "")}`;
    summary[set] ??= { ok: 0, total: 0 };
    summary[set].total++;
    if (reg.ok) summary[set].ok++;

    await outlineImage(photo, reg, join(OUT, `${name}-outline.jpg`));
    if (reg.ok) await checkerImage(photo, reg, join(OUT, `${name}-checker.jpg`));
    rows.push(row(set, file, name, reg, ms));
    console.log(`${set}/${file}: ${reg.ok ? "ok" : "FAIL"} coarse ${fmt(reg.coarse)} refine ${reg.refine ? fmt(reg.refine) : "-"} ${ms}ms`);
  }
}

const summaryHtml = Object.entries(summary)
  .map(([s, v]) => `<li>${s}: ${v.ok}/${v.total}</li>`)
  .join("");
await writeFile(join(OUT, "index.html"), page(track, summaryHtml, rows.join("\n")));
console.log(`\nwrote ${join(OUT, "index.html")}`);
for (const [s, v] of Object.entries(summary)) console.log(`${s}: ${v.ok}/${v.total}`);

function fmt(p: Registration["coarse"]) {
  return `${p.inliers}/${p.matches} (${p.reprojError.toFixed(1)}px)`;
}

async function outlineImage(photo: Rgb, reg: Registration, path: string) {
  let svg = "";
  if (reg.H) {
    const inv = invert(reg.H);
    const corners = [
      { x: 0, y: 0 }, { x: ref.width, y: 0 }, { x: ref.width, y: ref.height }, { x: 0, y: ref.height },
    ].map((p) => apply(inv, p));
    const grid: string[] = [];
    for (let gx = 0; gx <= ref.width; gx += ref.width / 8) {
      const a = apply(inv, { x: gx, y: 0 }), b = apply(inv, { x: gx, y: ref.height });
      grid.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
    for (let gy = 0; gy <= ref.height; gy += ref.height / 6) {
      const a = apply(inv, { x: 0, y: gy }), b = apply(inv, { x: ref.width, y: gy });
      grid.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
    svg = `<polygon points="${corners.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#0f0" stroke-width="6"/>
      <g stroke="#0f0" stroke-width="2" opacity="0.7">${grid.join("")}</g>`;
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${svg}</svg>`,
  );
  // sharp resizes before compositing, so composite in a separate pass.
  const composed = await sharp(Buffer.from(photo.data), { raw: { width: photo.width, height: photo.height, channels: 3 } })
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
  await sharp(composed)
    .resize(900)
    .jpeg({ quality: 75 })
    .toFile(path);
}

async function checkerImage(photo: Rgb, reg: Registration, path: string) {
  const src = new cv.Mat(photo.height, photo.width, cv.CV_8UC3);
  src.data.set(photo.data);
  const H = cv.matFromArray(3, 3, cv.CV_64F, reg.H!);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, H, new cv.Size(ref.width, ref.height));
  const w = warped.data as Uint8Array;
  const out = new Uint8Array(refRgb.data);
  for (let y = 0; y < ref.height; y++) {
    for (let x = 0; x < ref.width; x++) {
      if (((x / TILE) | 0) % 2 === ((y / TILE) | 0) % 2) {
        const i = (y * ref.width + x) * 3;
        if (w[i] || w[i + 1] || w[i + 2]) out.set(w.subarray(i, i + 3), i);
      }
    }
  }
  src.delete(); H.delete(); warped.delete();
  await saveRgb({ width: ref.width, height: ref.height, data: out }, path, 1000);
}

function row(set: string, file: string, name: string, reg: Registration, ms: number) {
  const cls = reg.ok ? "ok" : "fail";
  return `<tr class="${cls}"><td>${set}<br>${file}<br><b>${reg.ok ? "OK" : "FAIL"}</b><br>
    coarse ${fmt(reg.coarse)}<br>refine ${reg.refine ? fmt(reg.refine) : "-"}<br>${ms} ms</td>
    <td><img src="${name}-outline.jpg" loading="lazy"></td>
    <td>${reg.ok ? `<img src="${name}-checker.jpg" loading="lazy">` : ""}</td></tr>`;
}

function page(track: string, summary: string, rows: string) {
  return `<!doctype html><meta charset="utf-8"><title>Registration ${track}</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#ddd}td{vertical-align:top;padding:4px}
img{width:100%;max-width:700px}tr.fail td:first-child{color:#f66}tr.ok td:first-child{color:#6f6}</style>
<h1>Registration — ${track}</h1><ul>${summary}</ul>
<p>Left: reference outline + grid projected onto the photo. Right: checkerboard of reference and warped photo —
track lines should continue across squares.</p><table>${rows}</table>`;
}
