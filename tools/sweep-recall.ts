// Recall of the sweep consensus (D35) on the close-up photos: photos of the
// same arrangement (red-silver, red-silver-2, …) act as the views of one
// sweep. A named car counts if it's confirmed within 40px of its truth spot.
//
//   DETECT_REF=reports/ref/france-scan-light-d.png npx tsx tools/sweep-recall.ts
// Uses the registration cache written by vision:detect.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { deriveTrack, spaceAtPoint } from "../src/engine/track";
import { loadCv } from "../src/vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type CarColor } from "../src/vision/detect";
import { confirmCars, type View } from "../src/vision/sweep";
import { loadRgb } from "./lib/images";

const cv = await loadCv();
const model = buildReferenceModel(cv, await loadRgb(process.env.DETECT_REF ?? "reports/ref/france-scan-light-d.png"));
const board = deriveTrack(JSON.parse(await readFile("tracks/france.json", "utf8")));
const accept = (b: { x: number; y: number }) => spaceAtPoint(board, b.x, b.y) >= 0;
const hits: Record<string, [number, number]> = {};
for (const set of ["closeup-light-c", "closeup-light-d"]) {
  const dir = join("fixtures", "france", set);
  const truth = JSON.parse(await readFile(join(dir, "truth.json"), "utf8")).photos;
  const groups = new Map<string, string[]>();
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort()) {
    const key = f.replace(/(-\d+)?\.jpg$/, "");
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const [key, files] of groups) {
    if (files.length < 2) continue;
    const views: View[] = [];
    for (const f of files) {
      const reg = JSON.parse(await readFile(join("reports", "cache", "france", `${set}-${f}.json`), "utf8"));
      const rgb = await loadRgb(join(dir, f));
      const ds = reg.ok ? detectCars(cv, model, rgb, reg.H, CAR_COLORS, accept).detections : [];
      views.push({ H: reg.ok ? reg.H : null, width: rgb.width, height: rgb.height, detections: ds.map((d) => ({ color: d.color, x: d.blob.x, y: d.blob.y })) });
    }
    const confirmed = confirmCars(views);
    const t = truth[key] ?? {};
    const line: string[] = [];
    for (const color of key.split("-") as CarColor[]) {
      const p = t[color];
      if (!p) continue;
      const ok = confirmed.some((c) => c.color === color && Math.hypot(c.x - p[0], c.y - p[1]) < 40);
      (hits[color] ??= [0, 0])[1]++;
      if (ok) hits[color][0]++;
      line.push(`${color} ${ok ? "✓" : "✗"}`);
    }
    const extra = confirmed.filter((c) => !t[c.color] || Math.hypot(c.x - t[c.color][0], c.y - t[c.color][1]) >= 40).map((c) => c.color);
    console.log(`${set}/${key} (${files.length} views): ${line.join("  ")}${extra.length ? `  other: ${extra.join(", ")}` : ""}`);
  }
}
console.log(Object.entries(hits).map(([c, [h, n]]) => `${c} ${h}/${n}`).join("  "));
