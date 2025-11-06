/**
 * THEME BOOTSTRAP ENHANCED (Anti-Flicker Version)
 * Lädt vor dem Rendern Theme + Brand-Farben synchron
 * PLUS: Setzt den korrekten statischen Manifest-Link.
 *
 * KORRIGIERTE VERSION:
 * 1. Diese Datei wird nun extern geladen (CSP-konform).
 * 2. Die Logik prüft ERST die brand.json und setzt DANN den Manifest-Link,
 * um den Fallback-Fehler zu beheben.
 */
(function() {
    try {
        const REPO_PATH = '/THiXX-I/';
        const STORAGE_KEY = 'thixx-tenant';

        // --- MANDANTEN-ERKENNUNG (aus index.html übernommen) ---
        let tenantId = 'default';
        let tenantFound = false;
        const params = new URLSearchParams(window.location.search);

        // PRIORITÄT 1: URL-Parameter (?tenant=...)
        if (params.has('tenant')) {
            const candidate = (params.get('tenant') || '').trim();
            if (candidate) {
                tenantId = candidate;
                tenantFound = true;
            }
        }

        // PRIORITÄT 2: URL-Pfad (z.B. /peterpohl/)
        if (!tenantFound) {
            const path = window.location.pathname;
            let normalizedPath = path;
            if (normalizedPath.startsWith(REPO_PATH)) {
                normalizedPath = normalizedPath.slice(REPO_PATH.length);
            } else {
                normalizedPath = normalizedPath.replace(/^\/+/, '');
            }
            const pathParts = normalizedPath.split('/').filter(Boolean);
            const possibleTenant = pathParts[0];
            if (possibleTenant && possibleTenant !== 'index.html' && possibleTenant !== '404.html') {
                tenantId = possibleTenant;
                tenantFound = true;
            }
        }

        // PRIORITÄT 3: Local Storage (Letzte Sitzung)
        if (!tenantFound) {
            try {
                const storedTenant = localStorage.getItem(STORAGE_KEY);
                if (storedTenant) {
                    tenantId = storedTenant;
                    tenantFound = true;
                }
            } catch (storageError) {
                console.warn('[Theme Bootstrap] Unable to read persisted tenant:', storageError);
            }
        }

        // Speichere den erkannten Mandanten (wird ggf. später korrigiert)
        try {
            localStorage.setItem(STORAGE_KEY, tenantId);
        } catch (storageError) {
            console.warn('[Theme Bootstrap] Unable to persist tenant:', storageError);
        }
        
        // --- KORRIGIERTE LOGIK FÜR MANIFEST & THEME ---

        const request = new XMLHttpRequest();
        let brand = null;

        // Hilfsfunktion zum synchronen Laden der Konfiguration
        function loadBrandConfig(id) {
            request.open('GET', `${REPO_PATH}branding/${id}/brand.json`, false);
            request.send(null);
            if (request.status === 200) {
                try {
                    return JSON.parse(request.responseText);
                } catch (e) {
                    console.warn(`[Theme Bootstrap] Brand parsing failed for ${id}:`, e);
                }
            }
            return null;
        }
        
        // 1. VERSUCH: Angeforderten Mandanten laden
        brand = loadBrandConfig(tenantId);
        
        // 2. FALLBACK: Bei Fehler auf 'default' zurückfallen
        if (!brand) {
            if (tenantId !== 'default') {
                console.warn(`[Theme Bootstrap] brand.json für '${tenantId}' nicht gefunden, lade 'default'.`);
                tenantId = 'default'; // WICHTIG: tenantId hier korrigieren
                brand = loadBrandConfig(tenantId);
            }
        }

        // 3. FINALER FALLBACK: Wenn selbst 'default' fehlt (z.B. lokaler Fehler)
        if (!brand) {
            brand = {
                theme: 'customer-brand',
                brandColors: { primary: '#d54b2a', secondary: '#6C6B66' }
            };
        }

        // 4. Mandanten-ID global setzen (NACHDEM der Fallback geprüft wurde)
        window.TENANT_ID = tenantId;
        // Ggf. korrigierten Mandanten speichern
        // KORREKTUR: Gekapselt in try...catch für Safari Private Mode
        try {
            localStorage.setItem(STORAGE_KEY, tenantId);
        } catch (storageError) {
            console.warn('[Theme Bootstrap] Unable to persist *fallback* tenant:', storageError);
        }


        // 5. Manifest-Link setzen (NACHDEM der Fallback geprüft wurde)
        let link = document.getElementById('manifest-link') 
                || document.querySelector('link[rel="manifest"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'manifest';
          link.id  = 'manifest-link';
          document.head.prepend(link);
        }
        // Setzt den Link auf den *finalen*, validierten Mandanten-Pfad
        link.href = `${REPO_PATH}branding/${tenantId}/manifest.webmanifest`;

        
        // 6. Anti-Flicker-Theme-Logik (unverändert)
        document.documentElement.setAttribute('data-theme', brand.theme || 'customer-brand');

        if (brand.brandColors) {
            const root = document.documentElement;
            root.style.setProperty('--primary-color-override', brand.brandColors.primary);
            root.style.setProperty('--primary-dark-override', adjustColor(brand.brandColors.primary, -20));
            root.style.setProperty('--primary-light-override', adjustColor(brand.brandColors.primary, 20));
            if (brand.brandColors.secondary) {
                root.style.setProperty('--secondary-color-override', brand.brandColors.secondary);
            }
        }

        document.documentElement.classList.add('theme-loaded');

        // Farbe anpassen (Hilfsfunktion)
        function adjustColor(color, percent) {
            try {
                let R = parseInt(color.substring(1, 3), 16);
                let G = parseInt(color.substring(3, 5), 16);
                let B = parseInt(color.substring(5, 7), 16);

                R = Math.min(255, Math.max(0, parseInt(R * (100 + percent) / 100)));
                G = Math.min(255, Math.max(0, parseInt(G * (100 + percent) / 100)));
                B = Math.min(255, Math.max(0, parseInt(B * (100 + percent) / 100)));

                return '#' + [R,G,B].map(x => x.toString(16).padStart(2,'0')).join('');
            } catch {
                return color;
            }
        }

    } catch (e) {
        console.error('[Theme Bootstrap] Init failed:', e);
        // Minimaler Fallback, damit die Seite nicht komplett unbenutzbar ist
        document.documentElement.setAttribute('data-theme', 'customer-brand');
        document.documentElement.classList.add('theme-loaded');
        window.TENANT_ID = 'default';
    }
})();

