/* traininglog.js (v117): per-computer training log + controller (user) switcher. No accounts, no server: everything lives in this
   browser's localStorage, so the log is saved on this computer only.
   Loaded by Marshal, Approach, Final (incl. the guided intro, logged as "Final Intro"), Departure and Instructor.
   - "Controller: <name> ▾" picker (drag to move, position kept): add / switch / remove names. Default "Guest". The current
     controller persists ('aatccLog.cur'); switching mid-run ends the running session ("switched") and starts one for the new user.
   - Sessions are detected by polling the page's own sim state (no changes to the sim code): window.__v93.G() on Marshal /
     Approach / Departure, window.__FIN.G on Final, anyRunning() / anyPaused() on the Instructor. A session starts when the sim is
     running and ends on the end screen ("completed"), a reset / new run / page close ("stopped") or a user switch ("switched").
   - Active time counts only wall seconds while the sim is running and NOT paused (pause button, tutorial or settings open); paused and wall time
     are kept too. Saved every 15 s ("open" with a heartbeat) so a crash still keeps the time; stale open sessions are closed on the
     next load. Sessions with under 15 s of active time are discarded.
   Storage: 'aatccLog.users' [names], 'aatccLog.cur' name, 'aatccLog.sessions' [session], 'aatccLog.box' {x, y} picker position. */
(function () {
  'use strict';
  if (window.TrainingLog) return;
  const K = { users: 'aatccLog.users', cur: 'aatccLog.cur', ses: 'aatccLog.sessions', box: 'aatccLog.box' };
  const MIN_ACTIVE = 15, SAVE_EVERY = 15000, STALE_MS = 3 * 60 * 1000, POLL_MS = 1000;
  const rd = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const users = () => { const u = rd(K.users, []); return Array.isArray(u) ? u.filter(x => typeof x === 'string' && x.trim()) : []; };
  const cur = () => { const c = rd(K.cur, 'Guest'); return typeof c === 'string' && c.trim() ? c : 'Guest'; };
  const sessions = () => { const s = rd(K.ses, []); return Array.isArray(s) ? s : []; };
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hms = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  function putSession(s) {   // read-modify-write by id (other tabs may be writing their own sessions)
    const all = sessions().filter(x => x.id !== s.id); if (s) all.push(s); wr(K.ses, all);
  }
  function dropSession(id) { wr(K.ses, sessions().filter(x => x.id !== id)); }
  function closeStale() {   // sessions left "open" by a closed / crashed tab: close them at their last heartbeat
    const now = Date.now(); let ch = false;
    const all = sessions().map(s => { if (s.status === 'open' && now - (s.seen || 0) > STALE_MS) { ch = true; const e = new Date(s.seen || s.t0);
      return Object.assign({}, s, { status: 'closed', ended: 'stopped', note: 'page lost (crash or closed)', end: e.toISOString(), endTime: hms(e) }); } return s; })
      .filter(s => !(s.status === 'closed' && (s.active || 0) < MIN_ACTIVE));
    if (ch) wr(K.ses, all);
  }
  /* ---------------- which page, and its sim state ---------------- */
  const path = (location.pathname.split('/').pop() || '').toLowerCase();
  const PAGE = /departure/.test(path) ? 'Departure' : /approach/.test(path) ? 'Approach' : /marshal/.test(path) ? 'Marshal' : /final/.test(path) ? 'Final' : /instructor/.test(path) ? 'Instructor' : /logsheet/.test(path) ? 'Logsheet' : null;
  function getG() { try { if (window.__v93 && typeof window.__v93.G === 'function') return window.__v93.G(); if (window.__FIN) return window.__FIN.G; } catch (e) {} return null; }
  const visible = id => { const e = document.getElementById(id); return !!(e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'); };
  function gradeFromEnd() {   // end-screen grade text -> { text, pct }
    const e = document.getElementById('endGrade'); const t = e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
    let pct = null, m;
    if ((m = /\b([A-F])\b\s*\((-?\d+)/.exec(t))) pct = +m[2];
    else if ((m = /(\d+)\s*\/\s*(\d+)/.exec(t)) && +m[2] > 0) pct = Math.round(+m[1] / +m[2] * 100);
    else if ((m = /\bgrade\s*([A-F])\b/i.exec(t))) pct = { A: 92, B: 77, C: 62, D: 47, F: 25 }[m[1].toUpperCase()];
    return { text: t.slice(0, 120), pct };
  }
  function state() {   // -> { ok, running, paused, simT, ref, over, end, intro, score, landed, cs[] }
    if (PAGE === 'Instructor') {
      let run = false, pau = false, cs = [];
      try { run = typeof anyRunning === 'function' && !!anyRunning(); pau = typeof anyPaused === 'function' && !!anyPaused(); } catch (e) {}
      try { if (typeof allAc === 'function') cs = allAc().map(a => a.cs); } catch (e) {}
      return { ok: true, running: run, paused: pau, simT: null, ref: 'inst', over: false, end: false, intro: false, cs };
    }
    const G = getG(); if (!G) return { ok: true, running: false };
    const intro = !!(G.intro || (window.FinalIntro && window.FinalIntro.active));
    const userPause = (intro ? document.body.classList.contains('gamePaused') : !!G.paused) || visible('helpOv') || visible('setOv');   // pause button, tutorial or settings open
    return { ok: true, running: !G.over, paused: userPause, simT: +G.t || 0, ref: G, over: !!G.over, end: !!G.over && visible('endOv'), intro,
      score: typeof G.score === 'number' ? G.score : null, landed: typeof G.landed === 'number' ? G.landed : null,
      cs: Array.isArray(G.ac) ? G.ac.filter(a => a && a.cs && !a.holdWave && a.phase !== 'queue').map(a => a.cs) : [] };
  }
  /* ---------------- session tracking ---------------- */
  const TAB = Math.random().toString(36).slice(2, 8);
  let S = null, ref = null, lastWall = 0, lastSimT = null, lastSave = 0;
  function startSession(st) {
    const d = new Date();
    S = { id: 's' + d.getTime().toString(36) + TAB, tab: TAB, user: cur(), sim: PAGE === 'Final' && st.intro ? 'Final Intro' : PAGE, date: ymd(d), start: d.toISOString(), startTime: hms(d),
      end: null, endTime: null, t0: d.getTime(), seen: d.getTime(), active: 0, paused: 0, wall: 0, simTime: 0, score: null, grade: '', gradePct: null, worked: 0, landed: null, ended: null, note: '', status: 'open', cs: [] };
    ref = st.ref; lastWall = Date.now(); lastSimT = st.simT; lastSave = 0; save(true);
  }
  function save(force) {
    if (!S) return; const now = Date.now(); if (!force && now - lastSave < SAVE_EVERY) return;
    lastSave = now; S.seen = now; S.wall = Math.round((now - S.t0) / 1000); S.worked = S.cs.length;
    putSession(Object.assign({}, S, { active: Math.round(S.active), paused: Math.round(S.paused), simTime: Math.round(S.simTime) }));
  }
  function endSession(how, note, st) {
    if (!S) return; tick(st || null, true);
    const d = new Date(); S.end = d.toISOString(); S.endTime = hms(d); S.ended = how; S.note = note || ''; S.status = 'closed';
    if (how === 'completed') { const g = gradeFromEnd(); S.grade = g.text; S.gradePct = g.pct; }
    S.wall = Math.round((d.getTime() - S.t0) / 1000); S.worked = S.cs.length;
    if (S.active < MIN_ACTIVE) dropSession(S.id);
    else putSession(Object.assign({}, S, { active: Math.round(S.active), paused: Math.round(S.paused), simTime: Math.round(S.simTime) }));
    S = null; ref = null; paint();
  }
  function tick(st, noStateChange) {   // accumulate time since the last poll
    if (!S) return; st = st || state(); const now = Date.now(), dt = Math.min(120, Math.max(0, (now - lastWall) / 1000)); lastWall = now;
    const adv = st.simT != null && lastSimT != null ? st.simT - lastSimT : null; if (st.simT != null) lastSimT = st.simT;
    if (st.ref !== ref) return;   // a new run started: the caller closes this session first
    if (adv != null && adv > 0) S.simTime += adv;
    if (st.paused) S.paused += dt; else if (st.running) S.active += dt;
    if (st.score != null) S.score = st.score; if (st.landed != null) S.landed = st.landed;
    for (const c of st.cs || []) if (!S.cs.includes(c)) S.cs.push(c);
  }
  function poll() {
    let st; try { st = state(); } catch (e) { return; }
    if (S && st.ref !== ref) { const old = ref; endSession(old && old.over && !visible('endOv') ? 'stopped' : 'stopped', 'new run / reset', Object.assign({}, st, { ref: old, running: false })); }
    if (S) {
      if (st.over || !st.running) { tick(st); endSession(st.end ? 'completed' : 'stopped', st.end ? 'end screen' : 'reset / ended', st); }
      else { tick(st); save(false); }
    }
    if (!S && st.running && !st.over && PAGE && PAGE !== 'Logsheet') startSession(st);
    paint();
  }
  function onLeave() { if (S) endSession('stopped', 'page closed'); }
  addEventListener('pagehide', onLeave); addEventListener('beforeunload', onLeave);
  /* ---------------- users ---------------- */
  function setUser(name, why) {
    name = String(name || '').trim() || 'Guest'; if (name === cur() && why !== 'force') { paint(); return; }
    const running = S; if (running) endSession('switched', 'switched to ' + name);
    wr(K.cur, name); if (name !== 'Guest' && !users().includes(name)) wr(K.users, users().concat(name));
    paint(); if (running) poll();   // the sim is still running: a new session starts for the new controller
  }
  function addUser(name) { name = String(name || '').trim().slice(0, 40); if (!name) return; if (!users().includes(name) && name !== 'Guest') wr(K.users, users().concat(name)); setUser(name); }
  function removeUser(name) { wr(K.users, users().filter(x => x !== name)); if (cur() === name) setUser('Guest'); paint(); }
  addEventListener('storage', e => {   // another tab switched controller: split this tab's session too
    if (e.key === K.cur) { const running = S; if (running && running.user !== cur()) { endSession('switched', 'switched to ' + cur() + ' (other tab)'); poll(); } paint(); }
    else if (e.key === K.users) paint();
  });
  /* ---------------- picker UI ---------------- */
  const css = `#tlBox{position:fixed;z-index:72;font:11px/1.3 Consolas,Menlo,"DejaVu Sans Mono","Courier New",monospace;color:rgb(190,255,200);user-select:none;-webkit-user-select:none}
  #tlBox .tlB{display:flex;align-items:center;gap:5px;padding:2px 7px;min-height:0;background:rgba(6,12,6,0.94);border:1px solid rgba(120,255,140,0.45);border-radius:5px;color:rgb(190,255,200);font:inherit;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  #tlBox .tlB .g{color:rgba(160,255,175,.65);cursor:move;padding-right:2px;letter-spacing:-1px} #tlBox .tlB b{color:#ffd27a;font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis}
  #tlBox .tlB .rec{width:6px;height:6px;border-radius:50%;background:#3d5a40} #tlBox.on .tlB .rec{background:#ff5a6e;box-shadow:0 0 5px #ff5a6e}
  #tlBox .tlM{display:none;margin-top:3px;min-width:210px;background:rgba(6,12,6,0.98);border:1px solid rgba(120,255,140,0.45);border-radius:6px;padding:5px;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  #tlBox.open .tlM{display:block} #tlBox .tlU{display:flex;align-items:center;gap:6px;padding:3px 5px;border-radius:4px;cursor:pointer} #tlBox .tlU:hover{background:rgba(120,255,140,.1)}
  #tlBox .tlU.me{color:#ffd27a} #tlBox .tlU span{flex:1} #tlBox .tlX{background:none;border:0;color:rgba(160,255,175,.6);cursor:pointer;font:inherit;padding:0 3px;min-height:0} #tlBox .tlX:hover{color:#ff5a6e}
  #tlBox .tlA{display:flex;gap:4px;margin-top:4px} #tlBox .tlA input{flex:1;min-width:0;background:#030503;border:1px solid rgba(120,255,140,.5);color:rgb(190,255,200);font:inherit;padding:2px 4px;border-radius:3px}
  #tlBox .tlA button,#tlBox .tlL{background:#0f1a10;border:1px solid rgba(120,255,140,.55);color:rgb(190,255,200);font:inherit;padding:2px 7px;border-radius:3px;cursor:pointer;min-height:0}
  #tlBox .tlL{display:block;text-align:center;margin-top:5px;text-decoration:none} #tlBox .tlS{color:rgba(160,255,175,.6);font-size:10px;padding:3px 5px 0}`;
  let box = null;
  const pos = rd(K.box, null) || {};
  function place() {
    if (!box) return; const W = innerWidth, H = innerHeight, w = box.offsetWidth || 150;
    let x = pos.x, y = pos.y;
    if (x == null) { x = PAGE === 'Instructor' ? W - w - 10 : Math.round(W * 0.36); y = PAGE === 'Instructor' ? 40 : 1; }
    x = Math.max(0, Math.min(W - Math.min(w, 60), x)); y = Math.max(0, Math.min(H - 20, y));
    box.style.left = x + 'px'; box.style.top = y + 'px';
    const m = box.querySelector('.tlM'); if (m) { m.style.position = 'absolute'; const up = y > H / 2; m.style.top = up ? '' : '100%'; m.style.bottom = up ? '100%' : ''; m.style.right = x > W / 2 ? '0' : ''; m.style.left = x > W / 2 ? '' : '0'; }
  }
  const status = () => `${S ? `● logging ${esc(S.sim)} for ${esc(S.user)} · ${Math.round(S.active)} s active` : 'Not logging (starts when the sim runs).'} Saved on this computer only.`;
  function paint() {
    if (!box) return; const me = cur(), list = ['Guest'].concat(users().filter(x => x !== 'Guest'));
    box.classList.toggle('on', !!S);
    box.querySelector('.tlB b').textContent = me;
    box.querySelector('.tlB').title = S ? `Logging this session for ${me} (${S.sim})` : `Controller for the training log: ${me}`;
    const m = box.querySelector('.tlM'); if (!box.classList.contains('open')) { m.dataset.k = ''; return; }
    const st = m.querySelector('.tlS'), k = JSON.stringify([me, list]);
    if (st && m.dataset.k === k) { st.innerHTML = status(); return; }   // menu already built: refresh only the status line (keeps any typed name)
    m.dataset.k = k;
    m.innerHTML = list.map(u => `<div class="tlU${u === me ? ' me' : ''}" data-u="${esc(u)}"><span>${u === me ? '● ' : ''}${esc(u)}</span>${u === 'Guest' ? '' : `<button type="button" class="tlX" data-rm="${esc(u)}" title="Remove ${esc(u)}">✕</button>`}</div>`).join('')
      + `<div class="tlA"><input id="tlIn" maxlength="40" placeholder="Add controller name"><button type="button" id="tlAdd">Add</button></div>`
      + `<div class="tlS">${status()}</div>`
      + `<a class="tlL" href="logsheet.html" target="_blank" rel="opener">Log Sheet ↗</a>`;
  }
  function init() {
    if (!PAGE || PAGE === 'Logsheet' || document.getElementById('tlBox')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    box = document.createElement('div'); box.id = 'tlBox'; box.setAttribute('aria-label', 'Training log controller');
    box.innerHTML = `<button type="button" class="tlB"><span class="g" title="Drag to move">⋮⋮</span><span class="rec"></span>Controller: <b></b> ▾</button><div class="tlM"></div>`;
    ['keydown', 'keyup', 'keypress'].forEach(t => box.addEventListener(t, e => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Enter' && e.target.id === 'tlIn') { e.preventDefault(); addUser(e.target.value); } if (t === 'keydown' && e.key === 'Escape') { box.classList.remove('open'); } }));
    ['mousedown', 'touchstart', 'wheel'].forEach(t => box.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    let drag = null;
    box.addEventListener('pointerdown', e => { e.stopPropagation(); if (!e.target.closest('.g')) return; const r = box.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId }; try { box.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); });
    box.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; pos.x = Math.round(e.clientX - drag.dx); pos.y = Math.round(e.clientY - drag.dy); place(); });
    const end = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; wr(K.box, pos); };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target.closest('.g')) return;
      const rm = e.target.closest('[data-rm]'); if (rm) { const n = rm.dataset.rm; if (confirm(`Remove "${n}" from the controller list? (Their logged sessions stay on the Log Sheet.)`)) removeUser(n); return; }
      const u = e.target.closest('[data-u]'); if (u) { setUser(u.dataset.u); box.classList.remove('open'); paint(); return; }
      if (e.target.id === 'tlAdd') { addUser(box.querySelector('#tlIn').value); box.classList.remove('open'); paint(); return; }
      if (e.target.closest('.tlB')) { box.classList.toggle('open'); paint(); place(); const i = box.querySelector('#tlIn'); if (i && box.classList.contains('open')) i.focus({ preventScroll: true }); }
    });
    document.addEventListener('click', e => { if (box && !box.contains(e.target)) box.classList.remove('open'); });
    document.body.appendChild(box); paint(); place(); addEventListener('resize', place);
  }
  closeStale();
  if (PAGE && PAGE !== 'Logsheet') setInterval(poll, POLL_MS);   // BgClock (bg-clock.js) keeps the sims running in background tabs; the 120 s dt cap covers throttling
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TrainingLog = { K, users, cur, sessions, setUser, addUser, removeUser, closeStale, get session() { return S; }, poll, PAGE, MIN_ACTIVE,
    del(id) { dropSession(id); }, clear() { wr(K.ses, []); } };
})();
