// M1b bench worker: the vision pipeline as the app will run it, off the main
// thread, timing each stage. Images arrive as encoded files (Blob) and are
// decoded here, so decode time counts too.
import { deriveTrack, spaceAtPoint } from "../engine/track";
import type { Track } from "../engine/types";
import { loadCv, type CV } from "../vision/cv";
import { CAR_COLORS, buildReferenceModel, detectCars, type ReferenceModel, type Rgb } from "../vision/detect";
import { prepareReference, register, track, type Gray, type RefFeatures } from "../vision/registration";

const REF_WIDTH = 2000;
const PHOTO_EDGE = 2048; // what the fixtures were prepared at
const LIVE_EDGE = 640; // M6 live mode: frames are tracked at this size

let cv: CV, ref: RefFeatures, model: ReferenceModel, board: Track;

export type InitMsg = { kind: "init"; refUrl: string; detectRefUrl: string; trackUrl: string };
export type RunMsg = { kind: "run"; name: string; file: Blob };
export type Timings = Record<string, number>;

self.onmessage = async (e: MessageEvent<InitMsg | RunMsg>) => {
  try {
    const msg = e.data;
    if (msg.kind === "init") {
      const t: Timings = {};
      await time(t, "opencv load+init", async () => { cv = await loadCv(); });
      const refRgb = await time(t, "reference decode", async () => decode(await (await fetch(msg.refUrl)).blob(), REF_WIDTH, true));
      await time(t, "reference features", async () => { ref = prepareReference(cv, toGray(refRgb)); });
      const det = await fetch(msg.detectRefUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      const detRgb = det ? await decode(det, REF_WIDTH, true) : refRgb;
      await time(t, "reference model", async () => { model = buildReferenceModel(cv, detRgb); });
      board = deriveTrack(await (await fetch(msg.trackUrl)).json());
      postMessage({ kind: "ready", timings: t, ownReference: !!det });
      return;
    }
    const t: Timings = {};
    const rgb = await time(t, "decode", () => decode(msg.file, PHOTO_EDGE));
    const gray = toGray(rgb);
    const reg = await time(t, "register", async () => register(cv, ref, gray));
    let detections: { color: string; space: number }[] = [];
    if (reg.ok) {
      const res = await time(t, "detect", async () =>
        detectCars(cv, model, rgb, reg.H!, CAR_COLORS, (b) => spaceAtPoint(board, b.x, b.y) >= 0));
      detections = res.detections.map((d) => ({ color: d.color, space: spaceAtPoint(board, d.blob.x, d.blob.y) }));
    }
    // Live mode: one full registration to lock on, then cheap frame-to-frame
    // tracking (timed on the same frame, i.e. zero motion).
    const small = toGray(await decode(msg.file, LIVE_EDGE));
    const lock = await time(t, `live: lock on @${LIVE_EDGE}px`, async () => register(cv, ref, small));
    const live = lock.ok ? await time(t, `live: track frame @${LIVE_EDGE}px`, async () => track(cv, ref, small, lock.H!)) : lock;
    postMessage({ kind: "result", name: msg.name, timings: t, ok: reg.ok, liveOk: live.ok, size: `${rgb.width}×${rgb.height}`, detections });
  } catch (err) {
    postMessage({ kind: "error", message: String((err as Error)?.stack ?? err) });
  }
};

async function time<T>(t: Timings, label: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await f();
  t[label] = Math.round(performance.now() - t0);
  return out;
}

/** Decode to RGB, scaled so the long edge (or, for the reference, the width) is ≤ `edge`. */
async function decode(file: Blob, edge: number, byWidth = false): Promise<Rgb> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, edge / (byWidth ? bmp.width : Math.max(bmp.width, bmp.height)));
  const width = Math.round(bmp.width * s), height = Math.round(bmp.height * s);
  const ctx = new OffscreenCanvas(width, height).getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; j < data.length; i += 4, j += 3) { data[j] = rgba[i]; data[j + 1] = rgba[i + 1]; data[j + 2] = rgba[i + 2]; }
  return { width, height, data };
}

function toGray(img: Rgb): Gray {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 3) out[i] = (img.data[j] * 77 + img.data[j + 1] * 150 + img.data[j + 2] * 29) >> 8;
  return { width: img.width, height: img.height, data: out };
}
