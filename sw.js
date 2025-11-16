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
// Cache-Version - v18: Fix Offline PDF-Caching (Network-First mit automatischem Caching wie PPS)
const CORE_CACHE_NAME = 'thixx-oth-core-v18';
const DOC_CACHE_PREFIX = 'thixx-oth-docs';

// Core Assets für Offline-Verfügbarkeit
const CORE_ASSETS = [
    `${REPO_PATH}offline.html`,
    `${REPO_PATH}index.html`,
    `${REPO_PATH}style.css`,
    `${REPO_PATH}assets/style.css`,
    `${REPO_PATH}assets/offline.css`,
    `${REPO_PATH}assets/datenschutz.css`,
    `${REPO_PATH}assets/app.js`,
    `${REPO_PATH}assets/theme-bootstrap.js`,
    `${REPO_PATH}assets/datenschutz.html`,
    `${REPO_PATH}lang/de.json`,
    `${REPO_PATH}lang/en.json`,
    `${REPO_PATH}lang/es.json`,
    `${REPO_PATH}lang/fr.json`,
    // Mandanten-spezifische Rechtsseiten
    `${REPO_PATH}branding/othimm/datenschutz.html`,
    `${REPO_PATH}branding/othimm/impressum.html`,
    `${REPO_PATH}branding/peterpohl/datenschutz.html`,
    `${REPO_PATH}branding/peterpohl/impressum.html`,
    `${REPO_PATH}branding/sigx/datenschutz.html`,
    `${REPO_PATH}branding/sigx/impressum.html`,
    `${REPO_PATH}branding/thixx_standard/datenschutz.html`,
    `${REPO_PATH}branding/thixx_standard/impressum.html`
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

    // PDF-Caching-Logik - Network-First mit automatischem Caching
    // Basiert auf PPS-Implementierung für konsistente Offline-Verfügbarkeit
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith(
            caches.open(`${DOC_CACHE_PREFIX}-default`).then(async (cache) => {
                // Verwende no-cors Request für konsistentes Caching
                const noCorsRequest = new Request(request.url, { mode: 'no-cors' });

                try {
                    // NETWORK FIRST: Versuche vom Netzwerk zu laden
                    console.log('[SW] Lade PDF vom Netzwerk:', request.url);
                    const networkResponse = await fetch(noCorsRequest);

                    // SOFORT CACHEN: Speichere PDF für Offline-Verfügbarkeit
                    cache.put(noCorsRequest, networkResponse.clone());
                    console.log('[SW] PDF erfolgreich gecacht:', request.url);

                    return networkResponse;
                } catch (error) {
                    // CACHE FALLBACK: Bei Netzwerkfehler aus Cache laden
                    console.log('[SW] Netzwerk-Fetch fehlgeschlagen, versuche Cache...');
                    const cachedResponse = await cache.match(noCorsRequest);

                    if (cachedResponse) {
                        console.log('[SW] PDF aus Cache geladen:', request.url);
                        return cachedResponse;
                    }

                    // Kein Cache verfügbar: Zeige Offline-Seite
                    console.log('[SW] PDF nicht im Cache, zeige Offline-Seite');
                    return await caches.match(`${REPO_PATH}offline.html`);
                }
            })
        );
        return;
    }
    
    // Navigation-Requests - nur für eigenen Origin
    // Verhindert, dass der SW externe Navigationen abfängt
    if (request.mode === 'navigate' && url.origin === self.location.origin) {
        // HTML-Seiten aus assets/ oder branding/ (z.B. Datenschutzerklärung, Impressum)
        const isAssetHtml = url.pathname.startsWith(`${REPO_PATH}assets/`) && url.pathname.endsWith('.html');
        const isBrandingHtml = url.pathname.startsWith(`${REPO_PATH}branding/`) && url.pathname.endsWith('.html');

        if (isAssetHtml || isBrandingHtml) {
            event.respondWith((async () => {
                const cache = await caches.open(CORE_CACHE_NAME);

                try {
                    // Network First: Lade vom Netzwerk und aktualisiere Cache
                    const networkResponse = await fetch(request);
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    // Fallback: Versuche aus Cache
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    console.log('[Service Worker] Navigate fetch failed for static HTML, falling back to offline page.');
                    return await caches.match(`${REPO_PATH}offline.html`);
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
                return await caches.match(`${REPO_PATH}offline.html`);
            }
        })());
        return;
    }

    // Assets - Cache on Demand
    if (url.pathname.startsWith(`${REPO_PATH}assets/`)) {
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
        const url = event.data.url;

        console.log(`[SW Message] Cache-Anfrage für: ${url}`);

        event.waitUntil(
            caches.open(docCacheName)
                .then(cache => {
                    // Verwende no-cors Request für konsistentes Caching (wie im Fetch Handler)
                    const noCorsRequest = new Request(url, { mode: 'no-cors' });
                    return cache.add(noCorsRequest);
                })
                .catch(err => {
                    console.error('[SW Message] Dokument-Caching fehlgeschlagen:', url, err);
                })
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
    console.log('[SW Sync] Sync event received:', event.tag);

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
                    // Verwende no-cors Request für konsistentes Caching (wie im Fetch Handler)
                    const noCorsRequest = new Request(urlToCache, { mode: 'no-cors' });
                    return cache.add(noCorsRequest);
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

                    // Informiere Clients über Fehler
                    return self.clients.matchAll().then(clients => {
                        clients.forEach(client => {
                            client.postMessage({
                                type: 'doc-cache-failed',
                                url: urlToCache,
                                error: err.message
                            });
                        });
                    }).then(() => {
                        // Throw error to retry sync later
                        throw err;
                    });
                })
        );
    }
});











