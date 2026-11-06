// The Legends movement rules (02-how-it-works.md). Everything is distance
// arithmetic from the car's own space: first pick a nominal distance (rule A or
// B), cap it at the second corner, then walk back to a free spot (D13).
//
// Readings of the rulebook encoded here (see also move.test.ts):
// - A Corner Line is "crossed" only when the car ends beyond it. Ending on
//   diamond 0 (the space touching the line) is not crossing.
// - "Past the Legends Line" = the car's space is between the Legends Line and
//   the next Corner Line, diamond 0 included.
// - The 2-corner cap is the same as aiming at diamond 0 of the second corner,
//   then applying D13, which yields "the first space with a free spot before
//   the second Corner Line".
// - D28 defence: a nominal distance below 0 becomes 0, and the walk back stops
//   at the car's own space, where it keeps its spot.
import { cornersAhead, forwardDistance, spaceAt } from "./track";
import type { Board, CarColor, LegendCard, LegendMove, SpotIndex, Track } from "./types";

export function resolveLegendMove(track: Track, board: Board, colour: CarColor, card: LegendCard): LegendMove {
  const from = board[colour];
  if (!from) throw new Error(`${colour} is not on the board`);
  const [topSpeed, diamond] = card.cars[colour];
  const [next, second] = cornersAhead(track, from.space);

  let steps: number;
  let why: string;
  const pastLegends = next.distance < forwardDistance(track, next.corner.legendsAfter, next.corner.after);
  if (pastLegends) {
    steps = next.corner.speedLimit + diamond;
    why = `Past Legends Line: speed limit ${next.corner.speedLimit} + diamond ${diamond} = ${steps}`;
  } else if (topSpeed <= next.distance) {
    steps = topSpeed;
    why = `Behind Legends Line: top speed ${topSpeed}`;
  } else {
    steps = Math.max(0, next.distance - diamond);
    why = `Behind Legends Line: top speed ${topSpeed} would cross the corner line (limit ${next.corner.speedLimit}), so diamond ${diamond}`;
  }
  if (steps > second.distance) {
    steps = second.distance;
    why += `, but that would cross 2 corner lines, so stop before the second`;
  }

  // The reason explains in board terms only (D40): space numbers aren't printed
  // on the board, and the target itself is the headline.
  for (let k = steps; k > 0; k--) {
    const space = spaceAt(track, from.space, k);
    const spot = freeSpot(board, colour, space);
    if (spot === undefined) continue;
    const back = steps - k;
    const full = back === 0 ? "" : back === 1 ? "; that space is full, so 1 back" : `; ${back} spaces in a row are full, so ${back} back`;
    return { from, to: { space, spot }, reason: `${why}${full}.` };
  }
  const full = steps > 0 ? "; every space up to there is full" : "";
  return { from, to: from, reason: `${why}${full}, so it stays put.` };
}

// D13: raceline spot if both are free, else the free one. The mover's own spot counts as free.
function freeSpot(board: Board, mover: CarColor, space: number): SpotIndex | undefined {
  const taken = new Set<SpotIndex>();
  for (const [c, p] of Object.entries(board)) if (c !== mover && p && p.space === space) taken.add(p.spot);
  return !taken.has(0) ? 0 : !taken.has(1) ? 1 : undefined;
}
