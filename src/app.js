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

const svgIcon = (body, extra = '') => `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;
const ICONS = {
  menu: svgIcon('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  newFile: svgIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15h6"/>'),
  open: svgIcon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  save: svgIcon('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>'),
  image: svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: svgIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>'),
  trash: svgIcon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  play: svgIcon('<path d="M7 4v16l13-8z" fill="currentColor"/>'),
  pause: svgIcon('<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/>'),
  toStart: svgIcon('<path d="M6 5v14M19 5 9 12l10 7z" fill="currentColor"/>'),
  straight: svgIcon('<path d="M5 19 19 5"/>'),
  curve: svgIcon('<path d="M5 19C5 10 10 5 19 5"/>'),
  flip: svgIcon('<path d="M12 3v18M8 7 4 12l4 5M16 7l4 5-4 5"/>'),
  music: svgIcon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  users: svgIcon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  stage: svgIcon('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M3 10.5h18M12 4v13M7 21h10"/>'),
  playhead: svgIcon('<path d="M12 3v18"/><path d="M8 3h8l-4 5z" fill="currentColor"/>'),
  cube: svgIcon('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  home: svgIcon('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  download: svgIcon('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
  panelLeft: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  panelRight: svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  shapes: svgIcon('<circle cx="7.5" cy="7.5" r="3.5"/><rect x="13" y="4" width="7" height="7" rx="1"/><path d="m7.5 13 4 7h-8z"/><path d="m16.5 13 3.5 3.5-3.5 3.5-3.5-3.5z"/>'),
  skeleton: svgIcon('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M12 14l-3.5 6.5M12 14l3.5 6.5M6 9.5l6-1.5 6 1.5M6 9.5 4.5 14M18 9.5l1.5 4.5"/>'),
  chevronLeft: svgIcon('<path d="m14 6-6 6 6 6"/>'),
  chevronRight: svgIcon('<path d="m10 6 6 6-6 6"/>'),
  x: svgIcon('<path d="M6 6l12 12M18 6 6 18"/>'),
  video: svgIcon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
  file: svgIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  teach: svgIcon('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="14" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/>'),
  volume: svgIcon('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  folder: svgIcon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  edit: svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  more: svgIcon('<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>'),
  rotate: svgIcon('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>'),
  share: svgIcon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  tap: svgIcon('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.5-1.7L9 16"/><path d="M5 4l1 1M15 4l-1 1M10.5 1.5v1"/>'),
  refresh: svgIcon('<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4.3L20 16"/><path d="M20 20v-4h-4"/>'),
  cloud: svgIcon('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/>'),
  layers: svgIcon('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>')
};

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
    const d = { id: uid(), name: `Dancer ${i + 1}`, color: PALETTE[i % PALETTE.length], shape: 'circle' };
    dancers.push(d);
    positions[d.id] = { x: -10 + i * 4, y: 0 };
  }
  return {
    app: 'StageFlow',
    version: 1,
    name: 'Untitled segment',
    stage: { width: 40, depth: 30, unit: 'ft', columns: 8, rows: 4, subdivisions: 2, audience: 'bottom', callout: 'markers' },
    settings: { easing: 'smooth' },
    dancers,
    formations: [{ id: uid(), name: 'Formation 1', start: 0, end: 4, positions, paths: {} }],
    choreo: [],
    beats: [],          // tapped beat times (seconds), sorted
    beatOffset: 0,      // which count the first tapped beat is (0 = "1")
    beatZero: 0,        // index of the first tapped beat (beats filled in before it are pick-ups)
    phrases: [],        // times of beats that start a new 8-count at "1" (sections that don't land on an 8)
    audio: null
  };
}

function normalizeProject(p) {
  const d = defaultProject();
  const out = {
    app: 'StageFlow',
    version: 1,
    name: String(p.name || 'Untitled segment'),
    stage: Object.assign({}, d.stage, p.stage || {}),
    settings: Object.assign({}, d.settings, p.settings || {}),
    dancers: Array.isArray(p.dancers) ? p.dancers.map((x, i) => ({
      id: String(x.id || uid()), name: String(x.name ?? `Dancer ${i + 1}`), color: x.color || PALETTE[i % PALETTE.length],
      shape: SHAPES.includes(x.shape) ? x.shape : 'circle',
      gender: ['female', 'male', 'nonbinary'].includes(x.gender) ? x.gender : '',
      skill: Number.isInteger(x.skill) ? Math.max(0, Math.min(5, x.skill)) : 0,
      skills: x.skills && typeof x.skills === 'object' ? Object.fromEntries(Object.entries(x.skills).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => [k, Math.max(0, Math.min(5, v))])) : {},
      height: Number(x.height) > 0.8 && Number(x.height) < 2.5 ? Number(x.height) : null,
      ...(x.memberId ? { memberId: String(x.memberId) } : {})
    })) : [],
    formations: Array.isArray(p.formations) ? p.formations.map((f, i) => ({
      id: String(f.id || uid()),
      name: String(f.name ?? `Formation ${i + 1}`),
      start: Number(f.start) || 0,
      end: Number(f.end) || 0,
      positions: f.positions || {},
      paths: f.paths || {},
      layers: Array.isArray(f.layers) ? f.layers.filter((l) => l && l.id).map((l, k) => ({
        id: String(l.id), name: String(l.name || `Layer ${k + 1}`),
        dancerIds: Array.isArray(l.dancerIds) ? l.dancerIds.map(String) : [],
        color: typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : null,
        shape: SHAPES.includes(l.shape) ? l.shape : null,
        clipId: l.clipId ? String(l.clipId) : null, mirror: !!l.mirror, hidden: !!l.hidden
      })) : []
    })) : [],
    styles: Array.isArray(p.styles) ? p.styles.filter((x) => x && x.id).map((x) => ({ id: String(x.id), name: String(x.name || x.id) })) : [],
    beats: Array.isArray(p.beats) ? p.beats.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [],
    beatOffset: Number.isInteger(p.beatOffset) ? ((p.beatOffset % 8) + 8) % 8 : 0,
    beatZero: Number.isInteger(p.beatZero) && p.beatZero >= 0 ? p.beatZero : 0,
    phrases: Array.isArray(p.phrases) ? [...new Set(p.phrases.map(Number).filter((x) => Number.isFinite(x) && x >= 0))].sort((a, b) => a - b) : [],
    choreo: Array.isArray(p.choreo) ? p.choreo.filter((c) => c && c.clipId).map((c) => ({
      id: String(c.id || uid()), clipId: String(c.clipId), dancerIds: Array.isArray(c.dancerIds) ? c.dancerIds.map(String) : [],
      start: Math.max(0, Number(c.start) || 0), duration: Math.max(0.1, Number(c.duration) || 1), offset: Math.max(0, Number(c.offset) || 0), mirror: !!c.mirror,
      mirrorFor: c.mirrorFor && typeof c.mirrorFor === 'object' ? Object.fromEntries(Object.entries(c.mirrorFor).map(([k, v]) => [String(k), !!v])) : {}
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
  timeStep: 0.1,           // timeline snap step in seconds (0 = off)
  viewMode: '2d',
  ripple: false,
  showNames: true,
  showPaths: true,
  audioData: null,          // { name, mime, data(base64) }
  audio: null,              // { el, url, peaks, peaksPerSec, duration }
  volume: 1,
  drag: null,
  hover: null,
  rotateMode: false,
  colorBy: 'own',           // 2D colours: 'own' | 'skill' | 'height' | 'gender'
  timeRef: localStorage.getItem('sf.timeRef') || 'seconds',   // show formation timing in 'seconds' or 'counts'
  tapping: null,
  rotateScope: 'this',      // rotate in: 'this' formation, 'after' (this and later), 'all'
  clips: [],                // pose clips from Choreo analysis { id, name, fps, duration, frames }
  selectedChoreo: null,
  setName: null,            // dashboard set this segment belongs to
  view: 'dashboard'
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
  const name = project.name || (state.filePath ? state.filePath.split(/[\\/]/).pop() : 'Untitled');
  const t = state.view === 'dashboard' ? 'StageFlow' : `${state.dirty ? '• ' : ''}${name} — StageFlow`;
  $('#crumbSet').textContent = state.setName || 'No set';
  $('#crumbSeg').textContent = `${name}${state.dirty ? ' •' : ''}`;
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

/** Formation being edited: the one on screen when the playhead is in its hold, or — while dancers are
    moving — the formation they are moving into (its end spots are shown and can be dragged). */
function activeFormation() {
  const loc = locate(state.time);
  return formations()[loc.type === 'hold' ? loc.i : loc.j] || null;
}
function isMoving() { return locate(state.time).type === 'trans'; }
/** Formation whose block the playhead is in (including its move-in part). */
function panelFormationIndex() {
  const loc = locate(state.time);
  return loc.type === 'trans' ? loc.j : loc.i;
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

// ---------------------------------------------------------------------------
// Tapped beats: formations can be read and snapped in counts instead of seconds
// ---------------------------------------------------------------------------
function beats() { return project.beats || []; }
function hasBeats() { return beats().length >= 2; }
/** Fractional beat index at time t (0 = first tapped beat), extrapolating past both ends. */
function beatAt(t) {
  const b = beats(), n = b.length;
  if (n < 2) return null;
  if (t <= b[0]) return (t - b[0]) / (b[1] - b[0]);
  if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / (b[n - 1] - b[n - 2]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (b[mid] <= t) lo = mid; else hi = mid; }
  return lo + (t - b[lo]) / (b[lo + 1] - b[lo]);
}
/** Time of a (fractional) beat index. */
function timeOfBeat(x) {
  const b = beats(), n = b.length;
  if (n < 2) return null;
  if (x <= 0) return b[0] + x * (b[1] - b[0]);
  if (x >= n - 1) return b[n - 1] + (x - (n - 1)) * (b[n - 1] - b[n - 2]);
  const i = Math.floor(x);
  return b[i] + (x - i) * (b[i + 1] - b[i]);
}
/** Plain count number of beat index k with no section restarts: 0 = "1·1" (the first tapped beat, shifted by the chosen starting count). */
function beatBase(k) { return k - (project.beatZero || 0) + (project.beatOffset || 0); }
/** Beat indexes where a section restarts the counting at "1" (from project.phrases, matched to the nearest beat). */
let phraseCache = { key: '', idx: [] };
function phraseIndexes() {
  const b = beats(), ph = project.phrases || [];
  const key = `${b.length}:${b[0]}:${b[b.length - 1]}:${ph.join(',')}`;
  if (phraseCache.key === key) return phraseCache.idx;
  const idx = [];
  if (b.length >= 2) for (const t of ph) {
    const k = Math.round(beatAt(t));
    if (Math.abs(timeOfBeat(k) - t) < 0.5 * (b[1] - b[0]) + 0.15 && !idx.includes(k)) idx.push(k);
  }
  idx.sort((a, c) => a - c);
  phraseCache = { key, idx };
  return idx;
}
/** Eight-count and beat (both from 1) of beat index k, honouring section restarts. */
function countOf(k) {
  const plain = (base) => ({ c: Math.floor(base / 8) + 1, b: ((base % 8) + 8) % 8 + 1 });
  const ps = phraseIndexes();
  if (!ps.length || k < ps[0]) return plain(beatBase(k));
  // walk the restarts: each one begins a new eight-count, numbered after the one before it
  let r = null, E = 0;
  for (const q of ps) {
    if (q > k) break;
    let prev;
    if (r == null) prev = plain(beatBase(q - 1));
    else { const d = q - 1 - r; prev = { c: E + Math.floor(d / 8), b: (d % 8) + 1 }; }
    const atQ = r == null ? plain(beatBase(q)) : { c: E + Math.floor((q - r) / 8), b: ((q - r) % 8) + 1 };
    E = atQ.b === 1 ? atQ.c : prev.c + 1;   // already a "1": numbering carries on; otherwise a new eight-count
    r = q;
  }
  const d = k - r;
  return { c: E + Math.floor(d / 8), b: (d % 8) + 1 };
}
/** "3·5" = 8-count 3, beat 5; "&" = the half beat after it; "≈" when not on a beat or half beat. */
function countLabel(t) {
  const p = beatAt(t);
  if (p == null) return fmtTime(t);
  const h = Math.round(p * 2) / 2;
  const { c, b } = countOf(Math.floor(h));
  return `${Math.abs(p - h) > 0.12 ? '≈' : ''}${c}·${b}${h % 1 ? '&' : ''}`;
}
function parseCount(str) {
  const m = /^\s*≈?\s*(-?\d+)\s*[·.:\-,/ ]\s*(\d)\s*(&|\+|and)?\s*$/i.exec(str);
  if (!m) return null;
  const c = parseInt(m[1], 10), b = parseInt(m[2], 10), half = m[3] ? 0.5 : 0;
  if (!phraseIndexes().length) return timeOfBeat((c - 1) * 8 + (b - 1) + half - (project.beatOffset || 0) + (project.beatZero || 0));
  // with section restarts, look for the beat that carries this count
  const n = beats().length;
  for (let k = -64; k < n + 64; k++) { const q = countOf(k); if (q.c === c && q.b === b) return timeOfBeat(k + half); }
  return null;
}
const useCounts = () => state.timeRef === 'counts' && hasBeats();
/** Time label in the chosen reference (counts when beats are tapped and counts are on). */
function fmtT(t) { return useCounts() ? countLabel(t) : fmtTime(t); }
function fmtLen(a, b) {
  if (useCounts()) { const n = Math.round((beatAt(b) - beatAt(a)) * 2) / 2; return `${fmtNum(n, 1)} ct${n === 1 ? '' : 's'}`; }
  return `${fmtNum(b - a)}s`;
}

/** Snap a time: magnet to the playhead (within 8px), else round to the chosen step. */
function snapTime(t, bypass) {
  t = Math.max(0, t);
  if (bypass) return t;
  if (Math.abs(t - state.time) * state.pps <= 8) return state.time;
  return roundStep(t);
}
function roundStep(t) {
  const step = state.timeStep;
  if ((step === 'beat' || step === 'half') && hasBeats()) {
    const q = step === 'half' ? 2 : 1;
    return Math.max(0, timeOfBeat(Math.round(beatAt(t) * q) / q));
  }
  return typeof step === 'number' && step ? Math.max(0, Math.round(t / step) * step) : Math.max(0, t);
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function setTime(t, { fromAudio = false } = {}) {
  const prevKey = `${panelFormationIndex()}:${isMoving()}`;
  const prevChoreo = choreoKey();
  state.time = clamp(t, 0, timelineDuration());
  if (!fromAudio && state.audio) {
    const a = state.audio.el;
    if (state.time < state.audio.duration) {
      if (Math.abs(a.currentTime - state.time) > 0.03) a.currentTime = state.time;
      if (state.playing && a.paused) a.play().catch(() => {});
    } else if (!a.paused) a.pause();
  }
  if (state.playing) { state.playWall = performance.now(); state.playFrom = state.time; }
  updateTimeDisplay();
  if (prevKey !== `${panelFormationIndex()}:${isMoving()}`) { renderFormationProps(); renderSelectionProps(); updateBlockClasses(); }
  else if (state.selected.size && prevChoreo !== choreoKey()) renderSelectionProps();
  if (pendingMirror && pendingMirror.f !== activeFormation()) hideMirrorChip();
  if (!state.playing && window.StageBeats && StageBeats.refreshOne) StageBeats.refreshOne();
  drawStage();
  drawTimeline();
}

function play() {
  if (state.playing) return;
  state.follow = true;
  if (state.time >= timelineDuration() - 0.05) setTime(0);
  state.playing = true;
  state.playWall = performance.now();
  state.playFrom = state.time;
  if (state.audio && state.time < state.audio.duration) {
    state.audio.el.currentTime = state.time;
    state.audio.el.play().catch(() => {});
  }
  $('#btnPlay').innerHTML = ICONS.pause;
  requestAnimationFrame(tick);
}
function pause() {
  state.playing = false;
  if (state.audio) state.audio.el.pause();
  $('#btnPlay').innerHTML = ICONS.play;
}
function togglePlay() { state.playing ? pause() : play(); }
function tick() {
  if (!state.playing) return;
  const a = state.audio && state.audio.el;
  const audioDriving = a && !a.paused && !a.ended;
  const t = audioDriving ? a.currentTime : state.playFrom + (performance.now() - state.playWall) / 1000;
  if (t >= timelineDuration()) { setTime(timelineDuration()); pause(); return; }
  setTime(t, { fromAudio: true });
  if (state.follow !== false) followPlayhead();
  else {
    // the user scrolled away: leave the view alone until the playhead comes back into it
    const x = state.time * state.pps;
    if (x >= tlScroll.scrollLeft + 20 && x <= tlScroll.scrollLeft + tlScroll.clientWidth - 60) state.follow = true;
  }
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
  return JSON.stringify({ ...project, audio: state.audioData || null, clips: state.clips });
}

async function saveProject(saveAs = false) {
  const text = serialize();
  if (native) {
    const res = await native.saveProject({ filePath: state.filePath, text, saveAs, suggestedName: `${(project.name || 'Untitled').replace(/[<>:"/\\|?*]+/g, '')}.stageflow` });
    if (!res) return false;
    state.filePath = res.filePath;
    if (res.conflict && res.name) project.name = res.name;   // web: our edits were kept as their own segment
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
  if (window.StageCloud) StageCloud.afterSave();
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

async function loadProjectText(text, filePath, opts = {}) {
  let data;
  try { data = JSON.parse(text); } catch (e) { alert('That file is not a valid StageFlow segment.'); return false; }
  pause();
  project = normalizeProject(data);
  if (!data.name && filePath) project.name = filePath.split(/[\\/]/).pop().replace(/\.(stageflow|json)$/i, '');
  state.clips = Array.isArray(data.clips) ? data.clips : [];
  state.selectedChoreo = null;
  state.setName = opts.setName || null;
  showView('editor');
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
  return true;
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
  state.clips = [];
  state.setName = null;
  showView('editor');
  await setAudio(null);
  state.dirty = false;
  syncStageInputs();
  renderAll();
  setTime(0);
  updateTitle();
}

async function exportPng() {
  const f = activeFormation();
  const name = `${(f ? f.name : 'stage').replace(/[^\w\- ]+/g, '')}.png`;
  if (!native) { alert('Export to PNG is available in the desktop app.'); return; }
  const r = stageWrap.getBoundingClientRect();
  await native.captureStage({ rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, suggestedName: name });
}

// ---------------------------------------------------------------------------
// Dancer & formation operations
// ---------------------------------------------------------------------------
function addDancers(count) {
  mutate(() => {
    const S = project.stage;
    for (let k = 0; k < count; k++) {
      const n = project.dancers.length;
      const d = { id: uid(), name: `Dancer ${n + 1}`, color: PALETTE[n % PALETTE.length], shape: 'circle' };
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
    start = roundStep(start);
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
  const f = formations()[panelFormationIndex()];
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
// Stage (HTML + SVG rendering)
// ---------------------------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
const stageWrap = $('#stageWrap');
const stageSvg = $('#stageSvg');
const dancerLayer = $('#dancerLayer');
const layerGrid = $('#layerGrid');
const layerPaths = $('#layerPaths');
const layerOverlay = $('#layerOverlay');
let L = null; // layout
let gridKey = '';
const dancerEls = new Map();

const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'];
function polygon(points) { return points.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' '); }
function regular(n, r, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i * 2 * Math.PI) / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return pts;
}
function shapeMarkup(shape) {
  switch (shape) {
    case 'square': return '<rect x="-0.8" y="-0.8" width="1.6" height="1.6" rx="0.22" />';
    case 'triangle': return `<polygon points="${polygon([[0, -0.98], [0.95, 0.72], [-0.95, 0.72]])}" stroke-linejoin="round" />`;
    case 'diamond': return `<polygon points="${polygon([[0, -1], [0.92, 0], [0, 1], [-0.92, 0]])}" stroke-linejoin="round" />`;
    case 'hexagon': return `<polygon points="${polygon(regular(6, 0.95))}" stroke-linejoin="round" />`;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.48 : 1.02; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return `<polygon points="${polygon(pts)}" stroke-linejoin="round" />`;
    }
    default: return '<circle r="0.9" />';
  }
}
/** Small standalone SVG of a shape, used for swatches and buttons. */
function shapeIcon(shape, color, size = 18) {
  return `<svg class="shape-icon" width="${size}" height="${size}" viewBox="-1.15 -1.15 2.3 2.3" style="fill:${color}">${shapeMarkup(shape)}</svg>`;
}

function stageLayout() {
  const w = stageWrap.clientWidth, h = stageWrap.clientHeight;
  const S = project.stage;
  const padX = 70, padTop = 74, padBottom = 64;
  const aw = Math.max(50, w - padX * 2), ah = Math.max(50, h - padTop - padBottom);
  const scale = Math.min(aw / S.width, ah / S.depth);
  const flip = S.audience === 'top' ? -1 : 1;
  const cx = w / 2;
  const cy = flip > 0 ? padTop + ah / 2 : padBottom + ah / 2;
  return { w, h, scale, flip, cx, cy, W: S.width, D: S.depth };
}
function toScreen(p) { return { x: L.cx + L.flip * p.x * L.scale, y: L.cy + L.flip * p.y * L.scale }; }
function toStage(x, y) { return { x: (x - L.cx) / (L.flip * L.scale), y: (y - L.cy) / (L.flip * L.scale) }; }
function dancerRadius() { return clamp(L.scale * 0.9, 13, 28); }
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

function svgEl(tag, attrs, parent, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function rebuildGrid() {
  const S = project.stage;
  layerGrid.innerHTML = '';
  const tl = toScreen({ x: -S.width / 2, y: -S.depth / 2 });
  const br = toScreen({ x: S.width / 2, y: S.depth / 2 });
  const x0 = Math.min(tl.x, br.x), x1 = Math.max(tl.x, br.x), y0 = Math.min(tl.y, br.y), y1 = Math.max(tl.y, br.y);
  svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, class: 'floor' }, layerGrid);
  const colW = (x1 - x0) / S.columns, rowH = (y1 - y0) / S.rows;
  let minor = '', major = '';
  const px = (v) => Math.round(v) + 0.5;
  for (let i = 1; i < S.columns * S.subdivisions; i++) {
    const x = px(x0 + (i * colW) / S.subdivisions);
    if (i % S.subdivisions === 0) major += `M${x} ${y0}V${y1}`; else minor += `M${x} ${y0}V${y1}`;
  }
  for (let i = 1; i < S.rows * S.subdivisions; i++) {
    const y = px(y0 + (i * rowH) / S.subdivisions);
    if (i % S.subdivisions === 0) major += `M${x0} ${y}H${x1}`; else minor += `M${x0} ${y}H${x1}`;
  }
  if (minor) svgEl('path', { d: minor, class: 'grid-minor' }, layerGrid);
  if (major) svgEl('path', { d: major, class: 'grid-major' }, layerGrid);
  const c = toScreen({ x: 0, y: 0 });
  svgEl('path', { d: `M${px(c.x)} ${y0}V${y1}M${x0} ${px(c.y)}H${x1}`, class: 'grid-center' }, layerGrid);
  svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, class: 'stage-border' }, layerGrid);

  for (let i = 0; i <= S.columns; i++) {
    const xs = -S.width / 2 + (i * S.width) / S.columns;
    const p = toScreen({ x: xs, y: 0 });
    svgEl('text', { x: p.x, y: L.flip > 0 ? y1 + 16 : y0 - 8, class: 'axis-label', 'text-anchor': 'middle' }, layerGrid, StageRender.axisLabel(project, 'x', xs));
  }
  for (let i = 0; i <= S.rows; i++) {
    const ys = -S.depth / 2 + (i * S.depth) / S.rows;
    const p = toScreen({ x: 0, y: ys });
    svgEl('text', { x: x0 - 8, y: p.y + 4, class: 'axis-label', 'text-anchor': 'end' }, layerGrid, StageRender.axisLabel(project, 'y', ys));
  }
  const front = L.flip > 0 ? y1 : y0;
  svgEl('text', { x: L.cx, y: L.flip > 0 ? front + 42 : front - 32, class: 'audience-label', 'text-anchor': 'middle' }, layerGrid, 'AUDIENCE');
  svgEl('text', { x: L.cx, y: L.flip > 0 ? y0 - 12 : y1 + 22, class: 'upstage-label', 'text-anchor': 'middle' }, layerGrid,
    `UPSTAGE  ·  ${fmtNum(S.width)} × ${fmtNum(S.depth)} ${S.unit}`);
}

function skillOf(d) { return window.StageRoster ? StageRoster.effectiveSkill(d) : d.skill || 0; }
/** Colour used on the 2D stage: the dancer's own colour, or a scale for skill / height / gender. */
const SKILL_COLORS = ['#5f6368', '#f28b82', '#fbbc04', '#fdd663', '#81c995', '#34a853'];
const GENDER_COLORS = { female: '#f48fb1', male: '#64b5f6', nonbinary: '#ce93d8', '': '#9aa0a6' };
/** Formation whose block (move-in + hold) contains time t. */
function blockIndexAt(t) { const loc = locate(t); return loc.type === 'trans' ? loc.j : loc.i; }
/** A dancer's colour / shape at time t, after the layers of the formation on screen. */
function dancerLook(d, t = state.time) { return StageRender.lookOf(formations()[blockIndexAt(t)], d); }
/** Move clip a formation layer puts on this dancer at time t: plays from the start of the block (its move-in) to the block's end. */
function layerChoreo(id, t) {
  const fs = formations(), i = blockIndexAt(t), f = fs[i];
  if (!f || !f.layers || !f.layers.length) return null;
  let hit = null;
  for (const L of f.layers) if (!L.hidden && L.clipId && L.dancerIds.includes(id)) hit = L;
  if (!hit) return null;
  const start = i > 0 ? fs[i - 1].end : 0;
  if (t < start || t >= f.end) return null;
  return { start, duration: f.end - start, offset: 0, mirror: hit.mirror, clipId: hit.clipId, dancerIds: [id], layer: hit };
}
function displayColor(d) {
  const by = state.colorBy;
  if (by === 'skill') return SKILL_COLORS[skillOf(d)];
  if (by === 'gender') return GENDER_COLORS[d.gender || ''];
  if (by === 'height') {
    if (!d.height) return '#5f6368';
    const hs = project.dancers.map((x) => x.height).filter(Boolean);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    const k = hi > lo ? (d.height - lo) / (hi - lo) : 0.5;
    return `hsl(${210 - k * 30}, 85%, ${78 - k * 46}%)`;  // light blue = shorter, deep blue = taller
  }
  return dancerLook(d).color;
}
function renderColorLegend() {
  const el = $('#colorLegend');
  const by = state.colorBy;
  if (by === 'skill') el.innerHTML = SKILL_COLORS.map((c, i) => `<span><i style="background:${c}"></i>${i ? i : '—'}</span>`).join('') + `<b>skill${window.StageRoster && StageRoster.currentStyle() ? ` · ${StageRoster.currentStyle().name.replace(/[<>&]/g, '')}` : ''}</b>`;
  else if (by === 'gender') el.innerHTML = [['female', 'F'], ['male', 'M'], ['nonbinary', 'NB'], ['', '—']].map(([g, t]) => `<span><i style="background:${GENDER_COLORS[g]}"></i>${t}</span>`).join('');
  else if (by === 'height') {
    const hs = project.dancers.map((x) => x.height).filter(Boolean);
    el.innerHTML = hs.length ? `<span><i style="background:hsl(210,85%,78%)"></i>${window.StageRoster ? StageRoster.formatHeight(Math.min(...hs)) : ''}</span><span><i style="background:hsl(180,85%,32%)"></i>${window.StageRoster ? StageRoster.formatHeight(Math.max(...hs)) : ''}</span><b>height</b>` : '<b>No heights set</b>';
  } else el.innerHTML = '';
  el.classList.toggle('show', by !== 'own');
}

function ensureDancerEl(d) {
  let rec = dancerEls.get(d.id);
  if (!rec) {
    const el = document.createElement('div');
    el.className = 'dancer';
    el.innerHTML = '<div class="token"><svg viewBox="-1.15 -1.15 2.3 2.3"></svg><span class="ini"></span></div><span class="dname"></span>';
    dancerLayer.appendChild(el);
    rec = { el, svg: el.querySelector('svg'), ini: el.querySelector('.ini'), name: el.querySelector('.dname'), shape: null, label: null };
    dancerEls.set(d.id, rec);
  }
  return rec;
}

function drawStage() {
  L = stageLayout();
  const key = JSON.stringify([L.w, L.h, project.stage]);
  if (key !== gridKey) { gridKey = key; rebuildGrid(); }

  const fs = formations();
  const pi = pathFormationIndex();
  const R = dancerRadius();
  const handles = [];

  // ----- paths & ghosts (SVG) -----
  layerPaths.innerHTML = '';
  if (state.showPaths && pi > 0) {
    const from = fs[pi - 1], to = fs[pi];
    const onlySel = state.selected.size > 0;
    for (const d of project.dancers) {
      const A = posIn(from, d.id), B = posIn(to, d.id);
      const a = toScreen(A), b = toScreen(B);
      const path = to.paths[d.id];
      const sel = state.selected.has(d.id);
      const dim = onlySel && !sel;
      const g = svgEl('g', { class: 'path-group' + (dim ? ' dim' : '') + (sel ? ' sel' : ''), style: `--c:${d.color}` }, layerPaths);
      svgEl('circle', { cx: a.x, cy: a.y, r: R * 0.75, class: 'ghost' }, g);
      let tangentFrom = a;
      let dAttr;
      if (path && path.curved) {
        const C = pathControl(A, B, path);
        const cS = toScreen(C);
        dAttr = `M${a.x} ${a.y}Q${cS.x} ${cS.y} ${b.x} ${b.y}`;
        tangentFrom = cS;
        const mid = toScreen(bezier(A, C, B, 0.5));
        if (!onlySel || sel) handles.push({ id: d.id, x: mid.x, y: mid.y, color: d.color });
      } else dAttr = `M${a.x} ${a.y}L${b.x} ${b.y}`;
      svgEl('path', { d: dAttr, class: 'travel' }, g);
      if (Math.hypot(b.x - a.x, b.y - a.y) > R * 2) {
        const ang = Math.atan2(b.y - tangentFrom.y, b.x - tangentFrom.x);
        const tx = b.x - Math.cos(ang) * (R + 3), ty = b.y - Math.sin(ang) * (R + 3);
        const p1 = [tx - Math.cos(ang - 0.45) * 9, ty - Math.sin(ang - 0.45) * 9];
        const p2 = [tx - Math.cos(ang + 0.45) * 9, ty - Math.sin(ang + 0.45) * 9];
        svgEl('polygon', { points: `${tx},${ty} ${p1} ${p2}`, class: 'arrow' }, g);
      }
    }
  }

  // ----- end spots while dancers are moving: where each one arrives (draggable) -----
  state.endSpots = null;
  const locNow = locate(state.time);
  if (locNow.type === 'trans') {
    const to = fs[locNow.j];
    state.endSpots = [];
    for (const d of project.dancers) {
      const q = toScreen(posIn(to, d.id));
      const sel = state.selected.has(d.id);
      const g = svgEl('g', { class: 'end-spot' + (sel ? ' sel' : '') + (state.hover === d.id ? ' hover' : ''), style: `--c:${displayColor(d)}` }, layerPaths);
      svgEl('circle', { cx: q.x, cy: q.y, r: R * 0.92 }, g);
      svgEl('text', { x: q.x, y: q.y + 4, 'text-anchor': 'middle' }, g, initials(d.name));
      state.endSpots.push({ id: d.id, x: q.x, y: q.y });
    }
  }

  // ----- dancers (HTML) -----
  const live = new Set();
  const size = R * 2;
  for (const d of project.dancers) {
    live.add(d.id);
    const rec = ensureDancerEl(d);
    const p = toScreen(dancerPos(d.id, state.time));
    const shape = dancerLook(d).shape;
    if (rec.shape !== shape) { rec.svg.innerHTML = shapeMarkup(shape); rec.shape = shape; rec.el.dataset.shape = shape; }
    const label = initials(d.name);
    if (rec.label !== label) { rec.ini.textContent = label; rec.label = label; }
    if (rec.name.textContent !== d.name) rec.name.textContent = d.name;
    rec.el.style.setProperty('--c', displayColor(d));
    rec.el.style.setProperty('--size', `${size}px`);
    rec.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    rec.el.classList.toggle('sel', state.selected.has(d.id));
    rec.el.classList.toggle('hover', state.hover === d.id);
    rec.el.classList.toggle('no-name', !state.showNames);
  }
  for (const [id, rec] of dancerEls) if (!live.has(id)) { rec.el.remove(); dancerEls.delete(id); }

  // ----- overlay: curve handles + marquee (SVG) -----
  layerOverlay.innerHTML = '';
  // curve handles live under the dancers so a moving dancer is never hidden by one
  for (const hdl of handles) svgEl('circle', { cx: hdl.x, cy: hdl.y, r: 6.5, class: 'curve-handle', style: `--c:${hdl.color}` }, layerPaths);
  state.handles = handles;
  drawRotateOverlay();
  if (state.drag && state.drag.type === 'marquee') {
    const m = state.drag;
    svgEl('rect', { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0), class: 'marquee' }, layerOverlay);
  }

  // ----- status chips (HTML) -----
  const loc = locate(state.time);
  const status = $('#stageStatus');
  if (loc.type === 'hold') {
    status.innerHTML = '<span class="chip-dot"></span><b></b><span class="muted"></span>';
    status.querySelector('b').textContent = fs[loc.i].name;
    status.querySelector('.muted').textContent = `${loc.i + 1} of ${fs.length}`;
  } else {
    status.innerHTML = '<span class="chip-dot moving"></span><b></b><span class="arrow-r">→</span><b></b><span class="muted"></span>';
    const bs = status.querySelectorAll('b');
    bs[0].textContent = fs[loc.i].name; bs[1].textContent = fs[loc.j].name;
    status.querySelector('.muted').textContent = `${Math.round(loc.s * 100)}%`;
  }
  const hint = $('#stageHint');
  hint.classList.toggle('show', loc.type === 'trans' && !state.playing);
}

// ---------------------------------------------------------------------------
// Rotate tool: turn a group (the selection, or the whole formation when nobody is selected)
// around its centre — in this formation, this and later ones, or every formation.
// ---------------------------------------------------------------------------
function rotateIds() {
  if (state.selected.size >= 2) return [...state.selected];
  if (state.selected.size === 0 && project.dancers.length >= 2) return project.dancers.map((d) => d.id);
  return [];
}
function groupCenter(f, ids) {
  const c = { x: 0, y: 0 };
  for (const id of ids) { c.x += f.positions[id].x; c.y += f.positions[id].y; }
  c.x /= ids.length; c.y /= ids.length;
  return c;
}
function selectionCenter(f) { return groupCenter(f, rotateIds()); }
function canRotate() { return !!activeFormation() && rotateIds().length >= 2; }
function rotateScopeFormations() {
  const fs = formations();
  const i = fs.indexOf(activeFormation());
  if (i < 0) return [];
  if (state.rotateScope === 'after') return fs.slice(i);
  if (state.rotateScope === 'all') return fs.slice();
  return [fs[i]];
}
function rotateWhoText() {
  const n = rotateIds().length;
  const who = state.selected.size ? `the ${n} selected dancers` : 'the whole formation';
  const where = state.rotateScope === 'after' ? ' in this and every later formation' : state.rotateScope === 'all' ? ' in every formation' : '';
  return who + where;
}
function setRotateMode(on) {
  state.rotateMode = on && canRotate();
  stageWrap.classList.toggle('rotating', state.rotateMode);
  const chip = $('#rotateChip');
  chip.classList.toggle('show', state.rotateMode);
  if (state.rotateMode) chip.innerHTML = `${ICONS.rotate}<span>Rotate mode — drag on the stage to turn ${rotateWhoText()} · they land on the grid (Alt = off grid) · Shift = free angle · Esc / R to finish</span>`;
  renderArrangeProps();
  drawStage();
}
function rotatePositions(f, starts, center, deg, snap = state.snap) {
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  for (const id in starts) {
    const p = starts[id];
    const dx = p.x - center.x, dy = p.y - center.y;
    let q = { x: center.x + dx * cs - dy * sn, y: center.y + dx * sn + dy * cs };
    // land on the grid like a normal drag does (hold Alt while dragging to rotate freely)
    if (snap && deg) q = snapPoint(q);
    f.positions[id] = { x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 };
  }
}
/** Snapshot of everything a rotation touches: each formation in scope, turning around its own group centre. */
function rotateItems() {
  const ids = rotateIds();
  return rotateScopeFormations().map((f) => {
    const starts = {};
    for (const id of ids) if (f.positions[id]) starts[id] = { ...f.positions[id] };
    return { f, starts, center: groupCenter(f, Object.keys(starts)) };
  });
}
function applyRotation(items, deg, snap = state.snap) { for (const it of items) rotatePositions(it.f, it.starts, it.center, deg, snap); }
/** Rotate by an exact angle (degrees, clockwise as seen on screen). */
function rotateSelection(deg) {
  if (!canRotate() || !deg) return;
  const items = rotateItems();
  mutate(() => applyRotation(items, deg));
}
function startRotateDrag(x, y) {
  const f = activeFormation();
  const center = selectionCenter(f);
  const cs = toScreen(center);
  state.drag = { type: 'rotate', items: rotateItems(), cs, a0: Math.atan2(y - cs.y, x - cs.x), deg: 0, undoPushed: false };
}
/** Ring + centre in rotate mode; otherwise a small grab handle above any selected group. */
function drawRotateOverlay() {
  state.rotHandle = null;
  const f = activeFormation();
  const dr = state.drag && state.drag.type === 'rotate' ? state.drag : null;
  if (!f || (!state.rotateMode && !dr && state.selected.size < 2)) return;
  const ids = rotateIds();
  if (ids.length < 2) return;
  const c = groupCenter(f, ids);
  const cs = dr ? dr.cs : toScreen(c);
  let r = 0;
  for (const id of ids) { const p = toScreen(f.positions[id]); r = Math.max(r, Math.hypot(p.x - cs.x, p.y - cs.y)); }
  r += dancerRadius() + 10;
  if (state.rotateMode || dr) {
    svgEl('circle', { cx: cs.x, cy: cs.y, r, class: 'rotate-ring' }, layerOverlay);
    svgEl('path', { d: `M${cs.x - 8} ${cs.y}H${cs.x + 8}M${cs.x} ${cs.y - 8}V${cs.y + 8}`, class: 'rotate-center' }, layerOverlay);
  }
  if (dr) {
    const a0 = dr.a0, a1 = dr.a0 + (dr.deg * Math.PI) / 180;
    const p0 = [cs.x + Math.cos(a0) * r, cs.y + Math.sin(a0) * r], p1 = [cs.x + Math.cos(a1) * r, cs.y + Math.sin(a1) * r];
    const large = Math.abs(dr.deg) > 180 ? 1 : 0, sweep = dr.deg > 0 ? 1 : 0;
    svgEl('path', { d: `M${cs.x} ${cs.y}L${p0[0]} ${p0[1]}A${r} ${r} 0 ${large} ${sweep} ${p1[0]} ${p1[1]}Z`, class: 'rotate-arc' }, layerOverlay);
    svgEl('line', { x1: cs.x, y1: cs.y, x2: p1[0], y2: p1[1], class: 'rotate-arm' }, layerOverlay);
    const n = dr.items.length;
    svgEl('text', { x: cs.x, y: cs.y - r - 10, class: 'rotate-label', 'text-anchor': 'middle' }, layerOverlay, `${Math.round(dr.deg)}°${n > 1 ? ` · ${n} formations` : ''}`);
    return;
  }
  // grab handle straight above the group (always available when 2+ dancers are selected)
  const hx = cs.x, hy = Math.max(14, cs.y - r - 18);
  svgEl('line', { x1: cs.x, y1: cs.y - r + 4, x2: hx, y2: hy + 8, class: 'rotate-stem' }, layerOverlay);
  const g = svgEl('g', { class: 'rotate-handle', transform: `translate(${hx} ${hy})` }, layerOverlay);
  svgEl('circle', { r: 11 }, g);
  svgEl('path', { d: 'M5.5 0A5.5 5.5 0 1 1 3.9 -3.9M5.5 -4.5V0H1', class: 'rotate-handle-ic' }, g);
  if (!state.rotateMode) svgEl('circle', { cx: cs.x, cy: cs.y, r: 3, class: 'rotate-dot' }, layerOverlay);
  state.rotHandle = { x: hx, y: hy };
}

// ---------------------------------------------------------------------------
// Mirror partners: when you move someone who stands opposite another dancer (same depth, other side
// of centre), offer to move the partner the mirrored way. Setting: ask / always / off.
// ---------------------------------------------------------------------------
function mirrorMode() { return localStorage.getItem('sf.autoMirror') || 'ask'; }
function setMirrorMode(m) { localStorage.setItem('sf.autoMirror', m); }
/** Pairs [moved, partner] in formation f, judged from the spots before the move. */
function findMirrorPartners(f, ids, before) {
  const g = gridStep();
  const tol = Math.max(0.25, Math.min(g.x, g.y) * 0.45);
  const moving = new Set(ids), used = new Set(), pairs = [];
  for (const id of ids) {
    const p = before[id];
    if (!p || Math.abs(p.x) < tol) continue;                // on the centre line: no partner
    let best = null, bd = Infinity;
    for (const d of project.dancers) {
      if (moving.has(d.id) || used.has(d.id)) continue;
      const q = f.positions[d.id];
      if (!q) continue;
      const dd = Math.hypot(q.x + p.x, q.y - p.y);
      if (dd <= tol && dd < bd) { bd = dd; best = d.id; }
    }
    if (best) { pairs.push([id, best]); used.add(best); }
  }
  return pairs;
}
function applyMirror(f, pairs) {
  for (const [a, b] of pairs) { const p = f.positions[a]; if (p) f.positions[b] = { x: -p.x, y: p.y }; }
}
let pendingMirror = null;
function hideMirrorChip() { pendingMirror = null; const c = $('#mirrorChip'); if (c) c.classList.remove('show'); }
/** Called after dancers were moved in formation f. before = their spots before the move (id → {x,y}). */
function afterMove(f, ids, before, { inMutate = false } = {}) {
  const mode = mirrorMode();
  if (mode === 'off') return;
  // keep the pairs while the same dancers keep being nudged
  let pairs;
  if (pendingMirror && pendingMirror.f === f && pendingMirror.ids.join() === ids.join()) pairs = pendingMirror.pairs;
  else pairs = findMirrorPartners(f, ids, before);
  if (!pairs.length) { hideMirrorChip(); return; }
  if (mode === 'always') {
    if (inMutate) applyMirror(f, pairs); else { applyMirror(f, pairs); markDirty(); }
    pendingMirror = { f, ids, pairs };
    showMirrorChip(pairs, true);
    return;
  }
  pendingMirror = { f, ids, pairs };
  showMirrorChip(pairs, false);
}
function showMirrorChip(pairs, done) {
  const c = $('#mirrorChip');
  const name = (id) => (project.dancers.find((d) => d.id === id) || {}).name || '?';
  const who = pairs.length === 1 ? name(pairs[0][1]) : `${pairs.length} partners`;
  c.innerHTML = done
    ? `<span>Mirrored for <b></b></span><button data-m="undo">Undo</button><button data-m="settings" title="Change in Arrange → Mirror partners">Settings</button>`
    : `<span>Mirror this for <b></b>?</span><button data-m="yes" class="on">Mirror</button><button data-m="always">Always</button><button data-m="no" title="Don’t ask again (change in Arrange)">✕</button>`;
  c.querySelector('b').textContent = who;
  c.title = pairs.map(([a, b]) => `${name(a)} ↔ ${name(b)}`).join('\n');
  c.onclick = (e) => {
    const m = e.target.dataset.m; if (!m) return;
    const pm = pendingMirror;
    if (m === 'yes' && pm) { mutate(() => applyMirror(pm.f, pm.pairs)); showMirrorChip(pm.pairs, true); return; }
    if (m === 'always' && pm) { setMirrorMode('always'); mutate(() => applyMirror(pm.f, pm.pairs)); showMirrorChip(pm.pairs, true); renderArrangeProps(); return; }
    if (m === 'no') { setMirrorMode('off'); renderArrangeProps(); flashNote('Won’t ask again — turn it back on in Arrange → Mirror partners'); }
    if (m === 'undo') undo();
    if (m === 'settings') setLeftTab('arrange');
    hideMirrorChip();
  };
  c.classList.add('show');
  clearTimeout(showMirrorChip.t);
  showMirrorChip.t = setTimeout(hideMirrorChip, done ? 4000 : 12000);
}

function hitDancer(x, y) {
  const R = dancerRadius() + 3;
  // while moving, the end spots come first: they are what gets edited
  for (const sp of state.endSpots || []) if (Math.hypot(sp.x - x, sp.y - y) <= R) return project.dancers.find((d) => d.id === sp.id);
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
  const r = stageWrap.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function selectionChanged() { if (state.rotateMode && !canRotate()) setRotateMode(false); renderDancerList(); renderSelectionProps(); renderFormationProps(); drawStage(); }

stageWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (state.playing) pause();
  const { x, y } = canvasPoint(e);
  if (state.rotateMode) {
    if (!canRotate()) { setRotateMode(false); return; }
    startRotateDrag(x, y);
    return;
  }
  if (state.rotHandle && Math.hypot(x - state.rotHandle.x, y - state.rotHandle.y) <= 13 && canRotate()) {
    startRotateDrag(x, y);
    return;
  }
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  const d = hitDancer(x, y);
  const h = d ? null : hitHandle(x, y);
  if (h) {
    state.drag = { type: 'curve', id: h.id, pi: pathFormationIndex(), undoPushed: false };
    return;
  }
  if (d) {
    if (add) { state.selected.has(d.id) ? state.selected.delete(d.id) : state.selected.add(d.id); }
    else if (!state.selected.has(d.id)) { state.selected.clear(); state.selected.add(d.id); }
    const f = activeFormation();
    if (f && state.selected.has(d.id)) {
      const starts = {};
      for (const id of state.selected) starts[id] = { ...f.positions[id] };
      state.drag = { type: 'move', f, primary: d.id, starts, m0: toStage(x, y), undoPushed: false };
    }
    if (pendingMirror) hideMirrorChip();
    selectionChanged();
    return;
  }
  state.drag = { type: 'marquee', x0: x, y0: y, x1: x, y1: y, add, base: new Set(add ? state.selected : []) };
  if (!add) state.selected.clear();
  selectionChanged();
});

stageWrap.addEventListener('mouseleave', () => { if (state.hover) { state.hover = null; drawStage(); } });

window.addEventListener('mousemove', (e) => {
  const dr = state.drag;
  if (!dr) {
    if (stageWrap.contains(e.target)) {
      const { x, y } = canvasPoint(e);
      const d = hitDancer(x, y);
      const onRot = state.rotHandle && Math.hypot(x - state.rotHandle.x, y - state.rotHandle.y) <= 13;
      stageWrap.style.cursor = onRot ? 'alias' : d ? 'grab' : hitHandle(x, y) ? 'move' : 'default';
      const hv = d ? d.id : null;
      if (hv !== state.hover) { state.hover = hv; drawStage(); }
    }
    return;
  }
  if (dr.type === 'rotate') {
    const { x, y } = canvasPoint(e);
    let deg = ((Math.atan2(y - dr.cs.y, x - dr.cs.x) - dr.a0) * 180) / Math.PI;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
    if (!dr.undoPushed) { if (!deg) return; pushUndo(); dr.undoPushed = true; }
    dr.deg = deg;
    // screen and stage share orientation (audience at top is a 180° turn), so the angle carries over
    applyRotation(dr.items, deg, state.snap && !e.altKey);
    drawStage();
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
    stageWrap.style.cursor = 'grabbing';
    stageWrap.classList.add('dragging');
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
  } else if (dr.type === 'tl-block' || dr.type === 'tl-scrub' || dr.type === 'tl-clip') {
    timelineDragMove(e);
  }
});

window.addEventListener('mouseup', () => {
  const dr = state.drag;
  if (!dr) return;
  state.drag = null;
  stageWrap.classList.remove('dragging');
  if (dr.undoPushed) markDirty();
  if (dr.type === 'tl-block') timelineDragEnd(dr);
  if (dr.type === 'tl-clip' && !dr.moved) { setTime(dr.c.start); setLeftTab('choreo'); }
  if (dr.type === 'move' && dr.undoPushed) { pendingMirror = null; afterMove(dr.f, Object.keys(dr.starts), dr.starts); }
  renderAll();
});

stageWrap.addEventListener('dblclick', (e) => {
  const { x, y } = canvasPoint(e);
  const d = hitDancer(x, y);
  if (!d) return;
  setLeftTab('dancers');
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
  const pps = state.pps;
  tlContent.style.width = `${Math.ceil(timelineDuration() * pps)}px`;
  tlTrack.innerHTML = '';
  const cur = panelFormationIndex();
  fs.forEach((f, i) => {
    const moveStart = i > 0 ? fs[i - 1].end : f.start;
    const moveDur = f.start - moveStart, holdDur = f.end - f.start;
    const moveW = moveDur * pps, holdW = holdDur * pps;
    const b = document.createElement('div');
    b.className = 'tl-block' + (i === cur ? ' active' : '') + (i === 0 ? ' first' : '');
    b.dataset.id = f.id;
    b.style.left = `${moveStart * pps}px`;
    b.style.width = `${Math.max(4, moveW + holdW)}px`;
    b.title = `${f.name}\n` + (i > 0 ? `Movement: ${fmtT(moveStart)} → ${fmtT(f.start)} (${fmtLen(moveStart, f.start)})\n` : '') +
      `Hold: ${fmtT(f.start)} → ${fmtT(f.end)} (${fmtLen(f.start, f.end)})\nDrag the divider to set when dancers arrive, the right edge to set when they leave.\nDouble-click to rename.`;
    b.innerHTML = '<div class="seg-move"><span class="lbl"></span></div><div class="seg-hold"><span class="name"></span><span class="dur"></span></div>' +
      (i > 0 ? '<div class="h a" title="Arrival — drag to change how long the movement takes"></div>' : '<div class="h l" title="Start"></div>') +
      '<div class="h r" title="End — when the movement to the next formation starts"></div>';
    const mv = b.querySelector('.seg-move');
    mv.style.width = `${moveW}px`;
    if (moveW > 64) mv.querySelector('.lbl').textContent = `move ${fmtLen(moveStart, f.start)}`;
    else if (moveW > 30) mv.querySelector('.lbl').textContent = useCounts() ? fmtLen(moveStart, f.start) : `${fmtNum(moveDur, 1)}s`;
    b.querySelector('.name').textContent = `${i + 1}. ${f.name}`;
    if (holdW > 120) b.querySelector('.dur').textContent = useCounts() ? `${countLabel(f.start)} · ${fmtLen(f.start, f.end)}` : `${fmtNum(holdDur)}s`;
    if (i > 0) b.querySelector('.h.a').style.left = `${moveW - 5}px`;
    const nl = (f.layers || []).filter((l) => !l.hidden).length;
    if (nl) {
      const lb = document.createElement('span'); lb.className = 'layer-badge';
      lb.textContent = `${nl} layer${nl === 1 ? "" : "s"}`; lb.title = (f.layers || []).filter((l) => !l.hidden).map((l) => l.name).join(', ');
      b.querySelector('.seg-hold').insertBefore(lb, b.querySelector('.dur'));
    }
    b.addEventListener('mousedown', (e) => { if (e.button === 0) timelineBlockDown(e, f); });
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = formations().indexOf(f);
      showMenu(e.clientX, e.clientY, formationMenuItems(idx, [...state.selected]), `${idx + 1}. ${f.name}`);
    });
    b.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      askText('Rename formation', f.name).then((name) => { if (name) mutate(() => { f.name = name; }); });
    });
    tlTrack.appendChild(b);
  });
  renderChoreoTrack();
}

// ---------- Choreo lane (pose clips placed on dancers) ----------
function clipById(id) { return state.clips.find((c) => c.id === id); }
function renderChoreoTrack() {
  const el = $('#tlChoreo');
  el.innerHTML = '';
  const pps = state.pps;
  const items = [...project.choreo].sort((a, b) => a.start - b.start);
  const laneEnds = [];
  const lane = new Map();
  for (const c of items) {
    let l = laneEnds.findIndex((end) => end <= c.start + 1e-6);
    if (l < 0) { l = laneEnds.length; laneEnds.push(0); }
    laneEnds[l] = c.start + c.duration;
    lane.set(c.id, l);
  }
  const lanes = Math.max(1, laneEnds.length);
  const h = 26 / lanes;
  if (!items.length) {
    const hint = document.createElement('div');
    hint.className = 'tl-choreo-hint';
    hint.textContent = 'Move clips you place on dancers (Choreo tab) appear here';
    el.appendChild(hint);
  }
  for (const c of items) {
    const clip = clipById(c.clipId);
    const b = document.createElement('div');
    b.className = 'tl-clip' + (state.selectedChoreo === c.id ? ' sel' : '') + (clip ? '' : ' missing');
    b.style.left = `${c.start * pps}px`;
    b.style.width = `${Math.max(6, c.duration * pps)}px`;
    b.style.top = `${3 + lane.get(c.id) * h}px`;
    b.style.height = `${h - 2}px`;
    const names = c.dancerIds.map((id) => (project.dancers.find((d) => d.id === id) || {}).name).filter(Boolean);
    b.title = `${clip ? clip.name : 'Missing clip'}\n${fmtTime(c.start)} – ${fmtTime(c.start + c.duration)}\nOn: ${names.join(', ') || 'nobody'}\nDrag to move · drag the right edge to trim · Delete to remove`;
    b.innerHTML = '<span class="lbl"></span><div class="h r"></div>';
    b.querySelector('.lbl').textContent = `${clip ? clip.name : 'Missing clip'} · ${names.length} dancer${names.length === 1 ? '' : 's'}`;
    b.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (state.playing) pause();
      state.selectedChoreo = c.id;
      state.selected = new Set(c.dancerIds);
      state.drag = { type: 'tl-clip', c, mode: e.target.classList.contains('r') ? 'r' : 'move', x0: e.clientX, s0: c.start, d0: c.duration, moved: false, undoPushed: false };
      renderChoreoTrack(); renderDancerList(); renderSelectionProps(); drawStage();
      if (window.StageChoreo) window.StageChoreo.render();
    });
    el.appendChild(b);
  }
}
function choreoDragMove(e) {
  const dr = state.drag;
  const dx = e.clientX - dr.x0;
  if (!dr.moved && Math.abs(dx) < 3) return;
  if (!dr.undoPushed) { pushUndo(); dr.undoPushed = true; }
  dr.moved = true;
  const dt = dx / state.pps;
  const clip = clipById(dr.c.clipId);
  if (dr.mode === 'move') dr.c.start = snapTime(dr.s0 + dt, e.shiftKey);
  else {
    const max = clip ? clip.duration - dr.c.offset : Infinity;
    dr.c.duration = clamp(snapTime(dr.s0 + dr.d0 + dt, e.shiftKey) - dr.c.start, 0.2, max);
  }
  renderChoreoTrack();
  drawStage();
}
/** How far inside the stage area a dancer is at time t (negative = outside), in stage units. */
function stageInset(id, t = state.time) {
  const S = project.stage, p = dancerPos(id, t);
  return Math.min(S.width / 2 - Math.abs(p.x), S.depth / 2 - Math.abs(p.y));
}
/** Margin past the stage edge (about 2 ft / 0.6 m) where a move fades out; further out counts as off stage. */
function offStageMargin() { return project.stage.unit === 'm' ? 0.6 : 2; }
/** True when the dancer is off the stage area at time t (in the wings, or past the front or back). Off-stage dancers do no choreo. */
function isOffStage(id, t = state.time) { return stageInset(id, t) < -offStageMargin(); }
/** 0–1: how much of a move a dancer near the edge performs (fades out as they walk off, in as they walk on). */
function onStageWeight(id, t = state.time) { const m = offStageMargin(); return clamp((stageInset(id, t) + m) / m, 0, 1); }
/** Is this dancer mirrored in this placement? (each dancer can differ from the placement's default) */
function choreoMirror(a, id) { return a.mirrorFor && id in a.mirrorFor ? !!a.mirrorFor[id] : !!a.mirror; }
/** The placement (move clip on the timeline) a dancer performs at time t, or null. */
function choreoAt(id, t = state.time) {
  return project.choreo.find((a) => t >= a.start && t < a.start + a.duration && a.dancerIds.includes(id)) || null;
}
function choreoKey() {
  const t = state.time;
  return project.choreo.filter((a) => t >= a.start && t < a.start + a.duration).map((a) => a.id).join(',') + '|' +
    [...state.selected].map((id) => (isOffStage(id, t) ? 'o' : 'i')).join('');
}
/** Give the selected dancers a different move (or none) at the playhead, keeping the same section of music. */
function setDancersChoreo(ids, clipId, mirror) {
  const t = state.time;
  mutate(() => {
    for (const id of ids) {
      const cur = choreoAt(id, t);
      if (cur && cur.clipId === clipId) { if (mirror != null) (cur.mirrorFor ||= {})[id] = mirror; continue; }
      if (cur) { cur.dancerIds = cur.dancerIds.filter((x) => x !== id); if (cur.mirrorFor) delete cur.mirrorFor[id]; }
      if (!clipId) continue;
      // join a placement of that clip already running here, or start one where the old move started
      let b = project.choreo.find((a) => a.clipId === clipId && t >= a.start && t < a.start + a.duration);
      if (!b) {
        const clip = clipById(clipId);
        const start = cur ? cur.start : Math.round(t * 100) / 100;
        b = { id: uid(), clipId, dancerIds: [], start, duration: cur ? cur.duration : (clip ? clip.duration : 4), offset: cur ? cur.offset : 0, mirror: !!mirror, mirrorFor: {} };
        project.choreo.push(b);
      }
      b.dancerIds.push(id);
      (b.mirrorFor ||= {})[id] = mirror != null ? !!mirror : (cur ? choreoMirror(cur, id) : b.mirror);
    }
    project.choreo = project.choreo.filter((a) => a.dancerIds.length);
  });
  if (window.StageChoreo) window.StageChoreo.render();
}
function renderChoreoProps(el, sel) {
  if (!sel.length) return;
  el.appendChild(sectionTitle('Choreo at the playhead'));
  if (!state.clips.length) {
    const t = document.createElement('div'); t.className = 'muted small';
    t.textContent = 'Make a move clip in the Choreo tab first, then choose here what each dancer does.';
    el.appendChild(t); return;
  }
  const opts = `<option value="">No choreo</option>` + state.clips.map((c) => `<option value="${c.id}">${String(c.name || 'Clip').replace(/[<>&"]/g, '')}</option>`).join('');
  const rows = document.createElement('div'); rows.className = 'choreo-rows';
  const row = (label, ids, off) => {
    const r = document.createElement('div'); r.className = 'choreo-row' + (off ? ' off' : '');
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = label;
    r.appendChild(nm);
    if (off) {
      const o = document.createElement('span'); o.className = 'muted small'; o.textContent = 'Off stage · no choreo';
      r.appendChild(o); rows.appendChild(r); return;
    }
    const cur = ids.map((id) => choreoAt(id));
    const same = cur.every((a) => (a ? a.clipId : '') === (cur[0] ? cur[0].clipId : ''));
    const sl = document.createElement('select');
    sl.innerHTML = (same ? '' : '<option value="__mixed">Mixed</option>') + opts;
    sl.value = same ? (cur[0] ? cur[0].clipId : '') : '__mixed';
    sl.addEventListener('change', () => { if (sl.value !== '__mixed') setDancersChoreo(ids, sl.value || null, null); });
    const mirrored = ids.map((id, k) => (cur[k] ? choreoMirror(cur[k], id) : false));
    const mb = document.createElement('button'); mb.textContent = 'Mirror';
    mb.className = 'mirror-btn' + (mirrored.every(Boolean) && cur.some(Boolean) ? ' on' : mirrored.some(Boolean) ? ' part' : '');
    mb.title = 'Do this move mirrored (left and right swapped)';
    mb.disabled = !cur.some(Boolean);
    mb.onclick = () => {
      const to = !mirrored.every(Boolean);
      mutate(() => { ids.forEach((id, k) => { if (cur[k]) (cur[k].mirrorFor ||= {})[id] = to; }); });
      if (window.StageChoreo) window.StageChoreo.render();
    };
    r.append(sl, mb);
    rows.appendChild(r);
  };
  const onIds = sel.filter((d) => !isOffStage(d.id)).map((d) => d.id);
  if (sel.length > 1 && onIds.length > 1) row(`All ${onIds.length} on stage`, onIds, false);
  for (const d of sel) row(d.name, [d.id], isOffStage(d.id));
  el.appendChild(rows);
  const hint = document.createElement('div'); hint.className = 'muted small';
  hint.textContent = 'Each dancer on stage can do any move clip, mirrored or not. Dancers off the stage area (more than ' + offStageMargin() + ' ' + project.stage.unit + ' past the edge, e.g. in the wings) never do choreo; the move fades out as they walk off and back in as they walk on.';
  el.appendChild(hint);
}

function removeChoreo(id) {
  mutate(() => { project.choreo = project.choreo.filter((c) => c.id !== id); });
  if (state.selectedChoreo === id) state.selectedChoreo = null;
  if (window.StageChoreo) window.StageChoreo.render();
}

function updateBlockClasses() {
  const cur = formations()[panelFormationIndex()];
  for (const el of tlTrack.querySelectorAll('.tl-block')) el.classList.toggle('active', !!cur && el.dataset.id === cur.id);
}

function timeFromEvent(e) {
  const r = tlScroll.getBoundingClientRect();
  return (e.clientX - r.left + tlScroll.scrollLeft) / state.pps;
}

function timelineBlockDown(e, f) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (state.playing) pause();
  const cl = e.target.classList;
  const mode = cl.contains('a') ? 'a' : cl.contains('l') ? 'l' : cl.contains('r') ? 'r' : 'move';
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
  if (dr.type === 'tl-scrub') { setTime(timeFromEvent(e)); return; }
  if (dr.type === 'tl-clip') { choreoDragMove(e); return; }
  const dxPx = e.clientX - dr.x0;
  if (!dr.moved && Math.abs(dxPx) < 3) return;
  if (!dr.undoPushed) { pushUndo(); dr.undoPushed = true; }
  dr.moved = true;
  const fs = formations();
  const f = dr.f, i = dr.i;
  const dt = dxPx / state.pps;
  const prevEnd = i > 0 ? fs[i - 1].end : 0;
  const ripple = state.ripple !== e.altKey; // Alt temporarily inverts "push later formations"
  const nextStart = !ripple && dr.later.length ? dr.later[0].s : Infinity;
  const bypass = e.shiftKey;
  let shift = 0;
  if (dr.mode === 'a' || dr.mode === 'l') {
    f.start = clamp(snapTime(dr.s0 + dt, bypass), prevEnd, f.end - MIN_HOLD);
  } else if (dr.mode === 'r') {
    f.end = clamp(snapTime(dr.e0 + dt, bypass), f.start + MIN_HOLD, nextStart);
    if (ripple) shift = f.end - dr.e0;
  } else {
    const len = dr.e0 - dr.s0;
    f.start = clamp(snapTime(dr.s0 + dt, bypass), prevEnd, nextStart - len);
    f.end = f.start + len;
    if (ripple) shift = f.end - dr.e0;
  }
  for (const l of dr.later) { l.g.start = l.s + shift; l.g.end = l.e + shift; }
  renderTimelineBlocks();
  renderFormationProps();
  drawTimeline();
  drawStage();
}

function timelineDragEnd(dr) {
  if (!dr.moved) setTime(dr.mode === 'r' ? dr.f.end : dr.f.start);
}

function startScrub(e) {
  if (e.button !== 0) return;
  if (state.playing) pause();
  state.drag = { type: 'tl-scrub' };
  setTime(timeFromEvent(e));
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

// scrolling the timeline yourself (wheel, trackpad, scroll bar, touch) stops it from following the playhead
for (const ev of ['wheel', 'touchmove']) tlScroll.addEventListener(ev, () => { if (state.playing) state.follow = false; }, { passive: true });
tlScroll.addEventListener('mousedown', (e) => {
  const r = tlScroll.getBoundingClientRect();
  if (e.clientY > r.top + tlScroll.clientHeight || e.clientX > r.left + tlScroll.clientWidth) state.follow = false;   // on the scroll bar
  else state.follow = true;                                                                                         // clicked into the timeline
});
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
  ctx.fillStyle = '#232426';
  ctx.fillRect(0, 0, w, ROW_RULER);
  ctx.fillStyle = '#1b1c1e';
  ctx.fillRect(0, ROW_RULER, w, ROW_WAVE);
  ctx.strokeStyle = '#3c3f43';
  ctx.beginPath(); ctx.moveTo(0, ROW_RULER + 0.5); ctx.lineTo(w, ROW_RULER + 0.5);
  ctx.moveTo(0, ROW_RULER + ROW_WAVE + 0.5); ctx.lineTo(w, ROW_RULER + ROW_WAVE + 0.5); ctx.stroke();

  // waveform
  const A = state.audio;
  if (A && A.peaks) {
    const mid = ROW_RULER + ROW_WAVE / 2;
    ctx.fillStyle = 'rgba(124,172,248,0.8)';
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
    ctx.fillStyle = '#5f6368';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('No music — load an MP3 or WAV in the Music panel', 12, ROW_RULER + ROW_WAVE / 2);
  }

  // tapped beats: a tick per beat on the music row, 8-count numbers on the downbeats
  if (hasBeats()) {
    const b = beats();
    const spacing = ((b[b.length - 1] - b[0]) / (b.length - 1)) * pps;
    ctx.font = '600 10px Segoe UI, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const first = Math.max(-64, Math.floor(beatAt(t0)) - 1), last = Math.ceil(beatAt(t1)) + 1;
    for (let k = first; k <= last; k++) {
      const tb = timeOfBeat(k);
      if (tb < 0) continue;
      const x = Math.round(tb * pps - sl) + 0.5;
      if (x < -2 || x > w + 2) continue;
      const tapped = k >= 0 && k < b.length;
      const cb = countOf(k), n = cb.b - 1;   // 0 = count "1"
      const down = n === 0, restart = down && phraseIndexes().includes(k);
      ctx.strokeStyle = restart ? '#f28b82' : down ? 'rgba(253,214,99,.9)' : tapped ? 'rgba(253,214,99,.45)' : 'rgba(253,214,99,.18)';
      ctx.lineWidth = down ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(x, ROW_RULER + (down ? 0 : 14)); ctx.lineTo(x, ROW_RULER + ROW_WAVE); ctx.stroke();
      if (down && (spacing * 8 > 22 || restart)) { ctx.fillStyle = restart ? '#f28b82' : '#fdd663'; ctx.fillText(String(cb.c), x + 3, ROW_RULER + 2); }
      else if (spacing > 16) { ctx.fillStyle = 'rgba(253,214,99,.7)'; ctx.font = '9px Segoe UI, sans-serif'; ctx.fillText(String(n + 1), x + 2, ROW_RULER + 3); ctx.font = '600 10px Segoe UI, sans-serif'; }
    }
    ctx.lineWidth = 1;
  }
  // taps being recorded right now
  if (state.tapping) {
    ctx.fillStyle = '#f28b82';
    for (const tt of state.tapping.taps) { const x = tt * pps - sl; if (x >= -3 && x <= w + 3) ctx.fillRect(Math.round(x) - 1, ROW_RULER, 3, ROW_WAVE); }
  }

  // ruler ticks
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const major = steps.find((s) => s * pps >= 70) || 120;
  const minor = steps.slice().reverse().find((s) => s < major && s * pps >= 10 && (major / s) % 1 < 1e-9) || major;
  ctx.strokeStyle = '#5f6368';
  ctx.fillStyle = '#9aa0a6';
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
    ctx.strokeStyle = '#f28b82';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.fillStyle = '#f28b82';
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, 8); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
  }
}

// ---------------------------------------------------------------------------
// Side panels
// ---------------------------------------------------------------------------
const workspace = $('#workspace');
function setPanel(side, open) {
  workspace.classList.toggle(`${side}-open`, open);
  $(side === 'left' ? '#btnToggleLeft' : '#btnToggleRight').classList.toggle('on', open);
  localStorage.setItem(`sf.${side}Open`, open ? '1' : '0');
  requestAnimationFrame(() => { drawStage(); drawTimeline(); });
}
function setLeftTab(name, { open = true } = {}) {
  for (const t of document.querySelectorAll('.rail-btn[data-tab]')) t.classList.toggle('active', t.dataset.tab === name);
  for (const p of document.querySelectorAll('.tab-page')) p.classList.toggle('active', p.dataset.page === name);
  state.leftTab = name;
  if (open) setPanel('left', true);
}
for (const t of document.querySelectorAll('.rail-btn[data-tab]')) {
  t.addEventListener('click', () => {
    // clicking the active icon folds the panel away, like VS Code
    if (t.dataset.tab === state.leftTab && workspace.classList.contains('left-open')) setPanel('left', false);
    else setLeftTab(t.dataset.tab);
  });
}
$('#railCollapse').addEventListener('click', () => setPanel('left', !workspace.classList.contains('left-open')));
for (const b of document.querySelectorAll('.close-panel')) b.addEventListener('click', () => setPanel('left', false));
$('#btnToggleLeft').addEventListener('click', () => setPanel('left', !workspace.classList.contains('left-open')));
$('#btnToggleRight').addEventListener('click', () => setPanel('right', !workspace.classList.contains('right-open')));
$('#btnCloseRight').addEventListener('click', () => setPanel('right', false));
state.leftTab = 'dancers';

function renderDancerList() {
  const ul = $('#dancerList');
  ul.innerHTML = '';
  $('#dancerCount').textContent = project.dancers.length;
  for (const d of project.dancers) {
    const li = document.createElement('li');
    li.dataset.id = d.id;
    if (state.selected.has(d.id)) li.classList.add('sel');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.innerHTML = shapeIcon(d.shape || 'circle', d.color, 18);
    const name = document.createElement('input');
    name.type = 'text'; name.value = d.name; name.spellcheck = false;
    name.addEventListener('change', () => { const v = name.value.trim() || d.name; mutate(() => { d.name = v; }); if (window.StageRoster) StageRoster.pushToRoster([d.id]); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
    const del = document.createElement('button');
    del.className = 'icon-btn del'; del.title = 'Remove dancer';
    del.innerHTML = ICONS.trash;
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteDancer(d.id); });
    const meta = document.createElement('span');
    meta.className = 'dmeta';
    meta.textContent = [skillOf(d) ? '★'.repeat(skillOf(d)) : '', d.height && window.StageRoster ? StageRoster.formatHeight(d.height) : ''].filter(Boolean).join(' · ');
    li.append(sw, name, meta, del);
    li.addEventListener('mousedown', (e) => {
      if (e.target.closest('.del')) return;
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
  l.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  const i = document.createElement('input');
  i.type = 'number'; i.step = opts.step || '0.1';
  if (opts.min != null) i.min = opts.min;
  i.value = fmtNum(value, 2);
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) onChange(v); else i.value = fmtNum(value, 2); });
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); });
  l.append(span, i);
  return l;
}
function btn(text, onClick, opts = {}) {
  const b = document.createElement('button');
  if (opts.html) b.innerHTML = text; else b.textContent = text;
  if (opts.title) b.title = opts.title;
  if (opts.cls) b.className = opts.cls;
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', onClick);
  return b;
}
function sectionTitle(text) {
  const h = document.createElement('div');
  h.className = 'sub-title';
  h.textContent = text;
  return h;
}

/** Change a formation's end; with "push later formations" on, everything after moves too. */
function setFormationEnd(i, v) {
  const fs = formations(), f = fs[i];
  v = Math.max(v, f.start + MIN_HOLD);
  if (state.ripple) {
    const shift = v - f.end;
    for (let k = i + 1; k < fs.length; k++) { fs[k].start += shift; fs[k].end += shift; }
    f.end = v;
  } else f.end = Math.min(v, i < fs.length - 1 ? fs[i + 1].start : Infinity);
}
function setFormationArrive(i, v) {
  const fs = formations(), f = fs[i];
  f.start = clamp(v, i > 0 ? fs[i - 1].end : 0, f.end - MIN_HOLD);
}

function updateTimeDisplay() {
  $('#timeDisplay').textContent = useCounts() ? countLabel(state.time) : fmtTime(state.time);
  $('#timeSub').textContent = useCounts() ? fmtTime(state.time) : hasBeats() ? countLabel(state.time) : '';
}

function timeRow(label, value, onSet, help) {
  const row = document.createElement('div');
  row.className = 'time-row';
  row.title = help || '';
  const l = document.createElement('span'); l.textContent = label;
  const i = document.createElement('input');
  if (useCounts()) {
    // counts: type "3·5" (8-count 3, beat 5) or "3-5&"; the exact time is shown underneath
    i.type = 'text'; i.value = countLabel(value); i.title = `${fmtTime(value)} — type a count like 3·5 or 3-5&`;
    i.addEventListener('change', () => { const v = parseCount(i.value); if (v != null) mutate(() => onSet(v)); else i.value = countLabel(value); });
  } else {
    i.type = 'number'; i.step = '0.01'; i.min = '0';
    i.value = value.toFixed(2);
    i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) mutate(() => onSet(v)); else i.value = value.toFixed(2); });
  }
  i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); e.stopPropagation(); });
  const b = btn(ICONS.playhead, () => mutate(() => onSet(state.time)), { html: true, cls: 'icon-btn sm', title: 'Set to playhead time' });
  row.append(l, i, b);
  return row;
}

function renderFormationProps() {
  const el = $('#formationProps');
  el.innerHTML = '';
  const fs = formations();
  const loc = locate(state.time);
  const i = panelFormationIndex(), f = fs[i];
  $('#btnDeleteFormation').disabled = fs.length <= 1;

  const nameL = document.createElement('label');
  nameL.className = 'field';
  const nspan = document.createElement('span');
  nspan.textContent = `Name · ${i + 1} of ${fs.length}`;
  const name = document.createElement('input');
  name.type = 'text'; name.value = f.name; name.spellcheck = false;
  name.addEventListener('change', () => { const v = name.value.trim(); if (v) mutate(() => { f.name = v; }); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
  nameL.append(nspan, name);
  el.appendChild(nameL);

  if (loc.type === 'trans') {
    const st = document.createElement('div');
    st.className = 'moving-note';
    st.textContent = `Dancers are moving into this formation (${Math.round(loc.s * 100)}%). The dashed outlines on stage are where they end up: drag them (or the moving dancers) to change this formation.`;
    el.appendChild(st);
  }

  el.appendChild(sectionTitle(useCounts() ? 'Timing (counts · 8-count·beat)' : 'Timing (seconds)'));
  const prev = i > 0 ? fs[i - 1] : null;
  if (prev) {
    el.appendChild(timeRow('Movement starts', prev.end, (v) => { prev.end = clamp(v, prev.start + MIN_HOLD, f.start); },
      'When dancers leave the previous formation'));
  }
  el.appendChild(timeRow(prev ? 'Arrive' : 'Start', f.start, (v) => setFormationArrive(i, v), 'When dancers reach this formation'));
  el.appendChild(timeRow('End', f.end, (v) => setFormationEnd(i, v), 'When dancers start moving to the next formation'));

  const g = document.createElement('div');
  g.className = 'grid2';
  g.style.marginTop = '8px';
  if (useCounts()) {
    // lengths in counts (beats), rounded to half counts
    const cts = (a, b) => Math.round((beatAt(b) - beatAt(a)) * 2) / 2;
    if (prev) g.appendChild(numField('Move length (counts)', cts(prev.end, f.start), (v) => mutate(() => setFormationArrive(i, timeOfBeat(beatAt(prev.end) + Math.max(0, v)))), { step: '0.5', min: 0 }));
    g.appendChild(numField('Hold length (counts)', cts(f.start, f.end), (v) => mutate(() => setFormationEnd(i, timeOfBeat(beatAt(f.start) + Math.max(0.5, v)))), { step: '0.5', min: 0 }));
  } else {
    if (prev) g.appendChild(numField('Move length', f.start - prev.end, (v) => mutate(() => setFormationArrive(i, prev.end + Math.max(0, v))), { step: '0.01', min: 0 }));
    g.appendChild(numField('Hold length', f.end - f.start, (v) => mutate(() => setFormationEnd(i, f.start + Math.max(MIN_HOLD, v))), { step: '0.01', min: 0 }));
  }
  el.appendChild(g);
  if (useCounts()) {
    const t = document.createElement('div'); t.className = 'muted small';
    t.textContent = `Exact times: ${prev ? `moves ${fmtTime(prev.end)} → ` : ''}arrives ${fmtTime(f.start)}, ends ${fmtTime(f.end)}`;
    el.appendChild(t);
  }
  renderLayers(el, f, i);
}

/** "Layers" for one formation: a group of dancers that looks or moves differently in this formation only. */
function renderLayers(el, f, fi) {
  el.appendChild(sectionTitle('Layers in this formation'));
  const hint = document.createElement('div'); hint.className = 'muted small';
  hint.textContent = 'A layer changes a group of dancers for this formation only: a different colour or shape (a costume change), or a different move clip in 3D (their own choreo for this section). Their own settings come back in the next formation.';
  el.appendChild(hint);
  const nSel = state.selected.size;
  const add = btn(nSel ? `New layer from ${nSel} selected` : 'Select dancers, then add a layer', async () => {
    const ids = [...state.selected];
    const name = await askText('Layer name', `Layer ${(f.layers || []).length + 1}`, { ok: 'Create', hint: `${ids.length} dancer${ids.length === 1 ? '' : 's'} · ${f.name} only` });
    if (!name) return;
    mutate(() => { (f.layers = f.layers || []).push({ id: uid(), name: name.trim(), dancerIds: ids, color: null, shape: null, clipId: null, mirror: false, hidden: false }); });
  }, { cls: 'filled wide', disabled: !nSel });
  add.style.margin = '8px 0';
  el.appendChild(add);

  const byId = new Map(project.dancers.map((d) => [d.id, d]));
  for (const L of f.layers || []) {
    const card = document.createElement('div');
    card.className = 'layer-card' + (L.hidden ? ' off' : '');
    const head = document.createElement('div'); head.className = 'layer-head';
    const eye = btn(L.hidden ? '◌' : '●', () => mutate(() => { L.hidden = !L.hidden; }), { title: L.hidden ? 'Show this layer' : 'Hide this layer (dancers use their own look)', cls: 'icon-btn' });
    const nm = document.createElement('b'); nm.textContent = L.name; nm.title = 'Double-click to rename';
    nm.addEventListener('dblclick', async () => { const v = await askText('Rename layer', L.name, { ok: 'Rename' }); if (v && v.trim()) mutate(() => { L.name = v.trim(); }); });
    const members = L.dancerIds.filter((id) => byId.has(id));
    const count = document.createElement('span'); count.className = 'muted small'; count.textContent = `${members.length} dancer${members.length === 1 ? '' : 's'}`;
    const del = btn('✕', () => mutate(() => { f.layers = f.layers.filter((x) => x !== L); }), { title: 'Delete layer', cls: 'icon-btn' });
    head.append(eye, nm, count, del);
    card.appendChild(head);

    const who = document.createElement('div'); who.className = 'layer-who';
    who.textContent = members.map((id) => byId.get(id).name).join(', ') || 'No dancers';
    card.appendChild(who);

    const acts = document.createElement('div'); acts.className = 'layer-acts';
    acts.append(
      btn('Select', () => { state.selected = new Set(members); selectionChanged(); }, { title: 'Select the dancers in this layer' }),
      btn('Set to selection', () => mutate(() => { L.dancerIds = [...state.selected]; }), { title: 'Make this layer the currently selected dancers', disabled: !nSel }),
      btn('+ / − selected', () => mutate(() => {
        const set = new Set(L.dancerIds); const all = [...state.selected].every((id) => set.has(id));
        for (const id of state.selected) all ? set.delete(id) : set.add(id);
        L.dancerIds = [...set];
      }), { title: 'Add the selected dancers, or remove them if they are all already in it', disabled: !nSel })
    );
    card.appendChild(acts);

    // colour
    const cRow = document.createElement('div'); cRow.className = 'layer-row';
    const cl = document.createElement('span'); cl.textContent = 'Colour';
    const sw = document.createElement('div'); sw.className = 'layer-swatches';
    const none = btn('Own', () => mutate(() => { L.color = null; }), { cls: 'sw-own' + (!L.color ? ' on' : ''), title: 'Keep each dancer\'s own colour' });
    sw.appendChild(none);
    for (const c of PALETTE.slice(0, 8)) {
      const b = document.createElement('button'); b.className = 'sw' + (L.color && L.color.toLowerCase() === c.toLowerCase() ? ' on' : '');
      b.style.background = c; b.title = c; b.addEventListener('click', () => mutate(() => { L.color = c; }));
      sw.appendChild(b);
    }
    const ci = document.createElement('input'); ci.type = 'color'; ci.value = L.color || '#ffffff'; ci.title = 'Custom colour';
    ci.addEventListener('input', () => { L.color = ci.value; drawStage(); });
    ci.addEventListener('change', () => { const v = ci.value; mutate(() => { L.color = v; }); });
    sw.appendChild(ci);
    cRow.append(cl, sw);
    card.appendChild(cRow);

    // shape
    const sRow = document.createElement('label'); sRow.className = 'layer-row';
    const sl = document.createElement('span'); sl.textContent = 'Shape';
    const ss = document.createElement('select');
    ss.innerHTML = `<option value="">Own shape</option>` + SHAPES.map((x) => `<option value="${x}">${x[0].toUpperCase() + x.slice(1)}</option>`).join('');
    ss.value = L.shape || '';
    ss.addEventListener('change', () => mutate(() => { L.shape = ss.value || null; }));
    sRow.append(sl, ss);
    card.appendChild(sRow);

    // move clip (3D)
    const mRow = document.createElement('label'); mRow.className = 'layer-row';
    const ml = document.createElement('span'); ml.textContent = 'Move (3D)';
    const ms = document.createElement('select');
    ms.innerHTML = `<option value="">Same as everyone</option>` + state.clips.map((c) => `<option value="${c.id}">${String(c.name || 'Clip').replace(/[<>&"]/g, '')}</option>`).join('');
    ms.value = L.clipId && clipById(L.clipId) ? L.clipId : '';
    ms.disabled = !state.clips.length;
    ms.title = state.clips.length ? 'Plays from the start of this block\'s move-in until the block ends' : 'Make a move clip in the Choreo tab first';
    ms.addEventListener('change', () => mutate(() => { L.clipId = ms.value || null; }));
    mRow.append(ml, ms);
    card.appendChild(mRow);
    if (L.clipId) {
      const mir = document.createElement('label'); mir.className = 'switch small';
      mir.innerHTML = `<input type="checkbox" ${L.mirror ? 'checked' : ''}/><i></i><span>Mirror the move</span>`;
      mir.querySelector('input').addEventListener('change', (e) => mutate(() => { L.mirror = e.target.checked; }));
      card.appendChild(mir);
    }
    el.appendChild(card);
  }
}

/** Apply a dancer property to the selection; live=true previews without an undo step. */
let liveOriginal = null;
function setSelectedProp(key, value, live = false) {
  const ds = project.dancers.filter((d) => state.selected.has(d.id));
  if (!ds.length) return;
  if (live) {
    if (!liveOriginal) liveOriginal = { key, values: ds.map((d) => [d, d[key]]) };
    for (const d of ds) d[key] = value;
    drawStage();
    for (const d of ds) {
      const sw = document.querySelector(`#dancerList li[data-id="${d.id}"] .swatch`);
      if (sw) sw.innerHTML = shapeIcon(d.shape || 'circle', d.color, 18);
    }
    return;
  }
  if (liveOriginal) { for (const [d, v] of liveOriginal.values) d[liveOriginal.key] = v; liveOriginal = null; }
  mutate(() => { for (const d of ds) d[key] = value; });
  if (window.StageRoster) StageRoster.pushToRoster(ds.map((d) => d.id));
}

/** Colour + shape for the selected dancers — lives in the Dancers tab under the list. */
function renderDancerAppearance() {
  const el = $('#dancerAppearance');
  el.innerHTML = '';
  const n = state.selected.size;
  const sel = project.dancers.filter((d) => state.selected.has(d.id));

  const appear = document.createElement('div');
  appear.className = 'appearance' + (n ? '' : ' disabled');
  if (!n) {
    const tip = document.createElement('div');
    tip.className = 'empty-tip';
    tip.innerHTML = 'Select dancers in the list above (Shift/Ctrl-click for several) or on the stage, then pick their colour and shape here.';
    appear.appendChild(tip);
  }
  const commonColor = sel.length && sel.every((d) => d.color.toLowerCase() === sel[0].color.toLowerCase()) ? sel[0].color.toLowerCase() : null;
  const commonShape = sel.length && sel.every((d) => (d.shape || 'circle') === (sel[0].shape || 'circle')) ? (sel[0].shape || 'circle') : null;

  const c1 = document.createElement('div'); c1.className = 'card';
  c1.appendChild(Object.assign(document.createElement('div'), { className: 'card-title', textContent: n ? `Colour · ${n} selected` : 'Colour' }));
  const sw = document.createElement('div');
  sw.className = 'swatches';
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.className = 'color-swatch' + (commonColor === c ? ' on' : '');
    b.style.setProperty('--c', c);
    b.title = c;
    b.disabled = !n;
    b.addEventListener('click', () => setSelectedProp('color', c));
    sw.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'color-swatch custom' + (commonColor && !PALETTE.includes(commonColor) ? ' on' : '');
  custom.title = 'Custom colour';
  const ci = document.createElement('input');
  ci.type = 'color';
  ci.value = commonColor || '#ffffff';
  ci.disabled = !n;
  ci.addEventListener('input', () => setSelectedProp('color', ci.value, true));
  ci.addEventListener('change', () => setSelectedProp('color', ci.value));
  custom.appendChild(ci);
  if (commonColor) custom.style.setProperty('--c', commonColor);
  sw.appendChild(custom);
  c1.appendChild(sw);
  appear.appendChild(c1);

  const c2 = document.createElement('div'); c2.className = 'card';
  c2.appendChild(Object.assign(document.createElement('div'), { className: 'card-title', textContent: 'Shape' }));
  const shapes = document.createElement('div');
  shapes.className = 'shapes';
  const iconColor = commonColor || '#c4c7c5';
  for (const s of SHAPES) {
    shapes.appendChild(btn(shapeIcon(s, iconColor, 22), () => setSelectedProp('shape', s),
      { html: true, cls: 'shape-btn' + (commonShape === s ? ' on' : ''), title: s[0].toUpperCase() + s.slice(1), disabled: !n }));
  }
  c2.appendChild(shapes);
  appear.appendChild(c2);
  el.appendChild(appear);
  if (window.StageRoster) StageRoster.renderEditor();
}

function renderArrangeProps() {
  renderDancerAppearance();
  const el = $('#arrangeProps');
  el.innerHTML = '';
  const n = state.selected.size;
  const act = activeFormation();
  $('#selCount').textContent = n ? `${n} selected` : '';

  const cr = document.createElement('div'); cr.className = 'card';
  cr.appendChild(Object.assign(document.createElement('div'), { className: 'card-title', textContent: 'Rotate' }));
  const rOk = canRotate();
  const t = document.createElement('div'); t.className = 'muted small'; t.style.marginBottom = '8px';
  t.textContent = !act ? 'Put the playhead in the solid part of a formation to rotate.'
    : n === 1 ? 'Select two or more dancers (or none, to turn the whole formation).'
    : n ? `Turns the ${n} selected dancers around the centre of their group. Or drag the round handle above them on stage.`
    : 'Nobody selected: turns the whole formation around its centre.';
  cr.appendChild(t);
  const scope = document.createElement('label'); scope.className = 'field'; scope.style.marginBottom = '8px';
  scope.innerHTML = '<span>Rotate in</span><select><option value="this">This formation</option><option value="after">This and all later formations</option><option value="all">Every formation</option></select>';
  const ss = scope.querySelector('select');
  ss.value = state.rotateScope;
  ss.addEventListener('change', () => { state.rotateScope = ss.value; if (state.rotateMode) setRotateMode(true); else renderArrangeProps(); });
  cr.appendChild(scope);
  if (state.rotateScope !== 'this') {
    const nf = rotateScopeFormations().length;
    const w = document.createElement('div'); w.className = 'muted small'; w.style.margin = '-2px 0 8px';
    w.textContent = `Each of the ${nf} formation${nf === 1 ? '' : 's'} turns around its own group centre.`;
    cr.appendChild(w);
  }
  cr.appendChild(btn(`${ICONS.rotate}<span>${state.rotateMode ? 'Done rotating' : 'Rotate by dragging'}</span>`, () => setRotateMode(!state.rotateMode),
    { html: true, cls: 'filled wide' + (state.rotateMode ? ' on' : ''), disabled: !rOk && !state.rotateMode, title: 'Then drag anywhere on the stage (R)' }));
  const rr = document.createElement('div'); rr.className = 'rotate-row';
  const ang = document.createElement('input'); ang.type = 'number'; ang.step = '1'; ang.value = '90'; ang.disabled = !rOk; ang.title = 'Degrees, clockwise';
  ang.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') rotateSelection(parseFloat(ang.value) || 0); });
  rr.append(ang, Object.assign(document.createElement('span'), { className: 'muted small', textContent: '°' }),
    btn('↻ Apply', () => rotateSelection(parseFloat(ang.value) || 0), { cls: 'tonal', disabled: !rOk, title: 'Rotate clockwise by this angle' }),
    btn('↺', () => rotateSelection(-(parseFloat(ang.value) || 0)), { cls: 'tonal', disabled: !rOk, title: 'Rotate counter-clockwise by this angle' }));
  cr.appendChild(rr);
  const quick = document.createElement('div'); quick.className = 'quick-angles';
  for (const a of [-90, -45, -15, 15, 45, 90, 180]) quick.appendChild(btn(`${a > 0 ? '+' : ''}${a}°`, () => rotateSelection(a), { disabled: !rOk, title: a > 0 ? 'Clockwise' : 'Counter-clockwise' }));
  cr.appendChild(quick);
  el.appendChild(cr);

  const c3 = document.createElement('div'); c3.className = 'card';
  c3.appendChild(Object.assign(document.createElement('div'), { className: 'card-title', textContent: 'Layout' }));
  if (!act) {
    const t = document.createElement('div'); t.className = 'muted small'; t.style.marginBottom = '8px';
    t.textContent = 'Put the playhead in the solid part of a formation to use these.';
    c3.appendChild(t);
  } else if (!n) {
    const t = document.createElement('div'); t.className = 'muted small'; t.style.marginBottom = '8px';
    t.textContent = 'No one selected: layout tools apply to everyone.';
    c3.appendChild(t);
  }
  const grid = document.createElement('div');
  grid.className = 'btn-grid';
  const dis = !act;
  grid.appendChild(btn('Mirror L ↔ R', () => arrange('mirror'), { disabled: dis }));
  grid.appendChild(btn('Mirror front ↔ back', () => arrange('flipFB'), { disabled: dis }));
  grid.appendChild(btn('Line up in a row', () => arrange('row'), { disabled: dis, title: 'Put on the same horizontal line' }));
  grid.appendChild(btn('Line up in a column', () => arrange('col'), { disabled: dis, title: 'Put on the same vertical line' }));
  grid.appendChild(btn('Space evenly ↔', () => arrange('spreadX'), { disabled: dis }));
  grid.appendChild(btn('Space evenly ↕', () => arrange('spreadY'), { disabled: dis }));
  grid.appendChild(btn('Center L ↔ R', () => arrange('center'), { disabled: dis }));
  c3.appendChild(grid);
  el.appendChild(c3);

  const c4 = document.createElement('div'); c4.className = 'card';
  c4.appendChild(Object.assign(document.createElement('div'), { className: 'card-title', textContent: 'Mirror partners' }));
  const mp = document.createElement('label'); mp.className = 'field';
  mp.innerHTML = `<span>When you move someone who has a mirror partner</span><select>
    <option value="ask">Ask to mirror it for the partner</option><option value="always">Mirror it automatically</option><option value="off">Do nothing</option></select>`;
  const sel = mp.querySelector('select'); sel.value = mirrorMode();
  sel.addEventListener('change', () => { setMirrorMode(sel.value); hideMirrorChip(); });
  c4.appendChild(mp);
  c4.appendChild(Object.assign(document.createElement('div'), { className: 'muted small', textContent: 'A mirror partner stands at the same depth on the other side of center. Moving one (drag or W A S D) can move the other the mirrored way.' }));
  el.appendChild(c4);
}

function renderSelectionProps() {
  renderArrangeProps();
  const el = $('#selectionProps');
  el.innerHTML = '';
  const n = state.selected.size;
  const act = activeFormation();
  const pi = pathFormationIndex();
  const sel = project.dancers.filter((d) => state.selected.has(d.id));

  const who = document.createElement('div');
  who.className = 'muted small';
  who.textContent = n ? (n === 1 ? sel[0].name : `${n} dancers`) : 'None selected';
  el.appendChild(who);

  if (n === 1 && act) {
    const p = act.positions[sel[0].id];
    el.appendChild(sectionTitle('Position'));
    const g = document.createElement('div');
    g.className = 'grid2';
    g.appendChild(numField(`X (${project.stage.unit})`, p.x, (v) => mutate(() => { p.x = v; })));
    g.appendChild(numField(`Y (${project.stage.unit}, + = front)`, p.y, (v) => mutate(() => { p.y = v; })));
    el.appendChild(g);
    const co = document.createElement('div'); co.className = 'callout-line';
    const cs = StageRender.callout(project, p);
    co.textContent = `${cs.short} · ${cs.long}`;
    el.appendChild(co);
  }

  renderChoreoProps(el, sel);

  el.appendChild(sectionTitle(pi > 0 ? `Path into “${formations()[pi].name}”` : 'Path'));
  if (pi <= 0) {
    const t = document.createElement('div'); t.className = 'muted small'; t.textContent = 'The first formation has no incoming path.';
    el.appendChild(t);
  }
  const seg = document.createElement('div');
  seg.className = 'seg';
  let allCurved = pi > 0, allStraight = pi > 0;
  if (pi > 0) for (const id of targetIds()) { const c = !!(formations()[pi].paths[id] || {}).curved; if (c) allStraight = false; else allCurved = false; }
  seg.appendChild(btn(`${ICONS.straight}<span>Straight</span>`, () => setCurve('straight'), { html: true, disabled: pi <= 0, cls: allStraight ? 'on' : '', title: 'Move in a straight line' }));
  seg.appendChild(btn(`${ICONS.curve}<span>Curved</span>`, () => setCurve('curved'), { html: true, disabled: pi <= 0, cls: allCurved ? 'on' : '', title: 'Move along a curve — drag the round handle on stage to shape it (C)' }));
  seg.appendChild(btn(`${ICONS.flip}<span>Flip</span>`, () => setCurve('flip'), { html: true, disabled: pi <= 0, title: 'Bend the curve the other way' }));
  el.appendChild(seg);
  if (!n && pi > 0) {
    const t = document.createElement('div'); t.className = 'muted small'; t.textContent = 'No one selected: path buttons apply to everyone.';
    el.appendChild(t);
  }
}

function renderAudioProps() {
  $('#audioName').textContent = state.audioData ? state.audioData.name : 'No music loaded';
  $('#audioMeta').textContent = state.audioData && state.audio ? `Length ${fmtTime(state.audio.duration)}` : 'MP3, WAV, OGG, M4A, AAC or FLAC';
  $('#audioCard').classList.toggle('empty', !state.audioData);
  $('#btnRemoveAudio').disabled = !state.audioData;
}

function syncStageInputs() {
  const S = project.stage;
  $('#stWidth').value = S.width; $('#stDepth').value = S.depth; $('#stUnit').value = S.unit;
  $('#stAudience').value = S.audience; $('#stCols').value = S.columns; $('#stRows').value = S.rows; $('#stSub').value = S.subdivisions;
  $('#optEasing').value = project.settings.easing;
  for (const u of document.querySelectorAll('.unit')) u.textContent = S.unit;
  const g = gridStep();
  $('#gridInfo').textContent = `Each small square is ${fmtNum(g.x)} × ${fmtNum(g.y)} ${S.unit}`;
  $('#stCallout').value = S.callout || 'markers';
  $('#calloutInfo').textContent = (S.callout || 'markers') === 'markers'
    ? `1 marker = ${fmtNum(S.width / S.columns)} ${S.unit} across, ${fmtNum(S.depth / S.rows)} ${S.unit} deep. "2 markers right of center · 1 marker from the front" is written (+2, 1).`
    : `Spots are written as ${S.unit} from center and from the front, e.g. (+4, 6).`;
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
  updateTimeDisplay();
  renderColorLegend();
  if (window.StageChoreo) window.StageChoreo.render();
  if (window.StageBeats) window.StageBeats.render();
}

/** In-app text prompt (window.prompt is not available in Electron). Resolves to the trimmed text or null. */
function askText(title, value = '', { ok = 'OK', hint = '' } = {}) {
  return new Promise((resolve) => {
    const m = $('#promptModal');
    $('#promptTitle').textContent = title;
    $('#promptHint').textContent = hint;
    const input = $('#promptInput');
    input.value = value;
    $('#promptOk').textContent = ok;
    m.classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const finish = (v) => { m.classList.add('hidden'); cleanup(); resolve(v); };
    const onOk = () => finish(input.value.trim() || null);
    const onCancel = () => finish(null);
    const onKey = (e) => { e.stopPropagation(); if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };
    const onBg = (e) => { if (e.target === m) onCancel(); };
    function cleanup() {
      $('#promptOk').removeEventListener('click', onOk); $('#promptCancel').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey); m.removeEventListener('mousedown', onBg);
    }
    $('#promptOk').addEventListener('click', onOk); $('#promptCancel').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey); m.addEventListener('mousedown', onBg);
  });
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
bindStageInput('#stCallout', 'callout');
for (const b of document.querySelectorAll('[data-step]')) {
  b.addEventListener('click', () => {
    const input = $(b.dataset.target);
    input.value = (parseFloat(input.value) || 0) + parseFloat(b.dataset.step);
    input.dispatchEvent(new Event('change'));
  });
}
$('#optEasing').addEventListener('change', (e) => mutate(() => { project.settings.easing = e.target.value; }));
for (const el of document.querySelectorAll('.panel input')) {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); e.stopPropagation(); });
}

$('#btnMenu').onclick = (e) => {
  if (native) { const r = e.currentTarget.getBoundingClientRect(); native.popupMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) }); }
};
$('#btnSave').onclick = () => saveProject(false);
$('#btnExport').onclick = () => window.StageExport && window.StageExport.open();
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#btnHelp').onclick = () => $('#helpModal').classList.remove('hidden');
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => $('#' + b.dataset.close).classList.add('hidden'));
for (const m of document.querySelectorAll('.modal')) m.addEventListener('mousedown', (e) => { if (e.target === m && !m.dataset.busy) m.classList.add('hidden'); });
$('#btnAddDancer').onclick = () => addDancers(clamp(parseInt($('#addCount').value, 10) || 1, 1, 50));
$('#btnSelectAll').onclick = () => { state.selected = new Set(project.dancers.map((d) => d.id)); selectionChanged(); };
$('#btnSelectNone').onclick = () => { state.selected.clear(); selectionChanged(); };
$('#btnLoadAudio').onclick = loadAudioDialog;
$('#btnRemoveAudio').onclick = () => { if (confirm('Remove the music from this project?')) { setAudio(null); markDirty(); renderTimelineBlocks(); } };
function setVolume(v) {
  state.volume = clamp(Math.round(v * 100) / 100, 0, 1);
  if (state.audio) state.audio.el.volume = state.volume;
  $('#volume').value = String(state.volume);
  const pct = `${Math.round(state.volume * 100)}%`;
  $('#volumeLabel').textContent = pct;
  $('#volChip').textContent = pct;
  localStorage.setItem('sf.volume', String(state.volume));
}
$('#volume').addEventListener('input', (e) => setVolume(parseFloat(e.target.value)));
setVolume(parseFloat(localStorage.getItem('sf.volume') ?? '1'));
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
$('#optTimeRef').value = state.timeRef;
$('#optTimeRef').addEventListener('change', (e) => { state.timeRef = e.target.value; localStorage.setItem('sf.timeRef', state.timeRef); renderAll(); });
$('#optTimeStep').addEventListener('change', (e) => { const v = e.target.value; state.timeStep = v === 'beat' || v === 'half' ? v : parseFloat(v) || 0; });
$('#optRipple').addEventListener('change', (e) => { state.ripple = e.target.checked; });
$('#optColorBy').addEventListener('change', (e) => { state.colorBy = e.target.value; renderColorLegend(); drawStage(); });
$('#optNames').addEventListener('change', (e) => { state.showNames = e.target.checked; drawStage(); });
$('#optPaths').addEventListener('change', (e) => { state.showPaths = e.target.checked; drawStage(); });

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' && !['checkbox', 'range', 'color', 'button'].includes(a.type) || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

function nudgeSelected(dxDir, dyDir, fine) {
  const f = activeFormation();
  if (!f || !state.selected.size) return false;
  const g = gridStep();
  const sx = fine ? 0.1 : g.x, sy = fine ? 0.1 : g.y;
  const flip = project.stage.audience === 'top' ? -1 : 1;
  const ids = [...state.selected];
  const before = Object.fromEntries(ids.map((id) => [id, { ...f.positions[id] }]));
  mutate(() => {
    for (const id of ids) { const p = f.positions[id]; p.x += dxDir * sx * flip; p.y += dyDir * sy * flip; }
    afterMove(f, ids, before, { inMutate: true });
  });
  return true;
}

// ---------------------------------------------------------------------------
// Copy & paste spots and formations — works across formations, segments and sets (kept in localStorage)
// ---------------------------------------------------------------------------
const CLIP_KEY = 'sf.clipboard';
let clipMem = null;
function readClip() {
  if (clipMem) return clipMem;
  try { clipMem = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { clipMem = null; }
  return clipMem;
}
function writeClip(c) { clipMem = c; try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)); } catch { /* full: keep in memory */ } }

/** Small notice at the bottom of the stage. */
function flashNote(msg) {
  let n = document.getElementById('editorNote');
  if (!n) { n = document.createElement('div'); n.id = 'editorNote'; document.body.appendChild(n); }
  n.textContent = msg; n.classList.add('show');
  clearTimeout(flashNote.t); flashNote.t = setTimeout(() => n.classList.remove('show'), 2600);
}

/** Copy the spots of some dancers (or everyone = the whole formation) in formation f. */
function copySpots(f, ids, whole) {
  if (!f) return;
  const items = ids.map((id) => {
    const d = project.dancers.find((x) => x.id === id); if (!d) return null;
    const p = f.positions[id] || dancerPos(id, f.start);
    return { id: d.id, memberId: d.memberId || null, name: d.name, color: d.color, shape: d.shape, gender: d.gender || '', height: d.height || null, skills: d.skills || null, x: p.x, y: p.y,
      path: f.paths && f.paths[id] ? { ...f.paths[id] } : null };
  }).filter(Boolean);
  if (!items.length) return;
  writeClip({ kind: whole ? 'formation' : 'dancers', name: f.name, segment: project.name, stage: { width: project.stage.width, depth: project.stage.depth }, items, at: Date.now() });
  flashNote(whole ? `Copied “${f.name}” (${items.length} dancers) — paste with Ctrl+V into any formation or segment` : `Copied ${items.length} dancer${items.length > 1 ? 's' : ''}' spots from “${f.name}”`);
  if (state.view === 'editor') renderFormationProps();
}
/** Find the dancer in this segment a copied one belongs to: same dancer, same roster member, then same name. */
function matchDancer(it) {
  return project.dancers.find((d) => d.id === it.id) || (it.memberId && project.dancers.find((d) => d.memberId === it.memberId)) ||
    project.dancers.find((d) => d.name.trim().toLowerCase() === String(it.name).trim().toLowerCase()) || null;
}
/** Put the copied spots onto formation f. Dancers this segment doesn't have yet are added. mirror flips left/right. */
function pasteSpotsInto(f, { mirror = false, inMutate = false } = {}) {
  const c = readClip();
  if (!c || !f) return 0;
  const added = [], moved = [];
  const run = () => {
    for (const it of c.items) {
      let d = matchDancer(it);
      const p = { x: mirror ? -it.x : it.x, y: it.y };
      if (!d) {
        d = { id: uid(), name: it.name, color: it.color || PALETTE[project.dancers.length % PALETTE.length], shape: SHAPES.includes(it.shape) ? it.shape : 'circle',
          ...(it.gender ? { gender: it.gender } : {}), ...(it.height ? { height: it.height } : {}), ...(it.skills ? { skills: it.skills } : {}), ...(it.memberId ? { memberId: it.memberId } : {}) };
        project.dancers.push(d);
        // a new dancer waits in the wings in the other formations
        const S = project.stage, side = added.length % 2 ? 1 : -1;
        for (const g of formations()) g.positions[d.id] = { x: side * (S.width / 2 + (project.stage.unit === 'm' ? 1.5 : 5)), y: S.depth / 2 - (1 + Math.floor(added.length / 2)) * (S.depth / 8) };
        added.push(d.id);
      } else moved.push(d.id);
      f.positions[d.id] = p;
      if (it.path && f !== formations()[0]) f.paths[d.id] = mirror && it.path.curved ? { ...it.path, dx: -it.path.dx } : { ...it.path };
    }
    state.selected = new Set([...moved, ...added]);
  };
  if (inMutate) run(); else mutate(run);
  flashNote(`Pasted ${moved.length + added.length} spot${moved.length + added.length === 1 ? '' : 's'} into “${f.name}”${mirror ? ' (mirrored)' : ''}${added.length ? ` · added ${added.length} new dancer${added.length > 1 ? 's' : ''} (they wait in the wings in other formations)` : ''}`);
  return moved.length + added.length;
}
/** New formation right after formation index i (shifting later ones if needed), with the given spots. */
function insertFormationAfter(i, positions, name) {
  const fs = formations();
  const prev = fs[i];
  const start = roundStep(prev.end + DEFAULT_TRANS);
  const nf = { id: uid(), name: name || nextFormationName(), start, end: start + DEFAULT_HOLD, positions: {}, paths: {}, layers: [] };
  for (const d of project.dancers) nf.positions[d.id] = { ...(positions[d.id] || prev.positions[d.id] || dancerPos(d.id, prev.end)) };
  const next = fs[i + 1];
  if (next) { const shift = nf.end + 1 - next.start; if (shift > 0) for (let k = i + 1; k < fs.length; k++) { fs[k].start += shift; fs[k].end += shift; } }
  fs.splice(i + 1, 0, nf);
  sortFormations();
  state.time = nf.start;
  return nf;
}
function pasteAsNewFormation(i) {
  const c = readClip(); if (!c) return;
  const fs = formations();
  mutate(() => {
    const nf = insertFormationAfter(i, fs[i].positions, c.kind === 'formation' ? `${c.name} (copy)` : null);
    pasteSpotsInto(nf, { inMutate: true });
  });
  setTime(state.time); followPlayhead(true);
}
/** Put some dancers (default: everyone) back on their spots from another formation. */
function resetSpots(f, from, ids) {
  if (!f || !from) return;
  ids = ids && ids.length ? ids : project.dancers.map((d) => d.id);
  mutate(() => { for (const id of ids) if (from.positions[id]) { f.positions[id] = { ...from.positions[id] }; } });
  flashNote(`${ids.length === project.dancers.length ? 'Everyone' : `${ids.length} dancer${ids.length > 1 ? 's' : ''}`} back on their spots from “${from.name}”`);
}
function flipSpots(f, ids, axis) {
  ids = ids && ids.length ? ids : project.dancers.map((d) => d.id);
  mutate(() => { for (const id of ids) { const p = f.positions[id]; if (p) p[axis] = -p[axis]; } });
}
/** Swap two dancers' spots and paths in formation i and every formation after it. */
function swapRest(i, ids) {
  if (ids.length !== 2) return;
  const [a, b] = ids, fs = formations();
  mutate(() => {
    for (let k = i; k < fs.length; k++) {
      const f = fs[k];
      const pa = f.positions[a]; f.positions[a] = f.positions[b]; f.positions[b] = pa;
      if (f.paths) { const qa = f.paths[a], qb = f.paths[b]; if (qb) f.paths[a] = qb; else delete f.paths[a]; if (qa) f.paths[b] = qa; else delete f.paths[b]; }
    }
  });
  const n = (id) => (project.dancers.find((d) => d.id === id) || {}).name;
  flashNote(`${n(a)} and ${n(b)} swapped in ${fs.length - i} formation${fs.length - i > 1 ? 's' : ''}`);
}
function swapTwo(f, ids) {
  if (ids.length !== 2) return;
  mutate(() => { const [a, b] = ids; const pa = f.positions[a]; f.positions[a] = f.positions[b]; f.positions[b] = pa; });
}

// ---------- context menu ----------
let ctxMenu = null;
function closeMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
function showMenu(x, y, items, title) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'ctx-menu';
  if (title) { const h = document.createElement('div'); h.className = 'ctx-title'; h.textContent = title; m.appendChild(h); }
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { const hr = document.createElement('div'); hr.className = 'ctx-sep'; m.appendChild(hr); continue; }
    const b = document.createElement('button');
    b.innerHTML = '<span></span><kbd></kbd>';
    b.querySelector('span').textContent = it.label;
    b.querySelector('kbd').textContent = (it.key || '').replace('Ctrl+', /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+');
    b.disabled = !!it.disabled;
    if (it.danger) b.classList.add('danger');
    b.addEventListener('click', () => { closeMenu(); it.action(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
  ctxMenu = m;
}
window.addEventListener('mousedown', (e) => { if (ctxMenu && !ctxMenu.contains(e.target)) closeMenu(); }, true);
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

/** Menu items for formation index i. ids = the dancers the dancer-level items act on (empty = everyone). */
function formationMenuItems(i, ids) {
  const fs = formations(), f = fs[i], prev = fs[i - 1], next = fs[i + 1];
  const c = readClip();
  const who = ids.length ? (ids.length === 1 ? (project.dancers.find((d) => d.id === ids[0]) || {}).name : `${ids.length} selected`) : 'everyone';
  const pasteLbl = c ? (c.kind === 'formation' ? `“${c.name}”` : `${c.items.length} dancer${c.items.length > 1 ? 's' : ''}`) : '';
  return [
    ids.length ? { label: ids.length === 1 ? `Copy ${who}'s spot` : `Copy the ${ids.length} selected dancers' spots`, key: 'Ctrl+C', action: () => copySpots(f, ids, false) } : null,
    { label: 'Copy formation', key: ids.length ? '' : 'Ctrl+C', action: () => copySpots(f, project.dancers.map((d) => d.id), true) },
    { label: c ? `Paste ${pasteLbl} here` : 'Paste', key: 'Ctrl+V', disabled: !c, action: () => pasteSpotsInto(f) },
    { label: c ? `Paste ${pasteLbl} mirrored` : 'Paste mirrored', disabled: !c, action: () => pasteSpotsInto(f, { mirror: true }) },
    { label: 'Paste as a new formation after this', key: 'Ctrl+Shift+V', disabled: !c, action: () => pasteAsNewFormation(i) },
    { sep: true },
    { label: `Reset ${who} to the previous formation${prev ? ` (“${prev.name}”)` : ''}`, disabled: !prev, action: () => resetSpots(f, prev, ids) },
    { label: `Reset ${who} to the next formation${next ? ` (“${next.name}”)` : ''}`, disabled: !next, action: () => resetSpots(f, next, ids) },
    { label: `Mirror ${who} left ↔ right`, action: () => flipSpots(f, ids, 'x') },
    { label: `Flip ${who} front ↔ back`, action: () => flipSpots(f, ids, 'y') },
    ids.length === 2 ? { label: 'Swap these two dancers (this formation)', action: () => swapTwo(f, ids) } : null,
    ids.length === 2 && next ? { label: `Swap these two from here to the end (${fs.length - i} formations)`, action: () => swapRest(i, ids) } : null,
    { sep: true },
    { label: 'Duplicate formation', action: () => { mutate(() => { insertFormationAfter(i, f.positions, `${f.name} (copy)`); }); setTime(state.time); followPlayhead(true); } },
    { label: 'New formation after this', action: () => { mutate(() => { insertFormationAfter(i, f.positions); }); setTime(state.time); followPlayhead(true); } },
    { label: 'Rename…', action: () => askText('Rename formation', f.name).then((n) => { if (n) mutate(() => { f.name = n; }); }) },
    { label: 'Delete formation', danger: true, disabled: fs.length <= 1, action: () => { mutate(() => { project.formations = formations().filter((x) => x !== f); }); setTime(state.time); } }
  ];
}

stageWrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const { x, y } = canvasPoint(e);
  const d = hitDancer(x, y);
  if (d && !state.selected.has(d.id)) { state.selected = new Set([d.id]); selectionChanged(); }
  const i = panelFormationIndex();
  const f = formations()[i];
  if (!f) return;
  showMenu(e.clientX, e.clientY, formationMenuItems(i, [...state.selected]), `${i + 1}. ${f.name}${isMoving() ? ' · dancers moving here' : ''}`);
});

// Ctrl+C / Ctrl+V arrive as copy / paste events (from the keyboard or the Edit menu)
const editorClipOk = (e) => state.view === 'editor' && !isTyping() && ![...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden')) &&
  !(window.getSelection && String(window.getSelection()).length && !e.fromKey);
document.addEventListener('copy', (e) => {
  if (!editorClipOk(e)) return;
  const f = formations()[panelFormationIndex()];
  const ids = [...state.selected];
  copySpots(f, ids.length ? ids : project.dancers.map((d) => d.id), !ids.length);
  e.preventDefault();
  try { e.clipboardData.setData('text/plain', `StageFlow: ${ids.length ? `${ids.length} dancers' spots` : `formation “${f.name}”`}`); } catch { /* ignore */ }
});
let pasteAsNew = false;
document.addEventListener('paste', (e) => {
  if (!editorClipOk(e)) return;
  e.preventDefault();
  const i = panelFormationIndex();
  if (pasteAsNew) { pasteAsNew = false; pasteAsNewFormation(i); return; }
  if (!readClip()) { flashNote('Nothing copied yet — select dancers (or nobody, for the whole formation) and press Ctrl+C'); return; }
  pasteSpotsInto(formations()[i]);
});

window.addEventListener('keydown', (e) => {
  if (state.tapping && window.StageBeats && window.StageBeats.onKey(e)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const modalOpen = [...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden'));
  if (e.key === 'Escape' && modalOpen) { for (const m of document.querySelectorAll('.modal')) if (!m.dataset.busy) m.classList.add('hidden'); return; }
  if (mod && k === 'h') { e.preventDefault(); window.StageDashboard && window.StageDashboard.show(); return; }
  if (state.view !== 'editor' || modalOpen) return;
  if (mod) {
    if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (k === 'o') { e.preventDefault(); openProject(); return; }
    if (k === 'n') { e.preventDefault(); newProject(); return; }
    if (k === 'e') { e.preventDefault(); window.StageExport && window.StageExport.open(); return; }
    if (isTyping()) return; // let text fields handle their own undo / select-all
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === 'y') { e.preventDefault(); redo(); return; }
    if (k === 'a') { e.preventDefault(); state.selected = new Set(project.dancers.map((d) => d.id)); selectionChanged(); return; }
    if (k === 'v' && e.shiftKey) { e.preventDefault(); pasteAsNewFormation(panelFormationIndex()); return; }
    if (k === 'd') { e.preventDefault(); const i = panelFormationIndex(), f = formations()[i]; mutate(() => { insertFormationAfter(i, f.positions, `${f.name} (copy)`); }); setTime(state.time); followPlayhead(true); return; }
    return;
  }
  if (isTyping()) return;
  // W A S D — move the selected dancer(s) in the current formation
  const wasd = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] }[k];
  if (wasd && !e.altKey) { e.preventDefault(); nudgeSelected(wasd[0], wasd[1], e.shiftKey); return; }
  if (e.key === ' ') { e.preventDefault(); if (document.activeElement) document.activeElement.blur(); togglePlay(); }
  else if (e.key === 'Escape') { if (state.rotateMode) setRotateMode(false); else { state.selected.clear(); selectionChanged(); } }
  else if (k === 'r') { if (canRotate() || state.rotateMode) { setLeftTab('arrange'); setRotateMode(!state.rotateMode); } }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); gotoFormation(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); gotoFormation(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setVolume(state.volume + 0.05); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setVolume(state.volume - 0.05); }
  else if (k === 'n') addFormation();
  else if (k === 'c') setCurve('toggle');
  else if (k === 'v') setViewMode(state.viewMode === '2d' ? '3d' : state.viewMode === '3d' ? 'split' : '2d');
  else if (e.key === '[') gotoFormation(-1);
  else if (e.key === ']') gotoFormation(1);
  else if (e.key === 'Home') { setTime(0); tlScroll.scrollLeft = 0; }
  else if (e.key === 'Delete' && state.selectedChoreo) { removeChoreo(state.selectedChoreo); }
});

if (native) {
  document.body.classList.add(`platform-${native.platform}`);
  native.onMenu((action) => {
    const typing = isTyping();
    switch (action) {
      case 'new': newProject(); break;
      case 'open': openProject(); break;
      case 'save': saveProject(false); break;
      case 'saveAs': saveProject(true); break;
      case 'loadAudio': loadAudioDialog(); break;
      case 'exportPng': exportPng(); break;
      case 'export': if (state.view === 'editor' && window.StageExport) window.StageExport.open(); break;
      case 'home': window.StageDashboard && window.StageDashboard.show(); break;
      case 'importPdf': if (state.view === 'editor') $('#btnImportPdf').click(); break;
      case 'undo': typing ? document.execCommand('undo') : undo(); break;
      case 'redo': typing ? document.execCommand('redo') : redo(); break;
      case 'help': $('#helpModal').classList.remove('hidden'); break;
    }
  });
  native.onOpenFile(async ({ filePath, text }) => {
    if (state.view === 'dashboard' || await confirmDiscard()) loadProjectText(text, filePath);
  });
  native.onCloseRequested(async () => {
    if (state.view === 'dashboard' || await confirmDiscard()) native.confirmClose();
  });
} else {
  document.body.classList.add('platform-web');
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

/** Switch between the dashboard and the segment editor. */
function showView(view) {
  state.view = view;
  document.body.classList.toggle('show-dashboard', view === 'dashboard');
  document.body.classList.toggle('show-editor', view === 'editor');
  if (view === 'dashboard') pause();
  updateTitle();
  requestAnimationFrame(() => { drawStage(); drawTimeline(); });
}

function setViewMode(mode) {
  state.viewMode = mode;
  const area = $('#stageArea');
  area.classList.remove('mode-2d', 'mode-3d', 'mode-split');
  area.classList.add(`mode-${mode}`);
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === mode);
  drawStage();
}
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setViewMode(b.dataset.view));

// restore panel state
setPanel('left', localStorage.getItem('sf.leftOpen') !== '0');
setPanel('right', localStorage.getItem('sf.rightOpen') !== '0');

// inject toolbar icons
$('#btnPlay').innerHTML = ICONS.play;
for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', ICONS[el.dataset.icon] || '');

new ResizeObserver(() => { drawStage(); drawTimeline(); }).observe(stageWrap);
new ResizeObserver(() => drawTimeline()).observe(tlScroll);

// expose for automated tests / debugging
window.__stageflow = {
  get project() { return project; }, state, setTime, addFormation, setAudio, loadProjectText, serialize, locate, dancerPos, markDirty, setViewMode,
  skillOf, hasBeats, beatAt, timeOfBeat, countLabel, countOf, phraseIndexes, parseCount, fmtT, updateTimeDisplay,
  mutate, pause, play, togglePlay, renderAll, showView, saveProject, newProject, confirmDiscard, defaultProject, normalizeProject, exportPng,
  askText, formations, activeFormation, panelFormationIndex, timelineDuration, fmtTime, fmtNum, uid, ICONS, btn, setLeftTab, setPanel, setVolume,
  removeChoreo, clipById, renderChoreoTrack, pushUndo, isOffStage, onStageWeight, choreoMirror, dancerLook, layerChoreo, blockIndexAt,
  renderChoreoUI: () => window.StageChoreo && window.StageChoreo.render()
};

renderAll();
showView(native ? 'dashboard' : 'editor');
