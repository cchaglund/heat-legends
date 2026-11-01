// Review page for ground truth (D24): confirm or correct each car's position
// per fixture set, saved as fixtures/<track>/<set>/truth.json.
//
//   npm run vision:detect -- <track> <set>   # first: builds the photos + consensus data
//   npm run review [-- <track>]              # then open http://localhost:4600
//
// Markers start at the consensus position (median detection per colour from
// reports/detection/<track>/_<set>-blobs.json). Drag a marker to the car's
// true position, untick colours that aren't on the board, then Save.
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import sharp from "sharp";

const track = process.argv[2] ?? "france";
const PORT = 4600;
const REF_WIDTH = 2000;
const COLORS = ["red", "blue", "green", "yellow", "black", "silver"] as const;
const SWATCH: Record<string, string> = {
  red: "#ff2a2a", blue: "#2a7bff", green: "#22cc44", yellow: "#ffd400", black: "#111", silver: "#c8c8c8",
};
const REPORT = join("reports", "detection", track);

const refJpg = await sharp(join("circuits", `${track}.png`)).resize(REF_WIDTH).jpeg({ quality: 85 }).toBuffer();
const refMeta = await sharp(refJpg).metadata();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "POST" && url.pathname === "/save") {
      const body = JSON.parse(await readBody(req));
      const set = String(body.set);
      if (!/^[\w-]+$/.test(set)) throw new Error("bad set name");
      const path = join("fixtures", track, set, "truth.json");
      await writeFile(path, JSON.stringify({ status: "confirmed", positions: body.positions }, null, 2) + "\n");
      console.log(`saved ${path}`);
      return send(res, 200, "text/plain", "saved " + path);
    }
    if (url.pathname === "/ref.jpg") return send(res, 200, "image/jpeg", refJpg);
    if (url.pathname.startsWith("/report/")) {
      const file = normalize(url.pathname.slice("/report/".length));
      if (file.includes("..")) throw new Error("bad path");
      const path = join(REPORT, file);
      await stat(path);
      res.writeHead(200, { "content-type": extname(path) === ".jpg" ? "image/jpeg" : "application/octet-stream" });
      return createReadStream(path).pipe(res);
    }
    if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", await page());
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, 500, "text/plain", String(e));
  }
}).listen(PORT, () => console.log(`review page: http://localhost:${PORT}`));

async function page() {
  const sets = (await readdir(join("fixtures", track))).filter((s) => !s.startsWith("empty")).sort();
  const data = await Promise.all(sets.map(async (set) => {
    const truth = await readJson(join("fixtures", track, set, "truth.json"));
    const blobs: any[] = (await readJson(join(REPORT, `_${set}-blobs.json`))) ?? [];
    const photos = blobs.map((p) => p.photo as string);
    const positions: Record<string, [number, number] | null> = {};
    for (const c of COLORS) {
      if (truth?.positions && c in truth.positions) { positions[c] = truth.positions[c]; continue; }
      const pts = blobs.flatMap((p) => (p.blobs ?? []).filter((b: any) => b.color === c));
      const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
      positions[c] = pts.length ? [med(pts.map((b: any) => b.x)), med(pts.map((b: any) => b.y))] : null;
    }
    return { set, status: truth ? "confirmed" : photos.length ? "consensus" : "no detection data — run vision:detect", photos, positions };
  }));
  return `<!doctype html><meta charset="utf-8"><title>Review ${track}</title>
<style>
body{font:14px system-ui;margin:0;background:#1b1b1b;color:#ddd}
header{padding:10px 16px;background:#111;position:sticky;top:0;z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
main{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px;padding:12px}
#board{position:relative;user-select:none}#board img{width:100%;display:block}
.m{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #fff;cursor:grab;box-shadow:0 0 0 2px #000}
.m.off{display:none}.m span{position:absolute;left:28px;top:2px;font-weight:600;text-shadow:0 0 3px #000;white-space:nowrap}
#photos{max-height:calc(100vh - 80px);overflow:auto}#photos img{width:100%;margin-bottom:8px}
label{margin-right:10px}button{font:inherit;padding:6px 14px}.status{opacity:.75}
</style>
<header><select id="set"></select><span class="status" id="status"></span><span id="toggles"></span><button id="save">Save truth.json</button><span id="msg"></span></header>
<main><div id="board"><img src="/ref.jpg" draggable="false"></div><div id="photos"></div></main>
<script>
const DATA = ${JSON.stringify(data)};
const COLORS = ${JSON.stringify(COLORS)}, SWATCH = ${JSON.stringify(SWATCH)}, W = ${refMeta.width}, H = ${refMeta.height};
const sel = document.getElementById('set'), board = document.getElementById('board');
DATA.forEach((d, i) => sel.add(new Option(d.set, i)));
let cur;
function show(i) {
  cur = DATA[i];
  document.getElementById('status').textContent = cur.status;
  document.getElementById('photos').innerHTML = cur.photos.map(p => '<img loading="lazy" src="/report/' + p + '.jpg" title="' + p + '">').join('');
  board.querySelectorAll('.m').forEach(m => m.remove());
  document.getElementById('toggles').innerHTML = COLORS.map(c => '<label><input type="checkbox" data-c="' + c + '"' + (cur.positions[c] ? ' checked' : '') + '> ' + c + '</label>').join('');
  for (const c of COLORS) {
    const p = cur.positions[c] ?? [W / 2, H / 2];
    const m = document.createElement('div');
    m.className = 'm' + (cur.positions[c] ? '' : ' off'); m.dataset.c = c; m.style.background = SWATCH[c];
    m.innerHTML = '<span>' + c + '</span>'; place(m, p); board.append(m);
    m.onpointerdown = e => { m.setPointerCapture(e.pointerId); m.onpointermove = ev => {
      const r = board.getBoundingClientRect(); place(m, [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H]); }; };
    m.onpointerup = () => { m.onpointermove = null; };
  }
  document.querySelectorAll('#toggles input').forEach(t => t.onchange = () => {
    board.querySelector('.m[data-c="' + t.dataset.c + '"]').classList.toggle('off', !t.checked); });
}
function place(m, [x, y]) { m.dataset.x = x; m.dataset.y = y; m.style.left = (x / W * 100) + '%'; m.style.top = (y / H * 100) + '%'; }
sel.onchange = () => show(+sel.value); show(0);
document.getElementById('save').onclick = async () => {
  const positions = {};
  board.querySelectorAll('.m:not(.off)').forEach(m => positions[m.dataset.c] = [Math.round(+m.dataset.x), Math.round(+m.dataset.y)]);
  const r = await fetch('/save', { method: 'POST', body: JSON.stringify({ set: cur.set, positions }) });
  document.getElementById('msg').textContent = await r.text();
  if (r.ok) { cur.status = 'confirmed'; cur.positions = Object.fromEntries(COLORS.map(c => [c, positions[c] ?? null])); document.getElementById('status').textContent = 'confirmed'; }
};
</script>`;
}

async function readJson(path: string): Promise<any> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
    req.on("error", reject);
  });
}

function send(res: import("node:http").ServerResponse, code: number, type: string, body: string | Buffer) {
  res.writeHead(code, { "content-type": type });
  res.end(body);
}
