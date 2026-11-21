/* scenarios.js (v133): Marshal and Approach training scenarios + the start-screen picker.
   - SCENARIOS below is plain data: add a new scenario by copying one entry; no scope code changes needed.
   - Each scenario replaces the level's traffic (the level still sets hints and how firm the pilots are). "Free play" = the level's normal traffic.
   - Linked scopes run the same scenario: the scope that presses Start sends the scenario id with the linked start (link-sync.js); the Instructor's
     scenario box sends 'scn-set' on stinger-link so every open picker follows it.
   - Events: 'emer' (declares an emergency, EMER tag, code 7700, one approach to a full stop), 'fuel' (low fuel, FUEL tag, full stop),
     'nordo' (lost comms: NORDO tag, code 7600, hears you but makes no radio calls or readbacks). Phraseology is generic training wording.
   Traffic entries
     marshal:  { at: s, kind: 'flight' | 'cca' | 'single', rel: bearing off BRC (optional), helo: bool, type: 'F35B'.., ev: 'emer'|'fuel'|'nordo', evDelay: s }
     approach: { at: s, helo, type, ev, evDelay, solo: true = skipped when Approach is linked to a running Marshal (that traffic comes from Marshal) }
   cond: { night, wx (start-screen text), metar (weather line on the scope, e.g. '5NM BKN030'), turns, script: [{ t, dir, deg }] scripted ship turns }
   Goal checks (end card): 'sep0' no separation losses / conflicts · 'priority' event aircraft recovered first · 'nordo' NORDO aircraft recovered
     · 'ship' 99 calls on every ship turn · 'wx99' (Marshal) 99 weather for every marshal aircraft · 'rc' (Approach) radar contact on every aircraft. */
(function () {
  'use strict';
  if (window.SCN) return;
  const J = 'F35B', HELO = true;
  const SCENARIOS = [
    { id: 'basic-day', name: 'Basic day recovery', diff: 'Beginner', mins: 12,
      desc: 'Light daytime traffic with plenty of time between check-ins. Good first session for new trainees.',
      cond: { night: false, wx: 'Clear, 10+ miles', metar: '10NM SKC', turns: false },
      marshal: [{ at: 10, kind: 'flight', rel: 330 }, { at: 240, kind: 'single', helo: HELO }, { at: 420, kind: 'cca' }],
      approach: [{ at: 10 }, { at: 220, helo: HELO }, { at: 430, solo: true }], conflicts: [],
      goal: 'Work every aircraft cleanly with no separation losses.', focus: 'Correct check-in replies, marshal instructions and first altitudes.',
      goals: ['sep0', 'wx99', 'rc'] },
    { id: 'night-steady', name: 'Night recovery, steady traffic', diff: 'Intermediate', mins: 20,
      desc: 'A night Case III recovery with a steady flow of arrivals every few minutes.',
      cond: { night: true, wx: 'Overcast 1,500 ft, 3 miles', metar: '3NM BR OVC015', turns: false },
      marshal: [{ at: 10, kind: 'flight' }, { at: 180, kind: 'single' }, { at: 330, kind: 'flight' }, { at: 540, kind: 'cca' }, { at: 720, kind: 'single', helo: HELO }, { at: 900, kind: 'flight' }],
      approach: [{ at: 10 }, { at: 220, helo: HELO }, { at: 430, solo: true }, { at: 640 }, { at: 850, helo: HELO, solo: true }], conflicts: [500],
      goal: 'Keep the flow moving with no separation losses.', focus: 'Steady spacing, altitudes kept apart, every aircraft worked.',
      goals: ['sep0', 'wx99', 'rc'] },
    { id: 'rush', name: 'Rush: a big wave at once', diff: 'Advanced', mins: 15,
      desc: 'Five check-ins inside about two minutes, then a short lull and one more flight. Sort them out fast.',
      cond: { night: false, wx: 'Scattered 3,000 ft, 7 miles', metar: '7NM SCT030', turns: false },
      marshal: [{ at: 10, kind: 'flight' }, { at: 40, kind: 'flight' }, { at: 75, kind: 'single' }, { at: 105, kind: 'single', helo: HELO }, { at: 135, kind: 'cca' }, { at: 480, kind: 'flight' }],
      approach: [{ at: 10 }, { at: 50 }, { at: 90, helo: HELO }, { at: 130 }, { at: 420, solo: true }], conflicts: [300, 600], gap: 40,
      goal: 'Get everyone sorted with no separation losses.', focus: 'Prioritising, quick clear instructions, altitude separation in the stack.',
      goals: ['sep0', 'wx99', 'rc'] },
    { id: 'emergency', name: 'Emergency aircraft mid-flow', diff: 'Intermediate', mins: 15,
      desc: 'One aircraft declares an emergency while others are already in the pattern. It needs priority handling.',
      cond: { night: false, wx: 'Broken 2,500 ft, 5 miles', metar: '5NM HZ BKN025', turns: false },
      marshal: [{ at: 10, kind: 'flight' }, { at: 150, kind: 'single', helo: HELO }, { at: 240, kind: 'single', type: J, ev: 'emer', evDelay: 90 }, { at: 420, kind: 'cca' }, { at: 540, kind: 'flight' }],
      approach: [{ at: 10 }, { at: 160, helo: HELO }, { at: 300, ev: 'emer', evDelay: 120, solo: true }, { at: 480 }], conflicts: [],
      goal: 'Give the emergency aircraft priority: recover or hand it off before traffic that is farther out.', focus: 'Recognising the emergency, priority handling, keeping others clear.',
      goals: ['priority', 'sep0'] },
    { id: 'low-fuel', name: 'Low-fuel aircraft needing priority', diff: 'Intermediate', mins: 15,
      desc: 'An aircraft reports a low fuel state and needs to come aboard ahead of the others.',
      cond: { night: false, wx: 'Clear, 10+ miles', metar: '10NM SKC', turns: false },
      marshal: [{ at: 10, kind: 'flight' }, { at: 120, kind: 'flight' }, { at: 200, kind: 'single', type: J, ev: 'fuel', evDelay: 0 }, { at: 420, kind: 'single', helo: HELO }],
      approach: [{ at: 10 }, { at: 150, ev: 'fuel', evDelay: 150, solo: true }, { at: 300, helo: HELO }, { at: 480 }], conflicts: [],
      goal: 'Recover the low-fuel aircraft first, before traffic that is farther out.', focus: 'Fuel awareness, re-sequencing, priority handling.',
      goals: ['priority', 'sep0'] },
    { id: 'ship-turns', name: 'Ship turns during the recovery', diff: 'Intermediate', mins: 18,
      desc: 'The ship turns twice during the recovery (about 5:00 and 12:00). Make the 99 calls and adjust to the new BRC.',
      cond: { night: false, wx: 'Scattered 4,000 ft, 7 miles', metar: '7NM SCT040', turns: true, script: [{ t: 300, dir: 'starboard', deg: 15 }, { t: 720, dir: 'port', deg: 10 }] },
      marshal: [{ at: 10, kind: 'flight' }, { at: 200, kind: 'single' }, { at: 420, kind: 'flight' }, { at: 600, kind: 'cca' }, { at: 780, kind: 'single', helo: HELO }],
      approach: [{ at: 10 }, { at: 220, helo: HELO }, { at: 440, solo: true }, { at: 660 }, { at: 880, solo: true }], conflicts: [],
      goal: 'Make both 99 calls on each ship turn and keep everyone separated.', focus: 'Ship-turn calls, new BRC in marshal and pattern instructions.',
      goals: ['ship', 'sep0'] },
    { id: 'nordo', name: 'Lost comms (NORDO) aircraft', diff: 'Advanced', mins: 15,
      desc: 'One aircraft squawks 7600. It can hear you but can\u2019t reply, so you get no check-in call and no readbacks. Watch the scope to see whether it complies.',
      cond: { night: false, wx: 'Broken 3,000 ft, 5 miles', metar: '5NM BKN030', turns: false },
      marshal: [{ at: 10, kind: 'flight' }, { at: 180, kind: 'single', type: J, ev: 'nordo', evDelay: 0 }, { at: 360, kind: 'single', helo: HELO }, { at: 540, kind: 'flight' }],
      approach: [{ at: 10 }, { at: 160, ev: 'nordo', evDelay: 60, solo: true }, { at: 320, helo: HELO }, { at: 500 }], conflicts: [],
      goal: 'Recover the NORDO aircraft safely and keep other traffic clear of it.', focus: 'Spotting 7600, confirming compliance on the scope, protecting the NORDO aircraft.',
      goals: ['nordo', 'sep0'] },
    { id: 'mixed', name: 'Mixed jets and helos', diff: 'Intermediate', mins: 20,
      desc: 'Fast jets and slow helos mixed together. Plan for the speed difference.',
      cond: { night: false, wx: 'Scattered 3,500 ft, 7 miles', metar: '7NM SCT035', turns: false },
      marshal: [{ at: 10, kind: 'single', type: 'CH53E' }, { at: 60, kind: 'flight' }, { at: 240, kind: 'single', type: 'UH1Y' }, { at: 420, kind: 'cca', helo: HELO }, { at: 600, kind: 'flight' }, { at: 780, kind: 'single', type: 'MH60S' }, { at: 900, kind: 'single', type: J }],
      approach: [{ at: 10, helo: HELO }, { at: 180 }, { at: 360, helo: HELO }, { at: 540, solo: true }, { at: 720, helo: HELO }, { at: 900, solo: true }], conflicts: [450],
      goal: 'Sequence jets and helos with no separation losses.', focus: 'Speed control, landing checks / dirty up timing, spacing on final.',
      goals: ['sep0', 'wx99', 'rc'] },
  ];
  SCENARIOS.forEach((s, i) => { s.n = i + 1; });
  const TAG = { emer: 'EMER', fuel: 'FUEL', nordo: 'NORDO' };
  const LIMIT = { emer: 600, fuel: 720 };   // s: priority recovery expected within this time of the call
  const byId = id => SCENARIOS.find(s => s.id === id) || null;
  const PAGE = /marshal/i.test(location.pathname) ? 'MARSHAL' : /approach/i.test(location.pathname) ? 'APPROACH' : /instructor/i.test(location.pathname) ? 'INSTRUCTOR' : 'OTHER';
  const KEY = 'aatccScn.' + PAGE.toLowerCase();
  const rd = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const wr = v => { try { localStorage.setItem(KEY, v || ''); } catch (e) {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const condTxt = s => `${s.cond.night ? 'Night' : 'Day'} · ${s.cond.wx} · ship turns ${s.cond.turns ? (s.cond.script ? 'scripted (' + s.cond.script.map(x => mmss(x.t)).join(', ') + ')' : 'on') : 'off'}`;
  const optTxt = s => `${s.n}. ${s.name} · ${s.diff} · ~${s.mins} min`;
  let forced;   // a linked start's scenario id ('' = free play) for the next start on this page

  /* ---------------- picker (start screen) ---------------- */
  function info(s) {
    if (!s) return '<b>Free play</b>: the level\u2019s normal traffic (about 30 min).';
    return `<div style="margin-bottom:3px">${esc(s.desc)}</div><div><span style="color:var(--dim,#8a9a8a)">Conditions:</span> ${esc(condTxt(s))}</div>`
      + `<div><span style="color:var(--dim,#8a9a8a)">Goal:</span> <b>${esc(s.goal)}</b></div><div><span style="color:var(--dim,#8a9a8a)">Graded on:</span> ${esc(s.focus)}</div>`
      + `<div style="color:var(--dim,#8a9a8a);font-size:11.5px;margin-top:2px">The scenario replaces the level\u2019s traffic; the level still sets hints and how firm the pilots are.</div>`;
  }
  function paint() {
    const sel = document.getElementById('scnSel'); if (!sel) return; const v = rd(); if (sel.value !== v) sel.value = byId(v) ? v : '';
    const box = document.getElementById('scnInfo'); if (box) box.innerHTML = info(byId(sel.value));
  }
  function mountPicker() {
    if (PAGE !== 'MARSHAL' && PAGE !== 'APPROACH') return;
    const diffs = document.querySelector('#startOv .diffs'); if (!diffs || document.getElementById('scnSel')) return;
    const w = document.createElement('div'); w.id = 'scnBox';
    w.style.cssText = 'margin:6px 0 4px;padding:8px 10px;border:1px solid rgba(120,255,140,.25);border-radius:8px;background:rgba(0,0,0,.25)';
    w.innerHTML = `<div class="row" style="gap:8px;align-items:center;margin:0 0 4px"><label for="scnSel" style="color:var(--dim,#8a9a8a)">Scenario</label>`
      + `<select id="scnSel" style="flex:1;min-width:0"><option value="">Free play (level traffic)</option>${SCENARIOS.map(s => `<option value="${s.id}">${esc(optTxt(s))}</option>`).join('')}</select></div>`
      + `<div id="scnInfo" style="font-size:12.5px;line-height:1.4"></div>`;
    diffs.insertAdjacentElement('afterend', w);
    const sel = w.querySelector('select'); sel.addEventListener('change', () => { wr(sel.value); paint(); });
    paint();
  }
  /* ---------------- which scenario the next start uses ---------------- */
  function chosen() { return byId(rd()); }
  function forceNext(id) { if (id == null) return; forced = String(id); wr(byId(forced) ? forced : ''); paint(); }
  function takeStart() { if (forced !== undefined) { const v = forced; forced = undefined; return byId(v); } return chosen(); }
  try { const ch = new BroadcastChannel('stinger-link');
    ch.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'scn-set' && (PAGE === 'MARSHAL' || PAGE === 'APPROACH')) { wr(byId(m.id) ? m.id : ''); paint(); } }); } catch (e) {}

  /* ---------------- runtime ---------------- */
  let A = null, lastPanel = 0;
  function begin(adapter, sc, opts) {   // after newGame: sc = scenario or null
    A = adapter; const G = A.G();
    if (!sc) { A.shipTurns(null); panel(); return null; }
    const linked = !!(opts && opts.linked);
    G.scn = { id: sc.id, name: sc.name, n: sc.n, sc, linked, tracks: [], seen: new Set(), rc: new Set(), left: new Set(), turnIdx: 0, doneSaid: false };
    A.shipTurns(!!sc.cond.turns);
    if (sc.cond.script) G.shipNext = 1e12;   // scripted turns only
    if (A.page === 'MARSHAL') {
      G.sched = sc.marshal.map((e, i) => ({ id: 'S' + (i + 1), at: e.at, kind: e.kind, rel: e.rel, helo: e.helo, type: e.type, ev: e.ev, evDelay: e.evDelay,
        label: `${sc.n}·${i + 1} · ${e.kind === 'flight' ? 'flight of 2 jets' : e.kind === 'cca' ? 'single CCA arrival' : (e.type || (e.helo ? 'helo' : 'jet')) + ' arrival'}${e.ev ? ' · ' + TAG[e.ev] : ''}`,
        loc: e.kind === 'cca' ? '6 NM · 080–100R' : '10 NM' }));
      G.schedN = G.sched.length;
    } else {
      const L = sc.approach.filter(e => !(linked && e.solo));
      G.sched = L.map((e, i) => ({ id: 'L' + (i + 1), at: e.at, kind: 'launch', helo: e.helo, type: e.type, ev: e.ev, evDelay: e.evDelay, last: i === L.length - 1, label: `${sc.n}·${i + 1} · launch${e.ev ? ' · ' + TAG[e.ev] : ''}` }));
      G.schedN = G.sched.length;
      G.confPlan = linked ? [] : (sc.conflicts || []).slice(); G.confLog = []; G.appConfSet = new Set();
      if (sc.gap) G.scnGap = sc.gap;
    }
    A.log('sys', `Scenario ${sc.n}: ${sc.name} (~${sc.mins} min${linked && A.page === 'APPROACH' ? ', linked: most traffic comes from Marshal' : ''}). ${condTxt(sc)}.`);
    A.log('warn', `Goal: ${sc.goal}`);
    panel(true);
    return G.scn;
  }
  function spec(e) {   // a schedule entry -> aircraft spec for the page's spawn functions
    const o = {}; if (e.type || e.helo != null) { const p = A.pickCs(!!(e.helo || (e.type && A.isHeloType(e.type))), e.type); if (p) { o.cs = p.cs; o.type = p.type; } }
    if (e.ev) o.scnEv = { k: e.ev, delay: e.evDelay || 0 };
    return o;
  }
  function pre(a, ev) {   // a new aircraft that carries a scenario event (before its check-in call)
    if (!a || !ev) return; const G = A.G();
    a.scnEv = { k: ev.k, at: G.t + (ev.delay || 0) + (ev.k !== 'nordo' && !ev.delay ? 5 : 0), fired: false };
    if (ev.k === 'emer' || ev.k === 'fuel') A.fullStop(a);
    if (ev.k === 'nordo' && !ev.delay) fire(a, true);
  }
  function carry(a, ev) {   // an aircraft handed over from the linked scope with its event
    if (!a || !ev || !ev.k) return; const G = A.G();
    a.scnEv = { k: ev.k, at: ev.at != null ? +ev.at : G.t, fired: !!ev.fired, t0: ev.t0, carried: true };
    if (ev.k === 'emer' || ev.k === 'fuel') A.fullStop(a);
    if (a.scnEv.fired) { a.scnTag = TAG[ev.k]; if (ev.k === 'emer') a.code = '7700'; if (ev.k === 'nordo') { a.nordo = true; a.code = '7600'; } track(a); }
  }
  const payload = a => a && a.scnEv ? { k: a.scnEv.k, at: a.scnEv.at, fired: !!a.scnEv.fired, t0: a.scnEv.t0 } : undefined;
  const POS = () => A.page === 'MARSHAL' ? 'Marshal' : 'Approach';
  const REASON = { jet: ['hydraulic failure', 'engine vibration', 'smoke in the cockpit'], helo: ['chip light', 'hydraulic failure', 'tail rotor vibration'] };
  function fire(a, silent) {
    const G = A.G(), ev = a.scnEv; if (!ev || ev.fired) return; ev.fired = true; ev.t0 = G.t; a.scnTag = TAG[ev.k];
    const helo = A.isHelo(a), tel = a.tel || a.cs, telSay = a.telSay || tel, fac = A.FAC();
    if (ev.k === 'emer') {
      const rs = REASON[helo ? 'helo' : 'jet'], r = rs[(a.uid || 0) % rs.length]; ev.reason = r; a.code = '7700';
      A.say(a, `${fac} ${POS()}, ${tel}, declaring emergency, ${r}, request priority recovery.`, `${fac} ${POS()}, ${telSay}, declaring emergency, ${r}, request priority recovery.`);
      A.log('warn', `🚨 ${a.cs} declared an emergency (${r}): squawking 7700. Give it priority over the other traffic.`);
    } else if (ev.k === 'fuel') {
      const f = A.lowFuel(a);
      A.say(a, `${fac} ${POS()}, ${tel}, low fuel, state ${f.t}, request priority recovery.`, `${fac} ${POS()}, ${telSay}, low fuel, state ${f.s}, request priority recovery.`);
      A.log('warn', `⛽ ${a.cs} reports low fuel (state ${f.t}). Get it aboard ahead of the others.`);
    } else if (ev.k === 'nordo') {
      a.nordo = true; a.code = '7600';
      A.log('warn', `📻 ${a.cs} is squawking 7600 (lost comms): it hears you but makes no radio calls or readbacks. Watch the scope for its response${silent ? '; click its target to accept it' : ''}.`);
    }
    track(a); try { A.refresh(); } catch (e) {} panel(true);
  }
  function track(a) {   // start the priority / recovery check for an event aircraft on this scope
    const G = A.G(); if (!G.scn || G.scn.tracks.some(t => t.cs === a.cs)) return;
    const r0 = A.rng(a);
    const others = G.ac.filter(o => o !== a && A.alive(o) && o.phase === 'app' && !A.recovered(o) && A.rng(o) > r0 + 0.5).map(o => o.cs);
    G.scn.tracks.push({ cs: a.cs, k: a.scnEv.k, t0: G.t, r0, others, beat: [], done: null, crashed: false, reason: a.scnEv.reason });
  }
  function left(a) { const G = A && A.G(); if (G && G.scn && a) G.scn.left.add(a.cs); }
  let quietT = {};
  function nordoQuiet(a) { const G = A && A.G(); const now = G ? G.t : 0; if (quietT[a.cs] != null && now - quietT[a.cs] < 6) return; quietT[a.cs] = now; try { A.log('sys', `${a.cs}: no reply (NORDO).`); } catch (e) {} }
  function tick() {
    if (!A) return; const G = A.G(); if (!G || !G.scn || G.over) return; const S = G.scn, sc = S.sc;
    for (const a of G.ac) {
      if (a.scnEv && !a.scnEv.fired && G.t >= a.scnEv.at && A.alive(a) && a.phase === 'app' && !A.recovered(a) && A.onFreq(a)) fire(a);
      if (A.alive(a) && a.phase === 'app' && A.onFreq(a)) { S.seen.add(a.cs); if (a.tasks && a.tasks.rc) S.rc.add(a.cs); }
    }
    for (const t of S.tracks) {
      if (t.done != null) continue;
      const a = G.ac.find(x => x.cs === t.cs);
      if (!a || A.recovered(a)) { t.done = G.t; t.crashed = !!(a && a.phase === 'crashed'); t.lost = S.left.has(t.cs) || !!(a && a.leftAir); continue; }
      for (const cs of t.others) if (!t.beat.includes(cs)) { const o = G.ac.find(x => x.cs === cs); if (!o || A.recovered(o)) { if (!(o && (o.phase === 'crashed' || o.leftAir)) && !S.left.has(cs)) t.beat.push(cs); } }
    }
    const scr = sc.cond.script;
    if (scr && S.turnIdx < scr.length) { const T = scr[S.turnIdx];
      if (G.t >= T.t - 5) { if (A.shipTurn(T.dir, T.deg, Math.max(0, T.t - G.t)) || G.t > T.t + 60) S.turnIdx++; } }
    if (!S.doneSaid && G.t > 60) { const pend = (G.sched || []).some(e => !e.done); const busy = G.ac.some(a => A.alive(a) && a.phase === 'app' && !A.recovered(a));
      if (!pend && !busy) { S.doneSaid = true; A.log('good', `Scenario ${sc.n} traffic complete. Press End to see your goal check.`); } }
    if (Date.now() - lastPanel > 1000) panel();
  }
  /* ---------------- goal checks (end card) ---------------- */
  function check(k) {   // -> [label, ok(bool|null), detail] or null (not used on this page)
    const G = A.G(), S = G.scn;
    if (k === 'sep0') { const n = (G.sepLoss || 0) + (G.appConf || 0); return ['No separation losses', n === 0, n === 0 ? 'none' : `${n} separation loss${n === 1 ? '' : 'es'} / conflict${n === 1 ? '' : 's'}`]; }
    if (k === 'wx99') { if (A.page !== 'MARSHAL') return null; const gr = G.mcGraded || []; if (!gr.length) return ['99 weather to every marshal aircraft', null, 'no marshal aircraft']; const n = gr.filter(x => x.mcTasks && x.mcTasks.wx99).length; return ['99 weather to every marshal aircraft', n === gr.length, `${n} of ${gr.length}`]; }
    if (k === 'rc') { if (A.page !== 'APPROACH') return null; const n = S.seen.size, r = [...S.seen].filter(c => S.rc.has(c)).length; if (!n) return ['Radar contact on every aircraft', null, 'no aircraft checked in']; return ['Radar contact on every aircraft', r === n, `${r} of ${n}`]; }
    if (k === 'ship') { const L = G.shipTurns || []; if (!L.length) return ['99 calls on every ship turn', null, 'no ship turn happened (session ended early or turns followed another scope)'];
      const ok = L.filter(r => r.turnCall && r.steadyCall && r.turnCall !== 'missed' && r.steadyCall !== 'missed').length; return ['99 calls on every ship turn', ok === L.length, `${ok} of ${L.length} turn${L.length === 1 ? '' : 's'} with both calls`]; }
    return null;
  }
  function trackRows(kind) {
    const G = A.G(), S = G.scn, out = [];
    for (const t of S.tracks.filter(t => kind === 'nordo' ? t.k === 'nordo' : t.k !== 'nordo')) {
      const lab = `${kind === 'nordo' ? 'NORDO recovered' : 'Priority given'}: ${t.cs} (${TAG[t.k]})`;
      if (t.crashed) { out.push([lab, false, 'crashed']); continue; }
      if (t.lost) { out.push([lab, false, `left the airspace ${mmss(t.done - t.t0)} after the ${t.k === 'nordo' ? '7600 squawk' : 'call'}`]); continue; }
      if (t.done == null) { out.push([lab, false, `still on your scope at the end (${mmss(G.t - t.t0)} after the ${t.k === 'nordo' ? '7600 squawk' : 'call'})`]); continue; }
      const dt = t.done - t.t0, lim = LIMIT[t.k];
      if (kind === 'nordo') { out.push([lab, true, `recovered or handed off ${mmss(dt)} after the 7600 squawk`]); continue; }
      const late = lim && dt > lim, ok = !t.beat.length && !late;
      out.push([lab, ok, `recovered or handed off ${mmss(dt)} after the call${t.others.length ? `, ahead of ${t.others.length - t.beat.length} of ${t.others.length} aircraft that were farther out` : ''}${t.beat.length ? ` (${t.beat.join(', ')} went first)` : ''}${late ? ` · over ${Math.round(lim / 60)} min` : ''}`]);
    }
    if (!out.length) out.push([kind === 'nordo' ? 'NORDO recovered' : 'Priority given', null, `no ${kind === 'nordo' ? 'NORDO' : 'emergency or low-fuel'} aircraft reached this scope`]);
    return out;
  }
  function results() {
    const G = A && A.G(); if (!G || !G.scn) return null; const sc = G.scn.sc, rows = [];
    for (const k of sc.goals) { if (k === 'priority' || k === 'nordo') rows.push(...trackRows(k)); else { const r = check(k); if (r) rows.push(r); } }
    const graded = rows.filter(r => r[1] != null), met = graded.filter(r => r[1]).length;
    return { sc, rows, met, n: graded.length, pass: graded.length > 0 && met === graded.length };
  }
  function endRows() {   // rows for the page's end table
    const R = results(); if (!R) return [];
    return [['Scenario', `${R.sc.n}. ${esc(R.sc.name)}`], [`Scenario goal (${R.met} of ${R.n} met)`, R.pass ? '✓ met' : '✗ not met'],
      ...R.rows.map(r => [`  ${r[1] == null ? '–' : r[1] ? '✓' : '✗'} ${esc(r[0])}`, esc(r[2])])];
  }
  function endCard() {   // goal box under the end-card grade (kept out of #endGrade so the training log reads the grade as before)
    let box = document.getElementById('scnEnd'); const R = results();
    if (!R) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'scnEnd'; const g = document.getElementById('endGrade'); if (!g) return; g.insertAdjacentElement('afterend', box); }
    box.style.cssText = `margin:4px 0 10px;padding:8px 10px;border-radius:8px;border:1px solid ${R.pass ? 'rgba(120,255,140,.55)' : 'rgba(255,190,80,.6)'};background:rgba(0,0,0,.3);font-size:13px;line-height:1.45`;
    box.innerHTML = `<div style="font-weight:bold;margin-bottom:2px">🎯 Scenario ${R.sc.n}: ${esc(R.sc.name)} · ${R.pass ? '<span style="color:#78ff8c">goal met</span>' : `<span style="color:#ffbe50">goal not met</span>`} (${R.met} of ${R.n})</div>`
      + `<div style="color:#bcd">${esc(R.sc.goal)}</div>`
      + R.rows.map(r => `<div>${r[1] == null ? '–' : r[1] ? '<span style="color:#78ff8c">✓</span>' : '<span style="color:#ff6b6b">✗</span>'} ${esc(r[0])}: <span style="color:#9ab">${esc(r[2])}</span></div>`).join('');
  }
  /* ---------------- live panel (side panel, under the hint) ---------------- */
  function panel(force) {
    lastPanel = Date.now(); const G = A && A.G(); let el = document.getElementById('scnLive');
    if (!G || !G.scn) { if (el) el.style.display = 'none'; return; }
    if (!el) { const h = document.getElementById('hint'); if (!h) return; el = document.createElement('div'); el.id = 'scnLive'; el.style.cssText = 'font-size:11.5px;line-height:1.35;color:#cfe;border:1px solid rgba(120,255,140,.3);border-radius:6px;padding:4px 7px;margin:4px 0;background:rgba(0,0,0,.25)'; h.insertAdjacentElement('afterend', el); }
    const S = G.scn, act = S.tracks.filter(t => t.done == null);
    const html = `<b>🎯 Scenario ${S.n}: ${esc(S.name)}</b>${S.sc.cond.night ? ' · NIGHT' : ''}<br><span style="color:#9ab">Goal: ${esc(S.sc.goal)}</span>`
      + act.map(t => `<br><span style="color:${t.k === 'nordo' ? '#ffbe50' : '#ff6b6b'}">${TAG[t.k]} ${esc(t.cs)} · ${mmss(G.t - t.t0)}</span>`).join('');
    el.style.display = ''; if (force || el.innerHTML !== html) el.innerHTML = html;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPicker); else mountPicker();
  window.SCN = { SCENARIOS, byId, TAG, chosen, forceNext, takeStart, mountPicker, paint, begin, spec, pre, carry, payload, fire, tick, left, nordoQuiet, results, endRows, endCard, panel, optTxt, condTxt, get A() { return A; } };
})();
