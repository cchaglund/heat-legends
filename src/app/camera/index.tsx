// Camera screens (D32–D35): the board scan and the Legend move (sweep, then a
// live arrow). The rest of the app only sees these two components and the
// scan date; everything vision-related stays behind them.
import "./camera.css";
import { loadScan } from "./scanStore";

export { MoveCamera, type MoveCameraProps, type MoveResult } from "./MoveCamera";
export { ScanBoard, type ScanBoardProps } from "./ScanBoard";

/** When the stored scan for this track was made, or null if there is none (D34). */
export async function storedScanDate(trackId: string): Promise<Date | null> {
  const scan = await loadScan(trackId);
  return scan ? new Date(scan.date) : null;
}
