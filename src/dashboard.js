'use strict';
/* StageFlow — Dashboard: sets (shows) made of segments, in running order. */
(function () {
  const api = window.__stageflow;
  const native = window.stageflowNative || null;
  const L = native && native.library;
  const $ = (s) => document.querySelector(s);
  const BAR_COLORS = ['#a8c7fa', '#c2e7ff', '#d3e3fd', '#b7f0c1', '#fde293', '#f6c7b6', '#e8d0ff'];
  let lib = null;
  let dragFile = null;

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtDur(t) { const m = Math.floor(t / 60), s = Math.round(t - m * 60); return `${m}:${String(s).padStart(2, '0')}`; }
  function ago(ms) {
    const d = (Date.now() - ms) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return `${Math.round(d / 60)} min ago`;
    if (d < 86400) return `${Math.round(d / 3600)} h ago`;
    return new Date(ms).toLocaleDateString();
  }

  async function show() {
    if (!L) return;
    if (api.state.view === 'editor' && !(await api.confirmDiscard())) return;
    api.showView('dashboard');
    await refresh();
  }
  let rosterData = null;
  async function refresh() {
    if (!L) return;
    StageRoster.invalidate();
    rosterData = await StageRoster.load();
    lib = await L.list();
    render();
    renderRosters();
  }

  // ---------------------------------------------------------------------------
  // Transition check between two segments (last formation → next segment's first)
  // ---------------------------------------------------------------------------
  function linkInfo(a, b) {
    if (!a.ok || !b.ok || !a.formations.length || !b.formations.length) return null;
    const last = a.formations[a.formations.length - 1], first = b.formations[0];
    const byName = (seg) => new Map(seg.dancers.map((d) => [d.name.trim().toLowerCase(), d]));
    const A = byName(a), B = byName(b);
    let maxMove = 0, who = null;
    const added = [], removed = [];
    for (const [n, d] of B) {
      const prev = A.get(n);
      if (!prev) { added.push(d.name); continue; }
      const p = last.positions[prev.id], q = first.positions[d.id];
      if (!p || !q) continue;
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist > maxMove) { maxMove = dist; who = d.name; }
    }
    for (const [n, d] of A) if (!B.has(n)) removed.push(d.name);
    const unit = (b.stage && b.stage.unit) || 'ft';
    const width = (b.stage && b.stage.width) || 40;
    return { maxMove, who, added, removed, unit, warn: maxMove > width * 0.25 || added.length || removed.length };
  }

  function thumb(canvas, seg, formation) {
    const w = canvas.clientWidth || 104, h = canvas.clientHeight || 78;
    canvas.width = w * 2; canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    if (!seg.ok || !formation) { ctx.fillStyle = '#1b1c1e'; ctx.fillRect(0, 0, w, h); return; }
    const project = { stage: seg.stage || { width: 40, depth: 30, unit: 'ft', columns: 8, rows: 4, subdivisions: 2, audience: 'bottom' }, dancers: seg.dancers };
    StageRender.drawStage(ctx, w, h, project, formation.positions || {}, { theme: 'dark', compact: true });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render() {
    $('#dashLibrary').innerHTML = `<span>${api.ICONS.folder}</span><span>Library: <b>${esc(lib.root)}</b></span>
      <button class="text-btn" id="libOpen">Open folder</button><button class="text-btn" id="libChange">Change…</button>`;
    $('#libOpen').onclick = () => native.reveal(lib.root + '/.');
    $('#libChange').onclick = async () => { if (await L.chooseRoot()) refresh(); };

    const list = $('#setList');
    list.innerHTML = '';
    if (!lib.sets.length) {
      list.innerHTML = `<div class="empty-dash"><h2>No sets yet</h2><p>Create a set for each show or routine, then add its segments in running order.</p>
        <button class="filled" id="emptyNew">${api.ICONS.plus}<span>Create your first set</span></button></div>`;
      $('#emptyNew').onclick = newSet;
      return;
    }
    for (const set of lib.sets) list.appendChild(setCard(set));
  }

  function setCard(set) {
    const card = document.createElement('section');
    card.className = 'set-card';
    const total = set.segments.reduce((s, g) => s + (g.duration || 0), 0);
    const dancerNames = new Set();
    for (const g of set.segments) for (const d of g.dancers || []) dancerNames.add(d.name.trim().toLowerCase());
    const lastMod = Math.max(set.modified, ...set.segments.map((g) => g.modified));
    card.innerHTML = `
      <div class="set-head">
        <h2 title="Click to rename">${esc(set.name)}</h2>
        <div class="set-stats"><span>${set.segments.length} segment${set.segments.length === 1 ? '' : 's'}</span><span>${fmtDur(total)} total</span><span>${dancerNames.size} dancer${dancerNames.size === 1 ? '' : 's'}</span><span>edited ${ago(lastMod)}</span></div>
        <div class="tb-spacer"></div>
        <label class="set-roster" title="Roster for this set: new segments start with these people">${api.ICONS.users}<select data-act="roster"><option value="">No roster</option>${(rosterData ? rosterData.rosters : []).map((r) => `<option value="${r.id}" ${set.roster === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <button class="icon-btn" data-act="applyRoster" title="Apply this set's roster to every segment (updates gender, skill, height, colour; adds missing people)" ${set.roster ? '' : 'disabled'}>${api.ICONS.refresh}</button>
        <button class="tonal sm-btn" data-act="new">${api.ICONS.plus}<span>Segment</span></button>
        <button class="icon-btn" data-act="import" title="Import segment files">${api.ICONS.download}</button>
        <button class="icon-btn" data-act="reveal" title="Show in folder">${api.ICONS.folder}</button>
        <button class="icon-btn" data-act="delete" title="Delete set">${api.ICONS.trash}</button>
      </div>
      <div class="set-run"></div>
      <div class="seg-row"></div>`;
    card.querySelector('h2').onclick = async () => {
      const n = await api.askText('Rename set', set.name);
      if (n) { await L.updateSet({ dir: set.dir, name: n }); refresh(); }
    };
    card.querySelector('[data-act="new"]').onclick = () => newSegment(set);
    card.querySelector('[data-act="roster"]').onchange = async (e) => { await L.updateSet({ dir: set.dir, roster: e.target.value || null }); refresh(); };
    card.querySelector('[data-act="applyRoster"]').onclick = () => applyRosterToSet(set);
    card.querySelector('[data-act="import"]').onclick = async () => { const r = await L.importSegments(set.dir); if (r.length) refresh(); };
    card.querySelector('[data-act="reveal"]').onclick = () => native.reveal(set.dir);
    card.querySelector('[data-act="delete"]').onclick = async () => {
      if (!confirm(`Move the set “${set.name}” and its ${set.segments.length} segment(s) to the trash?`)) return;
      await L.deleteSet(set.dir); refresh();
    };

    // running order strip (proportional to duration)
    const run = card.querySelector('.set-run');
    if (set.segments.length) {
      let t = 0;
      const strip = set.segments.map((g, i) => {
        const w = total ? Math.max(3, ((g.duration || 0) / total) * 100) : 100 / set.segments.length;
        const html = `<div class="run-seg" data-i="${i}" style="flex:${w} 1 0;background:${BAR_COLORS[i % BAR_COLORS.length]}" title="${esc(g.name)}\n${fmtDur(t)} – ${fmtDur(t + (g.duration || 0))}">${i + 1}. ${esc(g.name)}</div>`;
        t += g.duration || 0;
        return html;
      }).join('');
      run.innerHTML = `<div class="run-strip">${strip}</div><div class="run-axis"><span>0:00</span><span>running order · ${fmtDur(total)}</span><span>${fmtDur(total)}</span></div>`;
      run.querySelectorAll('.run-seg').forEach((el) => { el.onclick = () => openSegment(set, set.segments[+el.dataset.i]); });
    }

    // segment cards with transition links between them
    const row = card.querySelector('.seg-row');
    let tStart = 0;
    set.segments.forEach((g, i) => {
      if (i > 0) {
        const info = linkInfo(set.segments[i - 1], g);
        const link = document.createElement('div');
        link.className = 'seg-link' + (info && info.warn ? ' warn' : '');
        if (info) {
          const bits = [];
          if (info.who) bits.push(`biggest move ${Math.round(info.maxMove * 10) / 10} ${info.unit}`);
          if (info.added.length) bits.push(`+${info.added.length} in`);
          if (info.removed.length) bits.push(`−${info.removed.length} out`);
          link.innerHTML = `<span class="arrow">→</span><span>${bits.join(' · ') || 'same spots'}</span>`;
          link.title = [
            `From the end of “${set.segments[i - 1].name}” to the start of “${g.name}”.`,
            info.who ? `${info.who} has the longest way to go (${Math.round(info.maxMove * 10) / 10} ${info.unit}).` : '',
            info.added.length ? `Enter: ${info.added.join(', ')}` : '', info.removed.length ? `Exit: ${info.removed.join(', ')}` : ''
          ].filter(Boolean).join('\n');
        } else link.innerHTML = '<span class="arrow">→</span>';
        row.appendChild(link);
      }
      row.appendChild(segCard(set, g, i, tStart));
      tStart += g.duration || 0;
    });

    const add = document.createElement('div');
    add.className = 'seg-add';
    add.innerHTML = `<button class="filled">${api.ICONS.plus}<span>New</span></button><button class="tonal">${api.ICONS.download}<span>Import</span></button>`;
    add.children[0].onclick = () => newSegment(set);
    add.children[1].onclick = async () => { const r = await L.importSegments(set.dir); if (r.length) refresh(); };
    add.addEventListener('dragover', (e) => { if (dragFile) { e.preventDefault(); add.style.borderColor = 'var(--primary)'; } });
    add.addEventListener('dragleave', () => { add.style.borderColor = ''; });
    add.addEventListener('drop', async (e) => { e.preventDefault(); add.style.borderColor = ''; if (dragFile) { await L.moveSegment({ file: dragFile, toDir: set.dir, index: set.segments.length }); refresh(); } });
    row.appendChild(add);
    requestAnimationFrame(() => {
      card.querySelectorAll('.seg-card').forEach((el) => {
        const g = set.segments[+el.dataset.i];
        const c = el.querySelectorAll('canvas');
        thumb(c[0], g, g.formations && g.formations[0]);
        thumb(c[1], g, g.formations && g.formations[g.formations.length - 1]);
      });
    });
    return card;
  }

  function segCard(set, g, i, tStart) {
    const el = document.createElement('div');
    el.className = 'seg-card';
    el.dataset.i = i;
    el.draggable = true;
    el.innerHTML = `
      <div class="thumbs"><canvas></canvas><canvas></canvas></div>
      <div class="thumb-lbl"><span>starts</span><span>ends</span></div>
      <div class="title"><span class="num">${i + 1}</span><b>${esc(g.name)}</b></div>
      <div class="meta">${g.ok
        ? `<span>${fmtDur(tStart)} → ${fmtDur(tStart + g.duration)}</span><span>${g.formations.length} formation${g.formations.length === 1 ? '' : 's'}</span><span>${g.dancers.length} dancers</span>${g.audioName ? `<span title="${esc(g.audioName)}">♪ ${esc(g.audioName.length > 18 ? g.audioName.slice(0, 17) + '…' : g.audioName)}</span>` : ''}`
        : `<span style="color:var(--danger)">Can't read this file</span>`}</div>
      <div class="card-actions">
        <button data-a="rename" title="Rename">${api.ICONS.edit}</button>
        <button data-a="dup" title="Duplicate">${api.ICONS.copy}</button>
        <button data-a="del" title="Delete">${api.ICONS.trash}</button>
      </div>`;
    el.onclick = (e) => { if (!e.target.closest('.card-actions')) openSegment(set, g); };
    el.querySelector('[data-a="rename"]').onclick = async () => {
      const n = await api.askText('Rename segment', g.name);
      if (n) { await L.renameSegment({ file: g.path, name: n }); refresh(); }
    };
    el.querySelector('[data-a="dup"]').onclick = async () => { await L.duplicateSegment(g.path); refresh(); };
    el.querySelector('[data-a="del"]').onclick = async () => {
      if (!confirm(`Move the segment “${g.name}” to the trash?`)) return;
      await L.deleteSegment(g.path); refresh();
    };
    el.addEventListener('dragstart', (e) => { dragFile = g.path; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.path); });
    el.addEventListener('dragend', () => { dragFile = null; el.classList.remove('dragging'); });
    el.addEventListener('dragover', (e) => { if (dragFile && dragFile !== g.path) { e.preventDefault(); el.classList.add('drop-before'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('drop-before');
      if (!dragFile || dragFile === g.path) return;
      const sameSet = set.segments.some((s) => s.path === dragFile);
      let index = i;
      if (sameSet && set.segments.findIndex((s) => s.path === dragFile) < i) index = i - 1;
      await L.moveSegment({ file: dragFile, toDir: set.dir, index });
      refresh();
    });
    return el;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function newSet() {
    const name = await api.askText('New set', 'My show', { ok: 'Create', hint: 'A set is a show or routine made of segments.' });
    if (!name) return;
    await L.createSet(name);
    refresh();
  }

  async function newSegment(set) {
    const name = await api.askText('New segment', `Segment ${set.segments.length + 1}`, { ok: 'Create' });
    if (!name) return;
    const p = api.defaultProject();
    p.name = name;
    // continue from the previous segment: same dancers & stage, starting where they ended
    const prev = [...set.segments].reverse().find((g) => g.ok && g.dancers.length);
    const roster = rosterData && rosterData.rosters.find((r) => r.id === set.roster);
    if (!prev && roster && roster.members.length) {
      // first segment of a set with a roster: start with exactly those people
      p.dancers = [];
      p.formations[0].positions = {};
      StageRoster.applyToProject(p, roster, { addMissing: true });
    }
    if (prev) {
      p.dancers = prev.dancers.map((d) => ({ ...d }));
      if (prev.stage) p.stage = { ...prev.stage };
      const last = prev.formations[prev.formations.length - 1];
      p.formations[0].positions = {};
      for (const d of p.dancers) p.formations[0].positions[d.id] = { ...((last && last.positions[d.id]) || { x: 0, y: 0 }) };
    }
    const { filePath } = await L.createSegment({ dir: set.dir, name, text: JSON.stringify(p) });
    const r = await L.read(filePath);
    await api.loadProjectText(r.text, r.filePath, { setName: set.name });
  }

  async function applyRosterToSet(set) {
    const roster = rosterData && rosterData.rosters.find((r) => r.id === set.roster);
    if (!roster) return;
    if (!confirm(`Apply the roster “${roster.name}” to all ${set.segments.length} segment(s) of “${set.name}”?\n\nDancers with the same name get the roster's gender, skill, height and colour; people missing from a segment are added at the front of the stage.`)) return;
    let up = 0, add = 0, n = 0;
    for (const g of set.segments) {
      if (!g.ok) continue;
      const r = await L.read(g.path);
      const raw = JSON.parse(r.text);
      const p = api.normalizeProject(raw);
      const res = StageRoster.applyToProject(p, roster, { addMissing: true });
      up += res.updated; add += res.added; n++;
      // keep everything the editor stores alongside the project (audio, clips, …)
      await L.writeSegment({ file: g.path, text: JSON.stringify({ ...raw, ...p, audio: raw.audio || null, clips: raw.clips || [] }) });
    }
    await refresh();
    alert(`Roster applied to ${n} segment(s): ${up} dancer(s) updated, ${add} added.`);
  }

  // ---------------------------------------------------------------------------
  // Roster tab
  // ---------------------------------------------------------------------------
  let rosterSel = null;
  function setDashTab(tab) {
    for (const b of document.querySelectorAll('[data-dtab]')) b.classList.toggle('on', b.dataset.dtab === tab);
    for (const p of document.querySelectorAll('[data-dpage]')) p.classList.toggle('hidden', p.dataset.dpage !== tab);
    if (tab === 'roster') renderRosters();
  }
  for (const b of document.querySelectorAll('[data-dtab]')) b.addEventListener('click', () => setDashTab(b.dataset.dtab));

  function renderRosters() {
    const el = $('#rosterView');
    if (!rosterData) { el.innerHTML = ''; return; }
    const R = rosterData.rosters;
    if (!R.length) {
      el.innerHTML = `<div class="empty-dash"><h2>No rosters yet</h2><p>Make a roster for each team or cast, then apply it to segments.</p><button class="filled" id="emptyRoster">${api.ICONS.plus}<span>Create a roster</span></button></div>`;
      $('#emptyRoster').onclick = newRoster;
      return;
    }
    if (!R.some((r) => r.id === rosterSel)) rosterSel = R[0].id;
    const r = R.find((x) => x.id === rosterSel);
    const unit = StageRoster.heightUnit();
    const usedBy = lib ? lib.sets.filter((s) => s.roster === r.id).map((s) => s.name) : [];
    el.innerHTML = `
      <div class="roster-layout">
        <div class="roster-list">${R.map((x) => `<button class="roster-item ${x.id === r.id ? 'on' : ''}" data-id="${x.id}"><b>${esc(x.name)}</b><span>${x.members.length} ${x.members.length === 1 ? 'person' : 'people'}</span></button>`).join('')}</div>
        <div class="roster-main">
          <div class="roster-head">
            <h2 title="Click to rename">${esc(r.name)}</h2>
            <span class="muted small">${usedBy.length ? `Used by ${usedBy.map(esc).join(', ')}` : 'Not linked to a set yet'}</span>
            <div class="tb-spacer"></div>
            <label class="inline-select">Heights in <select id="rHeightUnit"><option value="ft">ft/in</option><option value="cm">cm</option></select></label>
            <button class="icon-btn" id="rDelete" title="Delete roster">${api.ICONS.trash}</button>
          </div>
          <table class="roster-table">
            <thead><tr><th></th><th>Name</th><th>Gender</th><th>Skill</th><th>Height</th><th>Notes</th><th></th></tr></thead>
            <tbody>${r.members.map((m) => `<tr data-id="${m.id}">
              <td><input type="color" data-k="color" value="${esc(m.color || '#3b82f6')}"></td>
              <td><input type="text" data-k="name" value="${esc(m.name)}" spellcheck="false"></td>
              <td><select data-k="gender">${StageRoster.GENDERS.map(([v, t]) => `<option value="${v}" ${m.gender === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
              <td><select data-k="skill">${StageRoster.SKILLS.map((t, i) => `<option value="${i}" ${(m.skill || 0) === i ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
              <td><input type="text" data-k="height" value="${esc(StageRoster.formatHeight(m.height, unit))}" placeholder="${unit === 'cm' ? '168 cm' : `5'6"`}" spellcheck="false"></td>
              <td><input type="text" data-k="notes" value="${esc(m.notes || '')}" placeholder="—"></td>
              <td><button class="icon-btn sm" data-del title="Remove">${api.ICONS.x}</button></td></tr>`).join('')}</tbody>
          </table>
          <div class="roster-add">
            <button class="filled" id="rAdd">${api.ICONS.plus}<span>Add person</span></button>
            <button class="tonal" id="rAddMany">Add several names…</button>
          </div>
        </div>
      </div>`;
    $('#rHeightUnit').value = unit;
    $('#rHeightUnit').onchange = (e) => { localStorage.setItem('sf.heightUnit', e.target.value); renderRosters(); };
    el.querySelectorAll('.roster-item').forEach((b) => { b.onclick = () => { rosterSel = b.dataset.id; renderRosters(); }; });
    el.querySelector('.roster-head h2').onclick = async () => { const n = await api.askText('Rename roster', r.name); if (n) { r.name = n; StageRoster.save(); renderRosters(); render(); } };
    $('#rDelete').onclick = () => {
      if (!confirm(`Delete the roster “${r.name}”? Segments keep their dancers.`)) return;
      rosterData.rosters = R.filter((x) => x !== r); StageRoster.save(); renderRosters(); render();
    };
    el.querySelectorAll('.roster-table tbody tr').forEach((tr) => {
      const m = r.members.find((x) => x.id === tr.dataset.id);
      tr.querySelectorAll('[data-k]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        inp.addEventListener('change', () => {
          const k = inp.dataset.k;
          if (k === 'height') {
            const h = inp.value.trim() ? StageRoster.parseHeight(inp.value) : null;
            if (inp.value.trim() && !h) { inp.value = StageRoster.formatHeight(m.height, unit); alert(`Couldn't read that height. Try 5'6", 66 in, 168 cm or 1.68 m.`); return; }
            m.height = h; inp.value = StageRoster.formatHeight(h, unit);
          } else if (k === 'skill') m.skill = +inp.value;
          else m[k] = inp.value;
          StageRoster.save();
          el.querySelector('.roster-item.on span').textContent = `${r.members.length} ${r.members.length === 1 ? 'person' : 'people'}`;
        });
      });
      tr.querySelector('[data-del]').onclick = () => { r.members = r.members.filter((x) => x !== m); StageRoster.save(); renderRosters(); };
    });
    const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e', '#a855f7'];
    const addPerson = (name) => { r.members.push({ id: api.uid(), name, gender: '', skill: 0, height: null, color: PALETTE[r.members.length % PALETTE.length], notes: '' }); };
    $('#rAdd').onclick = () => { addPerson(`Dancer ${r.members.length + 1}`); StageRoster.save(); renderRosters(); const ins = el.querySelectorAll('.roster-table [data-k="name"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } };
    $('#rAddMany').onclick = async () => {
      const txt = await api.askText('Add several people', '', { ok: 'Add', hint: 'Separate names with commas, e.g. Ava, Ben, Cleo' });
      if (!txt) return;
      txt.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).forEach(addPerson);
      StageRoster.save(); renderRosters();
    };
  }
  async function newRoster() {
    const name = await api.askText('New roster', 'Company', { ok: 'Create' });
    if (!name) return;
    const r = { id: api.uid(), name, members: [] };
    rosterData.rosters.push(r);
    rosterSel = r.id;
    StageRoster.save();
    setDashTab('roster');
    render();
  }
  $('#btnNewRoster').addEventListener('click', newRoster);

  async function openSegment(set, g) {
    if (!g.ok) { alert(`This segment file could not be read:\n${g.error}`); return; }
    const r = await L.read(g.path);
    await api.loadProjectText(r.text, r.filePath, { setName: set.name });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  $('#btnHome').addEventListener('click', show);
  $('#crumbSet').addEventListener('click', show);
  $('#btnNewSet').addEventListener('click', newSet);
  $('#btnOpenFile').addEventListener('click', () => api.state.view === 'dashboard' ? openFile() : null);
  async function openFile() {
    const res = await native.openProject();
    if (res) await api.loadProjectText(res.text, res.filePath);
  }

  if (!L) {
    // browser build: no library on disk — go straight to the editor
    $('#btnHome').style.display = 'none';
  } else {
    refresh();
  }

  window.StageDashboard = { show, refresh, setDashTab };
})();
