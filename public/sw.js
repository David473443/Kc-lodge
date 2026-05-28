const CACHE_NAME = 'classmind-v1';
const FILES_TO_CACHE = ['/', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        new Response(
          '<html><body style="background:#080810;color:#E8E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h2 style="color:#00FF88">ClassMind AI</h2><p>You are offline. Please reconnect to use ClassMind AI.</p></div></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        )
      );
    })
  );
});
