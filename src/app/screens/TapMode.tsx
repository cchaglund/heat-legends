// Tap mode (D9): the user places cars on the reference image by hand, then the
// engine shows the Legend's move. Other cars only matter near the target, for
// full spaces (D13), so they start at their last known spots and can be moved
// or cleared. Everything is in reference px; the SVG overlay shares the
// image's viewBox so a tap maps straight onto the track.
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { positionAtPoint, resolveLegendMove, spaceLabel, spotCenter } from "../../engine";
import type { Board, CarColor, LegendMove, Position } from "../../engine";
import { inPlayOf } from "../game";
import { CAR_HEX, CAR_OUTLINE, carName } from "../colours";
import { game } from "../store";
import type { TrackInfo } from "../tracks";
import { Swatch } from "../Swatch";

type Props = {
  info: TrackInfo;
  legend: CarColor;
  onDone: (move: LegendMove, board: Board) => void;
  onCancel: () => void;
};

const ZOOMS = [1, 1.5, 2.5, 4];
const same = (p: Position, q: Position) => p.space === q.space && p.spot === q.spot;

export function TapMode({ info, legend, onDone, onCancel }: Props) {
  const g = game.value!;
  const { track } = info;
  const inPlay = inPlayOf(g.roles);
  const [board, setBoard] = useState<Board>(() =>
    Object.fromEntries(inPlay.filter((c) => g.positions[c]).map((c) => [c, g.positions[c]])),
  );
  const [selected, setSelected] = useState<CarColor>(legend);
  const [move, setMove] = useState<LegendMove | null>(null);
  const [hint, setHint] = useState("");
  const [zoom, setZoom] = useState(g.positions[legend] ? 2 : 0);
  const scroller = useRef<HTMLDivElement>(null);
  const focus = useRef<{ x: number; y: number } | null>(g.positions[legend] ? spotCenter(track, g.positions[legend]!) : null);

  // Centre a reference point after a zoom change or when the move is shown.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !focus.current) return;
    const scale = el.scrollWidth / info.width;
    el.scrollLeft = focus.current.x * scale - el.clientWidth / 2;
    el.scrollTop = focus.current.y * scale - el.clientHeight / 2;
    focus.current = null;
  }, [zoom, move]);

  const changeZoom = (dir: 1 | -1) => {
    const el = scroller.current!;
    const scale = el.scrollWidth / info.width;
    focus.current = { x: (el.scrollLeft + el.clientWidth / 2) / scale, y: (el.scrollTop + el.clientHeight / 2) / scale };
    setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + dir)));
  };

  const onTap = (e: MouseEvent) => {
    if (move) return;
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * info.width;
    const y = ((e.clientY - r.top) / r.height) * info.height;
    // Spots are tiny when zoomed out: the first tap zooms in on that point.
    if (ZOOMS[zoom] < 2) {
      focus.current = { x, y };
      setZoom(ZOOMS.indexOf(2.5));
      return;
    }
    const pos = positionAtPoint(track, x, y);
    if (!pos) {
      setHint("That's not on the track.");
      return;
    }
    setHint("");
    // A spot holds one car: whoever was there is taken off.
    const next: Board = {};
    for (const c of inPlay) if (board[c] && !same(board[c]!, pos)) next[c] = board[c];
    next[selected] = pos;
    setBoard(next);
  };

  const remove = (c: CarColor) => {
    const { [c]: _, ...rest } = board;
    setBoard(rest);
  };
  const clearOthers = () => setBoard(board[legend] ? { [legend]: board[legend] } : {});

  const show = () => {
    try {
      const m = resolveLegendMove(track, board, legend, g.deck.card!);
      const [a, b] = [spotCenter(track, m.from), spotCenter(track, m.to)];
      focus.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; // bring the whole arrow into view
      setMove(m);
    } catch (err) {
      setHint(String(err));
    }
  };

  const width = `${ZOOMS[zoom] * 100}%`;

  return (
    <main class="tap">
      <header class="tap-bar">
        <button class="btn" onClick={move ? () => setMove(null) : onCancel}>{move ? "‹ Edit" : "‹ Back"}</button>
        <h1>
          <Swatch colour={legend} /> {carName(legend)}
        </h1>
        <div class="zoom">
          <button class="btn icon" aria-label="Zoom out" disabled={zoom === 0} onClick={() => changeZoom(-1)}>−</button>
          <button class="btn icon" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => changeZoom(1)}>+</button>
        </div>
      </header>

      <div class="tap-scroll" ref={scroller}>
        <div class="tap-canvas" style={{ width }}>
          <img src={info.image} width={info.width} height={info.height} alt={`${info.name} track`} draggable={false} />
          <svg viewBox={`0 0 ${info.width} ${info.height}`} onClick={onTap}>
            <defs>
              <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
              </marker>
            </defs>
            {inPlay.map((c) => board[c] && <CarMarker key={c} info={info} colour={c} pos={board[c]!} faded={!!move && c !== legend} />)}
            {move && <MoveArrow info={info} move={move} />}
          </svg>
        </div>
      </div>

      <footer class="tap-panel">
        {move ? (
          <>
            <p class="move-head">
              {carName(legend)}: {spaceLabel(track, move.from.space)} → <b>{spaceLabel(track, move.to.space)}</b>
              {move.to.spot === 1 ? " (outer spot)" : ""}
            </p>
            <p class="muted">{move.reason}</p>
            <button class="btn primary wide big" onClick={() => onDone(move, board)}>Done</button>
          </>
        ) : (
          <>
            <p class="muted">
              {hint ||
                (ZOOMS[zoom] < 2
                  ? `Tap near ${carName(selected)} to zoom in.`
                  : selected === legend && !board[legend]
                    ? `Tap the spot where ${carName(legend)} is.`
                    : "Pick a colour, then tap its spot. Other cars matter near the target (full spaces).")}
            </p>
            <div class="palette">
              {inPlay.map((c) => (
                <button key={c} class={`chip ${c === selected ? "selected" : ""}`} onClick={() => setSelected(c)}>
                  <Swatch colour={c} />
                  {board[c] ? "✓" : ""}
                </button>
              ))}
            </div>
            <div class="row">
              <button class="btn" disabled={!board[selected]} onClick={() => remove(selected)}>Remove {carName(selected)}</button>
              <button class="btn" onClick={clearOthers}>Clear others</button>
            </div>
            <button class="btn primary wide big" disabled={!board[legend]} onClick={show}>Show move</button>
          </>
        )}
      </footer>
    </main>
  );
}

function CarMarker({ info, colour, pos, faded }: { info: TrackInfo; colour: CarColor; pos: Position; faded: boolean }) {
  const poly = info.track.spaces[pos.space].spots[pos.spot].polygon;
  const c = spotCenter(info.track, pos);
  const outline = colour === "black" || colour === "silver" ? CAR_OUTLINE[colour] : "#fff";
  return (
    <g opacity={faded ? 0.55 : 1} pointer-events="none">
      <polygon points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill={CAR_HEX[colour]} fill-opacity="0.35" stroke={CAR_HEX[colour]} stroke-width="3" />
      <circle cx={c.x} cy={c.y} r="16" fill={CAR_HEX[colour]} stroke={outline} stroke-width="4" />
    </g>
  );
}

function MoveArrow({ info, move }: { info: TrackInfo; move: LegendMove }) {
  const a = spotCenter(info.track, move.from);
  const b = spotCenter(info.track, move.to);
  const target = info.track.spaces[move.to.space].spots[move.to.spot].polygon;
  return (
    <g pointer-events="none">
      <polygon points={target.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="12 8" />
      {!same(move.from, move.to) && (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#000" stroke-opacity="0.6" stroke-width="16" stroke-linecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" stroke-width="9" stroke-linecap="round" marker-end="url(#arrowhead)" />
        </>
      )}
    </g>
  );
}
