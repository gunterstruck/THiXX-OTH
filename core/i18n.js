/**
 * I18N MODULE
 * Minimaler i18n-Loader mit Merge-Logik für Tenant-Overrides
 */

(function(window) {
    'use strict';

    // HINZUGEFÜGT: Der Pfad zu Ihrem Repository
    const REPO_PATH = '/THiXX-I/';

    const i18n = {
        translations: {},
        currentLang: 'de',
        tenantId: 'default'
    };

    /**
     * Lädt Core-Translations und optional Tenant-Overrides
     * @param {string} tenantId - Tenant-ID
     * @returns {Promise<void>}
     */
    async function loadTranslations(tenantId = 'default') {
        i18n.tenantId = tenantId;
        
        // Bestimme Sprache
        const lang = navigator.language.split('-')[0];
        const supportedLangs = ['de', 'en', 'es', 'fr'];
        i18n.currentLang = supportedLangs.includes(lang) ? lang : 'de';

        try {
            // 1. Lade Core-Translations
            // KORREKTUR: REPO_PATH verwenden
            const coreResponse = await fetch(`${REPO_PATH}core/lang/${i18n.currentLang}.json`);
            if (!coreResponse.ok) throw new Error(`Core translations not found`);
            i18n.translations = await coreResponse.json();

            // 2. Lade Tenant-Overrides (optional)
            try {
                // KORREKTUR: REPO_PATH verwenden
                const tenantResponse = await fetch(`${REPO_PATH}branding/${tenantId}/lang/${i18n.currentLang}.json`);
                if (tenantResponse.ok) {
                    const tenantOverrides = await tenantResponse.json();
                    // Merge: Tenant überschreibt Core
                    i18n.translations = { ...i18n.translations, ...tenantOverrides };
                    console.log(`[i18n] Tenant overrides loaded for: ${tenantId}`);
                }
            } catch (err) {
                // Kein Problem, Tenant-Overrides sind optional
                console.log(`[i18n] No tenant overrides for: ${tenantId}`);
            }

            document.documentElement.lang = i18n.currentLang;
        } catch (error) {
            console.error('[i18n] Could not load translations:', error);
            // Fallback auf leeres Objekt
            i18n.translations = {};
        }
    }

    /**
     * Übersetzt einen Key
     * @param {string} key - Translation-Key (z.B. "appTitle" oder "status.idle")
     * @param {Object} options - Optionen (z.B. { replace: { key: value } })
     * @returns {string}
     */
    function t(key, options = {}) {
        let text = key.split('.').reduce((obj, i) => obj?.[i], i18n.translations);
        
        if (!text) {
            console.warn(`[i18n] Translation not found for key: ${key}`);
            return key;
        }

        if (options.replace) {
            for (const [placeholder, value] of Object.entries(options.replace)) {
                text = text.replace(`{${placeholder}}`, value);
            }
        }

        return text;
    }

    /**
     * Wendet Translations auf DOM-Elemente an
     */
    function applyTranslations() {
        // Text-Content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });

        // Title-Attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });

        // Placeholder-Attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });

        // Page Title
        document.title = t('appTitle');
    }

    // Expose API
    window.I18N = {
        loadTranslations,
        t,
        applyTranslations,
        getCurrentLang: () => i18n.currentLang,
        getTenantId: () => i18n.tenantId
    };

})(window);
