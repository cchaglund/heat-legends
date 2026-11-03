// The round flow (D6): the user walks the race order, tapping [Next round]
// and each Legend's button when its turn comes. The first Legend tap of a
// round reveals the card (D4); every change can be undone.
import { useState } from "preact/hooks";
import { spaceLabel } from "../../engine";
import type { CarColor } from "../../engine";
import { canUndo, legendsOf, startNextRound, tapLegend, undo } from "../game";
import type { LogEntry } from "../game";
import { CAR_HEX, carName } from "../colours";
import { game, update } from "../store";
import { trackById } from "../tracks";
import { Swatch } from "../Swatch";
import { About } from "../About";

type Props = { onLegend: (legend: CarColor) => void; onEndRace: () => void };

export function RaceScreen({ onLegend, onEndRace }: Props) {
  const g = game.value!;
  const track = trackById(g.trackId)!.track;
  const [about, setAbout] = useState(false);
  const { round, card } = g.deck;
  const legends = legendsOf(g.roles);
  const label = (s: number) => spaceLabel(track, s);
  const movedThisRound = new Set(g.log.filter((e) => e.round === round).map((e) => e.colour));

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

      <button class="btn primary wide big" onClick={() => update(startNextRound)}>
        {round === 0 ? "Start round 1" : `Next round (${round + 1})`}
      </button>

      <section class="card-panel">
        {card ? (
          <>
            <h2>Card {card.id}</h2>
            <table>
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
          </>
        ) : (
          <p class="muted">{round === 0 ? "Start the first round." : "The card is revealed on the first Legend tap this round."}</p>
        )}
      </section>

      <section class="legends">
        {legends.map((c) => (
          <button
            key={c}
            class={`legend-btn ${movedThisRound.has(c) ? "moved" : ""}`}
            style={{ "--car": c === "black" ? "#8a8f96" : CAR_HEX[c] }}
            onClick={() => tap(c)}
          >
            <Swatch colour={c} size={28} />
            <span>
              <b>{carName(c)}</b>
              <small>{g.positions[c] ? label(g.positions[c]!.space) : "position unknown"}</small>
            </span>
            {movedThisRound.has(c) && <em>moved</em>}
          </button>
        ))}
      </section>

      {g.log.length > 0 && (
        <section class="log">
          <h2>Moves</h2>
          <ol reversed>
            {[...g.log].reverse().map((e, i) => (
              <LogLine key={g.log.length - i} entry={e} label={label} />
            ))}
          </ol>
        </section>
      )}

      {about && (
        <About
          onClose={() => setAbout(false)}
          onEndRace={() => {
            if (confirm("End this race? It can't be resumed afterwards.")) onEndRace();
          }}
        />
      )}
    </main>
  );
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
