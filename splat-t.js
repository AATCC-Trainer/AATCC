/* SPLAT-T: range/bearing line from an aircraft (Marshal, Approach, Instructor scopes).
   Hover a target and press T: a dashed line runs from the aircraft to the pointer with a live
   bearing/range label (bearing from the aircraft to the pointer, 001-360, scope frame).
   Press T again: the far end is fixed at that spot (NM from the ship) while the line stays
   anchored to the aircraft, so the numbers update as it moves. C over a line's aircraft or
   end clears that line; C anywhere else on the scope clears them all.
   Keys are taken only when the pointer is over the scope and you are not typing (focus not
   in a text field, or the field is empty), so letters typed into a command are never eaten.
   Page adapter (SplatT.attach):
     canvas            scope canvas element
     toScreen(e, n)    NM east/north of the ship -> canvas CSS px [x, y]
     toWorld(x, y)     canvas CSS px -> [e, n] NM
     aircraft()        [{ id, e, n, cs }] targets currently drawn on the scope (display position)
     ctx()             2D context in CSS px (page sets its DPR transform)
     enabled()         optional: false while overlays / start screens are up
     simKey()          optional: value that changes (or a time that goes backwards) on a new sim -> clear */
(function () {
  'use strict';
  const HOVER_PX = 15, END_PX = 12, COL = 'rgba(255,110,230,0.95)', BOX = 'rgba(25,4,22,0.85)';
  const S = { ad: null, lines: [], draft: null, mx: null, my: null, cx: null, cy: null, over: false, lastKey: undefined };
  const n360 = d => { d = Math.round(((d % 360) + 360) % 360); return d === 0 ? 360 : d; };
  const h3 = d => String(n360(d)).padStart(3, '0');
  function rb(a, e, n) { const de = e - a.e, dn = n - a.n; return { brg: n360(Math.atan2(de, dn) * 180 / Math.PI), rng: Math.hypot(de, dn) }; }
  function label(a, e, n) { const r = rb(a, e, n); return { text: `${a.cs ? a.cs + ' ' : ''}${h3(r.brg)}/${r.rng.toFixed(1)} NM`, brg: r.brg, rng: Math.round(r.rng * 10) / 10 }; }
  function acList() { try { return (S.ad.aircraft() || []).filter(a => a && isFinite(a.e) && isFinite(a.n)); } catch (e) { return []; } }
  function acById(id) { return acList().find(a => a.id === id) || null; }
  function acAt(x, y) {
    let best = null, bd = HOVER_PX;
    for (const a of acList()) { const [sx, sy] = S.ad.toScreen(a.e, a.n), d = Math.hypot(sx - x, sy - y); if (d <= bd) { bd = d; best = a; } }
    return best;
  }
  function typing(t) {
    if (!t || t === document.body) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (t.isContentEditable) return true;
    if (tag === 'textarea') return !!t.value;
    if (tag === 'input') { const ty = (t.type || 'text').toLowerCase(); if (!/^(text|search|tel|url|email|number|password)$/.test(ty)) return false; return !!t.value; }
    return false;
  }
  function pointerOnScope() {
    if (!S.over || S.cx == null) return false;
    const el = document.elementFromPoint(S.cx, S.cy);   // an overlay on top of the scope wins
    return el === S.ad.canvas;
  }
  function checkSim() {
    if (!S.ad.simKey) return;
    let k; try { k = S.ad.simKey(); } catch (e) { return; }
    if (S.lastKey !== undefined && (typeof k === 'number' && typeof S.lastKey === 'number' ? k < S.lastKey - 1 : k !== S.lastKey)) api.clear();
    S.lastKey = k;
  }
  function onKey(e) {
    if (!S.ad || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key; if (k !== 't' && k !== 'T' && k !== 'c' && k !== 'C') return;
    if (typing(e.target)) return;   // never eat a letter while a command is being typed
    try { if (S.ad.enabled && !S.ad.enabled()) return; } catch (_) { return; }
    const on = pointerOnScope();
    if (k === 't' || k === 'T') {
      if (S.draft) { stop(e); if (e.repeat) return; const [we, wn] = S.draft.end; S.lines.push({ id: S.draft.id, cs: S.draft.cs, e: we, n: wn }); S.draft = null; return; }
      if (!on) return;
      const a = acAt(S.mx, S.my); if (!a) return;   // nothing under the pointer: leave the key alone
      stop(e); if (e.repeat) return;
      S.draft = { id: a.id, cs: a.cs, end: S.ad.toWorld(S.mx, S.my) };
      return;
    }
    // C: clear
    if (!on && !S.draft) return;
    if (!S.draft && !S.lines.length) return;
    stop(e); if (e.repeat) return;
    if (S.draft) { S.draft = null; return; }
    let hit = -1, bd = Infinity;
    S.lines.forEach((l, i) => {
      const [ex, ey] = S.ad.toScreen(l.e, l.n), de = Math.hypot(ex - S.mx, ey - S.my);
      const a = acById(l.id); const da = a ? (p => Math.hypot(p[0] - S.mx, p[1] - S.my))(S.ad.toScreen(a.e, a.n)) : Infinity;
      const d = Math.min(de <= END_PX ? de : Infinity, da <= HOVER_PX ? da : Infinity);
      if (d < bd) { bd = d; hit = i; }
    });
    if (hit >= 0) S.lines.splice(hit, 1); else S.lines = [];
  }
  function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function drawOne(c, a, e, n, live) {
    const [x0, y0] = S.ad.toScreen(a.e, a.n), [x1, y1] = S.ad.toScreen(e, n), L = label(a, e, n);
    c.save();
    c.strokeStyle = COL; c.lineWidth = 1.2; c.setLineDash(live ? [6, 4] : [4, 4]);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(x1, y1, live ? 2.5 : 3, 0, 2 * Math.PI); live ? c.stroke() : (c.fillStyle = COL, c.fill());
    c.font = '12px Consolas, Menlo, "DejaVu Sans Mono", monospace'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const t = L.text, w = c.measureText(t).width + 8, W = c.canvas.clientWidth || 1e4, H = c.canvas.clientHeight || 1e4;
    let lx = x1 + 10, ly = y1 + 18; if (lx + w > W - 4) lx = x1 - 10 - w; if (ly > H - 6) ly = y1 - 10;
    c.fillStyle = BOX; c.fillRect(lx, ly - 13, w, 17); c.strokeStyle = COL; c.lineWidth = 1; c.strokeRect(lx + 0.5, ly - 12.5, w - 1, 16);
    c.fillStyle = COL; c.fillText(t, lx + 4, ly);
    c.restore();
    return L;
  }
  const api = {
    attach(ad) {
      S.ad = ad; const cv = ad.canvas;
      const mv = e => { const r = cv.getBoundingClientRect(); S.mx = e.clientX - r.left; S.my = e.clientY - r.top; S.cx = e.clientX; S.cy = e.clientY; S.over = true;
        if (S.draft) S.draft.end = ad.toWorld(S.mx, S.my); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerenter', mv);
      cv.addEventListener('pointerleave', () => { S.over = false; });
      window.addEventListener('keydown', onKey, true);   // capture: before the page's own key handlers and the input
      return api;
    },
    draw() {
      if (!S.ad) return; checkSim();
      const c = S.ad.ctx(); if (!c) return; const out = [];
      const now = Date.now();   // a target hidden for a moment (cone of confusion, sweep) keeps its line; gone for 20 s drops it
      S.lines = S.lines.filter(l => { const a = acById(l.id); if (!a) { l.miss = l.miss || now; return now - l.miss < 20000; } l.miss = 0; out.push(drawOne(c, a, l.e, l.n, false)); return true; });
      if (S.draft) { const a = acById(S.draft.id); if (a) { S.draft.miss = 0; S.draft.label = drawOne(c, a, S.draft.end[0], S.draft.end[1], true); } else { S.draft.miss = S.draft.miss || now; if (now - S.draft.miss > 20000) S.draft = null; } }
      S.lastLabels = out;
    },
    clear() { S.lines = []; S.draft = null; },
    state() {   // test / debug view
      const L = l => { const a = acById(l.id); return a ? Object.assign({ cs: l.cs, end: [l.e, l.n], ac: [a.e, a.n] }, label(a, l.e, l.n)) : null; };
      return { lines: S.lines.map(L), draft: S.draft ? L({ id: S.draft.id, cs: S.draft.cs, e: S.draft.end[0], n: S.draft.end[1] }) : null, mouse: [S.mx, S.my], over: S.over };
    },
    screenOf: (e, n) => S.ad.toScreen(e, n),   // test hook
    _rb: rb,
  };
  window.SplatT = api;
})();
