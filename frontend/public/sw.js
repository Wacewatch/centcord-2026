/* CentCord Service Worker — minimal offline shell */
const CACHE = 'centcord-v1';
const SHELL = ['/', '/manifest.json', '/favicon.svg', '/logo.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for /api/*; cache-first for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Skip API, WS, ext URLs
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.origin !== self.location.origin) return;

  // HTML navigation: network-first, fallback to cache then offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || new Response('Hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});

// Push notifications (optional VAPID-ready stub)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'CentCord';
  const body = data.body || 'Nouvelle notification';
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/favicon.svg', badge: '/favicon.svg', tag: data.tag, data: { url: data.url || '/app' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => {
      const found = wins.find((w) => w.url.includes(url));
      if (found) return found.focus();
      return self.clients.openWindow(url);
    })
  );
});
