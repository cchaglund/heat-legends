// Display colours for the six cars. Black and silver get an outline so they
// stay visible on the dark theme and on the grey track.
import type { CarColor } from "../engine";

export const CAR_HEX: Record<CarColor, string> = {
  red: "#e0352b",
  blue: "#2f6fe4",
  green: "#2fa84f",
  yellow: "#f4c430",
  black: "#151515",
  silver: "#c4c9cf",
};

export const CAR_OUTLINE: Record<CarColor, string> = {
  red: "#00000000",
  blue: "#00000000",
  green: "#00000000",
  yellow: "#00000000",
  black: "#e8e8e8",
  silver: "#3a3a3a",
};

export const carName = (c: CarColor) => c[0].toUpperCase() + c.slice(1);
