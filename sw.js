const CACHE_NAME = 'ghs124nb-report-cards-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', event=>{
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached) return cached;

      return fetch(event.request).then(response=>{
        if(response && response.status === 200 && response.type === 'basic'){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(()=>{
        // Fallback for navigations when fully offline and not yet cached
        if(event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
