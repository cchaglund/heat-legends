// Main-thread side of the vision worker: one worker for the app, started the
// first time a camera screen opens (D18), with request/response promises.
// The worker is initialised per track, with the stored scan when there is one.
import type { TrackInfo } from "../tracks";
import { loadScan } from "./scanStore";
import type { FrameResult, Mode, Request, Response } from "./vision.worker";
import type { CarColor } from "../../engine";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let ready: { trackId: string; done: Promise<{ ownBoard: boolean }> } | null = null;

function call<T>(req: Request, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Response>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error) p?.reject(new Error(e.data.error));
      else p?.resolve(e.data.result);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, req }, transfer);
  });
}

/** Loads OpenCV and the track's reference once; later calls reuse it. */
export function prepare(info: TrackInfo): Promise<{ ownBoard: boolean }> {
  if (ready?.trackId !== info.id) {
    const done = loadScan(info.id).then((scan) =>
      call<{ ownBoard: boolean }>({ kind: "init", imageUrl: info.image, track: info.track, scan: scan?.image ?? null }),
    );
    done.catch(() => (ready = null));
    ready = { trackId: info.id, done };
  }
  return ready.done;
}

export const resetTracking = () => call<null>({ kind: "reset" });
export const buildScan = () => call<Blob>({ kind: "buildScan" });

export function processFrame(mode: Mode, frame: ImageBitmap, colors?: CarColor[]): Promise<FrameResult> {
  return call<FrameResult>({ kind: "frame", mode, frame, colors }, [frame]);
}
