// The round flow (D6, D38, D39): the user walks the race order, tapping each
// Legend's button when its turn comes. [Next round] is dashed and names who
// is still to move until every Legend has moved, then solid; it works either
// way. Each round starts with its card drawn; every change can be undone.
import { useState } from "preact/hooks";
import { spaceLabel } from "../../engine";
import type { CarColor } from "../../engine";
import { allLegendsMoved, canUndo, legendsOf, movedThisRound, startNextRound, tapLegend, undo } from "../game";
import type { LogEntry } from "../game";
import { CAR_HEX, carName } from "../colours";
import { game, update } from "../store";
import { trackById } from "../tracks";
import { Swatch } from "../Swatch";
import { About } from "../About";

type Props = { onLegend: (legend: CarColor) => void; onEndRace: () => void; onRescan: () => void };

export function RaceScreen({ onLegend, onEndRace, onRescan }: Props) {
  const g = game.value!;
  const track = trackById(g.trackId)!.track;
  const [about, setAbout] = useState(false);
  const { round, card } = g.deck;
  const legends = legendsOf(g.roles);
  const label = (s: number) => spaceLabel(track, s);
  const moved = movedThisRound(g);
  const allMoved = allLegendsMoved(g);

  const tap = (c: CarColor) => {
    update((g) => tapLegend(g, c));
    onLegend(c);
  };

  return (
    <main class="screen race">
      <header class="race-bar">
        <div class="round">
          <small>Round</small>
          <b>{round || "–"}</b>
        </div>
        <button class="btn" disabled={!canUndo(g)} onClick={() => update(undo)}>Undo</button>
        <button class="btn icon" aria-label="Settings" onClick={() => setAbout(true)}>⋯</button>
      </header>

      <p class="race-help">
        {allMoved ? "All Legends have moved. Next round when everyone's done." : "When a Legend's turn comes, tap it to see where it moves."}
      </p>

      <section class="legends">
        {legends.map((c) => {
          const done = moved.has(c);
          return (
            <button
              key={c}
              class={`legend-btn ${done ? "moved" : "todo"}`}
              style={{ "--car": c === "black" ? "#8a8f96" : CAR_HEX[c] }}
              aria-label={`${carName(c)}${done ? ", moved this round" : ""}`}
              onClick={() => tap(c)}
            >
              {done && <Swatch colour={c} size={28} />}
              <span>
                <b>{carName(c)}</b>
                <small>{g.positions[c] ? label(g.positions[c]!.space) : "position unknown"}</small>
              </span>
            </button>
          );
        })}
      </section>

      <hr class="race-divider" />

      <button class={`btn wide big next-round ${allMoved ? "primary" : "pending"}`} onClick={() => update((g) => startNextRound(g))}>
        Next round ({round + 1})
        {!allMoved && <small>{listNames(legends.filter((c) => !moved.has(c)))} still to move</small>}
      </button>

      {card && (
        <details class="fold">
          <summary>Legend card {card.id}</summary>
          <table class="card-table">
            <thead>
              <tr><th /><th>Top speed</th><th>Diamond</th></tr>
            </thead>
            <tbody>
              {legends.map((c) => (
                <tr key={c}>
                  <td><Swatch colour={c} size={16} /> {carName(c)}</td>
                  <td>{card.cars[c][0]}</td>
                  <td>{card.cars[c][1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {g.log.length > 0 && (
        <details class="fold">
          <summary>Move history ({g.log.length})</summary>
          <ol class="log" reversed>
            {[...g.log].reverse().map((e, i) => (
              <LogLine key={g.log.length - i} entry={e} label={label} />
            ))}
          </ol>
        </details>
      )}

      {about && (
        <About
          onClose={() => setAbout(false)}
          onRescan={onRescan}
          onEndRace={() => {
            if (confirm("End this race? It can't be resumed afterwards.")) onEndRace();
          }}
        />
      )}
    </main>
  );
}

/** "Red", "Red and Yellow", "Red, Blue and Yellow". */
function listNames(cs: CarColor[]): string {
  const names = cs.map(carName);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function LogLine({ entry: e, label }: { entry: LogEntry; label: (s: number) => string }) {
  return (
    <li>
      <span class="log-head">
        <small>R{e.round}</small> <Swatch colour={e.colour} size={14} /> {carName(e.colour)} moved {label(e.from.space)} →{" "}
        {label(e.to.space)}
      </span>
      <small class="muted">{e.reason}</small>
    </li>
  );
}
