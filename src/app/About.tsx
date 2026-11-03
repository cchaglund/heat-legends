// Settings / about sheet: build identity (to tell which version a phone runs)
// and the way out of a race.
type Props = { onClose: () => void; onEndRace?: () => void; onRescan?: () => void };

export function About({ onClose, onEndRace, onRescan }: Props) {
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Heat Legends</h2>
        <p class="muted">
          Version {__APP_VERSION__}
          <br />
          Built {new Date(__BUILD_DATE__).toLocaleString()}
        </p>
        {onRescan && (
          <button class="btn wide" onClick={onRescan}>
            Rescan the board
            <small>if the light has changed; the cars can stay</small>
          </button>
        )}
        {onEndRace && (
          <button class="btn danger wide" onClick={onEndRace}>
            End race and start a new one
          </button>
        )}
        <button class="btn wide" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
