const CACHE_VERSION = 'compra-pro-test-v9';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './css/app.css',
  './css/capa-web.css',
  './js/app.js?v=20261109-test-v9',
  './js/pro-ui.js?v=20261111',
  './js/capa-web.js?v=20261111',
  './js/modulos.js?v=20261108-permissions-ui',
  './img/logo.png',
  './img/marca-agua.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Recursos versionados: caché primero; el cambio de CACHE_VERSION fuerza renovación.
  const versioned = url.searchParams.has('v') || /\\/img\\//.test(url.pathname);
  if (versioned) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // HTML: red primero para no dejar una versión antigua de la aplicación.
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});
