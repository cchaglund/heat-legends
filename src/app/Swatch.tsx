// A car-coloured dot, used wherever a colour is named.
import type { CarColor } from "../engine";
import { CAR_HEX, CAR_OUTLINE } from "./colours";

export function Swatch({ colour, size = 22 }: { colour: CarColor; size?: number }) {
  return (
    <span
      class="swatch"
      style={{ width: `${size}px`, height: `${size}px`, background: CAR_HEX[colour], boxShadow: `0 0 0 2px ${CAR_OUTLINE[colour]}` }}
      aria-hidden="true"
    />
  );
}
