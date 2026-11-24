'use strict';
/* StageFlow — Export: video, PDF of each formation, teach mode, PNG. */
(function () {
  const api = window.__stageflow;
  const native = window.stageflowNative || null;
  const $ = (s) => document.querySelector(s);
  const modal = $('#exportModal');
  let recording = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fileBase() { return (api.project.name || 'Segment').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Segment'; }

  function open() {
    if (api.state.playing) api.pause();
    $('#exportSegName').textContent = api.project.name;
    $('.export-options').classList.remove('hidden');
    $('#videoOptions').classList.add('hidden');
    $('#shareOptions').classList.add('hidden');
    $('#vidProgressBox').classList.add('hidden');
    $('#btnVidStart').disabled = false;
    modal.classList.remove('hidden');
  }
  function close() { if (!recording) modal.classList.add('hidden'); }

  for (const b of document.querySelectorAll('[data-export]')) {
    b.addEventListener('click', () => {
      const kind = b.dataset.export;
      if (kind === 'video') { $('.export-options').classList.add('hidden'); $('#videoOptions').classList.remove('hidden'); }
      else if (kind === 'pdf') { close(); exportPdf(); }
      else if (kind === 'teach') { close(); openTeach(); }
      else if (kind === 'png') { close(); setTimeout(() => api.exportPng(), 150); }
      else if (kind === 'share') { $('.export-options').classList.add('hidden'); $('#shareOptions').classList.remove('hidden'); makeShareLink(); }
    });
  }
  $('#btnVidBack').addEventListener('click', () => {
    if (recording) { recording.cancel(); return; }
    $('.export-options').classList.remove('hidden'); $('#videoOptions').classList.add('hidden');
  });
  $('#btnVidStart').addEventListener('click', () => recordVideo());

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function positionsAt(t) {
    const pos = {};
    for (const d of api.project.dancers) pos[d.id] = api.dancerPos(d.id, t);
    return pos;
  }
  function stageImage(f, prev, w, h, theme) {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    StageRender.drawStage(ctx, w, h, api.project, f.positions, { theme, showNames: true, numbers: true, from: prev ? prev.positions : null, formation: f, fromFormation: prev });
    return c.toDataURL('image/png');
  }

  // ---------------------------------------------------------------------------
  // PDF: one page per formation with the final positions
  // ---------------------------------------------------------------------------
  async function exportPdf() {
    const p = api.project;
    const fs = p.formations;
    const pages = fs.map((f, i) => {
      const img = stageImage(f, null, 1100, 720, 'light');
      const rows = p.dancers.map((d, k) => {
        const pos = f.positions[d.id] || { x: 0, y: 0 };
        const co = StageRender.callout(p, pos), lk = StageRender.lookOf(f, d);
        return `<tr><td class="n"><span class="dot" style="background:${esc(lk.color)}">${k + 1}</span></td><td>${esc(d.name)}${lk.layer ? ` <span class="lay">${esc(lk.layer.name)}</span>` : ''}</td><td class="c">${esc(co.short)}</td><td class="l">${esc(co.long)}</td></tr>`;
      }).join('');
      const moveIn = i > 0 ? `moves in ${api.fmtTime(fs[i - 1].end)} → ${api.fmtTime(f.start)}` : 'opening formation';
      return `<section class="page">
        <header><div><div class="seg">${esc(p.name)}</div><h1>${i + 1}. ${esc(f.name)}</h1></div>
          <div class="time">Hold ${api.fmtTime(f.start)} – ${api.fmtTime(f.end)}<br><span>${moveIn}</span></div></header>
        <div class="body"><img src="${img}"><table><thead><tr><th></th><th>Dancer</th><th>Spot</th><th>Call-out</th></tr></thead><tbody>${rows}</tbody></table></div>
        <footer>Formation ${i + 1} of ${fs.length} · Stage ${api.fmtNum(p.stage.width)} × ${api.fmtNum(p.stage.depth)} ${p.stage.unit} · Audience ${p.stage.audience === 'top' ? 'at top' : 'at bottom'} · ${(p.stage.callout || 'markers') === 'markers' ? `Spots are (x, y) in markers (1 marker = ${api.fmtNum(p.stage.width / p.stage.columns)} × ${api.fmtNum(p.stage.depth / p.stage.rows)} ${p.stage.unit})` : 'Spots are (x, y)'}: x from center, left − / right + as seen from the audience · y from the front of the stage</footer>
      </section>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title><style>
      @page { size: letter landscape; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #1f1f1f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: 11in; height: 8.5in; padding: .45in .5in .4in; display: flex; flex-direction: column; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0b57d0; padding-bottom: 8px; }
      .seg { color: #5f6368; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      h1 { margin: 2px 0 0; font-size: 24px; font-weight: 600; }
      .time { text-align: right; font-size: 13px; font-weight: 600; } .time span { font-weight: 400; color: #5f6368; }
      .body { flex: 1; display: grid; grid-template-columns: 1.9fr 1fr; gap: 18px; padding-top: 14px; min-height: 0; }
      img { width: 100%; border: 1px solid #dadce0; border-radius: 8px; align-self: start; }
      table { border-collapse: collapse; width: 100%; font-size: ${p.dancers.length > 18 ? 9.5 : 11.5}px; align-self: start; }
      .lay { font-size: 10px; color: #0b57d0; border: 1px solid #c2d3f5; border-radius: 8px; padding: 0 5px; margin-left: 4px; }
      th { text-align: left; color: #5f6368; font-weight: 600; border-bottom: 1px solid #dadce0; padding: 4px; }
      td { padding: ${p.dancers.length > 18 ? 2 : 4}px 4px; border-bottom: 1px solid #f1f3f4; }
      td.c { font-weight: 700; white-space: nowrap; } td.l { color: #5f6368; }
      .dot { display: inline-flex; width: 20px; height: 20px; border-radius: 10px; color: #fff; font-size: 10px; font-weight: 700; align-items: center; justify-content: center; }
      footer { font-size: 10px; color: #80868b; border-top: 1px solid #dadce0; padding-top: 6px; }
    </style></head><body>${pages}</body></html>`;
    if (native) {
      await native.printPdf({ html, suggestedName: `${fileBase()} - formations.pdf` });
    } else {
      const w = window.open('', '_blank');
      if (!w) return alert('Allow pop-ups to print the PDF.');
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  // ---------------------------------------------------------------------------
  // Teach mode
  // ---------------------------------------------------------------------------
  function openTeach() {
    const w = window.open('teach.html', 'stageflow-teach');
    if (!w) alert('Could not open the teach window.');
    else w.focus();
  }
  /** Data snapshot for the teach window. */
  api.teachData = () => {
    const p = api.project;
    return JSON.parse(JSON.stringify({ name: p.name, stage: p.stage, dancers: p.dancers, formations: p.formations.map((f) => ({ id: f.id, name: f.name, start: f.start, end: f.end, positions: f.positions, layers: f.layers || [] })) }));
  };

  // ---------------------------------------------------------------------------
  // Share link for dancers' phones
  // ---------------------------------------------------------------------------
  const DEFAULT_VIEWER = 'https://alexunderscorem.github.io/stageflow/';
  function viewerBase() {
    let b = (localStorage.getItem('sf.viewerBase') || DEFAULT_VIEWER).trim();
    if (!/\/$/.test(b) && !/\.html?$/.test(b)) b += '/';
    return b;
  }
  let lastShare = '';
  async function makeShareLink() {
    $('#shareBase').value = viewerBase();
    const code = await SFShare.encode(api.project);
    lastShare = code;
    const url = `${viewerBase()}#s=${code}`;
    $('#shareLink').value = url;
    const p = api.project;
    $('#shareInfo').textContent = `${p.dancers.length} dancers · ${p.formations.length} formations · link is ${url.length.toLocaleString()} characters`;
    const cv = $('#shareQr');
    const ctx = cv.getContext('2d');
    try {
      const qr = qrcode(0, url.length > 1800 ? 'L' : 'M');
      qr.addData(url, 'Byte');
      qr.make();
      const n = qr.getModuleCount(), cell = Math.max(2, Math.floor(232 / (n + 8))), size = (n + 8) * cell;
      cv.width = size; cv.height = size;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
      $('#qrNote').textContent = 'Scan with a phone camera';
      cv.classList.remove('hidden');
    } catch (err) {
      cv.classList.add('hidden');
      $('#qrNote').textContent = 'This segment is too big for a QR code — send the link instead (text, email, group chat).';
    }
  }
  $('#btnShareCopy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#shareLink').value);
    const b = $('#btnShareCopy span'); b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500);
  });
  $('#btnSharePreview').addEventListener('click', () => {
    // preview with the copy of the viewer bundled in the app (works before the web version is published)
    window.open(`viewer/index.html#s=${lastShare}`, 'stageflow-viewer');
  });
  $('#btnShareBack').addEventListener('click', () => { $('.export-options').classList.remove('hidden'); $('#shareOptions').classList.add('hidden'); });
  $('#shareBase').addEventListener('change', () => { localStorage.setItem('sf.viewerBase', $('#shareBase').value.trim() || DEFAULT_VIEWER); makeShareLink(); });

  // ---------------------------------------------------------------------------
  // Video
  // ---------------------------------------------------------------------------
  function pickMime() {
    const cands = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return cands.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function recordVideo() {
    if (recording) return;
    const mime = pickMime();
    if (!mime) { alert('Video recording is not supported here.'); return; }
    const [W, H] = $('#vidSize').value.split('x').map(Number);
    const view = $('#vidView').value;
    const p = api.project, fs = p.formations;
    let t0 = 0, t1 = fs[fs.length - 1].end + 1;
    if ($('#vidRange').value === 'formation') {
      const i = api.panelFormationIndex();
      t0 = i > 0 ? fs[i - 1].end : fs[i].start;
      t1 = fs[i].end + 0.3;
    }
    const canvas = $('#vidPreview');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    let rec3d = null;
    if (view === '3d') {
      if (!api.view3d) { alert('The 3D view is still loading — try again in a moment.'); return; }
      rec3d = api.view3d.createRecorder(W, H);
    }

    // Audio: decode the segment's music and feed it into the recording (not played aloud).
    const actx = new AudioContext();
    const dest = actx.createMediaStreamDestination();
    let src = null;
    if (api.state.audioData) {
      try {
        const res = await fetch(`data:${api.state.audioData.mime};base64,${api.state.audioData.data}`);
        const buf = await actx.decodeAudioData(await res.arrayBuffer());
        if (t0 < buf.duration) { src = actx.createBufferSource(); src.buffer = buf; src.connect(dest); }
      } catch (e) { console.warn('audio for video failed', e); }
    }
    const stream = canvas.captureStream(30);
    if (src) for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr); // only when there is music
    const chunks = [];
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: W >= 1920 ? 10_000_000 : 6_000_000 });
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    $('#vidProgressBox').classList.remove('hidden');
    $('#btnVidStart').disabled = true;
    $('#btnVidBack').textContent = 'Cancel';
    modal.dataset.busy = '1';
    const wasTime = api.state.time;
    let cancelled = false, last = performance.now();
    recording = { cancel: () => { cancelled = true; } };

    const drawFrame = (t) => {
      api.setTime(t);
      const fi = api.panelFormationIndex();
      const label = `${fi + 1}. ${fs[fi].name}`;
      if (rec3d) {
        const now = performance.now();
        rec3d.render((now - last) / 1000); last = now;
        ctx.drawImage(rec3d.canvas, 0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(0, 0, W, 44 * (W / 1280));
        ctx.fillStyle = '#fff'; ctx.font = `600 ${20 * (W / 1280)}px Segoe UI, system-ui, sans-serif`;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(`${p.name} — ${label}`, 18 * (W / 1280), 22 * (W / 1280));
        ctx.textAlign = 'right'; ctx.fillText(api.fmtTime(t), W - 18 * (W / 1280), 22 * (W / 1280));
      } else {
        StageRender.drawStage(ctx, W, H, p, positionsAt(t), { theme: 'dark', showNames: api.state.showNames, title: `${p.name} — ${label}`, subtitle: api.fmtTime(t), formation: fs[fi] });
      }
    };

    drawFrame(t0);
    mr.start(250);
    if (actx.state === 'suspended') await actx.resume();
    if (src) src.start(0, t0);
    // timeline clock = wall clock (the audio device clock can run fast or stall on machines without speakers)
    const startAt = performance.now() / 1000;
    const elapsed = () => performance.now() / 1000 - startAt;
    await new Promise((resolve) => {
      const step = () => {
        const t = t0 + elapsed();
        if (cancelled || t >= t1) return resolve();
        drawFrame(t);
        const pct = Math.min(100, ((t - t0) / (t1 - t0)) * 100);
        $('#vidProgress').style.width = `${pct}%`;
        $('#vidStatus').textContent = `Recording… ${api.fmtTime(t - t0)} of ${api.fmtTime(t1 - t0)} (plays in real time)`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    drawFrame(Math.min(t1, t0 + elapsed()));
    const done = new Promise((r) => { mr.onstop = r; });
    mr.stop();
    await done;
    if (src) try { src.stop(); } catch { /* already stopped */ }
    actx.close();
    if (rec3d) rec3d.dispose();
    recording = null;
    delete modal.dataset.busy;
    $('#btnVidBack').textContent = 'Back';
    $('#btnVidStart').disabled = false;
    api.setTime(wasTime);
    if (cancelled) { $('#vidStatus').textContent = 'Cancelled.'; return; }

    $('#vidStatus').textContent = 'Saving…';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const name = `${fileBase()}${$('#vidRange').value === 'formation' ? ' - ' + fs[api.panelFormationIndex()].name : ''}.${ext}`;
    if (native) {
      const res = await native.saveBinary({ data: new Uint8Array(await blob.arrayBuffer()), suggestedName: name, filters: [{ name: 'Video', extensions: [ext] }] });
      $('#vidStatus').textContent = res ? `Saved to ${res.filePath}` : 'Not saved.';
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      $('#vidStatus').textContent = 'Downloaded.';
    }
    api.lastVideo = { size: blob.size, type: blob.type, name };
  }

  window.StageExport = { open, exportPdf, openTeach, recordVideo, makeShareLink };
})();
