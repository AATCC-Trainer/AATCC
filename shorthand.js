/* AATCC shorthand typing (typed input only, all three scopes).
   Shorthand.expand(text, ctx) turns compact codes into the full phraseology the scope parsers already understand:
     "lt21 l270 d1.2 cca"  ->  "Lightning 21, turn left heading 270, descend and maintain angels 1.2, vectors for CCA approach"
   Only input that LOOKS like shorthand is expanded (at least one code and no more plain words than codes);
   full sentences pass through untouched. Voice input never goes through here.
   Shorthand.attach({scope, accent, ctx}) adds the live preview line + the "⌨ Shorthand" cheat sheet under #cmdInput,
   and rewrites the typed line to its expansion just before the page's own submit handler runs (so the log shows the phrase). */
(function () {
'use strict';
const SC = ['marshal', 'approach', 'final'];
const MA = ['marshal', 'approach'], M = ['marshal'], A = ['approach'], F = ['final'];
const DIR = { n: 'north', ne: 'northeast', e: 'east', se: 'southeast', s: 'south', sw: 'southwest', w: 'west', nw: 'northwest' };
const BOUND = { n: 'northbound', ne: 'northeast bound', e: 'eastbound', se: 'southeast bound', s: 'southbound', sw: 'southwest bound', w: 'westbound', nw: 'northwest bound' };
// two-letter callsign prefixes (plus any unique start of a callsign name, and the ICAO codes the parser knows)
const CS_ALIAS = { lt: 'Lightning', li: 'Lightning', nh: 'Nighthawk', vp: 'Viper', vi: 'Viper', vn: 'Venom', ve: 'Venom', ea: 'Eagle', eg: 'Eagle',
  rd: 'Ridge', ri: 'Ridge', gf: 'Gunfighter', gu: 'Gunfighter', ch: 'Charger', cg: 'Charger', kn: 'Knight', kt: 'Knight' };
const h3 = v => String(+v).padStart(3, '0');
const NUM = '(\\d+(?:\\.\\d+)?)';
const angOrFt = (n, sc) => { n = parseFloat(n); if (sc === 'final') return (n < 100 ? Math.round(n * 1000) : n) + ' feet'; return n < 100 ? 'angels ' + n : n + ' feet'; };
const range = n => { const v = parseFloat(n); if (v === 0.5) return 'half mile'; if (v === 0.75) return 'three quarter mile';
  if (v % 1 === 0.5) return Math.floor(v) + ' and a half miles'; return v === 1 ? '1 mile from touchdown' : v + ' miles from touchdown'; };

/* code table: [regex (whole token), scopes, (match, state) => phrase, code label, meaning] */
const CODES = [
  // ---- headings / altitude / speed (shared) ----
  [/^h(\d{2,3})$/, SC, m => `fly heading ${h3(m[1])}`, 'h270', 'fly heading 270'],
  [/^l(\d{2,3})$/, SC, (m, s) => s.climbout ? `turn left heading ${h3(m[1])}` : `${s.sc === 'final' ? 'come' : 'turn'} left heading ${h3(m[1])}`, 'l270', 'turn left heading 270 (Final: come left)'],
  [/^r(\d{2,3})$/, SC, (m, s) => s.climbout ? `turn right heading ${h3(m[1])}` : `${s.sc === 'final' ? 'come' : 'turn'} right heading ${h3(m[1])}`, 'r090', 'turn right heading 090 (Final: come right)'],
  [/^brc(\d{2,3})$/, SC, (m, s) => s.clr || s.climbout ? `BRC ${h3(m[1])}` : `fly base recovery course ${h3(m[1])}`, 'brc360', 'fly base recovery course 360 (BRC 360 inside a clearance/climbout)'],
  [/^brc$/, MA, () => 'BRC', 'co1 brc …', 'BRC (inside climbout instructions)'],
  [/^rh$/, A, () => 'fly runway heading', 'rh', 'fly runway heading'],
  [new RegExp('^a' + NUM + '$'), SC, (m, s) => s.sc === 'final' ? `maintain ${angOrFt(m[1], 'final')}` : s.climbout ? `take angels ${m[1]}` : s.clr ? `angels ${m[1]}` : `maintain angels ${m[1]}`, 'a5', 'maintain angels 5 (take angels in climbout, Final: feet)'],
  [new RegExp('^c' + NUM + '$'), SC, (m, s) => `climb and maintain ${angOrFt(m[1], s.sc)}`, 'c3', 'climb and maintain angels 3 (c1500 = feet)'],
  [new RegExp('^d' + NUM + '$'), SC, (m, s) => `descend and maintain ${angOrFt(m[1], s.sc)}`, 'd1.2', 'descend and maintain angels 1.2'],
  [/^s(\d{2,3})$/, SC, m => `maintain ${m[1]} knots`, 's250', 'maintain 250 knots'],
  [/^bu$|^buster$/, SC, () => 'signal buster', 'bu', 'signal buster'],
  // ---- frequencies (permanent colors) ----
  [/^gr$/, SC, () => 'go red', 'gr', 'go red (Marshal)'],
  [/^gs$/, SC, () => 'go silver', 'gs', 'go silver (Approach)'],
  [/^gp$/, MA, () => 'go purple', 'gp', 'go purple (Final)'],
  [/^gc$/, MA, () => 'go copper', 'gc', 'go copper (Final)'],
  [/^cf$/, M, () => 'contact final controller', 'cf', 'contact final controller'],
  [/^twr$/, SC, () => 'contact tower', 'twr', 'contact tower'],
  // ---- housekeeping (shared) ----
  [/^r$/, SC, () => 'roger', 'r', 'roger'],
  [/^hm$/, SC, () => 'how do you hear me', 'hm', 'how do you hear me'],
  [/^scs$/, SC, () => 'say callsign', 'scs', 'say callsign'],
  [/^cor$/, SC, () => 'correction', 'cor', 'correction'],
  [/^sa$/, MA, () => 'say angels', 'sa', 'say angels'],
  [/^ss$/, MA, () => 'say state', 'ss', 'say state'],
  [/^sqn$/, M, () => 'squawk normal', 'sqn', 'squawk normal'],
  [/^wo$/, SC, () => 'wave off, wave off', 'wo', 'wave off, wave off'],
  [/^ma$/, SC, () => 'execute missed approach', 'ma', 'execute missed approach'],
  [/^du$/, MA, () => 'dirty up', 'du', 'dirty up (jets)'],
  [/^lc$/, MA, () => 'perform landing checks', 'lc', 'perform landing checks (helos)'],
  // traffic: tf2/5/w/a3/f35 = clock / miles / direction of travel / altitude / type (fields optional, in order)
  [/^tf([a-z0-9.\/]*)$/, SC, m => {
    const f = m[1].split('/'); const out = ['traffic'];
    if (f[0]) out.push(`${f[0]} o'clock`); if (f[1]) out.push(`${f[1]} miles`); if (f[2]) out.push(BOUND[f[2]] || f[2]);
    if (f[3]) out.push('altitude ' + (/^a\d/.test(f[3]) ? 'angels ' + f[3].slice(1) : f[3])); if (f[4]) out.push('type ' + f[4].toUpperCase());
    return out.join(', '); }, 'tf2/5/w/a3/f35', "traffic, 2 o'clock, 5 miles, westbound, altitude angels 3, type F35"],
  // ---- Marshal + Approach: radar / CCA setup / pattern ----
  [/^rc$/, MA, () => 'radar contact', 'rc', 'radar contact'],
  [/^rc(\d+(?:\.\d+)?)(n|ne|e|se|s|sw|w|nw)$/, MA, m => `radar contact, ${m[1]} miles ${DIR[m[2]]} of mother`, 'rc6e', 'radar contact, 6 miles east of mother'],
  [/^vri$/, MA, () => 'vectors for radar identification', 'vri', 'vectors for radar identification'],
  [/^cca$/, MA, () => 'vectors for CCA approach', 'cca', 'vectors for CCA approach'],
  [/^bp$/, MA, () => 'expect final button purple', 'bp', 'expect final button purple'],
  [/^bc$/, MA, () => 'expect final button copper', 'bc', 'expect final button copper'],
  [/^sec([1-4])$/, MA, m => `proceed to sector ${m[1]}, report established`, 'sec2', 'proceed to sector 2, report established'],
  [/^up$/, MA, () => 'on the upwind', 'up', 'on the upwind'],
  [/^cw$/, MA, () => 'on the crosswind', 'cw', 'on the crosswind'],
  [/^dw$/, MA, () => 'on the downwind', 'dw', 'on the downwind'],
  [/^ab$/, MA, () => 'abeam', 'ab', 'abeam'],
  [/^dl$/, MA, () => 'dogleg', 'dl', 'dogleg'],
  [/^bs$/, MA, () => 'on base', 'bs', 'on base'],
  [/^mf$/, MA, () => 'mark your father', 'mf', 'mark your father'],
  [/^co(1)?$/, MA, (m, s) => { s.climbout = true; s.coHdr = true; return m[1] ? 'your climbout instructions are at one mile' : 'your climbout instructions are'; }, 'co1 a2 l270', 'climbout: at one mile take angels 2, turn left heading 270'],
  // 99 ship calls (whole line, no callsign)
  [/^99(p|s)$/, MA, (m, s) => { s.nocs = true; return `99, mother is in a ${m[1] === 'p' ? 'port' : 'starboard'} turn, standby for expected BRC`; }, '99p / 99s', '99, mother is in a port/starboard turn, standby for expected BRC'],
  [/^99(p|s)(\d{2,3})$/, MA, (m, s) => { s.nocs = true; return `99, mother is in a ${m[1] === 'p' ? 'port' : 'starboard'} turn, BRC ${h3(m[2])}`; }, '99p330', '99, mother is in a port turn, BRC 330'],
  [/^99m(\d{2,3})$/, MA, (m, s) => { s.nocs = true; return `99, mother steady, BRC ${h3(m[1])}`; }, '99m330', '99, mother steady, BRC 330'],
  [/^99wx$/, M, (m, s) => { s.nocs = true; return '99 weather'; }, '99wx', '99 weather'],
  // ---- Marshal: Case III clearance / commence ----
  [/^cr$/, M, (m, s) => { s.clr = true; return 'case three recovery'; }, 'cr', 'case three recovery'],
  [/^lh([1-5])$/, M, (m, s) => s.clr ? `LH${m[1]} approach with CCA final` : `expect LH${m[1]} approach`, 'lh2', 'LH2 approach with CCA final (alone: expect LH2 approach)'],
  [/^clh([1-5])$/, M, m => `cleared for LH${m[1]} approach, report commencing`, 'clh2', 'cleared for LH2 approach, report commencing'],
  [/^(\d{3})\/(\d{1,2})$/, M, (m, s) => { s.clr = true; return `marshal ${m[1]} at ${m[2]}`; }, '030/2', 'marshal 030 at 2'],
  [/^ob(\d{2,3})$/, M, (m, s) => { s.clr = true; return `outbound bearing ${h3(m[1])}`; }, 'ob210', 'outbound bearing 210'],
  [/^eat(\d{1,2})$/, M, m => `expected approach time ${m[1]}`, 'eat15', 'expected approach time 15'],
  [/^cm$/, M, () => 'commence', 'cm', 'commence'],
  [/^rcm$/, M, () => 'report commencing', 'rcm', 'report commencing'],
  [/^r3o$/, M, () => 'report 3 miles outbound', 'r3o', 'report 3 miles outbound'],
  [/^em$/, M, () => 'emergency marshal', 'em', 'emergency marshal'],
  [/^eap$/, M, () => 'emergency approach', 'eap', 'emergency approach'],
  // ---- Final / PAR ----
  [/^ic$/, F, () => 'Stinger final, how do you hear me, wheels should be down, report see me', 'ic', 'initial contact: Stinger final, how do you hear me, wheels should be down, report see me'],
  [/^wd$/, F, () => 'wheels should be down', 'wd', 'wheels should be down'],
  [/^gk$/, F, () => 'check gear down', 'gk', 'check gear down'],
  [/^rsm$/, F, () => 'report see me', 'rsm', 'report see me'],
  [/^oc$/, F, () => 'on course', 'oc', 'on course'],
  [/^sl$/, F, () => 'slightly left of course', 'sl', 'slightly left of course'],
  [/^sr$/, F, () => 'slightly right of course', 'sr', 'slightly right of course'],
  [/^lo$/, F, () => 'left of course', 'lo', 'left of course'],
  [/^ro$/, F, () => 'right of course', 'ro', 'right of course'],
  [/^wl$/, F, () => 'well left of course, going further left', 'wl', 'well left of course, going further left'],
  [/^wr$/, F, () => 'well right of course, going further right', 'wr', 'well right of course, going further right'],
  [/^gol$/, F, () => 'going left of course', 'gol', 'going left of course'],
  [/^gor$/, F, () => 'going right of course', 'gor', 'going right of course'],
  [/^ag$/, F, () => 'approaching glidepath', 'ag', 'approaching glidepath (own transmission)'],
  [/^bd$/, F, () => 'begin descent', 'bd', 'begin descent (own transmission)'],
  [/^og$/, F, () => 'on glidepath', 'og', 'on glidepath'],
  [/^sa$/, F, () => 'slightly above glidepath', 'sa', 'slightly above glidepath'],
  [/^sb$/, F, () => 'slightly below glidepath', 'sb', 'slightly below glidepath'],
  [/^ab$/, F, () => 'above glidepath', 'ab', 'above glidepath'],
  [/^be$/, F, () => 'below glidepath', 'be', 'below glidepath'],
  [/^wa$/, F, () => 'well above glidepath', 'wa', 'well above glidepath'],
  [/^wb$/, F, () => 'well below glidepath', 'wb', 'well below glidepath'],
  [/^goa$/, F, () => 'going above glidepath', 'goa', 'going above glidepath'],
  [/^gob$/, F, () => 'going below glidepath', 'gob', 'going below glidepath'],
  [/^ird$/, F, () => 'increase rate of descent', 'ird', 'increase rate of descent'],
  [/^rrd$/, F, () => 'reduce rate of descent', 'rrd', 'reduce rate of descent'],
  [/^ard$/, F, () => 'adjust rate of descent', 'ard', 'adjust rate of descent'],
  [/^dna$/, F, () => 'do not acknowledge further transmissions', 'dna', 'do not acknowledge further transmissions'],
  [/^(?:mh|m0?\.5)$/, F, () => 'half mile', 'mh', 'half mile'],
  [/^(?:m3q|m0?\.75)$/, F, () => 'three quarter mile', 'm3q', 'three quarter mile'],
  [/^m(\d{1,2}(?:\.5)?)$/, F, m => range(m[1]), 'm5 / m9.5', '5 miles from touchdown / 9 and a half miles'],
  [/^dh$/, F, () => 'at decision height', 'dh', 'at decision height'],
  [/^mins$/, F, () => 'at minimums', 'mins', 'at minimums'],
  [/^ot$/, F, () => 'over landing threshold', 'ot', 'over landing threshold'],
  [/^od$/, F, () => 'over the deck', 'od', 'over the deck'],
  [/^cl$/, F, () => 'cleared to land', 'cl', 'cleared to land'],
  [/^dc$/, F, () => 'deck is clear', 'dc', 'deck is clear'],
  [/^cls(\d{1,2})$/, F, m => `deck is clear, cleared to land spot ${m[1]}`, 'cls7', 'deck is clear, cleared to land spot 7'],
  [/^w(\d{3})\/(\d{1,2})$/, F, m => `wind ${m[1]} at ${m[2]}`, 'w270/10', 'wind 270 at 10'],
  [/^wc$/, F, () => 'winds calm', 'wc', 'winds calm'],
  [/^cb$/, F, () => 'call the ball', 'cb', 'call the ball'],
  [/^rb$/, F, () => 'roger ball', 'rb', 'roger ball'],
  [/^gg$/, F, () => 'go green', 'gg', 'go green'],
  [/^co$/, F, () => 'execute climb outs, go silver', 'co', 'execute climb outs, go silver'],
  [/^sd$/, F, () => 'enter starboard delta, go green', 'sd', 'enter starboard delta, go green'],
  [/^laa$/, F, (m, s) => { s.laa = true; return 'check your altitude immediately, altimeter two niner niner two'; }, 'laa', 'Low altitude alert, <callsign>, check your altitude immediately, altimeter 2992'],
  [/^ng$/, F, () => 'this will be a no gyro approach', 'ng', 'this will be a no gyro approach'],
  [/^tl$/, F, () => 'turn left', 'tl', 'turn left (no gyro)'],
  [/^tr$/, F, () => 'turn right', 'tr', 'turn right (no gyro)'],
  [/^st$/, F, () => 'stop turn', 'st', 'stop turn'],
  [/^srt$/, F, () => 'make standard rate turns', 'srt', 'make standard rate turns'],
  [/^hsr$/, F, () => 'make half standard rate turns', 'hsr', 'make half standard rate turns'],
  [/^asr$/, F, () => 'this will be a surveillance approach', 'asr', 'this will be a surveillance approach'],
  [/^pd$/, F, () => 'prepare to descend in one mile', 'pd', 'prepare to descend in one mile'],
  [/^mda(\d{3,4})?$/, F, m => m[1] ? `descend to your minimum descent altitude, minimum descent altitude ${m[1]}` : 'descend to your minimum descent altitude', 'mda470', 'descend to your minimum descent altitude, MDA 470'],
  [/^sm$/, F, () => 'surveillance minimums, on course, if mother not in sight, execute missed approach', 'sm', 'surveillance minimums, on course, if mother not in sight, execute missed approach'],
];

function tableFor(sc) { return CODES.filter(c => c[1].includes(sc)); }

function csToken(tok, ctx) {   // 'lt21' / 'ltng21' / 'light21' -> 'Lightning 21'
  const m = /^([a-z]{2,10})(\d{1,4})$/.exec(tok); if (!m) return null;
  const als = (ctx.airlines || []);
  let name = CS_ALIAS[m[1]];
  if (name && als.length && !als.some(a => a.tel === name)) name = null;
  if (!name) { const al = als.find(a => a.icao && a.icao.toLowerCase() === m[1]); if (al) name = al.tel; }
  if (!name) { const hits = als.filter(a => a.tel.toLowerCase().startsWith(m[1])); if (hits.length === 1) name = hits[0].tel; }
  if (!name && !als.length) name = CS_ALIAS[m[1]] || null;
  return name ? name + ' ' + m[2] : null;
}
function byDigits(d, ctx) {   // bare '21' -> 'Lightning 21' when exactly one live aircraft ends in those digits
  const list = (ctx.callsigns || []).filter(x => String(x.cs).replace(/^\D+/, '') === d || String(x.cs).endsWith(d));
  return list.length === 1 ? list[0].tel : d;
}

/* returns { shorthand: bool, text, codes: n } */
function expand(input, ctx) {
  ctx = ctx || {}; const sc = SC.includes(ctx.scope) ? ctx.scope : 'approach';
  const src = String(input || '').trim();
  if (!src) return { shorthand: false, text: src, codes: 0 };
  let toks = src.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  let cs = null;
  const als = ctx.airlines || [];
  // callsign at the start: 'lt21' | 'lightning 21' | '21'
  if (toks.length) {
    const c1 = csToken(toks[0], ctx);
    const isWord = als.some(a => (a.words || [a.tel.toLowerCase()]).includes(toks[0]));
    if (c1 && !tableFor(sc).some(c => c[0].test(toks[0]))) { cs = c1; toks = toks.slice(1); }
    else if (isWord && toks[1] && /^\d{1,4}$/.test(toks[1])) { const al = als.find(a => (a.words || []).includes(toks[0])); cs = al.tel + ' ' + toks[1]; toks = toks.slice(2); }
    else if (/^\d{2,3}$/.test(toks[0]) && toks[0] !== '99' && toks.length > 1) { cs = byDigits(toks[0], ctx); toks = toks.slice(1); }
  }
  const st = { sc, clr: false, climbout: false, nocs: false, laa: false };
  const tab = tableFor(sc);
  // clearance context is known up front (so 'a2' / 'brc360' read as clearance items wherever they sit)
  st.clr = sc === 'marshal' && toks.some(t => /^(?:cr|\d{3}\/\d{1,2}|ob\d{2,3})$/.test(t));
  const parts = []; let codes = 0, words = 0, coBuf = null;
  for (const t of toks) {
    let hit = null;
    for (const c of tab) { const m = c[0].exec(t); if (m) { hit = c[2](m, st); break; } }
    if (hit == null) { words++; parts.push({ w: t }); continue; }
    codes++;
    if (st.coHdr) { st.coHdr = false; coBuf = { co: hit, items: [] }; parts.push(coBuf); continue; }
    if (coBuf && st.climbout) { coBuf.items.push(hit); continue; }
    parts.push({ p: hit });
  }
  if (!codes && !(cs && !toks.length)) return { shorthand: false, text: src, codes: 0 };
  if (words > codes) return { shorthand: false, text: src, codes: 0 };
  // render: consecutive plain words stay together; phrases are comma-separated
  const out = []; let wb = [];
  const fl = () => { if (wb.length) { out.push(wb.join(' ')); wb = []; } };
  for (const p of parts) { if (p.w != null) { wb.push(p.w); continue; } fl(); out.push(p.co != null ? p.co + (p.items.length ? ' ' + p.items.join(', ') : '') : p.p); }
  fl();
  if (!cs && !st.nocs && ctx.selected) cs = ctx.selected;
  let text;
  if (st.laa) text = 'Low altitude alert' + (cs ? ', ' + cs : '') + ', ' + out.join(', ');
  else text = (cs && !st.nocs ? cs + ', ' : '') + out.join(', ');
  text = text.replace(/\bcase three\b/, 'Case three').replace(/^([a-z])/, (x) => x.toUpperCase());
  return { shorthand: true, text, codes };
}

/* ---------------- UI ---------------- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function attach(opt) {
  const form = document.getElementById(opt.form || 'cmdForm'), inp = document.getElementById(opt.input || 'cmdInput');
  if (!form || !inp || form.__sh) return; form.__sh = true;
  const sc = opt.scope, acc = opt.accent || '#cccccc', acc2 = opt.accent2 || acc;
  const getCtx = () => { let c = {}; try { c = (opt.ctx && opt.ctx()) || {}; } catch (e) {} c.scope = sc; return c; };
  const css = document.createElement('style');
  css.textContent = `
#shBar{display:flex;align-items:center;gap:6px;margin-top:3px;min-height:18px;font:11px monospace}
#shBtn{background:transparent;border:1px solid ${acc};color:${acc};font:11px monospace;padding:1px 6px;border-radius:3px;cursor:pointer;flex:none}
#shBtn:hover,#shBtn.on{background:${acc};color:#111}
#shPrev{color:${acc2};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;opacity:.95}
#shPrev.pass{color:var(--dim,#888)}
#shHelp{display:none;position:fixed;z-index:2147480000;right:12px;bottom:12px;width:min(560px,94vw);max-height:72vh;overflow:auto;background:var(--bg,#111);border:1px solid ${acc};box-shadow:0 0 0 1px ${acc2}55,0 8px 30px #000a;color:var(--g,#ddd);font:12px monospace;padding:10px 12px;border-radius:4px}
#shHelp.on{display:block}
#shHelp h3{margin:0 0 6px;color:${acc};font-size:13px}
#shHelp .x{float:right;cursor:pointer;color:${acc}}
#shHelp table{border-collapse:collapse;width:100%}
#shHelp td{padding:2px 6px;border-bottom:1px solid #ffffff14;vertical-align:top}
#shHelp td:first-child{color:${acc2};white-space:nowrap;font-weight:bold}
#shHelp p{margin:6px 0;color:var(--dim,#999)}`;
  document.head.appendChild(css);
  const bar = document.createElement('div'); bar.id = 'shBar';
  bar.innerHTML = '<button type="button" id="shBtn" title="Shorthand codes (or type ? and Enter)">⌨ Shorthand</button><span id="shPrev"></span>';
  form.appendChild(bar);
  const help = document.createElement('div'); help.id = 'shHelp';
  const rows = tableFor(sc).map(c => `<tr><td>${esc(c[3])}</td><td>${esc(c[4])}</td></tr>`).join('');
  const ex = { marshal: 'ea16 cr lh2 030/2 a2 brc360 ob210 eat15', approach: 'lt21 rc6e l180 d1.2 cca bp', final: 'h275 sl m6' }[sc];
  help.innerHTML = `<span class="x" title="Close">✕</span><h3>⌨ Shorthand: ${esc(sc[0].toUpperCase() + sc.slice(1))}</h3>
<p>Start with a callsign (<b>lt21</b> = Lightning 21, <b>ea16</b>, <b>vn12</b>, <b>nh34</b>, or just the digits <b>21</b>); leave it off to talk to the selected aircraft. Chain codes with spaces, e.g. <b>${esc(ex)}</b>. The full phrase is shown under the box and goes into the log. Full sentences still work as before. Type <b>?</b> + Enter to open this.</p>
<table>${rows}</table>`;
  document.body.appendChild(help);
  const btn = bar.querySelector('#shBtn'), prev = bar.querySelector('#shPrev');
  const toggle = on => { const v = on == null ? !help.classList.contains('on') : on; help.classList.toggle('on', v); btn.classList.toggle('on', v); };
  btn.addEventListener('click', e => { e.preventDefault(); toggle(); inp.focus({ preventScroll: true }); });
  help.querySelector('.x').addEventListener('click', () => toggle(false));
  help.addEventListener('keydown', e => e.stopPropagation());
  const upd = () => { const v = inp.value.trim(); if (!v) { prev.textContent = ''; return; } if (v === '?') { prev.textContent = '↵ show shorthand codes'; prev.classList.add('pass'); return; }
    const r = expand(v, getCtx()); prev.textContent = r.shorthand ? '→ ' + r.text : ''; prev.classList.toggle('pass', !r.shorthand); };
  inp.addEventListener('input', upd);
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  // runs in the capture phase on document, i.e. BEFORE the page's own submit handler on the form
  document.addEventListener('submit', e => {
    if (e.target !== form) return;
    const v = inp.value.trim();
    if (v === '?' || v.toLowerCase() === 'help') { e.preventDefault(); e.stopImmediatePropagation(); inp.value = ''; prev.textContent = ''; toggle(true); return; }
    const r = expand(v, getCtx());
    if (r.shorthand) inp.value = r.text;
    prev.textContent = '';
  }, true);
}
const api = { expand, attach, table: sc => tableFor(sc).map(c => ({ code: c[3], meaning: c[4] })), CODES };
if (typeof window !== 'undefined') window.Shorthand = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
