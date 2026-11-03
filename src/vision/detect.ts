// Car detection in reference space.
//
// 1. Warp the frame onto the reference image with the registration H.
// 2. Normalize lighting: per-channel linear fit frame → reference, on board
//    pixels away from the track (robust, a few trimming rounds).
// 3. Cars are what the empty reference board doesn't have. A pixel on (or
//    near) the track is a car candidate if it differs from the reference in
//    a car-like way: clearly more colourful (red/blue/green/yellow), darker
//    than the darkest nearby asphalt (black), or much brighter and grey
//    (silver). Sheen on the asphalt — the main noise — is none of these.
// 4. Connected components → blobs → colour + class features.
// 5. Joint one-to-one assignment of blobs to the participating colours.
import { relativeSharpness } from "./quality";
import type { CV } from "./cv";
import type { H3 } from "./homography";

export type CarColor = "red" | "blue" | "green" | "yellow" | "black" | "silver";
export const CAR_COLORS: CarColor[] = ["red", "blue", "green", "yellow", "black", "silver"];

export type Rgb = { width: number; height: number; data: Uint8Array };

export type Blob = {
  x: number; // centroid, reference px
  y: number;
  area: number;
  box: [number, number, number, number];
  /** Mean colour distance from the reference over the blob's stronger half. */
  strength: number;
  /** area / bounding-box area. */
  fill: number;
  /** Fraction of the blob's pixels per candidate class. */
  colourFrac: number;
  darkFrac: number;
  brightFrac: number;
  rgb: [number, number, number]; // mean normalized colour of the blob's strongest pixels
  hsv: [number, number, number]; // h 0–360, s 0–1, v 0–1
  /** Mean edge strength the frame has beyond the reference's (car outline vs smooth glare). */
  edge: number;
};

export type Detection = { color: CarColor; blob: Blob; cost: number };

export type DetectResult = {
  blobs: Blob[];
  detections: Detection[];
  /** Normalized warped frame (reference space) for debugging. */
  normalized: Rgb;
  /** Candidate mask (reference space), 0/255. */
  mask: Uint8Array;
  /** Colour difference to the reference (reference space), track only. */
  diff: Float32Array;
  /** Detail on the visible track relative to the reference (quality gate). */
  sharpness: number;
  /** Reference pixels the frame covers, 0/1. */
  valid: Uint8Array;
};

export type ReferenceModel = {
  rgb: Rgb;
  /** Per-channel min / max of the blurred reference over a small window, so
   *  the difference tolerates 1–2px registration error at sharp edges. */
  lo: Uint8Array;
  hi: Uint8Array;
  /** Value (max channel) of lo / hi, and the local max chroma, 0–255. */
  vLo: Uint8Array;
  vHi: Uint8Array;
  chromaHi: Uint8Array;
  /** Asphalt (+ white lines) of the track, dilated: where cars can be. */
  track: Uint8Array;
  /** Board away from the track: used to fit the lighting. */
  background: Uint8Array;
  /** The reference's gradient, max over 7px (for `edgeExcess`). */
  gradMax: Float32Array;
};

const DIFF_THRESHOLD = 45;
const TOLERANCE_PX = 7;
const OFFSET_WINDOW_PX = 120;
const MIN_AREA = 120;
const MAX_AREA = 4500;
const GROUP_PX = 11;
const MAX_SIDE = 170;
const SILVER_MIN_EDGE = 30;
const MISSING_COST = 4;
const MAX_DETECTION_COST = 2.5;
const COLOUR = 1, DARK = 2, BRIGHT = 3;
const HUE_CENTER: Partial<Record<CarColor, number>> = { red: 355, yellow: 55, green: 150, blue: 212 };
const SPLIT_MIN_PX = 60;

export function buildReferenceModel(cv: CV, ref: Rgb): ReferenceModel {
  const { width, height, data } = ref;
  const n = width * height;
  const asphalt = new cv.Mat(height, width, cv.CV_8UC1);
  // Mat.data is a getter that makes a new view each call: hoist it out of loops.
  const asphaltData = asphalt.data;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    // Chroma, not saturation: saturation is unstable on near-black asphalt.
    const max = Math.max(data[j], data[j + 1], data[j + 2]);
    const chroma = max - Math.min(data[j], data[j + 1], data[j + 2]);
    asphaltData[i] = max < 97 && chroma < 33 ? 255 : 0;
  }
  // Close over the white lane markings, drop speckles, then grow so cars
  // whose tops stick out over the track edge still count.
  const closed = morph(cv, asphalt, cv.MORPH_CLOSE, 15);
  const opened = largestComponent(cv, morph(cv, closed, cv.MORPH_OPEN, 9, true));
  const track = morph(cv, opened, cv.MORPH_DILATE, 25);
  const farFromTrack = morph(cv, opened, cv.MORPH_DILATE, 60);
  const blurred = toMat(cv, blur(cv, ref, 3));
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(TOLERANCE_PX, TOLERANCE_PX));
  const lo = new cv.Mat(), hi = new cv.Mat();
  cv.erode(blurred, lo, k);
  cv.dilate(blurred, hi, k);
  const chroma = new cv.Mat(height, width, cv.CV_8UC1);
  const b = blurred.data, chromaData = chroma.data;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    chromaData[i] = Math.max(b[j], b[j + 1], b[j + 2]) - Math.min(b[j], b[j + 1], b[j + 2]);
  }
  const chromaHi = new cv.Mat();
  cv.dilate(chroma, chromaHi, k);
  const vOf = (m: any) => {
    const out = new Uint8Array(n), d = m.data;
    for (let i = 0, j = 0; i < n; i++, j += 3) out[i] = Math.max(d[j], d[j + 1], d[j + 2]);
    return out;
  };
  const out = {
    rgb: ref,
    lo: new Uint8Array(lo.data),
    hi: new Uint8Array(hi.data),
    vLo: vOf(lo),
    vHi: vOf(hi),
    chromaHi: new Uint8Array(chromaHi.data),
    track: new Uint8Array(track.data),
    gradMax: localMaxGradient(cv, ref),
    background: new Uint8Array(farFromTrack.data).map((v) => (v ? 0 : 255)),
  };
  [asphalt, opened, track, farFromTrack, blurred, k, lo, hi, chroma, chromaHi].forEach((m) => m.delete());
  return out;
}

export function detectCars(
  cv: CV,
  model: ReferenceModel,
  frame: Rgb,
  H: H3,
  colors: CarColor[],
  /** Keep only plausible blobs, e.g. those standing on a track space (M3). */
  accept: (b: Blob) => boolean = () => true,
): DetectResult {
  const { width, height } = model.rgb;
  const n = width * height;
  const warped = warp(cv, frame, H, width, height);
  const valid = warpValid(cv, frame, H, width, height);

  const normalized = removeLocalOffset(cv, model, normalizeLighting(model, warped, valid), valid);

  // Distance from the reference's local colour range, on the track only.
  const a = blur(cv, normalized, 3);
  const diff = new Float32Array(n);
  const cls = new Uint8Array(n);
  const maskMat = cv.Mat.zeros(height, width, cv.CV_8UC1), maskData = maskMat.data;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    if (!valid[i] || !model.track[i]) continue;
    let d2 = 0;
    for (let c = 0; c < 3; c++) {
      const v = a.data[j + c];
      const e = Math.max(0, model.lo[j + c] - v, v - model.hi[j + c]);
      d2 += e * e;
    }
    const d = Math.sqrt(d2);
    diff[i] = d;
    const v = Math.max(a.data[j], a.data[j + 1], a.data[j + 2]);
    const chroma = v - Math.min(a.data[j], a.data[j + 1], a.data[j + 2]);
    if (d > DIFF_THRESHOLD && chroma > 55 && chroma > model.chromaHi[i] + 30) cls[i] = COLOUR;
    else if (d > 25 && v < model.vLo[i] - 18) cls[i] = DARK;
    else if (d > DIFF_THRESHOLD && chroma < 50 && v > model.vHi[i] + 30) cls[i] = BRIGHT;
    if (cls[i]) maskData[i] = 255;
  }
  const cleaned = morph(cv, morph(cv, maskMat, cv.MORPH_OPEN, 3, true), cv.MORPH_CLOSE, 9, true);
  const mask = new Uint8Array(cleaned.data);

  const blobs = findBlobs(cv, cleaned, normalized, diff, cls, edgeExcess(model, normalized));
  cleaned.delete();

  const onTrack = valid.map((v, i) => v && model.track[i] ? 1 : 0);
  const sharpness = relativeSharpness(model.rgb, normalized, onTrack);
  return { blobs, detections: assign(blobs.filter(accept), colors), normalized, mask, diff, sharpness, valid };
}

/**
 * Per pixel: gradient magnitude of the frame minus the reference's local max
 * gradient (7px window, for registration error), floored at 0. Printed
 * lines cancel out; a car's outline and wheels remain, smooth glare doesn't.
 */
function edgeExcess(model: ReferenceModel, frame: Rgb): Float32Array {
  const { width: w, height: h, data } = frame;
  const out = new Float32Array(w * h);
  const g = (i: number) => (data[i * 3] * 77 + data[i * 3 + 1] * 150 + data[i * 3 + 2] * 29) / 256;
  for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
    if (!model.track[i]) continue;
    out[i] = Math.max(0, Math.abs(g(i + 1) - g(i - 1)) + Math.abs(g(i + w) - g(i - w)) - model.gradMax[i]);
  }
  return out;
}

function localMaxGradient(cv: CV, img: Rgb): Float32Array {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h), grad = cv.Mat.zeros(h, w, cv.CV_32F), max = new cv.Mat();
  for (let i = 0, j = 0; i < gray.length; i++, j += 3) gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) / 256;
  const gd = grad.data32F;
  for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++)
    gd[i] = Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]);
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
  cv.dilate(grad, max, k);
  const out = new Float32Array(max.data32F);
  [grad, max, k].forEach((m) => m.delete());
  return out;
}

// --- lighting -------------------------------------------------------------

function normalizeLighting(model: ReferenceModel, frame: Rgb, valid: Uint8Array): Rgb {
  // Per-channel histogram matching frame → reference over the pixels both
  // cover. Cars are well under 1% of those pixels, so they barely bias it.
  const n = frame.width * frame.height;
  const out = new Uint8Array(frame.data.length);
  for (let c = 0; c < 3; c++) {
    const hf = new Float64Array(256), hr = new Float64Array(256);
    for (let i = 0; i < n; i += 3) {
      if (!valid[i]) continue;
      hf[frame.data[i * 3 + c]]++;
      hr[model.rgb.data[i * 3 + c]]++;
    }
    const lut = matchLut(hf, hr);
    for (let i = 0; i < n; i++) out[i * 3 + c] = lut[frame.data[i * 3 + c]];
  }
  return { width: frame.width, height: frame.height, data: out };
}

/**
 * Glare and shadows vary across the board, so a global fit isn't enough.
 * Estimate the smooth per-channel offset frame − reference with a large
 * median filter (cars are much smaller than the window, so the median
 * ignores them) and subtract it.
 */
function removeLocalOffset(cv: CV, model: ReferenceModel, frame: Rgb, valid: Uint8Array): Rgb {
  const { width, height } = frame;
  const n = width * height;
  // Work at 1/8 resolution: the offset field is smooth (and medianBlur with a
  // big kernel is slow in WASM).
  const signed = new cv.Mat(height, width, cv.CV_8UC3);
  const sd = signed.data;
  for (let i = 0; i < n * 3; i++) {
    sd[i] = valid[(i / 3) | 0] ? clamp(128 + (frame.data[i] - model.rgb.data[i]) / 2) : 128;
  }
  const small = new cv.Mat();
  cv.resize(signed, small, new cv.Size(width >> 3, height >> 3), 0, 0, cv.INTER_AREA);
  const med = new cv.Mat();
  cv.medianBlur(small, med, OFFSET_WINDOW_PX >> 3 | 1);
  const field = new cv.Mat();
  cv.resize(med, field, new cv.Size(width, height), 0, 0, cv.INTER_LINEAR);
  const out = new Uint8Array(frame.data.length);
  const fd = field.data;
  for (let i = 0; i < n * 3; i++) out[i] = clamp(frame.data[i] - (fd[i] - 128) * 2);
  [signed, small, med, field].forEach((m) => m.delete());
  return { width, height, data: out };
}

function matchLut(src: Float64Array, ref: Float64Array): Uint8Array {
  const cdf = (h: Float64Array) => {
    const out = new Float64Array(256);
    let acc = 0;
    const total = h.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < 256; i++) out[i] = acc += h[i] / total;
    return out;
  };
  const cs = cdf(src), cr = cdf(ref);
  const lut = new Uint8Array(256);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    while (j < 255 && cr[j] < cs[i]) j++;
    lut[i] = j;
  }
  return lut;
}

// --- blobs ----------------------------------------------------------------

function findBlobs(cv: CV, mask: any, img: Rgb, diff: Float32Array, cls: Uint8Array, edge: Float32Array): Blob[] {
  // A car's evidence is often split (bright body, dark wheels/shadow), so
  // group candidate pixels that lie within GROUP_PX of each other: label the
  // dilated mask, then collect only the original mask pixels per group.
  const grouped = morph(cv, mask, cv.MORPH_DILATE, GROUP_PX);
  const labels = new cv.Mat();
  const count = cv.connectedComponents(grouped, labels, 8, cv.CV_32S);
  grouped.delete();
  const lab = labels.data32S as Int32Array;
  const pixels: number[][] = Array.from({ length: count }, () => []);
  const md = mask.data;
  for (let i = 0; i < lab.length; i++) if (lab[i] > 0 && md[i]) pixels[lab[i]].push(i);
  labels.delete();

  const blobs: Blob[] = [];
  for (let k = 1; k < count; k++) {
    if (pixels[k].length < MIN_AREA || pixels[k].length > MAX_AREA * 2) continue;
    for (const part of splitByHue(pixels[k], img, cls)) {
      if (part.length < MIN_AREA || part.length > MAX_AREA) continue;
      blobs.push(makeBlob(part, img, diff, cls, edge));
    }
  }
  return blobs;
}

/**
 * Two cars side by side on one space (a full space) merge into one group.
 * If the group's colourful pixels form two clearly different car hues, each
 * with enough pixels, split the group: colourful pixels by hue, the rest by
 * distance to the two parts' centroids.
 */
function splitByHue(all: number[], img: Rgb, cls: Uint8Array): number[][] {
  const width = img.width;
  const colourful = all.filter((p) => cls[p] === COLOUR);
  if (colourful.length < 2 * SPLIT_MIN_PX) return [all];
  const nearest = (p: number): CarColor | null => {
    const [h, s] = rgbToHsv(img.data[p * 3], img.data[p * 3 + 1], img.data[p * 3 + 2]);
    if (s < 0.3) return null;
    let best: CarColor | null = null, bestD = 25;
    for (const [c, centre] of Object.entries(HUE_CENTER) as [CarColor, number][]) {
      const d = Math.min(Math.abs(h - centre), 360 - Math.abs(h - centre));
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };
  const byHue = new Map<CarColor, number[]>();
  for (const p of colourful) {
    const c = nearest(p);
    if (c) byHue.set(c, [...(byHue.get(c) ?? []), p]);
  }
  const groups = [...byHue.values()].filter((g) => g.length >= SPLIT_MIN_PX && g.length >= 0.25 * colourful.length);
  if (groups.length < 2) return [all];
  groups.sort((g, h) => h.length - g.length);
  const [ga, gb] = groups;
  const centre = (g: number[]) => {
    let x = 0, y = 0;
    for (const p of g) { x += p % width; y += (p / width) | 0; }
    return [x / g.length, y / g.length];
  };
  const [ca, cb] = [centre(ga), centre(gb)];
  const inA = new Set(ga), inB = new Set(gb);
  const a: number[] = [], b: number[] = [];
  for (const p of all) {
    if (inA.has(p)) { a.push(p); continue; }
    if (inB.has(p)) { b.push(p); continue; }
    const x = p % width, y = (p / width) | 0;
    (Math.hypot(x - ca[0], y - ca[1]) <= Math.hypot(x - cb[0], y - cb[1]) ? a : b).push(p);
  }
  return [a, b];
}

function makeBlob(all: number[], img: Rgb, diff: Float32Array, cls: Uint8Array, edge: Float32Array): Blob {
  const width = img.width;
  const area = all.length;
  let sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const p of all) {
    const x = p % width, y = (p / width) | 0;
    sx += x; sy += y;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const frac = (c: number) => all.filter((p) => cls[p] === c).length / area;
  // Colour from the colourful pixels if there are enough, else from the
  // half of the blob that differs most (drops edges/shadow).
  const colourful = all.filter((p) => cls[p] === COLOUR);
  const px = colourful.length >= 20
    ? colourful
    : [...all].sort((p, q) => diff[q] - diff[p]).slice(0, Math.max(10, area >> 1));
  let r = 0, g = 0, b = 0, strength = 0;
  for (const p of px) { r += img.data[p * 3]; g += img.data[p * 3 + 1]; b += img.data[p * 3 + 2]; strength += diff[p]; }
  const rgb: [number, number, number] = [r / px.length, g / px.length, b / px.length];
  // A coloured car's blob often includes its shadow; centre it on the paint.
  let cx = sx / area, cy = sy / area;
  if (colourful.length >= 20) {
    cx = colourful.reduce((t, p) => t + (p % width), 0) / colourful.length;
    cy = colourful.reduce((t, p) => t + ((p / width) | 0), 0) / colourful.length;
  }
  const box: [number, number, number, number] = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  return {
    x: cx,
    y: cy,
    area,
    box,
    strength: strength / px.length,
    fill: area / (box[2] * box[3]),
    colourFrac: frac(COLOUR),
    darkFrac: frac(DARK),
    brightFrac: frac(BRIGHT),
    rgb,
    hsv: rgbToHsv(...rgb),
    edge: all.reduce((t, p) => t + edge[p], 0) / area,
  };
}

// --- colour models and assignment ----------------------------------------

/** Cost of calling this blob `color`; lower is better, roughly 0–5. */
export function colorCost(blob: Blob, color: CarColor): number {
  const [h, s, v] = blob.hsv;
  // Real cars are at least a few hundred px² in reference space.
  const small = Math.max(0, 500 - blob.area) / 200;
  if (color in HUE_CENTER) {
    const centre = HUE_CENTER[color]!;
    const dh = Math.min(Math.abs(h - centre), 360 - Math.abs(h - centre)) / 30;
    const lowSat = Math.max(0, 0.35 - s) / 0.1;
    return dh + lowSat + Math.max(0, 0.3 - blob.colourFrac) / 0.1 + small;
  }
  // Black and silver are judged by shape of the evidence, not hue. Measured
  // on the France fixtures: the black car is a large, mostly-darker blob;
  // the silver car is two-tone (bright body, dark wheels/shadow), whereas
  // asphalt sheen and white markings are bright only.
  // Size limit for black/silver only: their false blobs (blur, shadow, glare)
  // are mostly 150–390 px long in reference space; real cars ≤ ~135 px.
  // Coloured cars don't need it, and their blobs can grow by merging with a shadow.
  const tooLong = Math.max(0, Math.max(blob.box[2], blob.box[3]) - MAX_SIDE) / 10;
  if (color === "black") {
    return tooLong + Math.max(0, v - 0.3) / 0.06 + Math.max(0, 0.45 - blob.darkFrac) / 0.1 + Math.max(0, 900 - blob.area) / 200;
  }
  // Close-ups (D30) show the silver car as a compact, almost all-bright blob:
  // accept that as an alternative to two-tone.
  const twoTone = Math.max(0, 0.12 - blob.darkFrac) / 0.04 + Math.max(0, 800 - blob.area) / 200;
  const allBright = Math.max(0, 0.75 - blob.brightFrac) / 0.05 + Math.max(0, 450 - blob.area) / 100 +
    Math.max(0, blob.area - 1100) / 200;
  // Glare is bright too, but smooth: the car adds outline/wheel edges the
  // reference doesn't have (real silver blobs ≥ ~34, glare mostly < 30).
  const smooth = Math.max(0, SILVER_MIN_EDGE - blob.edge) / 5;
  return tooLong + Math.max(0, s - 0.22) / 0.06 + Math.max(0, 0.3 - blob.brightFrac) / 0.1 + Math.min(twoTone, allBright) + smooth;
}

/** Optimal one-to-one assignment (DP over colour subsets; ≤ 6 colours). */
export function assign(blobs: Blob[], colors: CarColor[]): Detection[] {
  const m = colors.length;
  const full = (1 << m) - 1;
  // best[i][mask] = min cost using blobs[i..] with colours in mask already used
  const memo = new Map<number, { cost: number; pick: number }>();
  const solve = (i: number, used: number): number => {
    if (i === blobs.length) {
      // unassigned colours are "missing"
      let missing = 0;
      for (let c = 0; c < m; c++) if (!(used & (1 << c))) missing++;
      return missing * MISSING_COST;
    }
    const key = i * 64 + used;
    const hit = memo.get(key);
    if (hit) return hit.cost;
    let best = solve(i + 1, used); // blob is not a car (e.g. a hand, glare)
    let pick = -1;
    for (let c = 0; c < m; c++) {
      if (used & (1 << c)) continue;
      const cost = colorCost(blobs[i], colors[c]) + solve(i + 1, used | (1 << c));
      if (cost < best) { best = cost; pick = c; }
    }
    memo.set(key, { cost: best, pick });
    return best;
  };
  solve(0, 0);
  const out: Detection[] = [];
  let used = 0;
  for (let i = 0; i < blobs.length && used !== full; i++) {
    const { pick } = memo.get(i * 64 + used) ?? { pick: -1 };
    if (pick >= 0) {
      out.push({ color: colors[pick], blob: blobs[i], cost: colorCost(blobs[i], colors[pick]) });
      used |= 1 << pick;
    }
  }
  return out.filter((d) => d.cost < MAX_DETECTION_COST);
}

// --- helpers --------------------------------------------------------------

function warp(cv: CV, img: Rgb, H: H3, width: number, height: number): Rgb {
  const src = new cv.Mat(img.height, img.width, cv.CV_8UC3);
  src.data.set(img.data);
  const Hm = cv.matFromArray(3, 3, cv.CV_64F, H);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, Hm, new cv.Size(width, height), cv.INTER_LINEAR);
  const out = { width, height, data: new Uint8Array(dst.data) };
  src.delete(); Hm.delete(); dst.delete();
  return out;
}

function warpValid(cv: CV, img: Rgb, H: H3, width: number, height: number): Uint8Array {
  const src = new cv.Mat(img.height, img.width, cv.CV_8UC1, new cv.Scalar(255));
  const Hm = cv.matFromArray(3, 3, cv.CV_64F, H);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, Hm, new cv.Size(width, height), cv.INTER_NEAREST);
  // Shrink a little so warp borders don't count.
  const eroded = morph(cv, dst, cv.MORPH_ERODE, 9);
  const out = new Uint8Array(eroded.data);
  src.delete(); Hm.delete(); dst.delete(); eroded.delete();
  return out;
}

function blur(cv: CV, img: Rgb, k: number): Rgb {
  const src = new cv.Mat(img.height, img.width, cv.CV_8UC3);
  src.data.set(img.data);
  const dst = new cv.Mat();
  cv.GaussianBlur(src, dst, new cv.Size(k, k), 0);
  const out = { width: img.width, height: img.height, data: new Uint8Array(dst.data) };
  src.delete(); dst.delete();
  return out;
}

function toMat(cv: CV, img: Rgb): any {
  const m = new cv.Mat(img.height, img.width, cv.CV_8UC3);
  m.data.set(img.data);
  return m;
}

function largestComponent(cv: CV, mask: any): any {
  const labels = new cv.Mat(), stats = new cv.Mat(), centroids = new cv.Mat();
  const count = cv.connectedComponentsWithStats(mask, labels, stats, centroids, 8, cv.CV_32S);
  // The track can be split into a few pieces (e.g. by start-grid markings):
  // keep every component at least 15% the size of the largest.
  let largest = 0;
  for (let k = 1; k < count; k++) largest = Math.max(largest, stats.data32S[k * 5 + 4]);
  const keep = new Uint8Array(count);
  for (let k = 1; k < count; k++) keep[k] = stats.data32S[k * 5 + 4] >= largest * 0.15 ? 1 : 0;
  const out = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
  const lab = labels.data32S;
  const od = out.data;
  for (let i = 0; i < lab.length; i++) if (keep[lab[i]]) od[i] = 255;
  labels.delete(); stats.delete(); centroids.delete(); mask.delete();
  return out;
}

/** Applies a morphology op with an elliptical kernel; optionally deletes the input. */
function morph(cv: CV, src: any, op: number, size: number, consume = false): any {
  const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(size, size));
  const dst = new cv.Mat();
  cv.morphologyEx(src, dst, op, k);
  k.delete();
  if (consume) src.delete();
  return dst;
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, max ? d / max : 0, max];
}

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
