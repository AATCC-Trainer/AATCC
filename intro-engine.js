/* AATCC shared guided-intro engine (v106; v109: Next cue, talking state). The mentor panel from intro.html (Aero's voice, section bar, step card,
   choices, feedback, Back / Repeat / Next, saved progress) as a reusable component, so a real controller page can run a
   guided mode. The host page supplies the steps and does the sim work in onEnter / onLeave; call steps are checked by
   the host, which reports back with api.succeed() / api.fail(). No dependencies; plain DOM + speechSynthesis. */
(function () {
'use strict';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CSS = `
.ie{border:1px solid var(--gd,#4f8a5a);border-radius:6px;background:#0a1a0d;color:#d8ffde;display:flex;flex-direction:column;gap:8px;padding:9px;font-size:13px}
.ie .who{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dim,#7d9a80)}
.ie .av{width:30px;height:30px;flex:none;border-radius:50%;border:2px solid var(--amber,#ffbf3c);display:flex;align-items:center;justify-content:center;color:var(--amber,#ffbf3c);font-weight:bold;background:radial-gradient(circle at 50% 40%,#2a2410,#0a1a0d);transition:box-shadow .2s}
.ie.talking .av{animation:ieTalk .9s ease-in-out infinite}
@keyframes ieTalk{0%,100%{box-shadow:0 0 0 0 rgba(255,191,60,0)}50%{box-shadow:0 0 0 5px rgba(255,191,60,.28)}}
.ie .who b{color:var(--amber,#ffbf3c);letter-spacing:1px}
.ie .bars{display:none;gap:2px;align-items:flex-end;height:12px}
.ie.talking .bars{display:inline-flex}
.ie .bars i{width:3px;background:var(--amber,#ffbf3c);border-radius:1px;animation:ieBar .6s ease-in-out infinite}
.ie .bars i:nth-child(2){animation-delay:.15s}.ie .bars i:nth-child(3){animation-delay:.3s}
@keyframes ieBar{0%,100%{height:3px}50%{height:12px}}
.ie .sec{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ie .who button{min-height:26px;padding:2px 7px;font-size:11px}
.ie .prog{display:flex;gap:3px;align-items:stretch}
.ie .prog .seg{flex:1;min-width:0;height:26px;border:1px solid var(--gdd,#1f3524);border-radius:4px;position:relative;overflow:hidden;font-size:11px;color:var(--dim,#7d9a80);display:flex;align-items:center;justify-content:center;cursor:default}
.ie .prog .seg i{position:absolute;left:0;top:0;bottom:0;background:#123a1b;width:0;transition:width .3s}
.ie .prog .seg span{position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px}
.ie .prog .seg .no{opacity:.7;margin-right:2px}
.ie .prog .seg.cur{border:2px solid #9dffad;color:#eaffee;font-weight:bold;box-shadow:0 0 10px rgba(120,255,140,.35)}.ie .prog .seg.cur i{background:#1d6a2c}
.ie .prog .seg.done{color:var(--ok,#6dff8a);border-color:#2f7a3c}.ie .prog .seg.done i{background:#123a1b}
.ie .secNow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dim,#7d9a80)}
.ie .secNow .snName{font-size:14px;letter-spacing:2px;color:#d8ffde;font-weight:bold}.ie .secNow .snStep{margin-left:auto;color:var(--amber,#ffbf3c)}
.ie .bPause.on{border-color:#ffbf3c;color:#ffbf3c;background:#2a2410}
.ie.paused .say{opacity:.75}
.ie .say{font-size:14px;line-height:1.45;color:#d8ffde}
.ie .say p{margin:0 0 7px}.ie .say p:last-child{margin:0}
.ie .say .k,.ie .k{color:var(--amber,#ffbf3c)}
.ie .ex{display:block;margin:6px 0;padding:6px 8px;border-left:3px solid var(--g,#c8f5cd);background:#0c2211;color:#eaffee}
.ie .task{border:1px dashed var(--amber,#ffbf3c);border-radius:6px;padding:7px 9px;color:var(--amber,#ffbf3c);font-size:14px;line-height:1.4}
.ie .task b{color:#ffe1a0}
.ie .task .ex{color:#eaffee}
.ie .opts{display:flex;flex-direction:column;gap:6px}
.ie .opts button{text-align:left;line-height:1.35;padding:8px 10px}
.ie .opts button .n{color:var(--dim,#7d9a80);margin-right:6px}
.ie .opts button.right{border-color:#6dff8a;color:#6dff8a;background:#0f2c15}.ie .opts button.wrong{border-color:#ff6b6b;color:#ff6b6b}
.ie .fb{font-size:13px;line-height:1.45;border-radius:6px}
.ie .fb:not(:empty){padding:7px 9px;border:1px solid}
.ie .fb.ok{border-color:#6dff8a;color:#c9ffd3;background:#0c2611}.ie .fb.bad{border-color:#ff6b6b;color:#ffd0d0;background:#2a0c0c}.ie .fb.info{border-color:var(--gd,#4f8a5a);color:var(--g,#c8f5cd)}
.ie .nav{display:flex;align-items:center;gap:6px}
.ie .nav .no{flex:1;text-align:center;font-size:11px;color:var(--dim,#7d9a80)}
.ie .nav .next{background:#123f1a;border-color:var(--g,#c8f5cd);color:#d8ffde;font-weight:bold;min-width:90px}
.ie .nav .next:disabled{opacity:.45;cursor:default}
.ie .nav .next.pulse{animation:iePulse 1.2s infinite}@keyframes iePulse{50%{box-shadow:0 0 0 4px rgba(120,255,140,.25)}}
.ie .cue{display:none;font-size:13px;color:#9dffad;text-align:right;padding:2px 2px 0}
.ie .cue.on{display:block;animation:ieCue 1.4s ease-in-out infinite}
@keyframes ieCue{50%{color:#d8ffde}}
.ie .small{background:none;border:none;color:var(--dim,#7d9a80);text-decoration:underline;cursor:pointer;font-size:12px;padding:0 2px;min-height:0}
.ie .small:hover{color:var(--cyan,#8dff7a);background:none}
.ie .done{display:flex;flex-direction:column;gap:6px}
.ie .done button{min-height:40px;text-align:left;padding:8px 10px}
.ie .done button b{display:block;color:var(--cyan,#8dff7a)}
.ie .done button span{font-size:12px;color:#a8d8ae}
`;
function injectCSS() { if (document.getElementById('ieCSS')) return; const st = document.createElement('style'); st.id = 'ieCSS'; st.textContent = CSS; document.head.appendChild(st); }

/* ---------- Aero voice (same ranking as intro.html: warm, steady male guide; never novelty voices) ---------- */
const TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const LS_VOICE = 'aatccIntroVoice', LS_MUTE = 'aatccIntroMute';
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|wobble|zarvox|trinoids|whisper|jester|organ|superstar|good news|hysterical|deranged|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|ralph|junior|kathy|princess|vicki|victoria|agnes|bruce)\b/i;
const MALE = /\b(evan|nathan|aaron|alex|tom|fred|daniel|arthur|oliver|guy|andrew|brian|christopher|eric|roger|steffan|ryan|davis|tony|jason|william|liam|thomas|james|david|mark|george|noah|male)\b/i;
const QUALITY = /enhanced|premium|natural|neural|online/i;
function voiceScore(v) {
  const n = v.name, us = /en[-_]US/i.test(v.lang);
  if (NOVELTY.test(n) || /female/i.test(n)) return /female/i.test(n) ? 1 : -100;
  let s = 0;
  if (/^evan\b/i.test(n)) s = 100; else if (/^nathan\b/i.test(n)) s = 96;
  else if (/microsoft (andrew|brian|guy|christopher).*(online|natural)/i.test(n)) s = 98;
  else if (/google uk english male/i.test(n)) s = 90;
  else if (/^aaron\b/i.test(n)) s = 80; else if (/^alex\b/i.test(n)) s = 78; else if (/^tom\b/i.test(n)) s = 62;
  else if (/microsoft .*(online|natural)/i.test(n) && MALE.test(n)) s = 85;
  else if (/^fred\b/i.test(n)) s = 12;
  else if (MALE.test(n)) s = 50;
  else s = us ? 6 : 3;
  if (QUALITY.test(n)) s += 10;
  if (us) s += 2;
  return s;
}
let aeroV = null;
function loadVoices() {
  if (!TTS) return;
  let vs = []; try { vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch (e) {}
  const ranked = vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
  let want = null; try { want = localStorage.getItem(LS_VOICE); } catch (e) {}
  aeroV = (want && vs.find(v => v.voiceURI === want || v.name === want)) || ranked[0] || null;
}
if (TTS) { loadVoices(); try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) {} setTimeout(loadVoices, 800); setTimeout(loadVoices, 2500); }

const DIGW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const sayDigits = s => String(s).split('').map(c => /\d/.test(c) ? DIGW[+c] : c).join(' ');
const plain = h => String(h).replace(/<span class="ui">[\s\S]*?<\/span>/g, ' ').replace(/<br\s*\/?>/gi, '. ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ')
  .replace(/\p{Extended_Pictographic}|\uFE0F/gu, ' ').replace(/[▸◂↺·•★✓✗⌨]/g, ' ').replace(/\s+/g, ' ').trim();
function forSpeech(t, fix) {
  let s = (' ' + t + ' ')
    .replace(/\((?:[^()]*\b(?:tap|press|click|Enter|Space bar|button)\b[^()]*)\)/gi, ' ')
    .replace(/×/g, ' times ').replace(/°/g, ' degree').replace(/\s*[←→]\s*/g, ', ').replace(/\s=\s/g, ' equals ').replace(/\b(\w+)\s?\/\s?(\w+)\b/g, (m, a, b) => /\d/.test(m) ? m : a + ' or ' + b).replace(/_{2,}/g, 'blank')
    .replace(/\b(heading|bearing|course|BRC)\s+(\d{3})\b/gi, (m, w, d) => w + ' ' + sayDigits(d));
  if (fix) try { s = fix(s); } catch (e) {}
  return s.replace(/\bUSS\b/g, 'U S S').replace(/\bPAR\b/g, 'P A R').replace(/\bASR\b/g, 'A S R').replace(/\bBRC\b/g, 'B R C').replace(/\bMDA\b/g, 'M D A').replace(/\bNM\b/g, 'miles').replace(/(\d)\s*ft\b/g, '$1 feet')
    .replace(/\bAero\b/g, 'Airo').replace(/"/g, '').replace(/\s+([,.!?:;])/g, '$1').replace(/([.!?,])\1+/g, '$1').replace(/\s+/g, ' ').trim();
}
function chunks(html, fix) {
  const paras = String(html).split(/<\/p>|<p>|\n\n/).map(plain).map(t => forSpeech(t, fix)).filter(s => /[a-z0-9]/i.test(s));
  const out = [];
  paras.forEach((p, pi) => { const ss = p.match(/[^.!?]+[.!?]*["')]?/g) || [p]; ss.map(s => s.trim()).filter(s => /[a-z0-9]/i.test(s)).forEach((s, si, arr) => out.push({ t: s, gap: si === arr.length - 1 && pi < paras.length - 1 ? 200 : 70 }) /* v123: shorter pauses (were 170 / 420 ms) */); });
  return out;
}

function create(cfg) {
  injectCSS();
  const steps = cfg.steps, secs = cfg.sections || [];
  const root = document.createElement('div'); root.className = 'ie'; root.id = cfg.id || 'aeroBox';
  root.innerHTML = `<div class="who"><span class="av">A</span><b>AERO</b><span class="bars"><i></i><i></i><i></i></span><span class="sec"></span>
      <button type="button" class="bPause" title="Pause Aero and the scope (P)">❚❚ Pause</button><button type="button" class="bMute"></button><button type="button" class="bExit">${esc(cfg.exitLabel || 'Exit to training')}</button></div>
    <div class="prog"></div><div class="secNow"><span class="snLbl"></span><span class="snName"></span><span class="snStep"></span></div><div class="say"></div><div class="tk"></div><div class="fb"></div><div class="cue"></div>
    <div class="nav"><button type="button" class="bBack">Back</button><button type="button" class="bRep">Repeat</button><span class="no"></span><button type="button" class="next">Next</button></div>`;
  (cfg.mount || document.body).prepend(root);
  const q = c => root.querySelector(c);
  const elSay = q('.say'), elTk = q('.tk'), elFb = q('.fb'), elNext = q('.next'), elNo = q('.no'), elSec = q('.sec'), elProg = q('.prog'), bMute = q('.bMute'), elCue = q('.cue');
  let muted = false; try { muted = localStorage.getItem(LS_MUTE) === '1'; } catch (e) {}
  let idx = -1, res = {}, fails = 0, cleanup = null, solved = false, dead = false;

  /* ----- speech queue ----- */
  let sq = [], busy = false, gen = 0, lastCancel = -1e9, curC = null;
  const setTalking = on => root.classList.toggle('talking', !!on);
  function nextChunk() {
    if (dead || !sq.length) { busy = false; setTalking(false); return; }
    busy = true; const g = gen;
    if (cfg.canSpeak && !cfg.canSpeak() && (sq[0].waited = (sq[0].waited || 0) + 1) < 60) { setTimeout(() => { if (g === gen) nextChunk(); }, 200); return; }   // the page's own pilot voice goes first
    const c = sq.shift(); curC = c; let once = false;
    const done = () => { if (once || g !== gen) return; once = true; clearTimeout(wd); curC = null; if (!sq.length) setTalking(false); setTimeout(() => { if (g === gen) nextChunk(); }, c.gap); };
    const wd = setTimeout(done, 2500 + c.t.split(' ').length * 650);
    try {
      const u = new SpeechSynthesisUtterance(c.t); u.lang = 'en-US'; if (aeroV) u.voice = aeroV; u.rate = cfg.rate || 1; u.pitch = 0.97; u.volume = 1;
      u.onstart = () => { if (g === gen) setTalking(true); }; u.onend = done; u.onerror = done;
      try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) {}
      speechSynthesis.speak(u);
      if (window.__introSpeak) try { window.__introSpeak('aero', c.t); } catch (e) {}
    } catch (e) { done(); }
  }
  function speak(html) {
    if (!TTS || muted || !html || dead) return;
    if (paused) { pq.push(...chunks(html, cfg.speechFix)); return; }   // v122: held until Resume
    sq.push(...chunks(html, cfg.speechFix));
    if (busy) return; busy = true; const g = gen, wait = Math.max(0, 150 - (performance.now() - lastCancel));
    setTimeout(() => { if (g === gen) nextChunk(); }, wait);
  }
  function yieldVoice() {   // stop talking now and repeat the interrupted sentence later (the host's own radio speaks first)
    if (!busy && !sq.length) return;
    const rest = (curC ? [curC] : []).concat(sq); hush(); sq = rest.map(c => Object.assign({}, c, { waited: 0 }));
    if (sq.length) { busy = true; const g = gen; setTimeout(() => { if (g === gen) nextChunk(); }, 400); }
  }
  function hush() {
    pq = [];
    const had = busy || sq.length; gen++; sq = []; busy = false; setTalking(false); curC = null;
    if (had && TTS) try { speechSynthesis.cancel(); lastCancel = performance.now(); } catch (e) {}
  }
  /* v122: Pause stops Aero mid-sentence (the sentence is replayed from its start on Resume) and tells the host to hold the scope */
  let paused = false, pq = [];
  const bPause = q('.bPause');
  function setPause(on, quiet) {
    on = !!on; if (on === paused) return; 
    if (on) { const rest = (curC ? [curC] : []).concat(sq); hush(); pq = rest.map(c => Object.assign({}, c, { waited: 0 })); paused = true; }
    else { paused = false; const rest = pq; pq = []; if (rest.length && !quiet && !muted) { sq = rest; busy = true; const g = gen; setTimeout(() => { if (g === gen) nextChunk(); }, 150); } }
    root.classList.toggle('paused', paused); bPause.classList.toggle('on', paused); bPause.textContent = paused ? '▶ Resume' : '❚❚ Pause'; bPause.title = paused ? 'Resume Aero and the scope (P)' : 'Pause Aero and the scope (P)';
    if (cfg.onPause) try { cfg.onPause(paused, api); } catch (e) { console.error(e); }
  }
  bPause.onclick = () => setPause(!paused);
  const onKey = e => { if (dead || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; const t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return; if (e.key === 'p' || e.key === 'P') { e.preventDefault(); setPause(!paused); } };
  document.addEventListener('keydown', onKey);
  function setMute(m) { muted = !!m; try { localStorage.setItem(LS_MUTE, m ? '1' : '0'); } catch (e) {} bMute.textContent = m ? 'Unmute' : 'Mute'; bMute.title = m ? 'Unmute Aero' : 'Mute Aero'; if (m) hush(); }
  setMute(muted);
  bMute.onclick = () => setMute(!muted);

  /* ----- progress ----- */
  const save = () => { if (!cfg.storeKey) return; try { localStorage.setItem(cfg.storeKey, JSON.stringify({ i: idx, res, t: Date.now() })); } catch (e) {} };
  const val = (v, st) => typeof v === 'function' ? v(st, api) : v;
  function drawProg() {
    elProg.innerHTML = '';
    // v122: same strip as intro.html: one labelled box per section, filled by position (steps behind you are done), full + green when finished
    const st = steps[idx], allDone = st && st.type === 'done';
    secs.forEach((sc, si) => {
      const ids = steps.map((s, j) => s.sec === sc.id && s.type !== 'done' ? j : -1).filter(j => j >= 0), n = ids.length || 1;
      const d = allDone ? n : ids.filter(j => j < idx || (j === idx && solved)).length;
      const seg = document.createElement('div'); seg.className = 'seg' + (st && st.sec === sc.id && !allDone ? ' cur' : '') + (d >= n ? ' done' : ''); seg.title = sc.name;
      seg.innerHTML = `<i style="width:${d >= n ? 100 : Math.round(100 * d / n)}%"></i><span><span class="no">${si + 1}</span>${esc(sc.short || sc.name)}</span>`; elProg.appendChild(seg);
    });
    const sc = st && secs.find(x => x.id === st.sec), si = sc ? secs.indexOf(sc) : -1;
    elSec.textContent = '';
    const mineS = sc ? steps.filter(s => s.sec === sc.id && s.type !== 'done') : [];
    q('.snLbl').textContent = allDone ? 'ALL SECTIONS DONE' : sc && secs.length > 1 ? `SECTION ${si + 1} OF ${secs.length}` : '';
    q('.snName').textContent = allDone ? 'COMPLETE' : sc ? sc.name.toUpperCase() : '';
    q('.snStep').textContent = !allDone && mineS.length > 1 && mineS.indexOf(st) >= 0 ? `Step ${mineS.indexOf(st) + 1} of ${mineS.length} in this section` : '';
    const real = steps.filter(s => s.type !== 'done'), k = real.indexOf(st);
    elNo.textContent = k >= 0 ? `Step ${k + 1} of ${real.length}` : '';
  }
  /* v109: when Next is ready, Aero says so (spoken once, and shown above the Next button) */
  const cueHtml = () => cfg.nextCue ? val(cfg.nextCue, steps[idx]) : '';
  function setNext(on, label) { elNext.disabled = !on; elNext.classList.toggle('pulse', !!on); if (label) elNext.textContent = label;
    const st = steps[idx], c = on && st && st.type !== 'done' && idx < steps.length - 1 ? cueHtml() : '';
    elCue.innerHTML = c ? '▶ ' + c : ''; elCue.classList.toggle('on', !!c); }
  function feedback(cls, html, say) { elFb.className = 'fb ' + (cls || ''); elFb.innerHTML = html || ''; if (say && html) speak(html); }
  function succeed(html, opt) {
    const st = steps[idx]; if (!st || solved) return; solved = true;
    res[st.id] = fails ? 'retry' : 'ok'; save(); drawProg();
    const g = html != null ? html : val(st.good, st);
    setNext(true);
    const cue = elCue.classList.contains('on') && !(opt && opt.auto) ? `<p>${cueHtml()}</p>` : '';
    if (g) feedback('ok', g);
    if (!(opt && opt.silent) && (g || cue)) speak((g || '') + cue);
    if (opt && opt.auto) setTimeout(() => { if (steps[idx] === st) next(); }, opt.auto);
  }
  function fail(html) { fails++; feedback('bad', html); speak(html); const st = steps[idx]; if (fails >= 2 && st) showHint(); }
  const hintOf = st => { try { return cfg.hint ? cfg.hint(st, api) : val(st.hint, st); } catch (e) { return ''; } };
  const taskOf = st => { try { return cfg.task ? cfg.task(st, api) : val(st.task, st); } catch (e) { return ''; } };   // v122: a task that reads the scene may run before the step has built it
  function showHint() { const st = steps[idx]; const h = q('.hintBox'); const t = st && hintOf(st); if (h && t) { h.innerHTML = `Say: <span class="ex">${t}</span>`; h.style.display = ''; } }
  function renderTask(html) { const t = q('.tkTask'); if (t) { t.innerHTML = html; t.style.display = html ? '' : 'none'; } }

  function show(i, opts) {
    if (dead) return;
    i = Math.max(0, Math.min(steps.length - 1, i | 0));
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    if (steps[idx] && cfg.onLeave) try { cfg.onLeave(steps[idx], api); } catch (e) { console.error(e); }
    if (paused) setPause(false, true);
    hush(); idx = i; fails = 0; solved = false; save();
    const st = steps[i];
    elSay.innerHTML = val(st.say, st) || ''; elTk.innerHTML = ''; feedback('', '');
    q('.bBack').disabled = i === 0;
    setNext(st.type === 'info', st.type === 'done' ? 'Next' : 'Next');
    elNext.style.display = st.type === 'done' ? 'none' : '';
    if (st.type === 'choice') {
      const qq = val(st.q, st), opts2 = val(st.opts, st) || [];
      elTk.innerHTML = `<div class="task">${qq}</div><div class="opts" style="margin-top:6px"></div>`;
      const box = elTk.querySelector('.opts');
      opts2.forEach((o, k) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span class="n">${k + 1}</span>${esc(o.t)}`;
        b.onclick = () => { if (solved) return; if (o.ok) { b.classList.add('right'); box.querySelectorAll('button').forEach(x => x.disabled = true); succeed(`${o.why ? o.why + ' ' : ''}${val(st.good, st) || ''}`.trim() || 'Correct.'); }
          else { b.classList.add('wrong'); b.disabled = true; fail(o.why || 'Not quite. Try again.'); } };
        box.appendChild(b); });
    } else if (st.type === 'call' || st.type === 'watch') {
      const tk = taskOf(st);
      elTk.innerHTML = `<div class="task tkTask"${tk ? '' : ' style="display:none"'}>${tk || ''}</div>` + (st.type === 'call' || st.skip ? `<div class="hintBox task" style="display:none;margin-top:6px;border-style:solid"></div>
        <div style="margin-top:4px;display:flex;gap:10px">${st.type === 'call' ? '<button type="button" class="small bHint">Show me the call</button>' : ''}<button type="button" class="small bSkip">${st.type === 'call' ? 'Skip this call' : 'Skip this step'}</button></div>` : '');
      const bh = elTk.querySelector('.bHint'); if (bh) bh.onclick = () => { showHint(); };
      const bs = elTk.querySelector('.bSkip'); if (bs) bs.onclick = () => { if (solved) return; if (cfg.onSkip) try { cfg.onSkip(st, api); } catch (e) {} solved = true; res[st.id] = res[st.id] || 'skip'; save(); drawProg(); feedback('info', 'Skipped. You can come back with Back.'); setNext(true); };
    } else if (st.type === 'done') {
      elTk.innerHTML = '<div class="done"></div>';
      res[st.id] = 'ok'; save();
      if (cfg.renderDone) cfg.renderDone(st, elTk.querySelector('.done'), api);
    }
    drawProg();
    if (cfg.onEnter) try { cleanup = cfg.onEnter(st, api) || null; } catch (e) { console.error(e); }
    if (st.type === 'call' || st.type === 'watch') { const tt = q('.tkTask'), tk = taskOf(st); if (tt) { tt.innerHTML = tk || ''; tt.style.display = tk ? '' : 'none'; } }   // v122: the task reads the scene the step just built (e.g. "slightly above glidepath")
    if (!(opts && opts.silent)) {
      let narr = elSay.innerHTML;
      if (st.type === 'choice') narr += `<p>${val(st.q, st)}</p>`; else if ((st.type === 'call' || st.type === 'watch') && taskOf(st) && st.sayTask !== false && !st.wait) narr += `<p>${taskOf(st)}</p>`;
      if (st.type === 'info' && cueHtml()) narr += `<p>${cueHtml()}</p>`;
      speak(narr);
    }
  }
  function next() { if (idx < steps.length - 1) show(idx + 1); }
  elNext.onclick = () => { if (!elNext.disabled) next(); };
  q('.bBack').onclick = () => { if (idx > 0) show(idx - 1); };
  q('.bRep').onclick = () => { hush(); const st = steps[idx]; let n = elSay.innerHTML; if (st.type === 'choice') n += `<p>${val(st.q, st)}</p>`; else if (taskOf(st)) n += `<p>${taskOf(st)}</p>`; if (elCue.classList.contains('on')) n += `<p>${cueHtml()}</p>`; speak(n); };
  q('.bExit').onclick = () => { if (cfg.onExit) cfg.onExit(api); };

  function load() { if (!cfg.storeKey) return null; try { return JSON.parse(localStorage.getItem(cfg.storeKey) || 'null'); } catch (e) { return null; } }
  function destroy() { document.removeEventListener('keydown', onKey); if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; } if (steps[idx] && cfg.onLeave) try { cfg.onLeave(steps[idx], api); } catch (e) {} hush(); dead = true; root.remove(); }
  const api = { root, show, next, succeed, fail, feedback, speak, hush, yieldVoice, setNext, renderTask, showHint, destroy, load, setMute, setPause, get paused() { return paused; },
    get idx() { return idx; }, get talking() { return busy || sq.length > 0; }, get step() { return steps[idx]; }, get solved() { return solved; }, get fails() { return fails; }, get res() { return res; }, steps };
  const saved = load();
  if (saved && saved.res) res = saved.res;
  return api;
}
window.IntroEngine = { create, voiceScore, forSpeech, plain, chunks, sayDigits, get voice() { return aeroV; } };
})();
