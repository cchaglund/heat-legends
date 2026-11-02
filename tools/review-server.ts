// Review page for ground truth (D24): confirm or correct each car's position
// per fixture set, saved as fixtures/<track>/<set>/truth.json.
//
//   npm run vision:detect -- <track> <set>   # first: builds the photos + consensus data
//   npm run review [-- <track>]              # then open http://localhost:4600
//
// Two modes:
// - "/" (sets where every photo shares the car positions, e.g. pos-a-*):
//   markers on the reference board start at the consensus position (median
//   detection per colour). Drag, untick absent colours, Save.
// - "/photos" (close-up sets, where positions differ per photo and the file
//   name lists the cars of interest, e.g. red-silver-2.jpg): click a colour,
//   then click that car in the photo. Points are mapped to reference space
//   with the photo's cached registration and saved per photo.
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
    if (req.method === "POST" && url.pathname === "/save-photo") {
      const body = JSON.parse(await readBody(req));
      const set = String(body.set), photo = String(body.photo);
      if (!/^[\w-]+$/.test(set) || !/^[\w-]+$/.test(photo)) throw new Error("bad name");
      const path = join("fixtures", track, set, "truth.json");
      const truth = (await readJson(path)) ?? { status: "confirmed", photos: {} };
      truth.photos[photo] = body.positions;
      await writeFile(path, JSON.stringify(truth, null, 2) + "\n");
      console.log(`saved ${path} [${photo}]`);
      return send(res, 200, "text/plain", `saved ${photo}`);
    }
    if (url.pathname.startsWith("/fixture/")) {
      const [set, file] = url.pathname.slice("/fixture/".length).split("/");
      if (!/^[\w-]+$/.test(set) || !/^[\w-]+\.jpg$/.test(file)) throw new Error("bad path");
      res.writeHead(200, { "content-type": "image/jpeg" });
      return createReadStream(join("fixtures", track, set, file)).pipe(res);
    }
    if (url.pathname === "/photos") return send(res, 200, "text/html; charset=utf-8", await photoPage());
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
  const sets = (await readdir(join("fixtures", track))).filter((s) => !/^(empty|scan|closeup)/.test(s)).sort();
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
<header><a href="/photos" style="color:#9cf">close-up photos →</a><select id="set"></select><span class="status" id="status"></span><span id="toggles"></span><button id="save">Save truth.json</button><span id="msg"></span></header>
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

/** Colours named in a close-up photo's file name ("red-silver-2" → red, silver). */
export function namedColours(name: string): string[] {
  return name.split("-").filter((t) => (COLORS as readonly string[]).includes(t));
}

async function photoPage() {
  const sets = (await readdir(join("fixtures", track))).filter((s) => s.startsWith("closeup")).sort();
  const data = await Promise.all(sets.map(async (set) => {
    const truth = (await readJson(join("fixtures", track, set, "truth.json")))?.photos ?? {};
    const blobs: any[] = (await readJson(join(REPORT, `_${set}-blobs.json`))) ?? [];
    const files = (await readdir(join("fixtures", track, set))).filter((f) => f.endsWith(".jpg")).sort();
    const photos = await Promise.all(files.map(async (file) => {
      const name = file.replace(/\.jpg$/, "");
      const reg = await readJson(join("reports", "cache", track, `${set}-${file}.json`));
      const det = blobs.find((p) => p.photo === `${set}-${name}`)?.blobs ?? [];
      const guess: Record<string, [number, number]> = {};
      for (const b of det) if (b.color) guess[b.color] = [b.x, b.y];
      return { name, file, H: reg?.ok ? reg.H : null, named: namedColours(name), guess, truth: truth[name] ?? null };
    }));
    return { set, photos };
  }));
  return `<!doctype html><meta charset="utf-8"><title>Review photos ${track}</title>
<style>
body{font:14px system-ui;margin:0;background:#1b1b1b;color:#ddd}
header{padding:10px 16px;background:#111;position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#wrap{position:relative;margin:12px;user-select:none}#wrap img{width:100%;display:block;cursor:crosshair}
.m{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #000;pointer-events:none}
.m span{position:absolute;left:32px;top:4px;font-weight:600;text-shadow:0 0 3px #000}
.m.guess{opacity:.55;border-style:dashed}
button{font:inherit;padding:6px 12px}button.c{border:3px solid transparent}button.c.armed{border-color:#fff}
.ok{color:#6f6}.todo{color:#fc6}
</style>
<header><select id="set"></select><button id="prev">◀</button><select id="photo"></select><button id="next">▶</button>
<span id="btns"></span><button id="save">Save (S)</button><span id="msg"></span></header>
<p style="margin:8px 16px;opacity:.75">Pick a colour, then click that car in the photo (aim at the middle of the car's body). Dashed = the detector's guess; solid = your answer. A colour you can't see: "absent".</p>
<div id="wrap"><img id="img"></div>
<script>
const DATA = ${JSON.stringify(data)}, SWATCH = ${JSON.stringify(SWATCH)};
const $ = id => document.getElementById(id), img = $('img'), wrap = $('wrap');
let set, ph, armed, answer;
DATA.forEach((d, i) => $('set').add(new Option(d.set, i)));
function inv(h){const[a,b,c,d,e,f,g,i,k]=h,A=e*k-f*i,B=-(d*k-f*g),C=d*i-e*g,det=a*A+b*B+c*C;
  return [A,-(b*k-c*i),b*f-c*e,B,a*k-c*g,-(a*f-c*d),C,-(a*i-b*g),a*e-b*d].map(v=>v/det);}
function ap(h,[x,y]){const w=h[6]*x+h[7]*y+h[8];return[(h[0]*x+h[1]*y+h[2])/w,(h[3]*x+h[4]*y+h[5])/w];}
function loadSet(i){ set = DATA[i]; $('photo').innerHTML=''; set.photos.forEach((p,j)=>$('photo').add(new Option((p.truth?'✓ ':'· ')+p.name,j))); loadPhoto(0); }
function loadPhoto(j){ ph = set.photos[j]; $('photo').value=j; answer = Object.assign({}, ph.truth ?? {}); armed = ph.named[0];
  img.src = '/fixture/' + set.set + '/' + ph.file; img.onload = draw; buttons(); $('msg').textContent = ph.H ? '' : 'registration failed — skip'; }
function buttons(){ $('btns').innerHTML = ph.named.map(c => '<button class="c'+(c===armed?' armed':'')+'" data-c="'+c+'" style="background:'+SWATCH[c]+';color:'+(c==='yellow'||c==='silver'?'#000':'#fff')+'">'+c+(answer[c]===null?' (absent)':'')+'</button><button data-absent="'+c+'">absent</button>').join(' ');
  $('btns').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{armed=b.dataset.c;buttons();});
  $('btns').querySelectorAll('[data-absent]').forEach(b=>b.onclick=()=>{answer[b.dataset.absent]=null;draw();buttons();}); }
function draw(){ wrap.querySelectorAll('.m').forEach(m=>m.remove()); if(!ph.H) return;
  const Hi = inv(ph.H), sx = img.clientWidth / img.naturalWidth;
  for (const c of ph.named){ const mine = answer[c]; const p = mine ?? ph.guess[c]; if(!p) continue;
    const [x,y] = ap(Hi,p); const m=document.createElement('div'); m.className='m'+(mine?'':' guess');
    m.style.background=SWATCH[c]; m.style.left=(x*sx)+'px'; m.style.top=(y*sx)+'px'; m.innerHTML='<span>'+c+'</span>'; wrap.append(m);} }
img.onclick = e => { if(!ph.H||!armed) return; const r=img.getBoundingClientRect(), s=img.naturalWidth/r.width;
  answer[armed] = ap(ph.H,[(e.clientX-r.left)*s,(e.clientY-r.top)*s]).map(Math.round);
  const rest = ph.named.filter(c=>!(c in answer)); armed = rest[0] ?? armed; draw(); buttons(); };
async function save(){ const r = await fetch('/save-photo',{method:'POST',body:JSON.stringify({set:set.set,photo:ph.name,positions:answer})});
  $('msg').textContent = await r.text(); if(r.ok){ ph.truth = {...answer}; $('photo').options[$('photo').value].text='✓ '+ph.name; } }
$('save').onclick = save; $('set').onchange=()=>loadSet(+$('set').value);
$('photo').onchange=()=>loadPhoto(+$('photo').value);
$('prev').onclick=()=>loadPhoto(Math.max(0,+$('photo').value-1)); $('next').onclick=()=>loadPhoto(Math.min(set.photos.length-1,+$('photo').value+1));
document.onkeydown = e => { if(e.key==='s') save(); if(e.key==='ArrowRight') $('next').click(); if(e.key==='ArrowLeft') $('prev').click(); };
window.onresize = draw; loadSet(0);
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
