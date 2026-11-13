/* AATCC background clock (v92). Browsers stop requestAnimationFrame in a hidden tab and throttle page timers
   (1 per second, and about 1 per minute after ~5 minutes hidden: Chrome "intensive throttling"). Timers inside a
   dedicated Web Worker are not throttled that way, so a tiny worker posts a tick every 100 ms and the page runs its
   registered callbacks from it. A normal setInterval is kept as a fallback (e.g. if workers are blocked).
   BgClock.every(ms, fn) works like setInterval(fn, ms); callbacks get performance.now(). The sims advance their clock
   from wall-time deltas on these ticks, so a linked scope keeps flying while the Instructor (or another tab) is in front. */
(function () {
'use strict';
const subs = []; let worker = null, started = false, ticks = 0;
function fire() { ticks++; const now = performance.now(); for (const s of subs) if (now - s.last >= s.ms - 5) { s.last = now; try { s.fn(now); } catch (e) { try { console.error('BgClock', e); } catch (e2) {} } } }
function start() {
  started = true;
  try {
    const src = 'let t=null;onmessage=e=>{clearInterval(t);t=setInterval(()=>postMessage(0),e.data||100)};';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = fire; worker.onerror = () => { worker = null; }; worker.postMessage(100);
  } catch (e) { worker = null; }
  setInterval(fire, 250);
}
window.BgClock = {
  every(ms, fn) { const s = { ms: Math.max(50, +ms || 250), fn, last: 0 }; subs.push(s); if (!started) start(); return s; },
  get worker() { return !!worker; }, get ticks() { return ticks; },
};
})();
