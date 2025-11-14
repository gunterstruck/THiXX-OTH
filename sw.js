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
// Cache-Version - erhöht nach weiteren Optimierungen (Origin-Check, Header-Handling, Error-Reporting)
const CORE_CACHE_NAME = 'thixx-oth-core-v15';
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
    `${REPO_PATH}lang/fr.json`
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
    // SICHERHEIT: Robuster Umgang mit cross-origin PDFs (opaque responses)
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith((async () => {
            const allCacheNames = await caches.keys();
            const docCacheNames = allCacheNames.filter(name => name.startsWith(DOC_CACHE_PREFIX));
            let pdfResponse = null;

            // 1. Versuche, die PDF aus allen Dokument-Caches zu finden
            // Cache-Match funktioniert mit beiden Request-Typen
            for (const cacheName of docCacheNames) {
                const cache = await caches.open(cacheName);
                pdfResponse = await cache.match(request);
                if (pdfResponse) {
                    console.log(`[SW] PDF aus Cache gefunden: ${cacheName}`);
                    break;
                }
            }

            // 2. Nicht im Cache? Vom Netzwerk holen
            if (!pdfResponse) {
                console.log('[SW] PDF nicht im Cache, hole vom Netzwerk...');
                try {
                    // Verwende originalen Request (keine mode-Änderung)
                    pdfResponse = await fetch(request);
                } catch (error) {
                    console.log('[Service Worker] Netzwerk-Fetch für PDF fehlgeschlagen, zeige Offline-Seite.');
                    return await caches.match(`${REPO_PATH}offline.html`);
                }
            }

            // 3. WICHTIG: Prüfe, ob Response opaque ist (cross-origin no-cors)
            if (pdfResponse && pdfResponse.type === 'opaque') {
                // Opaque Response: Kann nicht gelesen/modifiziert werden
                // Gebe sie direkt zurück (Content-Disposition kann nicht überschrieben werden)
                console.log('[SW] PDF ist cross-origin (opaque), gebe unmodifiziert zurück');
                return pdfResponse;
            }

            // 4. Same-Origin PDF: Header überschreiben für inline-Anzeige
            // Dies zwingt den Browser, die PDF anzuzeigen statt herunterzuladen
            if (pdfResponse) {
                try {
                    // Klonen, da der Body nur einmal gelesen werden kann
                    const pdfBody = await pdfResponse.clone().blob();

                    // Neue Header erstellen (bestehende beibehalten)
                    const headers = new Headers(pdfResponse.headers);
                    headers.set('Content-Type', 'application/pdf');
                    headers.set('Content-Disposition', 'inline'); // 'inline' statt 'attachment'

                    // Content-Length nur überschreiben, wenn nicht vorhanden
                    if (!headers.has('Content-Length')) {
                        headers.set('Content-Length', pdfBody.size);
                    }

                    // Encoding-Header entfernen, da wir den Body neu aufgebaut haben
                    headers.delete('Content-Encoding');

                    // Neue Response mit den modifizierten Headern zurückgeben
                    return new Response(pdfBody, {
                        status: 200,
                        statusText: 'OK',
                        headers: headers
                    });
                } catch (error) {
                    // Fallback: Bei Fehler beim Lesen des Body, gebe Original zurück
                    console.warn('[SW] Konnte PDF-Body nicht lesen, gebe Original zurück:', error);
                    return pdfResponse;
                }
            }

            // Fallback, sollte nie erreicht werden
            return await caches.match(`${REPO_PATH}offline.html`);
        })());
        return;
    }
    
    // Navigation-Requests - nur für eigenen Origin
    // Verhindert, dass der SW externe Navigationen abfängt
    if (request.mode === 'navigate' && url.origin === self.location.origin) {
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
                    // Verwende fetch statt cache.add für bessere Kontrolle
                    return fetch(url)
                        .then(response => {
                            if (response.ok || response.type === 'opaque') {
                                // Nur erfolgreiche oder opaque Responses cachen
                                return cache.put(url, response);
                            } else {
                                console.warn(`[SW Message] Nicht-OK Response für ${url}: ${response.status}`);
                            }
                        });
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
                    // Verwende fetch + put statt cache.add für bessere Kontrolle
                    return fetch(urlToCache)
                        .then(response => {
                            if (response.ok || response.type === 'opaque') {
                                // Nur erfolgreiche oder opaque Responses cachen
                                return cache.put(urlToCache, response);
                            } else {
                                throw new Error(`Non-OK response: ${response.status}`);
                            }
                        });
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











