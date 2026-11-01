import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLegendCards } from "./deck";
import { resolveLegendMove } from "./move";
import { raceOrder } from "./order";
import { syntheticAnnotation } from "./synthetic";
import { deriveTrack } from "./track";
import type { Board, CarColor, LegendCard, Position, Track } from "./types";
import { CAR_COLORS } from "./types";

// 40 spaces. Corner (limit 3) after space 19: diamonds 0–3 = spaces 19..16,
// Legends Line after 14 (spaces 15..19 are past it). Corner (limit 5) after 34,
// Legends Line after 29.
const track = deriveTrack(
  syntheticAnnotation(40, [
    { after: 19, speedLimit: 3, legendsAfter: 14 },
    { after: 34, speedLimit: 5, legendsAfter: 29 },
  ]),
);

// Chicane: corner (limit 6) after 19, then corner (limit 2) after 23 whose
// Legends Line coincides with the first Corner Line. Lets rule A cross both.
const chicane = deriveTrack(
  syntheticAnnotation(30, [
    { after: 19, speedLimit: 6, legendsAfter: 14 },
    { after: 23, speedLimit: 2, legendsAfter: 19 },
  ]),
);

const cards = parseLegendCards(JSON.parse(readFileSync(new URL("../../data/legend-cards.json", import.meta.url), "utf8")));

// A card where `colour` has [topSpeed, diamond]; other colours get [10, 0].
function card(colour: CarColor, topSpeed: number, diamond: number): LegendCard {
  const cars = Object.fromEntries(CAR_COLORS.map((c) => [c, [10, 0] as const])) as LegendCard["cars"];
  return { id: 0, cars: { ...cars, [colour]: [topSpeed, diamond] } };
}

const at = (space: number, spot: 0 | 1 = 0): Position => ({ space, spot });
const full = (space: number): Board => ({ black: at(space, 0), silver: at(space, 1) });

describe("rulebook example (legends-example.png), card 4, corner limit 3", () => {
  it("moves Green, Red, Blue, Yellow in race order", () => {
    const card4 = cards.find((c) => c.id === 4)!;
    expect(card4.cars.green).toEqual([15, 2]);
    expect(card4.cars.red).toEqual([13, 1]);
    expect(card4.cars.blue).toEqual([18, 3]);
    expect(card4.cars.yellow).toEqual([11, 0]);

    const board: Board = { green: at(16), red: at(15), blue: at(5), yellow: at(0) };
    expect(raceOrder(track, board)).toEqual(["green", "red", "blue", "yellow"]);
    const moves: Record<string, ReturnType<typeof resolveLegendMove>> = {};
    for (const colour of raceOrder(track, board)) {
      moves[colour] = resolveLegendMove(track, board, colour, card4);
      board[colour] = moves[colour].to;
    }

    // Green: past the line, 3 + 2 = 5, clears the corner (line after 19).
    expect(moves.green.to).toEqual(at(21));
    expect(moves.green.reason).toBe("Past Legends Line: speed limit 3 + diamond 2 = 5 → space 21");
    // Red: past the line, 3 + 1 = 4, ends on diamond 0: does not clear.
    expect(moves.red.to).toEqual(at(19));
    expect(moves.red.reason).toBe("Past Legends Line: speed limit 3 + diamond 1 = 4 → diamond 0 (space 19)");
    // Blue: behind the line, 18 would cross → diamond 3 (Green has left it).
    expect(moves.blue.to).toEqual(at(16));
    expect(moves.blue.reason).toBe(
      "Behind Legends Line: top speed 18 would cross the corner line (limit 3), so diamond 3 → diamond 3 (space 16)",
    );
    // Yellow: behind the line, 11 fits → moves 11.
    expect(moves.yellow.to).toEqual(at(11));
    expect(moves.yellow.reason).toBe("Behind Legends Line: top speed 11 → space 11");
  });
});

type Case = {
  name: string;
  track?: Track;
  from: Position;
  card: [number, number]; // green's [topSpeed, diamond]
  others?: Board;
  to: Position;
  reason?: RegExp;
};

const cases: Case[] = [
  // Rule B
  { name: "B: top speed ending on diamond 0 is not crossing", from: at(5), card: [14, 2], to: at(19), reason: /top speed 14 → diamond 0 \(space 19\)/ },
  { name: "B: one more would cross → diamond space", from: at(5), card: [15, 2], to: at(17), reason: /would cross.*→ diamond 2 \(space 17\)/ },
  { name: "B: diamond 0 is the space touching the line", from: at(5), card: [19, 0], to: at(19) },
  { name: "B: on the Legends Line's near side counts as behind", from: at(14), card: [10, 1], to: at(18), reason: /^Behind/ },
  { name: "B: wraps around the loop", from: at(38), card: [12, 0], to: at(10), reason: /top speed 12 → space 10/ },
  { name: "B: second corner, diamond 1", from: at(25), card: [10, 1], to: at(33), reason: /limit 5.*diamond 1 \(space 33\)/ },
  // Rule A
  { name: "A: first space past the Legends Line", from: at(15), card: [19, 0], to: at(18), reason: /^Past.*speed limit 3 \+ diamond 0 = 3/ },
  { name: "A: from diamond 0 itself", from: at(19), card: [19, 3], to: at(25), reason: /= 6 → space 25/ },
  { name: "A: second corner uses its own speed limit", from: at(31), card: [10, 2], to: at(38), reason: /speed limit 5 \+ diamond 2 = 7/ },
  // D13 full spaces
  { name: "D13: raceline spot taken → the other spot", from: at(16), card: [10, 2], others: { red: at(21, 0) }, to: at(21, 1) },
  { name: "D13: other spot taken → raceline", from: at(16), card: [10, 2], others: { red: at(21, 1) }, to: at(21, 0) },
  { name: "D13: A target full → back one", from: at(16), card: [10, 2], others: full(21), to: at(20), reason: /space 21 full → space 20$/ },
  { name: "D13: A full walk-back can fall short of the corner", from: at(17), card: [10, 0], others: { ...full(20), red: at(19, 1) }, to: at(19, 0), reason: /space 20 full → diamond 0 \(space 19\)$/ },
  { name: "D13: B top speed target full", from: at(0), card: [11, 0], others: full(11), to: at(10), reason: /space 11 full → space 10$/ },
  { name: "D13: B diamond full → next diamond back", from: at(5), card: [18, 2], others: full(17), to: at(16), reason: /diamond 2 \(space 17\) full → diamond 3 \(space 16\)$/ },
  { name: "D13: several full spaces in a row", from: at(5), card: [18, 0], others: { ...full(19), red: at(18, 0), blue: at(18, 1) }, to: at(17) },
  // Only 6 colours exist, so use a short (synthetic) top speed of 2.
  { name: "D13: all full up to own space → stays in own spot", from: at(0, 1), card: [2, 0], others: { ...full(2), red: at(1, 0), blue: at(1, 1), yellow: at(0, 0) }, to: at(0, 1), reason: /space 2 full → stays on space 0$/ },
  // 2-corner cap
  { name: "cap: crossing 2 lines → diamond 0 of the second", track: chicane, from: at(17), card: [10, 1], to: at(23), reason: /cross 2 corner lines.*→ diamond 0 \(space 23\)$/ },
  { name: "cap: exactly reaching diamond 0 of the second is allowed", track: chicane, from: at(17), card: [10, 0], to: at(23), reason: /^(?!.*2 corner lines)/ },
  { name: "cap + D13: second corner's diamond 0 full → first free before it", track: chicane, from: at(17), card: [10, 3], others: full(23), to: at(22), reason: /diamond 0 \(space 23\) full → diamond 1 \(space 22\)$/ },
  { name: "cap + D13: one spot left on diamond 0", track: chicane, from: at(16), card: [10, 3], others: { red: at(23, 0) }, to: at(23, 1) },
];

describe("resolveLegendMove", () => {
  it.each(cases)("$name", (c) => {
    const board: Board = { green: c.from, ...c.others };
    const move = resolveLegendMove(c.track ?? track, board, "green", card("green", ...c.card));
    expect(move.from).toEqual(c.from);
    expect(move.to).toEqual(c.to);
    if (c.reason) expect(move.reason).toMatch(c.reason);
  });

  it("D28 defence: never moves behind its own space on a bad track", () => {
    // Legends Line only 2 spaces before the corner: a car on space 17 is "behind"
    // it, and diamond 3 would be behind the car.
    const bad: Track = { ...track, corners: [{ after: 19, speedLimit: 3, legendsAfter: 17 }] };
    const move = resolveLegendMove(bad, { green: at(17, 1) }, "green", card("green", 10, 3));
    expect(move.to).toEqual(at(17, 1));
    expect(move.reason).toMatch(/stays on diamond 2 \(space 17\)$/);
  });

  it("throws for a colour not on the board", () => {
    expect(() => resolveLegendMove(track, {}, "green", card("green", 10, 0))).toThrow(/not on the board/);
  });
});
