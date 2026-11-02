import { describe, expect, it } from "vitest";
import { relativeSharpness, sharpness } from "./quality";

const W = 64;
function checker(blurred: boolean) {
  const g = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) g[y * W + x] = ((x >> 2) + (y >> 2)) % 2 ? 220 : 30;
  if (!blurred) return g;
  const b = new Uint8Array(g);
  for (let y = 0; y < W; y++) for (let x = 2; x < W - 2; x++) {
    let s = 0;
    for (let d = -2; d <= 2; d++) s += g[y * W + x + d];
    b[y * W + x] = s / 5; // horizontal motion blur
  }
  return b;
}
const rgb = (g: Uint8Array) => ({ width: W, height: W, data: Uint8Array.from([...g].flatMap((v) => [v, v, v])) });

describe("quality", () => {
  it("scores a motion-blurred image below the sharp one", () => {
    expect(sharpness({ width: W, height: W, data: checker(true) })).toBeLessThan(sharpness({ width: W, height: W, data: checker(false) }));
  });
  it("relative sharpness is 1 for the reference itself and lower when blurred", () => {
    const ref = rgb(checker(false)), mask = new Uint8Array(W * W).fill(1);
    expect(relativeSharpness(ref, ref, mask)).toBeCloseTo(1);
    expect(relativeSharpness(ref, rgb(checker(true)), mask)).toBeLessThan(0.6);
  });
});
