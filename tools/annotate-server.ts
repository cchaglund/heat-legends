// Track annotator (M3, D12/D14/D28). Starts from tracks/<track>.json, or the
// automatic draft from tools/find-boundaries.ts, and saves tracks/<track>.json.
//
//   npx tsx tools/find-boundaries.ts france   # once: the draft
//   npm run annotate [-- <track>]             # then open http://localhost:4610
//
// On the page: click a line to select it, then tag it (corner + speed limit,
// Legends Line, finish), flip the raceline from that space on, drag its ends,
// or delete it. "Add line": click both road edges. Each space shows its
// distance to the next corner, to compare with the numbers printed beside
// the track (D28). Saving runs the engine's deriveTrack, which refuses an
// inconsistent track.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import sharp from "sharp";
import { deriveTrack } from "../src/engine/track";
import type { TrackAnnotation } from "../src/engine/types";

const track = process.argv[2] ?? "france";
const PORT = Number(process.env.PORT ?? 4610);
const REF_WIDTH = 2000;
const OUT = join("tracks", `${track}.json`);

const refJpg = await sharp(join("circuits", `${track}.png`)).resize(REF_WIDTH).jpeg({ quality: 85 }).toBuffer();
const { height } = await sharp(refJpg).metadata();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "POST" && url.pathname === "/save") {
      const ann: TrackAnnotation = JSON.parse(await readBody(req));
      try {
        const t = deriveTrack(ann);
        await mkdir("tracks", { recursive: true });
        await writeFile(OUT, JSON.stringify(ann, null, 1) + "\n");
        console.log(`saved ${OUT}`);
        return send(res, 200, "text/plain", `saved ${OUT}: ${t.spaces.length} spaces, ${t.corners.length} corners`);
      } catch (e) {
        return send(res, 422, "text/plain", `not saved: ${(e as Error).message}`);
      }
    }
    if (url.pathname === "/ref.jpg") return send(res, 200, "image/jpeg", refJpg);
    if (url.pathname === "/") {
      const ann = (await readJson(OUT)) ?? (await readJson(join("reports", "boundaries", `${track}.json`)));
      if (!ann) return send(res, 404, "text/plain", `no ${OUT} and no draft: run npx tsx tools/find-boundaries.ts ${track}`);
      return send(res, 200, "text/html", page(ann));
    }
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, 500, "text/plain", String(e));
  }
}).listen(PORT, () => console.log(`annotator: http://localhost:${PORT}`));

function page(ann: TrackAnnotation) {
  return `<!doctype html><meta charset="utf-8"><title>Annotate ${track}</title>
<style>
body{font:14px system-ui;margin:0;background:#1b1b1b;color:#ddd}
header{padding:8px 12px;background:#111;position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button{font:inherit;padding:5px 10px}input[type=number]{width:3em;font:inherit}
#wrap{position:relative;margin:8px}#wrap img{width:100%;display:block}
svg{position:absolute;inset:0;width:100%;height:100%}
.problems{color:#fc6;padding:4px 12px;white-space:pre-line}
</style>
<header>
 <b id="sel">click a line</b>
 <label><input type="checkbox" id="corner"> corner, speed <input type="number" id="speed" min="1" max="15"></label>
 <label><input type="checkbox" id="legends"> Legends Line</label>
 <label><input type="checkbox" id="finish"> finish</label>
 <button id="flip" title="R">flip raceline from here (R)</button>
 <button id="del" title="Delete">delete line</button>
 <button id="add">add line</button>
 <button id="save">save (S)</button>
 <span id="msg"></span>
</header>
<div class="problems" id="problems"></div>
<p style="margin:4px 12px;opacity:.75">Lines: white = finish, red = corner, tan = Legends Line (red+tan dashes = both). The shaded half of each space is its raceline spot. Numbers = distance to the next corner (◆ = diamonds 0–3): they should match the board print. Drag a selected line's end to move it.</p>
<div id="wrap"><img id="img" src="/ref.jpg"><svg id="svg" viewBox="0 0 ${REF_WIDTH} ${height}"></svg></div>
<script>
const ann = ${JSON.stringify(ann)};
const B = ann.boundaries, $ = (id) => document.getElementById(id), svg = $('svg');
let sel = -1, adding = null, drag = null;
const has = (b, k) => (b.tags ?? []).some((t) => t.kind === k);
const tag = (b, k) => (b.tags ?? []).find((t) => t.kind === k);
const mid = (b) => ({ x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 });
const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
function setTag(b, k, on, extra) {
  b.tags = (b.tags ?? []).filter((t) => t.kind !== k);
  if (on) b.tags.push({ kind: k, ...extra });
}
function distances() {
  // spaces until the next corner line: space i is followed by boundary i+1
  const n = B.length, out = [];
  for (let i = 0; i < n; i++) {
    let k = 0;
    while (k < n && !has(B[(i + 1 + k) % n], 'corner')) k++;
    out.push(k < n ? k : null);
  }
  return out;
}
function problems() {
  const p = [], n = B.length;
  const fin = B.filter((b) => has(b, 'finish')).length;
  if (fin !== 1) p.push(fin + ' finish lines (want 1)');
  B.forEach((b, i) => {
    const c = tag(b, 'corner');
    if (!c) return;
    if (!(c.speedLimit >= 1 && c.speedLimit <= 15)) p.push('line ' + i + ': corner speed limit missing');
    let j = i - 1;
    for (; j > i - n; j--) { const bj = B[(j + n) % n]; if (has(bj, 'legends')) break; if (has(bj, 'corner')) { j = null; break; } }
    if (j === null || j === i - n) p.push('line ' + i + ': no Legends Line before this corner');
    else if (i - j < 4) p.push('line ' + i + ': Legends Line closer than diamond 3');
  });
  $('problems').textContent = p.length ? '⚠ ' + p.join('\\n⚠ ') : '';
}
function draw() {
  const dist = distances(), n = B.length;
  let h = '';
  B.forEach((b, i) => {
    const nb = B[(i + 1) % n], m = mid(b), nm = mid(nb);
    const half = b.raceline === 'a' ? [b.a, m, nm, nb.a] : [m, b.b, nb.b, nm];
    h += '<polygon points="' + half.map((p) => p.x + ',' + p.y).join(' ') + '" fill="#4af" fill-opacity=".22" data-space="' + i + '"/>';
    const c = { x: (m.x + nm.x) / 2, y: (m.y + nm.y) / 2 }, k = dist[i];
    if (k !== null) h += '<text x="' + c.x + '" y="' + (c.y + 7) + '" fill="' + (k <= 3 ? '#f66' : '#fff') + '" font-size="20" font-weight="700" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">' + (k <= 3 ? '◆' + k : k) + '</text>';
  });
  B.forEach((b, i) => {
    const col = has(b, 'finish') ? '#fff' : has(b, 'corner') ? '#f33' : has(b, 'legends') ? '#e8b060' : '#2e8';
    const w = i === sel ? 9 : 5;
    h += '<line x1="' + b.a.x + '" y1="' + b.a.y + '" x2="' + b.b.x + '" y2="' + b.b.y + '" stroke="' + col + '" stroke-width="' + w + '" data-line="' + i + '" style="cursor:pointer"/>';
    if (has(b, 'corner') && has(b, 'legends')) h += '<line x1="' + b.a.x + '" y1="' + b.a.y + '" x2="' + b.b.x + '" y2="' + b.b.y + '" stroke="#e8b060" stroke-width="' + w + '" stroke-dasharray="8 8" pointer-events="none"/>';
    const c = tag(b, 'corner');
    h += '<text x="' + (b.b.x + 6) + '" y="' + (b.b.y + 6) + '" fill="#ff0" font-size="16" stroke="#000" stroke-width="3" paint-order="stroke" pointer-events="none">#' + i + (c ? ' (' + (c.speedLimit || '?') + ')' : '') + '</text>';
    if (i === sel) for (const e of ['a', 'b']) h += '<circle cx="' + b[e].x + '" cy="' + b[e].y + '" r="9" fill="' + (e === 'a' ? '#f0f' : '#0ff') + '" data-end="' + e + '" style="cursor:move"/>';
  });
  if (adding?.length) h += '<circle cx="' + adding[0].x + '" cy="' + adding[0].y + '" r="7" fill="#ff0"/>';
  svg.innerHTML = h;
  problems();
  panel();
}
function panel() {
  const b = B[sel];
  for (const id of ['corner', 'legends', 'finish', 'speed', 'flip', 'del']) $(id).disabled = !b;
  if (!b) { $('sel').textContent = adding ? 'click both road edges' : 'click a line'; return; }
  $('sel').textContent = 'line #' + sel;
  $('corner').checked = has(b, 'corner'); $('legends').checked = has(b, 'legends'); $('finish').checked = has(b, 'finish');
  $('speed').value = tag(b, 'corner')?.speedLimit || '';
}
function pt(e) {
  const r = svg.getBoundingClientRect(), s = ${REF_WIDTH} / r.width;
  return { x: Math.round((e.clientX - r.left) * s), y: Math.round((e.clientY - r.top) * s) };
}
svg.onmousedown = (e) => {
  const end = e.target.dataset?.end;
  if (end && sel >= 0) { drag = end; e.preventDefault(); return; }
  if (adding) {
    adding.push(pt(e));
    if (adding.length === 2) insert({ a: adding[0], b: adding[1], raceline: 'b', tags: [] });
    draw();
    return;
  }
  const line = e.target.dataset?.line;
  sel = line !== undefined ? +line : -1;
  draw();
};
svg.onmousemove = (e) => { if (drag) { B[sel][drag] = pt(e); draw(); } };
window.onmouseup = () => (drag = null);
function insert(nb) {
  // after the boundary k where the detour k → new → k+1 is shortest
  const n = B.length, m = mid(nb);
  let best = 0, cost = Infinity;
  for (let k = 0; k < n; k++) {
    const p = mid(B[k]), q = mid(B[(k + 1) % n]), c = d(p, m) + d(m, q) - d(p, q);
    if (c < cost) { cost = c; best = k; }
  }
  const prev = B[best];
  if (d(nb.a, prev.a) + d(nb.b, prev.b) > d(nb.a, prev.b) + d(nb.b, prev.a)) [nb.a, nb.b] = [nb.b, nb.a];
  nb.raceline = prev.raceline;
  B.splice(best + 1, 0, nb);
  sel = best + 1; adding = null;
}
$('corner').onchange = (e) => { setTag(B[sel], 'corner', e.target.checked, { speedLimit: +$('speed').value || 0 }); draw(); };
// Typing a speed makes the line a corner (a tan Legends-only line would ignore it otherwise).
$('speed').oninput = (e) => {
  const v = +e.target.value || 0, c = tag(B[sel], 'corner');
  if (c) c.speedLimit = v;
  else { setTag(B[sel], 'corner', true, { speedLimit: v }); $('corner').checked = true; }
  draw();
};
$('legends').onchange = (e) => { setTag(B[sel], 'legends', e.target.checked); draw(); };
$('finish').onchange = (e) => { setTag(B[sel], 'finish', e.target.checked); draw(); };
function flip() {
  // flip spaces sel… up to (not including) the next space whose side already differs
  const n = B.length, old = B[sel].raceline, now = old === 'a' ? 'b' : 'a';
  for (let k = 0; k < n && B[(sel + k) % n].raceline === old; k++) B[(sel + k) % n].raceline = now;
  draw();
}
$('flip').onclick = flip;
$('del').onclick = () => { B.splice(sel, 1); sel = -1; draw(); };
$('add').onclick = () => { adding = []; sel = -1; draw(); };
async function save() {
  const r = await fetch('/save', { method: 'POST', body: JSON.stringify(ann) });
  $('msg').textContent = await r.text();
}
$('save').onclick = save;
document.onkeydown = (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 's') save();
  if (e.key === 'r' && sel >= 0) flip();
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0) $('del').click();
  if (e.key === 'Escape') { adding = null; sel = -1; draw(); }
};
draw();
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
