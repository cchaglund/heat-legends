// The Legends deck as an immutable state machine (D4, D6): [Next round] only
// bumps the round; the card is drawn on the first Legend tap of a round, so a
// stray [Next round] or a round with no Legend move never burns a card.
// Immutable states make undo a matter of keeping the previous one.
import type { CarColor, LegendCard } from "./types";
import { CAR_COLORS } from "./types";

export type Rng = () => number; // [0, 1), like Math.random

export type DeckState = {
  round: number; // 0 before the first [Next round]
  card: LegendCard | null; // this round's card, once revealed
  drawPile: LegendCard[]; // top of the deck first
  all: LegendCard[];
};

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newDeck(cards: readonly LegendCard[], rng: Rng = Math.random): DeckState {
  return { round: 0, card: null, drawPile: shuffle(cards, rng), all: [...cards] };
}

export function nextRound(deck: DeckState): DeckState {
  return { ...deck, round: deck.round + 1, card: null };
}

/** Called on every Legend tap. Only the first tap of a round draws; an empty
 *  deck is reshuffled from all cards first. */
export function revealCard(deck: DeckState, rng: Rng = Math.random): DeckState {
  if (deck.card) return deck;
  const pile = deck.drawPile.length > 0 ? deck.drawPile : shuffle(deck.all, rng);
  const [card, ...rest] = pile;
  return { ...deck, round: Math.max(deck.round, 1), card, drawPile: rest };
}

/** Validates data/legend-cards.json. */
export function parseLegendCards(raw: unknown): LegendCard[] {
  const cards = (raw as { cards?: unknown })?.cards;
  if (!Array.isArray(cards) || cards.length === 0) throw new Error("legend cards: missing cards[]");
  return cards.map((c: any) => {
    if (typeof c?.id !== "number") throw new Error("legend cards: card without id");
    for (const colour of CAR_COLORS as readonly CarColor[]) {
      const v = c.cars?.[colour];
      if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => Number.isInteger(x)) || v[1] < 0 || v[1] > 3)
        throw new Error(`legend cards: card ${c.id} has bad values for ${colour}`);
    }
    return { id: c.id, cars: c.cars };
  });
}
