'use strict';
/* StageFlow on the web (GitHub Pages): stands in for the desktop app's native layer.
   The "library" is the team's StageFlow Cloud (Supabase): every set and segment lives in the cloud,
   so changes made by anyone on the team show up for everyone. Loads before app.js; does nothing in the
   desktop app (which provides window.stageflowNative itself) or when opened with ?local=1. */
(function () {
  if (window.stageflowNative) return;
  if (!/^https?:$/.test(location.protocol) || new URLSearchParams(location.search).has('local')) return;

  const BUCKET = 'stageflow-audio';
  const CFG_KEY = 'sf.cloudCfg';
  const listeners = { status: [], menu: [], close: [] };
  const emit = (k, ...a) => listeners[k].forEach((cb) => { try { cb(...a); } catch (e) { console.error(e); } });
  const api = () => window.__stageflow;

  // ---------------------------------------------------------------------------
  // Configuration: saved in this browser, or cloud.config.json published next to the app
  // ---------------------------------------------------------------------------
  let bundled = null, bundledTried = false;
  async function loadBundled() {
    if (bundledTried) return bundled;
    bundledTried = true;
    try { const r = await fetch('cloud.config.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.url && j.key) bundled = j; } } catch { /* none */ }
    return bundled;
  }
  async function getConfig() {
    try { const s = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); if (s && s.url && s.key) return { ...s, source: 'settings' }; } catch { /* ignore */ }
    const b = await loadBundled();
    return b ? { ...b, source: 'app' } : null;
  }

  let client = null, sbLoading = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }
  async function sb() {
    const cfg = await getConfig();
    if (!cfg) throw new Error('StageFlow Cloud is not set up yet.');
    if (!window.supabase) { sbLoading = sbLoading || loadScript('vendor/supabase.js'); await sbLoading; }
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'sf.auth' } });
      client.auth.onAuthStateChange(() => emit('status'));
    }
    return client;
  }
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const wrap = (fn) => async (...a) => { try { return { ok: true, value: await fn(...a) }; } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; } };

  async function currentUser() {
    if (!(await getConfig())) return null;
    const { data } = await (await sb()).auth.getSession();
    return data && data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
  }
  async function requireUser() { const u = await currentUser(); if (!u) throw new Error('Sign in first (top right).'); return u; }
  let team = null;
  async function teamStatus() {
    const u = await currentUser();
    if (!u) { team = null; return null; }
    try { team = chk(await (await sb()).rpc('team_status')); } catch (e) { team = { member: false, admin: false, hasAdmin: true, error: e.message }; }
    return team;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const setPath = (id) => `cloud:${id}`;
  const segPath = (setId, id) => `cloud:${setId}/${id}`;
  function parsePath(p) {
    const m = /^cloud:([0-9a-f-]{36})(?:\/([0-9a-f-]{36}))?$/i.exec(String(p || ''));
    if (!m) throw new Error('Not a cloud path');
    return { setId: m[1], segId: m[2] || null };
  }
  const isCloud = (p) => /^cloud:/.test(String(p || ''));
  const safeName = (n) => String(n || 'music').replace(/[^\w.\- ]+/g, '').trim().slice(0, 80) || 'music';
  async function sha1(str) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  async function blobToB64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const uuid = () => crypto.randomUUID();
  /** What this browser last loaded or saved for each segment: { version, audioHash, audioPath } */
  const known = new Map();

  function download(data, name, type = 'application/octet-stream') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function pick(accept, multiple = false) {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
      i.onchange = () => { resolve([...i.files]); i.remove(); };
      document.body.appendChild(i); i.click();
      // no reliable cancel event everywhere: resolve empty when the window regains focus without a choice
      window.addEventListener('focus', () => setTimeout(() => { if (!i.files || !i.files.length) { resolve([]); i.remove(); } }, 800), { once: true });
    });
  }

  // ---------------------------------------------------------------------------
  // Library = the team's cloud
  // ---------------------------------------------------------------------------
  async function summaries(setIds) {
    let q = (await sb()).from('segments').select('id, set_id, name, file_name, version, updated_at, audio_path, stage:data->stage, dancers:data->dancers, formations:data->formations, audio:data->audio');
    if (setIds) q = q.in('set_id', setIds);
    return chk(await q);
  }
  function segSummary(r) {
    const fsx = Array.isArray(r.formations) ? r.formations : [];
    return {
      file: r.id, path: segPath(r.set_id, r.id), name: r.name, stage: r.stage, dancers: r.dancers || [],
      formations: fsx.map((f) => ({ name: f.name, start: f.start, end: f.end, positions: f.positions })),
      duration: fsx.reduce((m, f) => Math.max(m, Number(f.end) || 0), 0), audioName: r.audio ? r.audio.name : null,
      modified: Date.parse(r.updated_at), ok: true
    };
  }
  let fingerprint = '';
  async function list() {
    const u = await currentUser();
    const out = { root: 'StageFlow Cloud', web: true, sets: [], signedIn: !!u, team: null };
    if (!u) return out;
    out.team = await teamStatus();
    const client = await sb();
    const sets = chk(await client.from('sets').select('id, name, meta, owner_id, updated_at, version'));
    const segs = await summaries();
    for (const s of sets) {
      const meta = s.meta || {};
      const mine = segs.filter((g) => g.set_id === s.id);
      const order = (meta.order || []).filter((id) => mine.some((g) => g.id === id));
      const ordered = [...order.map((id) => mine.find((g) => g.id === id)), ...mine.filter((g) => !order.includes(g.id)).sort((a, b) => a.name.localeCompare(b.name))];
      out.sets.push({
        dir: setPath(s.id), name: s.name, notes: meta.notes || '', created: meta.created || null, roster: meta.roster || null,
        cloud: { id: s.id, syncedAt: Date.now() }, mine: s.owner_id === u.id, modified: Date.parse(s.updated_at),
        segments: ordered.map(segSummary)
      });
    }
    out.sets.sort((a, b) => Math.max(b.modified, ...b.segments.map((g) => g.modified)) - Math.max(a.modified, ...a.segments.map((g) => g.modified)));
    fingerprint = JSON.stringify([sets.map((s) => [s.id, s.version]), segs.map((g) => [g.id, g.version])]);
    return out;
  }
  async function getSet(setId) { return chk(await (await sb()).from('sets').select('id, name, meta, version').eq('id', setId).single()); }
  async function saveMeta(setId, change) {
    const s = await getSet(setId);
    const meta = { ...(s.meta || {}) };
    const fields = {};
    if (change.name != null) fields.name = change.name;
    for (const k of ['notes', 'roster', 'order']) if (change[k] !== undefined) meta[k] = change[k];
    chk(await (await sb()).from('sets').update({ ...fields, meta, version: s.version + 1 }).eq('id', setId));
  }
  async function createSet(name) {
    await requireUser();
    const row = chk(await (await sb()).from('sets').insert({ name: name || 'Untitled set', meta: { order: [], notes: '', created: Date.now() } }).select('id').single());
    return { dir: setPath(row.id) };
  }
  async function updateSet({ dir, name, notes, roster }) { await saveMeta(parsePath(dir).setId, { name, notes, roster }); return true; }
  async function deleteSet(dir) {
    const { setId } = parsePath(dir);
    const client = await sb();
    const objs = chk(await client.from('segments').select('audio_path').eq('set_id', setId)).map((r) => r.audio_path).filter(Boolean);
    if (objs.length) await client.storage.from(BUCKET).remove(objs);
    const res = chk(await client.from('sets').delete().eq('id', setId).select('id'));
    if (!res.length) throw new Error('Only the person who made this set (or the team admin) can delete it.');
    return true;
  }

  /** Split a segment file into the row's data and its music. */
  async function splitText(text) {
    const obj = JSON.parse(text);
    const audio = obj.audio && obj.audio.data ? obj.audio : null;
    return { obj, data: { ...obj, audio: audio ? { name: audio.name, mime: audio.mime } : null }, audio, audioHash: audio ? await sha1(audio.data) : null };
  }
  async function uploadAudio(setId, segId, audio) {
    const p = `${setId}/${segId}/${safeName(audio.name)}`;
    const up = await (await sb()).storage.from(BUCKET).upload(p, b64ToBytes(audio.data), { contentType: audio.mime || 'audio/mpeg', upsert: true });
    if (up.error) throw new Error(`Music upload failed: ${up.error.message}`);
    return p;
  }
  async function insertSegment(setId, text, nameOverride) {
    const { obj, data, audio, audioHash } = await splitText(text);
    const id = uuid();
    const name = nameOverride || obj.name || 'Segment';
    if (nameOverride) data.name = nameOverride;
    const audioPath = audio ? await uploadAudio(setId, id, audio) : null;
    const row = chk(await (await sb()).from('segments').insert({ id, set_id: setId, name, file_name: `${name}.stageflow`, data, audio_path: audioPath, audio_hash: audioHash }).select('id, version').single());
    known.set(id, { version: row.version, audioHash, audioPath });
    return id;
  }
  async function addToOrder(setId, segId, afterId) {
    const s = await getSet(setId);
    const order = ((s.meta || {}).order || []).filter((x) => x !== segId);
    const i = afterId ? order.indexOf(afterId) : -1;
    order.splice(i < 0 ? order.length : i + 1, 0, segId);
    await saveMeta(setId, { order });
  }
  async function createSegment({ dir, name, text }) {
    const { setId } = parsePath(dir);
    const id = await insertSegment(setId, text, name);
    await addToOrder(setId, id);
    return { filePath: segPath(setId, id) };
  }
  async function importSegments(dir) {
    const files = await pick('.stageflow,application/json', true);
    const out = [];
    for (const f of files) out.push((await createSegment({ dir, name: f.name.replace(/\.[^.]+$/, ''), text: await f.text() })).filePath);
    return out;
  }
  async function readSegment(file) {
    const { setId, segId } = parsePath(file);
    const client = await sb();
    const row = chk(await client.from('segments').select('*').eq('id', segId).single());
    let audio = null;
    if (row.audio_path) {
      const dl = await client.storage.from(BUCKET).download(row.audio_path);
      if (!dl.error) audio = { name: (row.data.audio && row.data.audio.name) || 'music', mime: (row.data.audio && row.data.audio.mime) || 'audio/mpeg', data: await blobToB64(dl.data) };
    }
    known.set(segId, { version: row.version, audioHash: row.audio_hash || null, audioPath: row.audio_path || null });
    return { filePath: segPath(setId, segId), text: JSON.stringify({ ...row.data, audio }) };
  }
  /** Save a segment. If a teammate saved it first, ours is kept as a separate "(my edits)" segment. */
  async function writeSegment({ file, text }) {
    const { setId, segId } = parsePath(file);
    const client = await sb();
    const k = known.get(segId) || chk(await client.from('segments').select('version, audio_hash, audio_path').eq('id', segId).single());
    const rec = known.get(segId) || { version: k.version, audioHash: k.audio_hash, audioPath: k.audio_path };
    const { obj, data, audio, audioHash } = await splitText(text);
    let audioPath = rec.audioPath;
    if (audio && audioHash !== rec.audioHash) audioPath = await uploadAudio(setId, segId, audio);
    if (!audio) audioPath = null;
    const res = chk(await client.from('segments').update({ name: obj.name || 'Segment', data, audio_path: audioPath, audio_hash: audioHash, version: rec.version + 1 })
      .eq('id', segId).eq('version', rec.version).select('version'));
    if (res.length) { known.set(segId, { version: res[0].version, audioHash, audioPath }); return { filePath: file }; }
    // conflict: someone saved a newer version while we were editing
    const name = `${obj.name || 'Segment'} (my edits)`;
    const id = await insertSegment(setId, JSON.stringify({ ...obj, name }), name);
    await addToOrder(setId, id, segId);
    window.dispatchEvent(new CustomEvent('sf-web-conflict', { detail: { name: obj.name, copy: name } }));
    return { filePath: segPath(setId, id), conflict: true, name };
  }
  async function duplicateSegment(file) {
    const { setId, segId } = parsePath(file);
    const r = await readSegment(file);
    const p = JSON.parse(r.text);
    const id = await insertSegment(setId, JSON.stringify(p), `${p.name || 'Segment'} (copy)`);
    await addToOrder(setId, id, segId);
    return { filePath: segPath(setId, id) };
  }
  async function renameSegment({ file, name }) {
    const { segId } = parsePath(file);
    const client = await sb();
    const row = chk(await client.from('segments').select('data, version').eq('id', segId).single());
    chk(await client.from('segments').update({ name, data: { ...row.data, name }, version: row.version + 1 }).eq('id', segId));
    if (known.has(segId)) known.get(segId).version = row.version + 1;
    return true;
  }
  async function deleteSegment(file) {
    const { setId, segId } = parsePath(file);
    const client = await sb();
    const row = chk(await client.from('segments').select('audio_path').eq('id', segId).maybeSingle());
    if (row && row.audio_path) await client.storage.from(BUCKET).remove([row.audio_path]);
    chk(await client.from('segments').delete().eq('id', segId));
    const s = await getSet(setId);
    await saveMeta(setId, { order: ((s.meta || {}).order || []).filter((x) => x !== segId) });
    return true;
  }
  async function moveSegment({ file, toDir, index }) {
    const { setId, segId } = parsePath(file);
    const to = parsePath(toDir).setId;
    const client = await sb();
    if (to !== setId) {
      chk(await client.from('segments').update({ set_id: to }).eq('id', segId));
      const s = await getSet(setId);
      await saveMeta(setId, { order: ((s.meta || {}).order || []).filter((x) => x !== segId) });
    }
    const t = await getSet(to);
    const ids = (await summaries([to])).map((g) => g.id);
    const base = ((t.meta || {}).order || []).filter((x) => ids.includes(x));
    const order = [...base, ...ids.filter((x) => !base.includes(x))].filter((x) => x !== segId);
    order.splice(Math.max(0, Math.min(index ?? order.length, order.length)), 0, segId);
    await saveMeta(to, { order });
    return { filePath: segPath(to, segId) };
  }
  async function loadRosters() {
    const u = await currentUser();
    if (!u) { try { return JSON.parse(localStorage.getItem('sf.rosters') || 'null') || { rosters: [] }; } catch { return { rosters: [] }; } }
    const row = chk(await (await sb()).from('user_data').select('rosters').eq('user_id', u.id).maybeSingle());
    return row ? row.rosters : { rosters: [] };
  }
  async function saveRosters(data) {
    const u = await currentUser();
    if (!u) { localStorage.setItem('sf.rosters', JSON.stringify(data)); return true; }
    chk(await (await sb()).from('user_data').upsert({ user_id: u.id, rosters: data, updated_at: new Date().toISOString() }));
    return true;
  }

  // ---------------------------------------------------------------------------
  // "Sync" on the web = notice what teammates changed (every few seconds) so the open segment and
  // the dashboard can refresh live
  // ---------------------------------------------------------------------------
  let lastCheck = null;
  async function syncAll({ busy = [] } = {}) {
    const u = await currentUser();
    if (!u) return { signedIn: false };
    const client = await sb();
    const sets = chk(await client.from('sets').select('id, version'));
    const segs = chk(await client.from('segments').select('id, set_id, version'));
    const fp = JSON.stringify([sets.map((s) => [s.id, s.version]), segs.map((g) => [g.id, g.version])]);
    const updatedFiles = [];
    for (const g of segs) {
      const k = known.get(g.id);
      const p = segPath(g.set_id, g.id);
      if (k && k.version !== g.version && !busy.includes(p)) updatedFiles.push(p);
    }
    const changed = fingerprint && fp !== fingerprint;
    fingerprint = fp;
    lastCheck = Date.now();
    emit('status');
    return { sets: [{ dir: 'cloud:', downloaded: changed ? 1 : 0, updatedFiles }], rostersChanged: false, web: true };
  }

  // ---------------------------------------------------------------------------
  // Team + dancer portal (shared with the desktop app's cloud API)
  // ---------------------------------------------------------------------------
  async function teamInfo() {
    const st = await teamStatus();
    let members = [];
    if (st && st.member) members = chk(await (await sb()).from('app_members').select('email, role, added_at').order('added_at'));
    return { ...(st || {}), members };
  }
  async function rpc(fn, args) { return chk(await (await sb()).rpc(fn, args)); }

  // ---------------------------------------------------------------------------
  // The native API
  // ---------------------------------------------------------------------------
  const native = {
    platform: 'web',
    web: true,
    openProject: async () => { const [f] = await pick('.stageflow,application/json'); return f ? { filePath: null, text: await f.text() } : null; },
    saveProject: async ({ filePath, text, saveAs, suggestedName }) => {
      if (isCloud(filePath) && !saveAs) return writeSegment({ file: filePath, text });
      download(text, suggestedName || 'Untitled.stageflow', 'application/json');
      return { filePath: filePath || null };
    },
    openAudio: async () => { const [f] = await pick('audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac'); return f ? { name: f.name, data: await blobToB64(f) } : null; },
    openVideo: async () => { const [f] = await pick('video/*,.mp4,.mov,.webm,.m4v'); return f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null; },
    openPdf: async () => { const [f] = await pick('application/pdf,.pdf'); return f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null; },
    captureStage: async ({ suggestedName }) => {
      // draw the formation at the playhead (no screen capture in a browser)
      const A = api(), c = document.createElement('canvas');
      c.width = 3200; c.height = 2000;
      const ctx = c.getContext('2d'); ctx.scale(2, 2);
      const pos = {}; for (const d of A.project.dancers) pos[d.id] = A.dancerPos(d.id, A.state.time);
      const fi = A.panelFormationIndex();
      StageRender.drawStage(ctx, 1600, 1000, A.project, pos, { theme: 'dark', showNames: true, formation: A.formations()[fi], title: A.project.name, subtitle: A.formations()[fi] ? A.formations()[fi].name : '' });
      await new Promise((res) => c.toBlob((b) => { download(b, suggestedName || 'formation.png'); res(); }, 'image/png'));
      return { filePath: suggestedName };
    },
    saveBinary: async ({ data, suggestedName }) => { download(new Blob([data]), suggestedName); return { filePath: suggestedName }; },
    printPdf: async ({ html }) => {
      // print through a hidden frame; choose "Save as PDF" in the print window
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      f.srcdoc = html;
      await new Promise((r) => { f.onload = r; });
      await new Promise((r) => setTimeout(r, 300));
      f.contentWindow.focus(); f.contentWindow.print();
      setTimeout(() => f.remove(), 60000);
      return { filePath: 'print' };
    },
    reveal: () => {},
    library: {
      list: () => list(), createSet, updateSet, deleteSet, createSegment, importSegments, duplicateSegment, renameSegment, deleteSegment, moveSegment,
      read: readSegment, writeSegment, loadRosters, saveRosters, chooseRoot: async () => null
    },
    cloud: {
      getConfig: wrap(async () => { const c = await getConfig(); return c ? { url: c.url, source: c.source, hasKey: !!c.key } : null; }),
      setConfig: wrap(async ({ url, key } = {}) => {
        if (!url) { localStorage.removeItem(CFG_KEY); client = null; return true; }
        if (!/^https?:\/\/.+/.test(url) || !key) throw new Error('Enter the project URL (https://….supabase.co) and the publishable (anon) key.');
        localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), key: key.trim() }));
        client = null; emit('status'); return true;
      }),
      status: wrap(async () => {
        const cfg = await getConfig();
        let user = null, error = null;
        try { user = await currentUser(); } catch (e) { error = e.message; }
        const t = user ? await teamStatus() : null;
        return { configured: !!cfg, configSource: cfg ? cfg.source : null, url: cfg ? cfg.url : '', user, syncing: false, lastSync: lastCheck, error, web: true, team: t };
      }),
      sendCode: wrap(async (email) => { const { error } = await (await sb()).auth.signInWithOtp({ email: String(email).trim(), options: { shouldCreateUser: true } }); if (error) throw new Error(error.message); return true; }),
      verifyCode: wrap(async ({ email, code }) => {
        const { data, error } = await (await sb()).auth.verifyOtp({ email: String(email).trim(), token: String(code).trim(), type: 'email' });
        if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired — send a new one.' : error.message);
        emit('status'); return { email: data.user.email };
      }),
      signOut: wrap(async () => { try { await (await sb()).auth.signOut(); } catch { /* offline */ } known.clear(); emit('status'); return true; }),
      listSets: wrap(async () => {
        const u = await requireUser();
        const sets = chk(await (await sb()).from('sets').select('id, name, owner_id, updated_at'));
        return sets.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updated_at, mine: s.owner_id === u.id, members: [], segments: 0, localDir: setPath(s.id) }));
      }),
      uploadSet: wrap(async () => true), downloadSet: wrap(async () => true), unlinkSet: wrap(async () => true),
      deleteSet: wrap(async (id) => deleteSet(setPath(id))),
      members: wrap(async () => []), addMember: wrap(async () => []), removeMember: wrap(async () => []),
      syncAll: wrap(syncAll),
      team: wrap(teamInfo),
      claimAdmin: wrap(async () => rpc('claim_admin')),
      teamAdd: wrap(async ({ email, admin }) => { await rpc('team_add', { member_email: email, make_admin: !!admin }); return teamInfo(); }),
      teamRemove: wrap(async (email) => { await rpc('team_remove', { member_email: email }); return teamInfo(); }),
      portalLink: wrap(async ({ id, reset }) => ({ token: await rpc('portal_link', { sid: id, reset: !!reset }), config: await getConfig() })),
      portalStop: wrap(async (id) => { await rpc('portal_stop', { sid: id }); return true; }),
      onStatus: (cb) => listeners.status.push(cb)
    },
    confirmUnsaved: async () => (confirm('You have unsaved changes. Save them first?\n\nOK = save · Cancel = more choices') ? 'save'
      : confirm('Discard your unsaved changes?\n\nOK = discard · Cancel = go back') ? 'discard' : 'cancel'),
    setTitle: (t) => { document.title = t; },
    confirmClose: () => {},
    popupMenu: ({ x, y }) => webMenu(x, y),
    onMenu: (cb) => listeners.menu.push(cb),
    onOpenFile: () => {},
    onCloseRequested: (cb) => listeners.close.push(cb)
  };

  // the ☰ menu (the desktop app uses its native menu)
  function webMenu(x, y) {
    document.querySelectorAll('.ctx-menu.web-menu').forEach((m) => m.remove());
    const items = [['Dashboard', 'home', 'Ctrl+H'], ['New segment', 'new', 'Ctrl+N'], ['Open segment file…', 'open', 'Ctrl+O'], ['Save', 'save', 'Ctrl+S'], ['Download a copy…', 'saveAs', 'Ctrl+Shift+S'], null,
      ['Load music…', 'loadAudio', ''], ['Import formations from PDF…', 'importPdf', ''], ['Export…', 'export', 'Ctrl+E'], null, ['Undo', 'undo', 'Ctrl+Z'], ['Redo', 'redo', 'Ctrl+Shift+Z'], null, ['Keyboard shortcuts', 'help', '']];
    const m = document.createElement('div');
    m.className = 'ctx-menu web-menu';
    for (const it of items) {
      if (!it) { const s = document.createElement('div'); s.className = 'ctx-sep'; m.appendChild(s); continue; }
      const b = document.createElement('button');
      b.innerHTML = '<span></span><kbd></kbd>';
      b.firstChild.textContent = it[0]; b.lastChild.textContent = it[2];
      b.onclick = () => { m.remove(); emit('menu', it[1]); };
      m.appendChild(b);
    }
    m.style.left = `${x}px`; m.style.top = `${y}px`;
    document.body.appendChild(m);
    setTimeout(() => window.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); window.removeEventListener('mousedown', off, true); } }, true), 0);
  }

  window.addEventListener('beforeunload', (e) => {
    const A = api();
    if (A && A.state && A.state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  window.stageflowNative = native;
  document.documentElement.classList.add('platform-web');
})();
