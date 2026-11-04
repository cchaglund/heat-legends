// The race as one immutable value plus pure transitions (D6, D23). The UI only
// calls these and stores the result, so undo is "go back to the previous
// value" and persistence is "serialize the current value". Every transition
// that changes something pushes the previous state onto `history`.
import { newDeck, nextRound, revealCard, CAR_COLORS } from "../engine";
import type { Board, CarColor, DeckState, LegendCard, LegendMove, Position, Rng } from "../engine";

export type Role = "human" | "legend" | "out";
export type Roles = Record<CarColor, Role>;
const ROLE_CYCLE: Role[] = ["human", "legend", "out"];

export type LogEntry = { round: number; colour: CarColor; from: Position; to: Position; reason: string };

type Core = {
  trackId: string;
  roles: Roles;
  deck: DeckState;
  positions: Board; // last known position of every car
  log: LogEntry[];
};
export type GameState = Core & { history: Core[] };

const HISTORY_LIMIT = 100;

// --- Roles (D7, D31)
export const defaultRoles = (): Roles => Object.fromEntries(CAR_COLORS.map((c) => [c, "human"])) as Roles;

export function cycleRole(roles: Roles, colour: CarColor): Roles {
  const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(roles[colour]) + 1) % ROLE_CYCLE.length];
  return { ...roles, [colour]: next };
}

export const legendsOf = (roles: Roles): CarColor[] => CAR_COLORS.filter((c) => roles[c] === "legend");
export const inPlayOf = (roles: Roles): CarColor[] => CAR_COLORS.filter((c) => roles[c] !== "out");
export const canStart = (roles: Roles): boolean => legendsOf(roles).length > 0;

// --- Transitions
/** A new race starts in round 1 with its card on the table (D38, D39). */
export function newGame(trackId: string, roles: Roles, cards: readonly LegendCard[], rng?: Rng): GameState {
  if (!canStart(roles)) throw new Error("at least one Legend is required");
  return { trackId, roles, deck: revealCard(nextRound(newDeck(cards, rng)), rng), positions: {}, log: [], history: [] };
}

function push(g: GameState, next: Partial<Core>): GameState {
  const { history, ...core } = g;
  return { ...core, ...next, history: [...history, core].slice(-HISTORY_LIMIT) };
}

/** Each round's card is drawn as the round starts (D39). Undoing a mistapped
 *  Next round puts the card back, since undo restores the whole deck. */
export const startNextRound = (g: GameState, rng?: Rng): GameState => push(g, { deck: revealCard(nextRound(g.deck), rng) });

/** A Legend button tap. Rounds now start with their card, so this only draws
 *  for a race saved before D39. Otherwise it changes nothing and leaves no undo step. */
export function tapLegend(g: GameState, colour: CarColor, rng?: Rng): GameState {
  if (g.roles[colour] !== "legend" || g.deck.card) return g;
  return push(g, { deck: revealCard(g.deck, rng) });
}

/** Records a shown move. `board` is what was seen: merged into the known
 *  positions (a camera sees only part of the track), or replacing them when
 *  the user placed every car by hand. The Legend ends on `move.to`. */
export function recordMove(g: GameState, colour: CarColor, move: LegendMove, board: Board, replace = false): GameState {
  const positions = { ...(replace ? {} : g.positions), ...board, [colour]: move.to };
  const entry: LogEntry = { round: g.deck.round, colour, from: move.from, to: move.to, reason: move.reason };
  return push(g, { positions, log: [...g.log, entry] });
}

/** Legends with a recorded move this round. A tap that was cancelled doesn't count. */
export const movedThisRound = (g: GameState): Set<CarColor> =>
  new Set(g.log.filter((e) => e.round === g.deck.round).map((e) => e.colour));

/** Next round is offered once every Legend has moved (D38); before that only as "anyway". */
export const allLegendsMoved = (g: GameState): boolean => {
  const moved = movedThisRound(g);
  return legendsOf(g.roles).every((c) => moved.has(c));
};

export const canUndo = (g: GameState): boolean => g.history.length > 0;

export function undo(g: GameState): GameState {
  if (!canUndo(g)) return g;
  const prev = g.history[g.history.length - 1];
  return { ...prev, history: g.history.slice(0, -1) };
}

// --- Persistence (D23)
const VERSION = 1;

export const serialize = (g: GameState): string => JSON.stringify({ v: VERSION, game: g });

/** The saved game, or null when it is missing, from another version or malformed. */
export function deserialize(text: string | null): GameState | null {
  if (!text) return null;
  try {
    const { v, game } = JSON.parse(text);
    const ok =
      v === VERSION &&
      typeof game?.trackId === "string" &&
      CAR_COLORS.every((c) => ROLE_CYCLE.includes(game.roles?.[c])) &&
      Array.isArray(game.deck?.drawPile) &&
      Array.isArray(game.deck?.all) &&
      typeof game.deck?.round === "number" &&
      typeof game.positions === "object" &&
      Array.isArray(game.log) &&
      Array.isArray(game.history);
    return ok ? (game as GameState) : null;
  } catch {
    return null;
  }
}
