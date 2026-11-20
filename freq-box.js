/* freq-box.js (v113; v114 adds Teal = Departure; Green is not used because "go green" is the helo deck call): small movable "Frequencies" box for the Marshal, Approach, Final (incl. guided intro) and Instructor scopes.
   Shows the frequency of the position you are working (top, highlighted) and the other permanent color frequencies with their positions.
   Colors / positions come from the scopes' permanent frequencies (FREQ_TAG / FREQ_HELP and the handoff calls "go red / go silver /
   go purple / go copper"); the trainer defines no frequency numbers, so none are shown. Drag the header to move it (position kept in
   localStorage 'aatccFreqBox'); click ▾/▸ to collapse. */
(function () {
  if (window.FreqBox) return;
  const FREQS = [   // color name, tag on the data blocks, swatch, position, self-ID, handoff call
    { id: 'teal', name: 'Teal', tag: 'TEAL', sw: '#3fd6c8', pos: 'departure', who: 'Departure', self: 'Gator Departure', call: 'go teal' },
    { id: 'red', name: 'Red', tag: 'RED', sw: '#ff5a6e', pos: 'marshal', who: 'Marshal', self: 'Gator Marshal', call: 'go red' },
    { id: 'silver', name: 'Silver', tag: 'SLVR', sw: '#c9ced6', pos: 'approach', who: 'Approach', self: 'Gator Approach', call: 'go silver' },
    { id: 'purple', name: 'Purple', tag: 'PRPL', sw: '#b48cff', pos: 'final', who: 'Final', self: 'Gator Final', call: 'go purple' },
    { id: 'copper', name: 'Copper', tag: 'COPR', sw: '#e0915a', pos: 'final', who: 'Final (2nd)', self: 'Gator Final', call: 'go copper' },
  ];
  const TOWER = { name: 'Tower', who: 'PriFly', sw: null };
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const POS = /marshal/.test(page) ? 'marshal' : /approach/.test(page) ? 'approach' : /departure/.test(page) ? 'departure' : /final/.test(page) ? 'final' : /instructor/.test(page) ? 'instructor' : null;
  if (!POS) return;
  const KEY = 'aatccFreqBox';
  const st = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const css = `#freqBox{position:fixed;z-index:9;min-width:190px;max-width:250px;background:rgba(12,10,26,0.92);border:1px solid rgba(150,140,200,0.35);border-radius:6px;
    font:11.5px/1.35 Consolas,Menlo,"DejaVu Sans Mono","Courier New",monospace;color:#dcdaec;box-shadow:0 4px 14px rgba(0,0,0,0.45);user-select:none;-webkit-user-select:none}
  #freqBox .fbH{display:flex;align-items:center;gap:6px;padding:4px 7px;cursor:move;touch-action:none;border-bottom:1px solid rgba(150,140,200,0.2);color:#a9a4cc;letter-spacing:0.06em;font-size:10.5px}
  #freqBox .fbH b{flex:1;font-weight:600}
  #freqBox .fbT{cursor:pointer;background:none;border:0;color:#a9a4cc;font:inherit;font-size:12px;padding:0 2px;min-height:0;line-height:1}
  #freqBox.col .fbB{display:none} #freqBox.col .fbH{border-bottom:0}
  #freqBox .fbB{padding:5px 7px 6px}
  #freqBox .fbMe{display:flex;align-items:center;gap:7px;padding:4px 6px;margin-bottom:5px;border-radius:4px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18)}
  #freqBox .fbMe .nm{font-weight:700;font-size:13px} #freqBox .fbMe .ps{color:#a9a4cc;font-size:10.5px}
  #freqBox .sw{display:inline-block;width:10px;height:10px;border-radius:2px;flex:none;border:1px solid rgba(0,0,0,0.5)}
  #freqBox .sw.none{background:transparent;border:1px dashed #6f6a9a}
  #freqBox .row{display:flex;align-items:center;gap:7px;padding:1px 2px} #freqBox .row .nm{width:52px} #freqBox .row .ps{color:#a9a4cc}
  #freqBox .row.mine .ps{color:#dcdaec} #freqBox .tg{color:#6f6a9a;font-size:10px;margin-left:auto;padding-left:4px}
  #freqBox .row.dim{opacity:0.6}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render(box) {
    const mine = FREQS.filter(f => f.pos === POS);
    let me;
    if (POS === 'instructor') me = `<div class="fbMe"><span class="sw none"></span><div><div class="nm">All frequencies</div><div class="ps">Instructor (monitoring)</div></div></div>`;
    else me = `<div class="fbMe">${mine.map(f => `<span class="sw" style="background:${f.sw}"></span>`).join('')}<div><div class="nm">${mine.map(f => esc(f.name)).join(' / ')}</div><div class="ps">You: ${esc(mine[0].self)}</div></div></div>`;
    const rows = FREQS.map(f => `<div class="row${f.pos === POS ? ' mine' : ''}"><span class="sw" style="background:${f.sw}"></span><span class="nm">${esc(f.name)}</span><span class="ps">${esc(f.who)}</span><span class="tg">${esc(f.tag)}</span></div>`).join('')
      + `<div class="row dim"><span class="sw none"></span><span class="nm">${esc(TOWER.name)}</span><span class="ps">${esc(TOWER.who)}</span></div>`;
    box.innerHTML = `<div class="fbH"><b>FREQUENCIES</b><button type="button" class="fbT" title="Collapse / expand">${st.col ? '▸' : '▾'}</button></div><div class="fbB">${me}${rows}</div>`;
    box.classList.toggle('col', !!st.col);
  }
  function place(box) {
    const w = box.offsetWidth || 200, h = box.offsetHeight || 40, W = window.innerWidth, H = window.innerHeight;
    let x = st.x != null ? st.x : 12, y = st.y != null ? st.y : H - h - 12;
    x = Math.max(0, Math.min(W - Math.min(w, 60), x)); y = Math.max(0, Math.min(H - 24, y));
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function init() {
    if (document.getElementById('freqBox')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const box = document.createElement('div'); box.id = 'freqBox'; box.setAttribute('role', 'complementary'); box.setAttribute('aria-label', 'Frequencies');
    // keep keystrokes / clicks inside the box away from the scope's hotkeys and click-to-select
    ['keydown', 'keyup'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
    render(box); document.body.appendChild(box); place(box);
    let drag = null;
    box.addEventListener('pointerdown', e => {
      if (e.target.closest('.fbT')) return; if (!e.target.closest('.fbH')) { e.stopPropagation(); return; }
      const r = box.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, moved: false };
      try { box.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); e.stopPropagation();
    });
    box.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; drag.moved = true; st.x = Math.round(e.clientX - drag.dx); st.y = Math.round(e.clientY - drag.dy); place(box); });
    const end = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; save(); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('click', e => { e.stopPropagation(); if (e.target.closest('.fbT')) { st.col = !st.col; save(); render(box); place(box); } });
    box.addEventListener('mousedown', e => e.stopPropagation());
    window.addEventListener('resize', () => place(box));
  }
  window.FreqBox = { FREQS, POS, init, reset() { delete st.x; delete st.y; save(); const b = document.getElementById('freqBox'); if (b) place(b); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
