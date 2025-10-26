const APP_CACHE_NAME = 'thixx-robust-v7-3'; // Version erhöht, um Update auszulösen
const DOC_CACHE_NAME = 'thixx-docs-v1';

/*
 * WICHTIG: Sicherstellen, dass alle hier gelisteten Pfade erreichbar sind.
 * Fehlende Dateien können die Service Worker-Installation beeinträchtigen,
 * auch wenn safeCacheAddAll einzelne Fehler abfängt.
 */
const APP_ASSETS_TO_CACHE = [
    '/THiXX-OTH/index.html',
    '/THiXX-OTH/offline.html',
    '/THiXX-OTH/assets/style.css',
    '/THiXX-OTH/assets/app.js',
    '/THiXX-OTH/assets/theme-bootstrap.js',
    '/THiXX-OTH/config.json',
    '/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png',
    '/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png',
    '/THiXX-OTH/assets/icon-192.png',
    '/THiXX-OTH/assets/icon-512.png',
    '/THiXX-OTH/lang/de.json',
    '/THiXX-OTH/lang/en.json',
    '/THiXX-OTH/lang/es.json',
    '/THiXX-OTH/lang/fr.json'
];

async function safeCacheAddAll(cache, urls) {
  console.log('[Service Worker] Starting robust caching of assets.');
  const promises = urls.map(url => {
    return cache.add(url).catch(err => {
      console.warn(`[Service Worker] Skipping asset: ${url} failed to cache.`, err);
    });
  });
  await Promise.all(promises);
  console.log(`[Service Worker] Robust caching finished.`);
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_CACHE_NAME)
            .then((cache) => safeCacheAddAll(cache, APP_ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== APP_CACHE_NAME && cacheName !== DOC_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // KORREKTUR (PRIO 1): PDF-Caching für 'no-cors' Anfragen (opaque responses).
    // Die 'response.ok' Prüfung wurde entfernt, da sie bei opaque responses immer fehlschlägt.
    // So werden externe PDFs korrekt gecacht und offline verfügbar gemacht.
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith(
            caches.open(DOC_CACHE_NAME).then(async (cache) => {
                const noCorsRequest = new Request(request.url, { mode: 'no-cors' });
                try {
                    const networkResponse = await fetch(noCorsRequest);
                    // Lege die (potenziell opaque) Antwort direkt in den Cache.
                    cache.put(noCorsRequest, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    console.log('[Service Worker] Network fetch for PDF failed, trying cache.');
                    const cachedResponse = await cache.match(noCorsRequest);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Wenn auch im Cache nichts ist, Fehler werfen.
                    throw error;
                }
            })
        );
        return;
    }
    
    // ÄNDERUNG: "Cache First" anstelle von "Network First" für Navigationen
    // Dies sorgt für einen sofortigen App-Start aus dem Cache.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
          const cachedResponse = await caches.match(request, { ignoreSearch: true });
          if (cachedResponse) {
            return cachedResponse;
          }

          try {
            const networkResponse = await fetch(request);
            // Optional: Hier könnte man die Antwort in den Cache legen, wenn sie noch nicht da ist.
            return networkResponse;
          } catch (error) {
            console.log('[Service Worker] Navigate fetch failed, falling back to offline page.');
            return await caches.match('/THiXX-OTH/offline.html');
          }
        })());
        return;
    }

    // Standard-Strategie "Stale-While-Revalidate" für alle anderen Assets
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                caches.open(APP_CACHE_NAME).then(cache => {
                    if (networkResponse.ok) {
                        cache.put(request, networkResponse.clone());
                    }
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'cache-doc') {
        event.waitUntil(
            caches.open(DOC_CACHE_NAME)
                .then(cache => cache.add(new Request(event.data.url, { mode: 'no-cors' })))
                .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});