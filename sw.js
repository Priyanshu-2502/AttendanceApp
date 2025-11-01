// Service Worker for Face Detection Attendance App
const CACHE_NAME = 'face-detection-app-v4';
const PRECACHE_URLS = [
  '/',
  'index.html',
  'script.js',
  'face-api.min.js',
  'manifest.json',
  'models/tiny_face_detector_model-weights_manifest.json',
  'models/tiny_face_detector_model-shard1.bin'
];

// Force immediate installation and activation
self.addEventListener('install', event => {
  console.log('Service Worker installing');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching app shell and content');
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(error => {
        console.error('Precaching failed:', error);
      })
  );
});

// Fetch event - improved strategy for mobile
self.addEventListener('fetch', event => {
  // Don't handle non-GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Special handling for same-origin requests
  if (url.origin === self.location.origin) {
    // For HTML documents - network first with cache fallback
    if (event.request.mode === 'navigate' || 
        (event.request.headers.get('accept') || '').includes('text/html')) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cache the latest version
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clonedResponse);
            });
            return response;
          })
          .catch(() => {
            return caches.match(event.request)
              .then(cachedResponse => {
                return cachedResponse || caches.match('index.html');
              });
          })
      );
      return;
    }
    
    // For model files and JS - cache first with network fallback
    if (event.request.url.includes('/models/') || 
        event.request.url.endsWith('.js')) {
      event.respondWith(
        caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            return fetch(event.request)
              .then(response => {
                // Cache the new response
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, clonedResponse);
                });
                return response;
              });
          })
      );
      return;
    }
  }
  
  // Default strategy - stale-while-revalidate
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Use cached response immediately if available
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            // Update cache with fresh response
            if (networkResponse.ok) {
              const clonedResponse = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, clonedResponse);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            console.log('Fetch failed; returning cached response or null');
            return cachedResponse;
          });
          
        return cachedResponse || fetchPromise;
      })
  );
});

// Activate event - cleanup old caches and take control immediately
self.addEventListener('activate', event => {
  console.log('Service Worker activating');
  const currentCaches = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
      })
      .then(cachesToDelete => {
        return Promise.all(cachesToDelete.map(cacheToDelete => {
          console.log('Deleting old cache:', cacheToDelete);
          return caches.delete(cacheToDelete);
        }));
      })
      .then(() => {
        console.log('Service Worker now controlling the page');
        return self.clients.claim();
      })
  );
});