// Design proposals (2026-11-04): five alternative looks over the same markup,
// picked with ?theme=<id>. CSS only, scoped under :root[data-theme], so the one
// chosen can become the default stylesheet without touching a component.
// Fonts come from Google Fonts for the proposal; a chosen theme should self-host
// them so the PWA keeps working offline.
import "./pitwall.css";
import "./programme.css";
import "./chequered.css";
import "./nightrace.css";
import "./gamenight.css";

export type Theme = { id: string; name: string; blurb: string; themeColor: string; fonts?: string };

export const THEMES: Theme[] = [
  { id: "default", name: "Current", blurb: "Today's look, for comparison.", themeColor: "#15171a" },
  {
    id: "pitwall",
    name: "Pit Wall",
    blurb: "Timing-screen precision: pure black, monospace, hairlines, one purple (fastest sector). Dense and calm in a dim room.",
    themeColor: "#000000",
    fonts: "family=JetBrains+Mono:wght@400;500;700;800",
  },
  {
    id: "programme",
    name: "Race Programme",
    blurb: "A 1960s race-day programme, like the box art: cream paper, ink, serif display type, condensed caps, petrol accent.",
    themeColor: "#f1e9d8",
    fonts: "family=DM+Serif+Display:ital@0;1&family=Oswald:wght@500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600",
  },
  {
    id: "chequered",
    name: "Chequered Flag",
    blurb: "Black and white only, square corners, racing italics and a chequered strip. Loud and decisive; the cars are the only colour.",
    themeColor: "#ffffff",
    fonts: "family=Barlow+Condensed:ital,wght@1,600;1,800&family=Barlow:wght@400;500;600",
  },
  {
    id: "nightrace",
    name: "Night Race",
    blurb: "A floodlit street race: deep navy, layered depth, frosted panels floating over the camera, a single electric cyan.",
    themeColor: "#0b1020",
    fonts: "family=Manrope:wght@400;500;600;700;800",
  },
  {
    id: "gamenight",
    name: "Game Night",
    blurb: "Tabletop warmth: plum felt, rounded type, chunky buttons that press down like game pieces, tangerine for go.",
    themeColor: "#2a1b33",
    fonts: "family=Fredoka:wght@400;500;600;700",
  },
];

const KEY = "heat-legends:theme";

/** The theme to use: ?theme=<id> wins (and, outside the gallery, is remembered; ?theme=default forgets it). */
export function chooseTheme(q: URLSearchParams, remember: boolean): string {
  const asked = q.get("theme");
  try {
    if (asked && remember) {
      if (asked === "default") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, asked);
    }
    return asked ?? (remember ? localStorage.getItem(KEY) : null) ?? "default";
  } catch {
    return asked ?? "default";
  }
}

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id);
  if (!t || t.id === "default") return;
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.themeColor);
  if (t.fonts) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${t.fonts}&display=swap`;
    document.head.appendChild(link);
  }
}
