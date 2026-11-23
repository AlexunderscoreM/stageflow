/* StageFlow — import formations from a PDF slideshow (e.g. exported from Formi or another formation app).
   Each page becomes a formation. Dancers are found as coloured dots on the stage, with their names taken
   from the text printed in or under each dot. Timing is not imported (default lengths are used). */
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href;

const api = window.__stageflow;
const native = window.stageflowNative || null;
const $ = (s) => document.querySelector(s);
const RENDER_W = 1100;

let doc = null;          // { name, pages: [{ canvas, w, h, texts, dots, title }] }
let box = null;          // stage box in page pixels {x, y, w, h} — shared by all pages
let pageIdx = 0;
let dragCorner = null;

// ---------------------------------------------------------------------------
// Page analysis
// ---------------------------------------------------------------------------
async function renderPage(pdf, n) {
  const page = await pdf.getPage(n);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: RENDER_W / vp0.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const tc = await page.getTextContent();
  const texts = [];
  for (const it of tc.items) {
    const str = (it.str || '').trim();
    if (!str) continue;
    const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    const size = Math.hypot(it.transform[2], it.transform[3]) * vp.scale;
    const w = (it.width || str.length * size * 0.5) * vp.scale;
    texts.push({ str, x, y, w, size, cx: x + w / 2, cy: y - size * 0.35 });
  }
  return { canvas, ctx, w: canvas.width, h: canvas.height, texts };
}

function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  return { s: mx ? d / mx : 0, v: mx / 255 };
}

/** Coloured, roughly round blobs = dancers. */
function findDots(pg) {
  const { ctx, w, h } = pg;
  const step = 2; // analyse at half resolution
  const W = Math.floor(w / step), H = Math.floor(h / step);
  const data = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((y * step) * w + x * step) * 4;
    const { s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (s > 0.35 && v > 0.25) mask[y * W + x] = 1;
  }
  const seen = new Int32Array(W * H).fill(-1);
  const blobs = [];
  const stack = [];
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || seen[p] >= 0) continue;
    let minx = W, miny = H, maxx = 0, maxy = 0, area = 0, sr = 0, sg = 0, sb = 0;
    stack.push(p); seen[p] = blobs.length;
    while (stack.length) {
      const q = stack.pop();
      const x = q % W, y = (q - x) / W;
      area++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      const i = ((y * step) * w + x * step) * 4; sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
      for (const nq of [q - 1, q + 1, q - W, q + W]) {
        if (nq < 0 || nq >= W * H || seen[nq] >= 0 || !mask[nq]) continue;
        if (Math.abs((nq % W) - x) > 1) continue;
        seen[nq] = blobs.length; stack.push(nq);
      }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    blobs.push({ x: (minx + bw / 2) * step, y: (miny + bh / 2) * step, d: ((bw + bh) / 2) * step, area: area * step * step, bw: bw * step, bh: bh * step,
      fill: area / (bw * bh), color: `#${[sr, sg, sb].map((v) => Math.round(v / area).toString(16).padStart(2, '0')).join('')}` });
  }
  let dots = blobs.filter((b) => b.d >= 8 && b.d <= w / 8 && b.fill > 0.4 && b.bw / b.bh > 0.6 && b.bw / b.bh < 1.6);
  if (dots.length) {
    const ds = dots.map((b) => b.d).sort((a, b) => a - b);
    const med = ds[Math.floor(ds.length / 2)];
    dots = dots.filter((b) => b.d > med * 0.55 && b.d < med * 1.8);
  }
  return dots;
}

/** Stage edges: rows / columns that are mostly "not page background" (grid lines or a filled floor). */
function findStageBox(pg, dots) {
  const { ctx, w, h } = pg;
  const data = ctx.getImageData(0, 0, w, h).data;
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const bg = px(2, 2);
  const diff = (c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 30;
  const rows = [], cols = [];
  for (let y = 0; y < h; y += 1) { let c = 0; for (let x = 0; x < w; x += 3) if (diff(px(x, y))) c++; rows.push(c / (w / 3)); }
  for (let x = 0; x < w; x += 1) { let c = 0; for (let y = 0; y < h; y += 3) if (diff(px(x, y))) c++; cols.push(c / (h / 3)); }
  const lineRows = rows.map((v, i) => (v > 0.45 ? i : -1)).filter((i) => i >= 0);
  const lineCols = cols.map((v, i) => (v > 0.35 ? i : -1)).filter((i) => i >= 0);
  if (lineRows.length >= 2 && lineCols.length >= 2) {
    const y0 = lineRows[0], y1 = lineRows[lineRows.length - 1], x0 = lineCols[0], x1 = lineCols[lineCols.length - 1];
    if (y1 - y0 > h * 0.2 && x1 - x0 > w * 0.3) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, auto: 'lines' };
  }
  if (dots.length >= 2) {
    const xs = dots.map((d) => d.x), ys = dots.map((d) => d.y);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const padX = Math.max(40, (bx1 - bx0) * 0.15), padY = Math.max(40, (by1 - by0) * 0.15);
    return { x: bx0 - padX, y: by0 - padY, w: bx1 - bx0 + padX * 2, h: by1 - by0 + padY * 2, auto: 'dots' };
  }
  return { x: w * 0.1, y: h * 0.15, w: w * 0.8, h: h * 0.7, auto: 'guess' };
}

const isAxisLabel = (s) => /^[-+]?\d+(\.\d+)?('|ft|m)?$/i.test(s);

function labelDots(pg) {
  const used = new Set();
  for (const d of pg.dots) {
    const inside = pg.texts.filter((t) => Math.hypot(t.cx - d.x, t.cy - d.y) < d.d * 0.6);
    const below = pg.texts.filter((t) => !inside.includes(t) && Math.abs(t.cx - d.x) < Math.max(d.d * 1.6, t.w * 0.6) && t.cy > d.y && t.cy - d.y < d.d * 2.6)
      .sort((a, b) => (a.cy - d.y) - (b.cy - d.y));
    const above = pg.texts.filter((t) => !inside.includes(t) && Math.abs(t.cx - d.x) < Math.max(d.d * 1.6, t.w * 0.6) && t.cy < d.y && d.y - t.cy < d.d * 2.2)
      .sort((a, b) => (d.y - a.cy) - (d.y - b.cy));
    const name = [below[0], above[0]].find((t) => t && !isAxisLabel(t.str) && !used.has(t));
    if (name) used.add(name);
    d.short = inside.map((t) => t.str).join('');
    d.name = name ? name.str : '';
  }
}

function joinLine(items) {
  items = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  items.forEach((t, i) => {
    if (i) { const prev = items[i - 1]; const gap = t.x - (prev.x + prev.w); out += gap > t.size * 0.2 ? ' ' : ''; }
    out += t.str;
  });
  return out.replace(/\s+/g, ' ').trim();
}
function findTitle(pg) {
  const cands = pg.texts.filter((t) => t.cy < (box ? box.y : pg.h * 0.25) && !isAxisLabel(t.str) && !/^audience$/i.test(t.str));
  if (!cands.length) return '';
  const big = Math.max(...cands.map((t) => t.size));
  const top = cands.filter((t) => t.size > big * 0.85);
  const firstY = Math.min(...top.map((t) => t.cy));
  // whole line, numbers included ("Formation 1")
  return joinLine(pg.texts.filter((t) => t.size > big * 0.85 && Math.abs(t.cy - firstY) < big * 0.6)).slice(0, 60);
}

/** Dots outside the stage with a name beside them = a colour legend ("● 1  Ava"). */
function readLegend(pg, legendDots) {
  const legend = [];
  for (const d of legendDots) {
    const row = pg.texts.filter((t) => Math.abs(t.cy - d.y) < d.d * 0.7 && t.x > d.x + d.d * 0.45 && t.x - d.x < d.d * 8);
    if (!row.length) continue;
    // take the first "cell": pieces up to the first wide gap (the next table column)
    row.sort((a, b) => a.x - b.x);
    const cell = [row[0]];
    for (let i = 1; i < row.length; i++) { const prev = row[i - 1]; if (row[i].x - (prev.x + prev.w) > row[i].size * 1.2) break; cell.push(row[i]); }
    const name = joinLine(cell).replace(/^\d+[.)]?\s*/, '');
    if (name) legend.push({ color: d.color, name });
  }
  return legend;
}
function colorDist(a, b) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [h(a), h(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}

/** Labels-only fallback: dancers are text items on the stage (no coloured dots). */
function textDancers(pg) {
  return pg.texts.filter((t) => t.cx > box.x && t.cx < box.x + box.w && t.cy > box.y && t.cy < box.y + box.h && !isAxisLabel(t.str))
    .map((t) => ({ x: t.cx, y: t.cy, d: t.size * 1.5, color: '#9aa0a6', name: t.str, short: '' }));
}

// ---------------------------------------------------------------------------
// Dancer matching across pages
// ---------------------------------------------------------------------------
function keyOf(d) { return (d.name || d.short || '').trim().toLowerCase(); }
function buildPlan() {
  const S = api.project.stage;
  const audTop = $('#pdfAudience').value === 'top';
  const people = [];                 // { key, name, color }
  const pages = doc.pages.map((pg) => {
    const dots = pg.dots.length ? pg.dots : textDancers(pg);
    return { title: pg.title, dots };
  });
  let prev = null;                   // previous page assignments: personIndex -> {x,y}
  const result = pages.map((pg, pi) => {
    const assign = new Map();
    const free = new Set(people.map((_, i) => i));
    const pending = [];
    for (const d of pg.dots) {
      const k = keyOf(d);
      const byKey = k ? people.findIndex((p, i) => free.has(i) && p.key === k) : -1;
      if (byKey >= 0) { assign.set(byKey, d); free.delete(byKey); } else pending.push(d);
    }
    // colour match if that colour is unique on this page
    for (const d of [...pending]) {
      const same = pg.dots.filter((o) => o.color === d.color).length;
      if (same !== 1 || keyOf(d)) continue;
      const idx = people.findIndex((p, i) => free.has(i) && !p.key && p.color === d.color);
      if (idx >= 0) { assign.set(idx, d); free.delete(idx); pending.splice(pending.indexOf(d), 1); }
    }
    // nearest previous position
    if (prev) {
      for (const d of [...pending]) {
        if (keyOf(d)) continue;
        let best = -1, bd = Infinity;
        for (const i of free) { const p = prev.get(i); if (!p || people[i].key) continue; const dd = Math.hypot(p.px - d.x, p.py - d.y); if (dd < bd) { bd = dd; best = i; } }
        if (best >= 0) { assign.set(best, d); free.delete(best); pending.splice(pending.indexOf(d), 1); }
      }
    }
    for (const d of pending) {
      people.push({ key: keyOf(d), name: d.name || (d.short ? d.short : `Dancer ${people.length + 1}`), color: d.color });
      assign.set(people.length - 1, d);
    }
    const positions = new Map();
    for (const [i, d] of assign) {
      let x = ((d.x - box.x) / box.w - 0.5) * S.width;
      let y = ((d.y - box.y) / box.h - 0.5) * S.depth;
      if (audTop) { x = -x; y = -y; }
      positions.set(i, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, px: d.x, py: d.y });
    }
    prev = positions;
    return { title: pg.title || `Formation ${pi + 1}`, positions };
  });
  return { people, formations: result };
}

// ---------------------------------------------------------------------------
// Preview UI
// ---------------------------------------------------------------------------
function drawPreview() {
  const pg = doc.pages[pageIdx];
  const cv = $('#pdfCanvas');
  cv.width = pg.w; cv.height = pg.h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(pg.canvas, 0, 0);
  ctx.fillStyle = 'rgba(11,87,208,.08)';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#0b57d0'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
  ctx.strokeRect(box.x, box.y, box.w, box.h); ctx.setLineDash([]);
  ctx.fillStyle = '#0b57d0';
  for (const [cx, cy] of corners()) { ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill(); }
  const plan = buildPlan();
  const f = plan.formations[pageIdx];
  ctx.font = '600 14px Segoe UI, sans-serif'; ctx.textAlign = 'center';
  for (const [i, p] of f.positions) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.px, p.py, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    const label = plan.people[i].name;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(p.px - tw / 2, p.py - 40, tw, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(label, p.px, p.py - 25);
  }
  $('#pdfPageLbl').textContent = `Page ${pageIdx + 1} of ${doc.pages.length} → “${f.title}”`;
  $('#pdfSummary').innerHTML = `<b>${doc.pages.length}</b> page${doc.pages.length === 1 ? '' : 's'} → <b>${doc.pages.length}</b> formation${doc.pages.length === 1 ? '' : 's'}, <b>${plan.people.length}</b> dancer${plan.people.length === 1 ? '' : 's'} found`;
  $('#pdfPeople').innerHTML = plan.people.map((p) => `<span class="pchip"><i style="background:${p.color}"></i>${escapeHtml(p.name)}</span>`).join('');
  $('#pdfBoxInfo').textContent = box.auto === 'lines' ? 'Stage edges found automatically.' : box.auto === 'dots' ? 'Stage edges guessed from where the dancers are — drag the blue corners onto the stage edges.' : box.auto === 'manual' ? 'Stage edges set by you (used for every page).' : 'Drag the blue corners onto the stage edges.';
  $('#btnPdfImport').textContent = `Import ${doc.pages.length} formation${doc.pages.length === 1 ? '' : 's'}`;
}
function corners() { return [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function canvasXY(e) {
  const cv = $('#pdfCanvas'); const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
}
$('#pdfCanvas').addEventListener('mousedown', (e) => {
  if (!doc) return;
  const [x, y] = canvasXY(e);
  const cs = corners();
  const scale = $('#pdfCanvas').width / $('#pdfCanvas').getBoundingClientRect().width;
  const i = cs.findIndex(([cx, cy]) => Math.hypot(cx - x, cy - y) < 18 * scale);
  if (i >= 0) dragCorner = { i, opp: cs[3 - i] };
});
window.addEventListener('mousemove', (e) => {
  if (!dragCorner) return;
  const [x, y] = canvasXY(e);
  const [ox, oy] = dragCorner.opp;
  box = { x: Math.min(x, ox), y: Math.min(y, oy), w: Math.abs(x - ox), h: Math.abs(y - oy), auto: 'manual' };
  drawPreview();
});
window.addEventListener('mouseup', () => { dragCorner = null; });

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
async function pickPdf() {
  if (native && native.openPdf) {
    const res = await native.openPdf();
    return res ? { name: res.name, data: res.data } : null;
  }
  return new Promise((resolve) => {
    const input = $('#filePdf');
    input.value = '';
    input.onchange = async () => { const f = input.files[0]; resolve(f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null); };
    input.click();
  });
}

async function openFile(file) {
  const m = $('#pdfModal');
  m.classList.remove('hidden');
  $('#pdfStatus').textContent = 'Reading the PDF…';
  $('#pdfBody').classList.add('hidden');
  try {
    const pdf = await pdfjs.getDocument({ data: file.data, isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      $('#pdfStatus').textContent = `Reading page ${n} of ${pdf.numPages}…`;
      const pg = await renderPage(pdf, n);
      pg.dots = findDots(pg);
      pages.push(pg);
    }
    doc = { name: file.name, pages };
    // one stage box for the whole slideshow: take it from the page with the most detected structure
    const boxes = pages.map((pg) => findStageBox(pg, pg.dots));
    box = boxes.find((b) => b.auto === 'lines') || boxes.find((b) => b.auto === 'dots') || boxes[0];
    for (const pg of pages) {
      const mx = box.w * 0.04, my = box.h * 0.04;
      const inStage = (d) => d.x > box.x - mx && d.x < box.x + box.w + mx && d.y > box.y - my && d.y < box.y + box.h + my;
      const legendDots = pg.dots.filter((d) => !inStage(d));
      pg.dots = pg.dots.filter(inStage);
      labelDots(pg);
      const legend = readLegend(pg, legendDots);
      for (const d of pg.dots) {
        if (d.name) continue;
        const hit = legend.filter((l) => colorDist(l.color, d.color) < 45);
        if (hit.length === 1) d.name = hit[0].name;
      }
      pg.title = findTitle(pg);
    }
    pageIdx = 0;
    $('#pdfStatus').textContent = '';
    $('#pdfBody').classList.remove('hidden');
    $('#pdfName').textContent = file.name;
    drawPreview();
  } catch (e) {
    console.error(e);
    $('#pdfStatus').textContent = `Could not read this PDF: ${e.message || e}`;
  }
}

function doImport() {
  const plan = buildPlan();
  const replace = $('#pdfMode').value === 'replace';
  const fs = api.project.formations;
  const S = api.project.stage;
  api.mutate(() => {
    const p = api.project;
    // dancers: match by name, otherwise create
    const idOf = new Map();
    if (replace) p.dancers = [];
    const firstX = (i) => { for (const f of plan.formations) if (f.positions.has(i)) return f.positions.get(i).x; return 0; };
    const order = plan.people.map((_, i) => i).sort((a, b) => firstX(a) - firstX(b));
    for (const i of order) {
      const person = plan.people[i];
      let d = p.dancers.find((x) => x.name.trim().toLowerCase() === person.name.trim().toLowerCase());
      if (!d) { d = { id: api.uid(), name: person.name, color: person.color, shape: 'circle' }; p.dancers.push(d); }
      idOf.set(i, d.id);
    }
    const newFs = [];
    let t = replace || !fs.length ? 0 : fs[fs.length - 1].end + 2;
    let last = {};
    if (!replace && fs.length) for (const d of p.dancers) if (fs[fs.length - 1].positions[d.id]) last[d.id] = { ...fs[fs.length - 1].positions[d.id] };
    for (const f of plan.formations) {
      const positions = {};
      for (const d of p.dancers) positions[d.id] = last[d.id] ? { ...last[d.id] } : { x: 0, y: S.depth / 2 + 2 };
      for (const [i, pos] of f.positions) positions[idOf.get(i)] = { x: pos.x, y: pos.y };
      newFs.push({ id: api.uid(), name: f.title, start: t, end: t + 4, positions, paths: {} });
      last = positions;
      t += 6;
    }
    if (replace) p.formations = newFs;
    else {
      // dancers new to this segment stand at their first imported spot in the earlier formations
      for (const old of fs) for (const d of p.dancers) if (!old.positions[d.id]) old.positions[d.id] = { ...newFs[0].positions[d.id] };
      p.formations = fs.concat(newFs);
    }
  });
  $('#pdfModal').classList.add('hidden');
  const first = api.project.formations[replace ? 0 : fs.length];
  if (first) api.setTime(first.start);
}

$('#pdfPrev').addEventListener('click', () => { if (doc && pageIdx > 0) { pageIdx--; drawPreview(); } });
$('#pdfNext').addEventListener('click', () => { if (doc && pageIdx < doc.pages.length - 1) { pageIdx++; drawPreview(); } });
$('#pdfAudience').addEventListener('change', () => doc && drawPreview());
$('#btnPdfImport').addEventListener('click', doImport);
$('#btnPdfCancel').addEventListener('click', () => $('#pdfModal').classList.add('hidden'));
$('#btnImportPdf').addEventListener('click', async () => { const f = await pickPdf(); if (f) openFile(f); });

window.StagePdfImport = { openFile, buildPlan, get doc() { return doc; }, get box() { return box; } };
