// App-wide state as signals. `game` is saved after every change (D23); the
// screen is not, since resuming always lands on the race screen.
import { signal } from "@preact/signals";
import type { CarColor } from "../engine";
import { defaultRoles, deserialize, serialize } from "./game";
import type { GameState, Roles } from "./game";
import { loadGameText, loadRolesText, saveGameText, saveRolesText } from "./storage";

export type Screen =
  | { name: "start" } // "Resume race?"
  | { name: "track" }
  | { name: "board"; trackId: string }
  | { name: "scan"; trackId: string }
  | { name: "roles"; trackId: string }
  | { name: "race" }
  | { name: "camera"; legend: CarColor }
  | { name: "tap"; legend: CarColor };

export const savedGame = deserialize(loadGameText());
export const game = signal<GameState | null>(null);
export const screen = signal<Screen>(savedGame ? { name: "start" } : { name: "track" });

export function setGame(next: GameState | null) {
  game.value = next;
  saveGameText(next ? serialize(next) : null);
}

export function update(fn: (g: GameState) => GameState) {
  if (game.value) setGame(fn(game.value));
}

export function lastRoles(): Roles {
  try {
    const r = JSON.parse(loadRolesText() ?? "null");
    const d = defaultRoles();
    if (r && Object.keys(d).every((c) => ["human", "legend", "out"].includes(r[c]))) return r;
    return d;
  } catch {
    return defaultRoles();
  }
}

export const rememberRoles = (roles: Roles) => saveRolesText(JSON.stringify(roles));
