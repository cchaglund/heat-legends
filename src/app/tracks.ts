// The tracks the app knows, with their reference images. The annotation is
// bundled (it is small); the image is a static file so the PWA can cache it.
import { deriveTrack, parseLegendCards } from "../engine";
import type { LegendCard, Track, TrackAnnotation } from "../engine";
import cardsJson from "../../data/legend-cards.json?raw";

export type TrackInfo = { id: string; name: string; track: Track; image: string; width: number; height: number };

const base = import.meta.env.BASE_URL;

// A track appears once its annotation is saved (tools/annotate-server.ts) and
// its image built (tools/prep-assets.ts). Heights at the 2000px reference width.
const BOARDS: Record<string, { name: string; height: number }> = {
  france: { name: "France", height: 1323 },
  "great-britain": { name: "Great Britain", height: 1294 },
  italy: { name: "Italy", height: 1314 },
  usa: { name: "USA", height: 1313 },
};
const annotations = import.meta.glob<string>("../../tracks/*.json", { query: "?raw", import: "default", eager: true });

export const TRACKS: TrackInfo[] = Object.keys(BOARDS).flatMap((id) => {
  const json = annotations[`../../tracks/${id}.json`];
  if (!json) return [];
  const track = deriveTrack(JSON.parse(json) as TrackAnnotation);
  return [{ id, name: BOARDS[id].name, track, image: `${base}tracks/${id}.jpg`, width: 2000, height: BOARDS[id].height }];
});

export const trackById = (id: string): TrackInfo | undefined => TRACKS.find((t) => t.id === id);

export const LEGEND_CARDS: LegendCard[] = parseLegendCards(JSON.parse(cardsJson));
