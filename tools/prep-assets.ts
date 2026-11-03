// Builds the app's shipped track images (D10): the BGG board photo at the
// 2000px reference width, as JPEG, into public/tracks/<track>.jpg.
//
//   npx tsx tools/prep-assets.ts [track…]   (default: every track in tracks/)
import { readdir } from "node:fs/promises";
import sharp from "sharp";

const tracks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir("tracks")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
for (const t of tracks) {
  const out = `public/tracks/${t}.jpg`;
  const info = await sharp(`circuits/${t}.png`).resize({ width: 2000 }).jpeg({ quality: 90 }).toFile(out);
  console.log(`${out} ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
