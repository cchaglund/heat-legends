// Board scan (D29, D32): builds the reference image of the user's own board
// from a filmed sweep of the empty board, on the phone. The algorithm of
// tools/build-own-reference.ts, made incremental and bounded in memory: per
// reference pixel only the K sharpest views are kept (sharpness = photo px
// per reference px, from the homography's Jacobian), and the result is their
// per-pixel median. Pixels seen by fewer than K views keep the printed board.
// Feed it about one frame a second (see the app worker): K-sharpest of many
// frames favours the closest views and makes the reference too crisp.
import type { CV } from "./cv";
import { invert, type H3 } from "./homography";
import type { Rgb } from "./detect";

const K = 3;
/** A view is "sharp" at a pixel when it samples it at ≥ this many photo px per reference px (D32). */
export const MIN_DENSITY = 0.8;

export class ScanAccumulator {
  readonly width: number;
  readonly height: number;
  private readonly values: Uint8Array; // K × 3 per pixel, sharpest first
  private readonly dens: Float32Array; // K per pixel, descending
  private readonly sharp: Uint8Array; // sharp views seen per pixel (capped)
  frames = 0;

  constructor(private readonly base: Rgb) {
    this.width = base.width;
    this.height = base.height;
    const n = base.width * base.height;
    this.values = new Uint8Array(n * K * 3);
    this.dens = new Float32Array(n * K);
    this.sharp = new Uint8Array(n);
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

  /** The scanned reference: median of the K sharpest views, the printed board where there are fewer. */
  build(): Rgb {
    const out = new Uint8Array(this.base.data);
    const { values, dens } = this;
    const v = [0, 0, 0];
    for (let i = 0, n = this.width * this.height; i < n; i++) {
      if (dens[i * K + K - 1] === 0) continue;
      for (let ch = 0; ch < 3; ch++) {
        for (let s = 0; s < K; s++) v[s] = values[(i * K + s) * 3 + ch];
        out[i * 3 + ch] = median3(v[0], v[1], v[2]);
      }
    }
    return { width: this.width, height: this.height, data: out };
  }
}

const median3 = (p: number, q: number, r: number) => Math.max(Math.min(p, q), Math.min(Math.max(p, q), r));
