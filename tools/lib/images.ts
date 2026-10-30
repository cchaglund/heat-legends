import sharp from "sharp";
import type { Gray } from "../../src/vision/registration";

export type Rgb = { width: number; height: number; data: Uint8Array };

export async function loadRgb(path: string, maxEdge?: number): Promise<Rgb> {
  let img = sharp(path).rotate().removeAlpha();
  if (maxEdge) img = img.resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

export function toGray(img: Rgb): Gray {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 3) {
    out[i] = (img.data[j] * 77 + img.data[j + 1] * 150 + img.data[j + 2] * 29) >> 8;
  }
  return { width: img.width, height: img.height, data: out };
}

export function saveRgb(img: Rgb, path: string, width?: number) {
  let s = sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } });
  if (width) s = s.resize(width);
  return s.jpeg({ quality: 80 }).toFile(path);
}
