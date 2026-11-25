'use strict';
/* StageFlow phone viewer: follow one dancer through a segment shared as a link. */
(function () {
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  let seg = null;           // unpacked segment
  let me = null;            // dancer id or null (everyone)
  let fi = 0;               // formation index
  let persp = localStorage.getItem('sfv.persp') || 'audience';
  let anim = null;          // { t, until, fromWall, fromT, all }
  let storeKey = '';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const fmt = (n) => String(Math.round(n * 10) / 10);
  function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function el(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const unit = () => seg.stage.unit;
  const markers = () => (seg.stage.callout || 'distance') === 'markers';
  const mW = () => seg.stage.width / (seg.stage.columns || 1), mD = () => seg.stage.depth / (seg.stage.rows || 1);
  /** Marker count, quarters as ¼ ½ ¾ */
  function mk(v) {
    const q = Math.round(Math.abs(v) * 4) / 4, w = Math.floor(q), fr = q - w;
    const f = fr === 0.25 ? '¼' : fr === 0.5 ? '½' : fr === 0.75 ? '¾' : '';
    return (w === 0 && f ? '' : String(w)) + f;
  }
  /** (x, y): x from centre (left −, right +, audience view), y from the front edge — in markers or distance */
  function spot(p) {
    const front = Math.max(0, seg.stage.depth / 2 - p.y);
    if (markers()) {
      let x = Math.round((p.x / mW()) * 4) / 4; if (Math.abs(x) < 0.01) x = 0;
      const y = Math.round((front / mD()) * 4) / 4;
      const w = (v) => (Math.abs(v) <= 1 ? 'marker' : 'markers');
      return { x, y, short: `(${x > 0 ? '+' : x < 0 ? '-' : ''}${mk(x)}, ${mk(y)})`,
        long: `${x === 0 ? 'on center' : `${mk(x)} ${w(x)} ${x < 0 ? 'left' : 'right'} of center`} · ${y === 0 ? 'on the front marker' : `${mk(y)} ${w(y)} from the front`}` };
    }
    const x = Math.abs(p.x) < 0.05 ? 0 : Math.round(p.x * 10) / 10;
    const y = Math.round(front * 10) / 10;
    return { x, y, short: `(${x > 0 ? '+' : ''}${fmt(x)}, ${fmt(y)})`,
      long: `${x === 0 ? 'on center' : `${fmt(Math.abs(x))} ${unit()} ${x < 0 ? 'left' : 'right'} of center`} · ${y === 0 ? 'at the very front' : `${fmt(y)} ${unit()} from the front`}` };
  }
  /** Colour / layer of a dancer in one formation (a formation layer can recolour a group for that formation only). */
  function lookIn(f, d) {
    let color = d.color, layer = null;
    for (const L of (f && f.layers) || []) if (L.dancerIds.includes(d.id)) { if (L.color) color = L.color; layer = L; }
    return { color, layer };
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) { const l = parts[parts.length - 1]; return /^\d+$/.test(l) ? l.slice(0, 2) : (parts[0][0] + l[0]).toUpperCase(); }
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }
  const dancer = (id) => seg.dancers.find((d) => d.id === id);
  const nameChip = (id) => { const d = dancer(id); return `<span class="chipn"><i style="background:${esc(lookIn(seg.formations[fi], d).color)}"></i>${esc(d.name)}</span>`; };

  // ---------------------------------------------------------------------------
  // Motion (same rules as the editor)
  // ---------------------------------------------------------------------------
  function locate(t) {
    const fs = seg.formations;
    if (t <= fs[0].end) return { type: 'hold', i: 0 };
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (t >= f.start && t <= f.end) return { type: 'hold', i };
      const n = fs[i + 1];
      if (n && t > f.end && t < n.start) return { type: 'trans', i, j: i + 1, s: (t - f.end) / (n.start - f.end) };
    }
    return { type: 'hold', i: fs.length - 1 };
  }
  function ease(s) { return seg.settings.easing === 'linear' ? s : s * s * (3 - 2 * s); }
  function posAt(id, t) {
    const fs = seg.formations, loc = locate(t);
    if (loc.type === 'hold') return fs[loc.i].positions[id];
    const a = fs[loc.i].positions[id], b = fs[loc.j].positions[id], s = ease(loc.s);
    const c = fs[loc.j].paths[id];
    if (c && c.curved) {
      const cx = (a.x + b.x) / 2 + c.dx, cy = (a.y + b.y) / 2 + c.dy, u = 1 - s;
      return { x: u * u * a.x + 2 * u * s * cx + s * s * b.x, y: u * u * a.y + 2 * u * s * cy + s * s * b.y };
    }
    return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
  }

  // ---------------------------------------------------------------------------
  // Relationships in a formation
  // ---------------------------------------------------------------------------
  function tol() { return unit() === 'm' ? 0.25 : 0.75; }

  /** Best straight line through some dancers (total least squares). */
  function lineFit(P, ids) {
    const n = ids.length;
    const mx = ids.reduce((s, id) => s + P[id].x, 0) / n, my = ids.reduce((s, id) => s + P[id].y, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const id of ids) { const dx = P[id].x - mx, dy = P[id].y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { mx, my, dx: Math.cos(ang), dy: Math.sin(ang) };
  }
  /** Drop the dancer furthest off the line until everyone left is really on it. */
  function straighten(P, ids, maxOff) {
    ids = ids.slice();
    while (ids.length >= 3) {
      // distance of each dancer from the line through everyone else (so one outlier can't bend the line)
      let worst = -1, wd = 0;
      ids.forEach((id, k) => {
        const f = lineFit(P, ids.filter((_, j) => j !== k));
        const d = Math.abs((P[id].x - f.mx) * f.dy - (P[id].y - f.my) * f.dx);
        if (d > wd) { wd = d; worst = k; }
      });
      if (wd <= maxOff) break;
      ids.splice(worst, 1);
    }
    return ids;
  }

  /** Lines of 3+ dancers that are diagonal (not a row or column). */
  function diagonals(P, ids) {
    const T = tol() * 1.2, out = [], seen = new Set();
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const A = P[ids[a]], B = P[ids[b]];
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180;
      const fromH = Math.min(ang, 180 - ang);
      if (fromH < 15 || fromH > 75) continue; // that's a row or a column, not a diagonal
      let members = ids.filter((id) => Math.abs((P[id].x - A.x) * dy - (P[id].y - A.y) * dx) / len <= T);
      members = straighten(P, members, tol() * 0.8);
      if (members.length < 3) continue;
      const fit = lineFit(P, members);
      const fa = Math.abs((Math.atan2(fit.dy, fit.dx) * 180) / Math.PI) % 180;
      if (Math.min(fa, 180 - fa) < 15 || Math.min(fa, 180 - fa) > 75) continue;
      const key = members.slice().sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      // keep only maximal lines
      for (let k = out.length - 1; k >= 0; k--) if (out[k].members.every((m) => members.includes(m))) out.splice(k, 1);
      if (out.some((o) => members.every((m) => o.members.includes(m)))) continue;
      out.push({ members, dir: { dx, dy } });
    }
    return out;
  }

  function relations(f, id) {
    const P = f.positions, m = P[id], T = tol();
    const others = seg.dancers.map((d) => d.id).filter((o) => o !== id);
    // in front = closer to the audience (larger y), nearest first
    const inFront = others.filter((o) => Math.abs(P[o].x - m.x) <= T && P[o].y > m.y + T).sort((a, b) => P[a].y - P[b].y);
    const behind = others.filter((o) => Math.abs(P[o].x - m.x) <= T && P[o].y < m.y - T).sort((a, b) => (m.y - P[a].y) - (m.y - P[b].y));
    const row = others.filter((o) => Math.abs(P[o].y - m.y) <= T).sort((a, b) => P[a].x - P[b].x);
    const diags = diagonals(P, seg.dancers.map((d) => d.id)).filter((g) => g.members.includes(id));
    return { inFront, behind, row, diags };
  }

  function diagWords(g) {
    // describe which way the line runs, from the audience's point of view
    const pts = g.members.map((id) => seg.formations[fi].positions[id]).sort((a, b) => a.x - b.x);
    const left = pts[0], right = pts[pts.length - 1];
    return left.y > right.y ? 'front-left to back-right' : 'back-left to front-right';
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function layout() {
    const S = seg.stage;
    const W = 400, pad = 26, top = 24, bottom = 36;  // ~1 unit per phone pixel so text stays readable
    const scale = (W - pad * 2) / S.width;
    const H = Math.round(S.depth * scale + top + bottom);
    const flip = persp === 'dancer' ? -1 : 1;
    const cx = W / 2, cy = (flip > 0 ? top : bottom) + (S.depth * scale) / 2;
    const P = (p) => ({ x: cx + flip * p.x * scale, y: cy + flip * p.y * scale });
    return { W, H, scale, flip, P, top, bottom };
  }

  function draw(t) {
    const svg = $('#stage');
    const S = seg.stage, L = layout();
    svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);
    svg.innerHTML = '';
    const a = L.P({ x: -S.width / 2, y: -S.depth / 2 }), b = L.P({ x: S.width / 2, y: S.depth / 2 });
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 8, class: 'floor' }, svg);
    const colW = (x1 - x0) / S.columns, rowH = (y1 - y0) / S.rows;
    let minor = '', major = '';
    for (let i = 1; i < S.columns * S.subdivisions; i++) { const x = x0 + (i * colW) / S.subdivisions; (i % S.subdivisions ? (minor += `M${x} ${y0}V${y1}`) : (major += `M${x} ${y0}V${y1}`)); }
    for (let i = 1; i < S.rows * S.subdivisions; i++) { const y = y0 + (i * rowH) / S.subdivisions; (i % S.subdivisions ? (minor += `M${x0} ${y}H${x1}`) : (major += `M${x0} ${y}H${x1}`)); }
    if (minor) el('path', { d: minor, class: 'g-minor' }, svg);
    if (major) el('path', { d: major, class: 'g-major' }, svg);
    const c = L.P({ x: 0, y: 0 });
    el('path', { d: `M${c.x} ${y0}V${y1}M${x0} ${c.y}H${x1}`, class: 'g-center' }, svg);
    el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 8, class: 'edge' }, svg);
    // axis numbers in the (x, y) convention
    const frontY = L.flip > 0 ? y1 : y0;
    for (let i = 0; i <= S.columns; i++) {
      const xs = -S.width / 2 + (i * S.width) / S.columns;
      const p = L.P({ x: xs, y: 0 });
      el('text', { x: p.x, y: L.flip > 0 ? y1 + 12 : y0 - 5, class: 'ax', 'text-anchor': 'middle' }, svg, markers() ? `${xs > 0 ? '+' : xs < 0 ? '-' : ''}${mk(xs / mW())}` : `${xs > 0 ? '+' : ''}${fmt(xs)}`);
    }
    for (let i = 0; i <= S.rows; i++) {
      const ys = -S.depth / 2 + (i * S.depth) / S.rows;
      const p = L.P({ x: 0, y: ys });
      el('text', { x: x0 - 4, y: p.y + 3, class: 'ax', 'text-anchor': 'end' }, svg, markers() ? mk((S.depth / 2 - ys) / mD()) : fmt(S.depth / 2 - ys));
    }
    el('text', { x: L.W / 2, y: L.flip > 0 ? frontY + 28 : frontY - 15, class: 'aud', 'text-anchor': 'middle' }, svg, 'AUDIENCE');

    const f = seg.formations[fi];
    const R = Math.max(9, Math.min(16, L.scale * 0.7));
    const rel = me ? relations(f, me) : null;
    const related = new Set();

    // relation lines (only when holding the formation)
    const holding = !anim;
    if (me && holding) {
      const m = L.P(f.positions[me]);
      if (rel.row.length) { const xs = [me, ...rel.row].map((id) => L.P(f.positions[id]).x); el('line', { x1: Math.min(...xs) - R, y1: m.y, x2: Math.max(...xs) + R, y2: m.y, class: 'rel-row' }, svg); rel.row.forEach((id) => related.add(id)); }
      const col = [...rel.inFront, ...rel.behind];
      if (col.length) { const ys = [me, ...col].map((id) => L.P(f.positions[id]).y); el('line', { x1: m.x, y1: Math.min(...ys) - R, x2: m.x, y2: Math.max(...ys) + R, class: 'rel-col' }, svg); col.forEach((id) => related.add(id)); }
      for (const g of rel.diags) {
        const pts = g.members.map((id) => L.P(f.positions[id])).sort((p, q) => p.x - q.x || p.y - q.y);
        el('line', { x1: pts[0].x, y1: pts[0].y, x2: pts[pts.length - 1].x, y2: pts[pts.length - 1].y, class: 'rel-diag' }, svg);
        g.members.forEach((id) => id !== me && related.add(id));
      }
    } else if (!me && holding) {
      for (const g of diagonals(f.positions, seg.dancers.map((d) => d.id))) {
        const pts = g.members.map((id) => L.P(f.positions[id])).sort((p, q) => p.x - q.x || p.y - q.y);
        el('line', { x1: pts[0].x, y1: pts[0].y, x2: pts[pts.length - 1].x, y2: pts[pts.length - 1].y, class: 'rel-diag' }, svg);
      }
    }

    // my path through the whole segment, with numbered spots
    if (me) {
      const pts = seg.formations.map((g) => L.P(g.positions[me]));
      el('polyline', { points: pts.map((p) => `${p.x},${p.y}`).join(' '), class: 'mypath' }, svg);
      if (fi > 0) {
        const prev = seg.formations[fi - 1].positions[me], cur = f.positions[me], cv = f.paths[me];
        const A = L.P(prev), B = L.P(cur);
        const d = cv && cv.curved ? (() => { const C = L.P({ x: (prev.x + cur.x) / 2 + cv.dx, y: (prev.y + cur.y) / 2 + cv.dy }); return `M${A.x} ${A.y}Q${C.x} ${C.y} ${B.x} ${B.y}`; })() : `M${A.x} ${A.y}L${B.x} ${B.y}`;
        el('path', { d, class: 'mymove' }, svg);
      }
      pts.forEach((p, i) => {
        if (i === fi) return;
        el('circle', { cx: p.x, cy: p.y, r: 6.5, class: 'spot-n' }, svg);
        el('text', { x: p.x, y: p.y + 2.8, class: 'spot-t', 'text-anchor': 'middle' }, svg, String(i + 1));
      });
    }

    // dancers
    const order = seg.dancers.filter((d) => d.id !== me).concat(me ? [dancer(me)] : []);
    for (const d of order) {
      const p = L.P(anim ? posAt(d.id, t) : f.positions[d.id]);
      const isMe = d.id === me;
      const dim = me && !isMe && !related.has(d.id);
      const g = el('g', { opacity: dim ? 0.35 : 1 }, svg);
      const r = isMe ? R * 1.25 : R;
      if (isMe) el('circle', { cx: p.x, cy: p.y, r: r, class: 'me-pulse' }, g);
      el('circle', { cx: p.x, cy: p.y, r, fill: lookIn(f, d).color }, g);
      if (isMe) el('circle', { cx: p.x, cy: p.y, r: r + 2.5, class: 'me-ring' }, g);
      el('text', { x: p.x, y: p.y + 3, class: 'dn', 'text-anchor': 'middle', 'font-size': isMe ? 10 : 8 }, g, initials(d.name));
      if (isMe || related.has(d.id) || !me) el('text', { x: p.x, y: p.y + r + 11, class: 'lbl', 'text-anchor': 'middle', 'font-weight': isMe ? 700 : 400 }, g, isMe ? 'YOU' : d.name);
    }
    $('#perspNote').textContent = persp === 'dancer' ? 'Dancer view — you are facing the audience' : 'Audience view — as the audience sees it';
  }

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  function renderCards() {
    const f = seg.formations[fi], prev = seg.formations[fi - 1], next = seg.formations[fi + 1];
    $('#fName').textContent = `${fi + 1}. ${f.name}`;
    $('#fTime').textContent = `${fmtTime(f.start)} – ${fmtTime(f.end)}${prev ? ` · move in from ${fmtTime(prev.end)}` : ''}`;
    $('#btnPrev').disabled = fi === 0; $('#btnNext').disabled = fi === seg.formations.length - 1;
    $('#btnPlayMove').disabled = fi === 0;
    $('#fDots').innerHTML = seg.formations.map((_, i) => `<button data-i="${i}" class="${i === fi ? 'on' : ''}" aria-label="Formation ${i + 1}"></button>`).join('');
    for (const b of document.querySelectorAll('#fDots button')) b.onclick = () => go(+b.dataset.i);

    const cards = $('#cards');
    if (!me) {
      const ds = diagonals(f.positions, seg.dancers.map((d) => d.id));
      cards.innerHTML = `<div class="card"><div class="card-title">Everyone · ${seg.dancers.length} dancers</div>
        ${ds.length ? ds.map((g) => `<div class="rel"><span class="sw" style="background:var(--diag)"></span><div><div class="t"><b>Diagonal</b> (${g.members.length} people)</div><div class="s">${g.members.map(nameChip).join('')}</div></div></div>`).join('') : '<div class="s muted">No diagonals in this formation.</div>'}
        </div>`;
      $('#spotList').innerHTML = '';
      return;
    }
    const sp = spot(f.positions[me]);
    const rel = relations(f, me);
    const rows = [];
    if (rel.inFront.length) rows.push(['var(--col)', `You're <b>behind</b> ${rel.inFront.map((id) => `<b>${esc(dancer(id).name)}</b>`).join(', then ')}`, `directly in front of you, at ${rel.inFront.map((id) => spot(f.positions[id]).short).join(', ')}`]);
    if (rel.behind.length) rows.push(['var(--col)', `${rel.behind.map((id) => `<b>${esc(dancer(id).name)}</b>`).join(', ')} ${rel.behind.length > 1 ? 'are' : 'is'} <b>behind you</b>`, 'directly behind you in your line']);
    if (rel.row.length) rows.push(['var(--row)', `<b>In line</b> (same row) with ${rel.row.map(nameChip).join('')}`, `everyone ${markers() ? `${mk(sp.y)} ${sp.y <= 1 ? 'marker' : 'markers'}` : `${fmt(sp.y)} ${unit()}`} from the front`]);
    for (const g of rel.diags) {
      const others = g.members.filter((id) => id !== me);
      rows.push(['var(--diag)', `<b>Diagonal</b> with ${others.map(nameChip).join('')}`, `${g.members.length} people on a line from ${diagWords(g)}`]);
    }
    const myLook = lookIn(f, dancer(me));
    if (myLook.layer) rows.unshift([esc(myLook.color), `You're in <b>${esc(myLook.layer.name)}</b> this formation`, myLook.color !== dancer(me).color ? 'your colour changes for this formation' : '']);
    if (!rows.length) rows.push(['var(--surface-2)', 'Nobody directly in front, behind, in your row or on a diagonal with you', '']);

    let move = '';
    if (prev) {
      const a = spot(prev.positions[me]);
      move += `<div class="move">From <b>${a.short}</b> → <b>${sp.short}</b>, moving ${fmtTime(prev.end)} – ${fmtTime(f.start)}</div>`;
    }
    if (next) {
      const n = spot(next.positions[me]);
      move += `<div class="move muted">Next: to <b>${n.short}</b> at ${fmtTime(next.start)} (leave at ${fmtTime(f.end)})</div>`;
    }
    cards.innerHTML = `
      <div class="card"><div class="card-title">Your spot</div><div class="spot-big">${sp.short}</div><div class="spot-sub">${esc(sp.long)}</div>${move ? `<div style="margin-top:8px">${move}</div>` : ''}</div>
      <div class="card"><div class="card-title">Around you</div>${rows.map(([c, t, s]) => `<div class="rel"><span class="sw" style="background:${c}"></span><div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div></div>`).join('')}</div>`;

    $('#spotList').innerHTML = seg.formations.map((g, i) => `<li data-i="${i}" class="${i === fi ? 'on' : ''}"><span>${i + 1}. ${esc(g.name)}</span><span>${spot(g.positions[me]).short}</span></li>`).join('');
    for (const li of document.querySelectorAll('#spotList li')) li.onclick = () => { go(+li.dataset.i); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  }

  function render() { draw(seg.formations[fi].start); renderCards(); }

  // ---------------------------------------------------------------------------
  // Navigation + playback
  // ---------------------------------------------------------------------------
  function go(i) {
    stop();
    fi = Math.max(0, Math.min(seg.formations.length - 1, i));
    render();
  }
  function stop() {
    if (!anim) return;
    anim = null;
    $('#btnPlayMove').classList.remove('on'); $('#btnPlayAll').classList.remove('on');
    $('#btnPlayAll').textContent = '▶ Play from here';
  }
  function play(fromT, untilT, all) {
    anim = { fromT, until: untilT, wall: performance.now(), all };
    (all ? $('#btnPlayAll') : $('#btnPlayMove')).classList.add('on');
    if (all) $('#btnPlayAll').textContent = '■ Stop';
    const step = () => {
      if (!anim) return;
      const t = anim.fromT + (performance.now() - anim.wall) / 1000;
      if (t >= anim.until) { const keep = fi; stop(); fi = keep; render(); return; }
      const loc = locate(t);
      const idx = loc.type === 'hold' ? loc.i : loc.j;
      if (idx !== fi) { fi = idx; renderCards(); }
      draw(t);
      $('#fTime').textContent = `▶ ${fmtTime(t)}`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $('#btnPrev').onclick = () => go(fi - 1);
  $('#btnNext').onclick = () => go(fi + 1);
  $('#btnPlayMove').onclick = () => {
    if (anim) return stop();
    const prev = seg.formations[fi - 1];
    if (prev) play(Math.max(prev.start, prev.end - 0.6), seg.formations[fi].start + 0.4, false);
  };
  $('#btnPlayAll').onclick = () => {
    if (anim) { stop(); render(); return; }
    const f = seg.formations[fi];
    const startT = fi > 0 ? seg.formations[fi - 1].end : f.start;
    play(startT, seg.formations[seg.formations.length - 1].end + 0.5, true);
  };
  for (const b of document.querySelectorAll('[data-persp]')) {
    b.classList.toggle('on', b.dataset.persp === persp);
    b.onclick = () => {
      persp = b.dataset.persp; localStorage.setItem('sfv.persp', persp);
      for (const x of document.querySelectorAll('[data-persp]')) x.classList.toggle('on', x === b);
      if (!anim) render();
    };
  }
  // swipe between formations
  let touch = null;
  $('#stageBox').addEventListener('touchstart', (e) => { const p = e.touches[0]; touch = { x: p.clientX, y: p.clientY }; }, { passive: true });
  $('#stageBox').addEventListener('touchend', (e) => {
    if (!touch) return;
    const p = e.changedTouches[0], dx = p.clientX - touch.x, dy = p.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(fi + (dx < 0 ? 1 : -1));
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(fi + 1); if (e.key === 'ArrowLeft') go(fi - 1); });

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  function showPick() {
    stop();
    $('#view').classList.add('hidden'); $('#pick').classList.remove('hidden');
    $('#pickTitle').textContent = seg.name;
    $('#pickSub').textContent = `${seg.formations.length} formation${seg.formations.length === 1 ? '' : 's'} · ${seg.dancers.length} dancers · ${seg.stage.width} × ${seg.stage.depth} ${unit()} stage`;
    const lg = document.querySelector('.legend');
    if (lg && markers()) lg.innerHTML = `Spots are <b>(x, y)</b> in <b>markers</b> (1 marker = ${fmt(mW())} ${unit()} across, ${fmt(mD())} ${unit()} deep): <b>x</b> = markers from center, left is negative, right is positive (as seen from the audience) · <b>y</b> = markers from the front of the stage.`;
    $('#nameList').innerHTML = seg.dancers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((d) => `<button class="name-btn" data-id="${d.id}"><i style="background:${esc(d.color)}"></i>${esc(d.name)}</button>`).join('');
    for (const b of document.querySelectorAll('.name-btn')) b.onclick = () => choose(b.dataset.id);
    history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/&me=[^&]*/, ''));
  }
  function choose(id) {
    me = id;
    localStorage.setItem(storeKey, id || '*');
    $('#pick').classList.add('hidden'); $('#view').classList.remove('hidden');
    $('#segName').textContent = seg.name;
    $('#meName').textContent = id ? dancer(id).name : 'Everyone';
    fi = 0;
    render();
    window.scrollTo(0, 0);
  }
  $('#btnBack').onclick = () => (P ? showPortalList() : showPick());
  $('#btnEveryone').onclick = () => (P ? portalChooseName(null) : choose(null));

  // ---------------------------------------------------------------------------
  // Dancer portal: a private link to a whole set (#p=<token>), read-only and always up to date
  // ---------------------------------------------------------------------------
  let P = null;   // { token, cfg, data, meName, openId, timer }
  const b64urlDecode = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  async function portalConfig(hash) {
    const c = /[#&]c=([^&]+)/.exec(hash);
    if (c) { try { const [url, key] = JSON.parse(b64urlDecode(c[1])); if (url && key) return { url, key }; } catch { /* fall through */ } }
    try { const r = await fetch('cloud.config.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j.url && j.key) return j; } } catch { /* none */ }
    return null;
  }
  async function portalFetch() {
    const headers = { apikey: P.cfg.key, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(P.cfg.key)) headers.Authorization = `Bearer ${P.cfg.key}`;
    const r = await fetch(`${P.cfg.url.replace(/\/+$/, '')}/rest/v1/rpc/portal_get`, { method: 'POST', headers, body: JSON.stringify({ tok: P.token }), cache: 'no-store' });
    if (!r.ok) throw new Error(`The server answered ${r.status}`);
    const data = await r.json();
    if (!data) throw Object.assign(new Error('This link no longer works — ask your choreographer for the new one.'), { dead: true });
    return data;
  }
  /** Segments in running order, each turned into the shape the viewer draws. */
  function portalSegments() {
    const d = P.data, order = d.order || [];
    const list = [...d.segments].sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.name.localeCompare(b.name);
    });
    return list.map((g) => {
      const x = g.data || {};
      const stage = { width: 40, depth: 30, unit: 'ft', columns: 8, rows: 4, subdivisions: 2, audience: 'bottom', ...(x.stage || {}) };
      stage.callout = stage.callout || 'markers';
      return { id: g.id, updatedAt: g.updatedAt, seg: {
        name: g.name || x.name || 'Segment', stage, settings: x.settings || {},
        dancers: (x.dancers || []).map((dd) => ({ id: dd.id, name: dd.name, color: dd.color, shape: dd.shape })),
        formations: (x.formations || []).map((f) => ({ name: f.name, start: +f.start || 0, end: +f.end || 0, positions: f.positions || {}, paths: f.paths || {}, layers: (f.layers || []).filter((l) => !l.hidden) }))
      } };
    });
  }
  const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  function portalShowPick() {
    stop();
    $('#view').classList.add('hidden'); $('#portalList').classList.add('hidden'); $('#pick').classList.remove('hidden');
    const segs = portalSegments();
    $('#pickTitle').textContent = P.data.name;
    $('#pickSub').textContent = `${segs.length} segment${segs.length === 1 ? '' : 's'} · view only · always the latest version`;
    const names = new Map();
    for (const g of segs) for (const d of g.seg.dancers) if (!names.has(d.name.trim().toLowerCase())) names.set(d.name.trim().toLowerCase(), d);
    $('#nameList').innerHTML = [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).map((d) => `<button class="name-btn" data-n="${esc(d.name)}"><i style="background:${esc(d.color)}"></i>${esc(d.name)}</button>`).join('') ||
      '<p class="muted" style="text-align:center">No dancers yet.</p>';
    for (const b of document.querySelectorAll('.name-btn')) b.onclick = () => portalChooseName(b.dataset.n);
  }
  function portalChooseName(name) {
    P.meName = name;
    localStorage.setItem(`sfv.portal.me.${P.token.slice(0, 16)}`, name == null ? '*' : name);
    showPortalList();
  }
  function showPortalList() {
    stop();
    P.openId = null;
    $('#pick').classList.add('hidden'); $('#view').classList.add('hidden'); $('#portalList').classList.remove('hidden');
    $('#plSet').textContent = P.data.name;
    $('#plMe').textContent = P.meName ? P.meName : 'Everyone';
    const segs = portalSegments();
    $('#plSegs').innerHTML = segs.map((g, i) => {
      const d = P.meName && g.seg.dancers.find((x) => sameName(x.name, P.meName));
      const n = g.seg.formations.length;
      const sub = P.meName ? (d ? `You're in it · ${n} formation${n === 1 ? '' : 's'}` : 'You’re not in this one') : `${g.seg.dancers.length} dancers · ${n} formation${n === 1 ? '' : 's'}`;
      return `<button class="seg-card ${P.meName && !d ? 'out' : ''}" data-id="${g.id}"><span class="num">${i + 1}</span><span class="txt"><b>${esc(g.seg.name)}</b><span class="muted">${esc(sub)}</span></span><span class="go">›</span></button>`;
    }).join('') || '<p class="muted" style="text-align:center">No segments in this set yet.</p>';
    for (const b of document.querySelectorAll('.seg-card')) b.onclick = () => openPortalSegment(b.dataset.id);
    $('#plUpdated').textContent = P.stale ? 'Offline — showing the copy saved on this phone.' : `Up to date · checked ${new Date(P.checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    window.scrollTo(0, 0);
  }
  function openPortalSegment(id, keepFormation = false) {
    const g = portalSegments().find((x) => x.id === id);
    if (!g) { showPortalList(); return; }
    const keep = keepFormation ? fi : 0;
    seg = g.seg;
    P.openId = id;
    storeKey = `sfv.portal.seg.${id}`;
    const d = P.meName && seg.dancers.find((x) => sameName(x.name, P.meName));
    $('#portalList').classList.add('hidden');
    choose(d ? d.id : null);
    if (keepFormation) { fi = Math.min(keep, seg.formations.length - 1); render(); }
    document.title = `${seg.name} — ${P.data.name}`;
  }
  function portalNote(msg) {
    const n = $('#portalToast'); n.textContent = msg; n.classList.add('show');
    clearTimeout(portalNote.t); portalNote.t = setTimeout(() => n.classList.remove('show'), 3500);
  }
  async function portalRefresh(first = false) {
    try {
      const data = await portalFetch();
      const changed = !P.data || data.updatedAt !== P.data.updatedAt;
      P.data = data; P.stale = false; P.checked = Date.now();
      localStorage.setItem(`sfv.portal.${P.token.slice(0, 16)}`, JSON.stringify(data));
      if (changed && !first) {
        if (P.openId && !anim) { openPortalSegment(P.openId, true); portalNote('Formations updated by your choreographer'); }
        else if (!$('#portalList').classList.contains('hidden')) { showPortalList(); portalNote('Formations updated'); }
      } else if (!$('#portalList').classList.contains('hidden')) $('#plUpdated').textContent = `Up to date · checked ${new Date(P.checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      return true;
    } catch (e) {
      if (e.dead) { localStorage.removeItem(`sfv.portal.${P.token.slice(0, 16)}`); throw e; }
      const cached = localStorage.getItem(`sfv.portal.${P.token.slice(0, 16)}`);
      if (first && cached) { P.data = JSON.parse(cached); P.stale = true; P.checked = Date.now(); return true; }
      if (first) throw e;
      P.stale = true;
      return false;
    }
  }
  async function initPortal(token) {
    P = { token, cfg: await portalConfig(location.hash), data: null, meName: null, openId: null };
    $('#pickTitle').textContent = 'Loading your set…';
    if (!P.cfg) throw new Error('This link is missing its server details — ask your choreographer to send it again.');
    await portalRefresh(true);
    document.title = `${P.data.name} — StageFlow`;
    const saved = localStorage.getItem(`sfv.portal.me.${token.slice(0, 16)}`);
    if (saved != null) { P.meName = saved === '*' ? null : saved; showPortalList(); } else portalShowPick();
    $('#plChange').onclick = portalShowPick;
    setInterval(() => { if (!document.hidden) portalRefresh(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) portalRefresh(); });
  }

  async function init() {
    const pm = /[#&]p=([0-9a-f]{32,})/i.exec(location.hash);
    if (pm) {
      try { await initPortal(pm[1]); } catch (e) {
        $('#pickTitle').textContent = 'This link could not be opened';
        $('#loadError').textContent = e.message || String(e);
        $('#loadError').classList.remove('hidden');
        $('#btnEveryone').classList.add('hidden');
      }
      return;
    }
    const m = /[#&]s=([^&]+)/.exec(location.hash);
    if (!m) {
      $('#pickTitle').textContent = 'No formations in this link';
      $('#loadError').textContent = 'Ask your choreographer to send the full link (it is long — make sure nothing got cut off).';
      $('#loadError').classList.remove('hidden');
      return;
    }
    try {
      seg = await SFShare.decode(m[1]);
    } catch (e) {
      $('#pickTitle').textContent = 'This link could not be opened';
      $('#loadError').textContent = e.message || String(e);
      $('#loadError').classList.remove('hidden');
      return;
    }
    document.title = `${seg.name} — StageFlow`;
    let h = 0; for (const ch of m[1]) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    storeKey = `sfv.me.${h}`;
    const saved = localStorage.getItem(storeKey);
    const want = /[#&]me=([^&]+)/.exec(location.hash);
    const byName = want && seg.dancers.find((d) => d.name.toLowerCase() === decodeURIComponent(want[1]).toLowerCase());
    if (byName) choose(byName.id);
    else if (saved && (saved === '*' || dancer(saved))) choose(saved === '*' ? null : saved);
    else showPick();
  }
  window.__viewer = { get seg() { return seg; }, choose, go, relations: (i, id) => relations(seg.formations[i], id), diagonals: (i) => diagonals(seg.formations[i].positions, seg.dancers.map((d) => d.id)) };
  init();
})();
