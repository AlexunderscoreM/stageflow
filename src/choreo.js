/* StageFlow — Choreo: pose (skeleton) analysis from video with MediaPipe, turned into move clips. */
import { PoseLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const api = window.__stageflow;
const native = window.stageflowNative || null;
const $ = (s) => document.querySelector(s);
const SAMPLE_FPS = 20;
const MAX_SECONDS = 600;

let landmarker = null;
let job = null;

const abs = (p) => new URL(p, location.href).href;
async function getLandmarker(status) {
  if (landmarker) return landmarker;
  status('Loading the pose model…');
  const fileset = {
    wasmLoaderPath: abs('./vendor/mediapipe/vision_wasm_internal.js'),
    wasmBinaryPath: abs('./vendor/mediapipe/vision_wasm_internal.wasm')
  };
  let lastErr = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: abs('./vendor/mediapipe/pose_landmarker_full.task'), delegate },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5
      });
      return landmarker;
    } catch (e) { lastErr = e; console.warn(`Pose model (${delegate}) failed`, e); }
  }
  throw lastErr || new Error('Could not load the pose model');
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

function drawOverlay(canvas, video, lms) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);
  if (!lms) return;
  // video is letterboxed with object-fit: contain
  const s = Math.min(w / video.videoWidth, h / video.videoHeight);
  const ox = (w - video.videoWidth * s) / 2, oy = (h - video.videoHeight * s) / 2;
  const P = (l) => [ox + l.x * video.videoWidth * s, oy + l.y * video.videoHeight * s];
  ctx.lineWidth = 4; ctx.strokeStyle = '#a8c7fa'; ctx.lineCap = 'round';
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    if (start < 11 && end < 11) continue; // skip the face mesh lines
    const a = P(lms[start]), b = P(lms[end]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  ctx.fillStyle = '#fdd663';
  for (let i = 11; i < 33; i++) { const [x, y] = P(lms[i]); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
}

function smooth(frames) {
  // fill gaps (no person detected) by holding the nearest good frame, then a light 3-frame average
  let last = frames.find(Boolean);
  if (!last) return null;
  const filled = frames.map((f) => (f ? (last = f) : last));
  return filled.map((f, i) => {
    const a = filled[Math.max(0, i - 1)], c = filled[Math.min(filled.length - 1, i + 1)];
    return f.map((v, k) => Math.round(((a[k] + v * 2 + c[k]) / 4) * 1000) / 1000);
  });
}

async function analyzeVideo(file) {
  if (job) return;
  const box = $('#choreoAnalyze');
  const status = (t) => { $('#choreoStatus').textContent = t; };
  const video = $('#choreoVideo');
  const overlay = $('#choreoOverlay');
  box.classList.remove('hidden');
  $('#choreoProgress').style.width = '0%';
  job = { cancelled: false };
  const url = URL.createObjectURL(file.blob);
  try {
    video.src = url;
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('This video format could not be opened. Try an MP4 (H.264) or WebM file.')); });
    const duration = Math.min(video.duration || 0, MAX_SECONDS);
    if (!duration) throw new Error('The video has no length.');
    const lm = await getLandmarker(status);
    const total = Math.floor(duration * SAMPLE_FPS) + 1;
    const raw = [];
    let found = 0;
    for (let k = 0; k < total; k++) {
      if (job.cancelled) throw new Error('cancelled');
      const t = Math.min(duration - 0.001, k / SAMPLE_FPS);
      await seek(video, t);
      const r = lm.detectForVideo(video, Math.round(t * 1000) + 1);
      const world = r.worldLandmarks && r.worldLandmarks[0];
      drawOverlay(overlay, video, r.landmarks && r.landmarks[0]);
      if (world) {
        found++;
        // MediaPipe world space: x right (image), y down, z towards camera is negative.
        // StageFlow figure space: x = dancer's left when facing the audience, y up, z towards audience.
        const arr = new Array(99);
        for (let i = 0; i < 33; i++) { arr[i * 3] = world[i].x; arr[i * 3 + 1] = -world[i].y; arr[i * 3 + 2] = -world[i].z; }
        raw.push(arr);
      } else raw.push(null);
      $('#choreoProgress').style.width = `${((k + 1) / total) * 100}%`;
      status(`Tracking the dancer… ${Math.round(((k + 1) / total) * 100)}% · person found in ${found} of ${k + 1} frames`);
    }
    const frames = smooth(raw);
    if (!frames || found < total * 0.2) throw new Error('No dancer could be tracked in this video. Use a clip where one person is fully visible.');
    // thumbnail from the middle of the clip
    await seek(video, duration / 2);
    const th = document.createElement('canvas');
    th.width = 88; th.height = 88;
    const tc = th.getContext('2d');
    const s = Math.max(88 / video.videoWidth, 88 / video.videoHeight);
    tc.drawImage(video, (88 - video.videoWidth * s) / 2, (88 - video.videoHeight * s) / 2, video.videoWidth * s, video.videoHeight * s);
    const clip = {
      id: api.uid(), name: file.name.replace(/\.[^.]+$/, ''), fps: SAMPLE_FPS,
      duration: (frames.length - 1) / SAMPLE_FPS, frames, thumb: th.toDataURL('image/jpeg', 0.7),
      tracked: Math.round((found / total) * 100), created: Date.now()
    };
    api.state.clips.push(clip);
    api.markDirty();
    status(`Done — “${clip.name}” (${api.fmtNum(clip.duration, 1)}s, dancer tracked in ${clip.tracked}% of frames). Select dancers and press “Place on selected”.`);
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
