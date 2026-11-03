// Sweep consensus (D35): a car counts only when two views taken from clearly
// different camera positions see the same colour at the same board spot, and
// most of the views that show that spot see it too. Glare and sheen depend on
// the viewing angle, so they move (or vanish) between views; a car stays
// where it is. Measured on the empty-board videos (tools/sweep-eval.ts): the
// pair rule alone leaves ~0.3 false cars per 1.5 s sweep (glare that lasts a
// few frames); adding the majority vote brings it to ~1 in 40 sweeps.
// Pure logic, no OpenCV.
import { apply, invert, type H3 } from "./homography";
import type { CarColor } from "./detect";

export type ViewDetection = { color: CarColor; x: number; y: number }; // reference px
export type View = { H: H3 | null; width: number; height: number; detections: ViewDetection[] };
export type Confirmed = { color: CarColor; x: number; y: number; support: number };

export type ConfirmOptions = {
  /** Minimum distance (reference px) between the two views' frame centres. */
  minBaseline?: number;
  /** Same car = same colour within this distance (reference px). */
  matchPx?: number;
  /** Share of the views showing the spot that must see the car there. */
  minFraction?: number;
};

export const MIN_BASELINE = 40;
const MATCH_PX = 25;
const MIN_FRACTION = 0.6;
const EDGE_PX = 20; // a spot this close to a frame's edge doesn't count as shown

/** Does the view show this reference point (away from the frame edges)? */
export function viewShows(v: View, p: { x: number; y: number }): boolean {
  if (!v.H) return false;
  const q = apply(invert(v.H), p);
  return q.x > EDGE_PX && q.y > EDGE_PX && q.x < v.width - EDGE_PX && q.y < v.height - EDGE_PX;
}

/** Where the view's frame centre lands on the board: a proxy for camera position. */
export function viewCenter(v: View) {
  return apply(v.H!, { x: v.width / 2, y: v.height / 2 });
}

/** Largest distance between any two views' centres: how far the sweep has moved. */
export function sweepBaseline(views: View[]): number {
  const cs = views.filter((v) => v.H).map(viewCenter);
  let best = 0;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) best = Math.max(best, Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y));
  return best;
}

/** One position per colour: the best-supported spot that passes both rules. */
export function confirmCars(views: View[], opts: ConfirmOptions = {}): Confirmed[] {
  const minBaseline = opts.minBaseline ?? MIN_BASELINE;
  const matchPx = opts.matchPx ?? MATCH_PX;
  const minFraction = opts.minFraction ?? MIN_FRACTION;
  const vs = views.filter((v) => v.H);
  const cs = vs.map(viewCenter);
  const pairs: ViewDetection[] = []; // midpoint of each agreeing pair
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      if (Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) < minBaseline) continue;
      for (const d of vs[i].detections) {
        const e = vs[j].detections.find((e) => e.color === d.color && Math.hypot(e.x - d.x, e.y - d.y) < matchPx);
        if (e) pairs.push({ color: d.color, x: (d.x + e.x) / 2, y: (d.y + e.y) / 2 });
      }
    }
  }
  const out: Confirmed[] = [];
  for (const color of new Set(pairs.map((p) => p.color))) {
    const mine = pairs.filter((p) => p.color === color);
    const near = (p: ViewDetection) => mine.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < matchPx);
    const candidates = mine.map((p) => {
      const group = near(p);
      const at = { x: group.reduce((s, q) => s + q.x, 0) / group.length, y: group.reduce((s, q) => s + q.y, 0) / group.length };
      return { group, at };
    }).sort((a, b) => b.group.length - a.group.length);
    for (const { group, at } of candidates) {
      const shown = vs.filter((v) => viewShows(v, at));
      const seen = shown.filter((v) => v.detections.some((d) => d.color === color && Math.hypot(d.x - at.x, d.y - at.y) < matchPx));
      if (seen.length < minFraction * shown.length) continue;
      out.push({ color, ...at, support: group.length });
      break;
    }
  }
  return out;
}
