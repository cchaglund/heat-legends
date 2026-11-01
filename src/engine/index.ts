// Rules engine: pure TypeScript, no DOM, no Node APIs. Runs anywhere.
export * from "./types";
export { deriveTrack, cornersAhead, forwardDistance, spaceAt, spaceLabel } from "./track";
export { resolveLegendMove } from "./move";
export { newDeck, nextRound, revealCard, shuffle, parseLegendCards } from "./deck";
export type { DeckState, Rng } from "./deck";
export { raceOrder } from "./order";
