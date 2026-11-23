/* StageFlow — Choreo: pose (skeleton) analysis from video with MediaPipe, turned into move clips. */
import { PoseLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const api = window.__stageflow;
const native = window.stageflowNative || null;
const $ = (s) => document.querySelector(s);
const SAMPLE_FPS = 30;
const MAX_SECONDS = 600;
const MODELS = { best: 'pose_landmarker_heavy.task', fast: 'pose_landmarker_full.task' };
const BODY = [11, 12, 23, 24, 25, 26, 27, 28];       // shoulders, hips, knees, ankles
const FEET = [27, 28, 29, 30, 31, 32];

const landmarkers = {};
let job = null;

const abs = (p) => new URL(p, location.href).href;
/** True when WebGL is only a software renderer (no real GPU) — then the CPU path is much faster. */
function softwareGpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch { return true; }
}
async function getLandmarker(status, quality = 'best') {
  if (landmarkers[quality]) return landmarkers[quality];
  status(quality === 'best' ? 'Loading the high-accuracy pose model…' : 'Loading the pose model…');
  const fileset = { wasmLoaderPath: abs('./vendor/mediapipe/vision_wasm_internal.js'), wasmBinaryPath: abs('./vendor/mediapipe/vision_wasm_internal.wasm') };
  let lastErr = null;
  for (const delegate of softwareGpu() ? ['CPU', 'GPU'] : ['GPU', 'CPU']) {
    try {
      landmarkers[quality] = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: abs('./vendor/mediapipe/' + MODELS[quality]), delegate },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.6
      });
      return landmarkers[quality];
    } catch (e) { lastErr = e; console.warn(`Pose model (${delegate}) failed`, e); }
  }
  throw lastErr || new Error('Could not load the pose model');
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

const LEFT = new Set([11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);
function drawOverlay(canvas, video, lms, ok) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);
  if (!lms) return;
  const s = Math.min(w / video.videoWidth, h / video.videoHeight);
  const ox = (w - video.videoWidth * s) / 2, oy = (h - video.videoHeight * s) / 2;
  const P = (l) => [ox + l.x * video.videoWidth * s, oy + l.y * video.videoHeight * s];
  ctx.lineCap = 'round';
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    if (start < 11 && end < 11) continue;
    const a = P(lms[start]), b = P(lms[end]);
    const side = LEFT.has(start) && LEFT.has(end) ? '#fdd663' : !LEFT.has(start) && !LEFT.has(end) ? '#8ab4f8' : '#e3e3e3';
    ctx.globalAlpha = Math.max(0.25, Math.min(lms[start].visibility ?? 1, lms[end].visibility ?? 1));
    ctx.strokeStyle = side; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 11; i < 33; i++) {
    const [x, y] = P(lms[i]);
    ctx.fillStyle = LEFT.has(i) ? '#fdd663' : '#8ab4f8';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  }
  const nose = P(lms[0]);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(nose[0], nose[1], 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = '600 22px Segoe UI, sans-serif';
  ctx.fillStyle = ok ? '#81c995' : '#fdd663';
  ctx.fillText(ok ? 'full body' : 'body partly out of view', 14, 30);
}

// ---------------------------------------------------------------------------
// Signal processing
// ---------------------------------------------------------------------------
/** One Euro filter (adaptive low-pass: smooth when still, responsive when fast), run both ways for zero lag. */
function oneEuro(series, fps, minCutoff, beta, dCutoff = 1.0) {
  const alpha = (cut) => { const te = 1 / fps, tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / te); };
  const pass = (arr) => {
    const out = new Array(arr.length);
    let xPrev = arr[0], dxPrev = 0;
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      const dx = i ? (x - xPrev) * fps : 0;
      const aD = alpha(dCutoff);
      const dxHat = aD * dx + (1 - aD) * dxPrev;
      const a = alpha(minCutoff + beta * Math.abs(dxHat));
      const xHat = i ? a * x + (1 - a) * xPrev : x;
      out[i] = xHat; xPrev = xHat; dxPrev = dxHat;
    }
    return out;
  };
  const f = pass(series), b = pass([...series].reverse()).reverse();
  return f.map((v, i) => (v + b[i]) / 2);
}

function percentile(arr, q) {
  const s = arr.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/**
 * raw[i] = null | { world: 99 numbers (figure space), vis: 33, img: 66 (x,y normalised) }
 * Returns { frames, lift, trimStart, trimEnd, tracked } or null.
 */
function processTrack(raw, fps, vw, vh) {
  const n = raw.length;
  const full = raw.map((r) => !!r && BODY.every((i) => r.vis[i] > 0.5) && FEET.slice(0, 2).every((i) => r.img[i * 2 + 1] < 1.02));
  // auto-trim: start/end where the whole body is in frame for at least ~0.2 s
  const run = Math.max(3, Math.round(fps * 0.2));
  let a = 0, b = n - 1;
  while (a < n - run && !full.slice(a, a + run).every(Boolean)) a++;
  while (b > a + run && !full.slice(b - run + 1, b + 1).every(Boolean)) b--;
  if (b - a < fps * 0.5) { a = 0; b = n - 1; }       // nothing usable to trim to — keep everything
  const seg = raw.slice(a, b + 1);
  const m = seg.length;
  if (!seg.some(Boolean)) return null;

  // per-landmark gap filling: occluded/low-confidence points are interpolated from good neighbours
  const frames = Array.from({ length: m }, () => new Array(99));
  for (let j = 0; j < 33; j++) {
    const good = [];
    for (let i = 0; i < m; i++) if (seg[i] && seg[i].vis[j] > 0.35) good.push(i);
    if (!good.length) for (let i = 0; i < m; i++) if (seg[i]) good.push(i); // never confident: use what we have
    let g = 0;
    for (let i = 0; i < m; i++) {
      while (g < good.length - 1 && good[g + 1] <= i) g++;
      const i0 = good[g], i1 = good[Math.min(good.length - 1, g + (good[g] < i ? 1 : 0))];
      const k = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
      for (let c = 0; c < 3; c++) {
        const v0 = seg[i0].world[j * 3 + c], v1 = seg[i1].world[j * 3 + c];
        frames[i][j * 3 + c] = i < good[0] ? seg[good[0]].world[j * 3 + c] : v0 + (v1 - v0) * Math.max(0, Math.min(1, k));
      }
    }
  }
  // smoothing: hands/feet move fastest, so they get the most responsive settings
  const fast = new Set([15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32]);
  for (let j = 0; j < 33; j++) {
    for (let c = 0; c < 3; c++) {
      const series = frames.map((f) => f[j * 3 + c]);
      const sm = oneEuro(series, fps, fast.has(j) ? 2.2 : 1.4, fast.has(j) ? 1.2 : 0.7);
      for (let i = 0; i < m; i++) frames[i][j * 3 + c] = Math.round(sm[i] * 1000) / 1000;
    }
  }

  // jumps: how far the lowest foot rises above the floor line in the picture, in metres
  const footY = seg.map((r) => (r ? Math.max(...FEET.map((i) => r.img[i * 2 + 1])) * vh : NaN));
  const mpp = seg.map((r, i) => {
    if (!r) return NaN;
    const px = (k) => [r.img[k * 2] * vw, r.img[k * 2 + 1] * vh];
    const sh = [(px(11)[0] + px(12)[0]) / 2, (px(11)[1] + px(12)[1]) / 2], hp = [(px(23)[0] + px(24)[0]) / 2, (px(23)[1] + px(24)[1]) / 2];
    const torsoPx = Math.hypot(sh[0] - hp[0], sh[1] - hp[1]);
    const f = frames[i];
    const torsoM = Math.hypot((f[33] + f[36]) / 2 - (f[69] + f[72]) / 2, (f[34] + f[37]) / 2 - (f[70] + f[73]) / 2, (f[35] + f[38]) / 2 - (f[71] + f[74]) / 2);
    return torsoPx > 5 ? torsoM / torsoPx : NaN;
  });
  const win = Math.round(fps * 0.75);   // short window: real jumps are quick, travelling up/downstage is slow
  let lift = seg.map((_, i) => {
    const lo = Math.max(0, i - win), hi = Math.min(m, i + win + 1);
    // a real jump leaves the floor that is there both before and after it; walking towards or away from the
    // camera only moves the feet one way, so use the higher (smaller y) of the two floor estimates
    const before = percentile(footY.slice(lo, i + 1), 0.85), after = percentile(footY.slice(i, hi), 0.85);
    const ground = Math.min(Number.isFinite(before) ? before : after, Number.isFinite(after) ? after : before);
    const scale = percentile(mpp.slice(lo, hi), 0.5);
    const up = (ground - footY[i]) * scale - 0.03;
    return Number.isFinite(up) ? Math.max(0, Math.min(1.0, up)) : 0;
  });
  lift = oneEuro(lift, fps, 2.0, 0.5).map((v) => (v < 0.04 ? 0 : Math.round(v * 1000) / 1000));

  return {
    frames, lift, trimStart: a / fps, trimEnd: (n - 1 - b) / fps,
    tracked: Math.round((seg.filter(Boolean).length / m) * 100),
    fullBody: Math.round((full.slice(a, b + 1).filter(Boolean).length / m) * 100)
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
async function analyzeVideo(file) {
  if (job) return;
  const box = $('#choreoAnalyze');
  const status = (t) => { $('#choreoStatus').textContent = t; };
  const video = $('#choreoVideo');
  const overlay = $('#choreoOverlay');
  const quality = ($('#choreoQuality') && $('#choreoQuality').value) || 'best';
  box.classList.remove('hidden');
  $('#choreoProgress').style.width = '0%';
  job = { cancelled: false };
  const url = URL.createObjectURL(file.blob);
  const t0 = performance.now();
  try {
    video.src = url;
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('This video format could not be opened. Try an MP4 (H.264), MOV or WebM file.')); });
    const duration = Math.min(video.duration || 0, MAX_SECONDS);
    if (!duration) throw new Error('The video has no length.');
    // size the preview to the video's shape (phone videos are portrait)
    const vb = video.parentElement;
    vb.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    vb.style.width = video.videoHeight > video.videoWidth ? `${Math.round(360 * video.videoWidth / video.videoHeight)}px` : '100%';
    const lm = await getLandmarker(status, quality);
    const fps = duration > 180 ? 20 : SAMPLE_FPS;
    const total = Math.floor(duration * fps) + 1;
    // MediaPipe's pose crop assumes square frames, so letterbox each frame onto a square canvas
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(1280, Math.max(vw, vh));
    const sc = side / Math.max(vw, vh);
    const sq = document.createElement('canvas');
    sq.width = side; sq.height = side;
    const sqx = sq.getContext('2d', { willReadFrequently: false });
    const ox = (side - vw * sc) / 2, oy = (side - vh * sc) / 2;
    const unSq = (l) => ({ ...l, x: (l.x * side - ox) / (vw * sc), y: (l.y * side - oy) / (vh * sc) });
    const raw = [];
    let found = 0;
    for (let k = 0; k < total; k++) {
      if (job.cancelled) throw new Error('cancelled');
      const t = Math.min(duration - 0.001, k / fps);
      await seek(video, t);
      sqx.fillStyle = '#000'; sqx.fillRect(0, 0, side, side);
      sqx.drawImage(video, ox, oy, vw * sc, vh * sc);
      const r = lm.detectForVideo(sq, Math.round(t * 1000) + 1);
      const world = r.worldLandmarks && r.worldLandmarks[0];
      const img = r.landmarks && r.landmarks[0] && r.landmarks[0].map(unSq);
      let ok = false;
      if (world && img) {
        found++;
        // MediaPipe world space: x = image right, y = down, z = away from camera is positive.
        // StageFlow figure space: x = dancer's left (they face the camera), y = up, z = towards audience.
        const wv = new Array(99), vis = new Array(33), iv = new Array(66);
        for (let i = 0; i < 33; i++) {
          wv[i * 3] = world[i].x; wv[i * 3 + 1] = -world[i].y; wv[i * 3 + 2] = -world[i].z;
          vis[i] = Math.min(img[i].visibility ?? 1, img[i].presence ?? 1);
          iv[i * 2] = img[i].x; iv[i * 2 + 1] = img[i].y;
        }
        ok = BODY.every((i) => vis[i] > 0.5);
        raw.push({ world: wv, vis, img: iv });
      } else raw.push(null);
      if (k % 2 === 0 || k === total - 1) {
        drawOverlay(overlay, video, img, ok);
        $('#choreoProgress').style.width = `${((k + 1) / total) * 100}%`;
        status(`Tracking the dancer… ${Math.round(((k + 1) / total) * 100)}% · ${k + 1} of ${total} frames`);
      }
    }
    const res = processTrack(raw, fps, video.videoWidth, video.videoHeight);
    if (!res || found < total * 0.2) throw new Error('No dancer could be tracked in this video. Use a clip where one person is fully visible.');
    // thumbnail from the middle of the kept part
    const midT = res.trimStart + (res.frames.length / fps) / 2;
    await seek(video, Math.min(duration - 0.01, midT));
    const th = document.createElement('canvas');
    th.width = 88; th.height = 88;
    const tc = th.getContext('2d');
    const s = Math.max(88 / video.videoWidth, 88 / video.videoHeight);
    tc.drawImage(video, (88 - video.videoWidth * s) / 2, (88 - video.videoHeight * s) / 2, video.videoWidth * s, video.videoHeight * s);
    const clip = {
      id: api.uid(), name: file.name.replace(/\.[^.]+$/, ''), fps, version: 2,
      duration: (res.frames.length - 1) / fps, frames: res.frames, lift: res.lift, thumb: th.toDataURL('image/jpeg', 0.7),
      tracked: res.tracked, fullBody: res.fullBody, trimStart: res.trimStart, trimEnd: res.trimEnd, quality, created: Date.now()
    };
    api.state.clips.push(clip);
    api.markDirty();
    const jumps = res.lift.filter((v, i) => v > 0.08 && !(res.lift[i - 1] > 0.08)).length;
    const trimTxt = res.trimStart > 0.05 || res.trimEnd > 0.05 ? ` Trimmed ${api.fmtNum(res.trimStart, 1)}s at the start and ${api.fmtNum(res.trimEnd, 1)}s at the end where the body was out of frame.` : '';
    status(`Done in ${Math.round((performance.now() - t0) / 1000)}s — “${clip.name}”: ${api.fmtNum(clip.duration, 1)}s, full body visible in ${res.fullBody}% of frames${jumps ? `, ${jumps} jump${jumps > 1 ? 's' : ''} found` : ''}.${trimTxt} Select dancers and press + to place it.`);
    render();
    return clip;
  } catch (e) {
    status(e.message === 'cancelled' ? 'Cancelled.' : `Could not analyze: ${e.message || e}`);
    if (e.message !== 'cancelled') console.error(e);
    return null;
  } finally {
    job = null;
    URL.revokeObjectURL(url);
    $('#btnChoreoCancel').textContent = 'Close';
  }
}

async function pickVideo() {
  if (native) {
    const res = await native.openVideo();
    if (!res) return null;
    return { name: res.name, blob: new Blob([res.data]) };
  }
  return new Promise((resolve) => {
    const input = $('#fileVideo');
    input.value = '';
    input.onchange = () => { const f = input.files[0]; resolve(f ? { name: f.name, blob: f } : null); };
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Clips & placements
// ---------------------------------------------------------------------------
function placeClip(clip) {
  const ids = [...api.state.selected];
  if (!ids.length) { alert('Select the dancers who should do this move first (click, Shift-click or drag a box on the stage).'); return; }
  const a = { id: api.uid(), clipId: clip.id, dancerIds: ids, start: Math.round(api.state.time * 100) / 100, duration: clip.duration, offset: 0, mirror: $('#choreoMirror').checked };
  api.mutate(() => { api.project.choreo.push(a); });
  api.state.selectedChoreo = a.id;
  render();
  if (api.state.viewMode === '2d') api.setViewMode('split');
}

function deleteClip(clip) {
  const uses = api.project.choreo.filter((c) => c.clipId === clip.id).length;
  if (!confirm(`Delete the move clip “${clip.name}”${uses ? ` and its ${uses} placement${uses > 1 ? 's' : ''} on the timeline` : ''}?`)) return;
  api.state.clips = api.state.clips.filter((c) => c !== clip);
  api.mutate(() => { api.project.choreo = api.project.choreo.filter((c) => c.clipId !== clip.id); });
  render();
}

function render() {
  const S = api.state;
  const list = $('#clipList');
  list.innerHTML = '';
  if (!S.clips.length) list.innerHTML = '<div class="empty-small">No move clips yet. Analyze a video to create one.</div>';
  for (const clip of S.clips) {
    const row = document.createElement('div');
    row.className = 'clip-item';
    row.innerHTML = `<img class="thumb" alt=""><div class="meta"><b></b><span class="muted small"></span></div><div class="actions"></div>`;
    row.querySelector('img').src = clip.thumb || '';
    row.querySelector('b').textContent = clip.name;
    row.querySelector('.meta span').textContent = `${api.fmtNum(clip.duration, 1)}s · ${clip.frames.length} frames`;
    const acts = row.querySelector('.actions');
    acts.append(
      api.btn(`${api.ICONS.plus}`, () => placeClip(clip), { html: true, cls: 'icon-btn sm', title: 'Place on the selected dancers at the playhead' }),
      api.btn(`${api.ICONS.edit}`, async () => { const n = await api.askText('Rename move clip', clip.name); if (n) { clip.name = n; api.markDirty(); render(); api.renderChoreoTrack(); } }, { html: true, cls: 'icon-btn sm', title: 'Rename' }),
      api.btn(`${api.ICONS.trash}`, () => deleteClip(clip), { html: true, cls: 'icon-btn sm', title: 'Delete clip' })
    );
    list.appendChild(row);
  }

  const al = $('#choreoAssignments');
  al.innerHTML = '';
  const items = [...api.project.choreo].sort((a, b) => a.start - b.start);
  if (!items.length) al.innerHTML = '<div class="empty-small">Nothing placed yet. Select dancers, move the playhead to where the move starts, then press + on a clip.</div>';
  for (const a of items) {
    const clip = api.clipById(a.clipId);
    const names = a.dancerIds.map((id) => (api.project.dancers.find((d) => d.id === id) || {}).name).filter(Boolean);
    const row = document.createElement('div');
    row.className = 'assign-item' + (S.selectedChoreo === a.id ? ' sel' : '');
    row.innerHTML = '<div class="meta"><b></b><div class="muted"></div></div>';
    row.querySelector('b').textContent = clip ? clip.name : 'Missing clip';
    row.querySelector('.muted').textContent = `${api.fmtTime(a.start)} – ${api.fmtTime(a.start + a.duration)} · ${names.join(', ') || 'nobody'}`;
    const mirror = document.createElement('label');
    mirror.className = 'switch small'; mirror.title = 'Mirror (swap left and right)';
    mirror.innerHTML = '<input type="checkbox"><i></i>';
    mirror.querySelector('input').checked = a.mirror;
    mirror.querySelector('input').addEventListener('change', (e) => api.mutate(() => { a.mirror = e.target.checked; }));
    mirror.addEventListener('click', (e) => e.stopPropagation());
    const del = api.btn(api.ICONS.trash, (e) => { e.stopPropagation(); api.removeChoreo(a.id); }, { html: true, cls: 'icon-btn sm', title: 'Remove from timeline' });
    row.append(mirror, del);
    row.addEventListener('click', () => {
      S.selectedChoreo = a.id;
      S.selected = new Set(a.dancerIds);
      api.setTime(a.start);
      api.renderAll();
      render();
    });
    al.appendChild(row);
  }
}

$('#btnLoadVideo').addEventListener('click', async () => {
  const file = await pickVideo();
  if (file) { $('#btnChoreoCancel').textContent = 'Cancel'; analyzeVideo(file); }
});
$('#btnChoreoCancel').addEventListener('click', () => {
  if (job) job.cancelled = true;
  else $('#choreoAnalyze').classList.add('hidden');
});

window.StageChoreo = { render, analyzeVideo, placeClip, getLandmarker };
render();
