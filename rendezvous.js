/* AATCC rendezvous points (v108; v114: ranges halved, closer to the ship), shared by Marshal, Approach and Instructor so every scope shows them in the same place.
   Fixed geographic positions: TRUE bearing / range (NM) from the ship's position (the scope centre). Each scope turns them into its
   magnetic-up frame with its own magnetic variation (true = magnetic + MV). Display only for now; rendezvous phraseology comes later.
   A point that falls in the final approach corridor (astern of the ship, inside 25 NM and within 3 NM of the course line) is not drawn. */
(function () {
  'use strict';
  const PTS = [   // [name, true bearing, range NM]
    ['COKE', 20, 7], ['WATER', 55, 14], ['MILK', 90, 9], ['COFFEE', 125, 17.5], ['TEA', 160, 6],
    ['JUICE', 200, 12.5], ['SODA', 235, 8], ['COCOA', 270, 16], ['PEPSI', 305, 11], ['LEMONADE', 340, 19],
  ];
  const DEG = Math.PI / 180, KEY = 'aatccRdv';
  const COL = 'rgba(255,214,40,0.95)', LBL = 'rgba(255,214,40,0.9)';
  let on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  const CORR = { len: 25, half: 3 };
  /* v126: never over land. Each scope registers its land test (TRUE-frame e/n from the ship -> true if that spot is land as drawn) and a key
     that changes when the land, MV or final bearing change. A point over land (or within 0.8 NM of the shore) is moved to the nearest water
     spot: same bearing first (range kept within 6-19 NM, nearest first), then bearing offsets up to +/-40 deg; kept 3 NM from the other points.
     Deterministic, so linked scopes with the same land agree. Cached per key. */
  let LANDF = null, LANDK = null, CACHE = { k: null, v: null };
  function setLand(fn, keyFn) { LANDF = typeof fn === 'function' ? fn : null; LANDK = typeof keyFn === 'function' ? keyFn : null; CACHE.k = null; }
  const T = (bt, r) => [Math.sin(bt * DEG) * r, Math.cos(bt * DEG) * r];
  function wet(e, n) { if (!LANDF) return true; try { if (LANDF(e, n)) return false; for (let i = 0; i < 8; i++) { const a = i * 45 * DEG; if (LANDF(e + Math.sin(a) * 0.8, n + Math.cos(a) * 0.8)) return false; } } catch (x) { return true; } return true; }
  function placed() {   // [[name, bt, r, moved]] true bearing / range after the land check
    let k = null; try { k = LANDF ? String(LANDK ? LANDK() : 'x') : null; } catch (x) {}
    if (k === null) return PTS.map(p => [p[0], p[1], p[2], false]);
    if (CACHE.k === k) return CACHE.v;
    const out = [], far = (e, n) => out.every(q => { const [qe, qn] = T(q[1], q[2]); return Math.hypot(e - qe, n - qn) >= 3; });
    for (const [name, bt, r] of PTS) {
      let got = null;
      if (wet(...T(bt, r)) && far(...T(bt, r))) got = [name, bt, r, false];
      for (let db = 0; !got && db <= 40; db += 5) for (const sg of db ? [1, -1] : [1]) {
        const b = ((bt + sg * db) % 360 + 360) % 360;
        for (let dr = 0; !got && dr <= 13; dr += 0.5) for (const rr of dr ? [r + dr, r - dr] : [r]) { if (rr < 6 || rr > 19) continue; const [e, n] = T(b, rr); if (wet(e, n) && far(e, n)) { got = [name, b, Math.round(rr * 10) / 10, true]; break; } }
        if (got) break;
      }
      out.push(got || [name, bt, r, 'land']);   // no water anywhere nearby (very rare): kept but not drawn
    }
    CACHE = { k, v: out }; return out;
  }
  // display-frame points: mv = magnetic variation of the scope, fb = final bearing (magnetic) for the corridor check
  function list(mv, fb) {
    mv = +mv || 0;
    return placed().map(([name, bt, r, moved]) => {
      const bm = bt - mv, e = Math.sin(bm * DEG) * r, n = Math.cos(bm * DEG) * r;
      let hidden = moved === 'land';
      if (fb != null && isFinite(fb)) { const ab = (+fb + 180) * DEG, along = e * Math.sin(ab) + n * Math.cos(ab), lat = e * Math.cos(ab) - n * Math.sin(ab); hidden = hidden || along > 0 && along < CORR.len && Math.abs(lat) < CORR.half; }
      return { name, brgT: bt, r, e, n, hidden, moved: !!moved };
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
  window.RDV = { PTS, list, draw, setOn, bindToggle, setLand, placed, get landFn() { return LANDF; }, get on() { return on; } };
})();
