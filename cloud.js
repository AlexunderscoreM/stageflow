/* StageFlow Cloud — runs in the Electron main process.
   Choreographers sign in with an emailed code; sets are synced two ways between the local library
   folder and a Supabase project (see cloud/schema.sql and docs/cloud-setup.md).

   Local state for a cloud set lives in its set.json under "cloud":
     { id, version, metaHash, segments: { <cloud segment id>: { file, version, hash, audioHash } } }
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // Electron's main-process Node has no built-in WebSocket (needed by supabase-js)

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const BUCKET = 'stageflow-audio';

function createCloud({ app, safeStorage, shell, libraryRoot, readSet, writeSet, safeName, uniquePath, emit }) {
  const userData = app.getPath('userData');
  const cfgFile = path.join(userData, 'cloud.json');
  const sessFile = path.join(userData, 'cloud-session.bin');
  const stateFile = path.join(userData, 'cloud-state.json');

  // ---------------------------------------------------------------------------
  // Configuration: env (tests) → cloud.config.json shipped with the app → settings saved by the user
  // ---------------------------------------------------------------------------
  function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } }
  function getConfig() {
    if (process.env.STAGEFLOW_CLOUD_URL && process.env.STAGEFLOW_CLOUD_KEY) return { url: process.env.STAGEFLOW_CLOUD_URL, key: process.env.STAGEFLOW_CLOUD_KEY, source: 'env' };
    const saved = readJson(cfgFile, null);
    if (saved && saved.url && saved.key) return { ...saved, source: 'settings' };
    const bundled = readJson(path.join(__dirname, 'cloud.config.json'), null);
    if (bundled && bundled.url && bundled.key) return { ...bundled, source: 'app' };
    return null;
  }
  function setConfig({ url, key }) {
    if (!url) { fs.rmSync(cfgFile, { force: true }); client = null; return true; }
    if (!/^https?:\/\/.+/.test(url) || !key) throw new Error('Enter the project URL (https://….supabase.co) and the publishable (anon) key.');
    fs.writeFileSync(cfgFile, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), key: key.trim() }, null, 2));
    client = null;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Session storage: encrypted with the OS keychain when available
  // ---------------------------------------------------------------------------
  const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
  function loadSess() {
    try {
      const buf = fs.readFileSync(sessFile);
      const txt = buf[0] === 0x7b /* { */ ? buf.toString('utf8') : safeStorage.decryptString(buf);
      return JSON.parse(txt);
    } catch { return {}; }
  }
  function saveSess(obj) {
    const txt = JSON.stringify(obj);
    if (canEncrypt()) fs.writeFileSync(sessFile, safeStorage.encryptString(txt));
    else fs.writeFileSync(sessFile, txt, { mode: 0o600 });
  }
  const storage = {
    getItem: (k) => { const v = loadSess()[k]; return v === undefined ? null : v; },
    setItem: (k, v) => { const s = loadSess(); s[k] = v; saveSess(s); },
    removeItem: (k) => { const s = loadSess(); delete s[k]; saveSess(s); }
  };

  let client = null;
  function sb() {
    const cfg = getConfig();
    if (!cfg) throw new Error('StageFlow Cloud is not set up yet.');
    if (!client) {
      client = createClient(cfg.url, cfg.key, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }, realtime: { transport: WebSocket } });
      client.auth.onAuthStateChange(() => emit('cloud:status'));
    }
    return client;
  }

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------
  let syncing = false, lastSync = readJson(stateFile, {}).lastSync || null, lastError = null;
  async function currentUser() {
    if (!getConfig()) return null;
    const { data } = await sb().auth.getSession();
    return data && data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
  }
  async function status() {
    const cfg = getConfig();
    let user = null;
    try { user = await currentUser(); } catch (e) { lastError = e.message; }
    let team = null;
    if (user) { try { team = chk(await sb().rpc('team_status')); } catch { /* older schema or offline */ } }
    return { configured: !!cfg, configSource: cfg ? cfg.source : null, url: cfg ? cfg.url : '', user, syncing, lastSync, error: lastError, team };
  }
  async function sendCode(email) {
    const { error } = await sb().auth.signInWithOtp({ email: String(email).trim(), options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
    return true;
  }
  async function verifyCode(email, code) {
    const { data, error } = await sb().auth.verifyOtp({ email: String(email).trim(), token: String(code).trim(), type: 'email' });
    if (error) throw new Error(error.message.includes('expired') || error.message.includes('invalid') ? 'That code is wrong or has expired — send a new one.' : error.message);
    emit('cloud:status');
    return { email: data.user.email };
  }
  async function signOut() {
    try { await sb().auth.signOut(); } catch { /* offline: still forget locally */ }
    fs.rmSync(sessFile, { force: true });
    client = null;
    emit('cloud:status');
    return true;
  }
  async function requireUser() {
    const u = await currentUser();
    if (!u) throw new Error('Sign in to StageFlow Cloud first.');
    return u;
  }
  const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  // ---------------------------------------------------------------------------
  // Sets in the cloud
  // ---------------------------------------------------------------------------
  function localSets() {
    const root = libraryRoot();
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(root, e.name));
  }
  function rawSet(dir) { return readJson(path.join(dir, 'set.json'), {}); }
  function saveRawSet(dir, meta) { fs.writeFileSync(path.join(dir, 'set.json'), JSON.stringify(meta, null, 2)); }

  async function listCloudSets() {
    const u = await requireUser();
    const sets = chk(await sb().from('sets').select('id, name, owner_id, updated_at, version'));
    const members = chk(await sb().from('set_members').select('set_id, email'));
    const segs = chk(await sb().from('segments').select('set_id'));
    const local = new Map(localSets().map((d) => [rawSet(d).cloud && rawSet(d).cloud.id, d]).filter(([k]) => k));
    return sets.map((s) => ({
      id: s.id, name: s.name, updatedAt: s.updated_at, mine: s.owner_id === u.id,
      members: members.filter((m) => m.set_id === s.id).map((m) => m.email),
      segments: segs.filter((g) => g.set_id === s.id).length,
      localDir: local.get(s.id) || null
    }));
  }

  async function uploadSet(dir) {
    await requireUser();
    const meta = rawSet(dir);
    if (meta.cloud && meta.cloud.id) return syncSet(dir);
    const ins = await sb().from('sets').insert({ name: meta.name || path.basename(dir), meta: { notes: meta.notes || '', order: [] } }).select('id, version').single();
    if (ins.error && ins.error.code === '42501') throw new Error('You’re not on this StageFlow team yet — ask the team admin to add your email (Account → Your team).');
    const row = chk(ins);
    meta.cloud = { id: row.id, version: row.version, metaHash: null, segments: {} };
    saveRawSet(dir, meta);
    return syncSet(dir);
  }

  async function downloadSet(cloudId) {
    await requireUser();
    const s = chk(await sb().from('sets').select('id, name').eq('id', cloudId).single());
    const existing = localSets().find((d) => (rawSet(d).cloud || {}).id === cloudId);
    if (existing) return syncSet(existing);
    const dir = uniquePath(libraryRoot(), safeName(s.name), '');
    fs.mkdirSync(dir);
    saveRawSet(dir, { name: s.name, order: [], created: Date.now(), cloud: { id: cloudId, version: 0, metaHash: null, segments: {} } });
    return syncSet(dir);
  }

  /** Stop syncing a local set (keeps the files and the cloud copy). */
  function unlinkSet(dir) { const m = rawSet(dir); delete m.cloud; saveRawSet(dir, m); return true; }

  async function deleteCloudSet(cloudId) {
    await requireUser();
    const objs = chk(await sb().from('segments').select('audio_path').eq('set_id', cloudId)).map((r) => r.audio_path).filter(Boolean);
    if (objs.length) await sb().storage.from(BUCKET).remove(objs);
    chk(await sb().from('sets').delete().eq('id', cloudId));
    for (const d of localSets()) if ((rawSet(d).cloud || {}).id === cloudId) unlinkSet(d);
    return true;
  }

  async function members(cloudId) { await requireUser(); return chk(await sb().from('set_members').select('email, added_at').eq('set_id', cloudId)).map((m) => m.email); }
  async function addMember(cloudId, email) {
    await requireUser();
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That doesn’t look like an email address.');
    const { error } = await sb().from('set_members').insert({ set_id: cloudId, email: e });
    if (error && error.code !== '23505') throw new Error(error.code === '42501' ? 'Only the person who uploaded this set can invite choreographers.' : error.message); // 23505 = already invited
    return members(cloudId);
  }
  async function removeMember(cloudId, email) { await requireUser(); chk(await sb().from('set_members').delete().eq('set_id', cloudId).eq('email', email)); return members(cloudId); }

  // ---------------------------------------------------------------------------
  // Segment files <-> rows
  // ---------------------------------------------------------------------------
  function splitSegment(text) {
    const obj = JSON.parse(text);
    const audio = obj.audio && obj.audio.data ? obj.audio : null;
    const data = { ...obj, audio: audio ? { name: audio.name, mime: audio.mime } : null };
    return { obj, data, audio, audioHash: audio ? sha1(audio.data) : null };
  }

  async function pushSegment(setId, file, rec, id) {
    const text = fs.readFileSync(file, 'utf8');
    const { obj, data, audio, audioHash } = splitSegment(text);
    let audioPath = rec ? rec.audioPath || null : null;
    if (audio && (!rec || rec.audioHash !== audioHash)) {
      audioPath = `${setId}/${id}/${safeName(audio.name || 'music')}`;
      const up = await sb().storage.from(BUCKET).upload(audioPath, Buffer.from(audio.data, 'base64'), { contentType: audio.mime || 'audio/mpeg', upsert: true });
      if (up.error) throw new Error(`Music upload failed: ${up.error.message}`);
    }
    if (!audio) audioPath = null;
    const fields = { name: obj.name || path.basename(file, '.stageflow'), file_name: path.basename(file), data, audio_path: audioPath, audio_hash: audioHash };
    let row;
    if (!rec) {
      row = chk(await sb().from('segments').insert({ id, set_id: setId, ...fields }).select('id, version').single());
    } else {
      const res = chk(await sb().from('segments').update({ ...fields, version: rec.version + 1 }).eq('id', id).eq('version', rec.version).select('id, version'));
      if (!res.length) return null; // someone else saved a newer version first
      row = res[0];
    }
    return { file: path.basename(file), version: row.version, hash: sha1(text), audioHash, audioPath };
  }

  async function pullSegment(dir, row, fileName, localAudio) {
    let audio = null;
    if (row.audio_path) {
      if (localAudio && localAudio.hash === row.audio_hash) audio = localAudio.audio;
      else {
        const dl = await sb().storage.from(BUCKET).download(row.audio_path);
        if (dl.error) throw new Error(`Music download failed: ${dl.error.message}`);
        const b64 = Buffer.from(await dl.data.arrayBuffer()).toString('base64');
        audio = { name: (row.data.audio && row.data.audio.name) || path.basename(row.audio_path), mime: (row.data.audio && row.data.audio.mime) || 'audio/mpeg', data: b64 };
      }
    }
    const text = JSON.stringify({ ...row.data, audio });
    const file = path.join(dir, fileName);
    fs.writeFileSync(file, text, 'utf8');
    return { file: fileName, version: row.version, hash: sha1(text), audioHash: row.audio_hash || null, audioPath: row.audio_path || null };
  }

  function localAudioOf(file) {
    try { const { audio, audioHash } = splitSegment(fs.readFileSync(file, 'utf8')); return audio ? { audio, hash: audioHash } : null; } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // Two-way sync of one set
  // ---------------------------------------------------------------------------
  async function syncSet(dir, { busy = [] } = {}) {
    const meta = rawSet(dir);
    const C = meta.cloud;
    if (!C || !C.id) throw new Error('This set is not in the cloud yet.');
    const setId = C.id;
    const out = { dir, uploaded: 0, downloaded: 0, deleted: 0, conflicts: [], skipped: [], updatedFiles: [] };
    const busySet = new Set(busy.map((f) => path.resolve(f)));
    const isBusy = (fileName) => busySet.has(path.resolve(path.join(dir, fileName)));

    const setRow = (await sb().from('sets').select('id, name, meta, version').eq('id', setId).maybeSingle()).data;
    if (!setRow) { // gone from the cloud (deleted, or access removed): keep the local copy, stop syncing
      delete meta.cloud; saveRawSet(dir, meta);
      out.removedFromCloud = true;
      return out;
    }
    const rows = chk(await sb().from('segments').select('id, version, name, file_name, audio_hash, audio_path').eq('set_id', setId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const recs = C.segments || {};
    const files = fs.readdirSync(dir).filter((f) => /\.stageflow$/i.test(f));
    const known = new Set(Object.values(recs).map((r) => r.file));
    const fullRow = async (id) => chk(await sb().from('segments').select('*').eq('id', id).single());
    const gone = new Set(); // deleted during this sync

    // 1) segments we have synced before
    for (const [id, rec] of Object.entries({ ...recs })) {
      const file = path.join(dir, rec.file);
      const exists = fs.existsSync(file);
      const row = byId.get(id);
      if (isBusy(rec.file)) { out.skipped.push(rec.file); continue; }
      const localChanged = exists && sha1(fs.readFileSync(file, 'utf8')) !== rec.hash;
      if (!row) {
        // deleted in the cloud
        if (exists && !localChanged) { await shell.trashItem(file); out.deleted++; }
        delete recs[id];                              // a changed local copy becomes a new segment below
        continue;
      }
      const cloudChanged = row.version !== rec.version;
      if (!exists) {
        if (!cloudChanged) {
          if (row.audio_path) await sb().storage.from(BUCKET).remove([row.audio_path]);
          chk(await sb().from('segments').delete().eq('id', id));
          delete recs[id]; gone.add(id); out.deleted++;
        } else { recs[id] = await pullSegment(dir, await fullRow(id), rec.file, null); out.downloaded++; out.updatedFiles.push(path.join(dir, rec.file)); }
        continue;
      }
      if (localChanged && !cloudChanged) {
        const r = await pushSegment(setId, file, rec, id);
        if (r) { recs[id] = r; out.uploaded++; continue; }
      }
      if (!localChanged && cloudChanged) {
        recs[id] = await pullSegment(dir, await fullRow(id), rec.file, localAudioOf(file));
        out.downloaded++; out.updatedFiles.push(file);
        continue;
      }
      if (localChanged) {
        // both sides changed: keep my version as its own segment, take the cloud version in place
        const base = path.basename(rec.file, '.stageflow');
        const mine = uniquePath(dir, `${base} (my edits)`, '.stageflow');
        const p = JSON.parse(fs.readFileSync(file, 'utf8'));
        p.name = `${p.name || base} (my edits)`;
        fs.writeFileSync(mine, JSON.stringify(p), 'utf8');
        recs[id] = await pullSegment(dir, await fullRow(id), rec.file, localAudioOf(file));
        out.conflicts.push({ name: row.name, copy: path.basename(mine) });
        out.updatedFiles.push(file);
        known.delete(path.basename(mine));
      }
    }

    // 2) new local files → upload
    for (const f of fs.readdirSync(dir).filter((x) => /\.stageflow$/i.test(x))) {
      if (Object.values(recs).some((r) => r.file === f) || isBusy(f)) continue;
      const id = crypto.randomUUID();
      recs[id] = await pushSegment(setId, path.join(dir, f), null, id);
      out.uploaded++;
    }

    // 3) new cloud segments → download
    for (const row of rows) {
      if (recs[row.id] || gone.has(row.id)) continue;
      const want = row.file_name && /\.stageflow$/i.test(row.file_name) ? row.file_name.replace(/\.stageflow$/i, '') : safeName(row.name);
      const target = fs.existsSync(path.join(dir, `${want}.stageflow`)) ? path.basename(uniquePath(dir, want, '.stageflow')) : `${want}.stageflow`;
      recs[row.id] = await pullSegment(dir, await fullRow(row.id), target, null);
      out.downloaded++; out.updatedFiles.push(path.join(dir, target));
    }

    // 4) set name / notes / running order (order is stored as cloud segment ids)
    const fileToId = new Map(Object.entries(recs).map(([id, r]) => [r.file, id]));
    const idToFile = new Map(Object.entries(recs).map(([id, r]) => [id, r.file]));
    const localMeta = { name: meta.name || path.basename(dir), notes: meta.notes || '', order: (meta.order || []).map((f) => fileToId.get(f)).filter(Boolean) };
    const metaHash = sha1(JSON.stringify(localMeta));
    const localMetaChanged = metaHash !== C.metaHash;
    const cloudMetaChanged = setRow.version !== C.version;
    const applyCloudMeta = () => {
      const m = setRow.meta || {};
      meta.name = setRow.name;
      meta.notes = m.notes || '';
      const ordered = (m.order || []).map((id) => idToFile.get(id)).filter(Boolean);
      const rest = (meta.order || []).filter((f) => !ordered.includes(f) && files.concat(Object.values(recs).map((r) => r.file)).includes(f));
      meta.order = [...ordered, ...rest];
    };
    if (localMetaChanged && !cloudMetaChanged) {
      const res = chk(await sb().from('sets').update({ name: localMeta.name, meta: { ...(setRow.meta || {}), notes: localMeta.notes, order: localMeta.order }, version: setRow.version + 1 })
        .eq('id', setId).eq('version', setRow.version).select('version'));
      if (res.length) C.version = res[0].version; else applyCloudMeta();
    } else if (cloudMetaChanged) {
      applyCloudMeta();
      C.version = setRow.version;
    }
    // new segments that the order doesn't mention go at the end
    for (const r of Object.values(recs)) if (!(meta.order || []).includes(r.file)) (meta.order = meta.order || []).push(r.file);
    meta.order = (meta.order || []).filter((f) => fs.existsSync(path.join(dir, f)));
    C.metaHash = sha1(JSON.stringify({ name: meta.name, notes: meta.notes || '', order: meta.order.map((f) => fileToId.get(f) || Object.entries(recs).find(([, r]) => r.file === f)?.[0]).filter(Boolean) }));
    C.segments = recs;
    C.syncedAt = Date.now();
    meta.cloud = C;
    saveRawSet(dir, meta);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Rosters follow the account (last change wins, rosters merged by id)
  // ---------------------------------------------------------------------------
  async function syncRosters(u) {
    const file = path.join(libraryRoot(), 'rosters.json');
    const st = readJson(stateFile, {});
    const local = readJson(file, null);
    const localHash = local ? sha1(JSON.stringify(local)) : null;
    const row = (await sb().from('user_data').select('rosters, updated_at').eq('user_id', u.id).maybeSingle()).data;
    const cloudChanged = row && row.updated_at !== st.rostersCloudAt;
    const localChanged = local && localHash !== st.rostersHash;
    let result = local;
    if (!row && local) {
      chk(await sb().from('user_data').insert({ rosters: local }));
    } else if (row && (cloudChanged || !local)) {
      result = row.rosters;
      if (localChanged && local) { // merge: keep rosters / styles that only exist here
        const ids = new Set((result.rosters || []).map((r) => r.id));
        result = { ...result, rosters: [...(result.rosters || []), ...(local.rosters || []).filter((r) => !ids.has(r.id))] };
        const sids = new Set((result.styles || []).map((s) => s.id));
        result.styles = [...(result.styles || []), ...((local.styles || []).filter((s) => !sids.has(s.id)))];
        chk(await sb().from('user_data').update({ rosters: result, updated_at: new Date().toISOString() }).eq('user_id', u.id));
      }
      fs.writeFileSync(file, JSON.stringify(result, null, 2));
    } else if (row && localChanged) {
      chk(await sb().from('user_data').update({ rosters: local, updated_at: new Date().toISOString() }).eq('user_id', u.id));
    }
    const fresh = (await sb().from('user_data').select('updated_at').eq('user_id', u.id).maybeSingle()).data;
    st.rostersHash = result ? sha1(JSON.stringify(readJson(file, result))) : null;
    st.rostersCloudAt = fresh ? fresh.updated_at : null;
    fs.writeFileSync(stateFile, JSON.stringify({ ...readJson(stateFile, {}), ...st }));
    return !!cloudChanged;
  }

  // ---------------------------------------------------------------------------
  // Sync everything (one at a time)
  // ---------------------------------------------------------------------------
  let running = null;
  async function syncAll(opts = {}) {
    if (running) return running;
    running = (async () => {
      const u = await currentUser();
      if (!u) return { signedIn: false };
      syncing = true; lastError = null; emit('cloud:status');
      const summary = { sets: [], rostersChanged: false };
      try {
        summary.rostersChanged = await syncRosters(u);
        for (const dir of localSets()) if ((rawSet(dir).cloud || {}).id) summary.sets.push(await syncSet(dir, opts));
        lastSync = Date.now();
        fs.writeFileSync(stateFile, JSON.stringify({ ...readJson(stateFile, {}), lastSync }));
      } catch (e) {
        lastError = /fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(e.message) ? 'Offline — will sync when you’re back online.' : e.message;
        summary.error = lastError;
      } finally {
        syncing = false; running = null; emit('cloud:status');
      }
      return summary;
    })();
    return running;
  }

  // ---------------------------------------------------------------------------
  // Team (who may use the cloud) and the dancers' portal links
  // ---------------------------------------------------------------------------
  async function teamInfo() {
    await requireUser();
    const st = chk(await sb().rpc('team_status'));
    const members = st.member ? chk(await sb().from('app_members').select('email, role, added_at').order('added_at')) : [];
    return { ...st, members };
  }
  const rpc = async (fn, args) => { await requireUser(); return chk(await sb().rpc(fn, args)); };

  return { teamInfo, claimAdmin: () => rpc('claim_admin'),
    teamAdd: async ({ email, admin }) => { await rpc('team_add', { member_email: email, make_admin: !!admin }); return teamInfo(); },
    teamRemove: async (email) => { await rpc('team_remove', { member_email: email }); return teamInfo(); },
    portalLink: async ({ id, reset }) => { const c = getConfig(); return { token: await rpc('portal_link', { sid: id, reset: !!reset }), config: c ? { url: c.url, key: c.key } : null }; },
    portalStop: async (id) => { await rpc('portal_stop', { sid: id }); return true; },
    getConfig: () => { const c = getConfig(); return c ? { url: c.url, source: c.source, hasKey: !!c.key } : null; }, setConfig, status, sendCode, verifyCode, signOut,
    listCloudSets, uploadSet, downloadSet, unlinkSet, deleteCloudSet, members, addMember, removeMember, syncSet, syncAll };
}

module.exports = { createCloud };
