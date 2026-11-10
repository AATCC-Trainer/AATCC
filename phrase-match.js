/* AATCC shared sound-alike phrase matcher (all three scopes).
   PhraseMatch.normalize(text, {protect}) runs on every voice and typed transmission BEFORE the scope's own parser:
   1) lowercase + tidy, 2) spoken-number canonical forms (niner/tree/fife/fower, "twenty-one" -> "twenty one"),
   3) known sound-alikes from the controller phrase list notes, 4) a conservative fuzzy snap (phonetic key +
   edit distance) of near-miss key words onto the phrase-list vocabulary.
   It never changes digits, number words, NATO letters or callsign names (pass extra words in opts.protect). */
(function () {
'use strict';
// vocabulary of Raphael's edited controller phrase list (Nov 2026), number words removed
const VOCAB = ('arc arcing inbound turning abeam above acknowledge adjust alert altimeter altitude angels approach approaching around ball base bearing begin below ' +
  'buster button call callsign calm case check checks clear cleared climb climbout come commence commencing contact controller copper ' +
  'correction course crosswind decision deck delta descend descent dirty dogleg down downwind emergency enter established execute expect ' +
  'expected father feet final from further farther gear glidepath going green gyro half heading hear height identification immediately increase ' +
  'instructions knots land landing left maintain make mark marshal mile miles minimum minimums missed monitor mother normal outbound outs ' +
  'over perform port prepare proceed purple quarter radar radial rate recovery reduce report right roger runway sector should sight signal ' +
  'silver slightly slow speed spot squawk standard standby starboard state steady stinger stop surveillance switch take this threshold time ' +
  'touchdown tower traffic transmissions transmission turn turns type upwind vectors wave weather well wheels will wind winds with your ' +
  'read radio verify fuel frequency normally prifly boss ship say fly see red blue final approach clock oclock tally north south east west ' +
  'northbound southbound eastbound westbound northeast northwest southeast southwest direction miles feet leg base rate further ' +
  'appear time push again same then they them that there their when what where were here have from into onto just also only ' +
  'level descending climbing passing time steady affirm negative wilco unable fighter hawk').split(/\s+/).filter(Boolean);
const VSET = new Set(VOCAB);
const NUMW = new Set(('zero oh o one won two to too three tree four for fore fower five fife six seven eight ate nine niner ten eleven twelve ' +
  'thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fourty fifty sixty seventy eighty ninety hundred thousand ' +
  'point half quarter dot').split(' '));
const NATO = new Set('alpha alfa bravo charlie delta echo foxtrot fox golf hotel india juliet juliett kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey whisky xray yankee zulu'.split(' '));
// default callsign names (the scopes pass their own list too)
const CALLSIGNS = ['lightning', 'lightening', 'nighthawk', 'viper', 'vipers', 'piper', 'venom', 'eagle', 'eagles', 'ridge', 'gunfighter', 'gunfighters', 'charger', 'chargers', 'stinger', 'wasp'];
// recognizer sound-alikes the scopes already map themselves (left alone so their own fixers keep working)
const KEEP = new Set(['angles', 'angle', 'angel', 'angus', 'ankles', 'people', 'pupil', 'sliver', 'martial', 'marshall', 'comments', 'cooper', 'coper', 'stringer', 'singer', 'stinker']);

/* ---------- 1. known sound-alikes (phrase level, from the notes in the phrase list) ---------- */
const NW = '(?:\\d+|zero|oh|one|won|two|to|too|three|tree|four|for|fore|five|fife|six|seven|eight|ate|nine|niner)';
const ALIASES = [
  // permanent frequency colors: never "blue"
  [/\bgo(?:\s+to)?\s+(?:blue|blew)\b/g, 'go silver'],
  [/\b(?:goal|gold|go\s+on|grow)\s+(silver|red|purple|copper)\b/g, 'go $1'],
  [/\bgo(?:\s+to)?\s+(?:read|redd|rhett|rad)\b/g, 'go red'],
  [/\bgo(?:\s+to)?\s+(?:sliver|silvar|sylver|sylvia)\b/g, 'go silver'],
  [/\bgo(?:\s+to)?\s+(?:people|pupil|purpel|purpal)\b/g, 'go purple'],
  [/\bgo(?:\s+to)?\s+(?:cooper|coper|kopper|cupper|coppers)\b/g, 'go copper'],
  [/\bbutton\s+(?:people|pupil|purpel)\b/g, 'button purple'],
  // signal buster
  [/\b(?:single|signals|cigna|sigma|cymbal|signal)\s+(?:buster|busta|bust\s+her|busters|duster)\b/g, 'signal buster'],
  [/\bbusta\b/g, 'buster'],
  // say angels / altitude
  [/\bsay\s+(?:your\s+)?(?:angles|angel|angle|angus|ankles)\b/g, 'say angels'],
  // ship turn 99 calls
  [/\bmother'?s\s+(?:in\s+)?(?:a\s+)?(port|starboard)\s+turn\b/g, 'mother is in a $1 turn'],
  [/\bstar\s+board\b/g, 'starboard'],
  [/\b(?:pork|porch|fort|sport)\s+turn\b/g, 'port turn'],
  [/\bstand\s+by\b/g, 'standby'],
  [/\b(?:b\s+r\s+c|bee\s+are\s+see|b\s+rc|br\s+c)\b/g, 'brc'],
  // traffic call
  [/\b(?:oclock|o\s+clock|a\s+clock|of\s+clock)\b/g, "o'clock"],
  [/\b(?:trafic|traffik|traffick)\b/g, 'traffic'],
  // CCA / climbout / missed approach
  [/\b(?:see\s+see\s+a|sea\s+sea\s+a|c\s+c\s+a)\b/g, 'cca'],
  [/\b(?:climb|clime)\s*-\s*outs?\b/g, 'climb out'],
  [/\bif\s+(?:the\s+)?(?:brother|other|mothers)\s+(?:is\s+)?not\s+in\s+(?:sight|site|side|cite)\b/g, 'if mother not in sight'],
  [/\bnot\s+in\s+(?:site|cite)\b/g, 'not in sight'],
  [/\bmissed\s+(?:a\s+)?approach(?:es)?\b/g, 'missed approach'],
  [/\b(?:mist|mrs|miss)\s+approach\b/g, 'missed approach'],
  // Final course calls
  [/\b(?:farther|father|further)\s+(left|right)\b/g, 'further $1'],
  [/\b(left|right)\s+of\s+(?:cores|corse|coarse)\b/g, '$1 of course'],
  // marshal / Case III
  [/\bout\s*-?\s*bound\b/g, 'outbound'],
  [/\b(?:expect(?:ed|ing)?|accepted)\s+(?:a\s+)?(?:proach|approach)\s+(?:times|dime|dimes|tie|tim)\b/g, 'expected approach time'],
  [/\bcase\s+(?:tree|free|iii|3)\s+recovery\b/g, 'case three recovery'],
  // headings
  [new RegExp('\\b(turn|come)\\s+(?:write|wright|rite)\\s+(?=heading|' + NW + ')', 'g'), '$1 right '],
];

/* ---------- 2. fuzzy snap ---------- */
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let pr = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cu = [i]; for (let j = 1; j <= n; j++) cu[j] = Math.min(pr[j] + 1, cu[j - 1] + 1, pr[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); pr = cu; }
  return pr[n];
}
// small Metaphone-style key: consonant skeleton with common English sound rules
function phon(w) {
  return String(w).toLowerCase().replace(/[^a-z]/g, '').replace(/^kn|^gn|^pn|^wr/, m => m[1]).replace(/^x/, 's').replace(/ph/g, 'f').replace(/gh(?![aeiou])/g, '')
    .replace(/tch/g, 'ch').replace(/sch/g, 'sk').replace(/ck|q/g, 'k').replace(/c(?=[iey])/g, 's').replace(/c/g, 'k').replace(/dg(?=[iey])/g, 'j')
    .replace(/g(?=[iey])/g, 'j').replace(/z/g, 's').replace(/x/g, 'ks').replace(/v/g, 'f').replace(/sh|ti(?=[ao])/g, 'x').replace(/th/g, '0')
    .replace(/(?!^)[aeiouyhw]/g, '').replace(/^[aeiouy]/, 'a').replace(/(.)\1+/g, '$1');
}
const KEYS = VOCAB.map(v => ({ v, k: phon(v) }));
function snapWord(w, protect) {
  if (w.length < 4 || /[^a-z]/.test(w) || VSET.has(w) || NUMW.has(w) || NATO.has(w) || KEEP.has(w) || (protect && protect.has(w))) return w;
  const k = phon(w); let best = null;
  for (const c of KEYS) {
    if (c.v[0] !== w[0] || NUMW.has(c.v) || Math.abs(c.v.length - w.length) > 2) continue;
    const d = lev(w, c.v), sameKey = c.k === k;
    const L = Math.max(w.length, c.v.length);
    const ok = L <= 4 ? (d <= 1 && sameKey) : L <= 7 ? (d <= 1 || (d <= 2 && sameKey)) : (d <= 2 || (d <= 3 && sameKey));
    if (!ok) continue;
    const sc = d - (sameKey ? 0.5 : 0);
    if (!best || sc < best.sc) best = { v: c.v, sc, tie: false };
    else if (sc === best.sc && c.v !== best.v) best.tie = true;
  }
  return best && !best.tie ? best.v : w;   // ambiguous near-miss: leave it for the scope's parser
}

/* ---------- normalize ---------- */
function normalize(raw, opts) {
  opts = opts || {};
  const protect = new Set(CALLSIGNS.concat(opts.protect || []).map(x => String(x).toLowerCase()).flatMap(x => x.split(/\s+/)));
  let s = ' ' + String(raw == null ? '' : raw).toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"') + ' ';
  s = s.replace(/[.!?;]+(?=\s|$)/g, ' ');   // sentence punctuation (decimals like 1.2 are kept)
  // spoken numbers: canonical words only (the scope parsers turn words into digits themselves)
  s = s.replace(/\b(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine|niner)\b/g, '$1 $2');
  s = s.replace(/\bniner\b/g, 'nine').replace(/\btree\b(?=\s*(?:,|\d|zero|one|two|three|four|five|six|seven|eight|nine|recovery|miles?|o'clock|$))/g, 'three')
    .replace(/\bfife\b/g, 'five').replace(/\bfower\b/g, 'four');
  for (const [re, rep] of ALIASES) s = s.replace(re, rep);
  // fuzzy word snap (words only; digits, punctuation and spacing untouched)
  if (opts.fuzzy !== false) s = s.replace(/[a-z]+/g, w => snapWord(w, protect));
  // a second alias pass catches phrases completed by the snap ("singel buster" -> "signal buster")
  for (const [re, rep] of ALIASES) s = s.replace(re, rep);
  return s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
}
const api = { normalize, snapWord, phon, lev, VOCAB, ALIASES, version: 1 };
if (typeof window !== 'undefined') window.PhraseMatch = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
