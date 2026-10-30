// Copies raw phone photos into committed fixtures:
// fixtures-raw/<track>/<set>/*.jpg → fixtures/<track>/<set>/NN.jpg
// Applies EXIF orientation, caps the long edge at 2048px and re-encodes,
// which drops all metadata (GPS included).
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const RAW = "fixtures-raw";
const OUT = "fixtures";
const MAX_EDGE = 2048;

for (const track of await readdir(RAW)) {
  for (const set of await readdir(join(RAW, track))) {
    const src = join(RAW, track, set);
    const files = (await readdir(src)).filter((f) => /\.(jpe?g|png|heic)$/i.test(f)).sort();
    const dst = join(OUT, track, set);
    await mkdir(dst, { recursive: true });
    for (const [i, f] of files.entries()) {
      await sharp(join(src, f))
        .rotate()
        .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(join(dst, `${String(i + 1).padStart(2, "0")}.jpg`));
    }
    console.log(`${track}/${set}: ${files.length} photos`);
  }
}
