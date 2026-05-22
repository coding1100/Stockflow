// StockFlow service worker — offline app-shell caching for the pick PWA.
// Network-first for navigations/static (so updates land fast), cache fallback when the
// network is unavailable, so a picker mid-wave keeps a working UI offline. Pick actions
// themselves are queued in IndexedDB by the app and replayed on reconnect (see outbox.ts).

const CACHE = 'stockflow-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache API or SSE — they must hit the network (or fail, handled by the app).
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/pick'))),
  );
});
