// The rear camera as a <video>, plus a frame loop that hands one frame at a
// time to the worker: the next frame is grabbed only when the previous result
// is back, so a slow phone simply processes fewer frames.
import { useEffect, useRef, useState } from "preact/hooks";

export type CameraState = { status: "starting" | "running" | "error"; message?: string };

export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({ status: "starting" });
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        setState({ status: "running" });
      })
      .catch((e: Error) => setState({ status: "error", message: e.message || String(e) }));
    if (!navigator.mediaDevices) setState({ status: "error", message: "No camera access (the page must be opened over HTTPS)." });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return { video, state };
}

/** Runs `step` on frame after frame while `active`; `step` resolves when it is done with one. */
export function useFrameLoop(video: { current: HTMLVideoElement | null }, active: boolean, step: (frame: ImageBitmap) => Promise<void>) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!active) return;
    let stop = false;
    (async () => {
      while (!stop) {
        const v = video.current;
        if (!v || v.readyState < 2 || !v.videoWidth) {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        try {
          await stepRef.current(await createImageBitmap(v));
        } catch (e) {
          console.error(e);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [active]);
}

/** Maps video px to the on-screen <video> (object-fit: cover) in CSS px. */
export function coverTransform(v: HTMLVideoElement) {
  const cw = v.clientWidth, ch = v.clientHeight;
  const s = Math.max(cw / v.videoWidth, ch / v.videoHeight);
  const ox = (cw - v.videoWidth * s) / 2, oy = (ch - v.videoHeight * s) / 2;
  return { s, ox, oy, toScreen: (p: { x: number; y: number }) => ({ x: ox + p.x * s, y: oy + p.y * s }) };
}
