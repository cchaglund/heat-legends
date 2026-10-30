// Loads OpenCV.js once. Works in Node (tools, tests) and in a browser Worker.
import cvModule from "@techstark/opencv-js";

export type CV = typeof cvModule;

let ready: Promise<CV> | undefined;

export function loadCv(): Promise<CV> {
  ready ??= (async () => {
    const m: any = cvModule;
    if (m instanceof Promise) return (await m) as CV;
    if (!m.Mat) await new Promise<void>((resolve) => (m.onRuntimeInitialized = resolve));
    return m as CV;
  })();
  return ready;
}
