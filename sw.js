// Stinger trainers service worker: network-first (a normal reload always gets new files), cache fallback when offline.
const CACHE = 'stinger-v40';
const PRECACHE = ['./', './index.html', './approach-controller.html', './marshal-controller.html', './final-controller-par-restyled.html',
  './approach.webmanifest', './marshal.webmanifest', './final.webmanifest', './approach-192.png', './approach-512.png', './final-192.png', './final-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(req, { cache: 'no-store' }).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error())));
});
