// 3×3 row-major homography helpers.
export type H3 = number[];
export type Point = { x: number; y: number };

export function apply(h: H3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invert(h: H3): H3 {
  const [a, b, c, d, e, f, g, i, k] = h;
  const A = e * k - f * i, B = -(d * k - f * g), C = d * i - e * g;
  const det = a * A + b * B + c * C;
  const inv = [
    A, -(b * k - c * i), b * f - c * e,
    B, a * k - c * g, -(a * f - c * d),
    C, -(a * i - b * g), a * e - b * d,
  ].map((v) => v / det);
  return inv.map((v) => v / inv[8]);
}

export function scale(h: H3, sx: number, sy = sx): H3 {
  // Returns S · H, i.e. the output coordinates scaled.
  return [h[0] * sx, h[1] * sx, h[2] * sx, h[3] * sy, h[4] * sy, h[5] * sy, h[6], h[7], h[8]];
}

/** Returns H · S, i.e. the input coordinates scaled: for a frame resized by `s`. */
export function scaleInput(h: H3, s: number): H3 {
  return [h[0] * s, h[1] * s, h[2], h[3] * s, h[4] * s, h[5], h[6] * s, h[7] * s, h[8]];
}
