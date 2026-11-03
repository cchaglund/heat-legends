// Every screen state of the app with made-up data, for the UI gallery: the
// real components, so a screenshot shows the real UI. Camera screens get the
// printed board as a still "camera picture" with the overlay drawn on it.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { resolveLegendMove, spotCenter } from "../../engine";
import type { Board, CarColor, LegendMove, Point, Position } from "../../engine";
import { drawOverlay, MoveCameraView, ScanBoardView, type Found, type Phase, type ScanPhase } from "../camera";
import { newGame, recordMove, startNextRound, tapLegend } from "../game";
import type { GameState, Roles } from "../game";
import { game } from "../store";
import { LEGEND_CARDS, TRACKS } from "../tracks";
import { About } from "../About";
import { UpdateBannerView } from "../UpdateBanner";
import { StartScreen } from "../screens/Start";
import { TrackScreen } from "../screens/Track";
import { BoardScreen } from "../screens/Board";
import { RolesScreen } from "../screens/Roles";
import { RaceScreen } from "../screens/Race";
import { TapMode } from "../screens/TapMode";

export type UiState = { id: string; group: string; title: string; note?: string; render: () => ComponentChildren };

const info = TRACKS[0];
const track = info.track;
const noop = () => {};

/** Deterministic Math.random stand-in, so the cards shown are the same every time. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roles: Roles = { red: "human", blue: "legend", green: "human", yellow: "legend", black: "out", silver: "human" };
const at = (space: number, spot: 0 | 1 = 0): Position => ({ space, spot });

const fresh = newGame(info.id, roles, LEGEND_CARDS, seeded(1));
const cardShown = tapLegend(startNextRound(fresh), "blue", seeded(2));
const cardOf = (g: GameState) => g.deck.card!;

// Round 1 played (both Legends moved), round 2 started with Blue moved.
const midRace = (() => {
  let g = cardShown;
  const b1: Board = { blue: at(8), yellow: at(3), red: at(9), green: at(5) };
  g = recordMove(g, "blue", resolveLegendMove(track, b1, "blue", cardOf(g)), b1);
  const b2: Board = { ...g.positions };
  g = recordMove(g, "yellow", resolveLegendMove(track, b2, "yellow", cardOf(g)), b2);
  g = tapLegend(startNextRound(g), "blue", seeded(3));
  const b3: Board = { ...g.positions, red: at(16), green: at(15) };
  return recordMove(g, "blue", resolveLegendMove(track, b3, "blue", cardOf(g)), b3);
})();

// The camera scene: Blue on space 14 with a few cars around it.
const camBoard: Board = { blue: at(14), yellow: at(20), red: at(16), green: at(12, 1) };
const camMove = resolveLegendMove(track, camBoard, "blue", cardOf(cardShown));
const found = (targetSeen: boolean, board = camBoard, move = camMove): Found => ({ board, move, targetSeen });
// Same scene with the target's inner spot taken: the outer spot is used.
const blockedBoard: Board = { ...camBoard, red: camMove.to };
const blockedMove = resolveLegendMove(track, blockedBoard, "blue", cardOf(cardShown));
const dotsOf = (b: Board, only?: CarColor[]) =>
  (Object.keys(b) as CarColor[]).filter((c) => !only || only.includes(c)).map((c) => ({ color: c, ...spotCenter(track, b[c]!) }));

const withGame = (g: GameState | null, node: () => ComponentChildren) => () => {
  game.value = g;
  return node();
};

/** The printed board as a still camera picture centred on `centre` (reference px), ~`span` reference px across.
 *  `children` gets the reference → screen mapping and the picture element. */
function StillCamera({ centre, span = 460, blur, children }: {
  centre: Point;
  span?: number;
  blur?: boolean;
  children: (screen: (p: Point) => Point, picture: ComponentChildren) => ComponentChildren;
}) {
  const W = window.innerWidth, H = window.innerHeight;
  const s = W / span;
  const screen = (p: Point) => ({ x: W / 2 + (p.x - centre.x) * s, y: H / 2 + (p.y - centre.y) * s });
  const origin = screen({ x: 0, y: 0 });
  const picture = (
    <div class="cam-video" style={{ overflow: "hidden" }}>
      <img
        src={info.image}
        alt=""
        style={{ position: "absolute", left: origin.x, top: origin.y, width: info.width * s, maxWidth: "none", filter: blur ? "blur(8px)" : undefined }}
      />
    </div>
  );
  return <>{children(screen, picture)}</>;
}

type MoveOpts = {
  phase: Phase;
  progress?: number;
  lost?: boolean;
  found?: Found | null;
  dots?: ReturnType<typeof dotsOf>;
  arrow?: LegendMove;
  centre?: Point;
  cameraError?: string;
  error?: string;
  blank?: boolean;
};

function MovePreview(o: MoveOpts) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const centre = o.centre ?? midpoint(o.arrow ?? camMove);
  return (
    <StillCamera centre={centre} blur={o.lost}>
      {(screen, bg) => (
        <Drawn canvas={canvas} draw={(c) => drawOverlay(c, track, o.lost ? null : screen, o.arrow ?? null, o.dots)}>
          <MoveCameraView
            track={track}
            legend="blue"
            phase={o.phase}
            progress={o.progress ?? 0}
            lost={!!o.lost}
            found={o.found ?? null}
            error={o.error ?? ""}
            cameraError={o.cameraError}
            background={o.blank ? null : bg}
            canvas={canvas}
            onCancel={noop}
            onSweepAgain={noop}
            onTapMode={noop}
            onDone={noop}
          />
        </Drawn>
      )}
    </StillCamera>
  );
}

function Drawn({ canvas, draw, children }: { canvas: { current: HTMLCanvasElement | null }; draw: (c: HTMLCanvasElement) => void; children: ComponentChildren }) {
  useLayoutEffect(() => {
    if (canvas.current) draw(canvas.current);
  });
  return <>{children}</>;
}

function midpoint(m: LegendMove): Point {
  const [a, b] = [spotCenter(track, m.from), spotCenter(track, m.to)];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type ScanOpts = { phase: ScanPhase; coverage?: number[]; lost?: boolean; frames?: number; cameraError?: string; error?: string; blank?: boolean };

function ScanPreview(o: ScanOpts) {
  return (
    <StillCamera centre={{ x: 1000, y: 700 }} span={900} blur={o.lost}>
      {(_, bg) => (
        <ScanBoardView
          track={track}
          phase={o.phase}
          coverage={o.coverage ?? []}
          lost={!!o.lost}
          frames={o.frames ?? 0}
          error={o.error ?? ""}
          cameraError={o.cameraError}
          background={o.blank ? null : bg}
          onCancel={noop}
          onDone={noop}
        />
      )}
    </StillCamera>
  );
}

/** Per-space scan coverage: the first `full` spaces done, the next `part` half done. */
const coverage = (full: number, part: number) => track.spaces.map((_, i) => (i < full ? 1 : i < full + part ? 0.5 : 0));

const fullscreen = (node: ComponentChildren) => <div class="fullscreen">{node}</div>;

export const STATES: UiState[] = [
  // --- Setup
  { id: "start", group: "Setup", title: "Resume a saved race", render: () => <StartScreen saved={midRace} onResume={noop} onNew={noop} /> },
  { id: "track", group: "Setup", title: "Choose track", render: () => <TrackScreen onPick={noop} /> },
  { id: "board-none", group: "Setup", title: "Board: no stored scan", render: () => <BoardScreen trackId={info.id} scanDate={null} onScan={noop} onContinue={noop} onBack={noop} /> },
  { id: "board-stored", group: "Setup", title: "Board: stored scan", render: () => <BoardScreen trackId={info.id} scanDate={new Date(2026, 10, 2)} onScan={noop} onContinue={noop} onBack={noop} /> },
  {
    id: "roles-none",
    group: "Setup",
    title: "Cars: no Legend yet",
    note: "Every car starts under Human.",
    render: () => <RolesScreen trackId={info.id} initial={{ red: "human", blue: "human", green: "human", yellow: "human", black: "human", silver: "human" }} onStart={noop} onBack={noop} />,
  },
  { id: "roles-set", group: "Setup", title: "Cars: roles set", render: () => <RolesScreen trackId={info.id} initial={roles} onStart={noop} onBack={noop} /> },

  // --- Board scan
  { id: "scan-loading", group: "Board scan", title: "Preparing", render: () => fullscreen(<ScanPreview phase="loading" />) },
  { id: "scan-camera-error", group: "Board scan", title: "Camera blocked", render: () => fullscreen(<ScanPreview phase="loading" blank cameraError="Permission denied" />) },
  { id: "scan-start", group: "Board scan", title: "Scanning: just started", render: () => fullscreen(<ScanPreview phase="scanning" coverage={coverage(0, 0)} frames={1} />) },
  { id: "scan-partial", group: "Board scan", title: "Scanning: half done", render: () => fullscreen(<ScanPreview phase="scanning" coverage={coverage(24, 6)} frames={14} />) },
  { id: "scan-enough", group: "Board scan", title: "Scanning: enough", render: () => fullscreen(<ScanPreview phase="scanning" coverage={coverage(56, 4)} frames={31} />) },
  { id: "scan-lost", group: "Board scan", title: "Scanning: board out of view", render: () => fullscreen(<ScanPreview phase="scanning" lost coverage={coverage(24, 6)} frames={14} />) },
  { id: "scan-saving", group: "Board scan", title: "Building the scan", render: () => fullscreen(<ScanPreview phase="saving" coverage={coverage(56, 4)} frames={31} />) },
  { id: "scan-error", group: "Board scan", title: "Error", render: () => fullscreen(<ScanPreview phase="error" error="no scan in progress" />) },

  // --- Race
  { id: "race-new", group: "Race", title: "Race started, round 0", render: withGame(fresh, () => <RaceScreen onLegend={noop} onEndRace={noop} />) },
  { id: "race-card", group: "Race", title: "Round 1, card revealed", render: withGame(cardShown, () => <RaceScreen onLegend={noop} onEndRace={noop} />) },
  { id: "race-mid", group: "Race", title: "Round 2, Blue moved", note: "Move log, \"moved\" badge.", render: withGame(midRace, () => <RaceScreen onLegend={noop} onEndRace={noop} />) },
  {
    id: "race-about",
    group: "Race",
    title: "Settings sheet",
    render: withGame(midRace, () => (
      <>
        <RaceScreen onLegend={noop} onEndRace={noop} />
        <About onClose={noop} onEndRace={noop} />
      </>
    )),
  },
  {
    id: "race-update",
    group: "Race",
    title: "Update available",
    render: withGame(midRace, () => (
      <>
        <UpdateBannerView onLater={noop} onReload={noop} />
        <RaceScreen onLegend={noop} onEndRace={noop} />
      </>
    )),
  },

  // --- Legend move (camera)
  { id: "move-loading", group: "Legend move (camera)", title: "Preparing", render: () => fullscreen(<MovePreview phase="loading" />) },
  { id: "move-camera-error", group: "Legend move (camera)", title: "Camera blocked", render: () => fullscreen(<MovePreview phase="loading" blank cameraError="Permission denied" />) },
  {
    id: "move-sweep-start",
    group: "Legend move (camera)",
    title: "Sweep: started",
    note: "Dots = cars seen in this frame.",
    render: () => fullscreen(<MovePreview phase="sweep" progress={0.1} centre={spotCenter(track, camBoard.blue!)} dots={dotsOf(camBoard, ["blue", "red"])} />),
  },
  {
    id: "move-sweep-mid",
    group: "Legend move (camera)",
    title: "Sweep: halfway",
    render: () => fullscreen(<MovePreview phase="sweep" progress={0.6} centre={spotCenter(track, camBoard.blue!)} dots={dotsOf(camBoard)} />),
  },
  { id: "move-sweep-lost", group: "Legend move (camera)", title: "Sweep: board out of view", render: () => fullscreen(<MovePreview phase="sweep" progress={0.4} lost />) },
  { id: "move-not-found", group: "Legend move (camera)", title: "Legend not found", render: () => fullscreen(<MovePreview phase="notFound" centre={spotCenter(track, camBoard.blue!)} />) },
  { id: "move-live", group: "Legend move (camera)", title: "Live arrow", render: () => fullscreen(<MovePreview phase="live" found={found(true)} arrow={camMove} />) },
  {
    id: "move-live-outer",
    group: "Legend move (camera)",
    title: "Live arrow: outer spot",
    note: "The inner spot of the target is taken.",
    render: () => fullscreen(<MovePreview phase="live" found={found(true, blockedBoard, blockedMove)} arrow={blockedMove} />),
  },
  { id: "move-live-unseen", group: "Legend move (camera)", title: "Live arrow: target not seen", render: () => fullscreen(<MovePreview phase="live" found={found(false)} arrow={camMove} />) },
  { id: "move-live-lost", group: "Legend move (camera)", title: "Live: board out of view", render: () => fullscreen(<MovePreview phase="live" found={found(true)} arrow={camMove} lost />) },
  { id: "move-error", group: "Legend move (camera)", title: "Error", render: () => fullscreen(<MovePreview phase="error" blank error="OpenCV failed to load" />) },

  // --- By hand
  { id: "tap-start", group: "By hand (tap mode)", title: "No known positions", render: withGame(cardShown, () => <TapMode info={info} legend="blue" onDone={noop} onCancel={noop} />) },
  { id: "tap-placing", group: "By hand (tap mode)", title: "Placing cars (zoomed)", render: withGame(midRace, () => <TapMode info={info} legend="yellow" initial={{ selected: "red" }} onDone={noop} onCancel={noop} />) },
  { id: "tap-hint", group: "By hand (tap mode)", title: "Tap off the track", render: withGame(midRace, () => <TapMode info={info} legend="yellow" initial={{ hint: "That's not on the track." }} onDone={noop} onCancel={noop} />) },
  {
    id: "tap-move",
    group: "By hand (tap mode)",
    title: "Move shown",
    render: withGame(midRace, () => (
      <TapMode info={info} legend="yellow" initial={{ move: resolveLegendMove(track, midRace.positions, "yellow", cardOf(midRace)) }} onDone={noop} onCancel={noop} />
    )),
  },
];
