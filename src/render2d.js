'use strict';
/* StageFlow — canvas renderer for exports (video, PDF), teach mode and dashboard thumbnails.
   Pure drawing: give it a project, a map of positions and options. */
(function () {
  const SHAPE_PTS = {
    triangle: [[0, -0.98], [0.95, 0.72], [-0.95, 0.72]],
    diamond: [[0, -1], [0.92, 0], [0, 1], [-0.92, 0]],
    hexagon: Array.from({ length: 6 }, (_, i) => [Math.cos(-Math.PI / 2 + i * Math.PI / 3) * 0.95, Math.sin(-Math.PI / 2 + i * Math.PI / 3) * 0.95]),
    star: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.48 : 1.02; return [Math.cos(a) * r, Math.sin(a) * r]; })
  };

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) return last.slice(0, 2);
      return (parts[0][0] + last[0]).toUpperCase();
    }
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }
  function fmt(n) { return String(Math.round(n * 10) / 10); }

  function shapePath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'square') { const s = r * 0.8; if (ctx.roundRect) ctx.roundRect(x - s, y - s, s * 2, s * 2, r * 0.22); else ctx.rect(x - s, y - s, s * 2, s * 2); return; }
    const pts = SHAPE_PTS[shape];
    if (!pts) { ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); return; }
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * r, y + py * r) : ctx.moveTo(x + px * r, y + py * r)));
    ctx.closePath();
  }

  /**
   * @param ctx    2D context (already scaled for DPR if wanted)
   * @param w,h    size in CSS px
   * @param project StageFlow project
   * @param pos    { [dancerId]: {x,y} }
   * @param opts   { theme:'dark'|'light', showNames, highlight:Set|null, title, subtitle, numbers:boolean,
   *                 from:{id:{x,y}} (ghost + arrows), pad }
   */
  function drawStage(ctx, w, h, project, pos, opts = {}) {
    const S = project.stage;
    const light = opts.theme === 'light';
    const C = light
      ? { bg: '#ffffff', floor: '#f4f6fa', minor: 'rgba(0,0,0,.06)', major: 'rgba(0,0,0,.18)', center: 'rgba(11,87,208,.6)', border: '#5f6368', label: '#5f6368', aud: '#0b57d0', text: '#1f1f1f', nameBg: 'rgba(255,255,255,.92)' }
      : { bg: '#1b1c1e', floor: '#25272a', minor: 'rgba(255,255,255,.045)', major: 'rgba(255,255,255,.14)', center: 'rgba(168,199,250,.55)', border: 'rgba(255,255,255,.35)', label: '#9aa0a6', aud: '#a8c7fa', text: '#e3e3e3', nameBg: 'rgba(32,33,36,.88)' };
    const compact = !!opts.compact;
    const top = compact ? 6 : opts.title ? 56 : 30;
    const padX = compact ? 6 : (opts.pad ?? 56), padBottom = compact ? 6 : 54;
    const aw = Math.max(20, w - padX * 2), ah = Math.max(20, h - top - padBottom);
    const scale = Math.min(aw / S.width, ah / S.depth);
    const flip = S.audience === 'top' ? -1 : 1;
    const cx = w / 2, cy = top + ah / 2;
    const P = (p) => ({ x: cx + flip * p.x * scale, y: cy + flip * p.y * scale });

    ctx.save();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const a = P({ x: -S.width / 2, y: -S.depth / 2 }), b = P({ x: S.width / 2, y: S.depth / 2 });
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    ctx.fillStyle = C.floor; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const colW = (x1 - x0) / S.columns, rowH = (y1 - y0) / S.rows;
    ctx.lineWidth = 1;
    for (const [style, isMajor] of [[C.minor, false], [C.major, true]]) {
      ctx.strokeStyle = style; ctx.beginPath();
      for (let i = 1; i < S.columns * S.subdivisions; i++) {
        if ((i % S.subdivisions === 0) !== isMajor) continue;
        const x = Math.round(x0 + (i * colW) / S.subdivisions) + 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      }
      for (let i = 1; i < S.rows * S.subdivisions; i++) {
        if ((i % S.subdivisions === 0) !== isMajor) continue;
        const y = Math.round(y0 + (i * rowH) / S.subdivisions) + 0.5; ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
    const c = P({ x: 0, y: 0 });
    ctx.strokeStyle = C.center; ctx.setLineDash([6, 5]); ctx.beginPath();
    ctx.moveTo(Math.round(c.x) + 0.5, y0); ctx.lineTo(Math.round(c.x) + 0.5, y1);
    ctx.moveTo(x0, Math.round(c.y) + 0.5); ctx.lineTo(x1, Math.round(c.y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    const fontPx = Math.max(9, Math.min(12, w / 90));
    if (!compact) {
    ctx.fillStyle = C.label; ctx.font = `${fontPx}px Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i <= S.columns; i++) {
      const xs = -S.width / 2 + (i * S.width) / S.columns;
      ctx.fillText(fmt(Math.abs(xs)), P({ x: xs, y: 0 }).x, flip > 0 ? y1 + 5 : y0 - 5 - fontPx);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= S.rows; i++) {
      const ys = -S.depth / 2 + (i * S.depth) / S.rows;
      ctx.fillText(fmt(Math.abs(ys)), x0 - 6, P({ x: 0, y: ys }).y);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = C.aud; ctx.font = `600 ${fontPx + 1}px Segoe UI, system-ui, sans-serif`;
    ctx.fillText('A U D I E N C E', cx, flip > 0 ? y1 + 30 : y0 - 30);
    } else {
      // audience edge marker
      ctx.fillStyle = C.aud; ctx.fillRect(x0, flip > 0 ? y1 + 1 : y0 - 3, x1 - x0, 2);
    }

    if (opts.title) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = C.text; ctx.font = `600 ${Math.max(14, w / 55)}px Segoe UI, system-ui, sans-serif`;
      ctx.fillText(opts.title, 16, 14);
      if (opts.subtitle) {
        ctx.textAlign = 'right'; ctx.fillStyle = C.label; ctx.font = `${Math.max(11, w / 80)}px Segoe UI, system-ui, sans-serif`;
        ctx.fillText(opts.subtitle, w - 16, 18);
      }
    }

    const R = compact ? Math.max(3, Math.min(8, scale * 0.8)) : Math.max(7, Math.min(24, scale * 0.85));
    // ghosts + arrows
    if (opts.from) {
      for (const d of project.dancers) {
        const A = opts.from[d.id], B = pos[d.id];
        if (!A || !B) continue;
        const pa = P(A), pb = P(B);
        ctx.globalAlpha = 0.25; ctx.fillStyle = d.color; shapePath(ctx, d.shape, pa.x, pa.y, R * 0.8); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = d.color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
    project.dancers.forEach((d, idx) => {
      const p = pos[d.id];
      if (!p) return;
      const s = P(p);
      const hl = opts.highlight && opts.highlight.size ? opts.highlight.has(d.id) : null;
      ctx.globalAlpha = hl === false ? 0.25 : 1;
      if (hl) { ctx.fillStyle = light ? 'rgba(11,87,208,.18)' : 'rgba(168,199,250,.3)'; ctx.beginPath(); ctx.arc(s.x, s.y, R * 1.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = light ? 2 : 4; ctx.shadowOffsetY = 1;
      ctx.fillStyle = d.color; shapePath(ctx, d.shape, s.x, s.y, R); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = hl ? 2.5 : 1.2; ctx.strokeStyle = hl ? (light ? '#0b57d0' : '#ffffff') : 'rgba(0,0,0,.35)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(R * (d.shape === 'triangle' || d.shape === 'star' ? 0.62 : 0.78))}px Segoe UI, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lbl = opts.numbers ? String(idx + 1) : initials(d.name);
      if (!compact) ctx.fillText(lbl, s.x, s.y + (d.shape === 'triangle' ? R * 0.18 : 0.5));
      if (!compact && opts.showNames !== false) {
        const fs = Math.max(9, Math.min(12, R * 0.7));
        ctx.font = `${fs}px Segoe UI, system-ui, sans-serif`;
        const tw = ctx.measureText(d.name).width;
        ctx.fillStyle = C.nameBg;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(s.x - tw / 2 - 6, s.y + R + 3, tw + 12, fs + 5, (fs + 5) / 2); else ctx.rect(s.x - tw / 2 - 6, s.y + R + 3, tw + 12, fs + 5); ctx.fill();
        ctx.fillStyle = C.text; ctx.textBaseline = 'top';
        ctx.fillText(d.name, s.x, s.y + R + 5);
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    return { toScreen: P, scale };
  }

  /**
   * Call-out for a position, StageFlow convention:
   *   first number  = distance from centre, left negative / right positive (as seen from the audience)
   *   second number = distance from the front edge of the stage
   * e.g. (-4, 6) = 4 ft left of centre, 6 ft back from the front.
   */
  function callout(project, p) {
    const u = project.stage.unit;
    const e = 0.05;
    const x = Math.abs(p.x) < e ? 0 : Math.round(p.x * 10) / 10;
    const front = Math.max(0, Math.round((project.stage.depth / 2 - p.y) * 10) / 10);
    const sx = x > 0 ? `+${fmt(x)}` : fmt(x);
    const short = `(${sx}, ${fmt(front)})`;
    const lx = x === 0 ? 'on center' : `${fmt(Math.abs(x))} ${u} ${x < 0 ? 'left' : 'right'} of center`;
    const ly = front === 0 ? 'at the very front' : `${fmt(front)} ${u} from the front`;
    return { short, long: `${lx} · ${ly}`, x, front };
  }

  window.StageRender = { drawStage, callout, initials, shapePath };
})();
