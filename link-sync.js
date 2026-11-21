/* v128 linked group (BroadcastChannel 'stinger-link'): Marshal, Approach and Final with their link switched on.
   - One Start: Start on any linked scope starts every linked scope that is not already running (same level).
   - One Pause: Pause / Resume (button, P key, Instructor) on any linked scope pauses / resumes all of them; sim speed (1x / 3x) follows too.
   - One clock: the scope that started the group is the time master; it sends its sim time every second and the others follow (within ~0.5 s).
   - Shared traffic (Marshal <-> Approach): each scope sends its own aircraft; the other draws them as other-controller targets with a data block.
   Messages: ls-hello {src,on,run} · ls-start {src,diff,id} · ls-pause {src,p} · ls-scale {src,s} · ls-time {src,t,p,s,id} · ls-tfc {src,ac[]}.
   The guided intro and standalone scopes never send or follow any of this. */
(function () {
  if (!('BroadcastChannel' in window)) return;
  const PAGE = /final-controller/.test(location.pathname) ? 'FINAL' : /marshal/.test(location.pathname) ? 'MARSHAL' : 'APPROACH';
  const RANK = { MARSHAL: 3, APPROACH: 2, FINAL: 1 };
  const ch = new BroadcastChannel('stinger-link'), peers = {}, tfc = {};
  let O = null, applying = false, lastTime = {};
  const post = m => { try { ch.postMessage(Object.assign({ src: PAGE }, m)); } catch (e) {} };
  const G = () => { try { return (O && O.G()) || null; } catch (e) { return null; } };
  const busy = () => { try { return !!(O && O.busy && O.busy()); } catch (e) { return false; } };   // Final's guided intro / Aero-watch practice: stays out of the group
  const run = () => { const g = G(); return !busy() && !!(g && !g.over && !g.intro); };
  const on = () => { try { return !busy() && !!(O && O.on()); } catch (e) { return false; } };
  const group = () => Object.keys(peers).filter(k => peers[k].on && Date.now() - peers[k].t < 5000);
  const linked = () => on() && group().length > 0;
  const nm = s => s[0] + s.slice(1).toLowerCase();
  function hello() { post({ type: 'ls-hello', on: on(), run: run() }); label(); }
  function label() {   // start-screen note + "linked" pause label
    const g = linked() ? group() : [];
    let n = document.getElementById('lsNote'); const b = document.getElementById('bStart');
    if (b && !n) { n = document.createElement('div'); n.id = 'lsNote'; n.style.cssText = 'font-size:12px;color:#8fd8ff;margin:4px 0 0;text-align:center'; b.insertAdjacentElement('afterend', n); }
    if (n) n.textContent = g.length ? `🔗 Linked: Start also starts ${g.map(nm).join(' + ')}; Pause pauses all.` : '';
    const p = document.getElementById('bPause'); if (p) { const gg = G(); const base = gg && gg.paused ? '▶ Resume' : '❚❚ Pause'; p.textContent = base + (g.length && run() ? ' (all)' : ''); p.title = g.length ? 'Pause / resume ALL linked scopes (P)' : 'Pause (P)'; }
  }
  function started(diff, opts) {   // page hook: end of startGame
    if (applying || busy() || (opts && opts.intro)) return; const g = G(); if (!g || g.intro) return;
    g.lsId = PAGE + '-' + Date.now(); g.lsMaster = PAGE;
    if (linked()) post({ type: 'ls-start', diff, id: g.lsId });
    if (O.afterStart && linked()) try { O.afterStart(); } catch (e) {}
    label();
  }
  function paused(p) { if (applying || !run()) { label(); return; } if (linked()) post({ type: 'ls-pause', p: !!p }); label(); }
  function scale(s) { if (applying || !run()) return; if (linked()) post({ type: 'ls-scale', s }); }
  function apply(fn) { applying = true; try { fn(); } catch (e) { try { console.warn('link-sync', e); } catch (_) {} } applying = false; label(); }
  function recv(m) {
    if (!m || m.src === PAGE || !/^ls-/.test(m.type || '')) return;
    if (m.type === 'ls-hello') { const was = !!peers[m.src]; peers[m.src] = { on: !!m.on, run: !!m.run, t: Date.now() }; if (!was) label(); return; }
    if (!on() || !(peers[m.src] && peers[m.src].on)) return;
    const g = G();
    if (m.type === 'ls-start') {
      if (run()) { if (g && !g.lsMaster) g.lsMaster = m.src; return; }   // already running: keep going, follow its clock
      if (g && g.intro) return;
      apply(() => { const d = document.querySelector(`.diff[data-d="${m.diff}"]`); if (d) d.click(); O.start(m.diff); });
      const g2 = G(); if (g2) { g2.lsMaster = m.src; g2.lsId = m.id; if (O.afterStart) try { O.afterStart(); } catch (e) {} }
      try { O.log && O.log(`Linked start from ${nm(m.src)}: all linked scopes running together.`); } catch (e) {}
      return;
    }
    if (!run()) return;
    if (m.type === 'ls-pause') { if (!!g.paused !== !!m.p) apply(() => O.setPaused(!!m.p)); return; }
    if (m.type === 'ls-scale') { if ((g.scale || 1) !== m.s && O.setScale) apply(() => O.setScale(m.s)); return; }
    if (m.type === 'ls-time') {
      lastTime[m.src] = Date.now();
      if (g.lsMaster === PAGE && !(RANK[m.src] > RANK[PAGE])) return;   // I'm the master (two masters: the higher rank wins)
      if (g.lsMaster && g.lsMaster !== PAGE && g.lsMaster !== m.src && lastTime[g.lsMaster] && Date.now() - lastTime[g.lsMaster] < 4000) return;   // following someone else
      if (!g.lsMaster && RANK[m.src] < RANK[PAGE]) return;
      g.lsMaster = m.src;
      if (Math.abs(g.t - m.t) > 0.5) g.t = m.t;
      if (!!g.paused !== !!m.p) apply(() => O.setPaused(!!m.p));
      if (m.s && (g.scale || 1) !== m.s && O.setScale) apply(() => O.setScale(m.s));
      return;
    }
    if (m.type === 'ls-tfc') { tfc[m.src] = { rx: Date.now(), ac: m.ac || [], p: !!m.p, s: m.s || 1 }; return; }
  }
  ch.onmessage = e => recv(e.data);
  function tick() {
    hello();
    const g = G(); if (!run() || !linked()) return;
    if (g.lsMaster === PAGE || !g.lsMaster) post({ type: 'ls-time', t: g.t, p: !!g.paused, s: g.scale || 1, id: g.lsId });
  }
  function tfcTick() {
    if (!O || !O.traffic || !run() || !linked()) return;
    let ac = []; try { ac = O.traffic() || []; } catch (e) {}
    const g = G(); post({ type: 'ls-tfc', ac, p: !!g.paused, s: g.scale || 1 });
  }
  // other-controller targets (Marshal <-> Approach): dead-reckoned between updates so they move smoothly
  function peerTraffic() {
    if (!O || !O.traffic || !run() || !linked()) return [];
    const own = new Set((O.ownCs && O.ownCs()) || []), out = [], g = G();
    for (const src of Object.keys(tfc)) {
      const T = tfc[src], age = (Date.now() - T.rx) / 1000; if (age > 3) continue;
      const k = g.paused || T.p ? 0 : age * (T.s || 1) / 3600;
      for (const a of T.ac) { if (own.has(a.cs)) continue;
        const h = a.hdg * Math.PI / 180, d = (a.gs || 0) * k; out.push(Object.assign({}, a, { src, e: a.e + Math.sin(h) * d, n: a.n + Math.cos(h) * d })); }
    }
    return out;
  }
  function drawTraffic(ctx, P, font) {
    const L = peerTraffic(); if (!L.length) return;
    ctx.save(); ctx.font = font || '11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const a of L) {
      const [x, y] = P(a.e, a.n), col = a.src === 'MARSHAL' ? 'rgba(255,140,150,0.9)' : 'rgba(200,210,230,0.9)';
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();   // other-controller target
      const h = a.hdg * Math.PI / 180; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(h) * 14, y - Math.cos(h) * 14); ctx.stroke();
      const al = String(Math.round((a.alt || 0) / 100)).padStart(3, '0');
      ctx.fillText(a.cs + ' ' + (a.src === 'MARSHAL' ? 'MAR' : 'APP'), x + 8, y - 8); ctx.fillText(al + ' ' + String(Math.round((a.gs || 0) / 10)).padStart(2, '0'), x + 8, y + 4);
    }
    ctx.restore();
  }
  function init(o) { O = o; hello(); }
  setInterval(tick, 1000); setInterval(tfcTick, 500);
  window.LS = { init, started, paused, scale, linked, group, peerTraffic, drawTraffic, get page() { return PAGE; }, _peers: peers };
})();
