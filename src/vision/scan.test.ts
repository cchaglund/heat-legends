import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import type { CV } from "./cv";
import type { Rgb } from "./detect";
import { ScanAccumulator } from "./scan";

let cv: CV;
// Vitest's ESM import of OpenCV.js trips over its thenable module object; require it instead.
beforeAll(async () => {
  let m = createRequire(import.meta.url)("@techstark/opencv-js");
  if (m instanceof Promise) m = await m;
  if (!m.Mat) await new Promise<void>((resolve) => (m.onRuntimeInitialized = resolve));
  cv = m;
}, 30000);

const W = 120, H = 80;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const image = (f: (x: number, y: number, c: number) => number): Rgb => {
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) data[(y * W + x) * 3 + c] = f(x, y, c);
  return { width: W, height: H, data };
};
const at = (img: Rgb, x: number, y: number, c = 0) => img.data[(y * W + x) * 3 + c];

describe("ScanAccumulator rescan", () => {
  // Old scan: a gradient. Now: other light, and a red car at x 50–60, y 30–40.
  const old = image((x) => 40 + 1.5 * x);
  const car = (x: number, y: number) => x >= 50 && x < 60 && y >= 30 && y < 40;
  const now = image((x, y, c) => (car(x, y) ? [220, 30, 30][c] : Math.round(0.5 * (40 + 1.5 * x) + 20)));

  it("keeps the old scan where a known car stands", () => {
    const acc = new ScanAccumulator(old);
    acc.excludeBox(48, 28, 62, 42);
    for (let k = 0; k < 3; k++) acc.add(cv, now, I);
    const out = acc.build();
    expect(at(out, 10, 10)).toBe(at(now, 10, 10)); // taken from the views
    expect(at(out, 55, 35)).toBe(at(old, 55, 35)); // the old scan
    expect(at(out, 55, 35, 1)).toBeGreaterThan(60); // not the red car
  });

  it("keeps the old scan where a candidate blob recurs, not where it appears once", () => {
    const acc = new ScanAccumulator(old);
    for (let k = 0; k < 3; k++) {
      acc.markCandidate(48, 28, 62, 42); // the car, every frame
      if (k === 0) acc.markCandidate(10, 60, 20, 70); // noise, once
      acc.add(cv, now, I);
    }
    const out = acc.build();
    expect(at(out, 55, 35, 1)).toBeGreaterThan(60);
    expect(at(out, 15, 65)).toBe(at(now, 15, 65));
  });

  it("bakes the car in when nothing is excluded", () => {
    const acc = new ScanAccumulator(old);
    for (let k = 0; k < 3; k++) acc.add(cv, now, I);
    expect(at(acc.build(), 55, 35)).toBe(220);
  });
});
