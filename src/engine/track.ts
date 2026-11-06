// Turns the boundary annotation into the index-only model the rules use, plus
// the small bits of loop arithmetic every rule needs. Each corner is paired
// with the nearest Legends Line before it; a track that breaks the printed
// board's guarantees (D28) is refused here rather than half-working later.
import type { Corner, Point, Position, Space, Track, TrackAnnotation } from "./types";

const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Spaces moved going forward from `from` to `to` (0..n-1). */
export function forwardDistance(track: Track, from: number, to: number): number {
  return mod(to - from, track.spaces.length);
}

export function spaceAt(track: Track, from: number, steps: number): number {
  return mod(from + steps, track.spaces.length);
}

/** Corners ahead of `space`, nearest first, with the distance to each line's
 *  diamond-0 space. A car on diamond 0 has not crossed that line yet (distance 0).
 *  Wraps past one lap so there is always a "second" corner. */
export function cornersAhead(track: Track, space: number): Array<{ corner: Corner; distance: number }> {
  const n = track.spaces.length;
  const ahead = track.corners
    .map((corner) => ({ corner, distance: forwardDistance(track, space, corner.after) }))
    .sort((p, q) => p.distance - q.distance);
  return [...ahead, ...ahead.map((c) => ({ ...c, distance: c.distance + n }))];
}

/** The diamond (0–3) printed on `space`: the 4 spaces before a Corner Line. Null elsewhere. */
export function diamondOf(track: Track, space: number): number | null {
  const d = cornersAhead(track, space)[0].distance;
  return d <= 3 ? d : null;
}

/** "diamond N (space X)" for the 4 spaces before a Corner Line, else "space X". */
export function spaceLabel(track: Track, space: number): string {
  const d = diamondOf(track, space);
  return d !== null ? `diamond ${d} (space ${space})` : `space ${space}`;
}

export function deriveTrack(ann: TrackAnnotation): Track {
  const bs = ann.boundaries;
  const n = bs.length;
  if (n < 2) throw new Error(`track ${ann.id}: needs at least 2 boundaries`);

  const spaces: Space[] = bs.map((b, i) => {
    const nb = bs[(i + 1) % n];
    const m = mid(b.a, b.b);
    const nm = mid(nb.a, nb.b);
    const aHalf = { id: "", polygon: [b.a, m, nm, nb.a] };
    const bHalf = { id: "", polygon: [m, b.b, nb.b, nm] };
    const [s0, s1] = b.raceline === "a" ? [aHalf, bHalf] : [bHalf, aHalf];
    s0.id = `${i}-0`;
    s1.id = `${i}-1`;
    return { index: i, quad: [b.a, b.b, nb.b, nb.a], spots: [s0, s1] };
  });

  const has = (i: number, kind: string) => bs[mod(i, n)].tags?.some((t) => t.kind === kind) ?? false;
  const corners: Corner[] = [];
  let finishAfter: number | undefined;
  bs.forEach((b, i) => {
    for (const tag of b.tags ?? []) {
      if (tag.kind === "finish") finishAfter = mod(i - 1, n);
      if (tag.kind !== "corner") continue;
      // Walk back to this corner's Legends Line; hitting another corner first is an error.
      let legendsAfter: number | undefined;
      for (let j = i - 1; j > i - n; j--) {
        if (has(j, "legends")) {
          legendsAfter = mod(j - 1, n);
          break;
        }
        if (has(j, "corner")) break;
      }
      const after = mod(i - 1, n);
      if (legendsAfter === undefined) throw new Error(`track ${ann.id}: corner at boundary ${i} has no Legends Line before it`);
      if (mod(after - legendsAfter, n) < 4)
        throw new Error(`track ${ann.id}: Legends Line for corner at boundary ${i} is closer than diamond 3 (D28)`);
      corners.push({ after, speedLimit: tag.speedLimit, legendsAfter });
    }
  });
  if (corners.length === 0) throw new Error(`track ${ann.id}: no corners`);

  return { id: ann.id, referenceImage: ann.referenceImage, laps: ann.laps, spaces, corners, finishAfter };
}

/** Index of the space whose quad contains (x, y) in reference px, or -1. */
export function spaceAtPoint(track: Track, x: number, y: number): number {
  return track.spaces.findIndex(({ quad }) => inside(quad, x, y));
}

const inside = (poly: Point[], x: number, y: number) => {
  const cross = poly.map((p, i) => {
    const r = poly[(i + 1) % poly.length];
    return (r.x - p.x) * (y - p.y) - (r.y - p.y) * (x - p.x);
  });
  return cross.every((c) => c >= 0) || cross.every((c) => c <= 0);
};

/** Space and spot under (x, y) in reference px, or null when off the track. */
export function positionAtPoint(track: Track, x: number, y: number): Position | null {
  const space = spaceAtPoint(track, x, y);
  if (space < 0) return null;
  return { space, spot: inside(track.spaces[space].spots[1].polygon, x, y) ? 1 : 0 };
}

/** Centre of a spot in reference px (mean of its corners). */
export function spotCenter(track: Track, pos: Position): Point {
  const poly = track.spaces[pos.space].spots[pos.spot].polygon;
  return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
}
