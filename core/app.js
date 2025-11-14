/**
 * APP CONTROLLER MODULE
 * Central controller that orchestrates branding, i18n, and schema modules
 */

(function(window) {
    'use strict';

    const AppController = {
        brand: null,
        initialized: false
    };

    /**
     * Main initialization function
     * Loads branding, translations, and schema in the correct order
     * @returns {Promise<void>}
     */
    async function initialize() {
        if (AppController.initialized) {
            console.warn('[AppController] Already initialized');
            return;
        }

        try {
            console.log('[AppController] Starting initialization...');

            // 1. Load branding configuration
            if (!window.BrandingEngine) {
                throw new Error('BrandingEngine module not loaded');
            }
            AppController.brand = await window.BrandingEngine.loadBrandConfig();
            const tenantId = window.BrandingEngine.getTenantId();

            // 2. Load translations (with tenant overrides)
            if (!window.I18N) {
                throw new Error('I18N module not loaded');
            }
            await window.I18N.loadTranslations(tenantId);

            // 3. Load schema (from brand config or default)
            if (!window.SchemaEngine) {
                throw new Error('SchemaEngine module not loaded');
            }
            window.SchemaEngine.loadSchema(AppController.brand);

            // 4. Apply branding to UI
            window.BrandingEngine.applyBranding(AppController.brand);

            // 5. Apply translations to DOM
            window.I18N.applyTranslations();

            AppController.initialized = true;
            console.log('[AppController] Initialization complete');

        } catch (error) {
            console.error('[AppController] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Gets the current brand configuration
     * @returns {Object|null}
     */
    function getCurrentBrand() {
        return AppController.brand;
    }

    /**
     * Checks if the app is initialized
     * @returns {boolean}
     */
    function isInitialized() {
        return AppController.initialized;
    }

    /**
     * Helper function to translate a key
     * Shortcut to I18N.t()
     * @param {string} key - Translation key
     * @param {Object} options - Translation options
     * @returns {string}
     */
    function t(key, options = {}) {
        if (window.I18N && typeof window.I18N.t === 'function') {
            return window.I18N.t(key, options);
        }
        return key;
    }

    /**
     * Helper function to apply theme
     * Shortcut to BrandingEngine.applyTheme()
     * @param {string} themeName - Theme name
     */
    function applyTheme(themeName) {
        if (window.BrandingEngine && typeof window.BrandingEngine.applyTheme === 'function') {
            window.BrandingEngine.applyTheme(themeName);
        }
    }

    /**
     * Builds a form using the schema engine
     * @param {HTMLFormElement} form - Form element
     */
    function buildForm(form) {
        if (window.SchemaEngine && typeof window.SchemaEngine.buildForm === 'function') {
            const schema = window.SchemaEngine.getCurrentSchema();
            window.SchemaEngine.buildForm(form, schema);
        }
    }

    /**
     * Encodes data to URL using schema engine
     * @param {Object} data - Data object
     * @param {string} baseUrl - Base URL
     * @returns {string}
     */
    function encodeUrl(data, baseUrl) {
        if (window.SchemaEngine && typeof window.SchemaEngine.encodeUrl === 'function') {
            return window.SchemaEngine.encodeUrl(data, baseUrl);
        }
        return baseUrl;
    }

    /**
     * Decodes URL parameters using schema engine
     * @param {URLSearchParams} params - URL parameters
     * @returns {Object}
     */
    function decodeUrl(params) {
        if (window.SchemaEngine && typeof window.SchemaEngine.decodeUrl === 'function') {
            return window.SchemaEngine.decodeUrl(params);
        }
        return {};
    }

    /**
     * Validates data using schema engine
     * @param {Object} data - Data to validate
     * @returns {Array<string>}
     */
    function validate(data) {
        if (window.SchemaEngine && typeof window.SchemaEngine.validate === 'function') {
            return window.SchemaEngine.validate(data);
        }
        return [];
    }

    /**
     * Renders data display using schema engine
     * @param {Object} data - Data to render
     * @param {HTMLElement} container - Container element
     */
    function renderDisplay(data, container) {
        if (window.SchemaEngine && typeof window.SchemaEngine.renderDisplay === 'function') {
            window.SchemaEngine.renderDisplay(data, container);
        }
    }

    /**
     * Gets document links from schema
     * @returns {Array}
     */
    function getDocumentLinks() {
        if (window.SchemaEngine && typeof window.SchemaEngine.getDocumentLinks === 'function') {
            return window.SchemaEngine.getDocumentLinks();
        }
        return [];
    }

    // Expose API
    window.AppController = {
        initialize,
        getCurrentBrand,
        isInitialized,
        // Helper shortcuts
        t,
        applyTheme,
        buildForm,
        encodeUrl,
        decodeUrl,
        validate,
        renderDisplay,
        getDocumentLinks
    };

})(window);
