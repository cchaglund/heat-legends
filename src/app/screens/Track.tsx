// Step 1 of setup: which circuit is on the table.
import { TRACKS } from "../tracks";

export function TrackScreen({ onPick }: { onPick: (trackId: string) => void }) {
  return (
    <main class="screen">
      <h1>Choose track</h1>
      <div class="stack">
        {TRACKS.map((t) => (
          <button key={t.id} class="track-card" onClick={() => onPick(t.id)}>
            <img src={t.image} alt="" width={t.width} height={t.height} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
