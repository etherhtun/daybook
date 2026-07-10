// Daybook service worker.
//  · /api/*  → always network (live data + auth); never cached.
//  · navigations (HTML) → network-first, fall back to cached shell offline.
//  · other assets → stale-while-revalidate.
// Bump CACHE on any shell change so clients refresh.

const CACHE = 'daybook-shell-v2';
const SHELL = [
  '/', '/index.html',
  '/assets/css/app.css',
  '/assets/js/app.js',
  '/assets/js/api.js',
  '/assets/js/modules/home.js',
  '/assets/js/modules/health.js',
  '/assets/js/modules/tasks.js',
  '/assets/js/modules/journal.js',
  '/assets/js/modules/setup.js',
  '/manifest.webmanifest',
  '/assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API + client-config: straight to network, never cache.
  if (url.pathname.startsWith('/api/')) return;

  // HTML navigations: network-first, cached shell fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
