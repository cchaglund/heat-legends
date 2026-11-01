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
// MATCH_PX of the true position. Empty sets ("empty-*") count false
// detections. Registration comes from the vision:detect cache when present.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type CarColor, type Detection } from "../src/vision/detect";
import { prepareReference, register, type Registration } from "../src/vision/registration";
import { loadRgb, toGray, type Rgb } from "./lib/images";

const [track = "france", ...filters] = process.argv.slice(2);
const REF_WIDTH = 2000;
const MATCH_PX = 40;

type Truth = { status: string; positions: Partial<Record<CarColor, [number, number]>> };

const cv = await loadCv();
const refRgb = await loadRgb(join("circuits", `${track}.png`), REF_WIDTH);
const ref = prepareReference(cv, toGray(refRgb));
const detectRef = process.env.DETECT_REF ? await loadRgb(process.env.DETECT_REF) : refRgb;
const model = buildReferenceModel(cv, detectRef);
console.log(`detection reference: ${process.env.DETECT_REF ?? "BGG scan"}\n`);

const rows: string[] = [];
for (const set of (await readdir(join("fixtures", track))).sort()) {
  if (filters.length && !filters.some((f) => set.includes(f))) continue;
  const dir = join("fixtures", track, set);
  const perPhoto: Detection[][] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const photo = await loadRgb(join(dir, file));
    const reg = await cachedRegister(set, file, photo);
    perPhoto.push(reg.ok ? detectCars(cv, model, photo, reg.H!, CAR_COLORS).detections : []);
  }

  if (set.startsWith("empty")) {
    const n = perPhoto.flat().length;
    const byColour = CAR_COLORS.map((c) => `${c} ${perPhoto.flat().filter((d) => d.color === c).length}`).join(", ");
    rows.push(`${set.padEnd(16)} ${perPhoto.length} photos   false detections ${n} (${(n / perPhoto.length).toFixed(2)}/photo; target ≤ 0.05)   ${byColour}`);
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
