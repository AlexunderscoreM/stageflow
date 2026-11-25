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
    S.tapping = { taps: [], ones: [], from: S.time };
    $('#tapPad').classList.remove('hidden');
    $('#tapCount').textContent = '0';
    $('#btnTapBeats span').textContent = 'Finish tapping';
    $('#btnTapBeats').classList.add('on');
    if (document.activeElement) document.activeElement.blur();
    api.play();
  }

  /** Record a beat. one = true also starts a new 8-count here (this beat is a "1"). */
  function tap(one = false) {
    const S = api.state;
    if (!S.tapping) return;
    const t = nowAudioTime();
    const taps = S.tapping.taps;
    if (taps.length && t - taps[taps.length - 1] < 0.12) {
      // a double hit: if it was the "1" key, upgrade the beat just tapped instead of adding another
      if (one && !S.tapping.ones.includes(taps[taps.length - 1])) S.tapping.ones.push(taps[taps.length - 1]);
      return;
    }
    const tt = Math.round(t * 1000) / 1000;
    taps.push(tt);
    if (one) S.tapping.ones.push(tt);
    $('#tapCount').textContent = String(taps.length);
    $('#tapOnes').textContent = S.tapping.ones.length ? `${S.tapping.ones.length} new “1”${S.tapping.ones.length > 1 ? 's' : ''}` : '';
    const pad = $('#tapPad');
    pad.classList.add(one ? 'flash-one' : 'flash');
    setTimeout(() => pad.classList.remove('flash', 'flash-one'), one ? 160 : 90);
  }

  function finish() {
    const S = api.state;
    if (!S.tapping) return;
    const taps = S.tapping.taps.slice().sort((a, b) => a - b);
    const ones = S.tapping.ones.slice();
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
      // section starts: replace the old ones inside the tapped stretch with the new "1"s
      api.project.phrases = (api.project.phrases || []).filter((p) => p < lo || p > hi).concat(ones).sort((a, b) => a - b);
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
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) tap(e.shiftKey); return true; }
    if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); if (!e.repeat) tap(true); return true; }
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
    const sh = (t) => Math.max(0, Math.round((t + ms / 1000) * 1000) / 1000);
    api.mutate(() => { api.project.beats = api.project.beats.map(sh); api.project.phrases = (api.project.phrases || []).map(sh); });
  }

  /** Beat nearest the playhead (index), or null. */
  function nearestBeat() {
    const p = api.beatAt(api.state.time);
    return p == null ? null : Math.round(p);
  }
  /** Label of the section-start button follows the playhead. */
  function refreshOne() {
    const ob = $('#btnBeatOne');
    const none = (api.project.beats || []).length < 2;
    const k = none ? null : nearestBeat();
    const isOne = k != null && api.phraseIndexes().includes(k);
    ob.disabled = none;
    const txt = isOne ? 'Undo the “1” at the playhead' : `Make the beat at the playhead a “1”${k != null ? ` (now ${api.countOf(k).c}·${api.countOf(k).b})` : ''}`;
    if (ob.textContent !== txt) ob.textContent = txt;
  }
  /** Make the beat at the playhead a "1" (start a new 8-count there), or stop it being one. */
  function toggleOneAtPlayhead() {
    const k = nearestBeat();
    if (k == null) return;
    const t = Math.round(api.timeOfBeat(k) * 1000) / 1000;
    const isOne = api.phraseIndexes().includes(k);
    api.mutate(() => {
      const ph = api.project.phrases || [];
      api.project.phrases = isOne
        ? ph.filter((p) => Math.round(api.beatAt(p)) !== k)
        : ph.concat(t).sort((a, b) => a - b);
    });
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
      info.innerHTML = `<b>${bs.length}</b> beats · about <b>${Math.round(60 / per)}</b> BPM · ${api.fmtTime(bs[0])} – ${api.fmtTime(bs[bs.length - 1])} · ${api.countOf(bs.length - 1).c} eight-counts${api.phraseIndexes().length ? ` · ${api.phraseIndexes().length} section start${api.phraseIndexes().length > 1 ? 's' : ''}` : ''}`;
    }
    const none = bs.length < 2;
    for (const id of ['#btnBeatsEven', '#btnBeatsFill', '#btnBeatsEarlier', '#btnBeatsLater']) $(id).disabled = none;
    $('#btnBeatsClear').disabled = !bs.length;
    // section starts ("1"s that don't fall on an 8-count)
    const k = none ? null : nearestBeat();
    const isOne = k != null && api.phraseIndexes().includes(k);
    refreshOne();
    const list = $('#phraseList');
    const idx = none ? [] : api.phraseIndexes();
    list.innerHTML = '';
    for (const pk of idx) {
      const t = api.timeOfBeat(pk), cb = api.countOf(pk);
      const chip = document.createElement('span'); chip.className = 'phrase-chip';
      chip.innerHTML = `<button class="go"></button><button class="x" title="Remove — counting carries on as before">✕</button>`;
      chip.querySelector('.go').textContent = `${cb.c}·1 at ${api.fmtTime(t)}`;
      chip.querySelector('.go').title = 'Go to this section start';
      chip.querySelector('.go').onclick = () => { api.setTime(t); };
      chip.querySelector('.x').onclick = () => api.mutate(() => { api.project.phrases = (api.project.phrases || []).filter((p) => Math.round(api.beatAt(p)) !== pk); });
      list.appendChild(chip);
    }
    $('#phraseHint').classList.toggle('hidden', !idx.length);
    $('#beatOffset').value = String(api.project.beatOffset || 0);
    const counts = $('#optTimeRef');
    counts.querySelector('option[value="counts"]').disabled = none;
    for (const v of ['beat', 'half']) $(`#optTimeStep option[value="${v}"]`).disabled = none;
  }

  $('#btnTapBeats').addEventListener('click', () => (api.state.tapping ? finish() : start()));
  $('#tapPad').addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); tap(e.button === 2 || e.shiftKey); });
  $('#tapPad').addEventListener('contextmenu', (e) => e.preventDefault());
  $('#btnBeatsEven').addEventListener('click', () => evenOut(false));
  $('#btnBeatsFill').addEventListener('click', () => evenOut(true));
  $('#btnBeatsEarlier').addEventListener('click', () => nudge(-20));
  $('#btnBeatsLater').addEventListener('click', () => nudge(20));
  $('#btnBeatOne').addEventListener('click', toggleOneAtPlayhead);
  $('#btnBeatsClear').addEventListener('click', () => { if (confirm('Remove all tapped beats?')) api.mutate(() => { api.project.beats = []; api.project.phrases = []; }); });
  $('#beatOffset').addEventListener('change', (e) => api.mutate(() => { api.project.beatOffset = parseInt(e.target.value, 10) || 0; }));

  window.StageBeats = { start, tap, finish, onKey, evenOut, nudge, render, toggleOneAtPlayhead, refreshOne };
  render();
})();
