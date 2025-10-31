// Service Worker for Face Detection Attendance App
const CACHE_NAME = 'face-detection-app-v3';
const PRECACHE_URLS = [
  'index.html',
  'script.js',
  'face-api.min.js',
  'models/tiny_face_detector_model-weights_manifest.json',
  'models/tiny_face_detector_model-shard1.bin'
];

// Install event - pre-cache essential assets and activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// Fetch event
// Use network-first for HTML to always get latest UI, cache-first for assets
self.addEventListener('fetch', event => {
  const req = event.request;

  // Handle navigation requests (HTML)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Only cache valid basic responses
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});

// Activate event - cleanup old caches and take control
self.addEventListener('activate', event => {
  const whitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => !whitelist.includes(k) && caches.delete(k))
    ))
  );
  self.clients.claim();
});