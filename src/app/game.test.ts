import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLegendCards } from "../engine";
import type { LegendMove } from "../engine";
import {
  allLegendsMoved,
  canStart,
  canUndo,
  cycleRole,
  defaultRoles,
  deserialize,
  inPlayOf,
  legendsOf,
  newGame,
  recordMove,
  serialize,
  startNextRound,
  tapLegend,
  undo,
} from "./game";

const cards = parseLegendCards(JSON.parse(readFileSync(new URL("../../data/legend-cards.json", import.meta.url), "utf8")));
const rng = () => 0.42;
const roles = { ...defaultRoles(), green: "legend", red: "legend", silver: "out" } as const;
const move: LegendMove = { from: { space: 12, spot: 0 }, to: { space: 15, spot: 1 }, reason: "top speed" };

describe("roles", () => {
  it("start as human and cycle human → legend → out → human", () => {
    let r = defaultRoles();
    expect(canStart(r)).toBe(false);
    r = cycleRole(r, "blue");
    expect(r.blue).toBe("legend");
    expect(canStart(r)).toBe(true);
    r = cycleRole(cycleRole(r, "blue"), "blue");
    expect(r.blue).toBe("human");
  });

  it("lists Legends and cars in play", () => {
    expect(legendsOf(roles)).toEqual(["red", "green"]);
    expect(inPlayOf(roles)).toEqual(["red", "blue", "green", "yellow", "black"]);
  });

  it("refuses a game without a Legend", () => {
    expect(() => newGame("france", defaultRoles(), cards)).toThrow();
  });
});

describe("round flow", () => {
  it("reveals the card on the first Legend tap only", () => {
    let g = newGame("france", roles, cards, rng);
    expect(g.deck.round).toBe(1);
    expect(g.deck.card).toBeNull();
    g = tapLegend(g, "green", rng);
    const card = g.deck.card;
    expect(card).not.toBeNull();
    const again = tapLegend(g, "red", rng);
    expect(again).toBe(g); // no new undo step
    expect(tapLegend(g, "blue", rng)).toBe(g); // a human car isn't a Legend
    g = startNextRound(g);
    expect(g.deck.card).toBeNull();
    expect(tapLegend(g, "red", rng).deck.card?.id).not.toBe(card!.id);
  });

  it("records a move and remembers positions", () => {
    let g = tapLegend(newGame("france", roles, cards, rng), "green", rng);
    g = recordMove(g, "green", move, { green: move.from, blue: { space: 15, spot: 0 } });
    expect(g.positions).toEqual({ green: move.to, blue: { space: 15, spot: 0 } });
    expect(g.log).toEqual([{ round: 1, colour: "green", ...move }]);
    // A partial view merges; a hand placement of every car replaces.
    const merged = recordMove(g, "red", { ...move, from: { space: 3, spot: 0 } }, { red: { space: 3, spot: 0 } });
    expect(Object.keys(merged.positions).sort()).toEqual(["blue", "green", "red"]);
    const replaced = recordMove(g, "red", move, { red: move.from }, true);
    expect(Object.keys(replaced.positions)).toEqual(["red"]);
  });

  it("undoes one action at a time back to the start", () => {
    const g0 = newGame("france", roles, cards, rng);
    const g1 = startNextRound(g0);
    const g2 = tapLegend(g1, "green", rng);
    expect(g0.deck.round).toBe(1); // a race starts in round 1, with no undo step before it
    const g3 = recordMove(g2, "green", move, {});
    expect(undo(g3)).toEqual(g2);
    expect(undo(undo(g3))).toEqual(g1);
    expect(undo(undo(undo(g3)))).toEqual(g0);
    expect(canUndo(g0)).toBe(false);
    expect(undo(g0)).toBe(g0);
  });

  it("unlocks Next round once every Legend has a recorded move this round", () => {
    let g = newGame("france", roles, cards, rng);
    expect(allLegendsMoved(g)).toBe(false);
    g = recordMove(tapLegend(g, "green", rng), "green", move, {});
    expect(allLegendsMoved(g)).toBe(false);
    expect(tapLegend(g, "red", rng)).toBe(g); // a tap alone isn't a move
    g = recordMove(g, "red", move, {});
    expect(allLegendsMoved(g)).toBe(true);
    expect(allLegendsMoved(startNextRound(g))).toBe(false);
  });

  it("a mistapped Next round costs no card once undone", () => {
    const g = tapLegend(newGame("france", roles, cards, rng), "green", rng);
    const pile = g.deck.drawPile.length;
    const back = undo(startNextRound(g));
    expect(back.deck.card).toEqual(g.deck.card);
    expect(back.deck.drawPile.length).toBe(pile);
  });
});

describe("persistence", () => {
  it("round-trips through JSON", () => {
    const g = recordMove(tapLegend(newGame("france", roles, cards, rng), "green", rng), "green", move, {});
    expect(deserialize(serialize(g))).toEqual(g);
    expect(undo(deserialize(serialize(g))!)).toEqual(undo(g));
  });

  it("rejects missing, malformed or other-version data", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("{nope")).toBeNull();
    expect(deserialize(JSON.stringify({ v: 99, game: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ v: 1, game: { trackId: "france" } }))).toBeNull();
  });
});
