/* AATCC rendezvous points (v108), shared by Marshal, Approach and Instructor so every scope shows them in the same place.
   Fixed geographic positions: TRUE bearing / range (NM) from the ship's position (the scope centre). Each scope turns them into its
   magnetic-up frame with its own magnetic variation (true = magnetic + MV). Display only for now; rendezvous phraseology comes later.
   A point that falls in the final approach corridor (astern of the ship, inside 25 NM and within 3 NM of the course line) is not drawn. */
(function () {
  'use strict';
  const PTS = [   // [name, true bearing, range NM]
    ['COKE', 20, 14], ['WATER', 55, 28], ['MILK', 90, 18], ['COFFEE', 125, 35], ['TEA', 160, 12],
    ['JUICE', 200, 25], ['SODA', 235, 16], ['COCOA', 270, 32], ['PEPSI', 305, 22], ['LEMONADE', 340, 38],
  ];
  const DEG = Math.PI / 180, KEY = 'aatccRdv';
  const COL = 'rgba(255,214,40,0.95)', LBL = 'rgba(255,214,40,0.9)';
  let on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  const CORR = { len: 25, half: 3 };
  // display-frame points: mv = magnetic variation of the scope, fb = final bearing (magnetic) for the corridor check
  function list(mv, fb) {
    mv = +mv || 0;
    return PTS.map(([name, bt, r]) => {
      const bm = bt - mv, e = Math.sin(bm * DEG) * r, n = Math.cos(bm * DEG) * r;
      let hidden = false;
      if (fb != null && isFinite(fb)) { const ab = (+fb + 180) * DEG, along = e * Math.sin(ab) + n * Math.cos(ab), lat = e * Math.cos(ab) - n * Math.sin(ab); hidden = along > 0 && along < CORR.len && Math.abs(lat) < CORR.half; }
      return { name, brgT: bt, r, e, n, hidden };
    });
  }
  // P(e, n) -> [x, y] canvas px; call inside the scope clip, under aircraft and data blocks
  function draw(ctx, P, mv, fb, font) {
    if (!on) return;
    ctx.save(); ctx.font = font || '10px Consolas, Menlo, "DejaVu Sans Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const p of list(mv, fb)) {
      if (p.hidden) continue;
      const [x, y] = P(p.e, p.n);
      ctx.fillStyle = COL; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = LBL; ctx.fillText(p.name, x + 4, y - 4);
    }
    ctx.restore();
  }
  function setOn(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} document.querySelectorAll('.rdvChk').forEach(c => { c.checked = on; }); }
  function bindToggle(el) { if (!el) return; el.classList.add('rdvChk'); el.checked = on; el.addEventListener('change', () => { setOn(el.checked); el.blur(); }); }
  window.addEventListener('storage', e => { if (e.key === KEY) { on = e.newValue !== '0'; document.querySelectorAll('.rdvChk').forEach(c => { c.checked = on; }); } });   // other open scopes follow the toggle
  window.RDV = { PTS, list, draw, setOn, bindToggle, get on() { return on; } };
})();
