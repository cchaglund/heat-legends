// How unlike the scan does the empty track look? Candidate statistics for the
// "the light has changed" check (D34), per detection reference × fixture set,
// next to recall, so a statistic can be picked that rises when detection fails.
//
//   npx tsx tools/light-check.ts <ref.png|jpg>… → one row per ref × set
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { deriveTrack, spaceAtPoint } from "../src/engine/track";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type CarColor } from "../src/vision/detect";
import type { Registration } from "../src/vision/registration";
import { loadRgb } from "./lib/images";

const refs = process.argv.slice(2);
const SETS = ["closeup-light-c", "closeup-light-d", "scan-light-c", "scan-light-d"];
const cv = await loadCv();
const t = deriveTrack(JSON.parse(await readFile("tracks/france.json", "utf8")));
const accept = (b: { x: number; y: number }) => spaceAtPoint(t, b.x, b.y) >= 0;

console.log("ref\tset\tphotos\trecall\tfalse/photo\tnoise%\tmedDiff");
for (const refPath of refs) {
  const model = buildReferenceModel(cv, await loadRgb(refPath, 2000));
  for (const set of SETS) {
    const dir = join("fixtures/france", set);
    let truth: Record<string, Partial<Record<CarColor, [number, number] | null>>> = {};
    try {
      truth = JSON.parse(await readFile(join(dir, "truth.json"), "utf8")).photos ?? {};
    } catch {}
    let photos = 0, hits = 0, named = 0, falses = 0;
    const noise: number[] = [], med: number[] = [];
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
      let reg: Registration;
      try {
        reg = JSON.parse(await readFile(join("reports/cache/france", `${set}-${file}.json`), "utf8"));
      } catch {
        continue;
      }
      if (!reg.ok) continue;
      const res = detectCars(cv, model, await loadRgb(join(dir, file)), reg.H!, CAR_COLORS, accept);
      photos++;
      const want = truth[file.replace(/\.jpg$/, "")] ?? {};
      for (const [c, p] of Object.entries(want) as [CarColor, [number, number] | null][]) {
        if (!p) continue;
        named++;
        if (res.detections.some((d) => d.color === c && Math.hypot(d.blob.x - p[0], d.blob.y - p[1]) < 40)) hits++;
      }
      falses += res.detections.filter((d) => {
        const p = want[d.color];
        return !p || Math.hypot(d.blob.x - p[0], d.blob.y - p[1]) >= 40;
      }).length;
      // Visible track pixels: share that are car candidates, and the median colour distance.
      let n = 0, m = 0;
      const ds: number[] = [];
      for (let i = 0; i < res.diff.length; i += 7) {
        if (!res.valid[i] || !model.track[i]) continue;
        n++;
        if (res.mask[i]) m++;
        ds.push(res.diff[i]);
      }
      noise.push(n ? (100 * m) / n : 0);
      ds.sort((a, b) => a - b);
      med.push(ds[ds.length >> 1] ?? 0);
    }
    const avg = (a: number[]) => (a.reduce((s, v) => s + v, 0) / (a.length || 1)).toFixed(2);
    console.log(`${refPath.split("/").pop()}\t${set}\t${photos}\t${named ? `${hits}/${named}` : "-"}\t${(falses / (photos || 1)).toFixed(2)}\t${avg(noise)}\t${avg(med)}`);
  }
}
