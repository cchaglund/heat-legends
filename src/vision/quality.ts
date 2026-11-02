// Frame quality gate (D19): reject motion-blurred / out-of-focus frames before
// detection, so the app can ask the user to hold steady instead of guessing.
// Sharpness = variance of the Laplacian on a fixed-size grey image, so the
// number doesn't depend on the camera resolution. Plain JS: no OpenCV needed.
import type { Gray } from "./registration";

type Rgb = { width: number; height: number; data: Uint8Array };

const WORK_EDGE = 1024;

/** Box-downscale so the long edge is ≤ WORK_EDGE (integer factor). */
function shrink(img: Gray): Gray {
  const f = Math.max(1, Math.ceil(Math.max(img.width, img.height) / WORK_EDGE));
  if (f === 1) return img;
  const width = Math.floor(img.width / f), height = Math.floor(img.height / f);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * img.width + x * f;
        for (let dx = 0; dx < f; dx++) s += img.data[row + dx];
      }
      data[y * width + x] = s / (f * f);
    }
  }
  return { width, height, data };
}

/** Variance of the 4-neighbour Laplacian; higher = sharper. */
export function sharpness(img: Gray): number {
  const { width: w, height: h, data: d } = shrink(img);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      const l = d[i - 1] + d[i + 1] + d[i - w] + d[i + w] - 4 * d[i];
      sum += l; sum2 += l * l; n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/**
 * Detail of a frame warped into reference space relative to the reference
 * itself, over the masked pixels: mean squared Laplacian, frame / reference.
 * ≈1 = as sharp as the reference; motion blur, defocus and views too far
 * away (upsampled by the warp) all push it down. Content-independent, unlike
 * `sharpness`.
 */
export function relativeSharpness(ref: Rgb, frame: Rgb, mask: Uint8Array): number {
  const w = ref.width, h = ref.height;
  const g = (img: Rgb, i: number) => img.data[i * 3] * 77 + img.data[i * 3 + 1] * 150 + img.data[i * 3 + 2] * 29;
  const lap = (img: Rgb, i: number) => (g(img, i - 1) + g(img, i + 1) + g(img, i - w) + g(img, i + w) - 4 * g(img, i)) / 256;
  let num = 0, den = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) continue;
      const a = lap(frame, i), b = lap(ref, i);
      num += a * a; den += b * b;
    }
  }
  return den ? num / den : 0;
}
