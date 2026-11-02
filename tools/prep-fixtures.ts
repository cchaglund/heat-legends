// Copies raw phone photos/videos into committed fixtures:
//   fixtures-raw/<track>/<set>/*.jpg|jpeg|png|heic → fixtures/<track>/<set>/<name>.jpg
//   fixtures-raw/<track>/<set>/*.mov|mp4           → fixtures/<track>/scan-<suffix>/NN.jpg (1 frame/s)
// Photos keep their file name when it's meaningful (e.g. "red-silver.jpeg" =
// the cars of interest in that shot); camera/export names (IMG_1234, UUIDs)
// become a running number. Applies EXIF orientation, caps the long edge at
// 2048px and re-encodes, which drops all metadata (GPS included). Video frames
// come out of ffmpeg without metadata.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const RAW = "fixtures-raw";
const OUT = "fixtures";
const MAX_EDGE = 2048;
const VIDEO_FPS = 1;

for (const track of await readdir(RAW)) {
  for (const set of await readdir(join(RAW, track))) {
    const src = join(RAW, track, set);
    const files = (await readdir(src)).sort();
    const photos = files.filter((f) => /\.(jpe?g|png|heic)$/i.test(f));
    const videos = files.filter((f) => /\.(mov|mp4)$/i.test(f));

    if (photos.length) {
      const dst = join(OUT, track, set);
      await mkdir(dst, { recursive: true });
      let counter = 0;
      for (const f of photos) {
        const base = parse(f).name;
        const generic = /^(IMG_\d+|[0-9A-F]{8}-[0-9A-F-]{27}.*)$/i.test(base);
        const name = generic ? String(++counter).padStart(2, "0") : base.toLowerCase();
        await sharp(join(src, f))
          .rotate()
          .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(join(dst, `${name}.jpg`));
      }
      console.log(`${track}/${set}: ${photos.length} photos`);
    }

    for (const [k, v] of videos.entries()) {
      // closeup-light-c + IMG_2041.mov → scan-light-c (a second video gets -2, …)
      const suffix = set.replace(/^[^-]+-/, "");
      const dst = join(OUT, track, `scan-${suffix}${k ? `-${k + 1}` : ""}`);
      await rm(dst, { recursive: true, force: true });
      await mkdir(dst, { recursive: true });
      execFileSync("ffmpeg", [
        "-v", "error", "-i", join(src, v),
        "-vf", `fps=${VIDEO_FPS},scale='if(gt(iw,ih),min(${MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_EDGE},ih))'`,
        "-map_metadata", "-1", "-q:v", "3",
        join(dst, "%02d.jpg"),
      ]);
      console.log(`${track}/${set}/${v} → ${dst}: ${(await readdir(dst)).length} frames`);
    }
  }
}
