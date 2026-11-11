/* AATCC warm push-to-talk microphone (v90). Shared by Intro, Marshal, Approach and Final.
   Problem: each PTT press used to create a new SpeechRecognition and call start(), so the first ~0.3-1 s of speech
   was lost while the recognizer spun up. Fix (desktop Chrome / Edge only): after the first press, keep ONE continuous
   recognizer running in the background ("warm"), and gate its results by the PTT state. A press attaches to the warm
   recognizer instantly and only sees results that start at (or just before) the press; release calls stop() so the
   words are flushed as final, then a fresh warm recognizer starts right away for the next transmission.
   WarmMic.create(SR) returns an object with the same surface the pages use (lang, continuous, interimResults,
   maxAlternatives, onresult/onerror/onend, start/stop/abort, results as arrays with isFinal + [j].transcript).
   iPhone / iPad / Android / Safari / Firefox: create() returns a plain new SR(), exactly the old behaviour
   (WebKit and Android do not support a long-running continuous recognizer reliably, and iOS cannot listen while speaking).
   The warm mic stops after 3 min without a press, while the tab is hidden, or if the mic is blocked.
   Turn it off with localStorage.aatccWarmMic = '0'. */
(function () {
'use strict';
const UA = navigator.userAgent || '';
const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
const CHROMIUM = /Chrome\/|Chromium\/|Edg\//.test(UA) && !/OPR\/|SamsungBrowser|CriOS|FxiOS/.test(UA);
const off = () => { try { return localStorage.getItem('aatccWarmMic') === '0'; } catch (e) { return false; } };
const IDLE_MS = 180000, PRE_MS = 500;
let Cls = null, W = null, lastUse = 0, blocked = false, fails = 0, restartT = null, starts = 0;
const now = () => performance.now();
const enabled = C => !!C && !MOBILE && (CHROMIUM || api._force) && !off() && !blocked;
const want = () => enabled(Cls) && !document.hidden && lastUse > 0 && now() - lastUse < IDLE_MS;
function snap(e) {
  const out = [];
  for (let i = 0; i < e.results.length; i++) { const r = e.results[i], a = []; for (let j = 0; j < r.length; j++) a.push({ transcript: r[j].transcript, confidence: r[j].confidence || 0 }); a.isFinal = !!r.isFinal; out.push(a); }
  return out;
}
function schedule(ms) { clearTimeout(restartT); restartT = setTimeout(() => { if (!W && want()) boot(); }, ms); }
function boot() {
  if (W) return W;
  if (!enabled(Cls)) return null;
  const rec = new Cls();
  rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 5;
  const w = { rec, results: [], first: [], owner: null, stopping: false, t0: now(), audio: false };
  rec.onaudiostart = () => { w.audio = true; };
  rec.onresult = e => { const r = snap(e); for (let i = 0; i < r.length; i++) if (w.first[i] == null) w.first[i] = now(); w.results = r; if (w.owner) w.owner._push(); };
  rec.onerror = ev => { const c = ev && ev.error; if (c === 'not-allowed' || c === 'service-not-allowed' || c === 'audio-capture') blocked = true; if (w.owner && c !== 'aborted') w.owner._err(ev); };
  rec.onend = () => {
    const o = w.owner; w.owner = null; if (W === w) W = null;
    if (o) o._end();
    const quick = now() - w.t0 < 1500 && !w.results.length; fails = quick ? fails + 1 : 0;
    if (fails < 6) schedule(quick ? Math.min(8000, 250 * 2 ** fails) : 0);   // re-warm right away (back-off if the service keeps failing)
  };
  W = w; starts++;
  try { rec.start(); } catch (e) { W = null; return null; }
  return w;
}
class Session {
  constructor() { this.lang = 'en-US'; this.continuous = true; this.interimResults = true; this.maxAlternatives = 1; this.onresult = null; this.onerror = null; this.onend = null; this.w = null; this.from = 0; this.ended = false; this.warm = false; }
  start() {
    lastUse = now(); this.ended = false;
    let w = W && !W.owner && !W.stopping ? W : null; this.warm = !!(w && w.audio);
    if (!w) { if (W) W = null; w = boot(); }   // previous recognizer still flushing: start a fresh one (it keeps its own owner)
    if (!w) throw new Error('speech recognition could not start');
    // results that are already final belong to earlier speech; a trailing interim counts only if it began just before the press
    let k = 0; while (k < w.results.length && w.results[k].isFinal) k++;
    if (k < w.results.length && w.first[k] != null && now() - w.first[k] > PRE_MS) k++;
    this.from = k; this.w = w; w.owner = this;
    if (w.results.length > k) setTimeout(() => this._push(), 0);
  }
  _push() { if (this.ended || !this.w) return; const rs = this.w.results.slice(this.from); if (rs.length && this.onresult) try { this.onresult({ results: rs, resultIndex: 0 }); } catch (e) {} }
  _err(ev) { if (!this.ended && this.onerror) try { this.onerror(ev); } catch (e) {} }
  _end() { if (this.ended) return; this.ended = true; clearTimeout(this._t); if (this.w && this.w.owner === this) this.w.owner = null; this.w = null; setTimeout(() => { if (this.onend) try { this.onend(); } catch (e) {} }, 0); }
  stop() {   // flush: the real recognizer finalizes what it heard, fires onend, and a new warm one starts
    if (this.ended || !this.w) return; lastUse = now();
    const w = this.w; w.stopping = true; if (W === w) W = null;
    try { w.rec.stop(); } catch (e) { this._end(); }
    clearTimeout(this._t); this._t = setTimeout(() => this._end(), 2500);
  }
  abort() {
    if (this.ended) return; const w = this.w;
    if (w) { w.owner = null; this.w = null; }   // the warm recognizer keeps running for the next press
    if (this.onerror) try { this.onerror({ error: 'aborted' }); } catch (e) {}
    this._end();
  }
}
function create(C) {
  if (C) Cls = C;
  if (!enabled(Cls)) return new Cls();
  return new Session();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(restartT); if (W && !W.owner) { const w = W; W = null; try { w.rec.abort(); } catch (e) {} } }
  else if (want()) schedule(50);
});
setInterval(() => { if (W && !W.owner && !want()) { const w = W; W = null; try { w.rec.abort(); } catch (e) {} } }, 15000);   // idle: let the mic go
// returning users who already allowed the mic: warm up on the first tap / key so even the first press is instant
try {
  const C0 = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (enabled(C0) && navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'microphone' }).then(p => {
    if (!p || p.state !== 'granted') return;
    const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (!Cls) Cls = C0; lastUse = now(); if (!W) boot(); };
    addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
  }).catch(() => {});
} catch (e) {}
const api = { create, get enabled() { return enabled(Cls || window.SpeechRecognition || window.webkitSpeechRecognition); }, state: () => ({ warm: !!W, live: !!(W && W.audio), owned: !!(W && W.owner), blocked, starts, idleMs: lastUse ? Math.round(now() - lastUse) : null }), _force: false, _reset: () => { if (W) try { W.rec.abort(); } catch (e) {} W = null; Cls = null; lastUse = 0; blocked = false; fails = 0; starts = 0; } };
window.WarmMic = api;
})();
