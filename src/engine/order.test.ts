import { describe, expect, it } from "vitest";
import { raceOrder } from "./order";
import { syntheticAnnotation } from "./synthetic";
import { deriveTrack } from "./track";

const track = deriveTrack(syntheticAnnotation(40, [{ after: 19, speedLimit: 3, legendsAfter: 14 }]));

describe("raceOrder", () => {
  it.each([
    ["leader first", { red: { space: 3, spot: 0 }, blue: { space: 9, spot: 1 }, green: { space: 5, spot: 0 } }, ["blue", "green", "red"]],
    ["same space: raceline spot first", { red: { space: 7, spot: 1 }, blue: { space: 7, spot: 0 } }, ["blue", "red"]],
    ["empty board", {}, []],
    // D17: lap-unaware. A car that wrapped to space 1 counts as last.
    ["wrap counts as behind (known limitation)", { red: { space: 1, spot: 0 }, blue: { space: 38, spot: 0 } }, ["blue", "red"]],
  ] as const)("%s", (_, board, order) => expect(raceOrder(track, board)).toEqual(order));
});
