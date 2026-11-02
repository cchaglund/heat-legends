// M1b phone benchmark page (bench.html): times the vision pipeline in a
// Worker on bundled fixture photos and on a fresh camera shot. Dev only:
// served by `npm run dev`, which exposes fixtures/, circuits/ and reports/.
import type { InitMsg, RunMsg, Timings } from "./worker";

const FIXTURES = ["blue", "red-silver", "red-silver-black", "yellow-green-blue", "black-red-silver"]
  .map((n) => `/fixtures/france/closeup-light-d/${n}.jpg`);

const $ = (id: string) => document.getElementById(id)!;
const log = (html: string) => $("out").insertAdjacentHTML("beforeend", html);
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const t0 = performance.now();
let queue: { name: string; file: Blob }[] = [];
let busy = false;

log(`<p>${navigator.userAgent}<br>cores: ${navigator.hardwareConcurrency ?? "?"}</p><p>Loading OpenCV…</p>`);
worker.postMessage({
  kind: "init",
  refUrl: "/circuits/france.png",
  detectRefUrl: "/reports/ref/france-scan-light-d.png",
  trackUrl: "/tracks/france.json",
} satisfies InitMsg);

worker.onmessage = (e) => {
  const m = e.data;
  if (m.kind === "error") { log(`<pre class="err">${m.message}</pre>`); busy = false; return next(); }
  if (m.kind === "ready") {
    log(`<p>Ready after ${Math.round(performance.now() - t0)} ms (${m.ownReference ? "own-board" : "BGG"} detection reference). ${table(m.timings)}</p>`);
    ($("fixtures") as HTMLButtonElement).disabled = false;
    ($("camera") as HTMLInputElement).disabled = false;
    return;
  }
  const total = Object.entries(m.timings as Timings).filter(([k]) => !k.startsWith("live:")).reduce((s, [, v]) => s + (v as number), 0);
  const cars = m.detections.map((d: { color: string; space: number }) => `${d.color}@${d.space}`).join(", ") || "none";
  log(`<h3>${m.name} <small>${m.size}</small></h3><p>snapshot total <b>${total} ms</b> · registered: ${m.ok} · live tracking ok: ${m.liveOk} · cars: ${cars}</p>${table(m.timings)}`);
  busy = false;
  next();
};

function table(t: Timings) {
  return `<table>${Object.entries(t).map(([k, v]) => `<tr><td>${k}</td><td>${v} ms</td></tr>`).join("")}</table>`;
}

function next() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift()!;
  worker.postMessage({ kind: "run", ...job } satisfies RunMsg);
}

$("fixtures").onclick = async () => {
  for (const url of FIXTURES) queue.push({ name: url.split("/").pop()!, file: await (await fetch(url)).blob() });
  next();
};
$("camera").onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) { queue.push({ name: `camera ${new Date().toLocaleTimeString()}`, file: f }); next(); }
};
