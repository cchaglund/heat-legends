// Screen router. Each screen is a small component; transitions between them
// live here so the flow (D29 setup order, D6 round flow, D9 tap fallback) can
// be read in one place.
import { MoveCamera, ScanBoard } from "./camera";
import type { MoveResult } from "./camera";
import { spotCenter } from "../engine";
import { inPlayOf, recordMove } from "./game";
import { game, savedGame, screen, setGame, update } from "./store";
import { trackById } from "./tracks";
import { UpdateBanner } from "./UpdateBanner";
import { StartScreen } from "./screens/Start";
import { TrackScreen } from "./screens/Track";
import { BoardScreen } from "./screens/Board";
import { RolesScreen } from "./screens/Roles";
import { RaceScreen } from "./screens/Race";
import { TapMode } from "./screens/TapMode";

const go = (s: typeof screen.value) => (screen.value = s);

export function App() {
  return (
    <>
      <UpdateBanner />
      <Current />
    </>
  );
}

function Current() {
  const s = screen.value;
  const g = game.value;
  switch (s.name) {
    case "start":
      return (
        <StartScreen
          onResume={() => {
            setGame(savedGame);
            go({ name: "race" });
          }}
          onNew={() => go({ name: "track" })}
        />
      );
    case "track":
      return <TrackScreen onPick={(trackId) => go({ name: "board", trackId })} />;
    case "board":
      return (
        <BoardScreen
          trackId={s.trackId}
          onScan={() => go({ name: "scan", trackId: s.trackId })}
          onContinue={() => go({ name: "roles", trackId: s.trackId })}
          onBack={() => go({ name: "track" })}
        />
      );
    case "scan":
      return (
        <div class="fullscreen">
          <ScanBoard
            track={trackById(s.trackId)!.track}
            onDone={() => go({ name: "roles", trackId: s.trackId })}
            onCancel={() => go({ name: "board", trackId: s.trackId })}
          />
        </div>
      );
    case "roles":
      return (
        <RolesScreen
          trackId={s.trackId}
          onStart={(g) => {
            setGame(g);
            go({ name: "race" });
          }}
          onBack={() => go({ name: "board", trackId: s.trackId })}
        />
      );
  }
  // Race screens need a game; without one, start over.
  if (!g) {
    go({ name: "track" });
    return null;
  }
  const info = trackById(g.trackId)!;
  switch (s.name) {
    case "race":
      return (
        <RaceScreen
          onLegend={(legend) => go({ name: "camera", legend })}
          onRescan={() => go({ name: "rescan" })}
          onEndRace={() => {
            setGame(null);
            go({ name: "track" });
          }}
        />
      );
    case "camera":
      return (
        <div class="fullscreen">
          <MoveCamera
            track={info.track}
            legend={s.legend}
            inPlay={inPlayOf(g.roles)}
            card={g.deck.card!}
            onDone={(result: MoveResult | null) => {
              if (result) update((g) => recordMove(g, s.legend, result.move, result.board));
              go({ name: "race" });
            }}
            onTapMode={() => go({ name: "tap", legend: s.legend })}
            onRescan={() => go({ name: "rescan", legend: s.legend })}
          />
        </div>
      );
    case "rescan": {
      const back = () => go(s.legend ? { name: "camera", legend: s.legend } : { name: "race" });
      const cars = inPlayOf(g.roles).flatMap((c) => (g.positions[c] ? [spotCenter(info.track, g.positions[c]!)] : []));
      return (
        <div class="fullscreen">
          <ScanBoard track={info.track} rescan={{ cars, colors: inPlayOf(g.roles) }} onDone={back} onCancel={back} />
        </div>
      );
    }
    case "tap":
      return (
        <TapMode
          info={info}
          legend={s.legend}
          onDone={(move, board) => {
            update((g) => recordMove(g, s.legend, move, board, true));
            go({ name: "race" });
          }}
          onCancel={() => go({ name: "race" })}
        />
      );
  }
}
