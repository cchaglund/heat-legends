// The move as the player acts on it (D40): the diamond to put the Legend on
// and how many spaces that is. Space numbers exist only in the annotation, not
// on the printed board, so they're left out everywhere a player reads a move.
import { diamondOf, forwardDistance } from "../engine";
import type { CarColor, Position, Track } from "../engine";
import { CAR_HEX, carName } from "./colours";

type Move = { from: Position; to: Position };

/** "Diamond 2" + 3, "5 spaces", or "stays put"; `steps` is shown next to a diamond. */
export function moveSummary(track: Track, m: Move): { text: string; steps?: number } {
  const steps = forwardDistance(track, m.from.space, m.to.space);
  if (steps === 0) return { text: "stays put" };
  const diamond = diamondOf(track, m.to.space);
  return diamond === null ? { text: `${steps} ${steps === 1 ? "space" : "spaces"}` } : { text: `Diamond ${diamond}`, steps };
}

/** "→ Diamond 2 (+3)" as one line of text (Legend buttons, history). */
export function moveText(track: Track, m: Move): string {
  const s = moveSummary(track, m);
  return s.text === "stays put" ? s.text : `→ ${s.text}${s.steps ? ` (+${s.steps})` : ""}`;
}

/** The car's name on a block of its colour, like the Legend buttons: yellow
 *  and silver text alone would vanish on white. */
export function CarTag({ colour }: { colour: CarColor }) {
  return (
    <span class="car-tag" style={{ background: CAR_HEX[colour], color: colour === "black" ? "#fff" : "#111" }}>
      {carName(colour)}
    </span>
  );
}

export function MoveHeadline({ track, legend, move }: { track: Track; legend: CarColor; move: Move }) {
  const s = moveSummary(track, move);
  return (
    <div class="move-headline">
      <p>
        <CarTag colour={legend} /> {s.text === "stays put" ? s.text : "→ " + s.text}
        {s.steps !== undefined && <span class="move-count"> (+{s.steps})</span>}
      </p>
      {move.to.spot === 1 && <small>Outer spot: the inner one is taken.</small>}
    </div>
  );
}
