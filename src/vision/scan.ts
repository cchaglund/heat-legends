// Board scan (D29, D32): builds the reference image of the user's own board
// from a filmed sweep of the empty board, on the phone. The algorithm of
// tools/build-own-reference.ts, made incremental and bounded in memory: per
// reference pixel only the K sharpest views are kept (sharpness = photo px
// per reference px, from the homography's Jacobian), and the result is their
// per-pixel median. Pixels seen by fewer than K views keep the printed board.
// Feed it about one frame a second (see the app worker): K-sharpest of many
// frames favours the closest views and makes the reference too crisp.
// A rescan mid-race (D36) starts from the old scan instead and never takes
// pixels where a car may stand: known cars (`excludeBox`) and cars detected
// in ≥ CAR_VOTES frames (`markCandidate`; a car stays put, a false detection
// rarely repeats on the same spot). Those keep the old scan as it was:
// fitting its colours to the new light measured no better (1.33 vs 1.19
// false cars per empty frame), since detection normalizes lighting anyway.
import type { CV } from "./cv";
import { invert, type H3 } from "./homography";
import type { Rgb } from "./detect";

const K = 3;
/** A view is "sharp" at a pixel when it samples it at ≥ this many photo px per reference px (D32). */
export const MIN_DENSITY = 0.8;
/** Frames a candidate blob must appear in before its pixels keep the old scan (D36). */
export const CAR_VOTES = 2;

export class ScanAccumulator {
  readonly width: number;
  readonly height: number;
  private readonly values: Uint8Array; // K × 3 per pixel, sharpest first
  private readonly dens: Float32Array; // K per pixel, descending
  private readonly sharp: Uint8Array; // sharp views seen per pixel (capped)
  /** 1 = never take this pixel from the views (a known car). */
  readonly exclude: Uint8Array;
  private readonly votes: Uint8Array; // frames with a candidate blob here (capped)
  private readonly voted: Int32Array; // the last frame that voted here
  frames = 0;

  /** `base`: the printed board, or for a rescan the old scan. */
  constructor(private readonly base: Rgb) {
    this.width = base.width;
    this.height = base.height;
    const n = base.width * base.height;
    this.values = new Uint8Array(n * K * 3);
    this.dens = new Float32Array(n * K);
    this.sharp = new Uint8Array(n);
    this.exclude = new Uint8Array(n);
    this.votes = new Uint8Array(n);
    this.voted = new Int32Array(n).fill(-1);
  }

  /** Marks a box (reference px) as excluded. */
  excludeBox(x0: number, y0: number, x1: number, y1: number) {
    this.box(x0, y0, x1, y1, (i) => (this.exclude[i] = 1));
  }

  /** A candidate blob's box in the frame about to be added; counts once per frame. */
  markCandidate(x0: number, y0: number, x1: number, y1: number) {
    const f = this.frames;
    this.box(x0, y0, x1, y1, (i) => {
      if (this.voted[i] === f) return;
      this.voted[i] = f;
      if (this.votes[i] < 255) this.votes[i]++;
    });
  }

  /** Share of the board that keeps the base image because a car may stand there. */
  excludedShare(): number {
    let k = 0;
    for (let i = 0; i < this.exclude.length; i++) if (this.excluded(i)) k++;
    return k / this.exclude.length;
  }

  private excluded(i: number) {
    return this.exclude[i] === 1 || this.votes[i] >= CAR_VOTES;
  }

  private box(x0: number, y0: number, x1: number, y1: number, f: (i: number) => void) {
    const { width, height } = this;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, y1); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(width - 1, x1); x++) f(y * width + x);
  }

  /** Adds one aligned frame (H maps frame → reference). */
  add(cv: CV, frame: Rgb, H: H3) {
    const { width, height } = this;
    const src = new cv.Mat(frame.height, frame.width, cv.CV_8UC3);
    src.data.set(frame.data);
    const Hm = cv.matFromArray(3, 3, cv.CV_64F, H);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, Hm, new cv.Size(width, height));
    const warped: Uint8Array = dst.data;
    const [a, b, c, d, e, f, g, h, k] = invert(H);
    const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
    const { values, dens, sharp } = this;
    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i++) {
        const w = g * x + h * y + k;
        if (w <= 0) continue;
        const fx = (a * x + b * y + c) / w, fy = (d * x + e * y + f) / w;
        if (fx < 0 || fy < 0 || fx >= frame.width - 1 || fy >= frame.height - 1) continue;
        const q = Math.abs(det / (w * w * w));
        if (q >= MIN_DENSITY && sharp[i] < 255) sharp[i]++;
        // Insert into this pixel's K sharpest, keeping them sorted.
        let slot = K;
        while (slot > 0 && dens[i * K + slot - 1] < q) slot--;
        if (slot === K) continue;
        for (let s = K - 1; s > slot; s--) {
          dens[i * K + s] = dens[i * K + s - 1];
          for (let ch = 0; ch < 3; ch++) values[(i * K + s) * 3 + ch] = values[(i * K + s - 1) * 3 + ch];
        }
        dens[i * K + slot] = q;
        for (let ch = 0; ch < 3; ch++) values[(i * K + slot) * 3 + ch] = warped[i * 3 + ch];
      }
    }
    [src, Hm, dst].forEach((m) => m.delete());
    this.frames++;
  }

  /** Fraction of the given sample points (reference px) seen sharp by ≥ K views. */
  coverage(points: { x: number; y: number }[]): number {
    if (points.length === 0) return 0;
    let ok = 0;
    for (const p of points) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x >= 0 && y >= 0 && x < this.width && y < this.height && this.sharp[y * this.width + x] >= K) ok++;
    }
    return ok / points.length;
  }

  /** The scanned reference: median of the K sharpest views, the base image (printed board, or the old scan) where there are fewer. */
  build(): Rgb {
    const n = this.width * this.height;
    const { values, dens } = this;
    const full = (i: number) => dens[i * K + K - 1] > 0 && !this.excluded(i);
    const out = new Uint8Array(this.base.data);
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (!full(i)) continue;
      for (let ch = 0; ch < 3; ch++) {
        for (let s = 0; s < K; s++) v[s] = values[(i * K + s) * 3 + ch];
        out[i * 3 + ch] = median3(v[0], v[1], v[2]);
      }
    }
    return { width: this.width, height: this.height, data: out };
  }
}

const median3 = (p: number, q: number, r: number) => Math.max(Math.min(p, q), Math.min(Math.max(p, q), r));
