/* AATCC Final Controller guided intro (v106): "Guided Intro with Aero" on the real PAR scope.
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
const LS = 'aatccFinalIntro', KEYS = { core: 'aatccFinalIntro.core', adv: 'aatccFinalIntro.adv' };
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
let runT = null, keepT = null, eng = null, sec = null, sub = 0, held = null, ready = true;
function stopRun() { clearInterval(runT); runT = null; }
function freeze() { stopRun(); if (G()) { F.setPaused(true); G().scale = 1; } }
function run(cond, opt, done) {   // run the sim until cond() (or timeout), then freeze
  stopRun(); const g = G(); if (!g) return;
  g.scale = (opt && opt.scale) || 1; F.setPaused(false);
  const t0 = g.t, lim = (opt && opt.simTimeout) || 400;
  runT = setInterval(() => {
    if (G() !== g || g.over) return stopRun();
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
function clearHL() { hlEls.forEach(e => e.remove()); hlEls = []; document.querySelectorAll('.fiHL').forEach(e => e.classList.remove('fiHL')); }
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
#aeroBox{flex:none}`;
  document.head.appendChild(st);
})();

/* ---------------- steps ---------------- */
const SEC_CORE = [
  { id: 'brief', name: 'Brief' }, { id: 'scope', name: 'The scope' }, { id: 'contact', name: 'Contact and line-up' }, { id: 'gp', name: 'Glidepath' },
  { id: 'talk', name: 'Talk-down' }, { id: 'deck', name: 'Deck and landing' }, { id: 'wrong', name: 'When it goes wrong' }, { id: 'ship', name: 'Ship turns and grading' },
];
const SEC_ADV = [{ id: 'prac', name: 'Practice approaches' }, { id: 'ng', name: 'No-gyro' }, { id: 'asr', name: 'Surveillance (ASR)' }];
const L21 = 'LTNG21';
const CORE = [
  { id: 'welcome', sec: 'brief', type: 'info',
    say: `<p>Hi, I'm <span class="k">Aero</span>. I'll walk you through Final Controller on the real PAR scope, one step at a time.</p>
      <p>You talk an aircraft down to the USS Wasp: you watch its position on the scope and tell the pilot where it is and how to fix it. Each call you make, I check first. If it's right, the pilot hears it. If not, I'll tell you what to change.</p>
      <p>Type your calls in the box on the right and press Enter, or hold the talk button or the Space bar and speak. The scope stays frozen while we talk. Press Next when you're ready.</p>`,
    enter() { const g = G(); g.ac = []; F.refreshPanel(true); } },
  { id: 'arrive', sec: 'brief', type: 'watch', cs: L21,
    say: `<p>Here comes your first aircraft. Listen to its check-in: callsign, range, altitude, heading, and what it wants.</p>`,
    task: 'Listen to the check-in.',
    enter(api) { const g = G(); g.ac = []; put(L21, { r: 8.6, yft: 760, hdg: rel(-20), talk: true, contacted: false });
      let n = 0; const t = setInterval(() => { if (++n > 50 || (n > 12 && !F.ttsBusy())) { clearInterval(t); api.succeed(`That was <span class="k">${tel(L21)}</span>: eight miles, level two thousand, heading ${say3(rel(-20))}, for the PAR to the ship, full stop. Its data block shows the same.`); } }, 100);
      return () => clearInterval(t); } },
  { id: 'elev', sec: 'scope', type: 'info', cs: L21,
    say: `<p>The top panel is the <span class="k">elevation</span> display: height against range. The sloping line is the <span class="k">glidepath</span>, coming down to the ship at the left.</p>
      <p>A target above the line is above the glidepath, below the line is below it. Right now ${tel(L21)} is level at two thousand feet, under the glidepath. It flies level until it meets the line.</p>`,
    enter() { put(L21, { r: 8.4, yft: 720, hdg: rel(-20) }); hlScope('elev'); } },
  { id: 'az', sec: 'scope', type: 'info', cs: L21,
    say: `<p>The bottom panel is the <span class="k">azimuth</span> display: left and right of the final course. The centre line is the course to the ship.</p>
      <p>Each target has a short tick. Course line through the middle of the tick means <span class="k">on course</span>. Between the middle and the end means <span class="k">slightly</span> left or right. Touching the end means left or right of course. Not touching at all means <span class="k">well</span> left or right.</p>`,
    enter() { put(L21, { r: 8.4, yft: 720, hdg: rel(-20) }); hlScope('az'); } },
  { id: 'servo', sec: 'scope', type: 'watch', cs: L21, skip: true, noServo: true,
    say: `<p>So far I have been moving the <span class="k">servo</span> for you. On the real scope a target only shows inside the servo band, the brighter strip you move with the mouse or your finger.</p>
      <p>I've cleared the bands, so the target is hidden now.</p>`,
    task: 'Click and hold on the <b>elevation</b> display at the target\'s height to move the band there, then do the same on the <b>azimuth</b> display. You can drag to follow it.',
    enter(api) { put(L21, { r: 8.35, yft: 710, hdg: rel(-20) });
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
    enter() { put(L21, { r: 8.3, yft: 700, hdg: rel(-20) }); hlScope('az'); } },
  { id: 'gpQ', sec: 'scope', type: 'choice', cs: L21,
    say: `<p>Now the elevation display.</p>`,
    q: () => `Where is ${tel(L21)} against the glidepath?`,
    opts: [{ t: 'Above the glidepath, it needs to come down', ok: false, why: 'Look again: the target is under the sloping line.' },
      { t: 'Below the glidepath, flying level to meet it', ok: true, why: 'Right.' },
      { t: 'On the glidepath', ok: false, why: 'Not yet: it is level at two thousand feet, and the glidepath is higher at this range.' }],
    good: `Before it meets the glidepath you don't give glidepath calls. You'll tell it when it's getting close.`,
    enter() { put(L21, { r: 8.3, yft: 700, hdg: rel(-20) }); hlScope('elev'); } },
  { id: 'side', sec: 'scope', type: 'info', cs: L21,
    say: `<p>On the right: the <span class="k">readout</span> for the selected aircraft (range, height, heading), the surveillance view, and the <span class="k">log</span>, which shows every call, every reply and your points.</p>
      <p>Above them is the talk button and the type box. Typed and spoken calls are treated the same.</p>`,
    enter() { put(L21, { r: 8.3, yft: 700, hdg: rel(-20) }); hlEl('readout', 'log', 'micBox', 'cmdForm'); } },
  { id: 'intent', sec: 'contact', type: 'choice', cs: L21,
    say: `<p>Before your first call, think about what the pilot asked for.</p>`,
    q: `What did ${'Lightning 21'} ask for at check-in?`,
    opts: [{ t: 'A full stop: land on the ship', ok: true, why: 'Yes, full stop.' }, { t: 'Practice approaches', ok: false, why: 'Not this time; practice aircraft say "request multiple practice PARs". That is in the Advanced section.' },
      { t: 'A no-gyro approach', ok: false, why: 'No; you decide that one, and it is in the Advanced section.' }],
    good: 'A full stop ends with a deck call and a landing.',
    enter() { put(L21, { r: 8.3, yft: 700, hdg: rel(-20), contacted: false }); } },
  { id: 'contactCall', sec: 'contact', type: 'call', cs: L21,
    say: `<p>Your first call to it is the <span class="k">contact call</span>.</p>`,
    task: () => `Make the contact call to ${tel(L21)}: callsign, <b>Gator Final</b>, ask how it hears you, remind it the wheels should be down, and ask it to report seeing you.`,
    hint: () => `${tel(L21)}, Gator Final, how do you hear me, wheels should be down, report see me.`,
    check(p, a, text) { return [csChk(p, a), /\bgator\s+final\b/i.test(text) ? null : '"Gator Final"', need(p, 'hear', '"how do you hear me"'), need(p, 'gear', '"wheels should be down"'), need(p, 'reportSee', '"report see me"')]; },
    good: 'Loud and clear. That full contact call scores a bonus point. From now on the pilot reads back with just the callsign.',
    enter() { put(L21, { r: 8.2, yft: 690, hdg: rel(-20), contacted: false, gear: false }); } },
  { id: 'turnQ', sec: 'contact', type: 'choice', cs: L21,
    say: () => `<p>${tel(L21)} is right of course on heading ${say3(rel(-20))}, so it is cutting back toward the course line at twenty degrees. If you leave it, it will shoot through the line.</p>`,
    q: 'To ease it onto the course, which way do you turn it?',
    opts: () => [{ t: `Come right, heading ${say3(rel(-10))}`, ok: true, why: 'Yes: a smaller cut toward the line, so it eases in instead of overshooting.' },
      { t: `Come left, heading ${say3(rel(-30))}`, ok: false, why: 'That makes the cut steeper; it would overshoot the course faster.' },
      { t: 'No turn, just keep calling its position', ok: false, why: 'Position calls alone do not move it sideways. Headings are the only way to move it left or right.' }],
    enter() { put(L21, { r: 8.0, yft: 640, hdg: rel(-20) }); } },
  { id: 'lineup', sec: 'contact', type: 'call', cs: L21,
    say: `<p>Heading corrections always go with a course call: say where it is, then the turn.</p>`,
    tasks: [
      { task: () => `Tell ${tel(L21)} where it is on course, then <b>come right heading ${say3(rel(-10))}</b>.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, come right heading ${say3(rel(-10))}.`,
        check(p, a) { const h = has(p, 'hdg'); return [courseChk(p, a), !h ? `the turn (come right heading ${say3(rel(-10))})` : (h.v === rel(-10) && h.dir !== 'L') ? null : `the heading: right ${say3(rel(-10))}`]; },
        then(next) { eng.feedback('info', 'Watch it ease toward the course line. I will stop the scope when it is nearly on.'); run(() => Math.abs(ac(L21).yft) < 140 || F.courseCat(ac(L21)) === 'on', { scale: 3 }, next); } },
      { task: () => `Nearly on course. Call its position and turn it onto the final course: <b>heading ${say3(F.BRC)}</b>.`,
        hint: () => `${cap(liveCourse(ac(L21)))}, come right heading ${say3(F.BRC)}.`,
        check(p, a) { const h = has(p, 'hdg'); return [courseChk(p, a), !h ? `the turn (heading ${say3(F.BRC)})` : h.v === F.BRC ? null : `the heading: ${say3(F.BRC)}, the final course`]; } }],
    good: 'Lined up. Small corrections from here: five degrees or less close in.',
    enter() { put(L21, { r: 7.9, yft: 620, hdg: rel(-20) }); } },
  { id: 'gpWatch', sec: 'gp', type: 'watch', cs: L21,
    say: `<p>Now watch the elevation display. ${tel(L21)} is level at two thousand feet and the glidepath comes down to meet it.</p>`,
    task: 'Watch it close on the glidepath.',
    enter(api) { const a = ac(L21) && ac(L21).phase === 'final' && ac(L21).r > 6.8 ? ac(L21) : put(L21, { r: 7.5, yft: 40 }); a.tgtHdg = F.BRC; hlScope('elev');
      run(() => F.ttiGp(ac(L21)) <= 24, { scale: 3 }, () => api.succeed('Close now: about twenty seconds from the glidepath.')); } },
  { id: 'appr', sec: 'gp', type: 'call', cs: L21,
    say: `<p>Ten to thirty seconds before it meets the glidepath, warn the pilot.</p>`,
    task: 'Say <b>approaching glidepath</b>.', hint: 'Approaching glidepath.',
    check(p) { return [need(p, 'approachingGp', '"approaching glidepath"')]; },
    good: 'Good timing. That earns a bonus point.',
    enter() { const a = ac(L21); if (!a || a.phase !== 'final' || F.ttiGp(a) > 30 || F.ttiGp(a) < 10) { const r = 2000 / F.gpAlt(1) + 0.5; put(L21, { r, yft: 30 }); } } },
  { id: 'begin', sec: 'gp', type: 'call', cs: L21, wait: true,
    say: `<p>When the target reaches the glidepath line, the pilot needs your call to start down. I'll run the scope until it gets there.</p>`,
    task: 'It is on the glidepath. Say <b>begin descent</b>.', hint: 'Begin descent.',
    check(p) { return [need(p, 'beginDescent', '"begin descent"')]; },
    good: 'Descending. It will now follow your glidepath calls.',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'final' || F.ttiGp(a) > 32) a = put(L21, { r: 2000 / F.gpAlt(1) + 0.3, yft: 30 });
      ready = false; run(() => F.gpAlt(ac(L21).r) <= ac(L21).z + 12, { scale: 3 }, () => { goNow('It is on the glidepath now.'); }); } },
  { id: 'dna', sec: 'gp', type: 'call', cs: L21,
    say: `<p>On the glidepath you talk almost non-stop, so the pilot stops answering. Tell it right after begin descent, on its own.</p>`,
    task: 'Say <b>do not acknowledge further transmissions</b>.', hint: 'Do not acknowledge further transmissions.',
    check(p) { return [need(p, 'dna', '"do not acknowledge further transmissions"')]; },
    good: 'From now on the pilot stays quiet, so you will not hear readbacks. That is normal.',
    enter() { const a = ac(L21); if (!a || a.phase !== 'descent') put(L21, { r: 6.1, phase: 'descent' }); } },
  { id: 'rhythm', sec: 'talk', type: 'watch', cs: L21,
    say: `<p>Now the talk-down. Every few seconds: the course, then the glidepath. Once every mile add the range, like <span class="ex">On course, on glidepath, five miles.</span></p>
      <p>Watch both displays for a few seconds while it comes down.</p>`,
    task: 'Watch the target on both displays.',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 5.3 || a.r > 5.8) a = put(L21, { r: 5.6, phase: 'descent', dna: true, yft: a ? a.yft : 0 });
      run(() => ac(L21).r <= 5.05, { scale: 1, simTimeout: 60 }, () => api.succeed('Five miles. Your turn.')); } },
  { id: 'combo', sec: 'talk', type: 'call', cs: L21,
    say: `<p>Put it together.</p>`,
    task: 'Give the course, the glidepath and the range in one call.',
    hint: () => { const a = ac(L21); return `${cap(liveCourse(a))}, ${liveGp(a)}, ${MILES[Math.round(a.r)]} miles.`; },
    check(p, a) { return [courseChk(p, a), gpChk(p, a), rangeChk(p, a)]; },
    good: 'That is the rhythm: course, glidepath, and the range every mile.',
    enter() { const a = ac(L21); if (!a || a.phase !== 'descent' || Math.abs(a.r - 5) > 0.3) put(L21, { r: 5.0, phase: 'descent', dna: true, yft: 30 }); hlScope('elev'); hlScope('az'); } },
  { id: 'trendQ', sec: 'talk', type: 'choice', cs: L21,
    say: `<p>Sometimes the target keeps moving the same way, sweep after sweep.</p>`,
    q: 'It is on the glidepath but each sweep shows it a little higher. What do you add?',
    opts: [{ t: '"Going above glidepath"', ok: true, why: 'Yes: a trend call warns the pilot before it is off.' },
      { t: '"Well above glidepath"', ok: false, why: 'Not yet; call what you see. It is still on the glidepath, just trending up.' },
      { t: 'Nothing until it is off the glidepath', ok: false, why: 'Waiting makes the correction bigger. Warn early with a trend call.' }],
    good: 'The same works sideways: "going left of course".',
    enter() { const a = ac(L21); if (!a || a.phase !== 'descent') put(L21, { r: 4.7, phase: 'descent', dna: true }); } },
  { id: 'adjust', sec: 'talk', type: 'call', cs: L21,
    say: `<p>Now it has drifted high. When it is off the glidepath, give the glidepath call and the fix.</p>`,
    task: () => `It is ${liveGp(ac(L21))}. Call it and tell it to <b>increase rate of descent</b>.`,
    hint: () => `${cap(liveCourse(ac(L21)))}, ${liveGp(ac(L21))}, increase rate of descent.`,
    check(p, a) { return [gpChk(p, a), need(p, 'adjDescent', '"increase rate of descent"'), (has(p, 'adjDescent') || {}).v === 'reduce' ? 'the right fix: it is high, so increase (not reduce) the rate of descent' : null]; },
    then(done) { run(() => false, { scale: 3, simTimeout: 9 }, () => done()); },
    good: 'Watch it settle back toward the line. Below the glidepath it is the opposite: reduce rate of descent.',
    enter() { const r = 4.5; let dz = 60; for (let d = 30; d <= 220; d += 5) { const t = { r, z: F.gpAlt(r) + d }; if (F.gpCat(t) === 'slightly' && F.gpAccepts(t, 'slightly') && !F.gpAccepts(t, 'on') && !F.gpAccepts(t, 'plain')) { dz = d; break; } }
      put(L21, { r, phase: 'descent', dna: true, dz }); hlScope('elev'); } },
  { id: 'wind', sec: 'talk', type: 'watch', cs: L21,
    say: `<p>Wind pushes the aircraft sideways. I'll add a crosswind from the right. Watch the azimuth display: it slowly drifts left of course.</p>
      <p>You fix drift the same way: a course call plus a small heading change into the wind.</p>`,
    task: 'Watch the drift on the azimuth display.',
    enter(api) { const a = ac(L21) && ac(L21).phase === 'descent' && ac(L21).r > 3.2 ? ac(L21) : put(L21, { r: 3.9, phase: 'descent', dna: true });
      G().wind.dir = rel(90); G().wind.spd = 18; G().wind.gust = 0; hlScope('az');
      run(() => false, { scale: 3, simTimeout: 14 }, () => { api.succeed(`See it drift? It is now ${liveCourse(ac(L21))}. A few degrees right would hold it on the line.`); }); },
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
    say: `<p>I'll run it in to three-quarter mile. At two miles the pilot reports "see you": that is normal, keep talking.</p>`,
    task: 'Three-quarter mile. Give the jet deck call.', hint: 'Three-quarter mile, call the ball.',
    check(p) { return [need(p, 'callBall', '"three-quarter mile, call the ball"')]; },
    good: '"Ball" means the pilot has the landing aid in sight, and it is cleared. You can say "roger ball".',
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'descent' || a.r < 0.8 || a.r > 2.2) a = put(L21, { r: 2.15, phase: 'descent', dna: true }); G().wind.spd = 0;
      a.yft = Math.max(-60, Math.min(60, a.yft)); a.tgtHdg = F.BRC; a.hdg = F.BRC;
      ready = false; run(() => ac(L21).r <= 0.78, { scale: 3 }, () => { goNow('Three-quarter mile.'); }); } },
  { id: 'deck', sec: 'deck', type: 'call', cs: L21, wait: true,
    say: `<p>Keep it coming. Over the landing spot you tell it, then send it to Tower.</p>`,
    task: () => `Say <b>over the deck</b>, then <b>${tel(L21)}, contact Tower</b>.`, hint: () => `Over the deck. ${tel(L21)}, contact Tower.`,
    check(p, a) { return [need(p, 'thr', '"over the deck"'), need(p, 'tower', '"contact Tower"'), has(p, 'tower') ? csChk(p, a) : null]; },
    then(done) { run(() => !ac(L21) || ac(L21).phase === 'landed', { scale: 1, simTimeout: 40 }, () => done()); },
    good: () => `${tel(L21)} is on deck. Nice talk-down.`,
    enter(api) { let a = ac(L21); if (!a || a.phase !== 'visual') { a = put(L21, { r: 0.75, phase: 'descent', dna: true }); a.ballAsked = a.ballCalled = true; a.cleared = true; a.phase = 'visual'; }
      ready = false; run(() => !ac(L21) || ac(L21).r <= 0.3, { scale: 2 }, () => { goNow('Over the deck now.'); }); } },
  { id: 'sinker', sec: 'wrong', type: 'call', cs: 'LTNG22', wait: true,
    say: () => `<p>A new jet, ${tel('LTNG22')}, is on the glidepath at three miles. Some aircraft keep sinking even after your glidepath calls. Watch the elevation display.</p>`,
    task: () => `It is sinking below the glidepath. Give the full <b>low altitude alert</b>: the alert, the callsign, check your altitude immediately, and the altimeter.`,
    hint: () => `Low altitude alert, ${tel('LTNG22')}, check your altitude immediately, altimeter two niner niner two.`,
    check(p, a, text) { const t = ' ' + String(text).toLowerCase() + ' ';
      return [need(p, 'laa', '"low altitude alert"'), csChk(p, a), /check (?:your )?altitude immediately/.test(t) ? null : '"check your altitude immediately"', /altimeter\s+(?:two|2)\s*(?:niner|nine|9)\s*(?:niner|nine|9)\s*(?:two|2)\b|altimeter\s+2992/.test(t) ? null : '"altimeter two niner niner two"']; },
    post(a) { return a.sinkOn ? 'the full alert: all four parts' : null; },
    then(done) { run(() => false, { scale: 3, simTimeout: 8 }, () => done()); },
    good: 'The pilot climbs back to the glidepath on its own. A low altitude alert always goes out in full, even after "do not acknowledge".',
    enter(api) { const a = put('LTNG22', { r: 3.3, phase: 'descent', dna: true, sinkR: 3.15 }); hlScope('elev');
      ready = false; run(() => F.gpAlt(ac('LTNG22').r) - ac('LTNG22').z > 70, { scale: 2, simTimeout: 60 }, () => { goNow('It is sinking. Call it now.'); }); } },
  { id: 'waveoff', sec: 'wrong', type: 'call', cs: 'LTNG22',
    say: () => `<p>Now it has gone well left close in. That is unsafe: wave it off. The wave-off is said twice, then the climb and the base recovery course.</p>`,
    task: () => `Wave off ${tel('LTNG22')}: climb and maintain two thousand, fly base recovery course ${say3(F.BRC)}.`,
    hint: () => `${tel('LTNG22')}, wave off, wave off, climb and maintain two thousand, fly base recovery course ${say3(F.BRC)}.`,
    check(p, a) { const al = has(p, 'alt'), h = has(p, 'hdg'); return [csChk(p, a), need(p, 'ga', '"wave off, wave off"'), !al ? '"climb and maintain two thousand"' : al.v === 2000 ? null : 'two thousand feet', !h ? `"fly base recovery course ${say3(F.BRC)}"` : h.v === F.BRC ? null : `the base recovery course ${say3(F.BRC)}`]; },
    post(a) { return a.phase === 'missed' ? null : 'the wave-off (it did not go around)'; },
    then(done) { run(() => false, { scale: 3, simTimeout: 8 }, () => done()); },
    good: 'Waving off. A wave-off costs no points: an unsafe approach is never worth saving.',
    enter() { put('LTNG22', { r: 1.3, phase: 'descent', dna: true, yft: -520, hdg: rel(-6) }); hlScope('az'); } },
  { id: 'selfQ', sec: 'wrong', type: 'choice',
    say: '<p>One more safety rule.</p>',
    q: 'A full-stop jet reaches half a mile and you never gave the deck call. What does the pilot do?',
    opts: [{ t: 'Lands anyway', ok: false, why: 'No: without the deck call the deck is not clear.' },
      { t: 'Waves off on its own: fouled deck', ok: true, why: 'Right.' },
      { t: 'Holds at half a mile', ok: false, why: 'Aircraft cannot hold on final.' }],
    good: 'The same happens if it is unstable close in, or if you stop talking for too long: the pilot assumes lost communications and waves off.',
    enter() { const g = G(); g.ac = g.ac.filter(x => x.phase === 'missed'); F.refreshPanel(true); } },
  { id: 'ship', sec: 'ship', type: 'call', cs: 'LTNG23',
    say: () => `<p>The ship turns now and then, and the final course turns with it. I'll start a starboard turn of ten degrees with ${tel('LTNG23')} on final. Watch the banner.</p>`,
    tasks: [
      { task: 'Mother is turning. Broadcast it: <b>99, mother is in starboard turn, standby for new BRC</b>.', hint: '99, mother is in starboard turn, standby for new BRC.',
        ship: 'turn', post() { const s = G().ship; return s && s.gotTurn ? null : 'the 99 turn call while the ship is turning (port or starboard)'; },
        then(next) { eng.feedback('info', 'Watch the course line swing. I will stop when the ship is steady.'); run(() => { const s = G().ship; return s.phase !== 'turn' && s.phase !== 'warn' && s.endT != null; }, { scale: 1 }, next); } },
      { task: () => `Mother is steady. Broadcast the new BRC: <b>99, mother is steady, new BRC ${say3(F.shipBrcT())}</b>.`, hint: () => `99, mother is steady, new BRC ${say3(F.shipBrcT())}.`,
        ship: 'steady', post() { const s = G().ship; return s && s.gotSteady ? null : `the 99 steady call with the new BRC ${say3(F.shipBrcT())}`; } },
      { task: () => `The course moved but ${tel('LTNG23')} kept its old heading. Turn it onto the new final course: <b>heading ${say3(F.BRC)}</b>.`,
        hint: () => `${cap(liveCourse(ac('LTNG23')))}, come right heading ${say3(F.BRC)}.`,
        check(p, a) { const h = has(p, 'hdg'); return [!h ? `the heading (${say3(F.BRC)})` : h.v === F.BRC ? null : `the new final course ${say3(F.BRC)}`]; } }],
    good: 'Two 99 calls each turn, then fix the heading. Each 99 call is worth ten points.',
    enter(api) { const g = G(); put('LTNG23', { r: 6.5, yft: 0, z: 2000 }); g.ship.phase = null; g.ship.endT = null;
      F.shipInstCmd({ dir: 'starboard', deg: 10 }); ready = false;
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
  if (t.ship) { eng.fail(heardMsg(p, ['a 99 call (start with "99, mother")'])); return false; }
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
    onEnter(st, api) { clearHL(); sub = 0; held = null; ready = true; freeze();
      if (st.tasks) setSub(0);
      if (st.type === 'done') setMeta(which === 'adv' ? { advDone: true } : { coreDone: true });
      const c = st.enter ? st.enter(api) : null; F.refreshPanel(true); return c; },
    onLeave(st) { stopRun(); clearHL(); sub = 0; if (st.leave) try { st.leave(); } catch (e) {} },
    onSkip(st) { stopRun(); },
    onExit() { exitToStart('train'); },
    renderDone(st, el) { doneButtons(el, which); } });
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
