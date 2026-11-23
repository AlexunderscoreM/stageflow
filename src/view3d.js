/* StageFlow — 3D audience view (three.js). Reads project/time from window.__stageflow. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

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
// Human figure (jointed so it can be posed / driven by motion data later)
// ---------------------------------------------------------------------------
const SKIN_TONES = [0xe8c1a0, 0xd5a27f, 0xb07a55, 0x8d5a3b, 0x6b4430, 0xf0cdb3];
const HAIR = [0x2b1d14, 0x1a1210, 0x4a2f1f, 0x0f0d0c, 0x6b4a2b, 0x1d1a17];
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
function hashIdx(id, n) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; }

function limb(radius, length, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
  m.position.y = -(length / 2 + radius * 0.6);
  m.castShadow = true;
  return m;
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
  sp.position.y = 2.05;
  return sp;
}

function makeDancer(d) {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[hashIdx(d.id, SKIN_TONES.length)], roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x24262d, roughness: 0.8 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: HAIR[hashIdx(d.id + 'h', HAIR.length)], roughness: 0.9 });

  const root = new THREE.Group();          // world position + facing
  const body = new THREE.Group();          // scaled to stage units (built in meters)
  root.add(body);
  const J = {};

  J.hips = new THREE.Group(); J.hips.position.y = 0.95; body.add(J.hips);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), pants);
  pelvis.scale.set(1.05, 0.7, 0.75); pelvis.castShadow = true; J.hips.add(pelvis);

  J.spine = new THREE.Group(); J.spine.position.y = 0.05; J.hips.add(J.spine);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.26, 6, 14), shirt);
  torso.position.y = 0.2; torso.scale.set(1.08, 1, 0.68); torso.castShadow = true; J.spine.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), skin);
  neck.position.y = 0.47; J.spine.add(neck);
  J.head = new THREE.Group(); J.head.position.y = 0.6; J.spine.add(J.head);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin);
  head.scale.set(0.92, 1.08, 1); head.castShadow = true; J.head.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.rotation.x = -0.35; hairCap.position.set(0, 0.012, -0.012); hairCap.scale.set(0.95, 1.08, 1.04); J.head.add(hairCap);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), skin);
  nose.position.set(0, -0.005, 0.104); J.head.add(nose);

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = new THREE.Group(); sh.position.set(0.2 * sx, 0.4, 0); J.spine.add(sh);
    sh.add(limb(0.048, 0.2, shirt));
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    el.add(limb(0.04, 0.18, skin));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
    hand.position.y = -0.29; hand.scale.set(0.8, 1.1, 0.6); el.add(hand);
    J['shoulder' + side] = sh; J['elbow' + side] = el;

    const hip = new THREE.Group(); hip.position.set(0.09 * sx, -0.03, 0); J.hips.add(hip);
    hip.add(limb(0.072, 0.3, pants));
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    knee.add(limb(0.058, 0.32, pants));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.07, 0.24), shoe);
    foot.position.set(0, -0.45, 0.05); foot.castShadow = true; knee.add(foot);
    J['hip' + side] = hip; J['knee' + side] = knee;
  }

  // floor marker in the dancer's colour and shape
  const markerMat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.45, depthWrite: false });
  const marker = new THREE.Mesh(markerGeometry(d.shape), markerMat);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.006;
  marker.scale.setScalar(0.42);
  body.add(marker);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.008; ring.visible = false;
  body.add(ring);

  const label = makeLabel(d.name);
  body.add(label);

  body.scale.setScalar(U);
  dancerGroup.add(root);
  return { root, body, J, shirt, marker, markerMat, ring, label, color: d.color, shape: d.shape, name: d.name, yaw: 0, phase: 0, U };
}

function disposeDancer(rec) {
  dancerGroup.remove(rec.root);
  rec.root.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
}

// ---------------------------------------------------------------------------
// Sync + animation
// ---------------------------------------------------------------------------
const recs = new Map();
let lastTime = null;
let lastFrame = performance.now();

function syncDancers() {
  const live = new Set();
  for (const d of api.project.dancers) {
    live.add(d.id);
    let rec = recs.get(d.id);
    if (rec && rec.U !== U) { disposeDancer(rec); recs.delete(d.id); rec = null; }
    if (!rec) { rec = makeDancer(d); recs.set(d.id, rec); }
    if (rec.color !== d.color) { rec.shirt.color.set(d.color); rec.markerMat.color.set(d.color); rec.color = d.color; }
    if (rec.shape !== d.shape) { rec.marker.geometry.dispose(); rec.marker.geometry = markerGeometry(d.shape); rec.shape = d.shape; }
    if (rec.name !== d.name) {
      rec.body.remove(rec.label); rec.label.material.map.dispose(); rec.label.material.dispose();
      rec.label = makeLabel(d.name); rec.body.add(rec.label); rec.name = d.name;
    }
  }
  for (const [id, rec] of recs) if (!live.has(id)) { disposeDancer(rec); recs.delete(id); }
}

function angleTo(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

function animate(dtReal) {
  const t = api.state.time;
  const dtTimeline = lastTime == null ? 0 : Math.min(0.25, Math.abs(t - lastTime));
  lastTime = t;
  const h = 0.04;
  for (const d of api.project.dancers) {
    const rec = recs.get(d.id);
    const p = api.dancerPos(d.id, t);
    const pa = api.dancerPos(d.id, Math.max(0, t - h)), pb = api.dancerPos(d.id, t + h);
    const vx = (pb.x - pa.x) / (2 * h), vz = (pb.y - pa.y) / (2 * h);
    const speed = Math.hypot(vx, vz) / U; // m/s
    rec.root.position.set(p.x, 0, p.y);

    // face where you're going; otherwise face the audience
    const performing = activeChoreo(d.id, t);
    const targetYaw = speed > 0.15 && !performing ? Math.atan2(vx, vz) : 0;
    rec.yaw += angleTo(rec.yaw, targetYaw) * Math.min(1, dtReal * 9);
    rec.body.rotation.y = rec.yaw;

    // walk cycle (stride ~1.3 m per full cycle)
    rec.phase += (speed * dtTimeline / 1.3) * Math.PI * 2;
    const amp = Math.min(1, speed / 1.3);
    const s = Math.sin(rec.phase);
    const J = rec.J;
    J.hipL.rotation.x = s * 0.55 * amp;
    J.hipR.rotation.x = -s * 0.55 * amp;
    J.kneeL.rotation.x = Math.max(0, -Math.sin(rec.phase - 0.6)) * 0.9 * amp;
    J.kneeR.rotation.x = Math.max(0, Math.sin(rec.phase - 0.6)) * 0.9 * amp;
    J.shoulderL.rotation.x = -s * 0.5 * amp;
    J.shoulderR.rotation.x = s * 0.5 * amp;
    J.shoulderL.rotation.z = 0.08; J.shoulderR.rotation.z = -0.08;
    J.elbowL.rotation.x = -0.12 - 0.35 * amp; J.elbowR.rotation.x = -0.12 - 0.35 * amp;
    J.hips.position.y = 0.95 + Math.abs(Math.cos(rec.phase)) * 0.025 * amp;
    J.spine.rotation.y = s * 0.08 * amp;
    J.hips.rotation.set(0, 0, 0); J.head.rotation.set(0, 0, 0);
    J.shoulderL.rotation.y = 0; J.shoulderR.rotation.y = 0; J.elbowL.rotation.set(J.elbowL.rotation.x, 0, 0); J.elbowR.rotation.set(J.elbowR.rotation.x, 0, 0);
    J.hipL.rotation.set(J.hipL.rotation.x, 0, 0); J.hipR.rotation.set(J.hipR.rotation.x, 0, 0);
    if (performing) applyChoreo(rec, performing, t);

    const sel = api.state.selected.has(d.id);
    rec.ring.visible = sel;
    rec.markerMat.opacity = sel ? 0.75 : 0.45;
    rec.label.visible = api.state.showNames;
  }
}

// ---------------------------------------------------------------------------
// Choreo: drive the skeleton from a pose clip (33 MediaPipe landmarks per frame)
// ---------------------------------------------------------------------------
const LM = { nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24, knL: 25, knR: 26, anL: 27, anR: 28 };
const MIRROR = (() => { const m = Array.from({ length: 33 }, (_, i) => i); const pairs = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]; for (const [a, b] of pairs) { m[a] = b; m[b] = a; } return m; })();
const DOWN = new THREE.Vector3(0, -1, 0);
const pts = Array.from({ length: 33 }, () => new THREE.Vector3());
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

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
  return pts;
}

function basisQuat(xAxis, upAxis, out) {
  const x = _a.copy(xAxis).normalize();
  const z = _b.crossVectors(x, upAxis).normalize();
  const y = _c.crossVectors(z, x).normalize();
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}
/** Point a limb joint (rest pose hangs along -Y) from landmark a to b; returns the joint's world rotation. */
function aim(joint, parentW, a, b, w) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize().applyQuaternion(parentW.clone().invert());
  const q = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
  joint.quaternion.slerp(q, w);
  return parentW.clone().multiply(joint.quaternion);
}

function applyChoreo(rec, active, t) {
  const { a } = active;
  const p = framePoints(active, t);
  const J = rec.J;
  // ease in / out over 0.25 s so clips blend with walking
  const w = Math.max(0, Math.min(1, (t - a.start) / 0.25, (a.start + a.duration - t) / 0.25));
  const hipMid = new THREE.Vector3().addVectors(p[LM.hipL], p[LM.hipR]).multiplyScalar(0.5);
  const shMid = new THREE.Vector3().addVectors(p[LM.shL], p[LM.shR]).multiplyScalar(0.5);
  const up = new THREE.Vector3().subVectors(shMid, hipMid);

  const hipsW = basisQuat(new THREE.Vector3().subVectors(p[LM.hipL], p[LM.hipR]), up, new THREE.Quaternion());
  J.hips.quaternion.slerp(hipsW, w);
  const hipsQ = J.hips.quaternion.clone();
  const spineW = basisQuat(new THREE.Vector3().subVectors(p[LM.shL], p[LM.shR]), up, new THREE.Quaternion());
  J.spine.quaternion.slerp(hipsQ.clone().invert().multiply(spineW), w);
  const spineQ = hipsQ.clone().multiply(J.spine.quaternion);
  const earMid = new THREE.Vector3().addVectors(p[LM.earL], p[LM.earR]).multiplyScalar(0.5);
  const headW = basisQuat(new THREE.Vector3().subVectors(p[LM.earL], p[LM.earR]), new THREE.Vector3().subVectors(earMid, shMid), new THREE.Quaternion());
  J.head.quaternion.slerp(spineQ.clone().invert().multiply(headW), w * 0.8);

  const upL = aim(J.shoulderL, spineQ, p[LM.shL], p[LM.elL], w); aim(J.elbowL, upL, p[LM.elL], p[LM.wrL], w);
  const upR = aim(J.shoulderR, spineQ, p[LM.shR], p[LM.elR], w); aim(J.elbowR, upR, p[LM.elR], p[LM.wrR], w);
  const thL = aim(J.hipL, hipsQ, p[LM.hipL], p[LM.knL], w); aim(J.kneeL, thL, p[LM.knL], p[LM.anL], w);
  const thR = aim(J.hipR, hipsQ, p[LM.hipR], p[LM.knR], w); aim(J.kneeR, thR, p[LM.knR], p[LM.anR], w);

  // hip height from how far the lowest foot is below the hips (crouches, lunges)
  let low = Infinity;
  for (const i of [27, 28, 29, 30, 31, 32]) low = Math.min(low, p[i].y);
  const leg = (p[LM.hipL].distanceTo(p[LM.knL]) + p[LM.knL].distanceTo(p[LM.anL]) + p[LM.hipR].distanceTo(p[LM.knR]) + p[LM.knR].distanceTo(p[LM.anR])) / 2;
  const hipY = Math.max(0.3, Math.min(1.25, ((hipMid.y - low) * (0.92 / Math.max(0.3, leg))) + 0.04));
  J.hips.position.y += (hipY - J.hips.position.y) * w;
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
