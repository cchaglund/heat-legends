// Step 2 of setup (D29, D33, D34): reuse the stored scan of the user's own
// board, make one now (on the empty board), or go on with the printed image.
import { useEffect, useState } from "preact/hooks";
import { storedScanDate } from "../camera";
import { trackById } from "../tracks";

type Props = {
  trackId: string;
  onScan: () => void;
  onContinue: () => void;
  onBack: () => void;
  /** The stored scan's date, given instead of looked up (UI gallery). */
  scanDate?: Date | null;
};

export function BoardScreen({ trackId, onScan, onContinue, onBack, scanDate }: Props) {
  const [scanned, setScanned] = useState<Date | null | undefined>(scanDate);
  useEffect(() => {
    if (scanDate !== undefined) return;
    let live = true;
    storedScanDate(trackId)
      .then((d) => live && setScanned(d))
      .catch(() => live && setScanned(null));
    return () => {
      live = false;
    };
  }, [trackId]);

  return (
    <main class="screen">
      <button class="link" onClick={onBack}>‹ Track</button>
      <h1>{trackById(trackId)?.name} board</h1>
      <p class="muted">
        The camera compares the table with a scan of your own board. Scan it while it is <b>empty</b>: remove all cars first.
      </p>
      <div class="stack">
        {scanned && (
          <button class="btn primary wide big" onClick={onContinue}>
            Use stored board
            <small>scanned {scanned.toLocaleDateString()}</small>
          </button>
        )}
        <button class={`btn wide big ${scanned === null ? "primary" : ""}`} onClick={onScan}>
          {scanned ? "Scan again" : "Scan board"}
        </button>
        <button class="btn wide" onClick={onContinue}>Skip (use the printed board)</button>
      </div>
    </main>
  );
}
