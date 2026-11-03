// localStorage behind try/catch: private mode, a full quota or blocked storage
// must never break the game, it only means the race isn't saved.
const KEY_GAME = "heat-legends:game";
const KEY_ROLES = "heat-legends:roles";
// The UI gallery (?state=…) shares this origin: a tap there must not touch the real saved race.
const readOnly = typeof location !== "undefined" && new URLSearchParams(location.search).has("state");

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (readOnly) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // not saved; nothing else to do
  }
}

export const loadGameText = () => read(KEY_GAME);
export const saveGameText = (text: string | null) => write(KEY_GAME, text);
export const loadRolesText = () => read(KEY_ROLES);
export const saveRolesText = (text: string) => write(KEY_ROLES, text);
