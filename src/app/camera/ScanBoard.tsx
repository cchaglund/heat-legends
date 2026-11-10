// Board scan (D32–D34): the user films the empty board; each frame that is
// sharp and aligned goes into the scan, and a small map of the track fills
// in as spaces get enough sharp views. "Scan complete" waits for every space
// (D40); Done works earlier, and unscanned parts fall back to the printed board. Done builds the reference on the
// phone and stores it for this track.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Track } from "../../engine";
import { trackById } from "../tracks";
import { buildScan, prepare, processFrame, resetTracking } from "./client";
import { resetSweepMisses } from "./MoveCamera";
import { saveScan } from "./scanStore";
import type { Rescan } from "./vision.worker";
import { useCamera, useFrameLoop } from "./useCamera";

export type ScanBoardProps = {
  track: Track;
  /** Mid-race rescan (D36): cars stay where they are; their spots keep the old scan. */
  rescan?: Rescan;
  onDone: () => void;
  onCancel: () => void;
};

const MIN_TO_FINISH = 0.3;

export function ScanBoard({ track, rescan, onDone, onCancel }: ScanBoardProps) {
  const info = trackById(track.id)!;
  const { video, state } = useCamera();
  const [phase, setPhase] = useState<ScanPhase>("loading");
  const [error, setError] = useState("");
  const [coverage, setCoverage] = useState<number[]>([]);
  const [lost, setLost] = useState(false);
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    if (state.status !== "running") return;
    prepare(info)
      .then(() => resetTracking(rescan))
      .then(() => setPhase("scanning"))
      .catch((e) => (setError(String(e.message ?? e)), setPhase("error")));
  }, [state.status]);

  useFrameLoop(video, phase === "scanning", async (frame) => {
    const r = await processFrame("scan", frame);
    setLost(!r.ok);
    if (r.coverage) setCoverage(r.coverage);
    if (r.used) setFrames((n) => n + 1);
  });

  async function finish() {
    setPhase("saving");
    try {
      const image = await buildScan();
      await saveScan({ trackId: track.id, date: Date.now(), image });
      resetSweepMisses();
      onDone();
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setPhase("error");
    }
  }

  return (
    <ScanBoardView
      track={track}
      rescan={!!rescan}
      phase={phase}
      coverage={coverage}
      lost={lost}
      frames={frames}
      error={error}
      cameraError={state.status === "error" ? state.message ?? "" : undefined}
      background={<video ref={video} class="cam-video" playsInline muted />}
      onCancel={onCancel}
      onDone={finish}
    />
  );
}

export type ScanPhase = "loading" | "scanning" | "saving" | "error";
export type ScanBoardViewProps = {
  track: Track;
  rescan?: boolean;
  phase: ScanPhase;
  coverage: number[];
  lost: boolean;
  frames: number;
  error: string;
  cameraError?: string;
  background: ComponentChildren;
  onCancel: () => void;
  onDone: () => void;
};

/** The screen itself, without camera or worker, so every state can be shown on its own. */
export function ScanBoardView(p: ScanBoardViewProps) {
  const { track, phase, coverage } = p;
  const info = trackById(track.id)!;
  const covered = coverage.length ? coverage.reduce((s, c) => s + c, 0) / coverage.length : 0;
  const [keepGoing, setKeepGoing] = useState(false);
  const done = phase === "scanning" && coverage.length > 0 && coverage.every((c) => c >= 1);
  return (
    <div class="cam">
      {p.background}
      <div class="cam-top">
        <b>{p.rescan ? "Rescan the board" : "Scan the empty board"}</b>
        <span>
          {p.rescan ? "Leave the cars where they are. " : "Remove all cars. "}
          Film the whole track slowly from close up, a little from each side (about half a minute).
        </span>
      </div>
      <TrackMap track={track} width={info.width} height={info.height} coverage={coverage} />
      <div class="cam-bottom">
        <div class="cam-msgs">
          {p.cameraError !== undefined && <p class="cam-msg">Camera: {p.cameraError}</p>}
          {phase === "loading" && p.cameraError === undefined && <p class="cam-msg">Preparing… (the first time takes a while)</p>}
          {phase === "error" && <p class="cam-msg">Something went wrong: {p.error}</p>}
          {phase === "scanning" && (
            <p class="cam-msg">
              {p.lost ? "Can't see the board: point at the track." : `${Math.round(covered * 100)}% of the track scanned · ${p.frames} frames`}
            </p>
          )}
          {phase === "saving" && <p class="cam-msg">Building the scan…</p>}
          {done && keepGoing && <p class="cam-msg">The whole track is scanned: tap Done when you're finished.</p>}
        </div>
        <div class="row">
          <button class="btn" onClick={p.onCancel}>Cancel</button>
          <button class="btn primary" disabled={phase !== "scanning" || covered < MIN_TO_FINISH} onClick={p.onDone}>Done</button>
        </div>
      </div>
      {done && !keepGoing && (
        <div class="cam-dialog" role="dialog" aria-labelledby="scan-done">
          <h2 id="scan-done">Scan complete</h2>
          <p>{p.rescan ? "The whole track is scanned." : "The whole track is scanned. You can put the cars back on the board."}</p>
          <button class="btn primary wide big" onClick={p.onDone}>OK</button>
          <button class="link" onClick={() => setKeepGoing(true)}>Keep scanning</button>
        </div>
      )}
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
