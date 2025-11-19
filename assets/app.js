document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and Constants ---
    const SCOPE = '/THiXX-OTH/';
    const BASE_URL = new URL('index.html', location.origin + SCOPE).href;
    const CONFIG = {
        COOLDOWN_DURATION: 2000,
        WRITE_SUCCESS_GRACE_PERIOD: 2500,
        WRITE_RETRY_DELAY: 200,
        MAX_PAYLOAD_SIZE: 880,
        DEBOUNCE_DELAY: 300,
        MAX_LOG_ENTRIES: 15,
        NFC_WRITE_TIMEOUT: 5000,
        MAX_WRITE_RETRIES: 3,
        BASE_URL: BASE_URL,
        SAFETY_BUFFER_PX: 10,
        URL_REVOKE_DELAY: 100
    };

    // --- Application State ---
    const appState = {
        translations: {}, isNfcActionActive: false, isCooldownActive: false,
        abortController: null, scannedDataObject: null, eventLog: [],
        nfcTimeoutId: null, gracePeriodTimeoutId: null,
    };

    // --- Design Templates ---
    const designs = {
        'thixx_standard': { appName: "ThiXX NFC Tool", short_name: "ThiXX", theme: "dark", lockTheme: false, icons: { icon192: "/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png", icon512: "/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png" }, brandColors: { primary: "#f04e37", secondary: "#6c6b66" } },
'peterpohl': { 
    appName: "Peter Pohl NFC Tool", 
    short_name: "Peter Pohl", 
    theme: "customer-brand", 
    lockTheme: false, 
    icons: { 
        icon192: "/THiXX-OTH/assets/PP-192x192.png", 
        icon512: "/THiXX-OTH/assets/PP-512x512.png" 
    }, 
    brandColors: { 
        primary: "#00457D", 
        secondary: "#FFEC00" 
    } 
},
        'sigx': { appName: "THiXX NFC Tool", short_name: "THiXX", theme: "customer-brand", lockTheme: false, icons: { icon192: "/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png", icon512: "/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png" }, brandColors: { primary: "#5865F2", secondary: "#3d3d3d" } },
        'othimm': { appName: "O.Thimm NFC Tool", short_name: "O.Thimm", theme: "customer-brand", lockTheme: false, icons: { icon192: "/THiXX-OTH/assets/icon-192.png", icon512: "/THiXX-OTH/assets/icon-512.png" }, brandColors: { primary: "#d54b2a", secondary: "#6C6B66" } }
    };

    // --- DOM Element References ---
    const headerElement = document.querySelector('header');
    const tabsContainer = document.querySelector('.tabs');
    const tabContents = document.querySelectorAll('.tab-content');
    const nfcStatusBadge = document.getElementById('nfc-status-badge');
    const copyToFormBtn = document.getElementById('copy-to-form-btn');
    const saveJsonBtn = document.getElementById('save-json-btn');
    const loadJsonInput = document.getElementById('load-json-input');
    const loadJsonLabel = document.getElementById('load-json-label');
    const nfcFallback = document.getElementById('nfc-fallback');
    const messageBanner = document.getElementById('message-banner');
    const form = document.getElementById('nfc-write-form');
    const payloadOutput = document.getElementById('payload-output');
    const payloadSize = document.getElementById('payload-size');
    const readResultContainer = document.getElementById('read-result');
    const protocolCard = document.getElementById('protocol-card');
    const rawDataOutput = document.getElementById('raw-data-output');
    const readActions = document.getElementById('read-actions');
    const themeSwitcher = document.querySelector('.theme-switcher');
    const docLinkContainer = document.getElementById('doc-link-container');
    const legalInfoContainer = document.getElementById('legal-info');
    const eventLogOutput = document.getElementById('event-log-output');
    const updateBanner = document.getElementById('update-banner');
    const reloadButton = document.getElementById('reload-button');
    const checkForUpdateBtn = document.getElementById('check-for-update-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');

    // --- Data Mapping ---
    const fieldMap = { 'HK-Nr': 'HK', 'KKS': 'KKS', 'Leistung': 'P', 'Strom': 'I', 'Spannung': 'U', 'Widerstand': 'R', 'Regler': 'Reg', 'Sicherheitsregler/Begrenzer': 'Sich', 'Wächter': 'Wäch', 'Projekt-Nr': 'Proj', 'Anzahl Heizkabeleinheiten': 'Anz', 'Trennkasten': 'TB', 'Heizkabeltyp': 'HKT', 'Schaltung': 'Sch', 'PT 100': 'PT100', 'NiCr-Ni': 'NiCr', 'geprüft von': 'Chk', 'am': 'Date', 'Dokumentation': 'Doc' };
    const reverseFieldMap = Object.fromEntries(Object.entries(fieldMap).map(([k, v]) => [v, k]));

    // --- Utility Functions ---
    const debounce = (func, wait) => { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func.apply(this, args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
    function isValidDocUrl(url) { if (!url || typeof url !== 'string') return false; try { const parsed = new URL(url); return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')); } catch { return false; } }
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // --- Internationalization (i18n) ---
    function t(key, options = {}) { let text = key.split('.').reduce((obj, i) => obj?.[i], appState.translations); if (!text) { console.warn(`Translation not found for key: ${key}`); return key; } if (options.replace) { for (const [placeholder, value] of Object.entries(options.replace)) { text = text.replace(`{${placeholder}}`, value); } } return text; }
    async function loadTranslations() { const lang = navigator.language.split('-')[0]; const supportedLangs = ['de', 'en', 'es', 'fr']; const selectedLang = supportedLangs.includes(lang) ? lang : 'de'; const path = `/THiXX-OTH/lang/${selectedLang}.json`; try { const response = await fetch(path); if (!response.ok) throw new Error(`Language file for ${selectedLang} not found at ${path}`); appState.translations = await response.json(); document.documentElement.lang = selectedLang; } catch (error) { console.error('Could not load translations, falling back to German.', error); try { const fallbackPath = `/THiXX-OTH/lang/de.json`; const response = await fetch(fallbackPath); appState.translations = await response.json(); document.documentElement.lang = 'de'; } catch (fallbackError) { console.error('Could not load fallback German translations.', fallbackError); } } }
    function applyTranslations() { document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); }); document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); }); document.title = t('appTitle'); }

    // --- Error Handling ---
    /**
     * Global error handler for unhandled errors and promise rejections
     */
    class ErrorHandler {
        static handle(error, context = 'General') {
            const readableError = this.getReadableError(error);
            console.error(`[${context}]`, error);
            showMessage(readableError, 'err');
            addLogEntry(`${context}: ${readableError}`, 'err');
            return readableError;
        }

        static getReadableError(error) {
            const errorMap = {
                'NotAllowedError': 'errors.NotAllowedError',
                'NotSupportedError': 'errors.NotSupportedError',
                'NotFoundError': 'errors.NotFoundError',
                'NotReadableError': 'errors.NotReadableError',
                'NetworkError': 'errors.NetworkError',
                'AbortError': 'errors.AbortError',
                'TimeoutError': 'errors.WriteTimeoutError'
            };
            if (error.name === 'NetworkError' && generateUrlFromForm().length > CONFIG.MAX_PAYLOAD_SIZE) {
                return t('messages.payloadTooLarge');
            }
            if (errorMap[error.name]) {
                return t(errorMap[error.name]);
            }
            return error.message || t('errors.unknown');
        }

        /**
         * Initialize global error handlers
         */
        static initGlobalHandlers() {
            window.addEventListener('error', (event) => {
                console.error('[Global Error]', event.error);
                if (event.error) {
                    ErrorHandler.handle(event.error, 'UncaughtError');
                }
                event.preventDefault();
            });

            window.addEventListener('unhandledrejection', (event) => {
                console.error('[Unhandled Promise Rejection]', event.reason);
                const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
                ErrorHandler.handle(error, 'UnhandledPromise');
                event.preventDefault();
            });
        }
    }

    // --- App Initialization ---
    /**
     * Loads application configuration from config.json
     * @returns {Promise<Object>} Configuration object with design settings
     */
    async function loadConfig() { try { const response = await fetch('/THiXX-OTH/config.json'); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); return await response.json(); } catch (error) { console.warn('Config load failed, using default.', error); return { design: "default" }; } }

    /**
     * Main application initialization function
     * Sets up error handlers, service worker, translations, and UI components
     */
    async function main() {
        // Initialize global error handlers first
        ErrorHandler.initGlobalHandlers();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/THiXX-OTH/sw.js', { scope: '/THiXX-OTH/' })
                    .then(registration => {
                        console.log('Service Worker registered:', registration.scope);
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    updateBanner.classList.remove('hidden');
                                }
                            });
                        });
                    })
                    .catch(err => ErrorHandler.handle(err, 'ServiceWorkerRegistration'));

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                     window.location.reload();
                });
            });
        }

        await loadTranslations();
        applyTranslations();
        const config = await loadConfig();
        applyConfig(config);
        setupEventListeners();
        setTodaysDate();
        checkNfcSupport();
        initCollapsibles();

        // iOS-specific: Check for pending downloads on app start (new instance each time)
        if (isIOS() && navigator.onLine) {
            const pending = await getPendingDownloads();
            if (pending.length > 0) {
                console.log('[App] iOS: Found pending downloads on start, processing...');
                setTimeout(() => processPendingDownloads(), 2000); // Delay to ensure SW is ready
            }
        }

        // ROBUSTNESS: Re-register Background Sync on app start (Recovery after Force Close)
        // Wenn die App "weggewischt" wurde, löscht das OS den Sync-Trigger.
        // Wir stellen ihn hier wieder her, sobald die App erneut gestartet wird.
        try {
            const pending = await getPendingDownloads();
            if (pending.length > 0) {
                console.log('[App] Wiederherstellung: Es gibt noch ausstehende Downloads (' + pending.length + ').');

                // Background Sync neu registrieren (harmlos wenn bereits vorhanden)
                if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.sync.register('sync-pending-downloads')
                            .then(() => console.log('[App] Background Sync wiederhergestellt'))
                            .catch(err => console.warn('[App] Sync Wiederherstellung fehlgeschlagen', err));
                    });
                }

                // Falls wir bereits online sind, direkt anstoßen (ohne auf Event zu warten)
                if (navigator.onLine) {
                    console.log('[App] Online erkannt - starte sofortigen Download-Versuch');
                    processPendingDownloads();
                }
            }
        } catch (error) {
            console.warn('[App] Fehler bei Pending-Downloads-Check:', error);
        }

        if (!processUrlParameters()) {
            setupReadTabInitialState();
            switchTab('read-tab');
            // Fully expand container in initial state (without data) to hide overlay
            if (readResultContainer) {
                autoExpandToFitScreen(readResultContainer); // Calculate height for later
                readResultContainer.classList.add('expanded');
                readResultContainer.style.maxHeight = ''; // Let CSS class take effect
            }
        }
    }
    main();

    // --- Event Handler Definitions for robust add/remove ---
    const handleTabClick = (e) => { const tabLink = e.target.closest('.tab-link'); if (tabLink) switchTab(tabLink.dataset.tab); };
    const handleThemeChange = (e) => { const themeBtn = e.target.closest('.theme-btn'); if (themeBtn) applyTheme(themeBtn.dataset.theme); };
    const handleReloadClick = () => { navigator.serviceWorker.getRegistration().then(reg => { if (reg.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } }); };
    const handlePt100Change = (e) => { const el = document.getElementById('PT 100'); if (el) el.disabled = !e.target.checked; };
    const handleNiCrNiChange = (e) => { const el = document.getElementById('NiCr-Ni'); if (el) el.disabled = !e.target.checked; };
    const debouncedUpdatePayload = debounce(updatePayloadOnChange, CONFIG.DEBOUNCE_DELAY);
    const handleCheckForUpdate = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                    reg.update().then(newReg => {
                        if (newReg.installing) {
                            showMessage(t('messages.updateChecking'), 'info');
                        } else if (newReg.waiting) {
                            updateBanner.classList.remove('hidden');
                        } else {
                            showMessage(t('messages.noUpdateFound'), 'ok');
                        }
                    });
                }
            });
        }
    };

    const handleClearCache = async () => {
        const confirmMessage = t('messages.cacheClearConfirm');
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            showMessage(t('messages.cacheClearing'), 'info');

            // Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                console.log('[App] All caches cleared:', cacheNames);
            }

            // Unregister service worker
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(registration => registration.unregister()));
                console.log('[App] Service workers unregistered');
            }

            showMessage(t('messages.cacheClearSuccess'), 'ok');

            // Reload page after short delay
            setTimeout(() => {
                window.location.reload(true);
            }, 1500);
        } catch (error) {
            console.error('[App] Error clearing cache:', error);
            showMessage('Error clearing cache: ' + error.message, 'err');
        }
    };

    function setupEventListeners() {
        if(tabsContainer) tabsContainer.addEventListener('click', handleTabClick);
        if(themeSwitcher) themeSwitcher.addEventListener('click', handleThemeChange);
        if(nfcStatusBadge) nfcStatusBadge.addEventListener('click', handleNfcAction);
        if(checkForUpdateBtn) checkForUpdateBtn.addEventListener('click', handleCheckForUpdate);
        if(clearCacheBtn) clearCacheBtn.addEventListener('click', handleClearCache);

        if (!isIOS()) {
            if (copyToFormBtn) {
                copyToFormBtn.addEventListener('click', populateFormFromScan);
            }
            if(saveJsonBtn) saveJsonBtn.addEventListener('click', saveFormAsJson);
            if(loadJsonInput) loadJsonInput.addEventListener('change', loadJsonIntoForm);
            if (loadJsonLabel && loadJsonInput) {
                loadJsonLabel.addEventListener('click', () => { 
                    loadJsonInput.click(); 
                });
            }
        }
        
        if(form) {
            form.addEventListener('input', debouncedUpdatePayload);
            form.addEventListener('change', updatePayloadOnChange);
        }
        if(reloadButton) reloadButton.addEventListener('click', handleReloadClick);
        const pt100Checkbox = document.getElementById('has_PT100');
        if(pt100Checkbox) pt100Checkbox.addEventListener('change', handlePt100Change);
        const niCrNiCheckbox = document.getElementById('has_NiCr-Ni');
        if(niCrNiCheckbox) niCrNiCheckbox.addEventListener('change', handleNiCrNiChange);
    }

    function cleanupEventListeners() {
        if(tabsContainer) tabsContainer.removeEventListener('click', handleTabClick);
        if(themeSwitcher) themeSwitcher.removeEventListener('click', handleThemeChange);
        if(nfcStatusBadge) nfcStatusBadge.removeEventListener('click', handleNfcAction);
        if(checkForUpdateBtn) checkForUpdateBtn.removeEventListener('click', handleCheckForUpdate);
    
        if (!isIOS()) {
            if (copyToFormBtn) {
                copyToFormBtn.removeEventListener('click', populateFormFromScan);
            }
            if(saveJsonBtn) saveJsonBtn.removeEventListener('click', saveFormAsJson);
            if(loadJsonInput) loadJsonInput.removeEventListener('change', loadJsonIntoForm);
        }
    
        if(form) {
            form.removeEventListener('input', debouncedUpdatePayload);
            form.removeEventListener('change', updatePayloadOnChange);
        }
        if(reloadButton) reloadButton.removeEventListener('click', handleReloadClick);
        const pt100Checkbox = document.getElementById('has_PT100');
        if(pt100Checkbox) pt100Checkbox.removeEventListener('change', handlePt100Change);
        const niCrNiCheckbox = document.getElementById('has_NiCr-Ni');
        if(niCrNiCheckbox) niCrNiCheckbox.removeEventListener('change', handleNiCrNiChange);
    }

    // --- UI & Display Logic ---
    /**
     * Creates a data pair element for displaying label-value pairs
     * @param {string} label - The label text
     * @param {*} value - The value to display
     * @param {string} unit - Optional unit of measurement
     * @returns {HTMLElement|null} The created element or null if value is empty
     */
    function createDataPair(label, value, unit = '') { if (value === undefined || value === null || String(value).trim() === '') return null; const div = document.createElement('div'); div.className = 'data-pair'; const labelSpan = document.createElement('span'); labelSpan.className = 'data-pair-label'; labelSpan.textContent = label; const valueSpan = document.createElement('span'); valueSpan.className = 'data-pair-value'; valueSpan.textContent = `${value} ${unit}`.trim(); div.appendChild(labelSpan); div.appendChild(valueSpan); return div; }

    /**
     * Displays parsed NFC data in the protocol card
     * Organizes data into sections and handles document links
     * @param {Object} data - The parsed data object from NFC tag
     */
    async function displayParsedData(data) { protocolCard.innerHTML = ''; const fragments = { main: document.createDocumentFragment(), section1: document.createDocumentFragment(), section2: document.createDocumentFragment(), section3: document.createDocumentFragment(), footer: document.createDocumentFragment() }; const addPair = (frag, labelKey, val, unit) => { const el = createDataPair(t(labelKey), val, unit); if (el) frag.appendChild(el); }; addPair(fragments.main, 'HK-Nr', data['HK-Nr']); addPair(fragments.main, 'KKS', data['KKS']); addPair(fragments.section1, 'Leistung', data['Leistung'], 'kW'); addPair(fragments.section1, 'Strom', data['Strom'], 'A'); addPair(fragments.section1, 'Spannung', data['Spannung'], 'V'); addPair(fragments.section1, 'Widerstand', data['Widerstand'], 'Ω'); addPair(fragments.section2, 'Anzahl Heizkabeleinheiten', data['Anzahl Heizkabeleinheiten'], 'Stk'); addPair(fragments.section2, 'Trennkasten', data['Trennkasten'], 'Stk'); addPair(fragments.section2, 'Heizkabeltyp', data['Heizkabeltyp']); addPair(fragments.section2, 'Schaltung', data['Schaltung']); if (data['PT 100']) addPair(fragments.section2, 'Messwertgeber', `PT 100: ${data['PT 100']}`, 'Stk'); if (data['NiCr-Ni']) addPair(fragments.section2, 'Messwertgeber', `NiCr-Ni: ${data['NiCr-Ni']}`, 'Stk'); addPair(fragments.section3, 'Regler', data['Regler'], '°C'); addPair(fragments.section3, 'Sicherheitsregler/Begrenzer', data['Sicherheitsregler/Begrenzer'], '°C'); addPair(fragments.section3, 'Wächter', data['Wächter'], '°C'); addPair(fragments.footer, 'Projekt-Nr', data['Projekt-Nr']); addPair(fragments.footer, 'geprüft von', data['geprüft von']); addPair(fragments.footer, 'am', data['am']); const createSection = (frag, className) => { if (frag.hasChildNodes()) { const section = document.createElement('div'); section.className = className; section.appendChild(frag); protocolCard.appendChild(section); } }; createSection(fragments.main, 'card-main'); createSection(fragments.section1, 'card-section'); createSection(fragments.section2, 'card-section'); createSection(fragments.section3, 'card-section'); createSection(fragments.footer, 'card-footer'); docLinkContainer.innerHTML = ''; if (data['Dokumentation']) { const url = data['Dokumentation']; if (!isValidDocUrl(url)) { console.warn('Invalid documentation URL provided:', url); return; } const button = document.createElement('button'); button.className = 'btn doc-link-btn'; button.dataset.url = url; const isCached = await isUrlCached(url); if (isCached) { button.textContent = t('docOpenOffline'); button.onclick = () => window.open(url, '_blank'); } else { button.textContent = navigator.onLine ? t('docDownload') : t('docDownloadLater'); button.addEventListener('click', handleDocButtonClick); } docLinkContainer.appendChild(button);

        // Proaktives Caching: Dokument automatisch im Hintergrund laden
        if (!isCached && navigator.onLine && navigator.serviceWorker && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    action: 'cache-doc',
                    url: url
                });
                console.log('[App] Proaktives Caching der Dokumentation gestartet:', url);
                addLogEntry(t('messages.docCachingStarted') || 'Dokumentation wird im Hintergrund geladen...', 'info');
            } catch (error) {
                console.warn('[App] Proaktives Caching fehlgeschlagen:', error);
            }
        }

        // iOS-specific: Check for pending downloads whenever a tag is read
        if (isIOS() && navigator.onLine) {
            const pending = getPendingDownloads();
            if (pending.length > 0) {
                console.log('[App] iOS: Found pending downloads during tag read, processing...');
                setTimeout(() => processPendingDownloads(), 1500);
            }
        }
    } }

    function applyConfig(config) {
        const selectedDesign = designs[config.design] || designs['thixx_standard'];
        
        if (!isIOS()) { 
            updateManifest(selectedDesign); 
        }

        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme !== selectedDesign.theme) { applyTheme(selectedDesign.theme); }
        if (selectedDesign.lockTheme) { if (themeSwitcher) themeSwitcher.classList.add('hidden'); } else { if (themeSwitcher) themeSwitcher.classList.remove('hidden'); }
        const customerBtnImg = document.querySelector('.theme-btn[data-theme="customer-brand"] img');
        if (customerBtnImg && selectedDesign.icons?.icon512) { customerBtnImg.src = selectedDesign.icons.icon512; }
        if (selectedDesign.brandColors?.primary) { document.documentElement.style.setProperty('--primary-color-override', selectedDesign.brandColors.primary); }
        if (selectedDesign.brandColors?.secondary) { document.documentElement.style.setProperty('--secondary-color-override', selectedDesign.brandColors.secondary); }
    }

    // --- NFC Logic ---
    /**
     * Handles NFC write operations with validation and retry logic
     * Only active in write mode, shows info message in read mode
     */
    async function handleNfcAction() { if (appState.isNfcActionActive || appState.isCooldownActive) return; const writeTab = document.getElementById('write-tab'); const isWriteMode = writeTab?.classList.contains('active') || false; if (!isWriteMode) { showMessage(t('messages.scanToReadInfo'), 'info'); return; } appState.isNfcActionActive = true; appState.abortController = new AbortController(); appState.nfcTimeoutId = setTimeout(() => { if (appState.abortController && !appState.abortController.signal.aborted) { appState.abortController.abort(new DOMException('NFC Operation Timed Out', 'TimeoutError')); } }, CONFIG.NFC_WRITE_TIMEOUT); try { const ndef = new NDEFReader(); const validationErrors = validateForm(); if (validationErrors.length > 0) { throw new Error(validationErrors.join('\n')); } setNfcBadge('writing'); const urlPayload = generateUrlFromForm(); const message = { records: [{ recordType: "url", data: urlPayload }] }; await writeWithRetries(ndef, message); } catch (error) { clearTimeout(appState.nfcTimeoutId); if (error.name !== 'AbortError') { ErrorHandler.handle(error, 'NFCAction'); } else if (error.message === 'NFC Operation Timed Out') { const timeoutError = new DOMException('Write operation timed out.', 'TimeoutError'); ErrorHandler.handle(timeoutError, 'NFCAction'); } abortNfcAction(); startCooldown(); } }
    async function writeWithRetries(ndef, message) { for (let attempt = 1; attempt <= CONFIG.MAX_WRITE_RETRIES; attempt++) { try { showMessage(t('messages.writeAttempt', { replace: { attempt, total: CONFIG.MAX_WRITE_RETRIES } }), 'info', CONFIG.NFC_WRITE_TIMEOUT); await ndef.write(message, { signal: appState.abortController.signal }); clearTimeout(appState.nfcTimeoutId); setNfcBadge('success', t('status.success')); showMessage(t('messages.writeSuccess'), 'ok'); 
    
    const timeoutId = setTimeout(() => {
        if (appState.gracePeriodTimeoutId === timeoutId) {
            abortNfcAction();
            startCooldown();
        }
    }, CONFIG.WRITE_SUCCESS_GRACE_PERIOD);
    appState.gracePeriodTimeoutId = timeoutId;

    return; } catch (error) { console.warn(`Write attempt ${attempt} failed:`, error); if (attempt === CONFIG.MAX_WRITE_RETRIES || ['TimeoutError', 'AbortError'].includes(error.name)) { throw error; } await new Promise(resolve => setTimeout(resolve, CONFIG.WRITE_RETRY_DELAY)); } } }

    // --- Data Processing & Form Handling ---
    /**
     * Processes URL query parameters and displays NFC data if present
     * Automatically decodes short keys to full field names
     * @returns {boolean} True if data was loaded from URL, false otherwise
     */
    function processUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        if (params.toString() === '') return false;

        const data = {};
        for (const [shortKey, value] of params.entries()) {
            const fullKey = reverseFieldMap[shortKey];
            if (fullKey) data[fullKey] = decodeURIComponent(value);
        }

        if (Object.keys(data).length > 0) {
            appState.scannedDataObject = data;
            displayParsedData(data);
            if(rawDataOutput) rawDataOutput.value = window.location.href;
            if(readActions) readActions.classList.remove('hidden');
            switchTab('read-tab');

            // Data loaded - dynamically collapse container (NOT fully expand)
            if (readResultContainer) {
                readResultContainer.classList.remove('expanded');
                autoExpandToFitScreen(readResultContainer);
            }

            showMessage(t('messages.readSuccess'), 'ok');
            history.replaceState(null, '', window.location.pathname);
            return true;
        }

        return false;
    }

    function getFormData() {
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (String(value).trim()) data[key] = String(value).trim();
        }
        
        // Checkbox-Werte nur hinzufügen, wenn sie nicht-null/leer sind
        if (!document.getElementById('has_PT100')?.checked) {
            delete data['PT 100'];
        }
        if (!document.getElementById('has_NiCr-Ni')?.checked) {
             delete data['NiCr-Ni'];
        }

        // Checkbox-Hilfsfelder entfernen
        delete data['has_PT100'];
        delete data['has_NiCr-Ni'];
        
        return data;
    }

    function generateUrlFromForm() { const params = new URLSearchParams(); const formData = getFormData(); for (const [key, value] of Object.entries(formData)) { const shortKey = fieldMap[key]; if (shortKey) params.append(shortKey, value); } return `${CONFIG.BASE_URL}?${params.toString()}`; }
    function updatePayloadOnChange() {
        const writeTab = document.getElementById('write-tab');
        if (!writeTab?.classList.contains('active')) return;

        if (!payloadOutput || !payloadSize || !nfcStatusBadge) {
            console.warn('[Payload] Missing UI elements, skipping payload update');
            return;
        }

        const urlPayload = generateUrlFromForm();
        payloadOutput.value = urlPayload;
        const byteCount = new TextEncoder().encode(urlPayload).length;
        payloadSize.textContent = `${byteCount} / ${CONFIG.MAX_PAYLOAD_SIZE} Bytes`;
        const isOverLimit = byteCount > CONFIG.MAX_PAYLOAD_SIZE;
        payloadSize.classList.toggle('limit-exceeded', isOverLimit);
        nfcStatusBadge.disabled = isOverLimit;
    }
    /**
     * Validates form data before NFC write operation
     * Checks voltage range, URL format, and payload size limits
     * @returns {string[]} Array of validation error messages (empty if valid)
     */
    function validateForm() { const errors = []; const voltageInput = form.elements['Spannung']; if(voltageInput) { const voltage = parseFloat(voltageInput.value); if (voltage && (voltage < 0 || voltage > 1000)) { errors.push(t('errors.invalidVoltage')); } } const docUrlInput = form.elements['Dokumentation']; if(docUrlInput) { const docUrl = docUrlInput.value; if (docUrl && !isValidDocUrl(docUrl)) { errors.push(t('errors.invalidDocUrl')); } } const payloadByteSize = new TextEncoder().encode(generateUrlFromForm()).length; if (payloadByteSize > CONFIG.MAX_PAYLOAD_SIZE) { errors.push(t('messages.payloadTooLarge')); } return errors; }

    // --- Helper & State Functions ---
    function startCooldown() { appState.isCooldownActive = true; setNfcBadge('cooldown'); setTimeout(() => { appState.isCooldownActive = false; if ('NDEFReader' in window) setNfcBadge('idle'); }, CONFIG.COOLDOWN_DURATION) }
    function abortNfcAction() { clearTimeout(appState.nfcTimeoutId); if (appState.gracePeriodTimeoutId) { clearTimeout(appState.gracePeriodTimeoutId); appState.gracePeriodTimeoutId = null; } if (appState.abortController && !appState.abortController.signal.aborted) { appState.abortController.abort(new DOMException('User aborted', 'AbortError')); } appState.abortController = null; appState.isNfcActionActive = false; }
    function addLogEntry(message, type = 'info') { const timestamp = new Date().toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); appState.eventLog.unshift({ timestamp, message, type }); if (appState.eventLog.length > CONFIG.MAX_LOG_ENTRIES) appState.eventLog.pop(); renderLog(); }
    function renderLog() { if (!eventLogOutput) return; eventLogOutput.innerHTML = ''; appState.eventLog.forEach(entry => { const div = document.createElement('div'); div.className = `log-entry ${entry.type}`; const timestamp = document.createElement('span'); timestamp.className = 'log-timestamp'; timestamp.textContent = entry.timestamp; const message = document.createTextNode(` ${entry.message}`); div.appendChild(timestamp); div.appendChild(message); eventLogOutput.appendChild(div); }); }

    // --- Service Worker & Cache ---
    async function isUrlCached(url) { if (!('caches' in window)) return false; try { const cache = await caches.open('thixx-oth-docs-default'); const request = new Request(url, { mode: 'no-cors' }); const response = await cache.match(request); return !!response; } catch (error) { console.error("Cache check failed:", error); return false; } }

    // --- Background Sync & Download Queue Management ---
    // IndexedDB Configuration (shared with Service Worker)
    const DB_NAME = 'thixx-oth-db';
    const DB_VERSION = 2; // ✅ UPGRADED: Enhanced retry & logging support
    const STORE_NAME = 'pending-downloads';
    const MAX_RETRY_COUNT = 3;

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
                const oldVersion = event.oldVersion;

                // V1: Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                    console.log('[App DB] Object store created:', STORE_NAME);
                }

                // V2: Enhanced fields for retry & logging
                if (oldVersion < 2) {
                    console.log('[App DB] Upgrading to V2 - Enhanced retry & logging support');
                    // New fields: retryCount, addedAt, downloadedAt, source, lastError
                }
            };
        });
    }

    /**
     * Get all pending downloads from IndexedDB
     * @returns {Promise<Array>} Array of download objects
     */
    async function getPendingDownloads() {
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);

            return new Promise((resolve, reject) => {
                const request = store.getAll();

                request.onsuccess = () => {
                    const items = request.result || [];
                    // Filter out items that exceeded retry limit
                    const validItems = items.filter(item => {
                        const retryCount = item.retryCount || 0;
                        return retryCount < MAX_RETRY_COUNT;
                    });
                    console.log(`[App DB] Retrieved ${validItems.length} pending downloads (${items.length - validItems.length} exceeded retry limit)`);
                    resolve(validItems);
                };

                request.onerror = () => {
                    console.error('[App DB] Failed to get pending downloads:', request.error);
                    resolve([]);
                };
            });
        } catch (error) {
            console.error('[App DB] Failed to open database:', error);
            return [];
        }
    }

    /**
     * Add a pending download to IndexedDB
     * @param {string} url - The URL to add
     * @returns {Promise<void>}
     */
    async function addPendingDownload(url) {
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            return new Promise((resolve, reject) => {
                // Use put() to avoid duplicates (will overwrite if exists)
                const downloadItem = {
                    url: url,
                    addedAt: Date.now(),
                    retryCount: 0,
                    status: 'pending',
                    source: null,
                    downloadedAt: null,
                    lastError: null,
                    lastRetryAt: null
                };

                const request = store.put(downloadItem);

                request.onsuccess = () => {
                    console.log('[App DB] ✅ Added to download queue:', url);
                    resolve();
                };

                request.onerror = () => {
                    console.error('[App DB] Failed to add pending download:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('[App DB] Failed to add pending download:', error);
        }
    }

    /**
     * Remove a pending download from IndexedDB
     * @param {string} url - The URL to remove
     * @returns {Promise<void>}
     */
    async function removePendingDownload(url) {
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            return new Promise((resolve, reject) => {
                const request = store.delete(url);

                request.onsuccess = () => {
                    console.log('[App DB] Removed from download queue:', url);
                    resolve();
                };

                request.onerror = () => {
                    console.error('[App DB] Failed to remove:', url, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('[App DB] Failed to remove pending download:', error);
        }
    }

    async function registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('sync-pending-downloads');
                console.log('[App] Background Sync registered');
                return true;
            } catch (error) {
                console.warn('[App] Background Sync registration failed:', error);
                return false;
            }
        }
        return false;
    }

    /**
     * Start a Background Fetch for reliable downloads
     * @param {string} url - The URL to download
     * @returns {Promise<boolean>} Success status
     */
    async function startBackgroundFetch(url) {
        if (!('BackgroundFetchManager' in self)) {
            console.log('[App] Background Fetch API not supported');
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.ready;

            // Generate unique ID for this fetch
            const fetchId = `doc-fetch-${Date.now()}`;

            const bgFetch = await registration.backgroundFetch.fetch(
                fetchId,
                [url],
                {
                    title: 'Dokument wird heruntergeladen',
                    icons: [{
                        src: '/THiXX-OTH/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    }],
                    downloadTotal: 10 * 1024 * 1024 // Assume max 10MB
                }
            );

            console.log('[App] ✅ Background Fetch started:', fetchId);
            return true;
        } catch (error) {
            console.error('[App] Background Fetch failed to start:', error);
            return false;
        }
    }

    async function processPendingDownloads() {
        if (!navigator.onLine) {
            console.log('[App] Offline - cannot process pending downloads');
            return;
        }

        const pending = await getPendingDownloads();
        if (pending.length === 0) {
            console.log('[App] No pending downloads to process');
            return;
        }

        // iOS-specific: Wake up Service Worker if sleeping
        if (isIOS() && !navigator.serviceWorker.controller && 'serviceWorker' in navigator) {
            console.log('[App] iOS: Service Worker not active, attempting to wake up...');
            try {
                await navigator.serviceWorker.register('/THiXX-OTH/sw.js', { scope: '/THiXX-OTH/' });
                const registration = await navigator.serviceWorker.ready;
                console.log('[App] iOS: Service Worker ready:', registration.scope);
                // Wait a bit for controller to be assigned
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('[App] iOS: Service Worker wake-up failed:', error);
            }
        }

        console.log(`[App] Processing ${pending.length} pending download(s)...`);
        showMessage(t('messages.docSyncInProgress'), 'info');

        let successCount = 0;

        for (const item of pending) {
            const url = item.url;
            try {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        action: 'cache-doc',
                        url: url
                    });

                    // Wait a bit to allow the caching to complete
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Check if it's now cached
                    const isCached = await isUrlCached(url);
                    if (isCached) {
                        await removePendingDownload(url);
                        successCount++;
                        console.log('[App] ✅ Successfully cached via app-start:', url);

                        // Update button if it's visible
                        updateDocButtonIfVisible(url);
                    }
                }
            } catch (error) {
                console.error('[App] Failed to cache pending download:', url, error);
            }
        }

        if (successCount > 0) {
            showMessage(t('messages.docDownloadCompleted'), 'ok');
            addLogEntry(`${successCount} Dokument(e) erfolgreich heruntergeladen`, 'ok');
        }
    }

    function updateDocButtonIfVisible(url) {
        const button = document.querySelector(`.doc-link-btn[data-url="${url}"]`);
        if (button) {
            button.textContent = t('docOpenOffline');
            button.disabled = false;
            button.onclick = () => window.open(url, '_blank');
        }
    }

    async function handleDocButtonClick(event) {
        const button = event.target;
        const url = button.dataset.url;

        if (navigator.onLine) {
            window.open(url, '_blank');
            button.textContent = t('docOpenOffline');
            button.onclick = () => window.open(url, '_blank');
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    action: 'cache-doc',
                    url: url
                });
            }
        } else {
            // OFFLINE: Queue for download
            await addPendingDownload(url);

            // ✅ PRIORITY 1: Try Background Fetch (most reliable)
            const bgFetchStarted = await startBackgroundFetch(url);

            if (bgFetchStarted) {
                console.log('[App] ✅ Background Fetch initiated (most reliable method)');
                showMessage('Download startet automatisch wenn Verbindung besteht', 'info');
                button.textContent = 'Download läuft...';
                button.disabled = true;
                addLogEntry(`Background Fetch gestartet: ${url}`, 'info');
            } else {
                // ✅ FALLBACK: Use Background Sync
                console.log('[App] Background Fetch not available, using Background Sync');
                const syncRegistered = await registerBackgroundSync();

                showMessage(t('messages.docQueuedForDownload'), 'info');
                button.textContent = t('docDownloadPending');
                button.disabled = true;
                addLogEntry(`Download in Warteschlange: ${url}`, 'info');
            }
        }
    }

    // Listen for online event to process pending downloads
    window.addEventListener('online', () => {
        console.log('[App] Connection restored, processing pending downloads...');
        setTimeout(() => {
            processPendingDownloads();
        }, 1000); // Small delay to ensure connection is stable
    });

    // Listen for messages from Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', async (event) => {
            const { type, url, successCount } = event.data;

            if (type === 'GET_PENDING_DOWNLOADS') {
                // LEGACY: Service Worker requests pending downloads (not used anymore with IndexedDB)
                // Kept for backward compatibility
                const pending = await getPendingDownloads();
                event.ports[0].postMessage({ pendingDownloads: pending });
            } else if (type === 'DOC_SYNCED') {
                // A document was successfully synced
                console.log('[App] Document synced:', url);
                await removePendingDownload(url);
                updateDocButtonIfVisible(url);
            } else if (type === 'SYNC_COMPLETE') {
                // Background sync completed
                console.log('[App] Background sync completed:', successCount, 'downloads');
                if (successCount > 0) {
                    showMessage(t('messages.docDownloadCompleted'), 'ok');
                    addLogEntry(`${successCount} Dokument(e) erfolgreich heruntergeladen`, 'ok');
                }
            } else if (type === 'DOC_CACHED') {
                // Document was cached (from proactive caching)
                console.log('[App] Document cached:', url);
            }
        });
    }

    // --- UI/UX Functions ---
    function updateManifest(design) { const manifestLink = document.querySelector('link[rel="manifest"]'); if (!manifestLink) return; const oldHref = manifestLink.href; if (oldHref && oldHref.startsWith('blob:')) { URL.revokeObjectURL(oldHref); } const newManifest = { name: design.appName, short_name: design.short_name, start_url: "/THiXX-OTH/index.html", scope: "/THiXX-OTH/", display: "standalone", background_color: "#ffffff", theme_color: design.brandColors.primary || "#f04e37", orientation: "portrait-primary", icons: [{ src: design.icons.icon192, sizes: "192x192", type: "image/png" }, { src: design.icons.icon512, sizes: "512x512", type: "image/png" }] }; const blob = new Blob([JSON.stringify(newManifest)], { type: 'application/json' }); manifestLink.href = URL.createObjectURL(blob); }
    function applyTheme(themeName) { const themeButtons = document.querySelectorAll('.theme-btn'); document.documentElement.setAttribute('data-theme', themeName); localStorage.setItem('thixx-theme', themeName); themeButtons.forEach(btn => { btn.classList.toggle('active', btn.dataset.theme === themeName); }); const metaThemeColor = document.querySelector('meta[name="theme-color"]'); if (metaThemeColor) { const colors = { dark: '#0f172a', thixx: '#f8f9fa', 'customer-brand': '#FCFCFD' }; metaThemeColor.setAttribute('content', colors[themeName] || '#FCFCFD'); } }
    function setupReadTabInitialState() { protocolCard.innerHTML = ''; const p = document.createElement('p'); p.className = 'placeholder-text'; p.textContent = t('placeholderRead'); protocolCard.appendChild(p); docLinkContainer.innerHTML = ''; if(readActions) readActions.classList.add('hidden'); }
    function initCollapsibles() { document.querySelectorAll('.collapsible').forEach(el => makeCollapsible(el)) }
    
    function checkNfcSupport() {
        if ('NDEFReader' in window) {
            setNfcBadge('idle');
        } else {
            if (isIOS()) {
                if(tabsContainer) tabsContainer.classList.add('hidden');
                if(copyToFormBtn) copyToFormBtn.classList.add('hidden');
                setNfcBadge('idle'); 
                if(nfcStatusBadge) nfcStatusBadge.disabled = true;
            } else {
                setNfcBadge('unsupported');
                if(nfcFallback) nfcFallback.classList.remove('hidden');
                if(nfcStatusBadge) nfcStatusBadge.disabled = true;
            }
            
            const writeTabLink = document.querySelector('.tab-link[data-tab="write-tab"]');
            if (writeTabLink) {
                writeTabLink.style.display = 'none';
            }
        }
    }

    function switchTab(tabId) { 
        abortNfcAction(); 
        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active')); 
        tabContents.forEach(content => content.classList.remove('active')); 
        const activeTabLink = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
        if(activeTabLink) activeTabLink.classList.add('active');
        const activeTabContent = document.getElementById(tabId);
        if(activeTabContent) activeTabContent.classList.add('active');
        
        if (legalInfoContainer) { 
            legalInfoContainer.classList.toggle('hidden', tabId !== 'read-tab'); 
        } 
        
        if ('NDEFReader' in window || isIOS()) {
            setNfcBadge('idle');
        }
        
        // Manage container states on tab switch
        if (tabId === 'write-tab') {
            updatePayloadOnChange();
            // Write tab: always dynamically collapse
            const writeFormContainer = document.getElementById('write-form-container');
            if (writeFormContainer) {
                writeFormContainer.classList.remove('expanded');
                autoExpandToFitScreen(writeFormContainer);
            }
        } else if (tabId === 'read-tab') {
            // Read tab: check if data is present
            if (readResultContainer) {
                if (appState.scannedDataObject) {
                    // Data present: dynamically collapse
                    readResultContainer.classList.remove('expanded');
                    autoExpandToFitScreen(readResultContainer);
                } else {
                    // No data: fully expand
                    readResultContainer.classList.add('expanded');
                    readResultContainer.style.maxHeight = '';
                }
            }
        }
    }

    function showMessage(text, type = 'info', duration = 4000) { if(!messageBanner) return; messageBanner.textContent = text; messageBanner.className = 'message-banner'; messageBanner.classList.add(type); messageBanner.classList.remove('hidden'); setTimeout(() => messageBanner.classList.add('hidden'), duration); addLogEntry(text, type); }
    function setTodaysDate() { const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth() + 1).padStart(2, '0'); const dd = String(today.getDate()).padStart(2, '0'); const dateInput = document.getElementById('am'); if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}` }
    
    function setNfcBadge(state, message = '') {
        if(!nfcStatusBadge) return;
        const writeTab = document.getElementById('write-tab');
        const isWriteMode = writeTab?.classList.contains('active') || false;

        if (isIOS()) {
            nfcStatusBadge.textContent = t('status.iosRead');
            nfcStatusBadge.className = 'nfc-badge';
            nfcStatusBadge.classList.add('info');
            return;
        }

        const states = { 
            unsupported: [t('status.unsupported'), 'err'], 
            idle: [isWriteMode ? t('status.startWriting') : t('status.startReading'), 'info'],
            scanning: [t('status.scanning'), 'info'], 
            writing: [t('status.writing'), 'info'], 
            success: [message || t('status.success'), 'ok'], 
            error: [message || t('status.error'), 'err'], 
            cooldown: [t('status.cooldown'), 'info']
        }; 
        const [text, className] = states[state] || states['idle']; 
        nfcStatusBadge.textContent = text; 
        nfcStatusBadge.className = 'nfc-badge'; 
        nfcStatusBadge.classList.add(className);
    }
    
    function populateFormFromScan() {
        if (isIOS()) {
            showMessage(t('messages.noDataToCopy'), 'err');
            return;
        }

        if (!appState.scannedDataObject) {
            showMessage(t('messages.noDataToCopy'), 'err');
            return;
        }

        if(form) form.reset();
        setTodaysDate();

        // Spezielle Felder, die separat behandelt werden
        const specialFields = ['PT 100', 'NiCr-Ni'];

        for (const [key, value] of Object.entries(appState.scannedDataObject)) {
            if(!form) continue;

            // Spezielle Felder überspringen - werden unten separat behandelt
            if (specialFields.includes(key)) {
                continue;
            }

            try {
                const input = form.elements[key];

                // Robuste Null-Prüfung: Element muss existieren
                if (!input) {
                    console.warn(`[populateFormFromScan] Element not found for key: "${key}"`);
                    continue;
                }

                // FIX: RadioNodeList Check (Muss VOR input.type Check kommen!)
                // Prüft, ob es eine Liste von Radio-Buttons ist (hat length, aber kein type)
                if (input.length !== undefined && input[0] && input[0].type === 'radio') {
                     form.querySelectorAll(`input[name="${key}"]`).forEach(radio => {
                        if (radio.value === value) radio.checked = true;
                    });
                }
                // Fallback für einzelnen Radio-Button (selten bei Gruppen, aber möglich)
                else if (input.type === 'radio') {
                    // Bei einem einzelnen Radio-Button prüfen wir den Wert direkt
                    if (input.value === value) input.checked = true;
                }
                // Checkbox
                else if (input.type === 'checkbox') {
                    input.checked = (value === 'true' || value === 'on');
                }
                // Standard (Text, Number, Date, etc.)
                else {
                    input.value = value;
                }

            } catch (fieldError) {
                console.error(`[populateFormFromScan] Error setting field "${key}":`, fieldError);
                addLogEntry(`Fehler beim Setzen von Feld "${key}"`, 'err');
            }
        }

        const pt100Input = document.getElementById('PT 100');
        const hasPt100Checkbox = document.getElementById('has_PT100');
        if (appState.scannedDataObject['PT 100']) {
            if (pt100Input) {
                pt100Input.value = appState.scannedDataObject['PT 100'];
                pt100Input.disabled = false;
            }
            if (hasPt100Checkbox) hasPt100Checkbox.checked = true;
        } else {
            if (pt100Input) pt100Input.disabled = true;
            if (hasPt100Checkbox) hasPt100Checkbox.checked = false;
        }

        const niCrInput = document.getElementById('NiCr-Ni');
        const hasNiCrCheckbox = document.getElementById('has_NiCr-Ni');
        if (appState.scannedDataObject['NiCr-Ni']) {
            if (niCrInput) {
                niCrInput.disabled = false;
                niCrInput.value = appState.scannedDataObject['NiCr-Ni'];
            }
            if (hasNiCrCheckbox) hasNiCrCheckbox.checked = true;
        } else {
            if (niCrInput) niCrInput.disabled = true;
            if (hasNiCrCheckbox) hasNiCrCheckbox.checked = false;
        }

        switchTab('write-tab');
        showMessage(t('messages.copySuccess'), 'ok');
    }
    function saveFormAsJson() { const data = getFormData(); const jsonString = JSON.stringify(data, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const today = new Date().toISOString().slice(0, 10); a.download = `thixx-${today}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => { URL.revokeObjectURL(url); }, CONFIG.URL_REVOKE_DELAY); showMessage(t('messages.saveSuccess'), 'ok'); }
    function loadJsonIntoForm(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const data = JSON.parse(e.target.result); appState.scannedDataObject = data; populateFormFromScan(); showMessage(t('messages.loadSuccess'), 'ok') } catch (error) { const userMessage = error instanceof SyntaxError ? 'Die JSON-Datei hat ein ungültiges Format.' : error.message; ErrorHandler.handle(new Error(userMessage), 'LoadJSON'); } finally { if (event.target) event.target.value = null } }; reader.readAsText(file) }
    
    function autoExpandToFitScreen(elementToExpand) {
        if (!elementToExpand) return;

        // Execute immediately without requestAnimationFrame to fix iOS timing issues
        const container = document.querySelector('.container');
        if (!headerElement || !legalInfoContainer || !container) return;

        const headerHeight = headerElement.offsetHeight;
        const tabsHeight = (tabsContainer && !tabsContainer.classList.contains('hidden')) ? tabsContainer.offsetHeight : 0;

        // Legal info height not included - container takes full available space,
        // pushing legal info below the visible area
        const containerStyle = window.getComputedStyle(container);
        const containerPadding = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);

        const otherElementsHeight = headerHeight + tabsHeight + containerPadding;
        
        const viewportHeight = window.innerHeight;
        const availableHeight = viewportHeight - otherElementsHeight - CONFIG.SAFETY_BUFFER_PX;

        const titleElement = elementToExpand.querySelector('h2');
        const minRequiredHeight = titleElement ? titleElement.offsetHeight + 60 : 100;

        const targetHeight = Math.max(availableHeight, minRequiredHeight);

        // Store calculated height for manual collapse
        elementToExpand.dataset.autoHeight = `${targetHeight}px`;

        // Set inline height for dynamic collapse (expanded class managed elsewhere)
        elementToExpand.style.maxHeight = `${targetHeight}px`;
    }

    function makeCollapsible(el) {
        if (!el || el.dataset.collapsibleApplied) return;
        el.dataset.collapsibleApplied = 'true';

        const toggle = () => {
            const isFullyExpanded = el.classList.contains('expanded');

            if (isFullyExpanded) {
                el.classList.remove('expanded');
                // Return to 'fits on screen' state if auto-height is set
                if (el.dataset.autoHeight) {
                    el.style.maxHeight = el.dataset.autoHeight;
                } else {
                    el.style.maxHeight = ''; // Fallback to default CSS height
                }
            } else {
                // Expand fully - let CSS expanded class take effect
                el.style.maxHeight = '';
                el.classList.add('expanded');
            }
        };

        const overlay = el.querySelector('.collapsible-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                el.style.maxHeight = ''; 
                el.classList.add('expanded');
            });
        }

        el.addEventListener('click', (e) => {
            const interactiveTags = ['input', 'select', 'textarea', 'button', 'label', 'summary', 'details', 'a'];
            if (interactiveTags.includes(e.target.tagName.toLowerCase()) || e.target.closest('.collapsible-overlay')) {
                return;
            }
            toggle();
        });
    }
});