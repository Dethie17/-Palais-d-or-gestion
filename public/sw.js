/*
 * Service worker O RESTO.
 *
 * Objectif : application installable et page « hors ligne » utile, sans
 * jamais servir une version périmée de l'application. Les navigations et les
 * fichiers non hachés restent en réseau d'abord ; seuls les assets hachés par
 * Vite (/assets/…) sont mis en cache, puisque leur nom change à chaque build.
 */
const VERSION = 'o-resto-v5';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge tous les caches des versions précédentes.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== STATIC_CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/');
}

async function networkFirst(request, offlineFallback = false) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback ? (await cache.match(OFFLINE_URL)) || Response.error() : Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Jamais de cache pour une autre origine (Supabase, images externes) ni
  // pour l'API : les soldes et les sessions doivent toujours être frais.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Fichiers stables (icônes, manifeste) : réseau d'abord, cache en secours.
  if (/\.(?:css|js|png|jpe?g|svg|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});
