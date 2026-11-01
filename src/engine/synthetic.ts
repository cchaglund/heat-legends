// Builds a circular annotation from corner positions given in "after space"
// terms, so tests (and later dev tools) can describe a track by indices alone.
import type { Boundary, Corner, TrackAnnotation } from "./types";

export function syntheticAnnotation(spaceCount: number, corners: Corner[], id = "synthetic"): TrackAnnotation {
  const boundaries: Boundary[] = Array.from({ length: spaceCount }, (_, i) => {
    const t = (2 * Math.PI * i) / spaceCount;
    const dir = { x: Math.cos(t), y: Math.sin(t) };
    return {
      a: { x: 500 + 400 * dir.x, y: 500 + 400 * dir.y },
      b: { x: 500 + 300 * dir.x, y: 500 + 300 * dir.y },
      raceline: "a",
    };
  });
  for (const c of corners) {
    (boundaries[(c.legendsAfter + 1) % spaceCount].tags ??= []).push({ kind: "legends" });
    (boundaries[(c.after + 1) % spaceCount].tags ??= []).push({ kind: "corner", speedLimit: c.speedLimit });
  }
  return { id, referenceImage: "", boundaries, laps: 1 };
}
