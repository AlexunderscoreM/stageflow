'use strict';
/* StageFlow — Teach mode window: call-outs for every dancer in every formation. */
(function () {
  const $ = (s) => document.querySelector(s);
  let data = null;
  let idx = 0;

  function source() { try { return window.opener && window.opener.__stageflow; } catch { return null; } }
  function pull() {
    const api = source();
    if (!api) { document.body.innerHTML = '<p style="padding:30px">Open teach mode from the StageFlow editor (Export → Teach mode).</p>'; return false; }
    data = api.teachData();
    idx = Math.min(idx, data.formations.length - 1);
    $('#segName').textContent = data.name;
    const sel = $('#focus');
    const keep = sel.value;
    sel.innerHTML = '<option value="">Everyone</option>' + data.dancers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    sel.value = data.dancers.some((d) => d.id === keep) ? keep : '';
    return true;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtTime(t) { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; }

  function render() {
    if (!data) return;
    const fs = data.formations, f = fs[idx], prev = idx > 0 ? fs[idx - 1] : null;
    const focus = $('#focus').value;
    $('#tabs').innerHTML = fs.map((x, i) => `<button data-i="${i}" class="${i === idx ? 'on' : ''}">${i + 1}. ${escapeHtml(x.name)}</button>`).join('');
    for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => { idx = +b.dataset.i; render(); };
    const cur = $('#tabs .on'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#fName').textContent = `${idx + 1}. ${f.name}`;
    $('#fTime').textContent = `${fmtTime(f.start)} – ${fmtTime(f.end)}${prev ? ` · move in from ${fmtTime(prev.end)}` : ''}`;
    $('#prev').disabled = idx === 0; $('#next').disabled = idx === fs.length - 1;

    // stage drawing
    const cv = $('#cv');
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const project = { stage: data.stage, dancers: data.dancers };
    StageRender.drawStage(ctx, w, h, project, f.positions, {
      theme: 'light', numbers: true, showNames: true, pad: 48,
      highlight: focus ? new Set([focus]) : null,
      from: $('#showFrom').checked && prev ? prev.positions : null,
      formation: f, fromFormation: prev
    });

    const S = data.stage, lg = document.querySelector('.legend');
    if (lg) lg.textContent = (S.callout || 'markers') === 'markers'
      ? `Spots are (x, y) in markers — 1 marker = ${Math.round(S.width / S.columns * 10) / 10} ${S.unit} across, ${Math.round(S.depth / S.rows * 10) / 10} ${S.unit} deep: x = markers from center, left − / right + as seen from the audience · y = markers from the front of the stage`
      : 'Spots are (x, y): x = distance from center, left − / right + as seen from the audience · y = distance from the front of the stage';
    // call-out list (focused dancer first)
    const order = data.dancers.map((d, i) => ({ d, i }));
    if (focus) order.sort((a, b) => (b.d.id === focus) - (a.d.id === focus));
    $('#list').innerHTML = order.map(({ d, i }) => {
      const p = f.positions[d.id] || { x: 0, y: 0 };
      const co = StageRender.callout(project, p);
      const from = prev ? StageRender.callout(project, prev.positions[d.id] || { x: 0, y: 0 }).short : null;
      const cls = focus ? (d.id === focus ? 'focus' : 'dim') : '';
      const lk = StageRender.lookOf(f, d);
      return `<div class="card ${cls}"><div class="badge" style="background:${escapeHtml(lk.color)}">${i + 1}</div>
        <div class="name"><span>${escapeHtml(d.name)}</span>${lk.layer ? `<span class="lay">${escapeHtml(lk.layer.name)}</span>` : ''}</div>
        <div class="spot">${escapeHtml(co.short)}</div>
        <div class="long">${escapeHtml(co.long)}</div>
        ${from ? `<div class="from">from ${escapeHtml(from)}</div>` : ''}</div>`;
    }).join('');
  }

  function go(d) { idx = Math.max(0, Math.min(data.formations.length - 1, idx + d)); render(); }
  $('#prev').onclick = () => go(-1);
  $('#next').onclick = () => go(1);
  $('#refresh').onclick = () => { if (pull()) render(); };
  $('#print').onclick = () => window.print();
  $('#focus').onchange = render;
  $('#showFrom').onchange = render;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
  });
  window.addEventListener('resize', render);
  setInterval(() => {
    if (!$('#follow').checked) return;
    const api = source();
    if (!api) return;
    const i = api.panelFormationIndex();
    if (i !== idx) { idx = Math.min(i, data.formations.length - 1); render(); }
  }, 250);

  if (pull()) render();
})();
