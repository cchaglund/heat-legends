import { describe, expect, it } from "vitest";
import { syntheticAnnotation } from "./synthetic";
import { cornersAhead, deriveTrack, diamondOf, positionAtPoint, spaceAtPoint, spaceLabel, spotCenter } from "./track";
import type { TrackAnnotation } from "./types";

const ann = () =>
  syntheticAnnotation(40, [
    { after: 19, speedLimit: 3, legendsAfter: 14 },
    { after: 1, speedLimit: 4, legendsAfter: 35 }, // Legends Line wraps past space 0
  ]);

describe("deriveTrack", () => {
  it("turns boundary tags into corners (sorted by boundary) with their Legends Lines", () => {
    const t = deriveTrack(ann());
    expect(t.spaces).toHaveLength(40);
    expect(t.corners).toEqual([
      { after: 1, speedLimit: 4, legendsAfter: 35 },
      { after: 19, speedLimit: 3, legendsAfter: 14 },
    ]);
  });

  it("splits each space into spots, raceline spot first", () => {
    const a = ann();
    a.boundaries[5].raceline = "b";
    const t = deriveTrack(a);
    const [b5, b6] = [a.boundaries[5], a.boundaries[6]];
    expect(t.spaces[5].quad).toEqual([b5.a, b5.b, b6.b, b6.a]);
    expect(t.spaces[5].spots[0].polygon[1]).toEqual(b5.b); // b side half
    expect(t.spaces[4].spots[0].polygon[0]).toEqual(a.boundaries[4].a); // a side half
    expect(t.spaces[5].spots.map((s) => s.id)).toEqual(["5-0", "5-1"]);
    // Last space closes the loop onto boundary 0.
    expect(t.spaces[39].quad[2]).toEqual(a.boundaries[0].b);
  });

  it("records the finish line", () => {
    const a = ann();
    a.boundaries[0].tags = [{ kind: "finish" }];
    expect(deriveTrack(a).finishAfter).toBe(39);
  });

  const broken: Array<[string, (a: TrackAnnotation) => void, RegExp]> = [
    ["no corners", (a) => a.boundaries.forEach((b) => (b.tags = undefined)), /no corners/],
    ["corner without Legends Line", (a) => (a.boundaries[15].tags = undefined), /no Legends Line/],
    ["Legends Line closer than diamond 3", (a) => {
      a.boundaries[15].tags = undefined;
      a.boundaries[18].tags = [{ kind: "legends" }];
    }, /closer than diamond 3/],
    ["too few boundaries", (a) => (a.boundaries = a.boundaries.slice(0, 1)), /at least 2/],
  ];
  it.each(broken)("refuses %s", (_, edit, err) => {
    const a = ann();
    edit(a);
    expect(() => deriveTrack(a)).toThrow(err);
  });

  it("accepts a Legends Line exactly before diamond 3", () => {
    const t = deriveTrack(syntheticAnnotation(20, [{ after: 9, speedLimit: 2, legendsAfter: 5 }]));
    expect(t.corners[0].legendsAfter).toBe(5);
  });
});

describe("cornersAhead / spaceLabel", () => {
  const t = deriveTrack(ann());
  it("measures to diamond 0, nearest first, with a wrapped second lap", () => {
    expect(cornersAhead(t, 19).map((c) => c.distance)).toEqual([0, 22, 40, 62]);
    expect(cornersAhead(t, 20).map((c) => c.distance)).toEqual([21, 39, 61, 79]);
  });
  it.each([
    [19, "diamond 0 (space 19)"],
    [16, "diamond 3 (space 16)"],
    [15, "space 15"],
    [20, "space 20"],
    [39, "diamond 2 (space 39)"],
  ])("space %i → %s", (space, label) => expect(spaceLabel(t, space)).toBe(label));
  it("gives the diamond only in front of a Corner Line", () => {
    expect([19, 16, 15, 39].map((s) => diamondOf(t, s))).toEqual([0, 3, null, 2]);
  });
});

describe("spaceAtPoint", () => {
  it("finds the space under a point on the ring, and -1 off the track", () => {
    const t = deriveTrack(ann());
    // ring of radius 300–400 around (500, 500); space 0 starts at angle 0
    const a = (2 * Math.PI * 0.5) / 40;
    expect(spaceAtPoint(t, 500 + 350 * Math.cos(a), 500 + 350 * Math.sin(a))).toBe(0);
    expect(spaceAtPoint(t, 500, 500)).toBe(-1);
    expect(spaceAtPoint(t, 950, 500)).toBe(-1);
  });
});

describe("positionAtPoint / spotCenter", () => {
  it("raceline side a = outer half of the ring is spot 0", () => {
    const t = deriveTrack(ann());
    const a = (2 * Math.PI * 0.5) / 40;
    const at = (r: number) => positionAtPoint(t, 500 + r * Math.cos(a), 500 + r * Math.sin(a));
    expect(at(380)).toEqual({ space: 0, spot: 0 });
    expect(at(320)).toEqual({ space: 0, spot: 1 });
    expect(at(200)).toBeNull();
    for (const spot of [0, 1] as const) expect(positionAtPoint(t, spotCenter(t, { space: 7, spot }).x, spotCenter(t, { space: 7, spot }).y)).toEqual({ space: 7, spot });
  });
});
