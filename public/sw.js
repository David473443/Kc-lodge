const CACHE_NAME = 'classmind-v3';
const STATIC_CACHE = ['/', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Delete ALL old caches so stale HTML is never served again
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // HTML pages: always network-first so deploys reflect immediately
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(cached => cached || offlinePage())
        )
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => offlinePage());
    })
  );
});

function offlinePage() {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>ClassMind AI — Offline</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    body { background:#F6F6F3; color:#141414; font-family:'Inter',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:24px; }
    h2 { font-family:'Playfair Display',serif; font-size:28px; color:#1B3F6E; margin-bottom:12px; }
    p { color:#747474; font-size:15px; line-height:1.6; }
  </style>
</head>
<body>
  <div>
    <div style="font-size:48px;margin-bottom:16px">📚</div>
    <h2>ClassMind AI</h2>
    <p>You're offline. Please reconnect to the internet<br>to use ClassMind AI.</p>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
