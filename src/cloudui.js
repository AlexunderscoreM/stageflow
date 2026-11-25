'use strict';
/* StageFlow Cloud — account button, sign-in with an emailed code, set sharing and automatic sync. */
(function () {
  const api = window.__stageflow;
  const native = window.stageflowNative || null;
  const C = native && native.cloud;
  const $ = (s) => document.querySelector(s);
  const SETUP_URL = 'https://github.com/AlexunderscoreM/stageflow/blob/main/docs/cloud-setup.md';
  const S = { status: null, cloudSets: [], pendingEmail: '', lastSummary: null };
  const WEB = !!(native && native.web);

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
      <div class="acct-user"><span class="avatar">${esc(st.user.email[0].toUpperCase())}</span><div><b>${esc(st.user.email)}</b><div class="muted small">${WEB ? `Live — checks for your team's changes every few seconds${st.lastSync ? ` · last ${ago(st.lastSync)}` : ''}` : st.syncing ? 'Syncing…' : `Last synced ${ago(st.lastSync)}`}</div></div></div>
      ${st.error ? `<div class="acct-warn">${esc(st.error)}</div>` : ''}
      <div id="teamBox"></div>
      ${WEB ? '' : '<p class="muted small">Sets you upload (Dashboard → set card → <b>Upload to cloud</b>) sync automatically between computers and with your team. Your rosters and dance styles follow your account.</p>'}
      <div class="acct-msg">${esc(msg)}</div>
      <div class="modal-actions"><button class="tonal" id="acctOut">Sign out</button>${WEB ? '' : '<button class="filled" id="acctSync">Sync now</button>'}</div>`;
    if ($('#acctSync')) $('#acctSync').onclick = () => syncNow(true);
    $('#acctOut').onclick = async () => {
      if (!confirm(WEB ? 'Sign out of StageFlow on this browser?' : 'Sign out of StageFlow Cloud? Your sets stay on this computer; they just stop syncing until you sign in again.')) return;
      await call('signOut'); S.cloudSets = []; await refreshStatus(); renderAccount(); if (window.StageDashboard) StageDashboard.refresh();
    };
    renderTeam();
  }

  // ---------------------------------------------------------------------------
  // Team: the few people who may use this StageFlow (managed by the admin)
  // ---------------------------------------------------------------------------
  async function renderTeam(msg = '') {
    const box = $('#teamBox');
    if (!box || !C.team) return;
    let t;
    try { t = await call('team'); } catch (e) { if (!box.isConnected) return; box.innerHTML = /team_status|function/i.test(e.message) ? '<div class="acct-warn">Your cloud project needs the latest set-up script: run cloud/schema.sql again in Supabase.</div>' : `<div class="acct-warn">${esc(e.message)}</div>`; return; }
    if (!box.isConnected) return;   // the window was redrawn while we waited
    if (!t.hasAdmin) {
      box.innerHTML = `<div class="team-card"><b>Set up your team</b><p class="muted small">Nobody runs this StageFlow yet. Become the admin, then add the few people who may use it. Everyone else is kept out.</p>
        <div class="acct-msg">${esc(msg)}</div><button class="filled" id="teamClaim">Become the admin</button></div>`;
      $('#teamClaim').onclick = async () => { try { await call('claimAdmin'); await refreshStatus(); renderTeam('You’re the admin. Add your team below.'); if (window.StageDashboard) StageDashboard.refresh(); } catch (e) { renderTeam(e.message); } };
      return;
    }
    if (!t.member) {
      box.innerHTML = `<div class="acct-warn">You're signed in, but not on this StageFlow team. Ask the admin to add <b>${esc(S.status.user.email)}</b>, then reopen this window.</div>`;
      return;
    }
    box.innerHTML = `<div class="team-card"><b>Your team</b> <span class="muted small">· everyone here can open and edit every set${t.admin ? '' : ' · only the admin can add or remove people'}</span>
      <div class="member-list">${t.members.map((m) => `<div class="member"><span class="avatar sm">${esc(m.email[0].toUpperCase())}</span><span>${esc(m.email)}</span>${m.role === 'admin' ? '<em class="role">admin</em>' : ''}${t.admin && m.email !== S.status.user.email.toLowerCase() ? `<button class="icon-btn sm" data-rm="${esc(m.email)}" title="Remove from the team">${api.ICONS.x}</button>` : ''}</div>`).join('')}</div>
      ${t.admin ? `<div class="share-add"><input type="email" id="teamEmail" placeholder="choreographer@example.com"><label class="switch small" title="Admins can add and remove people"><input type="checkbox" id="teamAdmin"><i></i><span>Admin</span></label><button class="filled" id="teamAddBtn">Add</button></div>` : ''}
      <div class="acct-msg">${esc(msg)}</div></div>`;
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirm(`Remove ${b.dataset.rm} from the team? They lose access to every set.`)) return; try { await call('teamRemove', b.dataset.rm); renderTeam(); } catch (e) { renderTeam(e.message); } }; });
    if (t.admin) {
      const add = async () => { try { const e = $('#teamEmail').value; await call('teamAdd', { email: e, admin: $('#teamAdmin').checked }); renderTeam(`Added. They sign in with ${e.trim()} (an emailed code) and see every set.`); } catch (e) { renderTeam(e.message); } };
      $('#teamAddBtn').onclick = add;
      $('#teamEmail').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); };
    }
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
      if (!conflictMsg) toast(WEB ? 'A teammate changed this segment — showing their latest version.' : 'This segment was updated with changes from another device.');
    }
    if (conflictMsg) toast(conflictMsg, 'warn');   // shown last so it isn't replaced
    if (manual) toast(WEB ? 'Up to date.' : `Synced ${sets.length} set${sets.length === 1 ? '' : 's'}.`);
    const changed = sets.some((s) => s.downloaded || s.deleted || s.uploaded || s.removedFromCloud) || sum.rostersChanged;
    const before = JSON.stringify(S.cloudSets.map((c) => [c.id, c.name, c.segments, c.members.length, !!c.localDir]));
    await loadCloudSets();
    const listChanged = before !== JSON.stringify(S.cloudSets.map((c) => [c.id, c.name, c.segments, c.members.length, !!c.localDir]));
    if (window.StageDashboard && (changed || manual || listChanged) && api.state.view === 'dashboard') await StageDashboard.refresh();
    else if (changed && window.StageRoster) StageRoster.invalidate();
  }
  const samePath = (a, b) => String(a).replace(/\\/g, '/').toLowerCase() === String(b).replace(/\\/g, '/').toLowerCase();
  function scheduleSync(ms = 2500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(false), ms); }
  setInterval(() => { if (signedIn() && !api.state.playing) syncNow(false); }, WEB ? 10000 : 120000);
  window.addEventListener('sf-web-conflict', (e) => toast(`A teammate saved “${e.detail.name}” while you were editing. Their version stays in “${e.detail.name}”; yours is saved as “${e.detail.copy}”.`, 'warn'));
  document.addEventListener('visibilitychange', () => { if (WEB && !document.hidden && signedIn()) syncNow(false); });

  /** After the editor saves a segment that lives in a cloud set: push it soon. */
  function afterSave() { if (signedIn()) scheduleSync(1500); }

  // ---------------------------------------------------------------------------
  // Dashboard: badge + buttons on set cards, and sets that are only in the cloud
  // ---------------------------------------------------------------------------
  function decorateSetCard(card, set) {
    const head = card.querySelector('.set-head');
    const box = document.createElement('div');
    box.className = 'cloud-box';
    if (set.cloud && WEB) {
      box.innerHTML = `<span class="cloud-badge ok">${api.ICONS.cloud}<span>Live · shared with your team</span></span>
        <button class="tonal sm-btn" data-c="share">${api.ICONS.share}<span>Share</span></button>`;
      box.querySelector('[data-c="share"]').onclick = () => openShare(set, { mine: set.mine });
    } else if (set.cloud) {
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
    if (!signedIn() || WEB) return;
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
  /** Where the phone portal lives: next to the web app on GitHub Pages (or the address set in Export → Share). */
  function portalBase() {
    if (WEB && /\/app\/?$/.test(location.pathname.replace(/[^/]*$/, ''))) return new URL('../', location.href).href;
    let b = (localStorage.getItem('sf.viewerBase') || 'https://alexunderscorem.github.io/stageflow/').trim();
    if (!/\/$/.test(b) && !/\.html?$/.test(b)) b += '/';
    return b;
  }
  const b64url = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function portalUrl(token, cfg) { return `${portalBase()}#p=${token}${cfg ? `&c=${b64url(JSON.stringify([cfg.url, cfg.key]))}` : ''}`; }
  function drawQr(cv, url) {
    const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
    const n = qr.getModuleCount(), cell = Math.max(2, Math.floor(200 / (n + 8))), size = (n + 8) * cell;
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
  }

  async function openShare(set, info) {
    const m = $('#shareModal');
    const mine = !info || info.mine;
    const id = set.cloud.id;
    const draw = async (msg = '', link = null) => {
      let t = null;
      try { t = C.team ? await call('team') : null; } catch { /* older schema */ }
      $('#shareBody').innerHTML = `
        <div class="share-sec"><b>Choreographers</b>
          <p class="muted small">${t && t.member ? `Everyone on your team (${t.members.length}) can open and edit this set, any time — changes show up for everyone.` : 'Your team can open and edit this set.'} ${t && t.admin ? '' : 'The team admin adds or removes people.'}</p>
          <button class="tonal" id="shareTeam">${t && t.admin ? 'Manage team…' : 'See team…'}</button></div>
        <div class="share-sec"><b>Dancer portal</b> <span class="muted small">· view only, for phones</span>
          <p class="muted small">One private link for the whole set. Dancers open it on their phone, tap their name and see every segment's formations — always the latest version. No account, and nobody can edit through it.</p>
          <div id="portalBox">${link ? '' : '<button class="filled" id="portalMake">Get the dancer link</button>'}</div></div>
        <div class="acct-msg">${esc(msg)}</div>
        ${mine || (t && t.admin) ? '<div class="modal-actions"><button class="tonal danger-txt" id="shareDelete">Delete from cloud…</button></div>' : ''}`;
      $('#shareTeam').onclick = () => { m.classList.add('hidden'); openAccount(); };
      const show = (res) => {
        const url = portalUrl(res.token, res.config);
        $('#portalBox').innerHTML = `<div class="portal-link"><input type="text" readonly id="portalUrl"><button class="filled" id="portalCopy">Copy</button></div>
          <div class="portal-qr"><canvas id="portalQr"></canvas><div class="muted small">Scan with a phone camera, or send the link in your group chat.<br><br>
          <button class="text-btn" id="portalOpen">Open</button> · <button class="text-btn" id="portalReset">New link (old one stops working)</button> · <button class="text-btn danger-txt" id="portalOff">Turn off</button></div></div>`;
        $('#portalUrl').value = url;
        try { drawQr($('#portalQr'), url); } catch { $('#portalQr').remove(); }
        $('#portalCopy').onclick = async () => { await navigator.clipboard.writeText(url); toast('Dancer link copied.'); };
        $('#portalOpen').onclick = () => window.open(url, '_blank');
        $('#portalReset').onclick = async () => { if (!confirm('Make a new dancer link? The old link stops working, so send the new one to your dancers.')) return; try { show(await call('portalLink', { id, reset: true })); } catch (e) { draw(e.message); } };
        $('#portalOff').onclick = async () => { if (!confirm('Turn off the dancer link? It stops working until you make a new one.')) return; try { await call('portalStop', id); draw('The dancer link is off.'); } catch (e) { draw(e.message); } };
      };
      if (link) show(link);
      else $('#portalMake').onclick = async () => { try { show(await call('portalLink', { id })); } catch (e) { draw(/portal_link|function/i.test(e.message) ? 'Your cloud project needs the latest set-up script: run cloud/schema.sql again in Supabase.' : e.message); } };
      const del = $('#shareDelete');
      if (del) del.onclick = async () => {
        if (!confirm(`Delete “${set.name}” from the cloud for everyone?${WEB ? ' This cannot be undone.' : ' Your files on this computer are kept.'}`)) return;
        try { await call('deleteSet', id); m.classList.add('hidden'); toast('Removed from the cloud.'); await loadCloudSets(); StageDashboard.refresh(); } catch (e) { draw(e.message); }
      };
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

  window.StageCloud = { decorateSetCard, renderCloudOnly, loadCloudSets, afterSave, syncNow, openAccount, refreshStatus, toast, get state() { return S; } };
})();
