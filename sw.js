/*
 * DNVR News — service worker.
 * - App shell: precached, so the app opens instantly and works offline.
 * - API (wp-json): network-first with timeout, falling back to the last
 *   cached copy — fresh news when online, yesterday's news when not.
 * - Images: cache-first with a size cap.
 *
 * Bump VERSION on any deploy that changes app files.
 */
const VERSION = 'v1.3.0';
const SHELL_CACHE = 'dnvr-shell-' + VERSION;
const API_CACHE = 'dnvr-api-v1';
const IMG_CACHE = 'dnvr-img-v1';
const API_MAX_ENTRIES = 80;
const IMG_MAX_ENTRIES = 120;
const NETWORK_TIMEOUT_MS = 6000;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/demo-data.js',
  './js/api.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, API_CACHE, IMG_CACHE];
    for (const key of await caches.keys()) {
      if (!keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

function networkWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App navigation → cached shell (network falls back to cache, not vice
  // versa, so deploys propagate on next online load).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await networkWithTimeout(req, NETWORK_TIMEOUT_MS);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // WordPress API → network-first, cache fallback. MUST be checked before
  // the same-origin shell branch: when the API is same-origin (app hosted on
  // the WordPress domain, or the local dev mock), the shell branch's
  // cache-first would freeze API responses forever — and serve a member's
  // locked/unlocked state from whoever fetched first.
  if (url.pathname.includes('/wp-json/')) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const fresh = await networkWithTimeout(req, NETWORK_TIMEOUT_MS);
        if (fresh.ok) {
          cache.put(req, fresh.clone());
          trimCache(API_CACHE, API_MAX_ENTRIES);
        }
        return fresh;
      } catch (e) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw e;
      }
    })());
    return;
  }

  // Same-origin shell assets → cache-first.
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // Cross-origin images (article art from the site's CDN) → cache-first.
  if (req.destination === 'image') {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      cache.put(req, res.clone());
      trimCache(IMG_CACHE, IMG_MAX_ENTRIES);
      return res;
    })());
  }
});
