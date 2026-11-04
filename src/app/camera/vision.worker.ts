// The vision pipeline off the main thread. One worker per app; it keeps the
// reference (features + detection model) for the current track and the last
// homography, so consecutive frames are tracked instead of registered from
// scratch. All homographies it returns map *video* pixels → reference px,
// whatever size it processed the frame at.
import type { Track } from "../../engine";
import { spaceAtPoint, spotCenter } from "../../engine/track";
import { loadCv, type CV } from "../../vision/cv";
import { buildReferenceModel, detectCars, type CarColor, type ReferenceModel, type Rgb } from "../../vision/detect";
import { scaleInput, type H3 } from "../../vision/homography";
import { sharpness } from "../../vision/quality";
import { prepareReference, register, track, type Gray, type RefFeatures } from "../../vision/registration";
import { ScanAccumulator } from "../../vision/scan";
import type { ViewDetection } from "../../vision/sweep";

export type Mode = "scan" | "sweep" | "live";
export type Request =
  | { kind: "init"; imageUrl: string; track: Track; scan: Blob | null }
  | { kind: "frame"; mode: Mode; frame: ImageBitmap; colors?: CarColor[] }
  /** `rescan`: the next scan is a rescan mid-race (D36): cars stay on the board. */
  | { kind: "reset"; rescan?: Rescan }
  | { kind: "buildScan" };
export type Rescan = { cars: { x: number; y: number }[]; colors: CarColor[] };
export type FrameResult = {
  ok: boolean;
  H: H3 | null;
  width: number; // video px
  height: number;
  detections?: ViewDetection[];
  /** scan mode: per space, the share of its sample points seen sharp by ≥3 views; and whether this frame was used. */
  coverage?: number[];
  used?: boolean;
  ms: number;
};
export type Response = { id: number; error?: string; result?: unknown };

const DETECT_EDGE = 1920; // phone video is 1080×1920; detection was tuned on ≤2048px photos
const LIVE_EDGE = 640;
const POLISH_PX = 24; // scan frames: one more local match, the median needs ±2px alignment
const BLUR_FACTOR = 0.5; // scan frames: skip one less than half as sharp as recent ones
// Scan frames are taken at most once a second. More is worse: with ~200 views
// the 3 sharpest per pixel are the closest ones, a crisper board than play
// views see, and silver/black detection drops (silver 7/8 → 0/8 on the
// close-ups; tools/scan-sim-video.ts EVERY=1 vs 10).
const SCAN_INTAKE_MS = 1000;
// Rescan (D36): pixels this close to a known or detected car keep the old scan.
const CAR_MARGIN_PX = 30;

let cv: CV;
let ref: RefFeatures;
let model: ReferenceModel;
let base: Rgb;
let current: Rgb; // the detection reference: the stored scan, or the printed board
let rescan: Rescan | null = null;
let board: Track;
let samples: { x: number; y: number }[][] = [];
let prevH: H3 | null = null; // video px → reference
let scan: ScanAccumulator | null = null;
let recentSharpness: number[] = [];
let lastIntake = 0;

self.onmessage = async (e: MessageEvent<{ id: number; req: Request }>) => {
  const { id, req } = e.data;
  try {
    const result = await handle(req);
    postMessage({ id, result } satisfies Response);
  } catch (err) {
    postMessage({ id, error: String((err as Error)?.message ?? err) } satisfies Response);
  }
};

async function handle(req: Request): Promise<unknown> {
  switch (req.kind) {
    case "init": {
      cv ??= await loadCv();
      base = await decode(await (await fetch(req.imageUrl)).blob(), Infinity);
      ref = prepareReference(cv, toGray(base));
      board = req.track;
      samples = board.spaces.map((s) => [spotCenter(board, { space: s.index, spot: 0 }), spotCenter(board, { space: s.index, spot: 1 })]);
      current = req.scan ? await decode(req.scan, Infinity) : base;
      model = buildReferenceModel(cv, current, roadOf(board));
      prevH = null;
      return { ownBoard: !!req.scan };
    }
    case "reset":
      prevH = null;
      scan = null;
      rescan = req.rescan ?? null;
      recentSharpness = [];
      lastIntake = 0;
      return null;
    case "buildScan": {
      if (!scan) throw new Error("no scan in progress");
      const img = scan.build();
      current = img;
      model = buildReferenceModel(cv, img, roadOf(board));
      return await encodeJpeg(img);
    }
    case "frame":
      return frame(req.mode, req.frame, req.colors ?? []);
  }
}

const roadOf = (t: Track) => t.spaces.map((s) => s.quad);

function frame(mode: Mode, bitmap: ImageBitmap, colors: CarColor[]): FrameResult {
  const t0 = performance.now();
  const { width, height } = bitmap;
  const rgb = drawScaled(bitmap, mode === "live" ? LIVE_EDGE : DETECT_EDGE);
  bitmap.close();
  const f = rgb.width / width; // processed px per video px
  const gray = toGray(rgb);
  const fail = (): FrameResult => ({ ok: false, H: null, width, height, ms: performance.now() - t0 });

  let reg = prevH ? track(cv, ref, gray, scaleInput(prevH, 1 / f)) : null;
  if (!reg?.ok) reg = register(cv, ref, gray);
  if (!reg.ok) {
    prevH = null;
    return fail();
  }
  let H = reg.H!;
  prevH = scaleInput(H, f);
  const out: FrameResult = { ok: true, H: prevH, width, height, ms: 0 };

  if (mode === "sweep") {
    const res = detectCars(cv, model, rgb, H, colors, onSpace);
    out.detections = res.detections.map((d) => ({ color: d.color, x: d.blob.x, y: d.blob.y }));
  } else if (mode === "scan") {
    scan ??= newScan();
    const s = sharpness(gray);
    const typical = recentSharpness.length ? [...recentSharpness].sort((a, b) => a - b)[recentSharpness.length >> 1] : 0;
    recentSharpness = [...recentSharpness.slice(-14), s];
    out.used = s >= BLUR_FACTOR * typical && t0 - lastIntake >= SCAN_INTAKE_MS;
    if (out.used) {
      lastIntake = t0;
      const polished = track(cv, ref, gray, H, 12000, POLISH_PX);
      if (polished.ok) H = polished.H!;
      // Rescan: cars detected on a space vote; one seen in ≥2 frames keeps the
      // old scan. Not every candidate blob: those recur wherever the light
      // changed, which is exactly what the rescan must refresh (D36).
      if (rescan) {
        for (const { blob: { box: [x, y, w, h] } } of detectCars(cv, model, rgb, H, rescan.colors, onSpace).detections)
          scan.markCandidate(x - CAR_MARGIN_PX, y - CAR_MARGIN_PX, x + w + CAR_MARGIN_PX, y + h + CAR_MARGIN_PX);
      }
      scan.add(cv, rgb, H);
    }
    out.coverage = samples.map((pts) => scan!.coverage(pts));
  }
  out.ms = performance.now() - t0;
  return out;
}

const onSpace = (b: { x: number; y: number }) => spaceAtPoint(board, b.x, b.y) >= 0;

function newScan(): ScanAccumulator {
  if (!rescan) return new ScanAccumulator(base);
  const acc = new ScanAccumulator(current);
  const m = CAR_MARGIN_PX + 15; // a spot centre, plus half a car
  for (const c of rescan.cars) acc.excludeBox(c.x - m, c.y - m, c.x + m, c.y + m);
  return acc;
}

function drawScaled(src: ImageBitmap, edge: number): Rgb {
  const s = Math.min(1, edge / Math.max(src.width, src.height));
  const width = Math.round(src.width * s), height = Math.round(src.height * s);
  const ctx = new OffscreenCanvas(width, height).getContext("2d")!;
  ctx.drawImage(src, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; j < data.length; i += 4, j += 3) { data[j] = rgba[i]; data[j + 1] = rgba[i + 1]; data[j + 2] = rgba[i + 2]; }
  return { width, height, data };
}

async function decode(blob: Blob, edge: number): Promise<Rgb> {
  const bmp = await createImageBitmap(blob);
  const rgb = drawScaled(bmp, edge);
  bmp.close();
  return rgb;
}

function encodeJpeg(img: Rgb): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  for (let i = 0, j = 0; j < img.data.length; i += 4, j += 3) {
    out.data[i] = img.data[j]; out.data[i + 1] = img.data[j + 1]; out.data[i + 2] = img.data[j + 2]; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

function toGray(img: Rgb): Gray {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 3) out[i] = (img.data[j] * 77 + img.data[j + 1] * 150 + img.data[j + 2] * 29) >> 8;
  return { width: img.width, height: img.height, data: out };
}
