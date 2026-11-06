// The move as the player acts on it (D40): the diamond to put the Legend on
// and how many spaces that is. Space numbers exist only in the annotation, not
// on the printed board, so they're left out.
import { diamondOf, forwardDistance } from "../engine";
import type { CarColor, LegendMove, Track } from "../engine";
import { CAR_HEX, carName } from "./colours";

/** The car's name on a block of its colour, like the Legend buttons: yellow
 *  and silver text alone would vanish on white. */
export function CarTag({ colour }: { colour: CarColor }) {
  return (
    <span class="car-tag" style={{ background: CAR_HEX[colour], color: colour === "black" ? "#fff" : "#111" }}>
      {carName(colour)}
    </span>
  );
}

export function MoveHeadline({ track, legend, move }: { track: Track; legend: CarColor; move: LegendMove }) {
  const steps = forwardDistance(track, move.from.space, move.to.space);
  const diamond = diamondOf(track, move.to.space);
  return (
    <div class="move-headline">
      <p>
        <CarTag colour={legend} />{" "}
        {steps === 0 ? (
          "stays put"
        ) : diamond === null ? (
          `→ ${steps} ${steps === 1 ? "space" : "spaces"}`
        ) : (
          <>
            → Diamond {diamond} <span class="move-count">(+{steps})</span>
          </>
        )}
      </p>
      {move.to.spot === 1 && <small>Outer spot: the inner one is taken.</small>}
    </div>
  );
}
