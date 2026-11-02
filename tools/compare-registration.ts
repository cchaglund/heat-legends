// Re-registers every fixture photo and compares with the cached (validated)
// registration: success counts, time per photo, and how far the two
// homographies place a grid of photo points apart (reference px).
//
//   npx tsx tools/compare-registration.ts [track]
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCv } from "../src/vision/cv";
import { apply } from "../src/vision/homography";
import { prepareReference, register } from "../src/vision/registration";
import { loadRgb, toGray } from "./lib/images";

const [track = "france"] = process.argv.slice(2);
const cv = await loadCv();
const ref = prepareReference(cv, toGray(await loadRgb(join("circuits", `${track}.png`), 2000)));
let n = 0, okOld = 0, okNew = 0, ms = 0;
const devs: number[] = [];
const worst: string[] = [];
for (const set of (await readdir(join("fixtures", track))).sort()) {
  for (const f of (await readdir(join("fixtures", track, set))).filter((x) => x.endsWith(".jpg")).sort()) {
    const g = toGray(await loadRgb(join("fixtures", track, set, f)));
    const t = performance.now();
    const r = register(cv, ref, g);
    ms += performance.now() - t;
    n++;
    const old = JSON.parse(await readFile(join("reports", "cache", track, `${set}-${f}.json`), "utf8").catch(() => "null"));
    if (old?.ok) okOld++;
    if (r.ok) okNew++;
    if (old?.ok && r.ok) {
      let d = 0;
      for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) {
        const p = { x: g.width * fx, y: g.height * fy };
        const a = apply(old.H, p), b = apply(r.H!, p);
        d = Math.max(d, Math.hypot(a.x - b.x, a.y - b.y));
      }
      devs.push(d);
      if (d > 5) worst.push(`${set}/${f} ${d.toFixed(1)}px`);
    } else if (old?.ok !== r.ok) worst.push(`${set}/${f} old ${old?.ok} new ${r.ok} (coarse ${r.coarse.inliers}, refine ${r.refine?.inliers})`);
  }
}
devs.sort((a, b) => a - b);
console.log(`${n} photos: registered old ${okOld}, new ${okNew}; ${Math.round(ms / n)} ms/photo`);
console.log(`max deviation vs old: median ${devs[devs.length >> 1]?.toFixed(1)}px, 95% ${devs[Math.floor(devs.length * 0.95)]?.toFixed(1)}px`);
console.log(worst.join("\n"));
