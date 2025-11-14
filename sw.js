/**
 * SERVICE WORKER - OPTION B (EMPFOHLEN)
 * ======================================
 * Vereinfachte Strategie:
 * - Core-Assets: Ein gemeinsamer Cache (identisch für alle Tenants)
 * - Brand-Assets: Werden bei Bedarf gecacht (per Request)
 * - Dokumente: Tenant-spezifisch
 */

// REPO_PATH definiert für THiXX-OTH Projekt
const REPO_PATH = '/THiXX-OTH/';
// Cache-Version - erhöht nach PDF-inline-Fix
const CORE_CACHE_NAME = 'thixx-oth-core-v11';
const DOC_CACHE_PREFIX = 'thixx-oth-docs';

// Core Assets für Offline-Verfügbarkeit
const CORE_ASSETS = [
    '/THiXX-OTH/offline.html',
    '/THiXX-OTH/index.html',
    '/THiXX-OTH/style.css',
    '/THiXX-OTH/assets/style.css',
    '/THiXX-OTH/assets/offline.css',
    '/THiXX-OTH/assets/datenschutz.css',
    '/THiXX-OTH/assets/app.js',
    '/THiXX-OTH/assets/theme-bootstrap.js',
    '/THiXX-OTH/assets/datenschutz.html',
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
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CORE_CACHE_NAME)
            .then((cache) => safeCacheAddAll(cache, CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Behalte nur aktuelle Caches
                    if (cacheName !== CORE_CACHE_NAME &&
                        !cacheName.startsWith(DOC_CACHE_PREFIX)) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
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

    // PDF-Caching-Logik - PDFs werden bei Bedarf gecacht
    // MODIFIZIERT: PDFs werden mit 'inline' statt 'attachment' ausgeliefert
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith((async () => {
            const allCacheNames = await caches.keys();
            const docCacheNames = allCacheNames.filter(name => name.startsWith(DOC_CACHE_PREFIX));
            const noCorsRequest = new Request(request.url, { mode: 'no-cors' });
            let sourceNetwork = false;
            let pdfResponse = null;

            // 1. Versuche, die PDF aus allen Dokument-Caches zu finden
            for (const cacheName of docCacheNames) {
                const cache = await caches.open(cacheName);
                pdfResponse = await cache.match(noCorsRequest);
                if (pdfResponse) {
                    console.log(`[SW] PDF aus Cache gefunden: ${cacheName}`);
                    break;
                }
            }

            // 2. Nicht im Cache? Vom Netzwerk holen
            if (!pdfResponse) {
                console.log('[SW] PDF nicht im Cache, hole vom Netzwerk...');
                try {
                    pdfResponse = await fetch(noCorsRequest);
                    sourceNetwork = true; // Merken, dass es vom Netzwerk kam
                } catch (error) {
                    console.log('[Service Worker] Netzwerk-Fetch für PDF fehlgeschlagen, zeige Offline-Seite.');
                    return await caches.match('/THiXX-OTH/offline.html');
                }
            }

            // 3. WICHTIG: Neue Response erstellen, um Header zu überschreiben
            // Dies zwingt den Browser, die PDF anzuzeigen statt herunterzuladen.
            if (pdfResponse) {
                // Klonen, da der Body nur einmal gelesen werden kann
                const pdfBody = await pdfResponse.clone().blob();

                // Neue Header erstellen
                const headers = new Headers({
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': 'inline', // 'inline' statt 'attachment'
                    'Content-Length': pdfBody.size
                });

                // Bei Netzwerk-Antworten den ETag beibehalten, falls vorhanden
                if(sourceNetwork && pdfResponse.headers.has('etag')) {
                     headers.set('ETag', pdfResponse.headers.get('etag'));
                }

                // Neue Response mit den modifizierten Headern zurückgeben
                return new Response(pdfBody, {
                    status: 200,
                    statusText: 'OK',
                    headers: headers
                });
            }

            // Fallback, sollte nie erreicht werden
            return await caches.match('/THiXX-OTH/offline.html');
        })());
        return;
    }
    
    // Navigation-Requests
    if (request.mode === 'navigate') {
        // HTML-Seiten aus assets/ (z.B. Datenschutzerklärung)
        if (url.pathname.startsWith(`${REPO_PATH}assets/`) && url.pathname.endsWith('.html')) {
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
                    return await caches.match('/THiXX-OTH/offline.html');
                }
            })());
            return;
        }

        event.respondWith((async () => {
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
                return await caches.match('/THiXX-OTH/offline.html');
            }
        })());
        return;
    }

    // Assets - Cache on Demand
    if (url.pathname.startsWith('/THiXX-OTH/assets/')) {
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
    // PDFs werden über diese Nachricht in den Cache geschrieben
    if (event.data && event.data.action === 'cache-doc') {
        const tenant = event.data.tenant || 'default';
        const docCacheName = `${DOC_CACHE_PREFIX}-${tenant}`;

        event.waitUntil(
            caches.open(docCacheName)
                .then(cache => cache.add(new Request(event.data.url, { mode: 'no-cors' })))
                .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * Background Sync Event Handler
 * Automatically caches documents when the device comes back online
 * Supports Android Chrome's native Background Sync API
 */
self.addEventListener('sync', (event) => {
    console.log('[SW] Sync event received:', event.tag);

    // Check if this is a document cache sync event
    if (event.tag.startsWith('cache-doc:')) {
        // Extract URL from the tag name
        const urlToCache = event.tag.substring('cache-doc:'.length);

        // Tenant is 'default' for THiXX-OTH
        const tenant = 'default';
        const docCacheName = `${DOC_CACHE_PREFIX}-${tenant}`;

        console.log(`[SW Sync] Attempting to cache ${urlToCache} for tenant ${tenant}`);

        // Tell the browser to wait for the caching operation to complete
        event.waitUntil(
            caches.open(docCacheName)
                .then(cache => {
                    console.log(`[SW Sync] Caching ${urlToCache} in ${docCacheName}`);
                    return cache.add(new Request(urlToCache, { mode: 'no-cors' }));
                })
                .then(() => {
                    console.log(`[SW Sync] Successfully cached ${urlToCache}`);
                    // Notify all clients that the document was cached
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'doc-cached',
                            url: urlToCache
                        });
                    });
                })
                .catch(err => {
                    console.error('[SW Sync] Failed to cache document:', urlToCache, err);
                    // Throw error to retry sync later
                    throw err;
                })
        );
    }
});









