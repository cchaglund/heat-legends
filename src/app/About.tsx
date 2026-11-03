// Settings / about sheet: build identity (to tell which version a phone runs)
// and the way out of a race.
export function About({ onClose, onEndRace }: { onClose: () => void; onEndRace?: () => void }) {
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Heat Legends</h2>
        <p class="muted">
          Version {__APP_VERSION__}
          <br />
          Built {new Date(__BUILD_DATE__).toLocaleString()}
        </p>
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
