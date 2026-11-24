'use strict';
/* StageFlow — rosters: people with gender, skill and height, applied to segments' dancers. */
(function () {
  const api = window.__stageflow;
  const native = window.stageflowNative || null;
  const L = native && native.library;
  const $ = (s) => document.querySelector(s);

  const GENDERS = [['', '—'], ['female', 'Female'], ['male', 'Male'], ['nonbinary', 'Non-binary']];
  const SKILLS = ['—', '1 · Beginner', '2 · Developing', '3 · Intermediate', '4 · Advanced', '5 · Elite'];
  const DEFAULT_STYLES = [{ id: 'hiphop', name: 'Hip Hop' }, { id: 'contemporary', name: 'Contemporary' }, { id: 'rnb', name: 'R&B' }];
  const DEFAULT_HEIGHT = { female: 1.65, male: 1.78, nonbinary: 1.72, '': 1.72 };

  // ---------------------------------------------------------------------------
  // Storage (library folder in the desktop app, browser storage otherwise)
  // ---------------------------------------------------------------------------
  let cache = null;
  async function load() {
    if (cache) return cache;
    if (L) cache = await L.loadRosters();
    else { try { cache = JSON.parse(localStorage.getItem('sf.rosters') || ''); } catch { cache = null; } }
    if (!cache || !Array.isArray(cache.rosters)) cache = { rosters: [] };
    if (!Array.isArray(cache.styles)) cache.styles = DEFAULT_STYLES.map((x) => ({ ...x }));
    // older rosters had one skill per person: carry it over to every style
    for (const r of cache.rosters) for (const m of r.members) {
      if (!m.skills || typeof m.skills !== 'object') {
        m.skills = {};
        if (m.skill) for (const st of cache.styles) m.skills[st.id] = m.skill;
      }
      delete m.skill;
    }
    return cache;
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (L) L.saveRosters(cache); else localStorage.setItem('sf.rosters', JSON.stringify(cache));
    }, 250);
  }
  function invalidate() { cache = null; }

  // ---------------------------------------------------------------------------
  // Heights: stored in metres; typed as 5'6", 5 6, 66in, 168cm, 168, 1.68
  // ---------------------------------------------------------------------------
  function heightUnit() { return localStorage.getItem('sf.heightUnit') || (api.project.stage.unit === 'm' ? 'cm' : 'ft'); }
  function parseHeight(str) {
    const s = String(str || '').trim().toLowerCase().replace(/[”"″]/g, '"').replace(/[’'′]/g, "'");
    if (!s) return null;
    let m;
    if ((m = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/.exec(s))) return round(((+m[1]) * 12 + (+(m[2] || 0))) * 0.0254);
    if ((m = /^(\d)\s+(\d{1,2}(?:\.\d+)?)$/.exec(s))) return round(((+m[1]) * 12 + (+m[2])) * 0.0254);
    if ((m = /^(\d+(?:\.\d+)?)\s*(?:"|in|inches)$/.exec(s))) return round(+m[1] * 0.0254);
    if ((m = /^(\d+(?:\.\d+)?)\s*cm$/.exec(s))) return round(+m[1] / 100);
    if ((m = /^(\d+(?:\.\d+)?)\s*m$/.exec(s))) return round(+m[1]);
    if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) {
      const v = +m[1];
      if (v >= 100) return round(v / 100);        // centimetres
      if (v >= 40) return round(v * 0.0254);      // inches
      if (v >= 3) return round(v * 0.3048);       // feet (decimal)
      return round(v);                            // metres
    }
    return null;
  }
  const round = (v) => (v > 0.8 && v < 2.5 ? Math.round(v * 1000) / 1000 : null);
  function formatHeight(h, unit = heightUnit()) {
    if (!h) return '';
    if (unit === 'cm') return `${Math.round(h * 100)} cm`;
    const inches = Math.round(h / 0.0254);
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
  }
  const stars = (n) => (n ? '★'.repeat(n) : '');

  // ---------------------------------------------------------------------------
  // Dance styles: each person has a level per style; a segment is rated by one style
  // ---------------------------------------------------------------------------
  /** Styles known to this segment, refreshed with the names from the roster file when available. */
  function projectStyles(p = api.project) {
    const list = (p.styles || []).map((x) => ({ ...x }));
    if (cache && cache.styles) {
      for (const g of cache.styles) { const own = list.find((x) => x.id === g.id); if (own) own.name = g.name; else list.push({ ...g }); }
    }
    return list;
  }
  function currentStyle(p = api.project) {
    const list = projectStyles(p);
    return list.find((x) => x.id === (p.settings && p.settings.danceStyle)) || list[0] || null;
  }
  /** The skill shown for a dancer in this segment (its rated style, or the old single skill). */
  function effectiveSkill(d, p = api.project) {
    const st = currentStyle(p);
    if (st && d.skills && d.skills[st.id] != null) return d.skills[st.id] || 0;
    return d.skill || 0;
  }

  // ---------------------------------------------------------------------------
  // Apply a roster to a project (segment)
  // ---------------------------------------------------------------------------
  /** Updates matching dancers (by roster link or name) and optionally adds the missing people. */
  function applyToProject(p, roster, { addMissing = true, colors = true } = {}) {
    const key = (s) => String(s || '').trim().toLowerCase();
    let updated = 0, added = 0;
    const S = p.stage;
    const newOnes = [];
    for (const m of roster.members) {
      if (!m.name || !m.name.trim()) continue;
      let d = p.dancers.find((x) => x.memberId === m.id) || p.dancers.find((x) => key(x.name) === key(m.name));
      if (!d) {
        if (!addMissing) continue;
        d = { id: api.uid(), name: m.name.trim(), color: m.color || '#3b82f6', shape: 'circle' };
        p.dancers.push(d);
        newOnes.push(d);
        added++;
      } else updated++;
      d.memberId = m.id;
      d.name = m.name.trim();
      d.gender = m.gender || '';
      d.skills = { ...(m.skills || {}) };
      d.skill = 0;
      d.height = m.height || null;
      if (colors && m.color) d.color = m.color;
    }
    // the segment keeps its own copy of the style names
    p.styles = projectStyles(p).map(({ id, name }) => ({ id, name }));
    // new people stand in a row along the front until they are placed
    newOnes.forEach((d, i) => {
      const per = Math.max(1, Math.min(newOnes.length, 9));
      const row = Math.floor(i / per), col = i % per;
      const x = (col - (per - 1) / 2) * (S.width / (per + 1));
      const y = S.depth / 2 - S.depth * 0.08 - row * (S.depth * 0.1);
      for (const f of p.formations) f.positions[d.id] = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    });
    return { updated, added };
  }

  // ---------------------------------------------------------------------------
  // Editor: roster card + profile of the selected dancers (Dancers tab)
  // ---------------------------------------------------------------------------
  async function renderEditor() {
    const card = $('#rosterCard'), prof = $('#dancerProfile');
    if (!card || !prof) return;
    const data = await load();
    // roster picker
    const sel = $('#rosterSelect');
    const keep = sel.value;
    sel.innerHTML = data.rosters.length ? data.rosters.map((r) => `<option value="${r.id}">${esc(r.name)} (${r.members.length})</option>`).join('') : '<option value="">No rosters yet</option>';
    if (data.rosters.some((r) => r.id === keep)) sel.value = keep;
    $('#btnApplyRoster').disabled = !data.rosters.length;
    const rb = $('#rateBy');
    const st = currentStyle();
    rb.innerHTML = projectStyles().map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    if (st) rb.value = st.id;
    $('#rosterHint').textContent = data.rosters.length ? 'Updates dancers with the same name (gender, skill, height, colour) and adds anyone missing.' : 'Create rosters on the Dashboard (Roster tab), then apply one here.';

    // profile for the selection
    const ids = [...api.state.selected];
    const ds = api.project.dancers.filter((d) => ids.includes(d.id));
    prof.innerHTML = '';
    const title = document.createElement('div'); title.className = 'card-title';
    title.textContent = ds.length ? `Profile · ${ds.length === 1 ? ds[0].name : ds.length + ' selected'}` : 'Profile';
    prof.appendChild(title);
    if (!ds.length) { const t = document.createElement('div'); t.className = 'muted small'; t.textContent = 'Select dancers to set gender, skill and height. These shape the dancers in the 3D view.'; prof.appendChild(t); return; }
    const same = (k) => (ds.every((d) => (d[k] || '') === (ds[0][k] || '')) ? ds[0][k] || '' : null);
    const grid = document.createElement('div'); grid.className = 'grid2';
    const mkSel = (label, opts, value, onChange) => {
      const l = document.createElement('label'); l.className = 'field';
      l.innerHTML = `<span>${label}</span><select>${value === null ? '<option value="__mixed">Mixed</option>' : ''}${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
      const s = l.querySelector('select'); s.value = value === null ? '__mixed' : String(value);
      s.addEventListener('change', () => { if (s.value !== '__mixed') onChange(s.value); });
      return l;
    };
    grid.appendChild(mkSel('Gender', GENDERS, same('gender'), (v) => setAll('gender', v)));
    prof.appendChild(grid);
    // skill per dance style
    const styles = projectStyles();
    const sk = document.createElement('div'); sk.className = 'style-skills';
    for (const st of styles) {
      const vals = ds.map((d) => (d.skills && d.skills[st.id] != null ? d.skills[st.id] : d.skill || 0));
      const v = vals.every((x) => x === vals[0]) ? String(vals[0]) : null;
      sk.appendChild(mkSel(`${esc(st.name)} skill`, SKILLS.map((t, i) => [String(i), t]), v, (nv) => setSkill(st.id, +nv)));
    }
    prof.appendChild(sk);
    const hl = document.createElement('label'); hl.className = 'field'; hl.style.marginTop = '8px';
    const hv = same('height');
    hl.innerHTML = `<span>Height</span><input type="text" placeholder="${heightUnit() === 'cm' ? 'e.g. 168 cm' : `e.g. 5'6"`}" spellcheck="false" />`;
    const hi = hl.querySelector('input');
    hi.value = hv === null ? '' : formatHeight(hv);
    if (hv === null) hi.placeholder = 'Mixed';
    hi.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') hi.blur(); });
    hi.addEventListener('change', () => {
      if (!hi.value.trim()) return setAll('height', null);
      const h = parseHeight(hi.value);
      if (h) setAll('height', h); else { hi.value = hv ? formatHeight(hv) : ''; alert(`Couldn't read that height. Try 5'6", 66 in, 168 cm or 1.68 m.`); }
    });
    prof.appendChild(hl);
    const linked = ds.filter((d) => d.memberId).length;
    if (linked) { const t = document.createElement('div'); t.className = 'muted small'; t.style.marginTop = '6px'; t.textContent = `${linked === ds.length ? (ds.length === 1 ? 'Linked' : 'All linked') : `${linked} linked`} to a roster — changes here (name, colour, gender, height, skills) also update the roster.`; prof.appendChild(t); }
  }
  /** Dancers linked to a roster person: copy their details back to the roster, so edits made in a segment stick. */
  async function pushToRoster(ids) {
    const data = await load();
    let changed = false;
    for (const d of api.project.dancers) {
      if (!d.memberId || (ids && !ids.includes(d.id))) continue;
      for (const r of data.rosters) {
        const m = r.members.find((x) => x.id === d.memberId);
        if (!m) continue;
        m.name = d.name; m.color = d.color; m.gender = d.gender || ''; m.height = d.height || null;
        m.skills = { ...(m.skills || {}), ...(d.skills || {}) };
        changed = true;
      }
    }
    if (changed) save();
    return changed;
  }

  function setSkill(styleId, v) {
    const ids = new Set(api.state.selected);
    api.mutate(() => {
      const p = api.project;
      p.styles = projectStyles(p).map(({ id, name }) => ({ id, name }));
      for (const d of p.dancers) if (ids.has(d.id)) { d.skills = { ...(d.skills || {}) }; d.skills[styleId] = v; }
    });
    pushToRoster([...ids]);
  }
  function setAll(k, v) {
    const ids = new Set(api.state.selected);
    api.mutate(() => { for (const d of api.project.dancers) if (ids.has(d.id)) d[k] = v; });
    pushToRoster([...ids]);
  }

  async function applySelected() {
    const data = await load();
    const r = data.rosters.find((x) => x.id === $('#rosterSelect').value);
    if (!r) return;
    const addMissing = $('#rosterAddMissing').checked;
    let res;
    api.mutate(() => { res = applyToProject(api.project, r, { addMissing }); });
    $('#rosterHint').textContent = `Applied “${r.name}”: ${res.updated} updated${addMissing ? `, ${res.added} added` : ''}.`;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  $('#btnApplyRoster').addEventListener('click', applySelected);
  $('#rateBy').addEventListener('change', (e) => api.mutate(() => {
    const p = api.project;
    p.styles = projectStyles(p).map(({ id, name }) => ({ id, name }));
    p.settings.danceStyle = e.target.value;
  }));

  window.StageRoster = { GENDERS, SKILLS, DEFAULT_HEIGHT, DEFAULT_STYLES, load, save, invalidate, parseHeight, formatHeight, heightUnit, stars, applyToProject, renderEditor,
    projectStyles, currentStyle, effectiveSkill, pushToRoster };
})();
