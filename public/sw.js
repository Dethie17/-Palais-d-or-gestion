const CACHE = 'o-resto-v3-parent-fixes';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Purgé tous les caches d'anciennes versions : après une mise en ligne,
      // aucun appareil ne sert plus une page périmée depuis le stockage local.
      const names = await caches.keys();
      for (const n of names) if (n !== CACHE) await caches.delete(n);
      await clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
