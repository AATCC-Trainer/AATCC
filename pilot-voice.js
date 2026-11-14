/* AATCC pilot voices (v95, all scopes + intro). Why: pilots used to get voices[a.uid % voices.length] from EVERY English
   voice on the device. On iPhone / iPad / Mac that list includes the novelty and Eloquence voices (Whisper, Bad News,
   Cellos, Organ, Zarvox, Grandma, Grandpa, Bahh, Bubbles ...), and because aircraft ids grow during a sim the later
   aircraft landed on them: the "creepy" voices near the end of a run. Final also bent pitch 0.75-1.24 and rate per aircraft.
   PilotVoice.pick(key, voices) only uses natural voices and gives each callsign the same voice for the whole run;
   PilotVoice.PITCH / RATE keep pilots at a normal pitch and rate (no per-aircraft drift). */
(function () {
'use strict';
const NOVELTY = /\b(albert|bad\s*news|bahh|bells|boing|bubbles|cellos|wobble|zarvox|trinoids|whisper|jester|organ|superstar|good\s*news|hysterical|deranged|pipe\s*organ|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|ralph|junior|kathy|princess|fred|vicki|victoria|agnes|bruce)\b/i;
const QUALITY = /enhanced|premium|natural|neural|online|google/i;
const isEn = v => /^en(-|_|$)/i.test(v.lang || '');
function natural(list) {
  const en = (list || []).filter(isEn), ok = en.filter(v => !NOVELTY.test(v.name || ''));
  return (ok.length ? ok : en).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
const memo = new Map();   // callsign -> voice name (stable for the run even if the browser re-lists its voices)
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(key, list) {
  const pool = natural(list); if (!pool.length) return null;
  const k = String(key == null ? '' : key), was = memo.get(k);
  if (was) { const v = pool.find(x => x.name === was); if (v) return v; }
  // prefer good local voices (local voices start instantly and do not drop out); fall back to the whole natural pool
  const loc = pool.filter(v => v.localService), best = (loc.length >= 2 ? loc : pool);
  const q = best.filter(v => QUALITY.test(v.name)), use = q.length >= 3 ? q : best;
  const v = use[hash(k) % use.length]; memo.set(k, v.name); return v;
}
const api = { NOVELTY, natural, pick, reset: () => memo.clear(), PITCH: 1, RATE: 1, STALE_MS: 6000 };
if (typeof window !== 'undefined') window.PilotVoice = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
