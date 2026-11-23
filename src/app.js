'use strict';
/* StageFlow — dance formation designer (renderer). */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const native = window.stageflowNative || null;
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6',
  '#8b5cf6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#a855f7', '#facc15', '#10b981'];
const MIN_HOLD = 0.1;       // seconds a formation block must last
const DEFAULT_HOLD = 2;     // seconds
const DEFAULT_TRANS = 2;    // seconds

function fmtTime(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
function fmtNum(n, d = 2) { return String(Math.round(n * 10 ** d) / 10 ** d); }
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return last.slice(0, 2);
    return (parts[0][0] + last[0]).toUpperCase();
  }
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}
function mimeFromName(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  return { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' }[ext] || 'audio/mpeg';
}
function easeFn(s) { return project.settings.easing === 'linear' ? s : s * s * (3 - 2 * s); }

// ---------------------------------------------------------------------------
// Project model
// ---------------------------------------------------------------------------
function defaultProject() {
  const dancers = [];
  const positions = {};
  for (let i = 0; i < 6; i++) {
    const d = { id: uid(), name: `Dancer ${i + 1}`, color: PALETTE[i % PALETTE.length] };
    dancers.push(d);
    positions[d.id] = { x: -10 + i * 4, y: 0 };
  }
  return {
    app: 'StageFlow',
    version: 1,
    stage: { width: 40, depth: 30, unit: 'ft', columns: 8, rows: 4, subdivisions: 2, audience: 'bottom' },
    settings: { easing: 'smooth', bpm: 0, beatOffset: 0 },
    dancers,
    formations: [{ id: uid(), name: 'Formation 1', start: 0, end: 4, positions, paths: {} }],
    audio: null
  };
}

function normalizeProject(p) {
  const d = defaultProject();
  const out = {
    app: 'StageFlow',
    version: 1,
    stage: Object.assign({}, d.stage, p.stage || {}),
    settings: Object.assign({}, d.settings, p.settings || {}),
    dancers: Array.isArray(p.dancers) ? p.dancers.map((x, i) => ({
      id: String(x.id || uid()), name: String(x.name ?? `Dancer ${i + 1}`), color: x.color || PALETTE[i % PALETTE.length]
    })) : [],
    formations: Array.isArray(p.formations) ? p.formations.map((f, i) => ({
      id: String(f.id || uid()),
      name: String(f.name ?? `Formation ${i + 1}`),
      start: Number(f.start) || 0,
      end: Number(f.end) || 0,
      positions: f.positions || {},
      paths: f.paths || {}
    })) : [],
    audio: null
  };
  if (!out.formations.length) out.formations = d.formations.map((f) => ({ ...f, positions: {} }));
  out.formations.sort((a, b) => a.start - b.start);
  let prevEnd = 0;
  for (const f of out.formations) {
    f.start = Math.max(f.start, prevEnd);
    f.end = Math.max(f.end, f.start + MIN_HOLD);
    prevEnd = f.end;
    for (const dn of out.dancers) if (!f.positions[dn.id]) f.positions[dn.id] = { x: 0, y: 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let project = defaultProject();
const state = {
  filePath: null,
  dirty: false,
  time: 0,
  playing: false,
  playWall: 0,
  playFrom: 0,
  selected: new Set(),
  pps: 60,                  // timeline pixels per second
  snap: true,
  timeSnap: true,
  ripple: false,
  showNames: true,
  showPaths: true,
  audioData: null,          // { name, mime, data(base64) }
  audio: null,              // { el, url, peaks, peaksPerSec, duration }
  volume: 1,
  drag: null,
  hover: null
};
const undoStack = [];
const redoStack = [];

function snapshot() { return JSON.stringify(project); }
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 300) undoStack.shift();
  redoStack.length = 0;
}
function restore(snap) {
  project = JSON.parse(snap);
  const ids = new Set(project.dancers.map((d) => d.id));
  for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
  markDirty();
  renderAll();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
function mutate(fn) { pushUndo(); fn(); markDirty(); renderAll(); }
function markDirty() { state.dirty = true; updateTitle(); }

function updateTitle() {
  const name = state.filePath ? state.filePath.split(/[\\/]/).pop() : 'Untitled';
  const t = `${state.dirty ? '• ' : ''}${name} — StageFlow`;
  document.title = t;
  if (native) native.setTitle(t);
}

// ---------------------------------------------------------------------------
// Timeline maths
// ---------------------------------------------------------------------------
function formations() { return project.formations; }
function sortFormations() { project.formations.sort((a, b) => a.start - b.start); }

/** Where is time t? Returns {type:'hold', i} or {type:'trans', i (from), j (to), s} */
function locate(t) {
  const fs = formations();
  if (t <= fs[0].end) return { type: 'hold', i: 0 };
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    if (t >= f.start && t <= f.end) return { type: 'hold', i };
    const n = fs[i + 1];
    if (n && t > f.end && t < n.start) return { type: 'trans', i, j: i + 1, s: (t - f.end) / (n.start - f.end) };
  }
  return { type: 'hold', i: fs.length - 1, after: true };
}

function pathControl(a, b, path) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return { x: mx + (path.dx || 0), y: my + (path.dy || 0) };
}
function bezier(a, c, b, s) {
  const u = 1 - s;
  return { x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y };
}
function posIn(f, id) { return f.positions[id] || { x: 0, y: 0 }; }

function dancerPos(id, t) {
  const loc = locate(t);
  const fs = formations();
  if (loc.type === 'hold') return { ...posIn(fs[loc.i], id) };
  const a = posIn(fs[loc.i], id), b = posIn(fs[loc.j], id);
  const s = easeFn(loc.s);
  const path = fs[loc.j].paths[id];
  if (path && path.curved) return bezier(a, pathControl(a, b, path), b, s);
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
}

/** Formation currently editable (playhead on its block), or null. */
function activeFormation() {
  const loc = locate(state.time);
  return loc.type === 'hold' ? formations()[loc.i] : null;
}
/** Formation whose incoming paths are displayed / edited. */
function pathFormationIndex() {
  const loc = locate(state.time);
  if (loc.type === 'trans') return loc.j;
  return loc.i > 0 ? loc.i : -1;
}

function timelineDuration() {
  const fs = formations();
  const last = fs[fs.length - 1].end;
  return Math.max(30, last + 10, state.audio ? state.audio.duration + 2 : 0);
}

function beatLen() { return project.settings.bpm > 0 ? 60 / project.settings.bpm : 0; }
function snapTime(t, bypass) {
  if (!state.timeSnap || bypass) return Math.max(0, t);
  const bl = beatLen();
  if (bl > 0) {
    const off = project.settings.beatOffset || 0;
    const half = bl / 2;
    return Math.max(0, off + Math.round((t - off) / half) * half);
  }
  return Math.max(0, Math.round(t * 10) / 10);
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function setTime(t, { fromAudio = false } = {}) {
  const prevActive = activeFormation();
  state.time = clamp(t, 0, timelineDuration());
  if (!fromAudio && state.audio) {
    const a = state.audio.el;
    if (state.time < state.audio.duration) {
      if (Math.abs(a.currentTime - state.time) > 0.03) a.currentTime = state.time;
      if (state.playing && a.paused) a.play().catch(() => {});
    } else if (!a.paused) a.pause();
  }
  if (state.playing) { state.playWall = performance.now(); state.playFrom = state.time; }
  $('#timeDisplay').textContent = fmtTime(state.time);
  updateCountDisplay();
  if (prevActive !== activeFormation()) { renderFormationProps(); renderSelectionProps(); updateBlockClasses(); }
  drawStage();
  drawTimeline();
}

function updateCountDisplay() {
  const bl = beatLen();
  if (!bl) { $('#countDisplay').textContent = ''; return; }
  const beat = Math.floor((state.time - (project.settings.beatOffset || 0)) / bl + 1e-6);
  if (beat < 0) { $('#countDisplay').textContent = ''; return; }
  $('#countDisplay').textContent = `8-count ${Math.floor(beat / 8) + 1} · ${(beat % 8) + 1}`;
}

function play() {
  if (state.playing) return;
  if (state.time >= timelineDuration() - 0.05) setTime(0);
  state.playing = true;
  state.playWall = performance.now();
  state.playFrom = state.time;
  if (state.audio && state.time < state.audio.duration) {
    state.audio.el.currentTime = state.time;
    state.audio.el.play().catch(() => {});
  }
  $('#btnPlay').textContent = '❚❚';
  requestAnimationFrame(tick);
}
function pause() {
  state.playing = false;
  if (state.audio) state.audio.el.pause();
  $('#btnPlay').textContent = '▶';
}
function togglePlay() { state.playing ? pause() : play(); }
function tick() {
  if (!state.playing) return;
  const a = state.audio && state.audio.el;
  const audioDriving = a && !a.paused && !a.ended;
  const t = audioDriving ? a.currentTime : state.playFrom + (performance.now() - state.playWall) / 1000;
  if (t >= timelineDuration()) { setTime(timelineDuration()); pause(); return; }
  setTime(t, { fromAudio: true });
  followPlayhead();
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
async function setAudio(audioData) {
  if (state.audio) {
    state.audio.el.pause();
    URL.revokeObjectURL(state.audio.url);
    state.audio = null;
  }
  state.audioData = audioData;
  project.audio = audioData ? { name: audioData.name } : null;
  if (!audioData) { renderAudioProps(); drawTimeline(); return; }
  const res = await fetch(`data:${audioData.mime};base64,${audioData.data}`);
  const bytes = await res.arrayBuffer();
  const blob = new Blob([bytes], { type: audioData.mime });
  const url = URL.createObjectURL(blob);
  const el = new Audio(url);
  el.volume = state.volume;
  el.preload = 'auto';
  let peaks = null, peaksPerSec = 100, duration = 0;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    duration = buf.duration;
    const n = Math.ceil(duration * peaksPerSec);
    peaks = new Float32Array(n);
    const step = buf.sampleRate / peaksPerSec;
    const chans = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c));
    let max = 0;
    for (let i = 0; i < n; i++) {
      const s0 = Math.floor(i * step), s1 = Math.min(Math.floor((i + 1) * step), chans[0].length);
      let m = 0;
      for (const ch of chans) for (let s = s0; s < s1; s += 4) { const v = Math.abs(ch[s]); if (v > m) m = v; }
      peaks[i] = m; if (m > max) max = m;
    }
    if (max > 0) for (let i = 0; i < n; i++) peaks[i] /= max;
    ctx.close();
  } catch (err) {
    console.warn('Could not decode audio for waveform', err);
    await new Promise((r) => { el.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 3000); });
    duration = el.duration || 0;
  }
  el.addEventListener('ended', () => { /* clock continues in tick() */ });
  state.audio = { el, url, peaks, peaksPerSec, duration };
  renderAudioProps();
  renderTimelineBlocks();
  drawTimeline();
}

async function loadAudioDialog() {
  let res = null;
  if (native) res = await native.openAudio();
  else res = await pickFile('#fileAudio', 'dataurl');
  if (!res) return;
  await setAudio({ name: res.name, mime: mimeFromName(res.name), data: res.data });
  markDirty();
}

// browser fallback file picker
function pickFile(sel, mode) {
  return new Promise((resolve) => {
    const input = $(sel);
    input.value = '';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      const r = new FileReader();
      r.onload = () => {
        if (mode === 'dataurl') resolve({ name: file.name, data: String(r.result).split(',')[1] });
        else resolve({ filePath: file.name, text: r.result });
      };
      if (mode === 'dataurl') r.readAsDataURL(file); else r.readAsText(file);
    };
    input.click();
  });
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------
function serialize() {
  return JSON.stringify({ ...project, audio: state.audioData || null });
}

async function saveProject(saveAs = false) {
  const text = serialize();
  if (native) {
    const res = await native.saveProject({ filePath: state.filePath, text, saveAs, suggestedName: 'Untitled.stageflow' });
    if (!res) return false;
    state.filePath = res.filePath;
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = state.filePath || 'Untitled.stageflow';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    state.filePath = a.download;
  }
  state.dirty = false;
  updateTitle();
  return true;
}

async function confirmDiscard() {
  if (!state.dirty) return true;
  if (native) {
    const r = await native.confirmUnsaved();
    if (r === 'cancel') return false;
    if (r === 'save') return saveProject();
    return true;
  }
  return window.confirm('Discard unsaved changes?');
}

async function loadProjectText(text, filePath) {
  let data;
  try { data = JSON.parse(text); } catch (e) { alert('That file is not a valid StageFlow project.'); return; }
  pause();
  project = normalizeProject(data);
  undoStack.length = 0; redoStack.length = 0;
  state.selected.clear();
  state.filePath = filePath || null;
  state.time = 0;
  await setAudio(data.audio && data.audio.data ? data.audio : null);
  state.dirty = false;
  syncStageInputs();
  renderAll();
  setTime(0);
  updateTitle();
}

async function openProject() {
  if (!(await confirmDiscard())) return;
  const res = native ? await native.openProject() : await pickFile('#fileProject', 'text');
  if (res) await loadProjectText(res.text, res.filePath);
}

async function newProject() {
  if (!(await confirmDiscard())) return;
  pause();
  project = defaultProject();
  undoStack.length = 0; redoStack.length = 0;
  state.selected.clear();
  state.filePath = null;
  await setAudio(null);
  state.dirty = false;
  syncStageInputs();
  renderAll();
  setTime(0);
  updateTitle();
}

async function exportPng() {
  const url = stageCanvas.toDataURL('image/png');
  const f = activeFormation();
  const name = `${(f ? f.name : 'stage').replace(/[^\w\- ]+/g, '')}.png`;
  if (native) await native.savePng({ dataUrl: url, suggestedName: name });
  else { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
}

// ---------------------------------------------------------------------------
// Dancer & formation operations
// ---------------------------------------------------------------------------
function addDancers(count) {
  mutate(() => {
    const S = project.stage;
    for (let k = 0; k < count; k++) {
      const n = project.dancers.length;
      const d = { id: uid(), name: `Dancer ${n + 1}`, color: PALETTE[n % PALETTE.length] };
      project.dancers.push(d);
      const col = (n % 9) - 4;
      const row = Math.floor(n / 9) % 3;
      const p = { x: clamp(col * (S.width / 10), -S.width / 2, S.width / 2), y: clamp(S.depth / 2 - S.depth / 8 - row * (S.depth / 8), -S.depth / 2, S.depth / 2) };
      for (const f of formations()) f.positions[d.id] = { ...p };
      if (k === 0) state.selected.clear();
      state.selected.add(d.id);
    }
  });
}

function deleteDancer(id) {
  const d = project.dancers.find((x) => x.id === id);
  if (!d || !window.confirm(`Remove ${d.name} from every formation?`)) return;
  mutate(() => {
    project.dancers = project.dancers.filter((x) => x.id !== id);
    for (const f of formations()) { delete f.positions[id]; delete f.paths[id]; }
    state.selected.delete(id);
  });
}

function nextFormationName() {
  let max = 0;
  for (const f of formations()) { const m = /^Formation (\d+)$/.exec(f.name); if (m) max = Math.max(max, +m[1]); }
  return `Formation ${Math.max(max, formations().length) + 1}`;
}

function addFormation() {
  mutate(() => {
    const fs = formations();
    const t = state.time;
    const positions = {};
    for (const d of project.dancers) positions[d.id] = dancerPos(d.id, t);
    let p = -1;
    for (let i = 0; i < fs.length; i++) if (fs[i].start <= t) p = i;
    let start;
    if (p === -1) start = t;
    else if (t <= fs[p].end) start = fs[p].end + DEFAULT_TRANS;
    else start = t;
    start = snapTime(start);
    const nf = { id: uid(), name: nextFormationName(), start, end: start + DEFAULT_HOLD, positions, paths: {} };
    const next = fs[p + 1];
    if (next) {
      const minGap = p === -1 ? 0.5 : 1;
      const shift = nf.end + minGap - next.start;
      if (shift > 0) for (let i = p + 1; i < fs.length; i++) { fs[i].start += shift; fs[i].end += shift; }
    }
    fs.splice(p + 1, 0, nf);
    sortFormations();
    state.time = nf.start;
  });
  setTime(state.time);
  followPlayhead(true);
}

function deleteFormation() {
  const f = activeFormation();
  if (!f) return;
  if (formations().length <= 1) { alert('A project needs at least one formation.'); return; }
  mutate(() => { project.formations = formations().filter((x) => x !== f); });
  setTime(state.time);
}

function gotoFormation(dir) {
  const fs = formations();
  const loc = locate(state.time);
  let idx;
  if (dir > 0) idx = loc.type === 'trans' ? loc.j : Math.min(fs.length - 1, loc.i + 1);
  else idx = loc.type === 'trans' ? loc.i : Math.max(0, (state.time > fs[loc.i].start + 0.01 ? loc.i : loc.i - 1));
  setTime(fs[idx].start);
  followPlayhead(true);
}

function targetIds() { return state.selected.size ? [...state.selected] : project.dancers.map((d) => d.id); }

function setCurve(mode) {
  const pi = pathFormationIndex();
  if (pi < 0) return;
  const fs = formations();
  const from = fs[pi - 1], to = fs[pi];
  mutate(() => {
    for (const id of targetIds()) {
      const cur = to.paths[id] || { curved: false, dx: 0, dy: 0 };
      if (mode === 'toggle') mode = cur.curved ? 'straight' : 'curved';
      if (mode === 'straight') to.paths[id] = { ...cur, curved: false };
      else if (mode === 'curved') {
        if (!cur.curved && !cur.dx && !cur.dy) {
          const a = posIn(from, id), b = posIn(to, id);
          const vx = b.x - a.x, vy = b.y - a.y;
          const len = Math.hypot(vx, vy);
          if (len < 0.01) { cur.dx = 0; cur.dy = -project.stage.depth / 8; }
          else { cur.dx = (-vy / len) * len * 0.4; cur.dy = (vx / len) * len * 0.4; }
        }
        to.paths[id] = { ...cur, curved: true };
      } else if (mode === 'flip') {
        if (cur.curved) to.paths[id] = { ...cur, dx: -cur.dx, dy: -cur.dy };
      }
    }
  });
}

function arrange(kind) {
  const f = activeFormation();
  if (!f) return;
  const ids = targetIds();
  if (!ids.length) return;
  mutate(() => {
    const ps = ids.map((id) => f.positions[id]);
    const avg = (k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
    if (kind === 'mirror') for (const p of ps) p.x = -p.x;
    if (kind === 'flipFB') for (const p of ps) p.y = -p.y;
    if (kind === 'row') { const y = avg('y'); for (const p of ps) p.y = y; }
    if (kind === 'col') { const x = avg('x'); for (const p of ps) p.x = x; }
    if (kind === 'spreadX' || kind === 'spreadY') {
      const k = kind === 'spreadX' ? 'x' : 'y';
      const sorted = [...ps].sort((a, b) => a[k] - b[k]);
      if (sorted.length < 2) return;
      const lo = sorted[0][k], hi = sorted[sorted.length - 1][k];
      sorted.forEach((p, i) => { p[k] = lo + ((hi - lo) * i) / (sorted.length - 1); });
    }
    if (kind === 'center') {
      const cx = avg('x');
      for (const p of ps) p.x -= cx;
    }
  });
}

// ---------------------------------------------------------------------------
// Stage canvas
// ---------------------------------------------------------------------------
const stageCanvas = $('#stage');
const sctx = stageCanvas.getContext('2d');
let L = null; // layout

function stageLayout() {
  const w = stageCanvas.clientWidth, h = stageCanvas.clientHeight;
  const S = project.stage;
  const padX = 70, padTop = 46, padBottom = 64;
  const aw = Math.max(50, w - padX * 2), ah = Math.max(50, h - padTop - padBottom);
  const scale = Math.min(aw / S.width, ah / S.depth);
  const flip = S.audience === 'top' ? -1 : 1;
  const cx = w / 2;
  const cy = flip > 0 ? padTop + ah / 2 : padBottom + ah / 2;
  return { w, h, scale, flip, cx, cy, W: S.width, D: S.depth };
}
function toScreen(p) { return { x: L.cx + L.flip * p.x * L.scale, y: L.cy + L.flip * p.y * L.scale }; }
function toStage(x, y) { return { x: (x - L.cx) / (L.flip * L.scale), y: (y - L.cy) / (L.flip * L.scale) }; }
function dancerRadius() { return clamp(L.scale * 0.75, 9, 20); }
function gridStep() {
  const S = project.stage;
  return { x: S.width / S.columns / S.subdivisions, y: S.depth / S.rows / S.subdivisions };
}
function snapPoint(p) {
  const S = project.stage, g = gridStep();
  return {
    x: -S.width / 2 + Math.round((p.x + S.width / 2) / g.x) * g.x,
    y: -S.depth / 2 + Math.round((p.y + S.depth / 2) / g.y) * g.y
  };
}
function clampToArea(p) {
  const mx = L.W / 2 + 60 / L.scale, my = L.D / 2 + 40 / L.scale;
  return { x: clamp(p.x, -mx, mx), y: clamp(p.y, -my, my) };
}

function resizeCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawStage() {
  resizeCanvas(stageCanvas);
  L = stageLayout();
  const ctx = sctx;
  const S = project.stage;
  ctx.clearRect(0, 0, L.w, L.h);
  ctx.fillStyle = '#101217';
  ctx.fillRect(0, 0, L.w, L.h);

  const tl = toScreen({ x: -S.width / 2, y: -S.depth / 2 });
  const br = toScreen({ x: S.width / 2, y: S.depth / 2 });
  const x0 = Math.min(tl.x, br.x), x1 = Math.max(tl.x, br.x), y0 = Math.min(tl.y, br.y), y1 = Math.max(tl.y, br.y);

  // floor
  ctx.fillStyle = '#1d2130';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // grid
  const colW = (x1 - x0) / S.columns, rowH = (y1 - y0) / S.rows;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  for (let i = 0; i < S.columns * S.subdivisions; i++) {
    if (i % S.subdivisions === 0) continue;
    const x = Math.round(x0 + (i * colW) / S.subdivisions) + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y1);
  }
  for (let i = 0; i < S.rows * S.subdivisions; i++) {
    if (i % S.subdivisions === 0) continue;
    const y = Math.round(y0 + (i * rowH) / S.subdivisions) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  for (let i = 1; i < S.columns; i++) { const x = Math.round(x0 + i * colW) + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let i = 1; i < S.rows; i++) { const y = Math.round(y0 + i * rowH) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  // center lines
  ctx.strokeStyle = 'rgba(160,139,255,0.55)';
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  const c = toScreen({ x: 0, y: 0 });
  ctx.moveTo(Math.round(c.x) + 0.5, y0); ctx.lineTo(Math.round(c.x) + 0.5, y1);
  ctx.moveTo(x0, Math.round(c.y) + 0.5); ctx.lineTo(x1, Math.round(c.y) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

  // labels: distance from center
  ctx.fillStyle = '#8a91a5';
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const front = L.flip > 0 ? y1 : y0;
  for (let i = 0; i <= S.columns; i++) {
    const xs = -S.width / 2 + (i * S.width) / S.columns;
    const p = toScreen({ x: xs, y: 0 });
    ctx.fillText(fmtNum(Math.abs(xs), 1), p.x, L.flip > 0 ? y1 + 5 : y0 - 17);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= S.rows; i++) {
    const ys = -S.depth / 2 + (i * S.depth) / S.rows;
    const p = toScreen({ x: 0, y: ys });
    ctx.fillText(fmtNum(Math.abs(ys), 1), x0 - 7, p.y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px Segoe UI, sans-serif';
  ctx.fillStyle = '#a08bff';
  ctx.fillText('AUDIENCE', L.cx, L.flip > 0 ? front + 36 : front - 36);
  ctx.fillStyle = '#5c6378';
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillText(`UPSTAGE  ·  ${fmtNum(S.width)} × ${fmtNum(S.depth)} ${S.unit}`, L.cx, L.flip > 0 ? y0 - 18 : y1 + 18);

  // paths + ghosts
  const fs = formations();
  const pi = pathFormationIndex();
  const R = dancerRadius();
  const handles = [];
  if (state.showPaths && pi > 0) {
    const from = fs[pi - 1], to = fs[pi];
    const onlySel = state.selected.size > 0;
    for (const d of project.dancers) {
      const a = toScreen(posIn(from, d.id)), b = toScreen(posIn(to, d.id));
      const path = to.paths[d.id];
      const sel = state.selected.has(d.id);
      const dim = onlySel && !sel;
      // ghost of previous position
      ctx.globalAlpha = dim ? 0.12 : 0.3;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(a.x, a.y, R * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = dim ? 0.2 : 0.85;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = sel ? 2.5 : 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      let tangentFrom = a;
      if (path && path.curved) {
        const cS = toScreen(pathControl(posIn(from, d.id), posIn(to, d.id), path));
        ctx.quadraticCurveTo(cS.x, cS.y, b.x, b.y);
        tangentFrom = cS;
        const mid = toScreen(bezier(posIn(from, d.id), pathControl(posIn(from, d.id), posIn(to, d.id), path), posIn(to, d.id), 0.5));
        if (!onlySel || sel) handles.push({ id: d.id, x: mid.x, y: mid.y, color: d.color });
      } else ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // arrow head (placed just outside the dancer circle)
      const ang = Math.atan2(b.y - tangentFrom.y, b.x - tangentFrom.x);
      if (Math.hypot(b.x - a.x, b.y - a.y) > R * 2) {
        const tipX = b.x - Math.cos(ang) * (R + 2), tipY = b.y - Math.sin(ang) * (R + 2);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.45) * 9, tipY - Math.sin(ang - 0.45) * 9);
        ctx.lineTo(tipX - Math.cos(ang + 0.45) * 9, tipY - Math.sin(ang + 0.45) * 9);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // dancers
  for (const d of project.dancers) {
    const p = toScreen(dancerPos(d.id, state.time));
    const sel = state.selected.has(d.id);
    if (sel) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(p.x, p.y, R + 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.45)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(R * 0.8)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
    ctx.fillText(initials(d.name), p.x, p.y + 0.5);
    ctx.shadowBlur = 0;
    if (state.showNames) {
      ctx.font = '11px Segoe UI, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const tw = ctx.measureText(d.name).width;
      ctx.fillRect(p.x - tw / 2 - 3, p.y + R + 3, tw + 6, 15);
      ctx.fillStyle = '#e6e8ee';
      ctx.fillText(d.name, p.x, p.y + R + 4);
    }
  }

  // curve handles (on top)
  for (const hdl of handles) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = hdl.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hdl.x, hdl.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  state.handles = handles;

  // marquee
  if (state.drag && state.drag.type === 'marquee') {
    const m = state.drag;
    ctx.fillStyle = 'rgba(124,92,255,0.15)';
    ctx.strokeStyle = 'rgba(160,139,255,0.9)';
    ctx.lineWidth = 1;
    const rx = Math.min(m.x0, m.x1), ry = Math.min(m.y0, m.y1);
    ctx.fillRect(rx, ry, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    ctx.strokeRect(rx + 0.5, ry + 0.5, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
  }

  // status line
  const loc = locate(state.time);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '600 13px Segoe UI, sans-serif';
  ctx.fillStyle = '#e6e8ee';
  const label = loc.type === 'hold'
    ? fs[loc.i].name
    : `${fs[loc.i].name}  →  ${fs[loc.j].name}  (${Math.round(loc.s * 100)}%)`;
  ctx.fillText(label, 14, 12);

  const hint = $('#stageHint');
  if (loc.type === 'trans' && !state.playing) {
    hint.textContent = 'In a transition: move the playhead onto a formation block to move dancers';
    hint.style.display = 'block';
  } else hint.style.display = 'none';
}

function hitDancer(x, y) {
  const R = dancerRadius() + 3;
  for (let i = project.dancers.length - 1; i >= 0; i--) {
    const d = project.dancers[i];
    const p = toScreen(dancerPos(d.id, state.time));
    if (Math.hypot(p.x - x, p.y - y) <= R) return d;
  }
  return null;
}
function hitHandle(x, y) {
  for (const h of state.handles || []) if (Math.hypot(h.x - x, h.y - y) <= 9) return h;
  return null;
}

function canvasPoint(e) {
  const r = stageCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

stageCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (state.playing) pause();
  const { x, y } = canvasPoint(e);
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  const h = hitHandle(x, y);
  if (h) {
    const pi = pathFormationIndex();
    state.drag = { type: 'curve', id: h.id, pi, undoPushed: false };
    return;
  }
  const d = hitDancer(x, y);
  if (d) {
    if (add) { state.selected.has(d.id) ? state.selected.delete(d.id) : state.selected.add(d.id); }
    else if (!state.selected.has(d.id)) { state.selected.clear(); state.selected.add(d.id); }
    const f = activeFormation();
    if (f && state.selected.has(d.id)) {
      const starts = {};
      for (const id of state.selected) starts[id] = { ...f.positions[id] };
      state.drag = { type: 'move', f, primary: d.id, starts, m0: toStage(x, y), undoPushed: false };
    }
    renderDancerList(); renderSelectionProps(); drawStage();
    return;
  }
  state.drag = { type: 'marquee', x0: x, y0: y, x1: x, y1: y, add, base: new Set(add ? state.selected : []) };
  if (!add) state.selected.clear();
  renderDancerList(); renderSelectionProps(); drawStage();
});

window.addEventListener('mousemove', (e) => {
  const dr = state.drag;
  if (!dr) {
    if (e.target === stageCanvas) {
      const { x, y } = canvasPoint(e);
      stageCanvas.style.cursor = hitHandle(x, y) ? 'move' : hitDancer(x, y) ? (activeFormation() ? 'grab' : 'pointer') : 'default';
    }
    return;
  }
  if (dr.type === 'move') {
    const { x, y } = canvasPoint(e);
    const m = toStage(x, y);
    let dx = m.x - dr.m0.x, dy = m.y - dr.m0.y;
    if (!dr.undoPushed) { if (Math.hypot(dx, dy) * L.scale < 2) return; pushUndo(); dr.undoPushed = true; }
    const ps = dr.starts[dr.primary];
    let target = clampToArea({ x: ps.x + dx, y: ps.y + dy });
    if (state.snap && !e.altKey) target = snapPoint(target);
    dx = target.x - ps.x; dy = target.y - ps.y;
    for (const id in dr.starts) {
      const s = dr.starts[id];
      dr.f.positions[id] = clampToArea({ x: s.x + dx, y: s.y + dy });
    }
    stageCanvas.style.cursor = 'grabbing';
    drawStage();
  } else if (dr.type === 'curve') {
    const fs = formations();
    const from = fs[dr.pi - 1], to = fs[dr.pi];
    if (!from || !to) return;
    if (!dr.undoPushed) { pushUndo(); dr.undoPushed = true; }
    const { x, y } = canvasPoint(e);
    const hp = toStage(x, y);
    const a = posIn(from, dr.id), b = posIn(to, dr.id);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // handle sits at bezier midpoint = M + 0.5*offset
    to.paths[dr.id] = { curved: true, dx: 2 * (hp.x - mx), dy: 2 * (hp.y - my) };
    drawStage();
  } else if (dr.type === 'marquee') {
    const { x, y } = canvasPoint(e);
    dr.x1 = x; dr.y1 = y;
    const rx0 = Math.min(dr.x0, dr.x1), rx1 = Math.max(dr.x0, dr.x1), ry0 = Math.min(dr.y0, dr.y1), ry1 = Math.max(dr.y0, dr.y1);
    state.selected = new Set(dr.base);
    for (const d of project.dancers) {
      const p = toScreen(dancerPos(d.id, state.time));
      if (p.x >= rx0 && p.x <= rx1 && p.y >= ry0 && p.y <= ry1) state.selected.add(d.id);
    }
    drawStage();
  } else if (dr.type === 'tl-block' || dr.type === 'tl-scrub') {
    timelineDragMove(e);
  }
});

window.addEventListener('mouseup', () => {
  const dr = state.drag;
  if (!dr) return;
  state.drag = null;
  if (dr.undoPushed) markDirty();
  if (dr.type === 'tl-block') timelineDragEnd(dr);
  renderAll();
});

stageCanvas.addEventListener('dblclick', (e) => {
  const { x, y } = canvasPoint(e);
  const d = hitDancer(x, y);
  if (!d) return;
  const input = document.querySelector(`#dancerList li[data-id="${d.id}"] input[type=text]`);
  if (input) { input.focus(); input.select(); }
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const tlScroll = $('#tlScroll');
const tlContent = $('#tlContent');
const tlTrack = $('#tlTrack');
const tlCanvas = $('#tlCanvas');
const ROW_RULER = 26, ROW_WAVE = 60;

function renderTimelineBlocks() {
  const fs = formations();
  tlContent.style.width = `${Math.ceil(timelineDuration() * state.pps)}px`;
  tlTrack.innerHTML = '';
  const act = activeFormation();
  fs.forEach((f, i) => {
    if (i > 0) {
      const prev = fs[i - 1];
      const w = (f.start - prev.end) * state.pps;
      if (w > 0) {
        const tr = document.createElement('div');
        tr.className = 'tl-trans';
        tr.style.left = `${prev.end * state.pps}px`;
        tr.style.width = `${w}px`;
        if (w > 34) tr.textContent = `${fmtNum(f.start - prev.end)}s`;
        tlTrack.appendChild(tr);
      }
    }
    const b = document.createElement('div');
    b.className = 'tl-block' + (f === act ? ' active' : '');
    b.dataset.id = f.id;
    b.style.left = `${f.start * state.pps}px`;
    b.style.width = `${Math.max(6, (f.end - f.start) * state.pps)}px`;
    b.title = `${f.name}\n${fmtTime(f.start)} – ${fmtTime(f.end)}\nDrag edges to change timing · double-click to rename`;
    b.innerHTML = '<div class="h l"></div><div class="name"></div><div class="h r"></div>';
    b.querySelector('.name').textContent = `${i + 1}. ${f.name}`;
    b.addEventListener('mousedown', (e) => timelineBlockDown(e, f));
    b.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const name = prompt('Formation name', f.name);
      if (name != null && name.trim()) mutate(() => { f.name = name.trim(); });
    });
    tlTrack.appendChild(b);
  });
}

function updateBlockClasses() {
  const act = activeFormation();
  for (const el of tlTrack.querySelectorAll('.tl-block')) el.classList.toggle('active', !!act && el.dataset.id === act.id);
}

function timeFromEvent(e) {
  const r = tlScroll.getBoundingClientRect();
  return (e.clientX - r.left + tlScroll.scrollLeft) / state.pps;
}

function timelineBlockDown(e, f) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (state.playing) pause();
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const fs = formations();
  const i = fs.indexOf(f);
  state.drag = {
    type: 'tl-block', f, i, mode, x0: e.clientX, s0: f.start, e0: f.end,
    later: fs.slice(i + 1).map((g) => ({ g, s: g.start, e: g.end })),
    undoPushed: false, moved: false
  };
}

function timelineDragMove(e) {
  const dr = state.drag;
  if (dr.type === 'tl-scrub') { setTime(snapTime(timeFromEvent(e), true)); return; }
  const dxPx = e.clientX - dr.x0;
  if (!dr.moved && Math.abs(dxPx) < 3) return;
  if (!dr.undoPushed) { pushUndo(); dr.undoPushed = true; }
  dr.moved = true;
  const fs = formations();
  const f = dr.f, i = dr.i;
  const dt = dxPx / state.pps;
  const prevEnd = i > 0 ? fs[i - 1].end : 0;
  const ripple = state.ripple !== e.altKey; // Alt temporarily inverts ripple
  const nextStart = !ripple && dr.later.length ? dr.later[0].s : Infinity;
  const bypass = e.shiftKey;
  if (dr.mode === 'move') {
    const len = dr.e0 - dr.s0;
    f.start = clamp(snapTime(dr.s0 + dt, bypass), prevEnd, nextStart - len);
    f.end = f.start + len;
  } else if (dr.mode === 'l') {
    f.start = clamp(snapTime(dr.s0 + dt, bypass), prevEnd, f.end - MIN_HOLD);
  } else {
    f.end = clamp(snapTime(dr.e0 + dt, bypass), f.start + MIN_HOLD, nextStart);
  }
  const shift = ripple && dr.mode !== 'l' ? f.end - dr.e0 : 0;
  for (const l of dr.later) { l.g.start = l.s + shift; l.g.end = l.e + shift; }
  renderTimelineBlocks();
  renderFormationProps();
  drawTimeline();
  drawStage();
}

function timelineDragEnd(dr) {
  if (!dr.moved) {
    setTime(dr.mode === 'r' ? dr.f.end : dr.f.start);
  }
}

function startScrub(e) {
  if (e.button !== 0) return;
  if (state.playing) pause();
  state.drag = { type: 'tl-scrub' };
  setTime(snapTime(timeFromEvent(e), true));
}
tlContent.addEventListener('mousedown', startScrub);

tlScroll.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const tAt = timeFromEvent(e);
    const px = e.clientX - tlScroll.getBoundingClientRect().left;
    setZoom(state.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    tlScroll.scrollLeft = tAt * state.pps - px;
  } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    tlScroll.scrollLeft += e.deltaY;
  }
}, { passive: false });
tlScroll.addEventListener('scroll', drawTimeline);

function setZoom(pps) {
  state.pps = clamp(pps, 10, 400);
  $('#zoom').value = String(Math.round(state.pps));
  renderTimelineBlocks();
  drawTimeline();
}

function followPlayhead(center) {
  const x = state.time * state.pps;
  const vw = tlScroll.clientWidth;
  if (center) { if (x < tlScroll.scrollLeft || x > tlScroll.scrollLeft + vw) tlScroll.scrollLeft = x - vw / 3; return; }
  if (x > tlScroll.scrollLeft + vw - 40) tlScroll.scrollLeft = x - 60;
  else if (x < tlScroll.scrollLeft) tlScroll.scrollLeft = x - 20;
}

function drawTimeline() {
  const vp = tlScroll;
  tlCanvas.style.width = `${vp.clientWidth}px`;
  tlCanvas.style.height = `${vp.clientHeight}px`;
  const ctx = resizeCanvas(tlCanvas);
  const w = vp.clientWidth, h = vp.clientHeight;
  const sl = vp.scrollLeft, pps = state.pps;
  ctx.clearRect(0, 0, w, h);
  const t0 = sl / pps, t1 = (sl + w) / pps;

  // ruler bg
  ctx.fillStyle = '#171a22';
  ctx.fillRect(0, 0, w, ROW_RULER);
  ctx.fillStyle = '#12141a';
  ctx.fillRect(0, ROW_RULER, w, ROW_WAVE);
  ctx.strokeStyle = '#2e3342';
  ctx.beginPath(); ctx.moveTo(0, ROW_RULER + 0.5); ctx.lineTo(w, ROW_RULER + 0.5);
  ctx.moveTo(0, ROW_RULER + ROW_WAVE + 0.5); ctx.lineTo(w, ROW_RULER + ROW_WAVE + 0.5); ctx.stroke();

  // beats
  const bl = beatLen();
  if (bl > 0 && bl * pps >= 4) {
    const off = project.settings.beatOffset || 0;
    let b = Math.max(0, Math.floor((t0 - off) / bl));
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (; off + b * bl <= t1; b++) {
      const x = Math.round((off + b * bl) * pps - sl) + 0.5;
      const bar = b % 8 === 0;
      ctx.strokeStyle = bar ? 'rgba(160,139,255,0.45)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x, ROW_RULER); ctx.lineTo(x, ROW_RULER + ROW_WAVE); ctx.stroke();
      if (bl * pps >= 14 || bar) {
        ctx.fillStyle = bar ? '#a08bff' : '#5c6378';
        ctx.fillText(String((b % 8) + 1), x + 2, ROW_RULER + 2);
      }
    }
  }

  // waveform
  const A = state.audio;
  if (A && A.peaks) {
    const mid = ROW_RULER + ROW_WAVE / 2;
    ctx.fillStyle = 'rgba(124,92,255,0.75)';
    for (let x = 0; x < w; x++) {
      const ta = (sl + x) / pps, tb = (sl + x + 1) / pps;
      if (ta > A.duration) break;
      const ia = Math.floor(ta * A.peaksPerSec), ib = Math.max(ia + 1, Math.floor(tb * A.peaksPerSec));
      let m = 0;
      for (let i = ia; i < ib && i < A.peaks.length; i++) if (A.peaks[i] > m) m = A.peaks[i];
      const hh = Math.max(0.5, m * (ROW_WAVE / 2 - 4));
      ctx.fillRect(x, mid - hh, 1, hh * 2);
    }
    const endX = A.duration * pps - sl;
    if (endX < w) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.max(0, endX), ROW_RULER, w, ROW_WAVE); }
  } else {
    ctx.fillStyle = '#4a5064';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('No music — load an MP3 or WAV in the Music panel', 12, ROW_RULER + ROW_WAVE / 2);
  }

  // ruler ticks
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const major = steps.find((s) => s * pps >= 70) || 120;
  const minor = steps.slice().reverse().find((s) => s < major && s * pps >= 10 && (major / s) % 1 < 1e-9) || major;
  ctx.strokeStyle = '#4a5064';
  ctx.fillStyle = '#8a91a5';
  ctx.font = '10px Segoe UI, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
    const x = Math.round(t * pps - sl) + 0.5;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ctx.moveTo(x, ROW_RULER); ctx.lineTo(x, ROW_RULER - (isMajor ? 10 : 5));
    if (isMajor) {
      const m = Math.floor(t / 60 + 1e-9), s = t - m * 60;
      const label = major < 1 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.round(s)).padStart(2, '0')}`;
      ctx.fillText(label, x + 3, 3);
    }
  }
  ctx.stroke();

  // playhead
  const px = Math.round(state.time * pps - sl) + 0.5;
  if (px >= -1 && px <= w + 1) {
    ctx.strokeStyle = '#ff5d8f';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, 8); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
  }
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------
function renderDancerList() {
  const ul = $('#dancerList');
  ul.innerHTML = '';
  $('#dancerCount').textContent = `(${project.dancers.length})`;
  for (const d of project.dancers) {
    const li = document.createElement('li');
    li.dataset.id = d.id;
    if (state.selected.has(d.id)) li.classList.add('sel');
    const color = document.createElement('input');
    color.type = 'color'; color.value = d.color; color.title = 'Colour';
    color.addEventListener('input', () => { d.color = color.value; drawStage(); });
    color.addEventListener('change', () => { const v = color.value; d.color = undoColor; mutate(() => { d.color = v; }); });
    let undoColor = d.color;
    color.addEventListener('focus', () => { undoColor = d.color; });
    const name = document.createElement('input');
    name.type = 'text'; name.value = d.name;
    name.addEventListener('change', () => { const v = name.value.trim() || d.name; mutate(() => { d.name = v; }); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = 'Remove dancer';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteDancer(d.id); });
    li.append(color, name, del);
    li.addEventListener('mousedown', (e) => {
      if (e.target === del || e.target === color) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        state.selected.has(d.id) ? state.selected.delete(d.id) : state.selected.add(d.id);
      } else { state.selected.clear(); state.selected.add(d.id); }
      for (const el of ul.children) el.classList.toggle('sel', state.selected.has(el.dataset.id));
      renderSelectionProps(); drawStage();
    });
    ul.appendChild(li);
  }
}

function numField(label, value, onChange, opts = {}) {
  const l = document.createElement('label');
  l.textContent = label;
  const i = document.createElement('input');
  i.type = 'number'; i.step = opts.step || '0.1';
  if (opts.min != null) i.min = opts.min;
  i.value = fmtNum(value, 2);
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) onChange(v); else i.value = fmtNum(value, 2); });
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); });
  l.appendChild(i);
  return l;
}
function btn(text, onClick, opts = {}) {
  const b = document.createElement('button');
  b.textContent = text;
  if (opts.title) b.title = opts.title;
  if (opts.cls) b.className = opts.cls;
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', onClick);
  return b;
}

function renderFormationProps() {
  const el = $('#formationProps');
  el.innerHTML = '';
  const fs = formations();
  const loc = locate(state.time);
  if (loc.type === 'trans') {
    const a = fs[loc.i], b = fs[loc.j];
    el.innerHTML = `<div class="subtle">Transition</div><div><b></b> → <b></b></div><div class="subtle"></div>`;
    el.querySelectorAll('b')[0].textContent = a.name;
    el.querySelectorAll('b')[1].textContent = b.name;
    el.querySelectorAll('.subtle')[1].textContent = `${fmtTime(a.end)} – ${fmtTime(b.start)} · ${fmtNum(b.start - a.end)}s of movement`;
    $('#btnDeleteFormation').disabled = true;
    return;
  }
  $('#btnDeleteFormation').disabled = fs.length <= 1;
  const i = loc.i, f = fs[i];
  const nameL = document.createElement('label');
  nameL.className = 'block';
  nameL.textContent = `Name (${i + 1} of ${fs.length})`;
  const name = document.createElement('input');
  name.type = 'text'; name.value = f.name;
  name.addEventListener('change', () => { const v = name.value.trim(); if (v) mutate(() => { f.name = v; }); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
  nameL.appendChild(name);
  el.appendChild(nameL);
  const prevEnd = i > 0 ? fs[i - 1].end : 0;
  const nextStart = i < fs.length - 1 ? fs[i + 1].start : Infinity;
  const g = document.createElement('div');
  g.className = 'grid2';
  g.style.marginTop = '8px';
  g.appendChild(numField('Arrive at (s)', f.start, (v) => mutate(() => { f.start = clamp(v, prevEnd, f.end - MIN_HOLD); })));
  g.appendChild(numField('Leave at (s)', f.end, (v) => mutate(() => { f.end = clamp(v, f.start + MIN_HOLD, nextStart); })));
  el.appendChild(g);
  const info = document.createElement('div');
  info.className = 'subtle';
  const holdTxt = `Hold ${fmtNum(f.end - f.start)}s`;
  const inTxt = i > 0 ? ` · moves in over ${fmtNum(f.start - prevEnd)}s` : '';
  const outTxt = i < fs.length - 1 ? ` · leaves over ${fmtNum(fs[i + 1].start - f.end)}s` : '';
  info.textContent = holdTxt + inTxt + outTxt;
  el.appendChild(info);
}

function renderSelectionProps() {
  const el = $('#selectionProps');
  el.innerHTML = '';
  const n = state.selected.size;
  const act = activeFormation();
  const pi = pathFormationIndex();
  const sub = document.createElement('div');
  sub.className = 'subtle';
  sub.textContent = n ? `${n} selected` : 'None selected — tools apply to everyone';
  el.appendChild(sub);

  if (n === 1 && act) {
    const id = [...state.selected][0];
    const p = act.positions[id];
    const g = document.createElement('div');
    g.className = 'grid2';
    g.appendChild(numField(`X (${project.stage.unit})`, p.x, (v) => mutate(() => { p.x = v; })));
    g.appendChild(numField(`Y (${project.stage.unit}, + = front)`, p.y, (v) => mutate(() => { p.y = v; })));
    el.appendChild(g);
  }

  const pathTitle = document.createElement('div');
  pathTitle.className = 'subtle';
  pathTitle.style.marginTop = '10px';
  pathTitle.textContent = pi > 0 ? `Path into “${formations()[pi].name}”` : 'Path (first formation has no incoming path)';
  el.appendChild(pathTitle);
  const seg = document.createElement('div');
  seg.className = 'seg';
  let allCurved = pi > 0, allStraight = pi > 0;
  if (pi > 0) for (const id of targetIds()) { const c = !!(formations()[pi].paths[id] || {}).curved; if (c) allStraight = false; else allCurved = false; }
  seg.appendChild(btn('Straight', () => setCurve('straight'), { disabled: pi <= 0, cls: allStraight ? 'on' : '', title: 'Move in a straight line' }));
  seg.appendChild(btn('Curved', () => setCurve('curved'), { disabled: pi <= 0, cls: allCurved ? 'on' : '', title: 'Move along a curve — drag the round handle on stage to shape it (C)' }));
  seg.appendChild(btn('Flip', () => setCurve('flip'), { disabled: pi <= 0, title: 'Bend the curve the other way' }));
  el.appendChild(seg);

  const arrTitle = document.createElement('div');
  arrTitle.className = 'subtle';
  arrTitle.style.marginTop = '10px';
  arrTitle.textContent = 'Arrange';
  el.appendChild(arrTitle);
  const grid = document.createElement('div');
  grid.className = 'btn-grid';
  const dis = !act;
  grid.appendChild(btn('Mirror L↔R', () => arrange('mirror'), { disabled: dis }));
  grid.appendChild(btn('Mirror front↔back', () => arrange('flipFB'), { disabled: dis }));
  grid.appendChild(btn('Line up (row)', () => arrange('row'), { disabled: dis, title: 'Put on the same horizontal line' }));
  grid.appendChild(btn('Line up (column)', () => arrange('col'), { disabled: dis, title: 'Put on the same vertical line' }));
  grid.appendChild(btn('Space evenly ↔', () => arrange('spreadX'), { disabled: dis }));
  grid.appendChild(btn('Space evenly ↕', () => arrange('spreadY'), { disabled: dis }));
  grid.appendChild(btn('Center L↔R', () => arrange('center'), { disabled: dis }));
  el.appendChild(grid);
}

function renderAudioProps() {
  $('#audioInfo').textContent = state.audioData
    ? `${state.audioData.name}${state.audio ? ` · ${fmtTime(state.audio.duration)}` : ''}`
    : 'No music loaded';
  $('#btnRemoveAudio').disabled = !state.audioData;
  $('#bpm').value = project.settings.bpm || '';
  $('#beatOffset').value = project.settings.beatOffset || 0;
}

function syncStageInputs() {
  const S = project.stage;
  $('#stWidth').value = S.width; $('#stDepth').value = S.depth; $('#stUnit').value = S.unit;
  $('#stAudience').value = S.audience; $('#stCols').value = S.columns; $('#stRows').value = S.rows; $('#stSub').value = S.subdivisions;
  $('#optEasing').value = project.settings.easing;
}

function renderAll() {
  syncStageInputs();
  renderDancerList();
  renderFormationProps();
  renderSelectionProps();
  renderAudioProps();
  renderTimelineBlocks();
  drawTimeline();
  drawStage();
  $('#btnUndo').disabled = !undoStack.length;
  $('#btnRedo').disabled = !redoStack.length;
  $('#timeDisplay').textContent = fmtTime(state.time);
  updateCountDisplay();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function bindStageInput(sel, key, { int = false, min = 1, max = 1000 } = {}) {
  $(sel).addEventListener('change', (e) => {
    let v = e.target.value;
    if (e.target.type === 'number') {
      v = int ? parseInt(v, 10) : parseFloat(v);
      if (!Number.isFinite(v)) { syncStageInputs(); return; }
      v = clamp(v, min, max);
    }
    mutate(() => { project.stage[key] = v; });
  });
}
bindStageInput('#stWidth', 'width', { min: 1, max: 1000 });
bindStageInput('#stDepth', 'depth', { min: 1, max: 1000 });
bindStageInput('#stUnit', 'unit');
bindStageInput('#stAudience', 'audience');
bindStageInput('#stCols', 'columns', { int: true, min: 1, max: 64 });
bindStageInput('#stRows', 'rows', { int: true, min: 1, max: 64 });
bindStageInput('#stSub', 'subdivisions', { int: true, min: 1, max: 16 });
$('#optEasing').addEventListener('change', (e) => mutate(() => { project.settings.easing = e.target.value; }));
$('#bpm').addEventListener('change', (e) => { const v = parseFloat(e.target.value); mutate(() => { project.settings.bpm = Number.isFinite(v) && v > 0 ? clamp(v, 20, 400) : 0; }); });
$('#beatOffset').addEventListener('change', (e) => { const v = parseFloat(e.target.value); mutate(() => { project.settings.beatOffset = Number.isFinite(v) ? Math.max(0, v) : 0; }); });
for (const el of document.querySelectorAll('.panel input')) {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); e.stopPropagation(); });
}

$('#btnNew').onclick = newProject;
$('#btnOpen').onclick = openProject;
$('#btnSave').onclick = () => saveProject(false);
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#btnHelp').onclick = () => $('#helpModal').classList.remove('hidden');
$('#btnCloseHelp').onclick = () => $('#helpModal').classList.add('hidden');
$('#helpModal').addEventListener('mousedown', (e) => { if (e.target.id === 'helpModal') e.target.classList.add('hidden'); });
$('#btnAddDancer').onclick = () => addDancers(clamp(parseInt($('#addCount').value, 10) || 1, 1, 50));
$('#btnLoadAudio').onclick = loadAudioDialog;
$('#btnRemoveAudio').onclick = () => { if (confirm('Remove the music from this project?')) { setAudio(null); markDirty(); renderTimelineBlocks(); } };
$('#volume').addEventListener('input', (e) => { state.volume = parseFloat(e.target.value); if (state.audio) state.audio.el.volume = state.volume; });
$('#btnPlay').onclick = togglePlay;
$('#btnToStart').onclick = () => { setTime(0); tlScroll.scrollLeft = 0; };
$('#btnAddFormation').onclick = addFormation;
$('#btnDeleteFormation').onclick = deleteFormation;
$('#zoom').addEventListener('input', (e) => {
  const center = (tlScroll.scrollLeft + tlScroll.clientWidth / 2) / state.pps;
  setZoom(parseFloat(e.target.value));
  tlScroll.scrollLeft = center * state.pps - tlScroll.clientWidth / 2;
});
$('#optSnap').addEventListener('change', (e) => { state.snap = e.target.checked; });
$('#optTimeSnap').addEventListener('change', (e) => { state.timeSnap = e.target.checked; });
$('#optRipple').addEventListener('change', (e) => { state.ripple = e.target.checked; });
$('#optNames').addEventListener('change', (e) => { state.showNames = e.target.checked; drawStage(); });
$('#optPaths').addEventListener('change', (e) => { state.showPaths = e.target.checked; drawStage(); });

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' && !['checkbox', 'range', 'color', 'button'].includes(a.type) || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!native && mod) {
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (k === 'o') { e.preventDefault(); openProject(); return; }
    if (k === 'z' && !isTyping()) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === 'y' && !isTyping()) { e.preventDefault(); redo(); return; }
  }
  if (isTyping()) return;
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    state.selected = new Set(project.dancers.map((d) => d.id));
    renderDancerList(); renderSelectionProps(); drawStage();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y' && native) { e.preventDefault(); redo(); return; }
  if (mod) return;
  if (e.key === ' ') { e.preventDefault(); if (document.activeElement) document.activeElement.blur(); togglePlay(); }
  else if (e.key === 'Escape') { state.selected.clear(); $('#helpModal').classList.add('hidden'); renderDancerList(); renderSelectionProps(); drawStage(); }
  else if (e.key === 'n' || e.key === 'N') addFormation();
  else if (e.key === 'c' || e.key === 'C') setCurve('toggle');
  else if (e.key === '[') gotoFormation(-1);
  else if (e.key === ']') gotoFormation(1);
  else if (e.key === 'Home') { setTime(0); tlScroll.scrollLeft = 0; }
  else if (e.key.startsWith('Arrow')) {
    const f = activeFormation();
    if (!f || !state.selected.size) return;
    e.preventDefault();
    const g = gridStep();
    const fine = e.shiftKey;
    const sx = fine ? 0.1 : g.x, sy = fine ? 0.1 : g.y;
    const flip = project.stage.audience === 'top' ? -1 : 1;
    const dx = (e.key === 'ArrowLeft' ? -sx : e.key === 'ArrowRight' ? sx : 0) * flip;
    const dy = (e.key === 'ArrowUp' ? -sy : e.key === 'ArrowDown' ? sy : 0) * flip;
    mutate(() => { for (const id of state.selected) { const p = f.positions[id]; p.x += dx; p.y += dy; } });
  }
});

if (native) {
  native.onMenu((action) => {
    const typing = isTyping();
    switch (action) {
      case 'new': newProject(); break;
      case 'open': openProject(); break;
      case 'save': saveProject(false); break;
      case 'saveAs': saveProject(true); break;
      case 'loadAudio': loadAudioDialog(); break;
      case 'exportPng': exportPng(); break;
      case 'undo': typing ? document.execCommand('undo') : undo(); break;
      case 'redo': typing ? document.execCommand('redo') : redo(); break;
      case 'help': $('#helpModal').classList.remove('hidden'); break;
    }
  });
  native.onOpenFile(async ({ filePath, text }) => {
    if (await confirmDiscard()) loadProjectText(text, filePath);
  });
  native.onCloseRequested(async () => {
    if (await confirmDiscard()) native.confirmClose();
  });
} else {
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

new ResizeObserver(() => { drawStage(); drawTimeline(); }).observe($('#stageWrap'));
new ResizeObserver(() => drawTimeline()).observe(tlScroll);

// expose for automated tests / debugging
window.__stageflow = { get project() { return project; }, state, setTime, addFormation, setAudio, loadProjectText, serialize, locate, dancerPos };

renderAll();
updateTitle();
