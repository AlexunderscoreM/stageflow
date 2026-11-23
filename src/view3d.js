/* StageFlow — 3D audience view (three.js). Reads project/time from window.__stageflow. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import * as SkeletonUtils from './vendor/SkeletonUtils.js';

const api = window.__stageflow;
const host = document.getElementById('view3dCanvas');

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16171a);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.03; // never go under the floor
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xe6eeff, 0x26221e, 0.85));
const key = new THREE.DirectionalLight(0xfff3e0, 2.0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x9ec1ff, 0.7);
scene.add(rim);

const world = new THREE.Group();
scene.add(world);
const dancerGroup = new THREE.Group();
scene.add(dancerGroup);

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------
let stageKey = '';
let U = 3.28084; // world units per meter (stage is in feet or meters)

function lineSegs(points, color, opacity) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function buildStage() {
  const S = api.project.stage;
  U = S.unit === 'm' ? 1 : 3.28084;
  for (const c of [...world.children]) { world.remove(c); c.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
  const W = S.width, D = S.depth;
  const thick = 0.9 * U;

  // audience-side floor
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 8, D * 8), new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -thick;
  ground.receiveShadow = true;
  world.add(ground);

  // stage deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D),
    [0, 0, 1, 0, 0, 0].map((top) => new THREE.MeshStandardMaterial({ color: top ? 0x2b2c31 : 0x1c1d21, roughness: top ? 0.55 : 0.9 })));
  deck.position.y = -thick / 2;
  deck.receiveShadow = true;
  world.add(deck);

  // grid lines
  const y = 0.004 * U;
  const major = [], minor = [];
  for (let i = 1; i < S.columns * S.subdivisions; i++) {
    const x = -W / 2 + (i * W) / (S.columns * S.subdivisions);
    if (x === 0) continue;
    (i % S.subdivisions === 0 ? major : minor).push(new THREE.Vector3(x, y, -D / 2), new THREE.Vector3(x, y, D / 2));
  }
  for (let i = 1; i < S.rows * S.subdivisions; i++) {
    const z = -D / 2 + (i * D) / (S.rows * S.subdivisions);
    if (z === 0) continue;
    (i % S.subdivisions === 0 ? major : minor).push(new THREE.Vector3(-W / 2, y, z), new THREE.Vector3(W / 2, y, z));
  }
  if (minor.length) world.add(lineSegs(minor, 0xffffff, 0.06));
  if (major.length) world.add(lineSegs(major, 0xffffff, 0.2));
  world.add(lineSegs([new THREE.Vector3(0, y, -D / 2), new THREE.Vector3(0, y, D / 2), new THREE.Vector3(-W / 2, y, 0), new THREE.Vector3(W / 2, y, 0)], 0xa8c7fa, 0.6));
  // downstage edge (lip) highlight
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03 * U, 0.05 * U), new THREE.MeshBasicMaterial({ color: 0xa8c7fa }));
  lip.position.set(0, 0.0, D / 2);
  world.add(lip);

  // back curtain with soft folds
  const curtH = Math.max(4.5 * U, D * 0.55);
  const curtGeo = new THREE.PlaneGeometry(W * 1.15, curtH, 120, 1);
  const pos = curtGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / (0.35 * U)) * 0.12 * U);
  curtGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curtGeo, new THREE.MeshStandardMaterial({ color: 0x23202e, roughness: 0.95, side: THREE.DoubleSide }));
  curtain.position.set(0, curtH / 2, -D / 2 - 0.4 * U);
  curtain.receiveShadow = true;
  world.add(curtain);

  // wings (side masking)
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.35, curtH), new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 1, side: THREE.DoubleSide }));
    leg.rotation.y = Math.PI / 2;
    leg.position.set(sx * (W / 2 + 0.8 * U), curtH / 2, -D * 0.15);
    world.add(leg);
  }

  // lights sized to stage
  key.position.set(W * 0.25, Math.max(W, D) * 1.1, D * 1.3);
  key.target.position.set(0, 0, 0);
  const sc = key.shadow.camera;
  const r = Math.max(W, D) * 0.75;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = Math.max(W, D) * 4;
  sc.updateProjectionMatrix();
  rim.position.set(-W * 0.4, D * 0.8, -D * 1.2);
}

// ---------------------------------------------------------------------------
// Human figures: rigged mannequin (Mixamo skeleton) tinted in each dancer's colour.
// Idle / walk come from the model's own animations; choreo clips drive the bones directly.
// ---------------------------------------------------------------------------
const SHAPE_PTS = {
  square: [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]],
  triangle: [[0, -0.98], [0.95, 0.72], [-0.95, 0.72]],
  diamond: [[0, -1], [0.92, 0], [0, 1], [-0.92, 0]],
  hexagon: Array.from({ length: 6 }, (_, i) => [Math.cos(-Math.PI / 2 + i * Math.PI / 3) * 0.95, Math.sin(-Math.PI / 2 + i * Math.PI / 3) * 0.95]),
  star: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.48 : 1.02; return [Math.cos(a) * r, Math.sin(a) * r]; })
};
function markerGeometry(shape) {
  if (!SHAPE_PTS[shape]) return new THREE.CircleGeometry(0.9, 40);
  const s = new THREE.Shape();
  SHAPE_PTS[shape].forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)));
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.font = '600 52px Segoe UI, system-ui, sans-serif';
  const w = Math.min(500, ctx.measureText(text).width + 48);
  ctx.fillStyle = 'rgba(32,33,36,0.85)';
  ctx.beginPath(); ctx.roundRect((512 - w) / 2, 16, w, 80, 40); ctx.fill();
  ctx.fillStyle = '#e3e3e3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  sp.scale.set(1.15, 0.25, 1);
  sp.position.y = 2.1;
  return sp;
}

// ---- the model ----
const MODEL_HEIGHT = 1.72; // metres
let model = null;          // { scene, clips: {idle, walk}, height }
new GLTFLoader().loadAsync(new URL('./models/Xbot.glb', location.href).href).then((g) => {
  const clips = {};
  for (const a of g.animations) clips[a.name] = a;
  // keep the walk in place: drop the hips' forward travel, keep the bob
  for (const name of ['walk', 'run']) {
    const clip = clips[name];
    if (!clip) continue;
    for (const tr of clip.tracks) {
      if (!/Hips\.position$/.test(tr.name)) continue;
      const v = tr.values;
      for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
    }
  }
  const box = new THREE.Box3().setFromObject(g.scene);
  model = { scene: g.scene, clips, height: box.max.y - box.min.y };
}).catch((e) => console.error('Could not load the dancer model', e));

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftEye', 'RightEye',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

function makeDancer(d) {
  const root = new THREE.Group();     // stage position
  const body = new THREE.Group();     // facing + stage units
  const lift = new THREE.Group();     // vertical offset (crouch / jump) for choreo
  root.add(body); body.add(lift);
  const fig = SkeletonUtils.clone(model.scene);
  fig.scale.setScalar(MODEL_HEIGHT / model.height);
  lift.add(fig);
  const mats = [];
  fig.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
    const joints = /Joints/i.test(o.name);
    o.material = new THREE.MeshStandardMaterial({ color: joints ? 0x2a2b30 : d.color, roughness: joints ? 0.45 : 0.55, metalness: joints ? 0.3 : 0.05 });
    if (!joints) mats.push(o.material);
  });
  const B = {};
  fig.traverse((o) => { if (o.isBone) { const n = o.name.replace(/^mixamorig:?/, ''); if (BONES.includes(n)) B[n] = o; } });
  const mixer = new THREE.AnimationMixer(fig);
  const idle = mixer.clipAction(model.clips.idle); idle.play();
  const walk = mixer.clipAction(model.clips.walk); walk.play(); walk.setEffectiveWeight(0);
  idle.time = Math.random() * model.clips.idle.duration; // don't breathe in unison

  const markerMat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.45, depthWrite: false });
  const marker = new THREE.Mesh(markerGeometry(d.shape), markerMat);
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.006; marker.scale.setScalar(0.42);
  body.add(marker);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.008; ring.visible = false;
  body.add(ring);
  const label = makeLabel(d.name);
  body.add(label);
  body.scale.setScalar(U);
  dancerGroup.add(root);
  return { root, body, lift, fig, B, mats, mixer, idle, walk, markerMat, marker, ring, label, color: d.color, shape: d.shape, name: d.name, yaw: 0, U };
}

function disposeDancer(rec) {
  dancerGroup.remove(rec.root);
  rec.mixer.stopAllAction();
  rec.root.traverse((o) => { if (o.material) { o.material.map?.dispose(); o.material.dispose(); } if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); });
}

// ---------------------------------------------------------------------------
// Sync + animation
// ---------------------------------------------------------------------------
const recs = new Map();
let lastTime = null;
let lastFrame = performance.now();

function syncDancers() {
  if (!model) return false;
  const live = new Set();
  for (const d of api.project.dancers) {
    live.add(d.id);
    let rec = recs.get(d.id);
    if (rec && rec.U !== U) { disposeDancer(rec); recs.delete(d.id); rec = null; }
    if (!rec) { rec = makeDancer(d); recs.set(d.id, rec); }
    if (rec.color !== d.color) { for (const m of rec.mats) m.color.set(d.color); rec.markerMat.color.set(d.color); rec.color = d.color; }
    if (rec.shape !== d.shape) { rec.marker.geometry.dispose(); rec.marker.geometry = markerGeometry(d.shape); rec.shape = d.shape; }
    if (rec.name !== d.name) {
      rec.body.remove(rec.label); rec.label.material.map.dispose(); rec.label.material.dispose();
      rec.label = makeLabel(d.name); rec.body.add(rec.label); rec.name = d.name;
    }
  }
  for (const [id, rec] of recs) if (!live.has(id)) { disposeDancer(rec); recs.delete(id); }
  return true;
}

function angleTo(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function animate(dtReal) {
  if (!model) return;
  const t = api.state.time;
  const dtTimeline = lastTime == null ? 0 : Math.min(0.25, Math.abs(t - lastTime));
  lastTime = t;
  const h = 0.04;
  for (const d of api.project.dancers) {
    const rec = recs.get(d.id);
    if (!rec) continue;
    const p = api.dancerPos(d.id, t);
    const pa = api.dancerPos(d.id, Math.max(0, t - h)), pb = api.dancerPos(d.id, t + h);
    const vx = (pb.x - pa.x) / (2 * h), vz = (pb.y - pa.y) / (2 * h);
    const speed = Math.hypot(vx, vz) / U; // m/s
    rec.root.position.set(p.x, 0, p.y);

    const performing = activeChoreo(d.id, t);
    const targetYaw = speed > 0.15 && !performing ? Math.atan2(vx, vz) : 0;
    rec.yaw += angleTo(rec.yaw, targetYaw) * Math.min(1, dtReal * 9);
    rec.body.rotation.y = rec.yaw;

    // idle ↔ walk, walk speed follows travel speed (model's walk ≈ 1.4 m/s)
    const wWalk = Math.min(1, speed / 0.6);
    rec.walk.setEffectiveWeight(wWalk);
    rec.idle.setEffectiveWeight(1 - wWalk);
    rec.walk.timeScale = Math.max(0.4, speed / 1.4);
    const moving = api.state.playing || dtTimeline > 0;
    rec.mixer.update(wWalk > 0.01 ? (moving ? dtTimeline : 0) : dtReal);
    rec.lift.position.y = 0;

    if (performing) { rec.fig.updateMatrixWorld(true); applyChoreo(rec, performing, t); }

    const sel = api.state.selected.has(d.id);
    rec.ring.visible = sel;
    rec.markerMat.opacity = sel ? 0.75 : 0.45;
    rec.label.visible = api.state.showNames;
  }
}

// ---------------------------------------------------------------------------
// Choreo: drive the skeleton from a pose clip (33 MediaPipe landmarks per frame)
// Landmarks are in "figure space": x = dancer's left, y = up, z = towards the audience, metres, hip-centred.
// ---------------------------------------------------------------------------
const LM = { nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, piL: 17, piR: 18, inL: 19, inR: 20,
  hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28, heL: 29, heR: 30, ftL: 31, ftR: 32 };
const MIRROR = (() => { const m = Array.from({ length: 33 }, (_, i) => i); const pairs = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]; for (const [a, b] of pairs) { m[a] = b; m[b] = a; } return m; })();
const pts = Array.from({ length: 33 }, () => new THREE.Vector3());
const V = () => new THREE.Vector3();

function activeChoreo(id, t) {
  const list = api.project.choreo;
  if (!list || !list.length) return null;
  for (const a of list) {
    if (t >= a.start && t < a.start + a.duration && a.dancerIds.includes(id)) {
      const clip = api.clipById(a.clipId);
      if (clip && clip.frames && clip.frames.length) return { a, clip };
    }
  }
  return null;
}

function framePoints({ a, clip }, t) {
  const ct = Math.max(0, t - a.start + a.offset);
  const fi = Math.min(clip.frames.length - 1, ct * clip.fps);
  const i0 = Math.floor(fi), i1 = Math.min(clip.frames.length - 1, i0 + 1), k = fi - i0;
  const f0 = clip.frames[i0], f1 = clip.frames[i1];
  for (let i = 0; i < 33; i++) {
    const src = a.mirror ? MIRROR[i] : i;
    const x = f0[src * 3] * (1 - k) + f1[src * 3] * k;
    pts[i].set(a.mirror ? -x : x, f0[src * 3 + 1] * (1 - k) + f1[src * 3 + 1] * k, f0[src * 3 + 2] * (1 - k) + f1[src * 3 + 2] * k);
  }
  const lift = clip.lift ? (clip.lift[i0] || 0) * (1 - k) + (clip.lift[i1] || 0) * k : 0;
  return { p: pts, lift };
}

function basis(xAxis, upAxis) {
  const x = xAxis.clone().normalize();
  const z = V().crossVectors(x, upAxis).normalize();
  const y = V().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const wpos = (b) => V().setFromMatrixPosition(b.matrixWorld);
const wquat = (o) => o.getWorldQuaternion(new THREE.Quaternion());

/** Rotate a bone (in world space) by q, blended by w, and refresh its children. */
function rotateWorld(bone, q, w) {
  const qq = new THREE.Quaternion().slerp(q, w);
  const newW = qq.multiply(wquat(bone));
  bone.quaternion.copy(wquat(bone.parent).invert().multiply(newW));
  bone.updateMatrixWorld(true);
}
/** Swing a bone so the direction to its child matches target (world space). */
function aimBone(bone, child, target, w) {
  const cur = wpos(child).sub(wpos(bone)).normalize();
  if (target.lengthSq() < 1e-8) return;
  rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, target.clone().normalize()), w);
}
/** Turn a bone so the frame (xFrom,upFrom) built from the rig matches (xTo,upTo). */
function alignBasis(bone, xFrom, upFrom, xTo, upTo, w) {
  const q = basis(xTo, upTo).multiply(basis(xFrom, upFrom).invert());
  rotateWorld(bone, q, w);
}

function applyChoreo(rec, active, t) {
  const { a } = active;
  const { p: L, lift } = framePoints(active, t);
  const B = rec.B;
  const w = Math.max(0, Math.min(1, (t - a.start) / 0.25, (a.start + a.duration - t) / 0.25));
  const toWorld = wquat(rec.body);              // facing (yaw) of this dancer
  const W = (v) => v.clone().applyQuaternion(toWorld);
  const mid = (i, j) => V().addVectors(L[i], L[j]).multiplyScalar(0.5);
  const hipMid = mid(LM.hipL, LM.hipR), shMid = mid(LM.shL, LM.shR);
  const up = V().subVectors(shMid, hipMid);

  // pelvis, then the spine bends in three steps so the back curves naturally
  alignBasis(B.Hips, wpos(B.LeftUpLeg).sub(wpos(B.RightUpLeg)), wpos(B.Spine2).sub(wpos(B.Hips)),
    W(V().subVectors(L[LM.hipL], L[LM.hipR])), W(up), w);
  const chestTo = [W(V().subVectors(L[LM.shL], L[LM.shR])), W(up)];
  for (const [bone, f] of [[B.Spine, 1 / 3], [B.Spine1, 1 / 2], [B.Spine2, 1]]) {
    alignBasis(bone, wpos(B.LeftArm).sub(wpos(B.RightArm)), wpos(B.Neck).sub(wpos(B.Spine)), chestTo[0], chestTo[1], w * f);
  }
  // head: ears give the tilt, nose gives where they look
  const earMid = mid(LM.earL, LM.earR);
  const headUp = V().subVectors(earMid, shMid);
  const hx = W(V().subVectors(L[LM.earL], L[LM.earR])), hu = W(headUp);
  alignBasis(B.Neck, wpos(B.LeftEye).sub(wpos(B.RightEye)), wpos(B.HeadTop_End).sub(wpos(B.Neck)), hx, hu, w * 0.5);
  alignBasis(B.Head, wpos(B.LeftEye).sub(wpos(B.RightEye)), wpos(B.HeadTop_End).sub(wpos(B.Head)), hx, hu, w);

  // arms and hands
  for (const s of ['Left', 'Right']) {
    const k = s === 'Left' ? 'L' : 'R';
    aimBone(B[s + 'Arm'], B[s + 'ForeArm'], W(V().subVectors(L[LM['el' + k]], L[LM['sh' + k]])), w);
    aimBone(B[s + 'ForeArm'], B[s + 'Hand'], W(V().subVectors(L[LM['wr' + k]], L[LM['el' + k]])), w);
    const handTip = V().addVectors(L[LM['in' + k]], L[LM['pi' + k]]).multiplyScalar(0.5);
    aimBone(B[s + 'Hand'], B[s + 'HandMiddle1'], W(handTip.sub(L[LM['wr' + k]])), w);
  }
  // legs and feet
  for (const s of ['Left', 'Right']) {
    const k = s === 'Left' ? 'L' : 'R';
    aimBone(B[s + 'UpLeg'], B[s + 'Leg'], W(V().subVectors(L[LM['kn' + k]], L[LM['hip' + k]])), w);
    aimBone(B[s + 'Leg'], B[s + 'Foot'], W(V().subVectors(L[LM['an' + k]], L[LM['kn' + k]])), w);
    aimBone(B[s + 'Foot'], B[s + 'ToeBase'], W(V().subVectors(L[LM['ft' + k]], L[LM['an' + k]])), w);
  }

  // height: put the lowest foot on the floor (crouches, lunges), then add any jump
  rec.fig.updateMatrixWorld(true);
  const toLocal = (v) => rec.body.worldToLocal(v.clone()).y; // body-local metres
  let lowest = Infinity;
  for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) lowest = Math.min(lowest, toLocal(wpos(B[n])));
  const soleGap = 0.03;
  rec.lift.position.y = (-(lowest - soleGap) + lift) * w;
}

// ---------------------------------------------------------------------------
// Camera presets
// ---------------------------------------------------------------------------
function presets() {
  const S = api.project.stage;
  const W = S.width, D = S.depth;
  const span = Math.max(W, D * 1.2);
  // distance so the whole stage width fits the current panel shape
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const fitW = (W * 0.56) / Math.tan(hf / 2);
  const fitD = (D * 0.62) / Math.tan(vf / 2);
  const dist = Math.max(fitW, fitD);
  return {
    audience: { pos: [0, Math.max(1.9 * U, dist * 0.2), D / 2 + dist * 0.72], target: [0, 1.0 * U, 0] },
    judges: { pos: [0, dist * 0.5, D / 2 + dist * 0.62], target: [0, 0, -D * 0.05] },
    top: { pos: [0, Math.max(fitW / 0.62 * 0.6, (D * 0.6) / Math.tan(vf / 2)) * 1.05 + 1, 0.01], target: [0, 0, 0] },
    side: { pos: [-(W / 2 + span * 0.75), 2.2 * U, D * 0.1], target: [0, 1.0 * U, 0] }
  };
}
let tween = null;
function goTo(view, animateIt = true) {
  if (!view) return;
  const to = { pos: new THREE.Vector3(...view.pos), target: new THREE.Vector3(...view.target) };
  if (!animateIt) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
  tween = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), dur: 650 };
}
function snapTo(name) {
  if (name === 'saved') return goTo(api.project.settings.view3d || presets().audience);
  goTo(presets()[name]);
}
function saveView() {
  api.project.settings.view3d = { pos: camera.position.toArray(), target: controls.target.toArray() };
  api.markDirty();
  flash('#btnCamSaved');
}
function flash(sel) { const el = document.querySelector(sel); if (!el) return; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 600); }

document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => snapTo(b.dataset.cam)));
document.getElementById('btnCamSave').addEventListener('click', saveView);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

let firstFrame = true;
/** Rebuild the stage if its settings changed. Returns true when a rebuild happened. */
function ensureStage() {
  const k = JSON.stringify(api.project.stage);
  if (k === stageKey) return false;
  stageKey = k; buildStage();
  return true;
}

/** Off-screen renderer used by video export (audience camera at the export size). */
function createRecorder(w, h) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  ensureStage();
  const cam = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000);
  const saved = camera.aspect;
  camera.aspect = w / h;
  const v = presets().audience;
  camera.aspect = saved;
  cam.position.set(...v.pos);
  cam.lookAt(new THREE.Vector3(...v.target));
  return {
    canvas: r.domElement,
    render(dt) { ensureStage(); syncDancers(); animate(Math.min(0.1, dt || 1 / 30)); r.render(scene, cam); },
    dispose() { r.dispose(); }
  };
}
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!host.offsetParent) return; // hidden (2D mode)
  const S = api.project.stage;
  const before = stageKey ? JSON.parse(stageKey) : null;
  if (ensureStage()) {
    const sizeChanged = !before || before.unit !== S.unit || before.width !== S.width || before.depth !== S.depth;
    if (sizeChanged) goTo(presets().audience, false);
  }
  if (firstFrame) { resize(); firstFrame = false; goTo(presets().audience, false); }
  if (tween) {
    const s = Math.min(1, (now - tween.t0) / tween.dur);
    const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, e);
    controls.target.lerpVectors(tween.from.target, tween.to.target, e);
    if (s >= 1) tween = null;
  }
  controls.update();
  syncDancers();
  animate(dtReal);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

api.view3d = { snapTo, saveView, renderer, camera, controls, scene, createRecorder, recs };
