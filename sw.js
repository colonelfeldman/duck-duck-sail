// Network-first service worker: testers always get the newest deploy on reload;
// the cache is only a fallback so the game keeps working offline (ship WiFi).
const CACHE = 'dds-cache-v1';
// Big files that never change in place (rename the file to update it): served cache-first so the
// ~20 MB duck-spotter engine + model download once, not on every visit. Kept across updates.
const BIG = 'dds-big-v1';
const isBig = (url) => url.pathname.includes('/vendor/mediapipe/') || url.pathname.includes('/vendor/models/');
const CORE = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/art.js', 'js/store.js', 'js/catch.js', 'js/app.js',
  'vendor/qrcode.js', 'vendor/jsQR.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== BIG).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;     // Supabase etc. go straight to network
  if (url.pathname.endsWith('/version.json')) return;                       // always live
  if (isBig(url)) {
    e.respondWith((async () => {
      const c = await caches.open(BIG);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) { const copy = res.clone(); c.put(req, copy).catch(() => {}); }
      return res;
    })());
    return;
  }
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-cache' });                // revalidate past the HTTP cache
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        // keep one copy per file: drop older ?v=… versions, then store this one
        caches.open(CACHE).then(async (c) => { await c.delete(req, { ignoreSearch: true }); await c.put(req, copy); }).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await caches.match('index.html'); if (idx) return idx; }
      throw err;
    }
  })());
});
