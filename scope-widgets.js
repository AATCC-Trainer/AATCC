/* v126 scope widgets (Marshal + Approach): drag a scope control (Scope range, Rings, RDV) from the control panel onto the radar scope.
   It becomes a small overlay showing its value with ◀ ▶ arrows that change the setting live (they drive the panel control, so both stay in step).
   Drag a widget by its name to move it; × or dragging it back off the scope removes it. Positions persist per page in localStorage. Mouse + touch (pointer events).
   v128: click a widget to select it (gold outline); arrow keys then change it (range 1 NM per step, rings cycle, RDV toggles); Esc or a click elsewhere deselects. */
(function () {
  const PAGE = /marshal/i.test(location.pathname) ? 'marshal' : 'approach', KEY = 'stinger_scopeWidgets_' + PAGE;
  const $ = id => document.getElementById(id);
  const DEF = {
    scope: { name: 'RANGE', el: () => $('liveScope'), val: el => el.value + ' NM',
      step(el, d) { const lo = +el.min || 5, hi = +el.max || 40; return Math.max(lo, Math.min(hi, Math.round(+el.value) + (d > 0 ? 1 : -1))); },   // v128: 1 NM per step (scope limits: Marshal 5-40, Approach 5-80)
      set(el, v) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } },
    ring: { name: 'RINGS', el: () => $('liveRing'), val: el => el.value + ' NM',
      step(el, d) { const o = [...el.options].map(x => x.value), i = o.indexOf(el.value); return o[((i + d) % o.length + o.length) % o.length]; },   // v128: cycles 1/2/5/10
      set(el, v) { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); } },
    rdv: { name: 'RDV', el: () => $('liveRdv'), val: el => el.checked ? 'ON' : 'OFF', step(el) { return !el.checked; },
      set(el, v) { el.checked = !!v; el.dispatchEvent(new Event('change', { bubbles: true })); } }
  };
  const IDS = { liveScope: 'scope', liveRing: 'ring', liveRdv: 'rdv' };
  let wrap = null, W = {}, SEL = null;   // v128: selected widget key (click it; arrow keys change it, Esc / click elsewhere deselects)
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.values(W).map(w => ({ k: w.k, x: +w.x.toFixed(4), y: +w.y.toFixed(4) })))); } catch (e) {} };
  const inWrap = (cx, cy) => { const r = wrap.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; };
  function css() {
    const s = document.createElement('style');
    s.textContent = `.swGrip{cursor:grab;color:#8fd8ff;padding:0 3px;touch-action:none;font-size:13px;line-height:1}
.swW{position:absolute;z-index:6;display:flex;align-items:center;gap:3px;background:rgba(4,16,24,.86);border:1px solid #2e6f86;border-radius:6px;padding:2px 3px;font:12px ui-monospace,Menlo,Consolas,monospace;color:#cfe;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 1px 6px rgba(0,0,0,.5)}
.swW .swN{cursor:move;color:#8fd8ff;padding:2px 4px;font-size:11px;letter-spacing:.5px}
.swW .swV{min-width:4.2em;text-align:center;color:#5ff;font-weight:bold}
.swW button{min-height:0;min-width:0;width:24px;height:24px;padding:0;font-size:12px;line-height:22px;border-radius:4px;background:#0c2a36;color:#cfe;border:1px solid #2e6f86;cursor:pointer}
.swW button.swX{width:20px;background:transparent;border-color:transparent;color:#f99}
.swW.swSel{border-color:#ffd27a;box-shadow:0 0 0 2px #ffd27a,0 0 10px rgba(255,210,122,.6)}.swW:focus{outline:none}
.swGhost{position:fixed;z-index:9999;pointer-events:none;opacity:.85}
#scopeWrap.swDrop{outline:2px dashed #5ff;outline-offset:-3px}`;
    document.head.appendChild(s);
  }
  function refresh() { for (const w of Object.values(W)) { const el = DEF[w.k].el(); if (el) w.v.textContent = DEF[w.k].val(el); } }
  function place(w) { const r = wrap.getBoundingClientRect(), bw = w.d.offsetWidth || 120, bh = w.d.offsetHeight || 28;
    w.x = Math.max(0, Math.min(1, w.x)); w.y = Math.max(0, Math.min(1, w.y));
    w.d.style.left = Math.max(0, Math.min(r.width - bw, w.x * r.width)) + 'px'; w.d.style.top = Math.max(0, Math.min(r.height - bh, w.y * r.height)) + 'px'; }
  function select(k) { if (SEL && W[SEL]) W[SEL].d.classList.remove('swSel'); SEL = k && W[k] ? k : null;
    if (SEL) { const w = W[SEL]; w.d.classList.add('swSel'); const ae = document.activeElement; if (ae && ae !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur(); try { w.d.focus({ preventScroll: true }); } catch (e) {} } }
  function bump(k, dir) { const el = DEF[k] && DEF[k].el(); if (!el) return; DEF[k].set(el, DEF[k].step(el, dir)); refresh(); }
  function remove(k) { const w = W[k]; if (!w) return; if (SEL === k) select(null); w.d.remove(); delete W[k]; save(); }
  function add(k, x, y) {
    if (!DEF[k] || !DEF[k].el()) return null;
    if (W[k]) { W[k].x = x; W[k].y = y; place(W[k]); save(); return W[k]; }
    const d = document.createElement('div'); d.className = 'swW'; d.dataset.k = k; d.tabIndex = -1; d.title = 'Click to select, then use the arrow keys (Esc to deselect)';
    d.innerHTML = `<span class="swN" title="Drag to move; drag off the scope to remove">${DEF[k].name}</span><button class="swL" tabindex="-1" title="Previous">◀</button><span class="swV"></span><button class="swR" tabindex="-1" title="Next">▶</button><button class="swX" tabindex="-1" title="Remove from scope">×</button>`;
    wrap.appendChild(d);
    const w = W[k] = { k, d, x, y, v: d.querySelector('.swV') };
    d.addEventListener('mousedown', e => e.preventDefault());   // keep keyboard focus (Space = PTT, typed commands)
    d.addEventListener('pointerdown', () => select(k), true);   // any click on the widget selects it
    d.querySelector('.swL').addEventListener('click', e => { e.stopPropagation(); bump(k, -1); });
    d.querySelector('.swR').addEventListener('click', e => { e.stopPropagation(); bump(k, 1); });
    d.querySelector('.swX').addEventListener('click', e => { e.stopPropagation(); remove(k); });
    d.querySelector('.swN').addEventListener('pointerdown', e => {   // move the widget
      e.preventDefault(); e.stopPropagation(); const r = wrap.getBoundingClientRect(), b = d.getBoundingClientRect(), ox = e.clientX - b.left, oy = e.clientY - b.top;
      const mv = ev => { const r2 = wrap.getBoundingClientRect(); w.x = (ev.clientX - ox - r2.left) / r2.width; w.y = (ev.clientY - oy - r2.top) / r2.height; place(w); d.style.opacity = inWrap(ev.clientX, ev.clientY) ? '' : '.45'; };
      const up = ev => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); d.style.opacity = '';
        if (!inWrap(ev.clientX, ev.clientY)) remove(k); else save(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    ['pointerdown', 'click', 'wheel', 'contextmenu'].forEach(t => d.addEventListener(t, e => e.stopPropagation()));   // don't select/accept targets under the widget
    refresh(); place(w); save(); return w;
  }
  function dragFrom(k, e, lbl) {   // drag a panel control onto the scope
    const sx = e.clientX, sy = e.clientY; let g = null;
    const mv = ev => { if (!g) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; g = document.createElement('div'); g.className = 'swW swGhost'; g.innerHTML = `<span class="swN">${DEF[k].name}</span><span class="swV">${DEF[k].val(DEF[k].el())}</span>`; document.body.appendChild(g); }
      g.style.left = ev.clientX - 20 + 'px'; g.style.top = ev.clientY - 12 + 'px'; wrap.classList.toggle('swDrop', inWrap(ev.clientX, ev.clientY)); };
    const up = ev => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); wrap.classList.remove('swDrop');
      if (!g) return; g.remove(); if (ev.type === 'pointerup' && inWrap(ev.clientX, ev.clientY)) { const r = wrap.getBoundingClientRect(); add(k, (ev.clientX - 20 - r.left) / r.width, (ev.clientY - 12 - r.top) / r.height); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  function init() {
    wrap = $('scopeWrap'); if (!wrap) return; css();
    for (const [id, k] of Object.entries(IDS)) {
      const el = $(id), lbl = el && el.closest('label'); if (!lbl) continue;
      const gr = document.createElement('span'); gr.className = 'swGrip'; gr.textContent = '⠿'; gr.title = 'Drag onto the radar scope'; lbl.insertBefore(gr, lbl.firstChild);
      lbl.title = (lbl.title || '') + ' · drag onto the scope for an on-scope control';
      gr.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dragFrom(k, e, lbl); });
      gr.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      lbl.addEventListener('pointerdown', e => { if (e.target === lbl || (e.target.nodeType === 1 && !/^(INPUT|SELECT|OPTION|B)$/.test(e.target.tagName) && e.target !== gr)) dragFrom(k, e, lbl); });
      ['input', 'change'].forEach(t => el.addEventListener(t, refresh));
      if (id === 'liveScope') { const n = $('liveScopeVal'); if (n) n.addEventListener('change', refresh); }
    }
    for (const s of load()) add(s.k, s.x, s.y);
    // v128: keyboard for the selected widget. Capture phase on window, so the page's own arrow-key handlers (data-block nudge) never see it.
    window.addEventListener('keydown', e => {
      if (!SEL || !W[SEL]) return;
      const ae = document.activeElement, typing = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable) && !(W[SEL] && W[SEL].d.contains(ae));
      if (typing) return;   // typing in the command / shorthand box is never affected
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight', dn = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
      if (up || dn) { e.preventDefault(); e.stopImmediatePropagation(); bump(SEL, up ? 1 : -1); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); select(null); }
    }, true);
    document.addEventListener('pointerdown', e => { if (SEL && !(e.target.closest && e.target.closest('.swW'))) select(null); }, true);   // click anywhere else deselects
    window.addEventListener('resize', () => Object.values(W).forEach(place));
    setInterval(refresh, 700);   // settings dialog / keyboard zoom change the values programmatically
  }
  window.ScopeWidgets = { add, remove, select, get selected() { return SEL; }, list: () => Object.keys(W), refresh, get KEY() { return KEY; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
