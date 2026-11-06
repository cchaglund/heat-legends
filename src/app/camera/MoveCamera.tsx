// Moving a Legend (D35): a short sideways sweep finds the cars (a car counts
// only when views from different positions agree), the engine resolves the
// move, then the camera keeps running with tracking only and the arrow is
// drawn on the live picture. Tap mode stays one button away (D9).
import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { positionAtPoint, resolveLegendMove, spotCenter } from "../../engine";
import type { Board, CarColor, LegendCard, LegendMove, Point, Track } from "../../engine";
import { apply, invert, type H3 } from "../../vision/homography";
import { confirmCars, sweepBaseline, viewShows, type View } from "../../vision/sweep";
import { CAR_HEX, carName } from "../colours";
import { CarTag, MoveHeadline } from "../MoveHeadline";
import { trackById } from "../tracks";
import { prepare, processFrame, resetTracking } from "./client";
import { coverTransform, useCamera, useFrameLoop } from "./useCamera";

export type MoveResult = { board: Board; move: LegendMove };

export type MoveCameraProps = {
  track: Track;
  legend: CarColor;
  /** Every colour in play (Legends and humans): all of them are detected (D8). */
  inPlay: CarColor[];
  card: LegendCard;
  /** Recorded spots of the other Legends, used for any the sweep doesn't see. */
  known?: Board;
  /** Called when the user finishes: the move that was shown, or null if they gave up. */
  onDone: (result: MoveResult | null) => void;
  /** The user asked to place the Legend by hand instead (tap mode, D9). */
  onTapMode: () => void;
  /** The user accepted the rescan suggestion (D36). */
  onRescan: () => void;
};

const SWEEP_BASELINE = 100; // reference px the view centre must travel (≈ a hand's width at close range)
const MIN_VIEWS = 4;
const MAX_SWEEP_MS = 8000;
// D36: after this many sweeps in a row that saw the board but not the Legend,
// suggest a rescan: the light has most likely changed since the scan.
const MISSES_BEFORE_RESCAN = 2;
let missesInARow = 0; // across camera screens: cancelling and retrying still counts
export const resetSweepMisses = () => (missesInARow = 0);

export type Phase = "loading" | "sweep" | "notFound" | "live" | "error";
export type Found = { board: Board; move: LegendMove; targetSeen: boolean };
type Dot = { color: CarColor; x: number; y: number };

export function MoveCamera({ track, legend, inPlay, card, known = {}, onDone, onTapMode, onRescan }: MoveCameraProps) {
  const info = trackById(track.id)!;
  const { video, state } = useCamera();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [lost, setLost] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const views = useRef<View[]>([]);
  const sweepStart = useRef(0);

  useEffect(() => {
    if (state.status !== "running") return;
    prepare(info)
      .then(startSweep)
      .catch((e) => (setError(String(e.message ?? e)), setPhase("error")));
  }, [state.status]);

  async function startSweep() {
    await resetTracking();
    views.current = [];
    sweepStart.current = 0;
    setProgress(0);
    setFound(null);
    setPhase("sweep");
  }

  useFrameLoop(video, phase === "sweep", async (frame) => {
    const r = await processFrame("sweep", frame, inPlay);
    setLost(!r.ok);
    if (!r.ok) return draw(null, null);
    sweepStart.current ||= performance.now();
    views.current.push({ H: r.H, width: r.width, height: r.height, detections: r.detections ?? [] });
    draw(r.H, null, r.detections);
    const vs = views.current;
    const p = Math.min(1, sweepBaseline(vs) / SWEEP_BASELINE) * Math.min(1, vs.length / MIN_VIEWS);
    setProgress(p);
    if (p < 1) {
      if (performance.now() - sweepStart.current > MAX_SWEEP_MS) notFound();
      return;
    }
    const result = resolve(track, legend, card, vs, known);
    if (result) {
      resetSweepMisses();
      setFound(result);
      setPhase("live");
    } else if (performance.now() - sweepStart.current > MAX_SWEEP_MS) {
      notFound();
    }
  });

  function notFound() {
    missesInARow++;
    setPhase("notFound");
  }

  useFrameLoop(video, phase === "live", async (frame) => {
    const r = await processFrame("live", frame);
    setLost(!r.ok);
    draw(r.ok ? r.H : null, found?.move ?? null);
  });

  /** Redraws the overlay for a frame aligned by H (video px → reference px). */
  function draw(H: H3 | null, move: LegendMove | null, dots?: Dot[]) {
    const c = canvas.current, v = video.current;
    if (!c || !v) return;
    const toScreen = coverTransform(v).toScreen;
    const Hinv = H && invert(H);
    drawOverlay(c, track, Hinv ? (p) => toScreen(apply(Hinv, p)) : null, move, dots);
  }

  return (
    <MoveCameraView
      track={track}
      legend={legend}
      phase={phase}
      progress={progress}
      lost={lost}
      found={found}
      error={error}
      cameraError={state.status === "error" ? state.message ?? "" : undefined}
      background={<video ref={video} class="cam-video" playsInline muted />}
      canvas={canvas}
      onCancel={() => onDone(null)}
      onSweepAgain={startSweep}
      onTapMode={onTapMode}
      suggestRescan={missesInARow >= MISSES_BEFORE_RESCAN}
      onRescan={onRescan}
      onDone={() => found && onDone({ board: found.board, move: found.move })}
    />
  );
}

export type MoveCameraViewProps = {
  track: Track;
  legend: CarColor;
  phase: Phase;
  progress: number;
  lost: boolean;
  found: Found | null;
  error: string;
  cameraError?: string;
  /** The camera picture (a <video>; a still image in the UI gallery). */
  background: ComponentChildren;
  canvas: Ref<HTMLCanvasElement>;
  onCancel: () => void;
  onSweepAgain: () => void;
  onTapMode: () => void;
  /** Shown when the Legend wasn't found: offer a rescan instead of only "sweep again" (D36). */
  suggestRescan?: boolean;
  onRescan: () => void;
  onDone: () => void;
};

/** The screen itself, without camera or worker, so every state can be shown on its own. */
export function MoveCameraView(p: MoveCameraViewProps) {
  const { track, legend, phase, found } = p;
  const move = found?.move;
  return (
    <div class="cam">
      {p.background}
      <canvas ref={p.canvas} class="cam-overlay" />
      <div class="cam-top">
        {phase === "live" && move ? (
          <MoveHeadline track={track} legend={legend} move={move} />
        ) : (
          <b><CarTag colour={legend} /></b>
        )}
        {phase === "sweep" && <span>Point at {carName(legend)} and move the phone slowly sideways, about a hand's width.</span>}
      </div>
      <div class="cam-bottom">
        {p.cameraError !== undefined && <p class="cam-msg">Camera: {p.cameraError}</p>}
        {phase === "loading" && p.cameraError === undefined && <p class="cam-msg">Preparing… (the first time takes a while)</p>}
        {phase === "error" && <p class="cam-msg">Something went wrong: {p.error}</p>}
        {phase === "sweep" && (
          <>
            <div class="cam-progress"><div style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>
            {p.lost && <p class="cam-msg">Can't see the board: point at the track.</p>}
          </>
        )}
        {phase === "notFound" && !p.suggestRescan && <p class="cam-msg">Couldn't find {carName(legend)}. Sweep again over it, or place it by hand.</p>}
        {phase === "notFound" && p.suggestRescan && (
          <p class="cam-msg warn">
            Still can't find {carName(legend)}. If the light has changed since the board was scanned, a rescan usually fixes it. The cars can
            stay on the board.
          </p>
        )}
        {phase === "live" && found && (
          <>
            <p class="cam-msg">{found.move.reason}</p>
            {!found.targetSeen && (
              <p class="cam-msg warn">I couldn't see the target space. If a car is there, {carName(legend)} stops earlier: check it.</p>
            )}
            {p.lost && <p class="cam-msg">Point the camera at the board to see the arrow.</p>}
          </>
        )}
        <div class="row">
          <button class="btn" onClick={p.onCancel}>Cancel</button>
          {(phase === "notFound" || phase === "live") && <button class="btn" onClick={p.onSweepAgain}>Sweep again</button>}
          <button class="btn" onClick={p.onTapMode}>By hand</button>
          {phase === "live" && found && <button class="btn primary" onClick={p.onDone}>Done</button>}
          {phase === "notFound" && p.suggestRescan && <button class="btn primary" onClick={p.onRescan}>Rescan board</button>}
        </div>
      </div>
    </div>
  );
}

/** Clears the overlay canvas and draws the detection dots and the move arrow; `screen` maps reference px → CSS px (null: board not in view). */
export function drawOverlay(c: HTMLCanvasElement, track: Track, screen: ((p: Point) => Point) | null, move: LegendMove | null, dots?: Dot[]) {
  const dpr = window.devicePixelRatio || 1;
  c.width = c.clientWidth * dpr;
  c.height = c.clientHeight * dpr;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  if (!screen) return;
  for (const d of dots ?? []) {
    const p = screen(d);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
    ctx.fillStyle = CAR_HEX[d.color];
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
  if (move) drawArrow(ctx, track, move, screen);
}

/** Cars confirmed by the sweep (plus known Legends it missed) → board → the
 *  Legend's move; null while the Legend isn't confirmed. */
function resolve(track: Track, legend: CarColor, card: LegendCard, views: View[], known: Board): Found | null {
  const board: Board = { ...known };
  for (const c of confirmCars(views)) {
    const pos = positionAtPoint(track, c.x, c.y);
    if (pos) board[c.color] = pos;
  }
  if (!board[legend]) return null;
  const move = resolveLegendMove(track, board, legend, card);
  const targetSeen = views.some((v) => viewShows(v, spotCenter(track, move.to)));
  return { board, move, targetSeen };
}

/** The arrow follows the track: through the middle of every space between from and to. */
function drawArrow(ctx: CanvasRenderingContext2D, track: Track, move: LegendMove, screen: (p: Point) => Point) {
  const n = track.spaces.length;
  const ref: Point[] = [spotCenter(track, move.from)];
  for (let s = (move.from.space + 1) % n; s !== move.to.space && ref.length < n; s = (s + 1) % n) {
    const q = track.spaces[s].quad;
    ref.push({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 });
  }
  if (move.to.space !== move.from.space || move.to.spot !== move.from.spot) ref.push(spotCenter(track, move.to));
  const pts = ref.map(screen);

  const target = track.spaces[move.to.space].spots[move.to.spot].polygon.map(screen);
  ctx.beginPath();
  target.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  if (pts.length < 2) return;

  for (const [colour, width] of [["rgba(0,0,0,0.6)", 12], ["#fff", 6]] as const) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - 22 * Math.cos(ang - 0.5), b.y - 22 * Math.sin(ang - 0.5));
  ctx.lineTo(b.x - 22 * Math.cos(ang + 0.5), b.y - 22 * Math.sin(ang + 0.5));
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}
