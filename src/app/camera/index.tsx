// Camera screens (D32–D35): the board scan and the Legend move (sweep, then a
// live arrow). The rest of the app only sees these two components and the
// scan store; everything vision-related stays behind them.
import type { Board, CarColor, LegendCard, LegendMove, Track } from "../../engine";

export type MoveResult = { board: Board; move: LegendMove };

export type MoveCameraProps = {
  track: Track;
  legend: CarColor;
  /** Every colour in play (Legends and humans): all of them are detected (D8). */
  inPlay: CarColor[];
  card: LegendCard;
  /** Called when the user finishes: the move that was shown, or null if they gave up. */
  onDone: (result: MoveResult | null) => void;
  /** The user asked to place the Legend by hand instead (tap mode, D9). */
  onTapMode: () => void;
};

export function MoveCamera(props: MoveCameraProps) {
  return (
    <div class="camera-stub">
      <p>Camera for {props.legend} — not built yet.</p>
      <button onClick={() => props.onTapMode()}>Place by hand</button>
      <button onClick={() => props.onDone(null)}>Cancel</button>
    </div>
  );
}

export type ScanBoardProps = { track: Track; onDone: () => void; onCancel: () => void };

export function ScanBoard(props: ScanBoardProps) {
  return (
    <div class="camera-stub">
      <p>Board scan — not built yet.</p>
      <button onClick={() => props.onDone()}>Skip</button>
      <button onClick={() => props.onCancel()}>Back</button>
    </div>
  );
}

/** When the stored scan for this track was made, or null if there is none (D34). */
export async function storedScanDate(_trackId: string): Promise<Date | null> {
  return null;
}
