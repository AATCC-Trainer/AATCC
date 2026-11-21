/* AATCC v126 automated handoff between a linked Marshal and Approach scope (BroadcastChannel 'stinger-link', via the page's MA link).
   Sender types '<letter> HND S' (Marshal -> Silver) or '<letter> HND R' (Approach -> Red): the data block shows HNDOFF and flashes;
   the offer (with the live track) is re-sent every second. The receiving scope shows the incoming target flashing with its own letter
   until it is accepted ('<letter>' / '<letter> ACPT' / 'ACPT' + Enter, or a click). On accept the sender transfers the aircraft with the
   existing hand-off (MA.handoff -> MA.takeFn), already accepted on the receiver. '<letter> HND' again (or Esc in an empty box) cancels.
   Messages: hnd-offer {id, src, to, cs, tel, type, e, n, alt, hdg, freq} · hnd-acpt {id, src, to, cs, ltr} · hnd-cxl {id, src, to, cs}. */
(function () {
'use strict';
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', FREQ3 = { silver: 'SLVR', red: 'RED', copper: 'COPR', purple: 'PRPL', teal: 'TEAL' };
const PEER_FREQ = { MARSHAL: 'silver', APPROACH: 'red' };   // the colour of the OTHER linked scope
const NAME = { MARSHAL: 'Marshal (Red)', APPROACH: 'Approach (Silver)' };
let O = null; const IN = new Map(), PEND_LTR = new Map();
function out() { const G = O.G(); return G ? G.ac.filter(a => a.hnd && O.alive(a)) : []; }
function freeLtr() { const G = O.G(), used = new Set([...(G ? G.ac : []).filter(a => a.ltr && O.alive(a)).map(a => a.ltr), ...[...IN.values()].map(x => x.ltr)]);
  for (const c of ABC) if (!used.has(c)) return c; return 'Z'; }
function offer(a) { const h = a.hnd; if (!h) return;
  O.MA.post({ type: 'hnd-offer', id: h.id, src: O.self, to: O.peer, cs: a.cs, tel: O.tel(a), type2: a.type, e: +a.e.toFixed(4), n: +a.n.toFixed(4), alt: Math.round(a.alt), hdg: Math.round(a.hdg), gs: Math.round(a.gs || a.ias || 0), freq: h.freq }); }
const API = {
  init(o) { O = o; setInterval(() => { for (const a of out()) offer(a);
      const now = Date.now(); for (const [id, x] of IN) if (now - x.rx > 4000) { IN.delete(id); O.log('warn', `Incoming handoff ${x.cs} from ${NAME[x.src] || x.src} withdrawn.`); } }, 1000); },
  incoming() { return [...IN.values()].map(x => x.ltr); },
  pendLtr(cs) { const l = PEND_LTR.get(cs); PEND_LTR.delete(cs); return l || null; },
  linked() { return !!(O && O.MA && O.MA.linked()); },
  /* typed command from Shorthand.scopeCmd */
  cmd(q) {
    if (!O || !q || (q.cmd !== 'hnd' && q.cmd !== 'acpt')) return false;
    const G = O.G(); if (!G || G.over) { O.log('sys', 'Start a session first.'); return true; }
    if (q.cmd === 'acpt') return this.accept(q.ltr), true;
    if (!this.linked()) { O.log('warn', `Handoff needs a linked scope: turn Link Marshal ↔ Approach ON with both pages open and running. Nothing handed off.`); return true; }
    if (q.bad) { O.log('warn', `HND: "${q.bad.toUpperCase()}" is not a frequency. Use S Silver, R Red, C Copper, P Purple, T Teal (e.g. A HND S).`); return true; }
    const a = q.tel ? G.ac.find(x => O.alive(x) && O.tel(x).toLowerCase() === String(q.tel).toLowerCase()) : null;
    if (!a) { O.log('warn', `HND: no aircraft "${q.sel}" on this scope.`); return true; }
    if (!q.freq) { if (a.hnd) this.cancel(a); else O.log('sys', `HND needs a frequency letter, e.g. ${a.ltr || q.sel} HND ${PEER_FREQ[O.self] === 'silver' ? 'S' : 'R'}.`); return true; }
    const want = PEER_FREQ[O.self];
    if (q.freq !== want) { O.log('warn', `HND ${FREQ3[q.freq]}: automated handoffs go to the linked ${O.peer === 'APPROACH' ? 'Approach scope (S = Silver)' : 'Marshal scope (R = Red)'}. For ${FREQ3[q.freq]} use the radio call (e.g. "go ${q.freq}").`); return true; }
    if (!O.canHand(a)) { O.log('warn', `${a.cs} can't be handed off now (not under your control).`); return true; }
    if (a.hnd) { O.log('sys', `${a.cs} handoff to ${FREQ3[a.hnd.freq]} already pending (type ${a.ltr || q.sel} HND to cancel).`); return true; }
    a.hnd = { id: 'HND-' + a.cs + '-' + Date.now(), freq: q.freq, t0: Date.now() }; offer(a);
    O.log('sys', `${a.ltr ? a.ltr + ' ' : ''}${a.cs} HNDOFF to ${O.peer === 'APPROACH' ? 'Approach' : 'Marshal'} (${FREQ3[q.freq]}): flashing until accepted.`);
    return true;
  },
  cancel(a) { if (!a || !a.hnd) return false; O.MA.post({ type: 'hnd-cxl', id: a.hnd.id, src: O.self, to: O.peer, cs: a.cs }); a.hnd = null; O.log('sys', `${a.cs} handoff cancelled.`); return true; },
  cancelLast() { const L = out().sort((x, y) => y.hnd.t0 - x.hnd.t0); return L.length ? this.cancel(L[0]) : false; },
  accept(ltr) {
    const L = [...IN.values()].sort((x, y) => x.t0 - y.t0), x = ltr ? L.find(v => v.ltr === ltr) : L[0];
    if (!x) { O.log('warn', ltr ? `No incoming handoff ${ltr}.` : 'No incoming handoff to accept.'); return false; }
    IN.delete(x.id); PEND_LTR.set(x.cs, x.ltr);
    O.MA.post({ type: 'hnd-acpt', id: x.id, src: O.self, to: x.src, cs: x.cs, ltr: x.ltr });
    O.log('good', `${x.ltr} ${x.cs} handoff from ${NAME[x.src] || x.src} accepted: it comes to you on ${FREQ3[x.freq] || ''}.`); return true;
  },
  recv(m) {
    if (!O || !m || m.to !== O.self) return false;
    const G = O.G();
    if (m.type === 'hnd-offer') { if (!G || G.over) return true;
      let x = IN.get(m.id); if (!x) { x = { id: m.id, t0: Date.now(), ltr: freeLtr() }; IN.set(m.id, x); O.log('warn', `Incoming handoff from ${NAME[m.src] || m.src}: ${x.ltr} ${m.cs}. Type ${x.ltr} + Enter (or ${x.ltr} ACPT) or click it to accept.`); try { O.sound && O.sound(); } catch (e) {} }
      Object.assign(x, { src: m.src, cs: m.cs, tel: m.tel, type: m.type2, e: m.e, n: m.n, alt: m.alt, hdg: m.hdg, gs: m.gs, freq: m.freq, rx: Date.now() }); return true; }
    if (m.type === 'hnd-cxl') { const x = IN.get(m.id); if (x) { IN.delete(m.id); O.log('sys', `Incoming handoff ${x.cs} cancelled by ${NAME[m.src] || m.src}.`); } return true; }
    if (m.type === 'hnd-acpt') { const a = G && G.ac.find(v => v.hnd && v.hnd.id === m.id); if (!a) return true;
      a.hnd = null; a.hndAcc = true; O.log('good', `${a.cs} handoff accepted by ${O.peer === 'APPROACH' ? 'Approach' : 'Marshal'}: switching ${FREQ3[PEER_FREQ[O.self]]}.`);
      try { O.transfer(a); } catch (e) { console.error('hnd transfer', e); } return true; }
    return false;
  },
  /* scope drawing: incoming targets (receiver) */
  draw(ctx, P, now, font) {
    if (!IN.size) return; const on = (now / 350 | 0) % 2;
    ctx.save(); ctx.font = font; ctx.textAlign = 'left';
    for (const x of IN.values()) {
      const Q = P(x.e, x.n), col = on ? 'rgba(255,235,120,1)' : 'rgba(255,235,120,0.35)';
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(Q[0], Q[1] - 5); ctx.lineTo(Q[0] + 5, Q[1]); ctx.lineTo(Q[0], Q[1] + 5); ctx.lineTo(Q[0] - 5, Q[1]); ctx.closePath(); ctx.stroke();
      const bx = Q[0] + 14, by = Q[1] - 22, l1 = `${x.ltr} ${window.Shorthand ? Shorthand.shortCs(x.cs) : x.cs} HNDOFF`, l2 = `${String(Math.round(x.alt / 100)).padStart(3, '0')} ← ${x.src === 'MARSHAL' ? 'RED' : 'SLVR'}`;
      ctx.fillStyle = col; ctx.fillText(l1, bx, by); ctx.fillText(l2, bx, by + 12);
      x.hit = { x: Q[0], y: Q[1], bx: bx - 2, by: by - 12, bw: Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 4, bh: 28 };
    }
    ctx.restore();
  },
  click(px, py) {   // receiver: a click on an incoming target accepts it
    for (const x of IN.values()) { const h = x.hit; if (!h) continue;
      if (Math.hypot(h.x - px, h.y - py) < 12 || (px >= h.bx && px <= h.bx + h.bw && py >= h.by && py <= h.by + h.bh)) { this.accept(x.ltr); return true; } }
    return false;
  },
  flashOff(now) { return !((now / 350 | 0) % 2); },
  _in: IN,
};
window.HND = API;
})();
