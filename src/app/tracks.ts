// The tracks the app knows, with their reference images. The annotation is
// bundled (it is small); the image is a static file so the PWA can cache it.
import { deriveTrack, parseLegendCards } from "../engine";
import type { LegendCard, Track, TrackAnnotation } from "../engine";
import franceJson from "../../tracks/france.json?raw";
import cardsJson from "../../data/legend-cards.json?raw";

export type TrackInfo = { id: string; name: string; track: Track; image: string; width: number; height: number };

const base = import.meta.env.BASE_URL;

export const TRACKS: TrackInfo[] = [
  {
    id: "france",
    name: "France",
    track: deriveTrack(JSON.parse(franceJson) as TrackAnnotation),
    image: `${base}tracks/france.jpg`,
    width: 2000,
    height: 1323,
  },
];

export const trackById = (id: string): TrackInfo | undefined => TRACKS.find((t) => t.id === id);

export const LEGEND_CARDS: LegendCard[] = parseLegendCards(JSON.parse(cardsJson));
