// Markerless registration: camera frame → reference image homography.
//
// Two passes, because ORB is not robust to the strong foreshortening of
// shallow handheld shots:
//   1. coarse: ORB on the raw frame vs the reference → H1
//   2. refine: warp the frame into reference space with H1 (now roughly
//      top-down), ORB again → H2; final H = H2 · H1
import type { CV } from "./cv";

export type Gray = { width: number; height: number; data: Uint8Array };

export type RefFeatures = {
  width: number;
  height: number;
  keypoints: any; // cv.KeyPointVector
  descriptors: any; // cv.Mat
  image: any; // cv.Mat (gray), kept for the refine pass
};

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
const MIN_INLIERS = 40;

export function grayToMat(cv: CV, img: Gray): any {
  const m = new cv.Mat(img.height, img.width, cv.CV_8UC1);
  m.data.set(img.data);
  return m;
}

export function prepareReference(cv: CV, ref: Gray, nfeatures = 12000): RefFeatures {
  const image = grayToMat(cv, ref);
  const { keypoints, descriptors } = detect(cv, image, nfeatures);
  return { width: ref.width, height: ref.height, keypoints, descriptors, image };
}

// Shallow shots squash the board vertically. Stretching the frame by these
// factors before the coarse pass undoes some of that (cf. ASIFT tilt simulation).
const TILTS = [1, 1.7, 2.5];
const GOOD_COARSE = 150;

export function register(cv: CV, ref: RefFeatures, frame: Gray): Registration {
  const frameMat = grayToMat(cv, frame);
  try {
    const coarse = coarsePass(cv, ref, frameMat);
    if (!coarse.H || coarse.stats.inliers < MIN_INLIERS) {
      coarse.H?.delete();
      return { ok: false, H: null, coarse: coarse.stats, refine: null };
    }

    const warped = new cv.Mat();
    cv.warpPerspective(frameMat, warped, coarse.H, new cv.Size(ref.width, ref.height));
    const refine = matchPass(cv, ref, warped, 12000);
    warped.delete();

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

function coarsePass(cv: CV, ref: RefFeatures, frameMat: any) {
  let best: ReturnType<typeof matchPass> | undefined;
  for (const t of TILTS) {
    let pass: ReturnType<typeof matchPass>;
    if (t === 1) {
      pass = matchPass(cv, ref, frameMat, 8000);
    } else {
      const stretched = new cv.Mat();
      cv.resize(frameMat, stretched, new cv.Size(frameMat.cols, Math.round(frameMat.rows * t)), 0, 0, cv.INTER_LINEAR);
      pass = matchPass(cv, ref, stretched, 8000);
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

function matchPass(cv: CV, ref: RefFeatures, img: any, nfeatures: number) {
  const { keypoints, descriptors } = detect(cv, img, nfeatures);
  const empty = { H: null as any, stats: { matches: 0, inliers: 0, reprojError: Infinity } };
  if (descriptors.rows < 10) {
    keypoints.delete();
    descriptors.delete();
    return empty;
  }
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  matcher.knnMatch(descriptors, ref.descriptors, knn, 2);

  const src: number[] = [];
  const dst: number[] = [];
  for (let i = 0; i < knn.size(); i++) {
    const pair = knn.get(i);
    if (pair.size() < 2) continue;
    const a = pair.get(0);
    const b = pair.get(1);
    if (a.distance < RATIO * b.distance) {
      const p = keypoints.get(a.queryIdx).pt;
      const q = ref.keypoints.get(a.trainIdx).pt;
      src.push(p.x, p.y);
      dst.push(q.x, q.y);
    }
  }
  knn.delete();
  matcher.delete();
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
