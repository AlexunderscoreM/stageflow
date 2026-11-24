/* StageFlow share links: a segment (dancers, stage, formations, paths — no audio) packed into the URL.
   Used by the editor (to make the link) and by the phone viewer (to read it). Works as a classic script. */
(function (root) {
  'use strict';
  const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'];
  const r100 = (v) => Math.round(v * 100);

  function pack(p) {
    const ids = p.dancers.map((d) => d.id);
    return {
      v: 1,
      n: p.name || 'Segment',
      s: [p.stage.width, p.stage.depth, p.stage.unit, p.stage.columns, p.stage.rows, p.stage.subdivisions, p.stage.callout === 'distance' ? 'd' : 'm'],
      e: p.settings && p.settings.easing === 'linear' ? 1 : 0,
      d: p.dancers.map((d) => [d.name, d.color, Math.max(0, SHAPES.indexOf(d.shape))]),
      f: p.formations.map((f) => {
        const pos = [];
        for (const id of ids) { const q = f.positions[id] || { x: 0, y: 0 }; pos.push(r100(q.x), r100(q.y)); }
        const curves = [];
        ids.forEach((id, i) => { const c = f.paths && f.paths[id]; if (c && c.curved) curves.push(i, r100(c.dx || 0), r100(c.dy || 0)); });
        // visible layers that change how dancers look: [name, [dancer indexes], colour or 0, shape index or -1]
        const lay = (f.layers || []).filter((l) => !l.hidden && (l.color || l.shape))
          .map((l) => [l.name, l.dancerIds.map((id) => ids.indexOf(id)).filter((k) => k >= 0), l.color || 0, l.shape ? SHAPES.indexOf(l.shape) : -1]);
        return lay.length ? [f.name, r100(f.start), r100(f.end), pos, curves, lay] : [f.name, r100(f.start), r100(f.end), pos, curves];
      })
    };
  }

  function unpack(o) {
    if (!o || o.v !== 1) throw new Error('Unsupported link version');
    const dancers = o.d.map(([name, color, shape], i) => ({ id: 'd' + i, name, color, shape: SHAPES[shape] || 'circle' }));
    const formations = o.f.map(([name, start, end, pos, curves, lay]) => {
      const positions = {}, paths = {};
      dancers.forEach((d, i) => { positions[d.id] = { x: pos[i * 2] / 100, y: pos[i * 2 + 1] / 100 }; });
      for (let k = 0; k < (curves || []).length; k += 3) paths['d' + curves[k]] = { curved: true, dx: curves[k + 1] / 100, dy: curves[k + 2] / 100 };
      const layers = (lay || []).map(([ln, idx, color, shape], k) => ({ id: 'l' + k, name: ln, dancerIds: idx.map((n) => 'd' + n), color: typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : null, shape: shape >= 0 ? SHAPES[shape] : null }));
      return { name, start: start / 100, end: end / 100, positions, paths, layers };
    });
    const [width, depth, unit, columns, rows, subdivisions, co] = o.s;
    // Links made before markers existed spoke in distance.
    return { name: o.n, stage: { width, depth, unit, columns, rows, subdivisions, callout: co === 'm' ? 'markers' : 'distance' }, settings: { easing: o.e ? 'linear' : 'smooth' }, dancers, formations };
  }

  function toB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** project -> URL-safe text ("z" + deflated JSON, or "j" + plain JSON if compression is unavailable) */
  async function encode(project) {
    const json = new TextEncoder().encode(JSON.stringify(pack(project)));
    if (typeof CompressionStream !== 'undefined') return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
    return 'j' + toB64url(json);
  }
  async function decode(text) {
    const kind = text[0], bytes = fromB64url(text.slice(1));
    let json;
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('Please update your phone/browser to open this link (iOS 16.4 or newer).');
      json = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else json = bytes;
    return unpack(JSON.parse(new TextDecoder().decode(json)));
  }

  root.SFShare = { pack, unpack, encode, decode };
})(typeof window !== 'undefined' ? window : globalThis);
