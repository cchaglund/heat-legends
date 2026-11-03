// Step 3 of setup (D31): three areas, every car starts under Human, a tap
// moves a car to the next area. Dragging is left out: tapping covers it.
import { useState } from "preact/hooks";
import { CAR_COLORS } from "../../engine";
import { canStart, cycleRole, newGame } from "../game";
import type { GameState, Role, Roles } from "../game";
import { carName } from "../colours";
import { lastRoles, rememberRoles } from "../store";
import { LEGEND_CARDS } from "../tracks";
import { Swatch } from "../Swatch";

const AREAS: Array<{ role: Role; title: string }> = [
  { role: "human", title: "Human" },
  { role: "legend", title: "AI (Legend)" },
  { role: "out", title: "Not in play" },
];

type Props = { trackId: string; onStart: (g: GameState) => void; onBack: () => void; initial?: Roles };

export function RolesScreen({ trackId, onStart, onBack, initial }: Props) {
  const [roles, setRoles] = useState(initial ?? lastRoles);
  const start = () => {
    rememberRoles(roles);
    onStart(newGame(trackId, roles, LEGEND_CARDS));
  };
  return (
    <main class="screen">
      <button class="link" onClick={onBack}>‹ Board</button>
      <h1>Cars</h1>
      <p class="muted">Tap a car to move it to the next area.</p>
      {AREAS.map((a) => (
        <section key={a.role} class={`area area-${a.role}`}>
          <h2>{a.title}</h2>
          <div class="chips">
            {CAR_COLORS.filter((c) => roles[c] === a.role).map((c) => (
              <button key={c} class="chip" onClick={() => setRoles(cycleRole(roles, c))}>
                <Swatch colour={c} />
                {carName(c)}
              </button>
            ))}
          </div>
        </section>
      ))}
      <div class="footer">
        {!canStart(roles) && <p class="muted">Move at least one car to AI.</p>}
        <button class="btn primary wide big" disabled={!canStart(roles)} onClick={start}>
          Start race
        </button>
      </div>
    </main>
  );
}
