// Markerless registration: camera frame → reference image homography.
//
// Two passes, because ORB is not robust to the strong foreshortening of
// shallow handheld shots:
//   1. coarse: ORB on the raw frame vs the reference → H1
//   2. refine: warp the frame into reference space with H1 (now roughly
//      top-down), ORB again → H2; final H = H2 · H1
// Brute-force matching dominated the run time (≈1.7s per pass in Node), so
// the coarse pass matches few frame features against a smaller reference
// set, and the refine pass only compares features with reference features
// within LOCAL_PX of the same spot (after H1 they should nearly coincide).
import type { CV } from "./cv";

export type Gray = { width: number; height: number; data: Uint8Array };

export type RefFeatures = {
  width: number;
  height: number;
  keypoints: any; // cv.KeyPointVector
  descriptors: any; // cv.Mat
  image: any; // cv.Mat (gray), kept for the refine pass
  /** Fewer, stronger features for the global coarse match. */
  coarse: { keypoints: any; descriptors: any };
  /** All features bucketed by position, for the local refine match. */
  local: LocalIndex;
};

type LocalIndex = { xs: Float32Array; ys: Float32Array; desc: Uint32Array; cells: Map<number, number[]> };

export type Registration = {
  ok: boolean;
  /** 3×3 row-major, maps frame pixels → reference pixels. */
  H: number[] | null;
  coarse: PassStats;
  refine: PassStats | null;
};

export type PassStats = { matches: number; inliers: number; reprojError: number };

const RATIO = 0.8;
const RANSAC_PX = 4;
const MIN_COARSE_INLIERS = 10;
const MIN_REFINE_INLIERS = 150;
const MIN_TRACK_INLIERS = 60;
const TRACK_PX = 72; // the board may move this far (reference px) between live frames
const COARSE_REF_FEATURES = 4000;
const COARSE_FRAME_FEATURES = 2000;
const LOCAL_PX = 24;
const MAX_HAMMING = 64; // of 256 bits: a lone nearby candidate must still look alike

export function grayToMat(cv: CV, img: Gray): any {
  const m = new cv.Mat(img.height, img.width, cv.CV_8UC1);
  m.data.set(img.data);
  return m;
}

export function prepareReference(cv: CV, ref: Gray, nfeatures = 12000): RefFeatures {
  const image = grayToMat(cv, ref);
  const { keypoints, descriptors } = detect(cv, image, nfeatures);
  const coarse = detect(cv, image, COARSE_REF_FEATURES);
  return { width: ref.width, height: ref.height, keypoints, descriptors, image, coarse, local: localIndex(keypoints, descriptors) };
}

// Shallow shots squash the board vertically. Stretching the frame by these
// factors before the coarse pass undoes some of that (cf. ASIFT tilt simulation).
const TILTS = [1, 1.7, 2.5];
const GOOD_COARSE = 60;

export function register(cv: CV, ref: RefFeatures, frame: Gray): Registration {
  const frameMat = grayToMat(cv, frame);
  try {
    const coarse = coarsePass(cv, ref, frameMat);
    if (!coarse.H || coarse.stats.inliers < MIN_COARSE_INLIERS) {
      coarse.H?.delete();
      return { ok: false, H: null, coarse: coarse.stats, refine: null };
    }

    const warped = new cv.Mat();
    cv.warpPerspective(frameMat, warped, coarse.H, new cv.Size(ref.width, ref.height));
    const refine = matchPass(cv, ref, warped, 12000, true);
    warped.delete();

    // The local refine match is the real check: a wrong coarse H finds
    // almost no reference features where it expects them.
    if (!refine.H || refine.stats.inliers < MIN_REFINE_INLIERS) {
      coarse.H.delete();
      refine.H?.delete();
      return { ok: false, H: null, coarse: coarse.stats, refine: refine.stats };
    }
    let H = coarse.H;
    if (refine.H && refine.stats.inliers >= coarse.stats.inliers) {
      H = new cv.Mat();
      cv.gemm(refine.H, coarse.H, 1, new cv.Mat(), 0, H);
      coarse.H.delete();
    }
    refine.H?.delete();
    const out = Array.from(H.data64F as Float64Array).map((v) => v / H.data64F[8]);
    H.delete();
    return { ok: true, H: out, coarse: coarse.stats, refine: refine.stats };
  } finally {
    frameMat.delete();
  }
}

/**
 * Live mode (M6): follow the board from the previous frame's homography,
 * skipping the global coarse pass. Fails (ok: false) when the view moved too
 * far; the caller then falls back to `register`.
 */
export function track(cv: CV, ref: RefFeatures, frame: Gray, Hprev: number[], nfeatures = 3000, radius = TRACK_PX): Registration {
  const frameMat = grayToMat(cv, frame);
  const prev = cv.matFromArray(3, 3, cv.CV_64F, Hprev);
  const warped = new cv.Mat();
  try {
    cv.warpPerspective(frameMat, warped, prev, new cv.Size(ref.width, ref.height));
    const pass = matchPass(cv, ref, warped, nfeatures, true, radius);
    const stats = { matches: 0, inliers: 0, reprojError: Infinity };
    if (!pass.H || pass.stats.inliers < MIN_TRACK_INLIERS) {
      pass.H?.delete();
      return { ok: false, H: null, coarse: stats, refine: pass.stats };
    }
    const H = new cv.Mat();
    cv.gemm(pass.H, prev, 1, new cv.Mat(), 0, H);
    pass.H.delete();
    const out = Array.from(H.data64F as Float64Array);
    H.delete();
    return { ok: true, H: out.map((v) => v / out[8]), coarse: stats, refine: pass.stats };
  } finally {
    [frameMat, prev, warped].forEach((m) => m.delete());
  }
}

function coarsePass(cv: CV, ref: RefFeatures, frameMat: any) {
  let best: ReturnType<typeof matchPass> | undefined;
  for (const t of TILTS) {
    let pass: ReturnType<typeof matchPass>;
    if (t === 1) {
      pass = matchPass(cv, ref, frameMat, COARSE_FRAME_FEATURES);
    } else {
      const stretched = new cv.Mat();
      cv.resize(frameMat, stretched, new cv.Size(frameMat.cols, Math.round(frameMat.rows * t)), 0, 0, cv.INTER_LINEAR);
      pass = matchPass(cv, ref, stretched, COARSE_FRAME_FEATURES);
      stretched.delete();
      if (pass.H) {
        // pass.H maps stretched → ref; compose with frame → stretched.
        const S = cv.matFromArray(3, 3, cv.CV_64F, [1, 0, 0, 0, t, 0, 0, 0, 1]);
        const H = new cv.Mat();
        cv.gemm(pass.H, S, 1, new cv.Mat(), 0, H);
        pass.H.delete();
        S.delete();
        pass.H = H;
      }
    }
    if (!best || pass.stats.inliers > best.stats.inliers) {
      best?.H?.delete();
      best = pass;
    } else {
      pass.H?.delete();
    }
    if (best.stats.inliers >= GOOD_COARSE) break;
  }
  return best!;
}

function detect(cv: CV, img: any, nfeatures: number) {
  const orb = new (cv as any).ORB(nfeatures, 1.2, 8);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  orb.detectAndCompute(img, new cv.Mat(), keypoints, descriptors);
  orb.delete();
  return { keypoints, descriptors };
}

function matchPass(cv: CV, ref: RefFeatures, img: any, nfeatures: number, local = false, radius = LOCAL_PX) {
  const { keypoints, descriptors } = detect(cv, img, nfeatures);
  const empty = { H: null as any, stats: { matches: 0, inliers: 0, reprojError: Infinity } };
  if (descriptors.rows < 10) {
    keypoints.delete();
    descriptors.delete();
    return empty;
  }
  const src: number[] = [];
  const dst: number[] = [];
  if (local) {
    matchLocal(ref.local, keypoints, descriptors, src, dst, radius);
  } else {
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const knn = new cv.DMatchVectorVector();
    matcher.knnMatch(descriptors, ref.coarse.descriptors, knn, 2);
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() < 2) continue;
      const a = pair.get(0);
      const b = pair.get(1);
      if (a.distance < RATIO * b.distance) {
        const p = keypoints.get(a.queryIdx).pt;
        const q = ref.coarse.keypoints.get(a.trainIdx).pt;
        src.push(p.x, p.y);
        dst.push(q.x, q.y);
      }
    }
    knn.delete();
    matcher.delete();
  }
  keypoints.delete();
  descriptors.delete();

  const n = src.length / 2;
  if (n < 10) return { ...empty, stats: { ...empty.stats, matches: n } };

  const srcMat = cv.matFromArray(n, 1, cv.CV_32FC2, src);
  const dstMat = cv.matFromArray(n, 1, cv.CV_32FC2, dst);
  const mask = new cv.Mat();
  const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, RANSAC_PX, mask);

  let inliers = 0;
  let err = 0;
  if (!H.empty()) {
    const h = H.data64F;
    for (let i = 0; i < n; i++) {
      if (!mask.data[i]) continue;
      inliers++;
      const x = src[2 * i], y = src[2 * i + 1];
      const w = h[6] * x + h[7] * y + h[8];
      const px = (h[0] * x + h[1] * y + h[2]) / w;
      const py = (h[3] * x + h[4] * y + h[5]) / w;
      err += Math.hypot(px - dst[2 * i], py - dst[2 * i + 1]);
    }
  }
  srcMat.delete();
  dstMat.delete();
  mask.delete();
  if (H.empty()) {
    H.delete();
    return { ...empty, stats: { ...empty.stats, matches: n } };
  }
  return { H, stats: { matches: n, inliers, reprojError: inliers ? err / inliers : Infinity } };
}

function localIndex(keypoints: any, descriptors: any): LocalIndex {
  const n = keypoints.size();
  const xs = new Float32Array(n), ys = new Float32Array(n);
  const cells = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const p = keypoints.get(i).pt;
    xs[i] = p.x; ys[i] = p.y;
    const key = cellKey(Math.floor(p.x / LOCAL_PX), Math.floor(p.y / LOCAL_PX));
    let c = cells.get(key);
    if (!c) cells.set(key, (c = []));
    c.push(i);
  }
  // ORB descriptors are 32 bytes = 8 words per row
  const desc = new Uint32Array(new Uint8Array(descriptors.data).buffer.slice(0, n * 32));
  return { xs, ys, desc, cells };
}

const cellKey = (cx: number, cy: number) => cx * 100003 + cy;

/** Ratio-test matching against reference features within `radius` px only. */
function matchLocal(index: LocalIndex, keypoints: any, descriptors: any, src: number[], dst: number[], radius: number) {
  const reach = Math.ceil(radius / LOCAL_PX);
  const n = keypoints.size();
  const q = new Uint32Array(new Uint8Array(descriptors.data).buffer.slice(0, n * 32));
  for (let i = 0; i < n; i++) {
    const p = keypoints.get(i).pt;
    const cx = Math.floor(p.x / LOCAL_PX), cy = Math.floor(p.y / LOCAL_PX);
    let best = 257, second = 257, bestJ = -1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const j of index.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (Math.abs(index.xs[j] - p.x) > radius || Math.abs(index.ys[j] - p.y) > radius) continue;
          let d = 0;
          for (let w = 0; w < 8; w++) d += popcount(q[i * 8 + w] ^ index.desc[j * 8 + w]);
          if (d < best) { second = best; best = d; bestJ = j; } else if (d < second) second = d;
        }
      }
    }
    if (bestJ >= 0 && best < MAX_HAMMING && best < RATIO * second) {
      src.push(p.x, p.y);
      dst.push(index.xs[bestJ], index.ys[bestJ]);
    }
  }
}

function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
