/* AATCC Trainer: "Report a problem" (v131). One shared script on every page.
   - A small Report button in the page header (scopes: the top-left brand strip; documents: the header bar; Instructor and Intro: their top bar).
   - The dialog builds a plain-text report: what happened, an optional name, and automatic details (page, site version, sim time / level when a
     scope is running, linked status, browser, screen size, local time, the last 20 page errors). "Copy report" puts it on the clipboard.
   - Never included: typed or spoken commands, passcode / gate data, or anything from storage.
   - While the dialog is open no keystroke reaches the page (no commands, no P pause, no widget arrows). Esc closes it.
   Load it right after gate.js so its key guard runs before the page's own key handlers and errors are captured from the start. */
(function () {
  if (window.AATCCReport) return;
  var SITE_VERSION = 'v131';
  var errs = [], MAXE = 20;
  function pushErr(s) { s = String(s || '').replace(/\s+/g, ' ').slice(0, 300); if (!s) return; var t = new Date(); errs.push(('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2) + '  ' + s); if (errs.length > MAXE) errs.shift(); }
  window.addEventListener('error', function (e) { if (e && e.message) pushErr(e.message + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + (e.lineno || 0) + ')' : '')); else if (e && e.target && e.target !== window && (e.target.src || e.target.href)) pushErr('Could not load ' + String(e.target.src || e.target.href).split('/').pop()); }, true);
  window.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; pushErr('Unhandled promise: ' + (r && r.message ? r.message : r)); });
  try { var ce = console.error; console.error = function () { try { pushErr(Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : typeof a === 'object' ? (function () { try { return JSON.stringify(a); } catch (_) { return String(a); } })() : String(a); }).join(' ')); } catch (_) {} return ce.apply(console, arguments); }; } catch (e) {}

  var dlg = null, isOpen = false, lastFocus = null, cacheName = '';
  // key guard: while the dialog is open, every key stops here (typing in the dialog still works; nothing reaches the scope)
  function guard(e) {
    if (!isOpen) return;
    if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    e.stopImmediatePropagation();
    if (!dlg || !dlg.contains(e.target)) { if (e.key !== 'Tab') e.preventDefault(); var ta = dlg && dlg.querySelector('textarea'); if (ta && e.type === 'keydown') ta.focus(); }
  }
  ['keydown', 'keyup', 'keypress'].forEach(function (t) { window.addEventListener(t, guard, true); });

  function pageName() {
    var p = location.pathname.split('/').pop() || 'index.html';
    var map = { 'index.html': 'Home', 'help.html': 'Help', 'playbook.html': 'Playbook', 'logsheet.html': 'Log sheet', 'intro.html': 'Intro', 'marshal-controller.html': 'Marshal',
      'approach-controller.html': 'Approach', 'final-controller-par-restyled.html': 'Final (PAR)', 'departure-controller.html': 'Departure', 'instructor-controller.html': 'Instructor' };
    return map[p] || p;
  }
  function mmss(t) { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function nm(s) { s = String(s || ''); return s.charAt(0) + s.slice(1).toLowerCase(); }
  function simInfo() {
    var out = [];
    try {   // a scope's session object G
      var g = (typeof G !== 'undefined') ? G : null;
      if (!g && window.__shTest) g = window.__shTest.G || null;   // scopes keep G inside their script; __shTest exposes it read-only
      if (g && typeof g === 'object' && g.t != null) {
        out.push('Session: ' + (g.over ? 'ended' : g.intro ? 'guided intro' : g.paused ? 'paused' : 'running') + ' at ' + mmss(g.t) + (g.scale && g.scale !== 1 ? ' (' + g.scale + 'x)' : ''));
        if (g.d && g.d.name) out.push('Level: ' + g.d.name);
      } else if (/controller/.test(location.pathname) && !/instructor/.test(location.pathname)) out.push('Session: not started');
    } catch (e) {}
    try {
      if (window.LS && LS.linked) { var gr = LS.group ? LS.group() : []; out.push('Linked: ' + (LS.linked() && gr.length ? 'yes, with ' + gr.map(nm).join(', ') : 'no')); }
    } catch (e) {}
    try {
      if (/instructor/.test(location.pathname) && typeof I !== 'undefined' && I && I.src) {
        var live = Object.keys(I.src).filter(function (k) { return I.src[k] && Date.now() - I.src[k].rx < 3000; });
        out.push('Instructor link: ' + (I.link === 'BOTH' ? 'Marshal + Approach' : nm(I.link)) + ' + Final');
        out.push('Scopes connected: ' + (live.length ? live.map(function (k) { var s = I.src[k]; return nm(k) + (s.running ? ' (running ' + mmss(s.t) + (s.diff ? ', ' + s.diff : '') + ')' : ' (open)'); }).join(', ') : 'none'));
      }
    } catch (e) {}
    return out;
  }
  function details() {
    var d = new Date(), tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var L = ['Page: ' + pageName() + ' (' + (location.pathname.split('/').pop() || 'index.html') + ')',
      'Site version: ' + SITE_VERSION + (cacheName ? ' (' + cacheName + ')' : '')];
    L = L.concat(simInfo());
    L.push('Browser: ' + navigator.userAgent);
    L.push('Screen: ' + screen.width + 'x' + screen.height + ', window ' + innerWidth + 'x' + innerHeight + (devicePixelRatio && devicePixelRatio !== 1 ? ', zoom ' + devicePixelRatio : ''));
    L.push('Time: ' + d.toLocaleString() + (tz ? ' (' + tz + ')' : ''));
    L.push('Recent errors: ' + (errs.length ? '' : 'none'));
    errs.forEach(function (e) { L.push('  ' + e); });
    return L.join('\n');
  }
  function report() {
    var what = (dlg.querySelector('#atRepWhat').value || '').trim(), who = (dlg.querySelector('#atRepName').value || '').trim();
    return 'AATCC Trainer problem report\n\nWhat happened:\n' + (what || '(not filled in)') + '\n\nName: ' + (who || '(not given)') + '\n\n' + details() + '\n';
  }
  function refresh() { var p = dlg && dlg.querySelector('#atRepDet'); if (p) p.textContent = details(); }
  function build() {
    dlg = document.createElement('div'); dlg.id = 'atReport'; dlg.className = 'at-rep-back'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'atRepTtl'); dlg.hidden = true;
    dlg.innerHTML = '<div class="at-rep">' +
      '<div class="at-rep-hd"><b id="atRepTtl">Report a problem</b><button type="button" class="at-rep-x" id="atRepX" title="Close (Esc)" aria-label="Close">×</button></div>' +
      '<label for="atRepWhat">What happened?</label><textarea id="atRepWhat" rows="5" placeholder="What you did, what you expected, and what happened instead."></textarea>' +
      '<label for="atRepName">Your name <span class="at-muted">(optional)</span></label><input id="atRepName" type="text" autocomplete="name">' +
      '<details class="at-rep-det"><summary>Details added to the report</summary><pre id="atRepDet"></pre></details>' +
      '<div class="at-rep-ft"><span id="atRepMsg" class="at-muted" aria-live="polite">Copy the report and send it to the site owner.</span><span class="at-sp"></span>' +
      '<button type="button" class="at-btn" id="atRepClose">Close</button><button type="button" class="at-btn primary" id="atRepCopy">Copy report</button></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) close(); });
    dlg.querySelector('#atRepX').onclick = close; dlg.querySelector('#atRepClose').onclick = close;
    dlg.querySelector('#atRepCopy').onclick = copy;
    dlg.querySelector('.at-rep-det').addEventListener('toggle', refresh);
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { dlg.addEventListener(t, function (e) { e.stopPropagation(); }); });   // belt and braces: nothing bubbles to the page
  }
  function copy() {
    var txt = report(), msg = dlg.querySelector('#atRepMsg');
    var ok = function () { msg.textContent = 'Copied. Paste it into an email or message to the site owner.'; msg.className = 'at-rep-ok'; window.AATCCReport.lastCopied = txt; };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0'; dlg.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) {} dlg.removeChild(ta);
      if (done) ok(); else { msg.textContent = 'Copy was blocked by the browser. Open "Details", select the text and copy it.'; msg.className = 'at-rep-bad'; var det = dlg.querySelector('.at-rep-det'); det.open = true; dlg.querySelector('#atRepDet').textContent = txt; }
    };
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback(); } catch (e) { fallback(); }
  }
  function open() {
    if (!dlg) build();
    lastFocus = document.activeElement; isOpen = true; dlg.hidden = false; document.documentElement.classList.add('at-rep-open');
    var msg = dlg.querySelector('#atRepMsg'); msg.textContent = 'Copy the report and send it to the site owner.'; msg.className = 'at-muted';
    refresh(); try { if (window.caches && caches.keys) caches.keys().then(function (k) { var c = k.filter(function (x) { return /^stinger-/.test(x); }).sort().pop(); if (c && c !== cacheName) { cacheName = c; refresh(); } }); } catch (e) {}
    setTimeout(function () { var t = dlg.querySelector('#atRepWhat'); t && t.focus(); }, 0);
  }
  function close() { if (!dlg || !isOpen) return; isOpen = false; dlg.hidden = true; document.documentElement.classList.remove('at-rep-open'); try { if (lastFocus && lastFocus.focus && lastFocus !== document.body) lastFocus.focus(); else if (document.activeElement) document.activeElement.blur(); } catch (e) {} }

  function mkBtn(tag, cls, label) { var b = document.createElement(tag); if (tag === 'a') { b.href = '#'; b.setAttribute('role', 'button'); } else b.type = 'button'; b.className = cls; b.innerHTML = label; b.title = 'Report a problem'; b.setAttribute('aria-label', 'Report a problem');
    b.addEventListener('click', function (e) { e.preventDefault(); b.blur(); open(); }); return b; }
  var LABEL = '<span aria-hidden="true">⚑</span> Report a problem';
  function place() {
    if (document.querySelector('.at-report')) return;
    var host;
    if ((host = document.getElementById('atBrand'))) {   // scopes: brand strip (hidden on narrow screens, so add a small corner button there too)
      host.appendChild(mkBtn('a', 'at-report', LABEL));
      document.body.appendChild(mkBtn('button', 'at-report at-report-fab', '<span aria-hidden="true">⚑</span>'));
    } else if ((host = document.querySelector('.at-bar .at-nav'))) host.insertBefore(mkBtn('button', 'at-btn at-report', LABEL), host.firstChild);
    else if ((host = document.querySelector('#top .at-ilinks'))) host.appendChild(mkBtn('a', 'at-report', '<span aria-hidden="true">⚑</span> Report'));   // Instructor: compact (busy top bar)
    else if ((host = document.querySelector('#top a.home[href="help.html"]'))) host.insertAdjacentElement('afterend', mkBtn('a', 'home at-report', LABEL));
    else document.body.appendChild(mkBtn('button', 'at-report at-report-fab at-report-any', '<span aria-hidden="true">⚑</span>'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
  window.AATCCReport = { open: open, close: close, text: function () { if (!dlg) build(); return report(); }, isOpen: function () { return isOpen; }, errors: function () { return errs.slice(); } };
})();
