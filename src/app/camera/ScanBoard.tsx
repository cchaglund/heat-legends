// Board scan (D32–D34): the user films the empty board; each frame that is
// sharp and aligned goes into the scan, and a small map of the track fills
// in as spaces get enough sharp views. Done builds the reference on the
// phone and stores it for this track.
import { useEffect, useState } from "preact/hooks";
import type { Track } from "../../engine";
import { trackById } from "../tracks";
import { buildScan, prepare, processFrame, resetTracking } from "./client";
import { saveScan } from "./scanStore";
import { useCamera, useFrameLoop } from "./useCamera";

export type ScanBoardProps = { track: Track; onDone: () => void; onCancel: () => void };

const ENOUGH = 0.85; // D32: aim for most of the track; the rest falls back to the printed board
const MIN_TO_FINISH = 0.3;

export function ScanBoard({ track, onDone, onCancel }: ScanBoardProps) {
  const info = trackById(track.id)!;
  const { video, state } = useCamera();
  const [phase, setPhase] = useState<"loading" | "scanning" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [coverage, setCoverage] = useState<number[]>([]);
  const [lost, setLost] = useState(false);
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    if (state.status !== "running") return;
    prepare(info)
      .then(resetTracking)
      .then(() => setPhase("scanning"))
      .catch((e) => (setError(String(e.message ?? e)), setPhase("error")));
  }, [state.status]);

  useFrameLoop(video, phase === "scanning", async (frame) => {
    const r = await processFrame("scan", frame);
    setLost(!r.ok);
    if (r.coverage) setCoverage(r.coverage);
    if (r.used) setFrames((n) => n + 1);
  });

  const covered = coverage.length ? coverage.reduce((s, c) => s + c, 0) / coverage.length : 0;

  async function finish() {
    setPhase("saving");
    try {
      const image = await buildScan();
      await saveScan({ trackId: track.id, date: Date.now(), image });
      onDone();
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setPhase("error");
    }
  }

  return (
    <div class="cam">
      <video ref={video} class="cam-video" playsInline muted />
      <div class="cam-top">
        <b>Scan the empty board</b>
        <span>Remove all cars. Film the whole track slowly from close up, a little from each side (about half a minute).</span>
      </div>
      <TrackMap track={track} width={info.width} height={info.height} coverage={coverage} />
      <div class="cam-bottom">
        {state.status === "error" && <p class="cam-msg">Camera: {state.message}</p>}
        {phase === "loading" && state.status !== "error" && <p class="cam-msg">Preparing… (the first time takes a while)</p>}
        {phase === "error" && <p class="cam-msg">Something went wrong: {error}</p>}
        {phase === "scanning" && (
          <p class="cam-msg">
            {lost ? "Can't see the board: point at the track." : `${Math.round(covered * 100)}% of the track scanned · ${frames} frames`}
            {covered >= ENOUGH && " · enough, tap Done"}
          </p>
        )}
        {phase === "saving" && <p class="cam-msg">Building the scan…</p>}
        <div class="row">
          <button class="btn" onClick={onCancel}>Cancel</button>
          <button class="btn primary" disabled={phase !== "scanning" || covered < MIN_TO_FINISH} onClick={finish}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** The track's spaces as a small map: grey = not yet, green = scanned. */
function TrackMap({ track, width, height, coverage }: { track: Track; width: number; height: number; coverage: number[] }) {
  return (
    <svg class="cam-map" viewBox={`0 0 ${width} ${height}`}>
      {track.spaces.map((s, i) => (
        <polygon
          key={i}
          points={s.quad.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={(coverage[i] ?? 0) >= 1 ? "#2fa84f" : (coverage[i] ?? 0) > 0 ? "#c9a227" : "#555"}
          stroke="#000"
          stroke-width="4"
        />
      ))}
    </svg>
  );
}
