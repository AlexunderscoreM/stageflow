'use strict';
/* StageFlow Cloud — account button, sign-in with an emailed code, set sharing and automatic sync. */
(function () {
  const api = window.__stageflow;
  const native = window.stageflowNative || null;
  const C = native && native.cloud;
  const $ = (s) => document.querySelector(s);
  const SETUP_URL = 'https://github.com/AlexunderscoreM/stageflow/blob/main/docs/cloud-setup.md';
  const S = { status: null, cloudSets: [], pendingEmail: '', lastSummary: null };

  if (!C) { const b = $('#btnAccount'); if (b) b.style.display = 'none'; window.StageCloud = { decorateSetCard() {}, renderCloudOnly() {}, afterSave() {} }; return; }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function call(fn, arg) {
    const r = await C[fn](arg);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }
  function ago(ms) {
    if (!ms) return 'never';
    const d = (Date.now() - ms) / 1000;
    if (d < 45) return 'just now';
    if (d < 3600) return `${Math.round(d / 60)} min ago`;
    if (d < 86400) return `${Math.round(d / 3600)} h ago`;
    return new Date(ms).toLocaleDateString();
  }
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg; t.className = `show ${kind}`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, kind === 'warn' ? 9000 : 4500);
  }
  const signedIn = () => !!(S.status && S.status.user);

  // ---------------------------------------------------------------------------
  // Status + title-bar button
  // ---------------------------------------------------------------------------
  async function refreshStatus() {
    try { S.status = await call('status'); } catch { S.status = null; }
    const b = $('#btnAccount');
    const st = S.status;
    b.classList.remove('ok', 'syncing', 'warn');
    let tip = 'StageFlow Cloud — sign in to work on sets from any computer';
    if (st && st.user) {
      b.classList.add(st.syncing ? 'syncing' : st.error ? 'warn' : 'ok');
      tip = st.syncing ? 'Syncing…' : st.error ? `Cloud: ${st.error}` : `Signed in as ${st.user.email} · synced ${ago(st.lastSync)}`;
      $('#accountLabel').textContent = st.user.email.split('@')[0];
    } else $('#accountLabel').textContent = 'Sign in';
    b.title = tip;
    if (!$('#accountModal').classList.contains('hidden')) renderAccount();
  }
  C.onStatus(refreshStatus);

  // ---------------------------------------------------------------------------
  // Account window
  // ---------------------------------------------------------------------------
  function renderAccount(msg = '') {
    const el = $('#accountBody');
    const st = S.status || {};
    if (!st.configured) {
      el.innerHTML = `
        <p>Sign in to keep your sets in the cloud and work on them from any computer — and share a set with other choreographers. Dancers don't need an account.</p>
        <p class="muted small">First connect StageFlow to your cloud project (a free Supabase project — <a href="${SETUP_URL}" target="_blank">set-up guide</a>, about 10 minutes, once).</p>
        <label class="field"><span>Project URL</span><input type="text" id="cfgUrl" placeholder="https://xxxx.supabase.co" spellcheck="false"></label>
        <label class="field" style="margin-top:8px"><span>Publishable (anon) key</span><input type="text" id="cfgKey" placeholder="sb_publishable_… or eyJ…" spellcheck="false"></label>
        <div class="acct-msg">${esc(msg)}</div>
        <div class="modal-actions"><button class="filled" id="cfgSave">Connect</button></div>`;
      $('#cfgSave').onclick = async () => {
        try { await call('setConfig', { url: $('#cfgUrl').value, key: $('#cfgKey').value }); await refreshStatus(); renderAccount(); } catch (e) { renderAccount(e.message); }
      };
      return;
    }
    if (!st.user) {
      const step2 = !!S.pendingEmail;
      el.innerHTML = `
        <p>Sign in with your email. We'll send a 6-digit code — no password needed. New here? The same steps create your account.</p>
        <label class="field"><span>Email</span><input type="email" id="acctEmail" value="${esc(S.pendingEmail)}" placeholder="you@example.com" ${step2 ? 'disabled' : ''}></label>
        ${step2 ? `<label class="field" style="margin-top:8px"><span>Code from the email</span><input type="text" id="acctCode" inputmode="numeric" maxlength="10" placeholder="123456" autocomplete="one-time-code"></label>` : ''}
        <div class="acct-msg">${esc(msg)}</div>
        <div class="modal-actions">
          ${step2 ? '<button class="tonal" id="acctBack">Use a different email</button><button class="tonal" id="acctResend">Send again</button><button class="filled" id="acctVerify">Sign in</button>' : '<button class="filled" id="acctSend">Email me a code</button>'}
        </div>
        <p class="muted small" style="margin-top:10px">Cloud project: ${esc(st.url)} ${st.configSource === 'settings' ? '· <a href="#" id="cfgChange">change</a>' : ''}</p>`;
      const send = async () => {
        const email = ($('#acctEmail').value || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return renderAccount('Enter your email address.');
        try { await call('sendCode', email); S.pendingEmail = email; renderAccount(`Code sent to ${email}. It can take a minute — check spam too.`); setTimeout(() => $('#acctCode') && $('#acctCode').focus(), 50); } catch (e) { renderAccount(e.message); }
      };
      if (!step2) { $('#acctSend').onclick = send; $('#acctEmail').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }; setTimeout(() => $('#acctEmail').focus(), 50); }
      else {
        const verify = async () => {
          try {
            await call('verifyCode', { email: S.pendingEmail, code: $('#acctCode').value });
            S.pendingEmail = ''; await refreshStatus(); renderAccount(); toast('Signed in — syncing your sets…');
            if (window.StageDashboard) await StageDashboard.refresh();   // shows sets waiting in the cloud
            syncNow();
          } catch (e) { renderAccount(e.message); }
        };
        $('#acctVerify').onclick = verify;
        $('#acctCode').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') verify(); };
        $('#acctBack').onclick = () => { S.pendingEmail = ''; renderAccount(); };
        $('#acctResend').onclick = send;
      }
      const ch = $('#cfgChange');
      if (ch) ch.onclick = async (e) => { e.preventDefault(); await call('setConfig', { url: '' }); await refreshStatus(); renderAccount(); };
      return;
    }
    el.innerHTML = `
      <div class="acct-user"><span class="avatar">${esc(st.user.email[0].toUpperCase())}</span><div><b>${esc(st.user.email)}</b><div class="muted small">${st.syncing ? 'Syncing…' : `Last synced ${ago(st.lastSync)}`}</div></div></div>
      ${st.error ? `<div class="acct-warn">${esc(st.error)}</div>` : ''}
      <p class="muted small">Sets you upload (Dashboard → set card → <b>Upload to cloud</b>) sync automatically between your computers. Use <b>Share</b> on a set to invite other choreographers by email. Your rosters and dance styles follow your account.</p>
      <div class="acct-msg">${esc(msg)}</div>
      <div class="modal-actions"><button class="tonal" id="acctOut">Sign out</button><button class="filled" id="acctSync">Sync now</button></div>`;
    $('#acctSync').onclick = () => syncNow(true);
    $('#acctOut').onclick = async () => {
      if (!confirm('Sign out of StageFlow Cloud? Your sets stay on this computer; they just stop syncing until you sign in again.')) return;
      await call('signOut'); S.cloudSets = []; await refreshStatus(); renderAccount(); if (window.StageDashboard) StageDashboard.refresh();
    };
  }
  function openAccount() { renderAccount(); $('#accountModal').classList.remove('hidden'); }
  $('#btnAccount').addEventListener('click', openAccount);

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------
  let syncTimer = null;
  async function syncNow(manual = false) {
    if (!signedIn()) { if (manual) openAccount(); return; }
    const busy = api.state.view === 'editor' && api.state.dirty && api.state.filePath ? [api.state.filePath] : [];
    let sum;
    try { sum = await call('syncAll', { busy }); } catch (e) { if (manual) toast(e.message, 'warn'); return; }
    S.lastSummary = sum;
    if (sum.error) { if (manual) toast(sum.error, 'warn'); }
    const sets = sum.sets || [];
    const conflicts = sets.flatMap((s) => s.conflicts || []);
    const conflictMsg = conflicts.map((c) => `“${c.name}” was changed on two devices. The other version is now in “${c.name}”; your edits are kept as “${c.copy.replace(/\.stageflow$/, '')}”.`).join(' ');
    if (sets.some((s) => s.removedFromCloud)) toast('A set was removed from the cloud or you no longer have access — your local copy is kept.', 'warn');
    // the open segment changed in the cloud: reload it (only when there is nothing unsaved)
    const open = api.state.filePath;
    if (open && api.state.view === 'editor' && !api.state.dirty && sets.some((s) => (s.updatedFiles || []).some((f) => samePath(f, open)))) {
      const r = await native.library.read(open);
      const t = api.state.time;
      await api.loadProjectText(r.text, r.filePath, { setName: api.state.setName });
      api.setTime(t);
      if (!conflictMsg) toast('This segment was updated with changes from another device.');
    }
    if (conflictMsg) toast(conflictMsg, 'warn');   // shown last so it isn't replaced
    if (manual) toast(`Synced ${sets.length} set${sets.length === 1 ? '' : 's'}.`);
    const changed = sets.some((s) => s.downloaded || s.deleted || s.uploaded || s.removedFromCloud) || sum.rostersChanged;
    const before = JSON.stringify(S.cloudSets.map((c) => [c.id, c.name, c.segments, c.members.length, !!c.localDir]));
    await loadCloudSets();
    const listChanged = before !== JSON.stringify(S.cloudSets.map((c) => [c.id, c.name, c.segments, c.members.length, !!c.localDir]));
    if (window.StageDashboard && (changed || manual || listChanged) && api.state.view === 'dashboard') await StageDashboard.refresh();
    else if (changed && window.StageRoster) StageRoster.invalidate();
  }
  const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
  function scheduleSync(ms = 2500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), ms); }
  setInterval(() => { if (signedIn() && !api.state.playing) syncNow(false); }, 120000);

  /** After the editor saves a segment that lives in a cloud set: push it soon. */
  function afterSave() { if (signedIn()) scheduleSync(1500); }

  // ---------------------------------------------------------------------------
  // Dashboard: badge + buttons on set cards, and sets that are only in the cloud
  // ---------------------------------------------------------------------------
  function decorateSetCard(card, set) {
    const head = card.querySelector('.set-head');
    const box = document.createElement('div');
    box.className = 'cloud-box';
    if (set.cloud) {
      const info = S.cloudSets.find((c) => c.id === set.cloud.id);
      const mine = !info || info.mine;
      const shared = mine && info && info.members.length ? ` · shared with ${info.members.length}` : '';
      box.innerHTML = `<button class="cloud-badge ${signedIn() ? 'ok' : ''}" data-c="sync" title="${signedIn() ? 'Synced with StageFlow Cloud — click to sync now' : 'Sign in to sync'}">${api.ICONS.cloud}<span>${signedIn() ? `Synced ${ago(set.cloud.syncedAt)}` : 'Cloud (signed out)'}${shared}${mine ? '' : ' · shared with you'}</span></button>
        <button class="tonal sm-btn" data-c="share" ${signedIn() ? '' : 'disabled'}>${api.ICONS.share}<span>Share</span></button>
        <button class="icon-btn" data-c="unlink" title="Stop syncing this set on this computer">${api.ICONS.x}</button>`;
      box.querySelector('[data-c="share"]').onclick = () => openShare(set, info);
      box.querySelector('[data-c="sync"]').onclick = () => (signedIn() ? syncNow(true) : openAccount());
      box.querySelector('[data-c="unlink"]').onclick = async () => {
        if (!confirm(`Stop syncing “${set.name}” on this computer? The files stay here and the cloud copy stays for everyone else.`)) return;
        await call('unlinkSet', set.dir); StageDashboard.refresh();
      };
    } else if (signedIn()) {
      box.innerHTML = `<button class="tonal sm-btn" data-c="up">${api.ICONS.cloud}<span>Upload to cloud</span></button>`;
      box.querySelector('[data-c="up"]').onclick = async (e) => {
        e.currentTarget.disabled = true; e.currentTarget.querySelector('span').textContent = 'Uploading…';
        try { await call('uploadSet', set.dir); toast(`“${set.name}” is now in the cloud.`); } catch (err) { toast(err.message, 'warn'); }
        await loadCloudSets(); StageDashboard.refresh();
      };
    }
    head.after(box);
  }

  async function loadCloudSets() {
    if (!signedIn()) { S.cloudSets = []; return; }
    try { S.cloudSets = await call('listSets'); } catch { /* offline: keep the last list */ }
  }

  function renderCloudOnly(el) {
    el.innerHTML = '';
    if (!signedIn()) return;
    const only = S.cloudSets.filter((c) => !c.localDir);
    if (!only.length) return;
    el.innerHTML = `<h2 class="cloud-only-title">${api.ICONS.cloud}<span>In the cloud</span></h2><p class="muted small" style="margin-top:-4px">Sets from your other computers or shared with you. Download one to work on it here — it then syncs automatically.</p>
      <div class="cloud-only">${only.map((c) => `<div class="cloud-card"><div><b>${esc(c.name)}</b><div class="muted small">${c.segments} segment${c.segments === 1 ? '' : 's'} · ${c.mine ? 'yours' : 'shared with you'} · updated ${ago(Date.parse(c.updatedAt))}</div></div>
        <button class="filled sm-btn" data-id="${c.id}">${api.ICONS.download}<span>Download</span></button></div>`).join('')}</div>`;
    el.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true; b.querySelector('span').textContent = 'Downloading…';
        try { await call('downloadSet', b.dataset.id); } catch (e) { toast(e.message, 'warn'); }
        await loadCloudSets(); StageDashboard.refresh();
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Share a set with other choreographers
  // ---------------------------------------------------------------------------
  async function openShare(set, info) {
    const m = $('#shareModal');
    const mine = !info || info.mine;
    const draw = async (msg = '') => {
      let list = [];
      try { list = await call('members', set.cloud.id); } catch (e) { msg = e.message; }
      $('#shareBody').innerHTML = `
        <p class="muted small" style="margin-top:0">Choreographers you add can open, edit and sync <b>${esc(set.name)}</b> after signing in with that email. Dancers don't need this — send them a phone link from Export instead.</p>
        <div class="member-list">${list.length ? list.map((e) => `<div class="member"><span class="avatar sm">${esc(e[0].toUpperCase())}</span><span>${esc(e)}</span>${mine ? `<button class="icon-btn sm" data-rm="${esc(e)}" title="Remove">${api.ICONS.x}</button>` : ''}</div>`).join('') : '<div class="muted small">Not shared with anyone yet.</div>'}</div>
        ${mine ? `<div class="share-add"><input type="email" id="shareEmail" placeholder="choreographer@example.com"><button class="filled" id="shareAdd">Invite</button></div>` : '<p class="muted small">Only the person who uploaded this set can invite people.</p>'}
        <div class="acct-msg">${esc(msg)}</div>
        ${mine ? '<div class="modal-actions"><button class="tonal danger-txt" id="shareDelete">Delete from cloud…</button></div>' : ''}`;
      m.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { try { await call('removeMember', { id: set.cloud.id, email: b.dataset.rm }); draw(); } catch (e) { draw(e.message); } }; });
      const add = async () => { try { await call('addMember', { id: set.cloud.id, email: $('#shareEmail').value }); draw('Invited. They’ll see the set under “In the cloud” after signing in with that email.'); } catch (e) { draw(e.message); } };
      if (mine) {
        $('#shareAdd').onclick = add;
        $('#shareEmail').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); };
        $('#shareDelete').onclick = async () => {
          if (!confirm(`Delete “${set.name}” from the cloud for everyone? Your files on this computer are kept.`)) return;
          try { await call('deleteSet', set.cloud.id); m.classList.add('hidden'); toast('Removed from the cloud.'); await loadCloudSets(); StageDashboard.refresh(); } catch (e) { draw(e.message); }
        };
      }
    };
    $('#shareTitle').textContent = `Share “${set.name}”`;
    m.classList.remove('hidden');
    draw();
  }

  // ---------------------------------------------------------------------------
  // Start-up
  // ---------------------------------------------------------------------------
  (async () => {
    await refreshStatus();
    if (signedIn()) { await loadCloudSets(); await syncNow(false); await loadCloudSets(); if (window.StageDashboard && api.state.view === 'dashboard') StageDashboard.refresh(); }
  })();

  window.StageCloud = { decorateSetCard, renderCloudOnly, loadCloudSets, afterSave, syncNow, openAccount, refreshStatus, get state() { return S; } };
})();
