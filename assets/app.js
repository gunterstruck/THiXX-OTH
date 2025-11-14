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
        isNfcActionActive: false, isCooldownActive: false,
        abortController: null, scannedDataObject: null, eventLog: [],
        nfcTimeoutId: null, gracePeriodTimeoutId: null,
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

    // --- Utility Functions ---
    const debounce = (func, wait) => { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func.apply(this, args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
    function isValidDocUrl(url) { if (!url || typeof url !== 'string') return false; try { const parsed = new URL(url); return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')); } catch { return false; } }
    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // --- Internationalization (i18n) ---
    // Use AppController.t() shortcut
    function t(key, options = {}) {
        return window.AppController ? window.AppController.t(key, options) : key;
    }

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
     * Main application initialization function
     * Sets up error handlers, service worker, translations, and UI components
     */
    async function main() {
        // Initialize global error handlers first
        ErrorHandler.initGlobalHandlers();

        // Initialize core modules (branding, i18n, schema)
        if (window.AppController) {
            await window.AppController.initialize();
        } else {
            console.error('[App] AppController not loaded. Core modules required.');
            return;
        }

        // Build dynamic form from schema
        if (form && window.AppController) {
            window.AppController.buildForm(form);
            console.log('[App] Dynamic form built from schema');
        }

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

                // Listen for messages from service worker (background sync notifications)
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'doc-cached') {
                        console.log('[App] Document cached in background:', event.data.url);
                        showMessage(t('messages.docCachedOnline') || 'Dokumentation wurde im Hintergrund geladen', 'ok');

                        // Update button if it exists on current page
                        const button = document.querySelector(`.doc-link-btn[data-url="${event.data.url}"]`);
                        if (button) {
                            button.textContent = t('docOpenOffline');
                            button.disabled = false;
                            button.onclick = () => window.open(event.data.url, '_blank');
                        }
                    }
                });
            });
        }

        setupEventListeners();
        setTodaysDate();
        checkNfcSupport();
        initCollapsibles();

        // Set up online/offline handlers for pending downloads (iOS fallback)
        window.addEventListener('online', processPendingDownloads);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && navigator.onLine) {
                processPendingDownloads();
            }
        });

        // Process any pending downloads on startup if online
        if (navigator.onLine) {
            processPendingDownloads();
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

    function setupEventListeners() {
        if(tabsContainer) tabsContainer.addEventListener('click', handleTabClick);
        if(themeSwitcher) themeSwitcher.addEventListener('click', handleThemeChange);
        if(nfcStatusBadge) nfcStatusBadge.addEventListener('click', handleNfcAction);
        if(checkForUpdateBtn) checkForUpdateBtn.addEventListener('click', handleCheckForUpdate);
        
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
     * Uses SchemaEngine to render data according to schema
     * @param {Object} data - The parsed data object from NFC tag
     */
    async function displayParsedData(data) {
        // Use SchemaEngine to render data
        if (window.AppController) {
            window.AppController.renderDisplay(data, protocolCard);
        }

        // Handle documentation link separately
        docLinkContainer.innerHTML = '';
        if (data['Dokumentation']) {
            const url = data['Dokumentation'];
            if (!isValidDocUrl(url)) {
                console.warn('Invalid documentation URL provided:', url);
                return;
            }

            const button = document.createElement('button');
            button.className = 'btn doc-link-btn';
            button.dataset.url = url;
            const isCached = await isUrlCached(url);

            if (isCached) {
                button.textContent = t('docOpenOffline');
                button.onclick = () => window.open(url, '_blank');
            } else {
                button.textContent = navigator.onLine ? t('docDownload') : t('docDownloadLater');
                button.addEventListener('click', handleDocButtonClick);
            }
            docLinkContainer.appendChild(button);

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
        }
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
     * Processes URL hash parameters and displays NFC data if present
     * Automatically decodes short keys to full field names
     * Uses hash (#) instead of query (?) for iOS NFC compatibility
     * @returns {boolean} True if data was loaded from URL, false otherwise
     */
    function processUrlParameters() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        if (params.toString() === '') return false;

        // Use AppController to decode URL parameters
        const data = window.AppController ? window.AppController.decodeUrl(params) : {};

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
        if (!form) return {};

        const formData = new FormData(form);
        const data = {};

        // Iterate over form elements and use data-field-name to get original field names
        for (const element of form.elements) {
            const fieldName = element.dataset.fieldName || element.name;
            const value = element.value;

            // Skip empty values
            if (!value || String(value).trim() === '') continue;

            // Skip helper checkboxes (has_*)
            if (element.name && element.name.startsWith('has_')) continue;

            // Skip checkbox number inputs if checkbox is not checked
            if (element.dataset.checkboxValue === 'true') {
                const checkboxId = `has_${element.id}`;
                const checkbox = document.getElementById(checkboxId);
                if (!checkbox || !checkbox.checked) continue;
            }

            // Handle radio buttons
            if (element.type === 'radio' && !element.checked) continue;

            // Add to data using original field name
            data[fieldName] = String(value).trim();
        }

        return data;
    }

    function generateUrlFromForm() {
        const formData = getFormData();
        if (window.AppController) {
            return window.AppController.encodeUrl(formData, CONFIG.BASE_URL);
        }
        return CONFIG.BASE_URL;
    }
    function updatePayloadOnChange() { const writeTab = document.getElementById('write-tab'); if (writeTab?.classList.contains('active')) { const urlPayload = generateUrlFromForm(); payloadOutput.value = urlPayload; const byteCount = new TextEncoder().encode(urlPayload).length; payloadSize.textContent = `${byteCount} / ${CONFIG.MAX_PAYLOAD_SIZE} Bytes`; const isOverLimit = byteCount > CONFIG.MAX_PAYLOAD_SIZE; payloadSize.classList.toggle('limit-exceeded', isOverLimit); nfcStatusBadge.disabled = isOverLimit; } }
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
    async function isUrlCached(url) {
        if (!('caches' in window)) return false;

        // KORREKTUR: Cache-Name muss mit Service Worker (sw.js) übereinstimmen
        // Der sw.js verwendet DOC_CACHE_PREFIX = 'thixx-oth-docs'
        // und den Fallback-Mandanten 'default'
        const correctCacheName = 'thixx-oth-docs-default';

        try {
            const cache = await caches.open(correctCacheName);
            const request = new Request(url, { mode: 'no-cors' });
            const response = await cache.match(request);
            return !!response;
        } catch (error) {
            console.error("Cache check failed:", error);
            return false;
        }
    }

    /**
     * Stores a pending document download in localStorage for iOS fallback
     * @param {string} url - The document URL to cache later
     */
    function storePendingDownload(url) {
        try {
            const pending = JSON.parse(localStorage.getItem('thixx-pending-downloads') || '[]');
            if (!pending.includes(url)) {
                pending.push(url);
                localStorage.setItem('thixx-pending-downloads', JSON.stringify(pending));
                console.log('[App] Stored pending download:', url);
            }
        } catch (error) {
            console.error('[App] Failed to store pending download:', error);
        }
    }

    /**
     * Removes a URL from pending downloads
     * @param {string} url - The URL to remove
     */
    function removePendingDownload(url) {
        try {
            const pending = JSON.parse(localStorage.getItem('thixx-pending-downloads') || '[]');
            const filtered = pending.filter(pendingUrl => pendingUrl !== url);
            localStorage.setItem('thixx-pending-downloads', JSON.stringify(filtered));
            console.log('[App] Removed pending download:', url);
        } catch (error) {
            console.error('[App] Failed to remove pending download:', error);
        }
    }

    /**
     * Processes pending downloads when the app comes online
     * This is the iOS fallback for Background Sync API
     */
    async function processPendingDownloads() {
        if (!navigator.onLine || !navigator.serviceWorker?.controller) return;

        try {
            const pending = JSON.parse(localStorage.getItem('thixx-pending-downloads') || '[]');
            if (pending.length === 0) return;

            console.log('[App] Processing pending downloads:', pending);

            for (const url of pending) {
                try {
                    // Send cache request to service worker
                    navigator.serviceWorker.controller.postMessage({
                        action: 'cache-doc',
                        url: url
                    });

                    // Wait a bit to ensure caching completes
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Remove from pending list
                    removePendingDownload(url);

                    console.log('[App] Successfully cached pending download:', url);
                    addLogEntry(t('messages.docCachedOnline') || 'Dokumentation wurde im Hintergrund geladen', 'ok');
                } catch (error) {
                    console.error('[App] Failed to cache pending download:', url, error);
                }
            }
        } catch (error) {
            console.error('[App] Error processing pending downloads:', error);
        }
    }

    /**
     * Handles document button clicks with Background Sync support
     * Uses native Background Sync API on Android and localStorage fallback on iOS
     */
    async function handleDocButtonClick(event) {
        const button = event.target;
        const url = button.dataset.url;

        if (navigator.onLine) {
            // Online: Open document and cache it
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
            // Offline: Try Background Sync API (Android) or fallback to localStorage (iOS)
            const supportsBackgroundSync = 'serviceWorker' in navigator && 'SyncManager' in window;

            if (supportsBackgroundSync) {
                // Android: Use Background Sync API
                try {
                    const registration = await navigator.serviceWorker.ready;
                    await registration.sync.register(`cache-doc:${url}`);

                    showMessage(t('messages.docSyncScheduled'), 'info');
                    button.textContent = t('docDownloadPending');
                    button.disabled = true;

                    console.log('[App] Background sync registered for:', url);
                    addLogEntry(t('messages.docSyncScheduled') || 'Download wird bei Online-Verbindung gestartet', 'info');
                } catch (error) {
                    console.error('[App] Background sync registration failed:', error);
                    // Fallback to iOS method
                    storePendingDownload(url);
                    showMessage(t('messages.docDownloadQueued'), 'info');
                    button.textContent = t('docDownloadPending');
                    button.disabled = true;
                }
            } else {
                // iOS: Use localStorage fallback
                storePendingDownload(url);
                showMessage(t('messages.docDownloadQueued'), 'info');
                button.textContent = t('docDownloadPending');
                button.disabled = true;

                console.log('[App] Document queued for download (iOS fallback):', url);
                addLogEntry(t('messages.docDownloadQueued') || 'Download vorgemerkt', 'info');
            }
        }
    }

    // --- UI/UX Functions ---
    function applyTheme(themeName) {
        if (window.AppController) {
            window.AppController.applyTheme(themeName);
        }
    }
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

        if (!form || !window.SchemaEngine) return;

        form.reset();
        setTodaysDate();

        // Iterate over scanned data and populate form fields
        for (const [fieldName, value] of Object.entries(appState.scannedDataObject)) {
            // Get the clean identifier for this field name
            const identifier = window.SchemaEngine.getFieldIdentifierByName(fieldName);
            if (!identifier) continue;

            // Get the field definition from schema
            const field = window.SchemaEngine.getFieldByName(fieldName);
            if (!field) continue;

            // Handle different field types
            if (field.type === 'radio') {
                // Find all radio buttons with this identifier
                const radios = form.querySelectorAll(`input[type="radio"][name="${identifier}"]`);
                radios.forEach(radio => {
                    if (radio.value === value) radio.checked = true;
                });
            } else if (field.type === 'checkbox') {
                // Checkbox type (e.g., PT 100, NiCr-Ni)
                const checkboxId = `has_${identifier}`;
                const numberInputId = identifier;

                const checkbox = document.getElementById(checkboxId);
                const numberInput = document.getElementById(numberInputId);

                if (checkbox && numberInput) {
                    checkbox.checked = true;
                    numberInput.disabled = false;
                    numberInput.value = value || 0;
                }
            } else {
                // Text, number, date, url fields
                const input = document.getElementById(identifier);
                if (input) {
                    input.value = value;
                }
            }
        }

        switchTab('write-tab');
        showMessage(t('messages.copySuccess'), 'ok');
    }
    function saveFormAsJson() { const data = getFormData(); const jsonString = JSON.stringify(data, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const today = new Date().toISOString().slice(0, 10); a.download = `thixx-${today}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => { URL.revokeObjectURL(url); }, CONFIG.URL_REVOKE_DELAY); showMessage(t('messages.saveSuccess'), 'ok'); }
    function loadJsonIntoForm(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const data = JSON.parse(e.target.result); appState.scannedDataObject = data; populateFormFromScan(); showMessage(t('messages.loadSuccess'), 'ok') } catch (error) { const userMessage = error instanceof SyntaxError ? 'Die JSON-Datei hat ein ungültiges Format.' : error.message; ErrorHandler.handle(new Error(userMessage), 'LoadJSON'); } finally { event.target.value = null } }; reader.readAsText(file) }
    
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