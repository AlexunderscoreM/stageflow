'use strict';
/* StageFlow — tap along to the music to record its beats. Formations can then be read, typed and
   snapped in counts ("3·5" = 8-count 3, beat 5) instead of seconds. */
(function () {
  const api = window.__stageflow;
  const $ = (s) => document.querySelector(s);

  function nowAudioTime() {
    const a = api.state.audio && api.state.audio.el;
    return a && !a.paused ? a.currentTime : api.state.time;
  }

  // ---------------------------------------------------------------------------
  // Tapping session
  // ---------------------------------------------------------------------------
  function start() {
    const S = api.state;
    if (!S.audio) { alert('Load the music first (Music tab), then tap along to it.'); return; }
    if (S.tapping) return finish();
    if ($('#tapFromStart').checked) api.setTime(0);
    S.tapping = { taps: [], from: S.time };
    $('#tapPad').classList.remove('hidden');
    $('#tapCount').textContent = '0';
    $('#btnTapBeats span').textContent = 'Finish tapping';
    $('#btnTapBeats').classList.add('on');
    if (document.activeElement) document.activeElement.blur();
    api.play();
  }

  function tap() {
    const S = api.state;
    if (!S.tapping) return;
    const t = nowAudioTime();
    const taps = S.tapping.taps;
    if (taps.length && t - taps[taps.length - 1] < 0.12) return; // ignore double hits
    taps.push(Math.round(t * 1000) / 1000);
    $('#tapCount').textContent = String(taps.length);
    const pad = $('#tapPad');
    pad.classList.add('flash');
    setTimeout(() => pad.classList.remove('flash'), 90);
  }

  function finish() {
    const S = api.state;
    if (!S.tapping) return;
    const taps = S.tapping.taps.slice().sort((a, b) => a - b);
    S.tapping = null;
    api.pause();
    $('#tapPad').classList.add('hidden');
    $('#btnTapBeats span').textContent = 'Tap beats';
    $('#btnTapBeats').classList.remove('on');
    if (taps.length < 2) { render(); api.renderAll(); return; }
    // replace any old beats inside the tapped stretch, keep the rest
    const lo = taps[0] - 0.25, hi = taps[taps.length - 1] + 0.25;
    api.mutate(() => {
      const keep = (api.project.beats || []).filter((b) => b < lo || b > hi);
      const merged = keep.concat(taps).sort((a, b) => a - b);
      // count 1 stays on the first beat of the earliest tapping (or the old first tap if that came earlier)
      const oldFirst = (api.project.beats || [])[api.project.beatZero || 0];
      const first = oldFirst != null && oldFirst < taps[0] && keep.includes(oldFirst) ? oldFirst : taps[0];
      api.project.beats = merged;
      api.project.beatZero = Math.max(0, merged.indexOf(first));
    });
    if (api.state.timeRef !== 'counts') {
      // first time: switch the timeline to counts so the beats are put to use straight away
      api.state.timeRef = 'counts';
      localStorage.setItem('sf.timeRef', 'counts');
      $('#optTimeRef').value = 'counts';
      api.renderAll();
    }
  }

  /** Called first by the app's key handler while tapping. Returns true when it handled the key. */
  function onKey(e) {
    if (!api.state.tapping) return false;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) tap(); return true; }
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(); return true; }
    if (e.key.toLowerCase() === 't') { e.preventDefault(); if (!e.repeat) tap(); return true; }
    return true; // swallow other shortcuts while tapping
  }

  // ---------------------------------------------------------------------------
  // Clean-up tools
  // ---------------------------------------------------------------------------
  /** Least-squares steady tempo through the taps: t = a + b·k */
  function fit(bs) {
    const n = bs.length;
    let sk = 0, st = 0, skk = 0, skt = 0;
    bs.forEach((t, k) => { sk += k; st += t; skk += k * k; skt += k * t; });
    const b = (n * skt - sk * st) / (n * skk - sk * sk);
    const a = (st - b * sk) / n;
    return { a, b };
  }
  function evenOut(fill) {
    const bs = api.project.beats || [];
    if (bs.length < 2) return;
    const { a, b } = fit(bs);
    if (!(b > 0.15 && b < 3)) { alert('Those taps are too irregular to even out.'); return; }
    let k0 = 0, k1 = bs.length - 1;
    if (fill) {
      const end = api.state.audio ? api.state.audio.duration : api.timelineDuration();
      while (a + (k0 - 1) * b >= 0) k0--;
      while (a + (k1 + 1) * b <= end) k1++;
    }
    const out = [];
    for (let k = k0; k <= k1; k++) out.push(Math.round((a + k * b) * 1000) / 1000);
    // keep the numbering: count 1 stays on the first tapped beat; beats added in front are pick-ups
    api.mutate(() => {
      api.project.beats = out;
      api.project.beatZero = (api.project.beatZero || 0) - k0;
    });
  }
  function nudge(ms) {
    if (!(api.project.beats || []).length) return;
    api.mutate(() => { api.project.beats = api.project.beats.map((t) => Math.max(0, Math.round((t + ms / 1000) * 1000) / 1000)); });
  }

  // ---------------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------------
  function render() {
    const bs = api.project.beats || [];
    const info = $('#beatsInfo');
    if (bs.length < 2) {
      info.textContent = bs.length ? '1 beat — tap at least two.' : 'No beats yet. Tap along to the music to mark every beat; then formations can snap to beats and show counts.';
    } else {
      const per = (bs[bs.length - 1] - bs[0]) / (bs.length - 1);
      info.innerHTML = `<b>${bs.length}</b> beats · about <b>${Math.round(60 / per)}</b> BPM · ${api.fmtTime(bs[0])} – ${api.fmtTime(bs[bs.length - 1])} · ${Math.floor((bs.length - 1 - (api.project.beatZero || 0) + (api.project.beatOffset || 0)) / 8) + 1} eight-counts`;
    }
    const none = bs.length < 2;
    for (const id of ['#btnBeatsEven', '#btnBeatsFill', '#btnBeatsEarlier', '#btnBeatsLater']) $(id).disabled = none;
    $('#btnBeatsClear').disabled = !bs.length;
    $('#beatOffset').value = String(api.project.beatOffset || 0);
    const counts = $('#optTimeRef');
    counts.querySelector('option[value="counts"]').disabled = none;
    for (const v of ['beat', 'half']) $(`#optTimeStep option[value="${v}"]`).disabled = none;
  }

  $('#btnTapBeats').addEventListener('click', () => (api.state.tapping ? finish() : start()));
  $('#tapPad').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); tap(); });
  $('#btnBeatsEven').addEventListener('click', () => evenOut(false));
  $('#btnBeatsFill').addEventListener('click', () => evenOut(true));
  $('#btnBeatsEarlier').addEventListener('click', () => nudge(-20));
  $('#btnBeatsLater').addEventListener('click', () => nudge(20));
  $('#btnBeatsClear').addEventListener('click', () => { if (confirm('Remove all tapped beats?')) api.mutate(() => { api.project.beats = []; }); });
  $('#beatOffset').addEventListener('change', (e) => api.mutate(() => { api.project.beatOffset = parseInt(e.target.value, 10) || 0; }));

  window.StageBeats = { start, tap, finish, onKey, evenOut, nudge, render };
  render();
})();
