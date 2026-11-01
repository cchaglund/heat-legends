import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newDeck, nextRound, parseLegendCards, revealCard, shuffle } from "./deck";

const cards = parseLegendCards(JSON.parse(readFileSync(new URL("../../data/legend-cards.json", import.meta.url), "utf8")));

// Deterministic RNG (mulberry32).
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ids = (cs: { id: number }[]) => cs.map((c) => c.id);

describe("deck", () => {
  it("parses all 10 cards from data/legend-cards.json", () => {
    expect(ids(cards)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cards[0].cars.silver).toEqual([11, 0]);
  });

  it.each([
    ["no cards", {}],
    ["bad diamond", { cards: [{ id: 1, cars: { ...cards[0].cars, red: [12, 4] } }] }],
    ["missing colour", { cards: [{ id: 1, cars: { red: [12, 1] } }] }],
  ])("rejects %s", (_, raw) => expect(() => parseLegendCards(raw)).toThrow());

  it("shuffle is a permutation and depends only on the RNG", () => {
    const s = shuffle(cards, rng(1));
    expect(ids(s).sort((a, b) => a - b)).toEqual(ids(cards));
    expect(ids(shuffle(cards, rng(1)))).toEqual(ids(s));
    expect(ids(shuffle(cards, rng(2)))).not.toEqual(ids(s));
  });

  it("starts at round 0 with no card", () => {
    const d = newDeck(cards, rng(1));
    expect(d.round).toBe(0);
    expect(d.card).toBeNull();
    expect(d.drawPile).toHaveLength(10);
  });

  it("reveals one card per round, only on the first Legend tap", () => {
    let d = nextRound(newDeck(cards, rng(1)));
    const top = d.drawPile[0];
    d = revealCard(d);
    expect(d.card).toBe(top);
    expect(d.drawPile).toHaveLength(9);
    expect(revealCard(d)).toBe(d); // second tap: same card, nothing drawn
    d = nextRound(d);
    expect(d.round).toBe(2);
    expect(d.card).toBeNull();
    expect(d.drawPile).toHaveLength(9);
  });

  it("[Next round] without a Legend tap burns no card", () => {
    const d = nextRound(nextRound(nextRound(newDeck(cards, rng(1)))));
    expect(d.round).toBe(3);
    expect(d.drawPile).toHaveLength(10);
  });

  it("deals all 10 cards once, then reshuffles all 10 (D4)", () => {
    let d = newDeck(cards, rng(3));
    const seen: number[] = [];
    for (let r = 0; r < 10; r++) {
      d = revealCard(nextRound(d), rng(9));
      seen.push(d.card!.id);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(ids(cards));
    expect(d.drawPile).toHaveLength(0);
    d = revealCard(nextRound(d), rng(4));
    expect(d.round).toBe(11);
    expect(d.card).not.toBeNull();
    expect(d.drawPile).toHaveLength(9);
  });

  it("states are immutable, so undo = keep the previous state", () => {
    const before = nextRound(newDeck(cards, rng(1)));
    const after = revealCard(before);
    expect(before.card).toBeNull();
    expect(before.drawPile).toHaveLength(10);
    expect(after).not.toBe(before);
  });
});
