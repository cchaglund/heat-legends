import { describe, expect, it } from "vitest";
import { apply, invert } from "./homography";

describe("homography", () => {
  it("invert undoes apply", () => {
    const h = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0002, -0.0001, 1];
    const p = { x: 412, y: 233 };
    const q = apply(invert(h), apply(h, p));
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(q.y).toBeCloseTo(p.y, 6);
  });
});
