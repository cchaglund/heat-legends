// Race order, leader first, for the future app-driven turn order (D6).
// Lap-unaware (D17): a car's progress is just its space index, so a car that has
// crossed space N-1 → 0 counts as last until laps are tracked. Callers that care
// must handle the wrap themselves.
import type { Board, CarColor, Track } from "./types";

export function raceOrder(_track: Track, board: Board): CarColor[] {
  return (Object.entries(board) as Array<[CarColor, NonNullable<Board[CarColor]>]>)
    .filter(([, p]) => p !== undefined)
    .sort(([, p], [, q]) => q.space - p.space || p.spot - q.spot)
    .map(([c]) => c);
}
