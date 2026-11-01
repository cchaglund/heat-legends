// Shared engine types. The annotation (what the annotator saves) and the
// derived Track (what the rules run on) are separate on purpose: the rules
// only ever look at space indices and corner positions, never at geometry.

export const CAR_COLORS = ["red", "blue", "green", "yellow", "black", "silver"] as const;
export type CarColor = (typeof CAR_COLORS)[number];

export type Point = { x: number; y: number };

// --- Annotation (D12): lines across the track between spaces, in race order.
export type BoundaryTag =
  | { kind: "corner"; speedLimit: number } // Corner Line
  | { kind: "legends" } // Legends Line
  | { kind: "finish" };

export type Boundary = {
  a: Point;
  b: Point; // a is on the same side of the track every time
  raceline: "a" | "b"; // raceline side of the space AFTER this boundary (D14)
  tags?: BoundaryTag[];
};

export type TrackAnnotation = {
  id: string;
  referenceImage: string;
  boundaries: Boundary[]; // boundary i is the line *before* space i
  laps: number;
};

// --- Derived track. Spaces form a loop: the space after N-1 is 0.
export type SpotIndex = 0 | 1; // 0 = raceline spot
export type Spot = { id: string; polygon: Point[] };
export type Space = {
  index: number;
  quad: [Point, Point, Point, Point];
  spots: [Spot, Spot]; // spots[0] = raceline spot
};

export type Corner = {
  after: number; // the Corner Line sits after this space (= diamond 0)
  speedLimit: number;
  legendsAfter: number; // this corner's Legends Line sits after this space
};

export type Track = {
  id: string;
  referenceImage: string;
  laps: number;
  spaces: Space[];
  corners: Corner[]; // in race order
  finishAfter?: number;
};

// --- Board and cards.
export type Position = { space: number; spot: SpotIndex };
export type Board = Partial<Record<CarColor, Position>>;

// cars[colour] = [topSpeed, diamond], as in data/legend-cards.json.
export type LegendCard = { id: number; cars: Record<CarColor, readonly [number, number]> };

export type LegendMove = { from: Position; to: Position; reason: string };
