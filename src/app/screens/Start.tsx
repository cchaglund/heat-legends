// D23: a saved race is offered first; a new race throws it away only once the
// new one actually starts.
import type { GameState } from "../game";
import { savedGame } from "../store";
import { trackById } from "../tracks";

type Props = { onResume: () => void; onNew: () => void; saved?: GameState };

export function StartScreen({ onResume, onNew, saved = savedGame! }: Props) {
  const g = saved;
  return (
    <main class="screen center">
      <h1>Heat Legends</h1>
      <p class="muted">
        A race on {trackById(g.trackId)?.name ?? g.trackId} is saved (round {g.deck.round}, {g.log.length} Legend moves).
      </p>
      <button class="btn primary wide big" onClick={onResume}>Resume race</button>
      <button class="btn wide" onClick={onNew}>New race</button>
    </main>
  );
}
