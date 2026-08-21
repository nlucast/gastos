// sw.js — cache para que la app abra sin señal.
// Subí CACHE cuando cambies archivos, si no el celular sigue con la versión vieja.

const CACHE = 'gastos-v5';
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/app.js', './js/store.js', './js/calc.js', './js/model.js', './js/seed.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero, cache como respaldo: así una actualización se ve enseguida
// y sin señal sigue funcionando.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
