// Detection metrics over the fixture sets (no report images, so it's quicker
// than vision:detect).
//
//   npm run test:vision [-- <track> [set-filter…]]
//   DETECT_REF=reports/ref/france-empty-light-a.png npm run test:vision
//
// Car sets are scored against fixtures/<track>/<set>/truth.json
// ({ status, positions: { colour: [x, y] } } in reference px). Without a
// truth file the per-colour consensus (median detection) is used and the
// row is marked "consensus". A detection counts as correct within
// MATCH_PX of the true position. Empty sets ("empty-*", and "scan-*" video
// frames of the empty board) count false detections.
// Close-up sets ("closeup-*") are scored per photo, only for the cars named
// in the file name (red-silver-2.jpg → red, silver): against truth.json
// "photos" when reviewed, else "names-only" = the colour was detected at all. Registration comes from the vision:detect cache when present.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveTrack } from "../src/engine/track";
import type { Point } from "../src/engine/types";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type Blob, type CarColor, type Detection } from "../src/vision/detect";
import { prepareReference, register, type Registration } from "../src/vision/registration";
import { loadRgb, toGray, type Rgb } from "./lib/images";

const [track = "france", ...filters] = process.argv.slice(2);
const REF_WIDTH = 2000;
const MATCH_PX = 40;

type Truth = { status: string; positions: Partial<Record<CarColor, [number, number]>> };
type PhotoTruth = { status: string; photos: Record<string, Partial<Record<CarColor, [number, number] | null>>> };

const cv = await loadCv();
const refRgb = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const ref = prepareReference(cv, toGray(refRgb));
const detectRef = process.env.DETECT_REF ? await loadRgb(process.env.DETECT_REF) : refRgb;
const model = buildReferenceModel(cv, detectRef);
console.log(`detection reference: ${process.env.DETECT_REF ?? "BGG scan"}\n`);

// SPACES=<margin px>: only blobs whose centre is on a space of tracks/<track>.json.
let accept: ((b: { x: number; y: number }) => boolean) | undefined;
if (process.env.SPACES !== undefined) {
  const t = deriveTrack(JSON.parse(await readFile(join("tracks", `${track}.json`), "utf8")));
  const margin = Number(process.env.SPACES) || 0;
  accept = (b) => t.spaces.some((s) => insideQuad(s.quad, b.x, b.y, margin));
  console.log(`on-space filter: ${t.spaces.length} spaces, margin ${margin}px`);
}

const rows: string[] = [];
const sharpLog: string[] = [];
const fpLog: string[] = [];
for (const set of (await readdir(join("fixtures", track))).sort()) {
  if (filters.length && !filters.some((f) => set.includes(f))) continue;
  const dir = join("fixtures", track, set);
  const perPhoto: Detection[][] = [];
  const perBlobs: Blob[][] = [];
  const names: string[] = [];
  let failed = 0;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const photo = await loadRgb(join(dir, file));
    const reg = await cachedRegister(set, file, photo);
    if (!reg.ok) failed++;
    const res = reg.ok ? detectCars(cv, model, photo, reg.H!, CAR_COLORS, accept) : null;
    perPhoto.push(res?.detections ?? []);
    perBlobs.push(res?.blobs ?? []);
    if (process.env.FP_LOG && /^(empty|scan)/.test(set)) for (const d of res?.detections ?? [])
      fpLog.push(`${set}/${file}\t${d.color}\t${Math.round(d.blob.x)}\t${Math.round(d.blob.y)}\t${d.blob.area}\t${d.blob.box[2]}x${d.blob.box[3]}\t${d.blob.brightFrac.toFixed(2)}\t${d.blob.darkFrac.toFixed(2)}\t${d.cost.toFixed(2)}\t${d.blob.edge.toFixed(2)}`);
    if (process.env.SHARPNESS_LOG) sharpLog.push(`${set}/${file}\t${res?.sharpness.toFixed(3) ?? "-"}\t${res?.detections.map((d) => d.color).join(",") ?? ""}`);
    names.push(file.replace(/\.jpg$/, ""));
  }
  const regNote = failed ? `   (${failed} registration failures)` : "";

  if (set.startsWith("closeup")) {
    const truth = (await loadTruth(dir)) as unknown as PhotoTruth | null;
    const hits: Record<string, [number, number]> = {};
    let reviewed = 0;
    names.forEach((name, k) => {
      const t = truth?.photos?.[name];
      if (t) reviewed++;
      for (const c of name.split("-").filter((x): x is CarColor => (CAR_COLORS as string[]).includes(x))) {
        if (t && t[c] === null) continue; // marked absent by the reviewer
        const ds = perPhoto[k].filter((d) => d.color === c);
        const p = t?.[c];
        if (process.env.FP_LOG && p) for (const b of perBlobs[k].filter((b) => Math.hypot(b.x - p[0], b.y - p[1]) < MATCH_PX))
          fpLog.push(`TRUE ${c}\t${set}/${name}\t${b.area}\t${b.box[2]}x${b.box[3]}\t${b.brightFrac.toFixed(2)}\t${b.darkFrac.toFixed(2)}\t${b.edge.toFixed(2)}\t${ds.some((d) => d.blob === b) ? "assigned" : "-"}`);
        const ok = p ? ds.some((d) => Math.hypot(d.blob.x - p[0], d.blob.y - p[1]) < MATCH_PX) : ds.length > 0;
        hits[c] ??= [0, 0];
        hits[c][0] += ok ? 1 : 0;
        hits[c][1]++;
      }
    });
    const mode = reviewed === names.length ? "confirmed" : reviewed ? `partial ${reviewed}/${names.length}` : "names-only";
    const cells = CAR_COLORS.filter((c) => hits[c]).map((c) => `${c} ${hits[c][0]}/${hits[c][1]}`);
    rows.push(`${set.padEnd(16)} ${perPhoto.length} photos   ${mode.padEnd(9)}   ${cells.join("  ")}${regNote}`);
    continue;
  }

  if (/^(empty|scan)/.test(set)) {
    const n = perPhoto.flat().length;
    const byColour = CAR_COLORS.map((c) => `${c} ${perPhoto.flat().filter((d) => d.color === c).length}`).join(", ");
    rows.push(`${set.padEnd(16)} ${perPhoto.length} photos${regNote}   false detections ${n} (${(n / perPhoto.length).toFixed(2)}/photo; target ≤ 0.05)   ${byColour}`);
    continue;
  }

  const truth = await loadTruth(dir) ?? consensus(perPhoto);
  const cells = CAR_COLORS.map((c) => {
    const p = truth.positions[c];
    if (!p) return `${c} -`;
    const hits = perPhoto.filter((ds) => ds.some((d) => d.color === c && Math.hypot(d.blob.x - p[0], d.blob.y - p[1]) < MATCH_PX)).length;
    return `${c} ${Math.round((100 * hits) / perPhoto.length)}%`;
  });
  rows.push(`${set.padEnd(16)} ${perPhoto.length} photos   ${truth.status.padEnd(9)}   ${cells.join("  ")}`);
}
console.log(rows.join("\n"));
if (process.env.FP_LOG) await writeFile(process.env.FP_LOG, fpLog.join("\n") + "\n");
if (process.env.SHARPNESS_LOG) await writeFile(process.env.SHARPNESS_LOG, sharpLog.join("\n") + "\n");

async function loadTruth(dir: string): Promise<Truth | null> {
  try {
    return JSON.parse(await readFile(join(dir, "truth.json"), "utf8"));
  } catch {
    return null;
  }
}

function consensus(perPhoto: Detection[][]): Truth {
  const positions: Truth["positions"] = {};
  for (const c of CAR_COLORS) {
    const pts = perPhoto.flat().filter((d) => d.color === c);
    if (!pts.length) continue;
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
    positions[c] = [med(pts.map((d) => d.blob.x)), med(pts.map((d) => d.blob.y))];
  }
  return { status: "consensus", positions };
}

async function cachedRegister(set: string, file: string, photo: Rgb): Promise<Registration> {
  const path = join("reports", "cache", track, `${set}-${file}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    const reg = register(cv, ref, toGray(photo));
    await mkdir(join("reports", "cache", track), { recursive: true });
    await writeFile(path, JSON.stringify(reg));
    return reg;
  }
}

/** Point inside a convex quad (either winding), or within `margin` px of its edges. */
function insideQuad(q: Point[], x: number, y: number, margin: number): boolean {
  const cross = q.map((p, i) => { const r = q[(i + 1) % q.length]; return (r.x - p.x) * (y - p.y) - (r.y - p.y) * (x - p.x); });
  if (cross.every((c) => c >= 0) || cross.every((c) => c <= 0)) return true;
  return q.some((p, i) => {
    const r = q[(i + 1) % q.length], ex = r.x - p.x, ey = r.y - p.y;
    const t = Math.max(0, Math.min(1, ((x - p.x) * ex + (y - p.y) * ey) / (ex * ex + ey * ey)));
    return Math.hypot(x - p.x - t * ex, y - p.y - t * ey) <= margin;
  });
}
