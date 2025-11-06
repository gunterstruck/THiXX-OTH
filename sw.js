/**
 * SERVICE WORKER - OPTION B (EMPFOHLEN)
 * ======================================
 * Vereinfachte Strategie:
 * - Core-Assets: Ein gemeinsamer Cache (identisch für alle Tenants)
 * - Brand-Assets: Werden bei Bedarf gecacht (per Request)
 * - Dokumente: Tenant-spezifisch
 */

// NEU: REPO_PATH hier definiert, um ReferenceError zu beheben
const REPO_PATH = '/THiXX-I/';
// [FIX] Cache-Version erhöht, um bei allen Clients ein Update auszulösen
const CORE_CACHE_NAME = 'thixx-core-v45';
const DOC_CACHE_PREFIX = 'thixx-docs';


const CORE_ASSETS = [
    '/THiXX-I/offline.html',
    '/THiXX-I/index.html',
    '/THiXX-I/core/theme.css',
    '/THiXX-I/core/app.js',
    '/THiXX-I/core/i18n.js',
    '/THiXX-I/core/schema.js',
    // KORREKTUR: Bootstrap-Skript zum Precache hinzugefügt, damit es offline verfügbar ist.
    '/THiXX-I/core/theme-bootstrap.js',
    '/THiXX-I/core/lang/de.json',
    '/THiXX-I/core/lang/en.json',
    '/THiXX-I/core/lang/es.json',
    '/THiXX-I/core/lang/fr.json'
];

async function safeCacheAddAll(cache, urls) {
// ... existing code ...
    console.log('[Service Worker] Starting robust caching of assets.');
    const promises = urls.map(url => {
        return cache.add(url).catch(err => {
            console.warn(`[Service Worker] Skipping asset: ${url} failed to cache.`, err);
        });
    });
    await Promise.all(promises);
    console.log(`[Service Worker] Robust caching finished.`);
}

// [FIX 2] Diese Funktion wird nicht mehr benötigt, da der Referrer unzuverlässig ist.
// ... existing code ...
/*
function getTenantFromUrl(url) {
    try {
        const path = new URL(url).pathname;
// ... existing code ...
        const pathParts = path.replace(REPO_PATH, '').split('/');
        const tenantId = pathParts[0];
        
        if (tenantId && tenantId !== '') {
// ... existing code ...
            return tenantId;
        }
        return 'default';
    } catch {
// ... existing code ...
        return 'default';
    }
}
*/

self.addEventListener('install', (event) => {
// ... existing code ...
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CORE_CACHE_NAME)
            .then((cache) => safeCacheAddAll(cache, CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
// ... existing code ...
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
// ... existing code ...
                    // Behalte nur aktuelle Caches
                    if (cacheName !== CORE_CACHE_NAME && 
                        !cacheName.startsWith(DOC_CACHE_PREFIX)) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
// ... existing code ...
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
// ... existing code ...
    const { request } = event;
    const url = new URL(request.url);

    // [FIX 2] PDF-Caching-Logik überarbeitet.
// ... existing code ...
    // Verlässt sich nicht mehr auf 'referrer', um Mandanten-Isolation zu gewährleisten.
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith((async () => {
// ... existing code ...
            const allCacheNames = await caches.keys();
            const docCacheNames = allCacheNames.filter(name => name.startsWith(DOC_CACHE_PREFIX));
            const noCorsRequest = new Request(request.url, { mode: 'no-cors' });

            // 1. Versuche, die PDF aus ALLEN Mandanten-Caches zu finden.
// ... existing code ...
            // Dies stellt sicher, dass offline-gespeicherte PDFs gefunden werden,
            // egal welcher Mandant sie gespeichert hat (relevant für Offline-Nutzung).
            for (const cacheName of docCacheNames) {
// ... existing code ...
                const cache = await caches.open(cacheName);
                const cachedResponse = await cache.match(noCorsRequest);
                if (cachedResponse) {
// ... existing code ...
                    console.log(`[SW] PDF aus Cache serviert: ${cacheName}`);
                    return cachedResponse;
                }
            }

            // 2. Nicht im Cache? Vom Netzwerk holen.
// ... existing code ...
            // WICHTIG: Wir cachen hier NICHT mehr, da wir den korrekten
            // Mandanten-Kontext nicht kennen. Das Caching passiert
            // nur noch über die 'message'-Aktion von app.js.
            console.log('[SW] PDF nicht im Cache, hole vom Netzwerk...');
// ... existing code ...
            try {
                // Erneut 'no-cors' verwenden, falls das PDF extern liegt.
                return await fetch(noCorsRequest);
// ... existing code ...
            } catch (error) {
                console.log('[Service Worker] Netzwerk-Fetch für PDF fehlgeschlagen, zeige Offline-Seite.');
                // Fallback auf die Offline-Seite, wenn das PDF nicht geladen werden kann.
                return await caches.match('/THiXX-I/offline.html');
// ... existing code ...
            }
        })());
        return;
    }
    
    // Navigation-Requests
    if (request.mode === 'navigate') {
        // Mandantenspezifische HTML-Seiten (z. B. Datenschutzerklärung) direkt ausliefern
        if (url.pathname.startsWith(`${REPO_PATH}branding/`) && url.pathname.endsWith('.html')) {
            event.respondWith((async () => {
                const cache = await caches.open(CORE_CACHE_NAME);

                try {
                    const networkResponse = await fetch(request);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    console.log('[Service Worker] Navigate fetch failed for legal page, falling back to offline page.');
                    return await caches.match('/THiXX-I/offline.html');
                }
            })());
            return;
        }

        event.respondWith((async () => {
            // REPO_PATH ist jetzt hier verfügbar
            const indexRequest = new Request(`${REPO_PATH}index.html`);
            const cachedResponse = await caches.match(indexRequest);

            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(indexRequest);
                caches.open(CORE_CACHE_NAME).then(cache => {
                    cache.put(indexRequest, networkResponse.clone());
                });
                return networkResponse;
            } catch (error) {
                console.log('[Service Worker] Navigate fetch failed, falling back to offline page.');
                return await caches.match('/THiXX-I/offline.html');
            }
        })());
        return;
    }

    // Brand-Assets (/branding/{tenant}/*) - Cache on Demand
    if (url.pathname.startsWith('/THiXX-I/branding/')) {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(request).then(networkResponse => {
                    // Cache nur erfolgreiche Responses
                    if (networkResponse.ok) {
                        caches.open(CORE_CACHE_NAME).then(cache => {
                            cache.put(request, networkResponse.clone());
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // Alle anderen Assets: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                caches.open(CORE_CACHE_NAME).then(cache => {
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
// ... existing code ...
    // [FIX 2] Diese Logik ist jetzt der EINZIGE Weg, wie PDFs in den Cache geschrieben werden.
    // Sie hat den korrekten Mandanten-Kontext von der App.
    if (event.data && event.data.action === 'cache-doc') {
// ... existing code ...
        const tenant = event.data.tenant || 'default';
        const docCacheName = `${DOC_CACHE_PREFIX}-${tenant}`;
        
        event.waitUntil(
            caches.open(docCacheName)
                .then(cache => cache.add(new Request(event.data.url, { mode: 'no-cors' })))
                .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
// ... existing code ...
        self.skipWaiting();
    }
});
