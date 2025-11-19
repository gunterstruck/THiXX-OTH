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
// Cache-Version - erhöht nach IndexedDB-Migration
const CORE_CACHE_NAME = 'thixx-oth-core-v110';
const DOC_CACHE_PREFIX = 'thixx-oth-docs';

// IndexedDB Configuration
const DB_NAME = 'thixx-oth-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-downloads';

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

// ============================================================
// IndexedDB Helper Functions (Service Worker)
// ============================================================

/**
 * Opens IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                console.log('[SW DB] Object store created:', STORE_NAME);
            }
        };
    });
}

/**
 * Get all pending downloads from IndexedDB
 * @returns {Promise<string[]>} Array of URLs
 */
async function getPendingDownloadsFromDB() {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result || [];
                const urls = items.map(item => item.url);
                console.log('[SW DB] Retrieved pending downloads:', urls);
                resolve(urls);
            };

            request.onerror = () => {
                console.error('[SW DB] Failed to get pending downloads:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('[SW DB] Failed to open database:', error);
        return [];
    }
}

/**
 * Remove a pending download from IndexedDB
 * @param {string} url - The URL to remove
 * @returns {Promise<void>}
 */
async function removePendingDownloadFromDB(url) {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const request = store.delete(url);

            request.onsuccess = () => {
                console.log('[SW DB] Removed from queue:', url);
                resolve();
            };

            request.onerror = () => {
                console.error('[SW DB] Failed to remove:', url, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error('[SW DB] Failed to remove pending download:', error);
    }
}

// ============================================================

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
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith((async () => {
            const allCacheNames = await caches.keys();
            const docCacheNames = allCacheNames.filter(name => name.startsWith(DOC_CACHE_PREFIX));
            const noCorsRequest = new Request(request.url, { mode: 'no-cors' });

            // 1. Versuche, die PDF aus allen Dokument-Caches zu finden
            for (const cacheName of docCacheNames) {
                const cache = await caches.open(cacheName);
                const cachedResponse = await cache.match(noCorsRequest);
                if (cachedResponse) {
                    console.log(`[SW] PDF aus Cache serviert: ${cacheName}`);
                    return cachedResponse;
                }
            }

            // 2. Nicht im Cache? Vom Netzwerk holen
            // WICHTIG: PDFs werden nur über die 'message'-Aktion gecacht
            console.log('[SW] PDF nicht im Cache, hole vom Netzwerk...');
            try {
                return await fetch(noCorsRequest);
            } catch (error) {
                console.log('[Service Worker] Netzwerk-Fetch für PDF fehlgeschlagen, zeige Offline-Seite.');
                return await caches.match('/THiXX-OTH/offline.html');
            }
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
                .then(() => {
                    console.log('[Service Worker] Document cached successfully:', event.data.url);
                    // Notify all clients that the document was cached
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'DOC_CACHED',
                            url: event.data.url
                        });
                    });
                })
                .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background Sync Event Handler
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Sync event received:', event.tag);

    if (event.tag === 'sync-pending-downloads') {
        event.waitUntil(syncPendingDownloads());
    }
});

async function syncPendingDownloads() {
    console.log('[Service Worker] Starting background sync for pending downloads...');

    try {
        // ✅ DIREKTER ZUGRIFF AUF IndexedDB - keine Client-Abhängigkeit mehr!
        const pendingDownloads = await getPendingDownloadsFromDB();

        if (pendingDownloads.length === 0) {
            console.log('[Service Worker] No pending downloads to sync');
            return;
        }

        console.log(`[Service Worker] Found ${pendingDownloads.length} pending download(s) from IndexedDB`);

        const tenant = 'default';
        const docCacheName = `${DOC_CACHE_PREFIX}-${tenant}`;
        const cache = await caches.open(docCacheName);

        let successCount = 0;

        for (const url of pendingDownloads) {
            try {
                const noCorsRequest = new Request(url, { mode: 'no-cors' });
                await cache.add(noCorsRequest);
                successCount++;
                console.log('[Service Worker] Successfully cached:', url);

                // ✅ Remove from IndexedDB after successful download
                await removePendingDownloadFromDB(url);

                // Notify clients if available (optional, not required)
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'DOC_SYNCED',
                        url: url
                    });
                });
            } catch (error) {
                console.error('[Service Worker] Failed to cache during sync:', url, error);
                // Keep in queue for retry on next sync
            }
        }

        console.log(`[Service Worker] Background sync completed: ${successCount}/${pendingDownloads.length} successful`);

        // Notify clients that sync is complete (optional)
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                successCount: successCount
            });
        });

    } catch (error) {
        console.error('[Service Worker] Background sync failed:', error);
    }
}










