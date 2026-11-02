// M3: find the space boundaries (white lines across the track) automatically,
// so the annotator starts from a draft instead of ~160 clicks. Road = asphalt (dark, grey) closed over the white lines; a
// boundary = an elongated white component well inside the road, extended
// along its axis to both road edges. Thick ones are probably Corner Lines, tan
// ones Legends Lines, a checker band between two lines the finish. Cutting the
// road along the lines leaves one piece per space; walking them from the
// finish (away from the start grid) gives the race order.
//
//   npx tsx tools/find-boundaries.ts [track] → reports/boundaries/<track>.png + .json (draft annotation)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { loadCv } from "../src/vision/cv";
import type { TrackAnnotation } from "../src/engine/types";
import { loadRgb } from "./lib/images";

const [track = "france"] = process.argv.slice(2);
const MIN_DEPTH = 9; // px from the road edge: drops the edge lines
const MIN_LEN = 35;

const cv = await loadCv();
const ref = await loadRgb(join("circuits", `${track}.png`), 2000);
const { width, height, data } = ref;
const n = width * height;

const asphalt = new cv.Mat(height, width, cv.CV_8UC1);
// 1 = white (space boundary), 2 = tan (Legends Line)
const white = new Uint8Array(n);
for (let i = 0, j = 0; i < n; i++, j += 3) {
  const max = Math.max(data[j], data[j + 1], data[j + 2]);
  const chroma = max - Math.min(data[j], data[j + 1], data[j + 2]);
  asphalt.data[i] = max < 97 && chroma < 33 ? 255 : 0;
  const tan = max > 150 && chroma >= 40 && chroma < 130 && data[j] >= data[j + 1] && data[j + 1] > data[j + 2];
  white[i] = max > 150 && chroma < 50 ? 1 : tan ? 2 : 0;
}
const k = (s: number) => cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(s, s));
const closed = new cv.Mat(), road = new cv.Mat();
cv.morphologyEx(asphalt, closed, cv.MORPH_CLOSE, k(15));
cv.morphologyEx(closed, road, cv.MORPH_OPEN, k(9));
keepBig(road);

const dist = new cv.Mat();
cv.distanceTransform(road, dist, cv.DIST_L2, 5);
const found: Boundary[] = [];
for (const kind of [1, 2]) {
  const inner = cv.Mat.zeros(height, width, cv.CV_8UC1);
  for (let i = 0; i < n; i++) if (white[i] === kind && dist.data32F[i] > MIN_DEPTH) inner.data[i] = 255;
  found.push(...bars(inner, kind === 2));
  inner.delete();
}
// A boundary crosses the road: much longer edge-to-edge segments run along it (raceline).
const medSpan = found.map(span).sort((p, q) => p - q)[found.length >> 1];
// Grid-slot brackets cross only half the road.
const crossing = found.filter((f) => span(f) < 1.4 * medSpan && coverage(f) >= 0.8);
// Merge bars on top of each other: the finish (white | checkers | white) and
// a Legends Line printed on another boundary.
const mid = (f: Boundary) => [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2];
const kept: Boundary[] = [];
// White before tan, and longer bars first, so a real line wins over a stray stroke.
const medLen = found.map((f) => f.len).sort((p, q) => p - q)[found.length >> 1];
for (const f of [...crossing].sort((p, q) => Number(p.legends) - Number(q.legends) || q.len - p.len)) {
  const twin = kept.find((k) => Math.hypot(mid(k)[0] - mid(f)[0], mid(k)[1] - mid(f)[1]) < 22 || crosses(k, f));
  if (!twin) { kept.push({ ...f }); continue; }
  if (f.legends) twin.legends = true;
  else if (Math.min(twin.len, f.len) > 0.7 * medLen && checkered(twin, f)) twin.finish = true;
}
console.log(`${found.length} candidates, ${kept.length} kept (median span ${medSpan.toFixed(0)}px); legends ${kept.filter((f) => f.legends).length}, finish ${kept.filter((f) => f.finish).length}, thick ${kept.filter((f) => f.thickness > 6).length}`);

type Boundary = { a: [number, number]; b: [number, number]; thickness: number; len: number; legends: boolean; finish?: boolean };

function bars(inner: any, legends: boolean): Boundary[] {
const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
const count = cv.connectedComponentsWithStats(inner, labels, stats, cents, 8);
const pts: number[][] = Array.from({ length: count }, () => []);
for (let i = 0; i < n; i++) if (labels.data32S[i]) pts[labels.data32S[i]].push(i);

const out: Boundary[] = [];
for (let c = 1; c < count; c++) {
  const p = pts[c];
  if (p.length < 60) continue;
  // principal axis
  let mx = 0, my = 0;
  for (const i of p) { mx += i % width; my += (i / width) | 0; }
  mx /= p.length; my /= p.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const i of p) { const dx = (i % width) - mx, dy = ((i / width) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(th), uy = Math.sin(th);
  let lo = Infinity, hi = -Infinity;
  for (const i of p) { const t = ((i % width) - mx) * ux + (((i / width) | 0) - my) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const len = hi - lo;
  if (len < MIN_LEN) continue;
  const thickness = p.length / len;
  if (thickness > len / 3) continue; // blobs, not bars
  // A centre dash touching the bar skews the fitted axis: try small turns and
  // shifts and keep the one whose edge-to-edge segment is most line-coloured.
  let best = { cov: -1, a: [0, 0] as [number, number], b: [0, 0] as [number, number] };
  const th0 = th;
  for (let dth = -30; dth <= 30; dth += 2) {
    for (let off = -10; off <= 10; off += 2) {
      const t2 = th0 + (dth * Math.PI) / 180;
      const vx = Math.cos(t2), vy = Math.sin(t2);
      const cx = mx - off * vy, cy = my + off * vx;
      const walk = (sgn: number): [number, number] => {
        let t = 0;
        for (;;) {
          const x = Math.round(cx + (t + sgn) * vx), y = Math.round(cy + (t + sgn) * vy);
          if (x < 0 || y < 0 || x >= width || y >= height || !road.data[y * width + x]) break;
          t += sgn;
        }
        return [Math.round(cx + t * vx), Math.round(cy + t * vy)];
      };
      const a = walk(-1), b = walk(1);
      const cand = { a, b } as Boundary;
      const L = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (L < 40) continue;
      // prefer high coverage, then the shorter (more perpendicular) crossing
      const cov = coverage(cand) - L / 10000;
      if (cov > best.cov) best = { cov, a, b };
    }
  }
  const a = best.a, b = best.b;
  out.push({ a, b, thickness, len, legends });
}
[labels, stats, cents].forEach((m) => m.delete());
return out;
}

// --- race order: cut the road along the lines; each piece is a space.
const cut = road.clone();
for (const f of kept) cv.line(cut, new cv.Point(...f.a), new cv.Point(...f.b), new cv.Scalar(0), 3);
const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat();
cv.connectedComponentsWithStats(cut, lab, st, ce, 4);
const labelAt = (x: number, y: number) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi < 0 || yi < 0 || xi >= width || yi >= height ? 0 : lab.data32S[yi * width + xi];
};
// the two pieces either side of each line (majority over a few samples)
const sides = kept.map((f) => {
  const L = span(f), nx = -(f.b[1] - f.a[1]) / L, ny = (f.b[0] - f.a[0]) / L;
  const vote = (sgn: number) => {
    const c = new Map<number, number>();
    for (const t of [0.25, 0.5, 0.75]) {
      const x = f.a[0] + (f.b[0] - f.a[0]) * t + sgn * 7 * nx, y = f.a[1] + (f.b[1] - f.a[1]) * t + sgn * 7 * ny;
      const l = labelAt(x, y);
      if (l) c.set(l, (c.get(l) ?? 0) + 1);
    }
    return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] ?? 0;
  };
  return [vote(1), vote(-1)];
});
const finishIdx = kept.findIndex((f) => f.finish);
// Forward = away from the start grid: the grid's bracket strokes (short bars
// dropped above) lie behind the finish.
const fin = kept[finishIdx];
const strays = found.filter((f) => !crossing.includes(f) && Math.hypot(mid(f)[0] - mid(fin)[0], mid(f)[1] - mid(fin)[1]) < 400);
const L0 = span(fin), n0 = [-(fin.b[1] - fin.a[1]) / L0, (fin.b[0] - fin.a[0]) / L0];
const gridSide = Math.sign(strays.reduce((t, f) => t + (mid(f)[0] - mid(fin)[0]) * n0[0] + (mid(f)[1] - mid(fin)[1]) * n0[1], 0));
let piece = sides[finishIdx][gridSide > 0 ? 1 : 0]; // the space after the finish
const order = [finishIdx];
const pieceArea: number[] = [];
for (;;) {
  pieceArea.push(st.intAt(piece, cv.CC_STAT_AREA));
  const next = kept.findIndex((_, i) => !order.includes(i) && sides[i].includes(piece));
  if (next < 0) break;
  order.push(next);
  piece = sides[next][0] === piece ? sides[next][1] : sides[next][0];
}
const closes = sides[finishIdx].includes(piece);
console.log(`race order: ${order.length}/${kept.length} lines, loop ${closes ? "closes" : "DOES NOT close"}; unvisited ${kept.map((_, i) => i).filter((i) => !order.includes(i)).join(",") || "none"}`);
const medArea = [...pieceArea].sort((p, q) => p - q)[pieceArea.length >> 1];
pieceArea.forEach((a, k) => a > 1.6 * medArea && console.log(`  space after line #${order[k]} is ${(a / medArea).toFixed(1)}× the median: missing line?`));
// orient: a on the driver's left
const ordered = order.map((i) => ({ ...kept[i] }));
ordered.forEach((f, k) => {
  const p = mid(ordered[(k - 1 + ordered.length) % ordered.length]), q = mid(ordered[(k + 1) % ordered.length]);
  const d = [q[0] - p[0], q[1] - p[1]], m = mid(f);
  // image y points down, so "left of travel" has a negative cross product
  if (d[0] * (f.a[1] - m[1]) - d[1] * (f.a[0] - m[0]) > 0) [f.a, f.b] = [f.b, f.a];
});
[cut, lab, st, ce].forEach((m) => m.delete());

// Draft annotation in the engine's format. Corner speed limits (0 = unknown)
// and raceline sides are left to the annotator (D14: the raceline can't be told
// from the print reliably: both edges carry white bands).
const draft: TrackAnnotation = {
  id: track,
  referenceImage: `circuits/${track}.png`,
  laps: 1,
  boundaries: ordered.map((f) => ({
    a: { x: f.a[0], y: f.a[1] },
    b: { x: f.b[0], y: f.b[1] },
    raceline: "b",
    tags: [
      ...(f.finish ? [{ kind: "finish" as const }] : []),
      ...(f.thickness > 6 ? [{ kind: "corner" as const, speedLimit: 0 }] : []),
      ...(f.legends ? [{ kind: "legends" as const }] : []),
    ],
  })),
};

const out = new Uint8Array(data.map((v) => v >> 1));
const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${ordered.map((f, i) =>
  `<line x1="${f.a[0]}" y1="${f.a[1]}" x2="${f.b[0]}" y2="${f.b[1]}" stroke="${f.finish ? "#fff" : f.legends ? "#fc0" : f.thickness > 6 ? "#f40" : "#0f8"}" stroke-width="4"/>` +
  `<circle cx="${f.a[0]}" cy="${f.a[1]}" r="5" fill="#f0f"/><text x="${f.b[0] + 4}" y="${f.b[1]}" fill="#ff0" font-size="18">${i}</text>`).join("")}</svg>`;
await mkdir(join("reports", "boundaries"), { recursive: true });
const base = await sharp(Buffer.from(out), { raw: { width, height, channels: 3 } }).png().toBuffer();
await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(join("reports", "boundaries", `${track}.png`));
await writeFile(join("reports", "boundaries", `${track}.json`), JSON.stringify(draft, null, 1));
[asphalt, closed, road, dist].forEach((m) => m.delete());

function span(f: Boundary) {
  return Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1]);
}

/** Fraction of the edge-to-edge segment that is clearly lighter than asphalt
 *  (within ±2px across it): a grid-slot bracket covers only half the road. */
function coverage(f: Boundary): number {
  const L = span(f), ux = (f.b[0] - f.a[0]) / L, uy = (f.b[1] - f.a[1]) / L;
  let hit = 0, tot = 0;
  for (let t = 8; t < L - 8; t += 2, tot++) {
    for (let o = -2; o <= 2; o++) {
      const x = Math.round(f.a[0] + t * ux - o * uy), y = Math.round(f.a[1] + t * uy + o * ux);
      const j = (y * width + x) * 3;
      if (Math.max(data[j], data[j + 1], data[j + 2]) > 105) { hit++; break; }
    }
  }
  return tot ? hit / tot : 0;
}

/** The finish: a checker band between two white lines, i.e. many light/dark
 *  changes along the middle between them. */
function checkered(p: Boundary, q: Boundary): boolean {
  const a = [(p.a[0] + q.a[0]) / 2, (p.a[1] + q.a[1]) / 2], b = [(p.b[0] + q.b[0]) / 2, (p.b[1] + q.b[1]) / 2];
  if (Math.hypot(mid(p)[0] - mid(q)[0], mid(p)[1] - mid(q)[1]) < 8) return false;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let changes = 0, last = -1;
  for (let t = 0; t <= L; t++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * t) / L), y = Math.round(a[1] + ((b[1] - a[1]) * t) / L);
    const j = (y * width + x) * 3, light = Math.max(data[j], data[j + 1], data[j + 2]) > 128 ? 1 : 0;
    if (last >= 0 && light !== last) changes++;
    last = light;
  }
  return changes >= 14;
}

/** Two segments intersect (a stray stroke snapped across a real line). */
function crosses(p: Boundary, q: Boundary): boolean {
  const side = (o: number[], u: number[], v: number[]) => Math.sign((u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]));
  return side(p.a, p.b, q.a) !== side(p.a, p.b, q.b) && side(q.a, q.b, p.a) !== side(q.a, q.b, p.b);
}

/** Keep components ≥ 15% of the largest (as the detector's track mask). */
function keepBig(m: any) {
  const l = new cv.Mat(), s = new cv.Mat(), c = new cv.Mat();
  const nc = cv.connectedComponentsWithStats(m, l, s, c, 8);
  const areas = Array.from({ length: nc }, (_, i) => (i ? s.intAt(i, cv.CC_STAT_AREA) : 0));
  const big = Math.max(...areas);
  for (let i = 0; i < n; i++) m.data[i] = areas[l.data32S[i]] >= 0.15 * big ? 255 : 0;
  [l, s, c].forEach((x) => x.delete());
}
