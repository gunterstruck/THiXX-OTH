--- /ThiXX/sw.js
+++ /core/sw.js
@@ -1,24 +1,26 @@
-const APP_CACHE_NAME = 'thixx-robust-v7-8';
+// Cache-Name wird dynamisch mit tenantId erweitert
+const APP_CACHE_NAME = 'thixx-core-v1';
 const DOC_CACHE_NAME = 'thixx-docs-v1';
 
 const APP_ASSETS_TO_CACHE = [
-    '/ThiXX/index.html',
-    '/ThiXX/offline.html',
-    '/ThiXX/assets/style.css',
-    '/ThiXX/assets/app.js',
-    '/ThiXX/assets/theme-bootstrap.js',
-    '/ThiXX/config.json',
-    '/ThiXX/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png',
-    '/ThiXX/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png',
-    '/ThiXX/assets/icon-192.png',
-    '/ThiXX/assets/icon-512.png',
-    '/ThiXX/lang/de.json',
-    '/ThiXX/lang/en.json',
-    '/ThiXX/lang/es.json',
-    '/ThiXX/lang/fr.json'
+    '/index.html',
+    '/offline.html',
+    '/core/theme.css',
+    '/core/app.js',
+    '/core/i18n.js',
+    '/core/schema.js',
+    '/core/theme-bootstrap.js',
+    '/core/lang/de.json',
+    '/core/lang/en.json',
+    '/core/lang/es.json',
+    '/core/lang/fr.json'
 ];
 
+// Tenant-spezifischer Cache wird zur Laufzeit bestimmt
+function getTenantCacheName() {
+    // Wird bei Installation aus URL-Parameter ermittelt
+    return `${APP_CACHE_NAME}-${self.tenantId || 'default'}`;
+}
+
 async function safeCacheAddAll(cache, urls) {
   console.log('[Service Worker] Starting robust caching of assets.');
@@ -32,9 +34,10 @@ async function safeCacheAddAll(cache, urls) {
 
 self.addEventListener('install', (event) => {
     event.waitUntil(
-        caches.open(APP_CACHE_NAME)
+        caches.open(getTenantCacheName())
             .then((cache) => safeCacheAddAll(cache, APP_ASSETS_TO_CACHE))
             .then(() => self.skipWaiting())
     );
 });
 
@@ -43,7 +46,7 @@ self.addEventListener('activate', (event) => {
         caches.keys().then((cacheNames) => {
             return Promise.all(
                 cacheNames.map((cacheName) => {
-                    if (cacheName !== APP_CACHE_NAME && cacheName !== DOC_CACHE_NAME) {
+                    if (!cacheName.startsWith('thixx-core-') && !cacheName.startsWith('thixx-docs-')) {
                         return caches.delete(cacheName);
                     }
                 })
@@ -55,8 +58,9 @@ self.addEventListener('fetch', (event) => {
     const { request } = event;
     const url = new URL(request.url);
 
-    // PDF-Caching für 'no-cors' Anfragen
+    // PDF-Caching für 'no-cors' Anfragen (funktioniert mit Array von URLs)
     if (url.pathname.endsWith('.pdf')) {
         event.respondWith(
-            caches.open(DOC_CACHE_NAME).then(async (cache) => {
+            caches.open(`${DOC_CACHE_NAME}-${self.tenantId || 'default'}`).then(async (cache) => {
                 const noCorsRequest = new Request(request.url, { mode: 'no-cors' });
@@ -82,7 +86,7 @@ self.addEventListener('fetch', (event) => {
     if (request.mode === 'navigate') {
         event.respondWith((async () => {
           const cachedResponse = await caches.match(request, { ignoreSearch: true });
           if (cachedResponse) {
             return cachedResponse;
           }
@@ -92,7 +96,7 @@ self.addEventListener('fetch', (event) => {
             return networkResponse;
           } catch (error) {
             console.log('[Service Worker] Navigate fetch failed, falling back to offline page.');
-            return await caches.match('/ThiXX/offline.html');
+            return await caches.match('/offline.html');
           }
         })());
         return;
@@ -102,7 +106,7 @@ self.addEventListener('fetch', (event) => {
     event.respondWith(
         caches.match(request).then(cachedResponse => {
             const fetchPromise = fetch(request).then(networkResponse => {
-                caches.open(APP_CACHE_NAME).then(cache => {
+                caches.open(getTenantCacheName()).then(cache => {
                     if (networkResponse.ok) {
                         cache.put(request, networkResponse.clone());
                     }
@@ -116,7 +120,11 @@ self.addEventListener('fetch', (event) => {
 self.addEventListener('message', (event) => {
     if (event.data && event.data.action === 'cache-doc') {
         event.waitUntil(
-            caches.open(DOC_CACHE_NAME)
+            caches.open(`${DOC_CACHE_NAME}-${self.tenantId || 'default'}`)
                 .then(cache => cache.add(new Request(event.data.url, { mode: 'no-cors' })))
                 .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
         );
     } else if (event.data && event.data.type === 'SKIP_WAITING') {
         self.skipWaiting();
+    } else if (event.data && event.data.type === 'SET_TENANT') {
+        self.tenantId = event.data.tenantId;
+        console.log('[Service Worker] Tenant set to:', self.tenantId);
     }
 });