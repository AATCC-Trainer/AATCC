/* AATCC Final Controller guided intro (v106; v109: speed 1x/2x/3x, markers, Next cue, drift-correction step, no rate-of-descent directives, no roger ball): "Guided Intro with Aero" on the real PAR scope.
   Loaded after the Final page script; reaches the sim only through window.__FIN. The mentor panel is intro-engine.js.
   Flow: the scope is frozen while Aero talks or waits for a call; "watch" segments run it until a condition. Each step
   builds its own scene, so Back, Resume after a reload and Restart all work from any step. A call is checked before
   Final executes it (FinalIntro.gate); a wrong call gets Aero's feedback and never reaches the pilot. */
(function () {
'use strict';
const F = window.__FIN;
if (!F || !window.IntroEngine) return;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LS = 'aatccFinalIntro', KEYS = { core: 'aatccFinalIntro.core.v2', adv: 'aatccFinalIntro.adv' };   // v122: core steps changed (17 + 18 merged, DNA moved), so old saved positions are dropped
const meta = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const setMeta = o => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(meta(), o))); } catch (e) {} };
const prog = sec => { try { return JSON.parse(localStorage.getItem(KEYS[sec]) || 'null'); } catch (e) { return null; } };
const FI = window.FinalIntro = { active: false, mode: null, gate: null, after: null, onLog: null };

/* ---------------- sim helpers ---------------- */
const G = () => F.G;
const norm = h => { h = ((Math.round(h) % 360) + 360) % 360; return h === 0 ? 360 : h; };
const rel = d => norm(F.BRC + d);
const ac = cs => G() && G().ac.find(x => x.cs === cs && F.alive(x));
const pa = a => a.pA || a;
const tel = cs => F.telephony(cs).text;
const say3 = h => F.hdg3(h);
let runT = null, keepT = null, eng = null, sec = null, sub = 0, held = null, ready = true, runBase = 1, windHdg = null, PAUSED = false;
/* v109: sim speed for the guided intro (1x / 2x / 3x), multiplies every run segment; remembered */
let SPD = (() => { try { const v = +localStorage.getItem('aatccFinalIntro.spd'); return [1, 2, 3].includes(v) ? v : 1; } catch (e) { return 1; } })();
function setSpd(v) { SPD = [1, 2, 3].includes(v) ? v : 1; try { localStorage.setItem('aatccFinalIntro.spd', String(SPD)); } catch (e) {} const g = G(); if (g && runT) g.scale = runBase * SPD;
  const lb = document.querySelector('#fiSpd span'); if (lb) lb.textContent = `Sim speed ${SPD}x (keys 1 2 3)`;
  document.querySelectorAll('#fiSpd button').forEach(b => b.classList.toggle('on', +b.dataset.s === SPD)); }
function speedBar() {
  if (!eng) return; const d = document.createElement('div'); d.className = 'fiSpd'; d.id = 'fiSpd';
  d.innerHTML = '<span>Sim speed</span>' + [1, 2, 3].map(v => `<button type="button" data-s="${v}" title="Run the scope at ${v}x">${v}x</button>`).join('');
  d.querySelectorAll('button').forEach(b => b.onclick = () => setSpd(+b.dataset.s));
  eng.root.insertBefore(d, eng.root.querySelector('.nav')); setSpd(SPD);
}
function stopRun() { clearInterval(runT); runT = null; }
document.addEventListener('keydown', e => {   // v122: 1 / 2 / 3 set the intro's sim speed (the page leaves these keys to the intro)
  if (!FI.active || FI.mode !== 'intro' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return; if (/^[123]$/.test(e.key)) { e.preventDefault(); setSpd(+e.key); } });
function freeze() { stopRun(); if (G()) { F.setPaused(true); G().scale = 1; } }
/* v122: Pause (Aero's panel button or P) holds the scope too; a running segment picks up where it was on Resume */
function onPause(on) { PAUSED = !!on; const g = G(); if (!g) return; if (PAUSED) F.setPaused(true); else if (runT) { g.scale = runBase * SPD; F.setPaused(false); } }
function run(cond, opt, done) {   // run the sim until cond() (or timeout), then freeze
  stopRun(); const g = G(); if (!g) return;
  runBase = (opt && opt.scale) || 1; g.scale = runBase * SPD; F.setPaused(PAUSED);
  const t0 = g.t, lim = (opt && opt.simTimeout) || 400;
  runT = setInterval(() => {
    if (G() !== g || g.over) return stopRun();
    if (PAUSED) return;
    let ok = false; try { ok = cond(); } catch (e) {}
    if (ok || g.t - t0 > lim) { freeze(); if (done) done(ok); }
  }, 60);
}
function keepAlive() {   // no lost-comms wave-offs or missed-range penalties while Aero is talking
  const g = G(); if (!g || !g.intro) return;
  for (const a of g.ac) { a.lastTx = a.lastRealTx = g.t; if (a.r != null) a.lastRangeR = a.r; }
  const st = eng && eng.step; if (st && !st.noServo && g.selected && F.alive(g.selected)) F.servoTo(g.selected);   // the guide holds the servo on the target
}
function repaint(a) { delete a.pA; delete a.pE; a.kA = a.kE = null; a.hist = []; F.sweepPaint(a); }
const SPEC = { LTNG21: 'F35B', LTNG22: 'F35B', LTNG23: 'F35B', LTNG31: 'F35B', KNGT41: 'MH60S', NHWK52: 'UH1Y' };
/* place one aircraft in a given state (spawning it quietly if needed); every other aircraft is removed */
function put(cs, s, keep) {
  const g = G(); keep = [cs].concat(keep || []);
  g.ac = g.ac.filter(x => keep.includes(x.cs) && F.alive(x));
  let a = ac(cs);
  if (!a) {
    if (!s.talk) window.__INST_SILENT = true;
    try { a = F.spawnFinal({ cs, type: SPEC[cs], r: s.r, yft: s.yft || 0, alt: s.z || 2000, hdg: s.hdg || F.BRC, intent: s.intent || 'fs', pracLeft: s.intent === 'prac' ? 2 : 0, pracNo: s.intent === 'prac' ? 1 : 0 }); }
    finally { window.__INST_SILENT = false; }
  }
  const z = s.z != null ? s.z : s.phase === 'descent' ? F.gpAlt(s.r) + (s.dz || 0) : 2000;
  Object.assign(a, { r: s.r, yft: s.yft || 0, z, levelAlt: s.phase === 'descent' ? a.levelAlt : z, hdg: s.hdg || F.BRC, tgtHdg: s.hdg || F.BRC, turnDir: null,
    phase: s.phase || 'final', vs: 0, corr: 0, bias: 0, gustV: 0, latRate: 0, devRate: 0, prevDev: null, prevAz: null,
    gear: s.gear !== false, contacted: s.contacted !== false, reportSee: true, dna: !!s.dna, silent: !!s.dna, cleared: false, ballAsked: false, ballCalled: false, greenCalled: false,
    sinkR: s.sinkR || 0, sinkOn: false, sinkDone: false, recover: false, apprCalled: false, ng: false, ngTurn: null, ngHalf: false, asr: false, asrPrep: false, asrMdaCalled: false, asrMinsCalled: false,
    intent: s.intent || 'fs', climbCalled: false, result: null, removeAt: null, owner: 'FIN', hoff: null, thrCalled: false, instGpOff: null });
  a.ias = a.gs = a.T.vapp; a.tgtSpd = a.T.vapp;
  if (a.startR == null) a.startR = a.r;
  repaint(a); F.selectAc(a); keepAlive(); F.refreshPanel(true);
  return a;
}
function forceCourse(cs, cat, side) { const a = ac(cs); if (!a) return; a.yft = F.demoYft(cat, side); repaint(a); }
const cur = () => { const st = eng && eng.step; return st && st.cs ? ac(st.cs) : null; };

/* ---------------- call checks ---------------- */
const has = (p, k) => p.cmds.find(c => c.k === k);
function courseChk(p, a) {
  const c = p.cmds.find(x => x.k === 'course' || x.k === 'onCourse');
  if (!c) return 'the course call (' + liveCourse(a) + ')';
  if (c.k === 'onCourse') return F.courseAccepts(a, 'on') ? null : `the course call: you said on course, I see ${liveCourse(a)}`;
  const side = pa(a).yft > 0 ? 'R' : 'L', want = c.q || 'plain';
  const ok = side === c.side && F.courseAccepts(a, want) && !(F.courseCat(a) === 'on' && !F.courseAccepts(a, want));
  return ok ? null : `the course call: you said ${c.q ? c.q + ' ' : ''}${c.side === 'L' ? 'left' : 'right'} of course, I see ${liveCourse(a)}`;
}
function gpChk(p, a) {
  const c = p.cmds.find(x => x.k === 'gp' || x.k === 'onGp');
  if (!c) return 'the glidepath call (' + liveGp(a) + ')';
  if (c.k === 'onGp') return F.gpAccepts(a, 'on') ? null : `the glidepath call: you said on glidepath, I see ${liveGp(a)}`;
  const ok = F.gpSide(a) === c.side && F.gpAccepts(a, c.q || 'plain');
  return ok ? null : `the glidepath call: you said ${c.q ? c.q + ' ' : ''}${c.side} glidepath, I see ${liveGp(a)}`;
}
const liveCourse = a => F.courseWords(F.courseCat(a), pa(a).yft);
const liveGp = a => F.gpWords(F.gpCat(a), a);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const MILES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function rangeChk(p, a) { const c = has(p, 'range'); if (!c) return `the range (${MILES[Math.round(a.r)]} miles)`; const tol = a.r < 1.5 ? 0.3 : 0.5; return Math.abs(c.v - a.r) <= tol ? null : `the range: you said ${c.v}, it is ${a.r.toFixed(1)} miles`; }
const csChk = (p, a) => p.cs === a.cs ? null : p.cs ? `the right callsign (that was ${tel(p.cs)}; this is ${a.tel})` : `the callsign first (${a.tel})`;
const need = (p, k, what) => has(p, k) ? null : what;

/* ---------------- highlights over the scope / panel ---------------- */
let hlEls = [];
function clearHL() { hlEls.forEach(e => e.remove()); hlEls = []; document.querySelectorAll('.fiHL').forEach(e => e.classList.remove('fiHL')); clearMk(); }
/* v109 markers: a pulsing ring + labelled arrow on whatever Aero is talking about. Scope markers follow the painted target
   (or a point on the glidepath / course line / a range); page markers sit over a button or panel. Repositioned every frame. */
let mks = [], mkRAF = null;
function mkLoop() { mkRAF = requestAnimationFrame(mkLoop); for (const m of mks) { try { m.upd(); } catch (e) {} } }
function addMk(m) { mks.push(m); try { m.upd(); } catch (e) {} if (!mkRAF) mkLoop(); }
function clearMk() { mks.forEach(m => m.el.remove()); mks = []; if (mkRAF) cancelAnimationFrame(mkRAF); mkRAF = null; if (F.setDemo) F.setDemo([]); }
function markPt(fn, label, ring) {
  const w = $('scopeWrap'); if (!w) return;
  const el = document.createElement('div'); el.className = 'fiMk' + (ring === false ? ' nr' : ''); el.innerHTML = `<div class="ring"></div><div class="tag">${label}</div>`; w.appendChild(el);
  addMk({ el, upd() { const pt = fn(); if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; el.classList.toggle('below', pt.y - (pt.top || 0) < 52); } });
}
const ringE = (cs, label) => markPt(() => { const a = ac(cs); return a && a.hitE ? { x: a.hitE.x, y: a.hitE.y, top: F.L.eTop } : null; }, label || tel(cs));
const ringA = (cs, label) => markPt(() => { const a = ac(cs); return a && a.hitA ? { x: a.hitA.x, y: a.hitA.y, top: F.L.aTop } : null; }, label || tel(cs));
const markGp = (r, label) => markPt(() => ({ x: F.xr(r), y: F.ez(F.gpAlt(r)), top: F.L.eTop }), label || 'Glidepath', false);
const markSafe = (r, label) => markPt(() => ({ x: F.xr(r), y: F.ez(r * F.NM_FT * Math.tan(F.LIM.lowerSafeDeg * Math.PI / 180)), top: F.L.eTop }), label, false);   // v122: the (undrawn) lower safety limit
const markCourse = (r, label) => markPt(() => ({ x: F.xr(r), y: F.ay(0), top: F.L.aTop }), label || 'Course line', false);
function markRange(r, label) {
  const w = $('scopeWrap'); if (!w) return;
  const el = document.createElement('div'); el.className = 'fiRng'; el.innerHTML = `<span>${label}</span>`; w.appendChild(el);
  addMk({ el, upd() { const L = F.L; el.style.left = F.xr(r) + 'px'; el.style.top = L.eTop + 'px'; el.style.height = (L.aBot - L.eTop) + 'px'; } });
}
function markEl(id, label) {
  const t = $(id); if (!t) return; t.classList.add('fiHL'); if (!label) return;
  const el = document.createElement('div'); el.className = 'fiTag'; el.innerHTML = label; document.body.appendChild(el);
  addMk({ el, upd() { const r = t.getBoundingClientRect(); if (!r.width || !r.height) { el.style.display = 'none'; return; } el.style.display = '';
    const below = r.top < 44; el.classList.toggle('below', below); el.style.left = (r.left + Math.min(r.width / 2, 90) + scrollX) + 'px'; el.style.top = ((below ? r.bottom : r.top) + scrollY) + 'px'; } });
}
function hlScope(which) {
  const L = F.L, w = $('scopeWrap'); if (!L || !w) return;
  const top = which === 'elev' ? L.eTop : L.aTop, bot = which === 'elev' ? L.eBot : L.aBot;
  const d = document.createElement('div'); d.className = 'fiBox';
  Object.assign(d.style, { left: (L.left - 6) + 'px', top: (top - 6) + 'px', width: (L.plotW + 12) + 'px', height: (bot - top + 12) + 'px' });
  w.appendChild(d); hlEls.push(d);
}
function hlEl(...ids) { ids.forEach(id => { const e = $(id); if (e) e.classList.add('fiHL'); }); }
(function css() {
  const st = document.createElement('style');
  st.textContent = `.fiBox{position:absolute;pointer-events:none;border:2px solid var(--amber,#ffbf3c);border-radius:6px;box-shadow:0 0 12px rgba(255,191,60,.45);animation:fiPulse 1.4s ease-in-out infinite;z-index:5}
.fiHL{outline:2px solid var(--amber,#ffbf3c)!important;outline-offset:2px;box-shadow:0 0 12px rgba(255,191,60,.4)}
@keyframes fiPulse{50%{box-shadow:0 0 2px rgba(255,191,60,.15)}}
body.introOn #layBar{display:none}
.fiMk{position:absolute;width:0;height:0;pointer-events:none;z-index:6}
.fiMk .ring{position:absolute;left:-17px;top:-23px;width:30px;height:42px;border:2px solid #ffbf3c;border-radius:50%;box-shadow:0 0 10px rgba(255,191,60,.55);animation:fiRing 1.1s ease-in-out infinite}
.fiMk.nr .ring{left:-7px;top:-7px;width:10px;height:10px;background:rgba(255,191,60,.35)}
@keyframes fiRing{50%{transform:scale(1.22);opacity:.55}}
.fiMk .tag,.fiTag{position:absolute;white-space:nowrap;font:bold 11px/1.2 inherit;color:#1a1200;background:#ffbf3c;border-radius:4px;padding:2px 6px;box-shadow:0 0 8px rgba(255,191,60,.5)}
.fiMk .tag{left:0;bottom:30px;transform:translateX(-50%)}
.fiMk .tag::after,.fiTag::after{content:'';position:absolute;left:50%;margin-left:-5px;top:100%;border:5px solid transparent;border-top-color:#ffbf3c}
.fiMk.below .tag{bottom:auto;top:30px}.fiMk.below .tag::after,.fiTag.below::after{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:#ffbf3c}
.fiMk.nr .tag{bottom:12px}.fiMk.nr.below .tag{top:12px}
.fiTag{z-index:60;pointer-events:none;transform:translate(-50%,calc(-100% - 7px));animation:fiBob 1.1s ease-in-out infinite}
.fiTag.below{transform:translate(-50%,7px)}
@keyframes fiBob{50%{margin-top:-3px}}
.fiRng{position:absolute;width:0;border-left:2px dashed rgba(255,191,60,.8);pointer-events:none;z-index:5}
.fiRng span{position:absolute;top:2px;left:4px;white-space:nowrap;font:bold 11px/1.2 inherit;color:#1a1200;background:#ffbf3c;border-radius:4px;padding:1px 5px}
.fiSpd{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dim,#7d9a80)}
.fiSpd span{flex:1}.fiSpd button{min-height:24px;padding:1px 9px;font-size:12px}
.fiSpd button.on{border-color:#ffbf3c;color:#ffbf3c;background:#2a2410}
#aeroBox{flex:none}`;
  document.head.appendChild(st);
})();

/* ---------------- steps ---------------- */
const SEC_CORE = [
  { id: 'brief', name: 'Brief' }, { id: 'scope', name: 'The scope', short: 'Scope' }, { id: 'contact', name: 'Contact and line-up', short: 'Contact' }, { id: 'gp', name: 'Glidepath' },
  { id: 'talk', name: 'Talk-down', short: 'Talk' }, { id: 'deck', name: 'Deck and landing', short: 'Deck' }, { id: 'wrong', name: 'When it goes wrong', short: 'Wrong' }, { id: 'ship', name: 'Ship turns and grading', short: 'Ship' },
];
const SEC_ADV = [{ id: 'prac', name: 'Practice approaches', short: 'Practice' }, { id: 'ng', name: 'No-gyro' }, { id: 'asr', name: 'Surveillance (ASR)', short: 'ASR' }];
const L21 = 'LTNG21';
const CORE = [
  { id: 'welcome', sec: 'brief', type: 'info',
    say: `<p>Hi, I'm <span class="k">Aero</span>. I'll walk you through Final Controller on the real PAR scope, one step at a time.</p>
      <p>You talk an aircraft down to the USS Wasp: you watch its position on the scope and tell the pilot where it is and how to fix it. Each call you make, I check first. If it's right, the pilot hears it. If not, I'll tell you what to change.</p>
      <p>Type your calls in the box on the right and press Enter, or hold the talk button or the Space bar and speak. The scope stays frozen while we talk. The amber markers show what I'm talking about, and I'll tell you when to click Next.</p>`,
    enter() { const g = G(); g.ac = []; F.refreshPanel(true); } },
  { id: 'arrive', sec: 'brief', type: 'watch', cs: L21,
    say: `<p>In a moment your first aircraft checks in. Listen for its callsign, range, altitude, heading, and what it wants.</p>`,
    task: 'Listen to the check-in.',
    enter(api) { const g = G(); g.ac = []; F.refreshPanel(true);
      let n = 0, m = 0, on = false;   // v109: Aero speaks first; the aircraft checks in once Aero has finished
      const t = setInterval(() => { if (PAUSED) return; n++;
        if (!on) { if ((n > 8 && !api.talking) || n > 400) { on = true; put(L21, { r: 9.4, yft: 1700, hdg: rel(-20), talk: true, contacted: false }); ringA(L21, tel(L21)); ringE(L21, tel(L21)); markEl('readout', 'Its data'); } return; }
        if (++m > 50 || (m > 12 && !F.ttsBusy())) { clearInterval(t); api.succeed(`That was <span class="k">${tel(L21)}</span>: ${MILES[Math.round((ac(L21) || { r: 9 }).r)]} miles, level two thousand, heading ${say3(rel(-20))}, for the PAR to the ship, full stop. Its data block shows the same.`); } }, 100);
      return () => clearInterval(t); } },
  { id: 'elev', sec: 'scope', type: 'info', cs: L21,
    say: `<p>The top panel is the <span class="k">elevation</span> display: height against range. The sloping line is the <span class="k">glidepath</span>, coming down to the ship at the left.</p>
      <p>A target above the line is above the glidepath, below the line is below it. Right now ${tel(L21)} is level at two thousand feet, under the glidepath. It flies level until it meets the line.</p>`,
    enter() { put(L21, { r: 9.2, yft: 1650, hdg: rel(-20) }); hlScope('elev'); } },
  { id: 'az', sec: 'scope', type: 'info', cs: L21,
    say: `<p>The bottom panel is the <span class="k">azimuth</span> display: left and right of the final course. The centre line is the course to the ship.</p>
      <p>Each target has a short tick. Course line through the middle of the tick means <span class="k">on course</span>. Between the middle and the end means <span class="k">slightly</span> left or right. Touching the end means left or right of course. Not touching at all means <span class="k">well</span> left or right.</p>
      <p>The amber ticks are examples. From the left: well left, left, slightly left, on course, slightly right, right, and well right of course. Above the line is right of course, below it is left.</p>`,
    enter() { put(L21, { r: 9.2, yft: 1650, hdg: rel(-20) }); hlScope('az');
      F.setDemo([['well', 'L', 'well\nleft'], ['plain', 'L', 'left'], ['slightly', 'L', 'slightly\nleft'], ['on', 'R', 'on\ncourse'], ['slightly', 'R', 'slightly\nright'], ['plain', 'R', 'right'], ['well', 'R', 'well\nright']]
        .map(([cat, side, label], i) => ({ r: 0.8 + i * 1.1, cat, side, label }))); } },
  { id: 'servo', sec: 'scope', type: 'watch', cs: L21, skip: true, noServo: true,
    say: `<p>So far I have been moving the <span class="k">servo</span> for you. On the real scope a target only shows inside the servo band, the brighter strip you move with the mouse or your finger.</p>
      <p>I've cleared the bands, so the target is hidden now.</p>`,
    task: 'Click and hold on the <b>elevation</b> display at the target\'s height to move the band there, then do the same on the <b>azimuth</b> display. You can drag to follow it.',
    enter(api) { put(L21, { r: 9.15, yft: 1640, hdg: rel(-20) });
      if (!F.servoOn()) { api.succeed('Servo mode is off in your settings, so targets always show. You can skip this one.'); return; }
      F.servoClear(); hlScope('elev'); hlScope('az');
      const t = setInterval(() => { const v = F.servoSees(ac(L21)); if (v.E && v.A) { clearInterval(t); api.succeed('There it is on both displays. In Regular Training you keep the bands on the target yourself. For the rest of this intro I will keep them on it for you.'); } }, 150);
      return () => clearInterval(t); } },
  { id: 'courseQ', sec: 'scope', type: 'choice', cs: L21,
    say: `<p>Your turn to read the azimuth display.</p>`,
    q: () => `Where is ${tel(L21)} on the azimuth display?`,
    opts: () => { const a = ac(L21); return [['on', 'On course'], ['slightly', 'Slightly right of course'], ['plain', 'Right of course'], ['well', 'Well right of course']].map(([c, t]) => {
      const ok = F.courseCat(a) === c || (F.courseAccepts(a, c) && c !== 'on' && F.courseCat(a) !== 'on');
      return { t, ok, why: ok ? `Yes: ${liveCourse(a)}.` : `Look again at where the course line crosses the tick. I see ${liveCourse(a)}.` }; }); },
    good: 'You call what you see, every few seconds.',
    enter() { put(L21, { r: 9.1, yft: 1620, hdg: rel(-20) }); hlScope('az'); } },
  { id: 'gpQ', sec: 'scope', type: 'choice', cs: L21,
    say: `<p>Now the elevation display.</p>`,
    q: () => `Where is ${tel(L21)} against the glidepath?`,
    opts: [{ t: 'Above the glidepath, it needs to come down', ok: false, why: 'Look again: the target is under the sloping line.' },
      { t: 'Below the glidepath, flying level to meet it', ok: true, why: 'Right.' },
      { t: 'On the glidepath', ok: false, why: 'Not yet: it is level at two thousand feet, and the glidepath is higher at this range.' }],
    good: `Before it meets the glidepath you don't give glidepath calls. You'll tell it when it's getting close.`,
    enter() { put(L21, { r: 9.1, yft: 1620, hdg: rel(-20) }); hlScope('elev'); } },
  { id: 'side', sec: 'scope', type: 'info', cs: L21,
    say: `<p>On the right: the <span class="k">readout</span> for the selected aircraft (range, height, heading), the surveillance view, and the <span class="k">log</span>, which shows every call, every reply and your points.</p>
      <p>Above them is the talk button and the type box. Typed and spoken calls are treated the same.</p>`,
    enter() { put(L21, { r: 9.1, yft: 1620, hdg: rel(-20) }); hlEl('readout', 'log', 'micBox', 'cmdForm'); } },
  { id: 'intent', sec: 'contact', type: 'choice', cs: L21,
    say: `<p>Before your first call, think about what the pilot asked for.</p>`,
    q: `What did ${'Lightning 21'} ask for at check-in?`,
    opts: [{ t: 'A full stop: land on the ship', ok: true, why: 'Yes, full stop.' }, { t: 'Practice approaches', ok: false, why: 'Not this time; practice aircraft say "request multiple practice PARs". That is in the Advanced section.' },
      { t: 'A no-gyro approach', ok: false, why: 'No; you decide that one, and it is in the Advanced section.' }],
    good: 'A full stop ends with a deck call and a landing.',
    enter() { put(L21, { r: 9.1, yft: 1620, hdg: rel(-20), contacted: false }); } },
  { id: 'contactCall', sec: 'contact', type: 'call', cs: L21,
    say: () => `<p>First, the <span class="k">BRC</span>, the base recovery course: the ship's heading, and the final course you line every aircraft up on. Right now it is BRC ${say3(F.BRC)}. ${tel(L21)} is well right of it, cutting in.</p><p>Your first call to it is the <span class="k">contact call</span>.</p>`,
    task: () => `Make the contact call to ${tel(L21)}: callsign, <b>Gator Final</b>, ask how it hears you, remind it the wheels should be down, and ask it to report seeing you.`,
    hint: () => `${tel(L21)}, Gator Final, how do you hear me, wheels should be down, report see me.`,
    check(p, a, text) { return [csChk(p, a), /\b(?:gator\s+)?final\b/i.test(text) || /\bgator\s+final\b/i.test(p.norm || '') ? null : '"Gator Final" (your self-ID, right after the callsign)', need(p, 'hear', '"how do you hear me"'), need(p, 'gear', '"wheels should be down"'), need(p, 'reportSee', '"report see me"')]; },
    good: 'Loud and clear. That full contact call scores a bonus point. From now on the pilot reads back with just the callsign.',
    enter() { put(L21, { r: 9.0, yft: 1600, hdg: rel(-20), contacted: false, gear: false }); } },
  { id: 'turnQ', sec: 'contact', type: 'choice', cs: L21,
    say: () => `<p>${tel(L21)} is right of course on heading ${say3(rel(-20))}, so it is cutting back toward the course line at twenty degrees. If you leave it, it will shoot through the line.</p>`,
    q: 'To ease it onto the course, which way do you turn it?',
    opts: () => [{ t: `Turn right, heading ${say3(rel(-10))}`, ok: true, why: 'Yes: a smaller cut toward the line, so it eases in instead of overshooting.' },
      { t: `Turn left, heading ${say3(rel(-30))}`, ok: false, why: 'That makes the cut steeper; it would overshoot the course faster.' },
      { t: 'No turn, just keep calling its position', ok: false, why: 'Position calls alone do not move it sideways. Headings are the only way to move it left or right.' }],
    enter() { put(L21, { r: 8.8, yft: 1500, hdg: rel(-20) }); } },
  { id: 'lineup', sec: 'contact', type: 'call', cs: L21,
    say: `<p>Heading corrections always go with a course call: say where it is, then the turn.</p>`,
    tasks: [
      { task: () => `Tell ${tel(L21)} where it is on course, then <b>turn right heading ${say3(rel(-10))}</b>.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, turn right heading ${say3(rel(-10))}.`,
        check(p, a) { const h = has(p, 'hdg'); return [courseChk(p, a), !h ? `the turn (turn right heading ${say3(rel(-10))})` : (h.v === rel(-10) && h.dir !== 'L') ? null : `the heading: right ${say3(rel(-10))}`]; },
        then(next) { eng.feedback('info', 'Watch it ease toward the course line. I will stop the scope when it is nearly on.'); run(() => Math.abs(ac(L21).yft) < 140 || F.courseCat(ac(L21)) === 'on', { scale: 3 }, next); } },
      { task: () => `Nearly on course. Call its position and turn it onto the final course: <b>heading ${say3(F.BRC)}</b>.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, turn right heading ${say3(F.BRC)}.`,
        check(p, a) { const h = has(p, 'hdg'); return [courseChk(p, a), !h ? `the turn (heading ${say3(F.BRC)})` : h.v === F.BRC ? null : `the heading: ${say3(F.BRC)}, the final course`]; } }],
    good: 'Lined up. Small corrections from here: five degrees or less close in.',
    enter() { put(L21, { r: 8.7, yft: 1450, hdg: rel(-20) }); } },
  { id: 'dna', sec: 'contact', type: 'call', cs: L21,
    say: `<p>It's established on the final course. From here you talk almost non-stop: course calls now, glidepath calls soon. So the pilot stops answering. Tell it now, on its own, as soon as it is on the course line.</p>`,
    task: 'Say <b>do not acknowledge further transmissions</b>.', hint: 'Do not acknowledge further transmissions.',
    check(p) { return [need(p, 'dna', '"do not acknowledge further transmissions"')]; },
    good: 'From now on the pilot stays quiet, so you will not hear readbacks. That is normal: only "see you", the deck call reply and emergencies still get an answer.',
    enter() { let a = ac(L21); if (!a || a.phase !== 'final' || Math.abs(a.yft) > 250 || F.ttiGp(a) < 30) a = put(L21, { r: 7.5, yft: 20 }); a.tgtHdg = F.BRC; } },
  { id: 'gpWatch', sec: 'gp', type: 'watch', cs: L21,
    say: `<p>Now watch the elevation display. ${tel(L21)} is level at two thousand feet and the glidepath comes down to meet it.</p>`,
    task: 'Watch it close on the glidepath.',
    enter(api) { const a = ac(L21) && ac(L21).phase === 'final' && F.ttiGp(ac(L21)) > 26 ? ac(L21) : put(L21, { r: 7.4, yft: 20, dna: true }); a.tgtHdg = F.BRC; hlScope('elev');
      run(() => F.ttiGp(ac(L21)) <= 24, { scale: 3 }, () => api.succeed('Close now: about twenty seconds from the glidepath.')); } },
  { id: 'appr', sec: 'gp', type: 'call', cs: L21,
    say: `<p>Ten to thirty seconds before it meets the glidepath, warn the pilot.</p>`,
    task: 'Say <b>approaching glidepath</b>.', hint: 'Approaching glidepath.',
    check(p) { return [need(p, 'approachingGp', '"approaching glidepath"')]; },
    good: 'Good timing. That earns a bonus point.',
    enter() { const a = ac(L21); if (!a || a.phase !== 'final' || F.ttiGp(a) > 30 || F.ttiGp(a) < 10) { const r = 2000 / F.gpAlt(1) + 0.5; put(L21, { r, yft: 30, dna: true }); } } },
  { id: 'begin', sec: 'gp', type: 'call', cs: L21, wait: true,
    say: `<p>When the target reaches the glidepath line, the pilot needs your call to start down. I'll run the scope until it gets there.</p>`,
    task: 'It is on the glidepath. Say <b>begin descent</b>.', hint: 'Begin descent.',
    check(p) { return [need(p, 'beginDescent', '"begin descent"')]; },
    good: 'Descending. It will now follow your glidepath calls.',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'final' || F.ttiGp(a) > 32) a = put(L21, { r: 2000 / F.gpAlt(1) + 0.3, yft: 30, dna: true });
      ready = false; run(() => F.gpAlt(ac(L21).r) <= ac(L21).z + 12, { scale: 3 }, () => { goNow('It is on the glidepath now.'); }); } },
  { id: 'combo', sec: 'talk', type: 'call', cs: L21, wait: true,
    say: `<p>Now the talk-down. Every few seconds: the course, then the glidepath. Once every mile add the range, like <span class="ex">On course, on glidepath, five miles.</span></p>
      <p>Watch both displays while it comes down. I'll stop the scope at five miles, then you put it all together in one call.</p>`,
    task: 'Five miles. Give the course, the glidepath and the range in one call.',
    hint: () => { const a = ac(L21); return `${cap(liveCourse(a))}, ${liveGp(a)}, ${MILES[Math.round(a.r)]} miles.`; },
    check(p, a) { return [courseChk(p, a), gpChk(p, a), rangeChk(p, a)]; },
    good: 'That is the rhythm: course, glidepath, and the range every mile.',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 5.2 || a.r > 6.5) a = put(L21, { r: 5.6, phase: 'descent', dna: true, yft: a ? Math.max(-60, Math.min(60, a.yft)) : 0 }); hlScope('elev'); hlScope('az');
      ready = false; run(() => ac(L21).r <= 5.05, { scale: 1, simTimeout: 90 }, () => { goNow('Your turn.'); }); } },
  { id: 'trendQ', sec: 'talk', type: 'choice', cs: L21,
    say: `<p>Sometimes the target keeps moving the same way, sweep after sweep.</p>`,
    q: 'It is on the glidepath but each sweep shows it a little higher. What do you add?',
    opts: [{ t: '"Going above glidepath"', ok: true, why: 'Yes: a trend call warns the pilot before it is off.' },
      { t: '"Well above glidepath"', ok: false, why: 'Not yet; call what you see. It is still on the glidepath, just trending up.' },
      { t: 'Nothing until it is off the glidepath', ok: false, why: 'Waiting makes the correction bigger. Warn early with a trend call.' }],
    good: 'The same works sideways: "going left of course".',
    enter() { const a = ac(L21); if (!a || a.phase !== 'descent') put(L21, { r: 4.7, phase: 'descent', dna: true }); } },
  { id: 'adjust', sec: 'talk', type: 'call', cs: L21,
    say: `<p>Now it has drifted high. When it is off the glidepath, you tell the pilot where it is, and the pilot fixes it. You never give rate of descent directions: only its position.</p>`,
    task: () => `It is ${liveGp(ac(L21))}. Give the <b>course and glidepath</b> call.`,
    hint: () => `${cap(liveCourse(ac(L21)))}, ${liveGp(ac(L21))}.`,
    check(p, a) { return [courseChk(p, a), gpChk(p, a)]; },
    then(done) { run(() => false, { scale: 3, simTimeout: 9 }, () => done()); },
    good: 'Watch it settle back toward the line: your position call is all the pilot needs. Below the glidepath works the same way.',
    enter() { const r = 4.5, okD = []; for (let d = 10; d <= 400; d += 5) { const t = { r, z: F.gpAlt(r) + d }; if (F.gpCat(t) === 'slightly' && F.gpAccepts(t, 'slightly') && !F.gpAccepts(t, 'on') && !F.gpAccepts(t, 'plain')) okD.push(d); }
      const dz = okD.length ? okD[Math.floor(okD.length * 0.6)] : 90;   // v122: well inside the "slightly above" band, so the tick is visibly off the line
      put(L21, { r, phase: 'descent', dna: true, dz }); hlScope('elev'); } },
  { id: 'wind', sec: 'talk', type: 'call', cs: L21, wait: true,
    say: `<p>Wind pushes the aircraft sideways. I've added a crosswind from the right, and I'll run the scope so you can watch it drift left of course on the azimuth display.</p>
      <p>You fix drift with a course call plus a small turn into the wind: five degrees or less this close in. When I stop the scope, I'll ask you what heading to give.</p>`,
    tasks: [
      { task: () => `What heading do you give it? Call its position, then a heading a few degrees <b>right</b> of ${say3(F.BRC)}, into the wind.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, turn right heading ${say3(rel(5))}.`,
        check(p, a) { const h = has(p, 'hdg'), d = h ? ((h.v - F.BRC + 540) % 360) - 180 : null;
          const ok = h && d >= 2 && d <= 10 && h.dir !== 'L'; if (ok) windHdg = h.v;
          return [courseChk(p, a), !h ? `a heading a few degrees right of ${say3(F.BRC)} (for example, turn right heading ${say3(rel(5))})` : ok ? null : `a small turn into the wind: 2 to 10 degrees right of ${say3(F.BRC)}, like turn right heading ${say3(rel(5))}`]; },
        then(next) { const g = G(); g.wind.spd = 4;
          eng.feedback('info', `It turns to ${say3(windHdg || rel(5))}. Now watch: the wind is easing, so that heading will carry it right of course. I'll stop the scope when it needs your corrective turn.`);
          run(() => { const a = ac(L21); return a.yft > 0 && F.courseAccepts(a, 'slightly') && !F.courseAccepts(a, 'on'); }, { scale: 3, simTimeout: 45 }, ok => { if (!ok) forceCourse(L21, 'slightly', 'R'); next(); }); } },
      { task: () => `The wind eased and it is now ${liveCourse(ac(L21))}. Make the <b>corrective turn</b>: call its position and turn it back left a few degrees.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, turn left heading ${say3(rel(-2))}.`,
        check(p, a) { const h = has(p, 'hdg'), d = h ? ((h.v - F.BRC + 540) % 360) - 180 : null, d0 = windHdg != null ? ((windHdg - F.BRC + 540) % 360) - 180 : 5;
          return [courseChk(p, a), !h ? `the corrective turn (for example, turn left heading ${say3(rel(-2))})` : (d < d0 && d >= -6 && h.dir !== 'R') ? null : `a small turn back left of ${say3(windHdg || rel(5))}, within a few degrees of ${say3(F.BRC)}, like turn left heading ${say3(rel(-2))}`]; },
        then(next) { run(() => false, { scale: 3, simTimeout: 6 }, () => next()); } }],
    good: 'That is drift correction: turn into the wind, watch the result, and when the wind changes, correct again. Small turns close in.',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 4.0) a = put(L21, { r: 4.6, phase: 'descent', dna: true }); windHdg = null;
      a.yft = 0; a.hdg = a.tgtHdg = F.BRC; repaint(a);
      const g = G(); g.wind.dir = rel(90); g.wind.spd = 22; g.wind.gust = 0; hlScope('az');
      ready = false; run(() => { const b = ac(L21); return b.yft < 0 && F.courseAccepts(b, 'slightly') && !F.courseAccepts(b, 'on'); }, { scale: 3, simTimeout: 40 }, ok => {
        if (!ok) forceCourse(L21, 'slightly', 'L'); goNow(`It has drifted ${liveCourse(ac(L21))}.`); }); },
    leave() { const g = G(); if (g) { g.wind.spd = 0; g.wind.dir = 360; } } },
  { id: 'deckQ', sec: 'deck', type: 'choice', cs: L21,
    say: `<p>Close in, you give the deck call. It is the landing clearance on the ship.</p>`,
    q: () => `${tel(L21)} is an F-35B jet on a full stop. What is the deck call?`,
    opts: [{ t: '"Three-quarter mile, call the ball" at about three-quarter mile', ok: true, why: 'Yes: jets call the ball.' },
      { t: '"One mile, go green" at about one mile', ok: false, why: 'That is the helicopter deck call.' },
      { t: '"Cleared to land"', ok: false, why: 'Not on the ship; the deck call is the clearance.' }],
    good: 'Without a deck call by half a mile the pilot waves off: the deck is fouled.',
    enter() { const a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 1.3) put(L21, { r: 2.6, phase: 'descent', dna: true }); } },
  { id: 'ball', sec: 'deck', type: 'call', cs: L21, wait: true,
    say: `<p>I'll run it in to three-quarter mile. At two miles the pilot reports "see you": that is normal, keep talking.</p>
      <p>At three-quarter mile the deck call goes with the course and the glidepath, all in one call.</p>`,
    task: () => 'Three-quarter mile. Give the <b>course</b>, the <b>glidepath</b>, and the jet deck call: <b>three-quarter mile, call the ball</b>.',
    hint: () => { const a = ac(L21); return a ? `${cap(liveCourse(a))}, ${liveGp(a)}, three-quarter mile, call the ball.` : 'On course, on glidepath, three-quarter mile, call the ball.'; },
    check(p, a) { return [courseChk(p, a), gpChk(p, a), need(p, 'callBall', '"three-quarter mile, call the ball"')]; },
    then(done) { eng.feedback('info', 'Ball. From here you say nothing more. Watch it land.'); run(() => !ac(L21) || ac(L21).phase === 'landed', { scale: 2, simTimeout: 60 }, () => done()); },
    good: () => `"Ball" means the pilot has the landing aid in sight, and it is cleared to land. After the ball call there is no more talking from you. ${tel(L21)} is on deck. Nice talk-down.`,
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 0.8 || a.r > 2.2) a = put(L21, { r: 2.15, phase: 'descent', dna: true }); G().wind.spd = 0;
      a.yft = Math.max(-60, Math.min(60, a.yft)); a.tgtHdg = F.BRC; a.hdg = F.BRC;
      ready = false; run(() => ac(L21).r <= 0.78, { scale: 3 }, () => { goNow('Three-quarter mile.'); }); } },
  { id: 'sinker', sec: 'wrong', type: 'call', cs: 'LTNG22', wait: true,
    say: () => `<p>A new jet, ${tel('LTNG22')}, is on the glidepath at three miles. Some aircraft keep sinking even after your glidepath calls. Watch the elevation display.</p>
      <p>Under the glidepath is the <span class="k">lower safety limit</span>; I've marked it. A little low is a normal glidepath call. Once the target goes <b>past the lower safety limit</b>, you give a <span class="k">low altitude alert</span>.</p>
      <p>The alert ends with the <span class="k">altimeter</span> setting: the local air pressure, here 29.92 inches, said "two niner niner two". The pilot sets it so the altimeter shows the right height, so it always goes with a low altitude alert.</p>`,
    task: () => `It is past the lower safety limit. Give the full <b>low altitude alert</b>: the alert, the callsign, check your altitude immediately, and the altimeter, two niner niner two.`,
    hint: () => `Low altitude alert, ${tel('LTNG22')}, check your altitude immediately, altimeter two niner niner two.`,
    check(p, a, text) { const t = ' ' + String(text).toLowerCase() + ' ';
      return [need(p, 'laa', '"low altitude alert"'), csChk(p, a), /check (?:your |the )?altitude/.test(t) ? null : '"check your altitude immediately"', (F.altimeterOk(text) || F.altimeterOk(p.raw || '')) ? null : '"altimeter two niner niner two"']; },
    post(a) { return a.sinkOn ? 'the full alert: all four parts' : null; },
    then(done) { run(() => false, { scale: 3, simTimeout: 8 }, () => done()); },
    good: 'The pilot climbs back to the glidepath on its own. A low altitude alert always goes out in full, even after "do not acknowledge".',
    enter(api) { const a = put('LTNG22', { r: 3.3, phase: 'descent', dna: true, sinkR: 3.15 }); hlScope('elev');
      ready = false; run(() => F.elevAngle(ac('LTNG22')) < F.LIM.lowerSafeDeg, { scale: 2, simTimeout: 90 }, () => { goNow('It is past the lower safety limit. Call it now.'); }); } },
  { id: 'waveoff', sec: 'wrong', type: 'call', cs: 'LTNG22',
    say: () => `<p>Now it has gone well left close in. That is unsafe: wave it off. The wave-off is said twice, then the altitude in angels and the base recovery course.</p>`,
    task: () => `Wave off ${tel('LTNG22')}: <b>take angels two</b>, fly base recovery course ${say3(F.BRC)}.`,
    hint: () => `${tel('LTNG22')}, wave off, wave off, take angels two, fly base recovery course ${say3(F.BRC)}.`,
    check(p, a) { const al = has(p, 'alt'), h = has(p, 'hdg'); return [csChk(p, a), need(p, 'ga', '"wave off, wave off"'), !al ? '"take angels two"' : al.v === 2000 ? null : 'angels two (two thousand feet)', !h ? `"fly base recovery course ${say3(F.BRC)}"` : h.v === F.BRC ? null : `the base recovery course ${say3(F.BRC)}`]; },
    post(a) { return a.phase === 'missed' ? null : 'the wave-off (it did not go around)'; },
    then(done) { run(() => false, { scale: 3, simTimeout: 8 }, () => done()); },
    good: 'Waving off. A wave-off costs no points: an unsafe approach is never worth saving.',
    enter() { put('LTNG22', { r: 1.4, phase: 'descent', dna: true, yft: -1000, hdg: rel(-8) }); hlScope('az'); } },
  { id: 'selfQ', sec: 'wrong', type: 'choice',
    say: '<p>One more safety rule.</p>',
    q: 'A full-stop jet reaches half a mile and you never gave the deck call. What does the pilot do?',
    opts: [{ t: 'Lands anyway', ok: false, why: 'No: without the deck call the deck is not clear.' },
      { t: 'Waves off on its own: fouled deck', ok: true, why: 'Right.' },
      { t: 'Holds at half a mile', ok: false, why: 'Aircraft cannot hold on final.' }],
    good: 'The same happens if it is unstable close in, or if you stop talking for too long: the pilot assumes lost communications and waves off.',
    enter() { const g = G(); g.ac = g.ac.filter(x => x.phase === 'missed'); F.refreshPanel(true); } },
  { id: 'ship', sec: 'ship', type: 'call', cs: 'LTNG23',
    say: () => `<p>The ship turns now and then, and the final course turns with it. The aircraft doesn't move in the sky, so as the BRC swings, its target moves on your scope. I'll start a small starboard turn, five degrees, with ${tel('LTNG23')} on final. Watch the banner and the target.</p>`,
    tasks: [
      { task: 'Mother is turning. Broadcast it: <b>99, mother is in starboard turn, standby for new BRC</b>.', hint: '99, mother is in starboard turn, standby for new BRC.',
        ship: 'turn', post() { const s = G().ship; return s && s.gotTurn ? null : 'the 99 turn call while the ship is turning (port or starboard)'; },
        then(next) { eng.feedback('info', 'Watch the target slide right of course as the final course swings to the new BRC. I will stop when the ship is steady.'); run(() => { const s = G().ship; return s.phase !== 'turn' && s.phase !== 'warn' && s.endT != null; }, { scale: 1 }, next); } },
      { task: () => `Mother is steady. Broadcast the new BRC: <b>99, mother is steady, new BRC ${say3(F.shipBrcT())}</b>.`, hint: () => `99, mother is steady, new BRC ${say3(F.shipBrcT())}.`,
        ship: 'steady', post() { const s = G().ship; return s && s.gotSteady ? null : `the 99 steady call with the new BRC ${say3(F.shipBrcT())}`; } },
      { task: () => `The final course swung with the ship, so ${tel('LTNG23')} is now ${liveCourse(ac('LTNG23'))} of the new course, still on its old heading. Call its position and turn it back toward the new course: <b>come left heading ${say3(rel(-10))}</b>.`,
        hint: () => `${cap(liveCourse(ac('LTNG23')))}, come left heading ${say3(rel(-10))}.`,
        check(p, a) { const h = has(p, 'hdg'), d = h ? ((h.v - F.BRC + 540) % 360) - 180 : null;
          return [courseChk(p, a), !h ? `the heading back to the course (come left heading ${say3(rel(-10))})` : (d <= -5 && d >= -20 && h.dir !== 'R') ? null : `a left heading 5 to 20 degrees left of the new BRC ${say3(F.BRC)}, like come left heading ${say3(rel(-10))}`]; } }],
    good: 'Two 99 calls each turn, then put it back on the new course. Each 99 call is worth ten points.',
    enter(api) { const g = G(); put('LTNG23', { r: 6.5, yft: 0, z: 2000 }); g.ship.phase = null; g.ship.endT = null;
      F.shipInstCmd({ dir: 'starboard', deg: 5 }); ready = false;
      run(() => G().ship.phase === 'turn', { scale: 1 }, () => { goNow('Mother is turning.'); }); } },
  { id: 'grading', sec: 'ship', type: 'info',
    say: () => { const g = G(), r = (g.results || []).find(x => x.cs === L21); return `<p>Every call is graded. In the log, green lines with a star are points, amber lines are warnings, and red lines cost points.</p>
      <p>Accurate course and glidepath calls, a range every mile, good timing on approaching glidepath and begin descent, and the deck call all score. Late or wrong calls, missed ranges and long silences cost points.</p>
      <p>At the end of a session the report lists every approach with its score${r ? `. ${tel(L21)} scored ${r.score} on your guided approach` : ''}.</p>`; },
    enter() { hlEl('log'); } },
  { id: 'coreDone', sec: 'ship', type: 'done',
    say: `<p>That's the core of Final Controller. You've worked a full approach from check-in to landing, a sinker, a wave-off and a ship turn.</p><p>What next?</p>` },
];
const ADV = [
  { id: 'pracIn', sec: 'prac', type: 'watch', cs: 'LTNG31',
    say: `<p>Welcome to the Advanced section. First, practice approaches: the aircraft flies the approach but does not land. Listen to the check-in.</p>`,
    task: 'Listen to the check-in.',
    enter(api) { const g = G(); g.ac = []; put('LTNG31', { r: 8.5, yft: 0, talk: true, intent: 'prac', contacted: false });
      let n = 0; const t = setInterval(() => { if (++n > 50 || (n > 12 && !F.ttsBusy())) { clearInterval(t); api.succeed('"Request multiple practice PARs": a practice approach. Instead of the deck call, at one mile you send it around.'); } }, 100);
      return () => clearInterval(t); } },
  { id: 'climb', sec: 'prac', type: 'call', cs: 'LTNG31', wait: true,
    say: `<p>The talk-down is the same. I'll run it to one mile.</p>`,
    task: 'One mile. Send the jet around: <b>one mile, execute climb outs, go silver</b>.', hint: 'One mile, execute climb outs, go silver.',
    check(p) { return [has(p, 'starDelta') ? 'the jet call: climb outs (starboard delta is for helicopters)' : need(p, 'climbOut', '"execute climb outs, go silver"')]; },
    post(a) { return a.phase === 'climbout' ? null : 'the climb out'; },
    good: 'It climbs out and comes back around for the next practice approach.',
    enter(api) { put('LTNG31', { r: 1.9, phase: 'descent', dna: true, intent: 'prac' }); ready = false;
      run(() => ac('LTNG31').r <= 1.02, { scale: 3 }, () => { goNow('One mile.'); }); } },
  { id: 'delta', sec: 'prac', type: 'call', cs: 'KNGT41', wait: true,
    say: () => `<p>Helicopters do it differently. ${tel('KNGT41')} is a practice approach too.</p>`,
    task: 'One mile. Send the helicopter around: <b>one mile, enter starboard delta, go green</b>.', hint: 'One mile, enter starboard delta, go green.',
    check(p) { return [has(p, 'climbOut') ? 'the helicopter call: starboard delta (climb outs are for jets)' : need(p, 'starDelta', '"enter starboard delta, go green"')]; },
    post(a) { return a.phase === 'climbout' ? null : 'the starboard delta call'; },
    good: 'It joins the starboard delta, the helicopter pattern beside the ship.',
    enter(api) { put('KNGT41', { r: 1.6, phase: 'descent', dna: true, intent: 'prac' }); ready = false;
      run(() => ac('KNGT41').r <= 1.02, { scale: 3 }, () => { goNow('One mile.'); }); } },
  { id: 'ngIn', sec: 'ng', type: 'call', cs: 'NHWK52',
    say: () => `<p>No-gyro: the aircraft has lost its heading reference, so it cannot fly headings. You tell it when to turn and when to stop. ${tel('NHWK52')} is right of course.</p>`,
    task: () => `Tell ${tel('NHWK52')}: <b>this will be a no gyro approach</b>.`, hint: () => `${tel('NHWK52')}, this will be a no gyro approach.`,
    check(p, a) { return [csChk(p, a), need(p, 'ngStart', '"this will be a no gyro approach"')]; },
    post(a) { return a.ng ? null : 'the no-gyro announcement'; },
    good: 'From now on, "turn left", "turn right" and "stop turn". The pilot turns at standard rate until you say stop.',
    enter() { put('NHWK52', { r: 7.2, yft: 420, hdg: rel(-20) }); } },
  { id: 'ngTurn', sec: 'ng', type: 'call', cs: 'NHWK52',
    say: `<p>It is cutting toward the course at twenty degrees. Turn it right until it is pointing down the course, then stop the turn.</p>`,
    tasks: [
      { task: 'Say <b>turn right</b>.', hint: 'Turn right.',
        check(p) { const c = has(p, 'ngTurn'); return [!c ? '"turn right"' : c.dir === 'R' ? null : 'right, not left (it needs to come back toward the course)']; },
        then(next) { eng.feedback('info', 'Turning. I will stop the scope when the heading is nearly on the course.'); run(() => Math.abs(((ac('NHWK52').hdg - F.BRC + 540) % 360) - 180) < 3, { scale: 1 }, next); } },
      { task: 'Pointing down the course. Say <b>stop turn</b>.', hint: 'Stop turn.', check(p) { return [need(p, 'ngStop', '"stop turn"')]; } }],
    good: 'Close in, use "half standard rate turns" for smaller corrections.',
    enter() { const a = put('NHWK52', { r: 6.9, yft: 380, hdg: rel(-20) }); a.ng = true; } },
  { id: 'asrIn', sec: 'asr', type: 'call', cs: 'KNGT41',
    say: () => `<p>A surveillance approach, ASR, has no glidepath: you give course and range, and the pilot descends to a minimum descent altitude. Announce it by four miles for helicopters, five for jets.</p>`,
    task: () => `Tell ${tel('KNGT41')}: <b>this will be a surveillance approach</b>.`, hint: () => `${tel('KNGT41')}, this will be a surveillance approach.`,
    check(p, a) { return [csChk(p, a), need(p, 'asrStart', '"this will be a surveillance approach"')]; },
    post(a) { return a.asr ? null : 'the surveillance approach announcement'; },
    good: 'No glidepath calls on an ASR. Course and range only.',
    enter() { put('KNGT41', { r: 5.6, yft: 0, z: 1500 }); } },
  { id: 'asrDesc', sec: 'asr', type: 'call', cs: 'KNGT41', wait: true,
    say: '<p>For a helicopter, warn it at four miles and send it down at three, the final approach fix.</p>',
    tasks: [
      { task: () => `Four miles: <b>${tel('KNGT41')}, four miles, prepare to descend in one mile</b>.`, hint: () => `${tel('KNGT41')}, four miles, prepare to descend in one mile.`,
        check(p) { return [need(p, 'asrPrep', '"prepare to descend in one mile"')]; },
        then(next) { run(() => ac('KNGT41').r <= 3.02, { scale: 3 }, next); } },
      { task: () => `Three miles: <b>${tel('KNGT41')}, three miles, descend to your minimum descent altitude, minimum descent altitude four seven zero</b>.`,
        hint: () => `${tel('KNGT41')}, three miles, descend to your minimum descent altitude, minimum descent altitude four seven zero.`,
        check(p) { const c = has(p, 'asrMda'); return [!c ? '"descend to your minimum descent altitude"' : c.v == null || c.v === 470 ? null : 'the MDA: four seven zero']; } }],
    good: 'It descends to 470 feet and levels off. Keep giving course and range.',
    enter(api) { let a = ac('KNGT41'); if (!a || !a.asr) { a = put('KNGT41', { r: 4.6, z: 1500 }); a.asr = true; a.mda = F.ASR_MDA; }
      ready = false; run(() => ac('KNGT41').r <= 4.02, { scale: 3 }, () => { goNow('Four miles.'); }); } },
  { id: 'mapQ', sec: 'asr', type: 'choice',
    say: '<p>Last question.</p>',
    q: 'Where is the missed approach point on a surveillance approach, and what do you say there?',
    opts: [{ t: 'Three-quarter mile: "surveillance minimums, if mother not in sight, execute missed approach"', ok: true, why: 'Yes.' },
      { t: 'Half a mile: "over the deck"', ok: false, why: 'That is the PAR full-stop call over the landing spot.' },
      { t: 'Two miles: "see you"', ok: false, why: 'That is what the pilot says at two miles.' }],
    good: 'If the pilot sees the ship it continues visually; if not, it goes around.' },
  { id: 'advDone', sec: 'asr', type: 'done', say: '<p>That completes the Advanced section: practice approaches, no-gyro and surveillance approaches.</p><p>What next?</p>' },
];

/* v109: what Aero points at in each step */
const MARKS = {
  welcome: () => { markEl('cmdForm', 'Type your calls here'); markEl('micBox', 'Or hold to talk'); },
  elev: () => { markGp(6.6, 'Glidepath'); ringE(L21); },
  az: () => { markCourse(9.4, 'Course line'); ringA(L21); },
  courseQ: () => ringA(L21, 'Read this tick'),
  gpQ: () => { ringE(L21, 'Read this tick'); markGp(5.5, 'Glidepath'); },
  side: () => { markEl('readout', 'Readout'); markEl('log', 'Log'); markEl('micBox', 'Talk button'); markEl('cmdForm', 'Type box'); },
  intent: () => { ringA(L21); markEl('log', 'The check-in is in the log'); },
  contactCall: () => { ringA(L21); markEl('cmdForm', 'Your call'); },
  turnQ: () => { ringA(L21, 'Cutting in at 20°'); markCourse(5, 'Course line'); },
  lineup: () => { ringA(L21, 'Line it up'); markCourse(5, 'Course line'); },
  gpWatch: () => { ringE(L21, 'Level at 2,000 ft'); markGp(5, 'Glidepath'); },
  appr: () => { ringE(L21, 'Nearly on the glidepath'); },
  begin: () => { ringE(L21); markGp(5, 'Glidepath'); },
  dna: () => { ringA(L21, 'On the course line'); markCourse(5, 'Course line'); },
  combo: () => { ringE(L21, 'Glidepath'); ringA(L21, 'Course'); markRange(5, '5 miles'); },
  trendQ: () => { ringE(L21, 'Each sweep a little higher'); },
  adjust: () => { ringE(L21, 'Off the glidepath'); markGp(3, 'Glidepath'); },
  wind: () => { ringA(L21, 'Drifting'); markCourse(6.5, 'Course line'); },
  deckQ: () => { markRange(0.75, '¾ mile'); ringE(L21); },
  ball: () => { markRange(0.75, '¾ mile'); ringE(L21, 'Glidepath'); ringA(L21, 'Course'); },
  sinker: () => { ringE('LTNG22', 'Sinking'); markGp(5, 'Glidepath'); markSafe(1.7, 'Lower safety limit'); },
  waveoff: () => { ringA('LTNG22', 'Well left, close in'); markCourse(4, 'Course line'); },
  selfQ: () => { markRange(0.5, '½ mile'); },
  ship: () => { markEl('shipBanner', 'Ship turn'); markCourse(8.5, 'Final course'); ringA('LTNG23'); },
  grading: () => { markEl('log', 'Points show here'); },
  pracIn: () => { ringA('LTNG31'); },
  climb: () => { markRange(1, '1 mile'); ringE('LTNG31'); },
  delta: () => { markRange(1, '1 mile'); ringE('KNGT41'); },
  ngIn: () => { ringA('NHWK52'); markCourse(5, 'Course line'); },
  ngTurn: () => { ringA('NHWK52', 'Turn until it points down the course'); },
  asrIn: () => { ringA('KNGT41'); },
  asrDesc: () => { markRange(4, '4 miles'); markRange(3, '3 miles (FAF)'); ringE('KNGT41'); },
  mapQ: () => { markRange(0.75, '¾ mile (MAP)'); },
};

/* ---------------- runner ---------------- */
function tasksOf(st) { return st.tasks || (st.type === 'call' ? [st] : []); }
function curTask() { const st = eng && eng.step; return st ? tasksOf(st)[sub] : null; }
const val = (v, ...a) => typeof v === 'function' ? v(...a) : v;
function goNow(msg) { ready = true; const t = curTask(); if (eng) eng.speak(`<p>${msg}</p>` + (t ? `<p>${val(t.task)}</p>` : '')); }
function setSub(i) {
  sub = i; const st = eng.step, t = curTask(); if (!t) return;
  if (st.tasks) { eng.renderTask(val(t.task)); const hb = eng.root.querySelector('.hintBox'); if (hb) hb.style.display = 'none'; if (i > 0) eng.speak(`<p>${val(t.task)}</p>`); }
}
function missing(list) { return list.filter(Boolean); }
function heardMsg(p, miss) {
  const t = curTask();
  return `I heard: "${esc(p.raw || p.norm || '')}". Missing or wrong: ${miss.join('; ')}. Try: <span class="ex">${esc(val(t.hint) || '')}</span>`;
}
FI.gate = function (p, text) {
  if (!FI.active || FI.mode !== 'intro' || !eng) return true;
  const st = eng.step, t = curTask();
  eng.hush();
  if (!st || st.type !== 'call' || eng.solved) { eng.feedback('info', st && st.type === 'done' ? 'The guided part is finished. Pick what to do next.' : 'No radio call needed for this step. Press Next when you are ready.'); return false; }
  if (!ready) { eng.feedback('info', 'Not yet: wait until I stop the scope.'); return false; }
  if (PAUSED) { eng.feedback('info', 'Paused. Press Resume first.'); return false; }
  if (t.ship) { eng.fail(heardMsg(p, ['a 99 call (start with "99, mother")'])); return false; }
  if (p.cmds && p.cmds.some(c => c.k === 'adjDescent')) { eng.fail(heardMsg(p, ['leave out the rate of descent: only tell the pilot where it is (course, glidepath, range)'])); return false; }
  const a = cur();
  if (!a) return true;
  const miss = missing(val(t.check ? t.check(p, a, text) : []));
  if (miss.length) { eng.fail(heardMsg(p, miss)); return false; }
  held = { st, t, a };
  return true;
};
FI.after = function (p) {
  if (!FI.active || FI.mode !== 'intro' || !eng) return;
  const st = eng.step, t = curTask();
  if (!st || st.type !== 'call' || eng.solved || !t) return;
  if (p && p.ship) { if (!t.ship) return; }
  else { if (!held || held.t !== t) return; }
  const h = held; held = null;
  const a = h ? h.a : cur();
  const pm = t.post ? t.post(a) : null;
  if (pm) { eng.fail(`Not quite: ${pm}. Try: <span class="ex">${esc(val(t.hint) || '')}</span>`); return; }
  const fin = () => { if (eng.step !== st) return; const list = tasksOf(st); if (sub < list.length - 1) { eng.feedback('ok', 'Good.'); setSub(sub + 1); } else eng.succeed(); };
  if (t.then) t.then(fin); else fin();
};
FI.onLog = function (cls, text) {
  if (!FI.active) return;
  if (cls === 'plt' && eng && eng.yieldVoice) eng.yieldVoice();   // the pilot's radio goes first; Aero picks up after
  if (FI.mode === 'watch') watchLog(cls, text);
};

/* ---------------- session ---------------- */
let saved = null;
function begin(mode) {
  saved = { lay: ['normal', 'expand', 'trans'].find(m => document.body.classList.contains('lay-' + m)) || 'normal', phr: F.isShip() ? 'ship' : 'tower' };
  if (!F.isShip()) F.setPhr('ship');
  if (saved.lay !== 'normal') F.setLayout('normal');
  try { localStorage.setItem('fcpar_tut_seen', '1'); } catch (e) {}
}
function teardown() {
  stopRun(); clearInterval(keepT); keepT = null; clearHL(); clearInterval(watchT); watchT = null;
  if (eng) { eng.destroy(); eng = null; }
  FI.active = false; FI.mode = null; held = null; ready = true;
  document.body.classList.remove('introOn', 'aeroWatch');
  if (saved) { if (saved.phr === 'tower') F.setPhr('tower'); if (saved.lay !== 'normal') F.setLayout(saved.lay); saved = null; }
}
function launch(which, opts) {
  teardown(); begin('intro');
  sec = which;
  if (opts && opts.restart) try { localStorage.removeItem(KEYS[which]); } catch (e) {}
  setMeta({ last: which });
  F.startGame('training', { intro: true, arrivals: 0, brc: 360, shipTurns: false, pilotBias: 0, seed: 106, wind: { dir: 360, spd: 0, gust: 0 } });
  const g = G(); g.forceSink = false; g.wind.spd = 0; g.wind.gust = 0; if (g.gustNow) { g.gustNow.x = 0; g.gustNow.y = 0; }
  F.setPaused(true);
  document.body.classList.add('introOn');
  FI.active = true; FI.mode = 'intro';
  const steps = which === 'adv' ? ADV : CORE;
  eng = IntroEngine.create({ mount: $('panel'), id: 'aeroBox', steps, sections: which === 'adv' ? SEC_ADV : SEC_CORE, storeKey: KEYS[which],
    canSpeak: () => !F.ttsBusy(),
    speechFix: s => s.replace(/\b99\b/g, 'niner niner').replace(/\bF-35B\b/g, 'F thirty-five B').replace(/\b(Lightning|Knight|Nighthawk|Gunfighter|Viper|Venom|Ridge|Charger)\s+(\d{2,3})\b/g, (m, w, d) => w + ' ' + IntroEngine.sayDigits(d)),
    task: st => { const t = tasksOf(st)[st === (eng && eng.step) ? sub : 0]; return t ? val(t.task) : val(st.task); },
    hint: st => { const t = tasksOf(st)[st === (eng && eng.step) ? sub : 0]; return t ? val(t.hint) : null; },
    onEnter(st, api) { clearHL(); sub = 0; held = null; ready = true; PAUSED = false; freeze();
      if (st.tasks) setSub(0);
      if (st.type === 'done') setMeta(which === 'adv' ? { advDone: true } : { coreDone: true });
      const c = st.enter ? st.enter(api) : null; F.refreshPanel(true); if (MARKS[st.id]) try { MARKS[st.id](api); } catch (e) { console.error(e); } return c; },
    onLeave(st) { stopRun(); clearHL(); sub = 0; if (st.leave) try { st.leave(); } catch (e) {} },
    onSkip(st) { stopRun(); },
    onPause(on) { onPause(on); },
    onExit() { exitToStart('train'); },
    nextCue: 'Click <b>Next</b> when you\'re ready.',
    renderDone(st, el) { doneButtons(el, which); } });
  speedBar();
  keepT = setInterval(keepAlive, 100);
  const pr = prog(which), i = opts && opts.restart ? 0 : pr && pr.i >= 0 ? Math.min(pr.i, steps.length - 1) : 0;
  eng.show(i);
}
function doneButtons(el, which) {
  const b = (t, s, fn) => { const x = document.createElement('button'); x.type = 'button'; x.innerHTML = `<b>${t}</b><span>${s}</span>`; x.onclick = fn; el.appendChild(x); return x; };
  b('Start Regular Training', 'Training level: aircraft one after another, scored, with no guide.', () => { teardown(); F.startGame('training', {}); });
  if (which !== 'adv') b('Advanced section', 'Practice approaches, no-gyro and surveillance (ASR) approaches.', () => launch('adv', { restart: !!(meta().advDone) }));
  else b('Restart the Advanced section', 'Go through practice, no-gyro and ASR again.', () => launch('adv', { restart: true }));
  b('Solo approach with Aero watching', 'One aircraft on your own, start to finish. Aero stays quiet unless something goes wrong.', () => soloWatch());
}
function exitToStart(card) {
  teardown();
  const g = G(); if (g) { g.over = true; g.paused = true; }
  F.endOv.classList.add('hidden'); F.helpOv.classList.add('hidden'); F.startOv.classList.remove('hidden');
  selectCard(card || 'train'); renderCard();
}

/* ---------------- solo approach with Aero watching ---------------- */
let watchT = null, lastTip = 0;
function soloWatch() {
  teardown(); begin('watch');
  F.startGame('training', { arrivals: 1, brc: 360, shipTurns: false, noHints: true, wind: { dir: 360, spd: 3, gust: 0 } });
  document.body.classList.add('aeroWatch');
  FI.active = true; FI.mode = 'watch';
  eng = IntroEngine.create({ mount: $('panel'), id: 'aeroBox', sections: [{ id: 'solo', name: 'Solo approach' }],
    steps: [{ id: 'solo', sec: 'solo', type: 'watch', say: '<p>Your turn: one aircraft, start to finish. I will only speak up if something goes wrong. Good luck.</p>', task: 'Work the approach: contact call, line-up, glidepath, talk-down, deck call.' }],
    canSpeak: () => !F.ttsBusy(), onExit() { exitToStart('train'); } });
  eng.root.querySelector('.nav').style.display = 'none';
  eng.show(0);
  const g0 = G();
  watchT = setInterval(() => {
    const g = G(); if (!eng) return;
    if (g !== g0) { teardown(); return; }
    if (g.over) { clearInterval(watchT); watchT = null; const r = (g.results || [])[0];
      const msg = r ? `Session over: ${r.cs ? tel(r.cs) + ' ' : ''}${r.landed ? 'landed' : r.practice ? 'finished its practice approach' : 'did not land'}, score ${r.score}. Check the report for the details.` : 'Session over. Check the report for the details.';
      eng.feedback('ok', msg); eng.speak(msg); }
  }, 500);
}
function watchLog(cls, text) {
  if (!eng || (cls !== 'warn' && cls !== 'bad' && cls !== 'good')) return;
  const now = performance.now();
  if (cls === 'good') { if (/landed|on deck|\+\d+ landing/i.test(text)) { eng.feedback('ok', esc(text)); } return; }
  eng.feedback('bad', esc(text));
  if (now - lastTip > 7000) { lastTip = now; eng.speak(`<p>${esc(text.replace(/\s*\([^)]*\)/g, ''))}</p>`); }
}

/* ---------------- start screen ---------------- */
function selectCard(m) {
  document.querySelectorAll('#modeCards .mode').forEach(x => x.classList.toggle('on', x.dataset.m === m));
  const tb = $('trainBox'); if (tb) tb.classList.toggle('off', m === 'intro');
}
const CORE_N = CORE.filter(s => s.type !== 'done').length;
function renderCard() {
  const box = $('introBtns'); if (!box) return;
  const m = meta(), pc = prog('core'), pa2 = prog('adv');
  const mk = (t, fn, cls) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = t; if (cls) x.className = cls; x.onclick = e => { e.stopPropagation(); fn(); }; box.appendChild(x); return x; };
  box.innerHTML = '';
  const inProg = pc && pc.i > 0 && !m.coreDone;
  if (inProg) { mk(`Resume (step ${Math.min(pc.i + 1, CORE_N)} of ${CORE_N})`, () => launch('core'), 'on'); mk('Restart', () => launch('core', { restart: true })); }
  else mk(m.coreDone ? 'Run the intro again' : 'Start the intro', () => launch('core', { restart: true }), 'on');
  const advIn = pa2 && pa2.i > 0 && !m.advDone;
  mk(advIn ? 'Resume Advanced' : 'Advanced section', () => launch('adv', { restart: !advIn }));
  if (m.coreDone) mk('Solo approach with Aero', () => soloWatch());
  const sub2 = $('introSub');
  if (sub2) sub2.textContent = m.coreDone ? 'Done. Run it again, try the Advanced section (practice, no-gyro, ASR), or fly a solo approach with Aero watching.' :
    inProg ? `In progress: step ${Math.min(pc.i + 1, CORE_N)} of ${CORE_N}. Pick up where you left off.` : 'About 20 minutes. Aero, your training guide, walks you through the PAR scope, the talk-down and the calls, step by step, on this scope.';
}
document.querySelectorAll('#modeCards .mode').forEach(el => {
  el.addEventListener('click', () => selectCard(el.dataset.m));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(el.dataset.m); } });
});
renderCard();
let want = 'train'; try { want = new URLSearchParams(location.search).get('intro') === '1' ? 'intro' : 'train'; } catch (e) {}
selectCard(want);
FI.launch = launch; FI.exit = exitToStart; FI.soloWatch = soloWatch; FI.steps = { core: CORE, adv: ADV };
Object.defineProperty(FI, 'engine', { get: () => eng });
Object.defineProperty(FI, 'sub', { get: () => sub });
Object.defineProperty(FI, 'ready', { get: () => ready });
})();
