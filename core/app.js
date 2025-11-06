// ============================================
// CONFIGURATION
// ============================================
const REPO_PATH = '/THiXX-I/';

const CONFIG = {
    // NEU: Liest die globale Variable, die von index.html gesetzt wird
    TENANT_ID: window.TENANT_ID || 'default',
    MAX_PAYLOAD_SIZE: 880,
    WRITE_RETRIES: 3,
    WRITE_RETRY_DELAY: 1500,
    COOLDOWN_DURATION: 2000,
    MAX_LOG_ENTRIES: 15,
    // NEU: Puffer für die "Smart-Expand"-Berechnung
    SAFETY_BUFFER_PX: 100 // Puffer, damit das Impressum "anscrollbar" bleibt
};

const appState = {
    brand: null,
    schema: null,
    lastReadData: null,
    isScanning: false, // Wird nicht mehr für 'read' verwendet, nur für 'write'
    isWriting: false,
    cooldownActive: false,
    eventLog: []
};

// ============================================
// DOM ELEMENTS (Cached for Performance)
// ============================================
let appLogo, brandIcon, themeSwitcher, imprintContent, privacyLink;
let nfcStatusBadge, messageBanner, nfcFallback;
let readTab, writeTab, protocolCard, docLinkContainer, readActions, readResultContainer, writeFormContainer, legalInfoContainer;
let nfcWriteForm, payloadOutput, payloadSize;
let copyToFormBtn, saveJsonBtn, loadJsonInput;
let tabLinks, tabContents;
let eventLogOutput;
// NEU: Globale Referenzen für die Höhenberechnung
let headerElement, tabsContainer;


// ============================================
// UTILITY FUNCTIONS
// ============================================
function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function showMessage(message, type = 'info', duration = 5000) {
    if (!messageBanner) return;
    
    messageBanner.textContent = message;
    messageBanner.className = `message-banner ${type}`;
    messageBanner.classList.remove('hidden');
    
    addLogEntry(message, type);

    if (duration > 0) {
        setTimeout(() => {
            messageBanner.classList.add('hidden');
        }, duration);
    }
}

function setNfcStatus(statusKey, type = 'info') {
    if (!nfcStatusBadge || !window.I18N) return;
    nfcStatusBadge.textContent = window.I18N.t(`status.${statusKey}`);
    nfcStatusBadge.className = `nfc-badge ${type}`;
}

async function cooldown() {
    appState.cooldownActive = true;
    setNfcStatus('cooldown', 'info');
    await new Promise(resolve => setTimeout(resolve, CONFIG.COOLDOWN_DURATION));
    appState.cooldownActive = false;
}

function addLogEntry(message, type = 'info') {
    if (!window.I18N) return; // Sicherstellen, dass I18N geladen ist
    const timestamp = new Date().toLocaleTimeString(window.I18N.getCurrentLang() || 'de', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    appState.eventLog.unshift({ timestamp, message, type });
    if (appState.eventLog.length > CONFIG.MAX_LOG_ENTRIES) {
        appState.eventLog.pop();
    }
    renderLog();
}

function renderLog() {
    if (!eventLogOutput) return;
    eventLogOutput.innerHTML = '';
    
    if (appState.eventLog.length === 0) {
        eventLogOutput.innerHTML = `<div class="log-entry info">${window.I18N.t('Keine Ereignisse protokolliert') || 'No events logged.'}</div>`;
        return;
    }

    appState.eventLog.forEach(entry => {
        const div = document.createElement('div');
        div.className = `log-entry ${entry.type}`; 
        
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'log-timestamp';
        timestampSpan.textContent = entry.timestamp;
        
        const messageNode = document.createTextNode(` ${entry.message}`);
        
        div.appendChild(timestampSpan);
        div.appendChild(messageNode);
        eventLogOutput.appendChild(div);
    });
}


// ============================================
// BRAND & SCHEMA LOADING
// ============================================
async function loadBrand() {
    try {
        const response = await fetch(`${REPO_PATH}branding/${CONFIG.TENANT_ID}/brand.json`);
        if (!response.ok) throw new Error('Brand not found');
        
        appState.brand = await response.json();
        appState.schema = window.SchemaEngine.loadSchema(appState.brand);
        
        console.log('[App] Brand loaded:', appState.brand.tenantId);
        return appState.brand;
    } catch (error) {
        console.warn('[App] Brand load failed, using defaults:', error);
        
        appState.brand = {
            tenantId: 'default',
            appName: 'ThiXX NFC Tool',
            short_name: 'ThiXX',
            theme: 'customer-brand',
            lockTheme: false,
            icons: {
                icon192: 'branding/default/icons/icon-192.png',
                icon512: 'branding/default/icons/icon-512.png'
            },
            logo: { type: 'thixx', customClass: 'thixx' },
            imprint: {
                name: 'Günter Struck',
                address: 'Musterstraße 1',
                city: '12345 Musterstadt'
            },
            privacyPolicyUrl: 'branding/default/datenschutz.html',
            documentLinks: []
        };
        
        appState.schema = window.SchemaEngine.getDefaultSchema();
        return appState.brand;
    }
}

function applyBrandToUI() {
    const brand = appState.brand;
    
    // Logo
    if (appLogo && brand.logo) {
        if (brand.logo.type === 'thixx') {
            appLogo.className = 'logo thixx';
            appLogo.innerHTML = `
                <span class="logo-orange">T</span>
                <span class="logo-orange">H</span>
                <span class="i-letter">
                    <span class="i-dot"></span>
                </span>
                <span class="logo-gray">XX</span>
            `;
        } else if (brand.logo.type === 'text') {
            appLogo.className = `logo ${brand.logo.customClass || ''}`;
            appLogo.textContent = brand.appName || brand.short_name || 'NFC Tool';
        }
    }

    // Brand Icon
    if (brandIcon && brand.icons?.icon512) {
        brandIcon.src = `${REPO_PATH}${brand.icons.icon512}`;
    }

    // Theme Switcher Lock
    if (brand.lockTheme && themeSwitcher) {
        themeSwitcher.classList.add('hidden');
    } else if (themeSwitcher) {
        themeSwitcher.classList.remove('hidden');
    }

    // Imprint
    if (imprintContent && brand.imprint) {
        imprintContent.innerHTML = `
            <p><strong data-i18n="imprintTitle"></strong><br>
            Angaben gemäß § 5 TMG:<br>
            ${brand.imprint.name}<br>
            ${brand.imprint.address}<br>
            ${brand.imprint.city}</p>
        `;
    }

    // Privacy Policy Link
    if (privacyLink && brand.privacyPolicyUrl) {
        privacyLink.href = `${REPO_PATH}${brand.privacyPolicyUrl}`;
    }

    // Brand CSS
    const brandCssLink = document.getElementById('brand-css');
    if (brandCssLink) {
        brandCssLink.href = `${REPO_PATH}branding/${CONFIG.TENANT_ID}/brand.css`;
    }
}

// ============================================
// THEME SWITCHING
// ============================================
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('preferred-theme', theme);
    
    // Update active button
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

function initThemeSwitcher() {
    const themeButtons = document.querySelectorAll('.theme-btn');
    
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });
    
    // Set initial active state
    const currentTheme = document.documentElement.getAttribute('data-theme');
    themeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
}

// ============================================
// TAB SWITCHING
// ============================================

/**
 * NEUE FUNKTION: Berechnet die optimale Höhe für den "Smart-Expand"-Modus.
 */
function autoExpandToFitScreen(elementToExpand) {
    if (!elementToExpand) return;

    // Wir brauchen die Elemente für die Berechnung
    const container = document.querySelector('.container');
    if (!headerElement || !tabsContainer || !container) return;

    // Höhe der Elemente über dem Inhalt
    const headerHeight = headerElement.offsetHeight;
    const tabsHeight = (tabsContainer && !tabsContainer.classList.contains('hidden')) ? tabsContainer.offsetHeight : 0;
    
    // Container-Padding
    const containerStyle = window.getComputedStyle(container);
    const containerPadding = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    
    // Alle Elemente über dem Container
    const otherElementsHeight = headerHeight + tabsHeight + containerPadding;
    
    // Verfügbare Höhe im Viewport
    const viewportHeight = window.innerHeight;
    const availableHeight = viewportHeight - otherElementsHeight - CONFIG.SAFETY_BUFFER_PX;

    // Mindesthöhe (Titel + etwas Puffer)
    const titleElement = elementToExpand.querySelector('h2');
    const minRequiredHeight = titleElement ? titleElement.offsetHeight + 60 : 100;

    // Zielhöhe ist entweder die verfügbare Höhe oder die Mindesthöhe
    const targetHeight = Math.max(availableHeight, minRequiredHeight);

    // Speichere die berechnete Höhe für das Umschalten
    elementToExpand.dataset.autoHeight = `${targetHeight}px`;
    
    // Setze die inline-Höhe
    elementToExpand.style.maxHeight = `${targetHeight}px`;
}


function initTabs() {
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            // --- Dynamische Höhe beim Tab-Wechsel immer zurücksetzen ---
            if (readResultContainer && readResultContainer.style.maxHeight) {
                readResultContainer.style.maxHeight = null;
                // 'autoHeight' nicht löschen, wird für toggle gebraucht
            }
            if (writeFormContainer && writeFormContainer.style.maxHeight) {
                writeFormContainer.style.maxHeight = null;
            }
            // --- ENDE ---

            const targetTab = link.dataset.tab;
            
            // Update active states
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === targetTab);
            });

            // --- ANGEPASSTE "SMART EXPAND"-LOGIK ---
            if (targetTab === 'read-tab') {
                if (readResultContainer) {
                    readResultContainer.style.maxHeight = null; 

                    if (appState.lastReadData) {
                        // Daten existieren: "Smart-Expand"
                        readResultContainer.classList.remove('expanded');
                        
                        // Höhe berechnen (mit kurzem Timeout, damit Layout stabil ist)
                        setTimeout(() => {
                            if (!readTab.classList.contains('active')) return;
                            autoExpandToFitScreen(readResultContainer);
                        }, 50); 

                    } else {
                        // Keine Daten: Voll aufklappen, um Platzhalter zu zeigen
                        readResultContainer.classList.add('expanded');
                    }
                }
            } else if (targetTab === 'write-tab') {
                if (writeFormContainer) {
                    // Schreib-Formular: Immer "Smart-Expand"
                    writeFormContainer.style.maxHeight = null;
                    writeFormContainer.classList.remove('expanded');
                    
                    setTimeout(() => {
                        if (!writeTab.classList.contains('active')) return;
                        autoExpandToFitScreen(writeFormContainer);
                    }, 50);
                }
            }
            // --- ENDE DER NEUEN LOGIK ---


            // Status-Text beim Tab-Wechsel aktualisieren
            if (!appState.cooldownActive && !appState.isWriting) {
                 if (targetTab === 'write-tab') {
                    setNfcStatus('startWriting', 'info');
                 } else {
                    // Im passiven Modus ist der Status immer 'startReading' (oder 'iosRead')
                    const msgKey = isIOS() ? 'iosRead' : 'startReading';
                    setNfcStatus(msgKey, 'info');
                 }
            }
        });
    });
}

// ============================================
// COLLAPSIBLE SECTIONS
// ============================================
function makeCollapsible(el) {
    if (!el || el.dataset.collapsibleApplied) return;
    el.dataset.collapsibleApplied = 'true';

    // NEU: Toggle-Logik aus O.Thimm-PWA (3-Zustands-Logik)
    const toggle = () => {
        const isFullyExpanded = el.classList.contains('expanded');
        
        if (isFullyExpanded) {
            // VON GANZ OFFEN -> ZURÜCK ZU "SMART-EXPAND"
            el.classList.remove('expanded');
            if (el.dataset.autoHeight) {
                el.style.maxHeight = el.dataset.autoHeight;
            } else {
                el.style.maxHeight = null; // Fallback auf CSS-Standard (6rem)
            }
        } else {
            // VON "SMART-EXPAND" (oder ganz zu) -> ZU GANZ OFFEN
            el.style.maxHeight = null; // Inline-Style entfernen
            el.classList.add('expanded');
        }
    };

    // Klick auf Overlay = Immer GANZ expandieren
    const overlay = el.querySelector('.collapsible-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); 
            el.style.maxHeight = null; // Inline-Style (von autoHeight) entfernen
            el.classList.add('expanded');
        });
    }

    // Klick auf den Container = Togglen
    el.addEventListener('click', (e) => {
        // Interaktive Elemente ignorieren
        const interactiveTags = ['input', 'select', 'textarea', 'button', 'label', 'summary', 'details', 'a'];
        if (interactiveTags.includes(e.target.tagName.toLowerCase()) || e.target.closest('.collapsible-overlay')) {
            return;
        }
        toggle();
    });
}

function initCollapsibles() {
    document.querySelectorAll('.collapsible').forEach(el => makeCollapsible(el));
}

// ============================================
// NFC READING (PASSIV, NUR ÜBER URL)
// ============================================
function processUrlParameters() {
    // KORREKTUR: Liest Parameter aus ?search UND #hash
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    
    // Parameter aus Hash zu params hinzufügen (falls nicht schon vorhanden)
    hashParams.forEach((value, key) => {
        if (!params.has(key)) {
            params.append(key, value);
        }
    });
    // --- ENDE KORREKTUR ---

    params.delete('tenant'); // Mandanten-Parameter nicht als Daten interpretieren
    
    if (params.toString() === '') {
        return false; // Keine Daten in der URL
    }

    // URL-Parameter mit dem Schema-Engine dekodieren
    const data = window.SchemaEngine.decodeUrl(params);

    if (Object.keys(data).length > 0) {
        appState.lastReadData = data;
        
        // Daten im Protokoll-Tab anzeigen
        if (protocolCard) {
            window.SchemaEngine.renderDisplay(data, protocolCard);
        }
        
        // Dokumenten-Links basierend auf den Daten rendern
        renderDocumentLinks(data); // <-- 'data' wird übergeben
        
        // Aktionen (z.B. "In Formular kopieren") einblenden
        if (readActions) {
            readActions.classList.remove('hidden');
        }
        
        // Rohdaten-URL anzeigen
        const rawDataOutput = document.getElementById('raw-data-output');
        if (rawDataOutput) {
            // Zeige die Original-URL (kann Hash oder Search sein)
            rawDataOutput.value = window.location.href;
        }
        
        // Automatisch zum "Lesen"-Tab wechseln
        const readTabLink = document.querySelector('.tab-link[data-tab="read-tab"]');
        if (readTabLink) {
            // Dieser Klick löst die neue "Smart-Expand"-Logik in initTabs() aus
            readTabLink.click();
        }
        
        showMessage(window.I18N.t('messages.readSuccess'), 'ok');
        
        // URL "säubern", damit die Daten bei einem Reload nicht erneut gelesen werden
        const cleanUrl = window.location.pathname + `?tenant=${CONFIG.TENANT_ID}`;
        history.replaceState(null, '', cleanUrl);
        
        return true;
    }
    
    return false;
}

// ============================================
// NFC WRITING
// ============================================
async function handleNfcBadgeClick() {
    if (appState.isWriting || appState.cooldownActive) return;

    if (writeTab && writeTab.classList.contains('active')) {
        // Im "Write" tab: Schreibvorgang starten
        await startNfcWriting();
    } else {
        // Im "Read" tab: Nur eine Info anzeigen.
        if (window.I18N) {
            const msgKey = isIOS() ? 'iosRead' : 'startReading';
            showMessage(window.I18N.t(`status.${msgKey}`), 'info', 8000);
        }
    }
}

async function startNfcWriting() {
    if (isIOS()) {
        showMessage(window.I18N?.t('errors.NotSupportedError') || 'NFC Write not supported', 'err');
        return;
    }
    
    if (!('NDEFReader' in window)) {
        showMessage(window.I18N?.t('errors.NotSupportedError') || 'NFC not supported', 'err');
        return;
    }

    if (appState.isWriting || appState.cooldownActive) return;

    // Collect form data
    const formData = collectFormData();
    
    // Validate
    const errors = window.SchemaEngine.validate(formData);
    if (errors.length > 0) {
        showMessage(errors[0], 'err');
        return;
    }

    // KORREKTUR: Basis-URL für den Tag MUSS den Hash-Mechanismus verwenden (#)
    // nicht den Search-Mechanismus (?), damit iOS es lesen kann.
    const baseUrl = `${window.location.origin}${REPO_PATH}${CONFIG.TENANT_ID}/index.html`;
    const dataUrl = window.SchemaEngine.encodeUrl(
        formData, 
        baseUrl
    ).replace('?', '#'); // <-- WICHTIGE ÄNDERUNG: Ersetze ? durch #

    const payloadBytes = new TextEncoder().encode(dataUrl).length;
    if (payloadBytes > CONFIG.MAX_PAYLOAD_SIZE) {
        showMessage(window.I18N?.t('messages.payloadTooLarge') || 'Payload too large', 'err');
        return;
    }

    appState.isWriting = true;
    let attempt = 0;

    while (attempt < CONFIG.WRITE_RETRIES) {
        attempt++;
        
        try {
            setNfcStatus('writing', 'info');
            
            if (window.I18N) {
                showMessage(
                    window.I18N.t('messages.writeAttempt', { 
                        replace: { attempt: attempt.toString(), total: CONFIG.WRITE_RETRIES.toString() }
                    }),
                    'info',
                    0
                );
            }

            const ndef = new NDEFReader();
            await ndef.write({
                records: [{ recordType: 'url', data: dataUrl }]
            });

            setNfcStatus('success', 'ok');
            if (window.I18N) {
                showMessage(window.I18N.t('messages.writeSuccess'), 'ok', 3000);
            }
            
            appState.isWriting = false;
            await cooldown();
            setNfcStatus('startWriting', 'info');
            return;

        } catch (error) {
            console.error(`[NFC] Write attempt ${attempt} failed:`, error);
            
            if (attempt >= CONFIG.WRITE_RETRIES) {
                handleNfcError(error);
                appState.isWriting = false;
                await cooldown();
                setNfcStatus('startWriting', 'info');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, CONFIG.WRITE_RETRY_DELAY));
        }
    }
}

function handleNfcError(error) {
    console.error('[NFC] Error:', error);
    
    let errorKey = 'unknown';
    if (error.name && window.I18N?.t(`errors.${error.name}`)) {
        errorKey = error.name;
    }
    
    const errorMessage = window.I18N?.t(`errors.${errorKey}`) || error.message;
    showMessage(errorMessage, 'err');
    setNfcStatus('error', 'err');
}

// ============================================
// FORM HANDLING
// ============================================
function collectFormData() {
    const formData = {};
    if (!nfcWriteForm) return formData;

    const formElements = nfcWriteForm.querySelectorAll('[data-field-name]');

    formElements.forEach(element => {
        const fieldName = element.dataset.fieldName;
        if (!fieldName) return;

        const field = window.SchemaEngine.getFieldByName(fieldName);
        if (!field) return;

        if (element.type === 'radio') {
            if (element.checked) {
                formData[fieldName] = element.value;
            }
        } else if (element.type === 'checkbox') {
            const targetId = element.dataset.targetField;
            const numberInput = document.getElementById(targetId);
            if (element.checked && numberInput && numberInput.value) {
                formData[fieldName] = numberInput.value;
            }
        } else if (element.type === 'number' && element.dataset.checkboxValue === 'true') {
            // Zahlenfeld, das zu einer Checkbox gehört – wird durch Checkbox verarbeitet
        } else if (element.value && element.value.trim() !== '') {
            // Standard inputs (text, date, number ohne Checkbox)
            formData[fieldName] = element.value;
        }
    });

    return formData;
}

function populateForm(data) {
    if (!nfcWriteForm || !data) return;
    
    for (let fieldName in data) {
        const value = data[fieldName];
        const field = window.SchemaEngine.getFieldByName(fieldName);
        
        if (!field) continue; 

        const identifier = window.SchemaEngine.getFieldIdentifierByName(fieldName);
        if (!identifier) continue; 

        if (field.type === 'radio') {
            const radioButton = nfcWriteForm.querySelector(`input[name="${identifier}"][value="${value}"]`);
            if (radioButton) radioButton.checked = true;
        } else if (field.type === 'checkbox') {
            const checkbox = document.getElementById(`has_${identifier}`);
            if (checkbox) checkbox.checked = true;
            
            const numberInput = document.getElementById(identifier);
            if (numberInput) {
                numberInput.value = value;
                numberInput.disabled = false;
            }
        } else {
            const element = document.getElementById(identifier);
            if (element) {
                element.value = value;
            }
        }
    }
    
    updatePayloadDisplay();
}


function updatePayloadDisplay() {
    if (!payloadOutput || !payloadSize) return;
    
    const formData = collectFormData();
    
    const baseUrl = `${window.location.origin}${REPO_PATH}${CONFIG.TENANT_ID}/index.html`;
    // KORREKTUR: Auch die Vorschau muss den Hash-Mechanismus (#) zeigen
    const dataUrl = window.SchemaEngine.encodeUrl(
        formData,
        baseUrl
    ).replace('?', '#'); // <-- WICHTIGE ÄNDERUNG: Ersetze ? durch #
    
    payloadOutput.value = dataUrl;
    
    const bytes = new TextEncoder().encode(dataUrl).length;
    payloadSize.textContent = `${bytes} / ${CONFIG.MAX_PAYLOAD_SIZE} Bytes`;
    
    if (bytes > CONFIG.MAX_PAYLOAD_SIZE) {
        payloadSize.classList.add('limit-exceeded');
    } else {
        payloadSize.classList.remove('limit-exceeded');
    }
}

// ============================================
// DOCUMENT LINKS
// ============================================
function renderDocumentLinks(data = null) { // <-- 'data' als Parameter
    if (!docLinkContainer) return;
    
    docLinkContainer.innerHTML = '';

    // --- NEUE LOGIK (Dynamischer Link) ---
    // Prüfe, ob die gelesenen Daten einen "Doc" Link enthalten
    const schema = window.SchemaEngine.getCurrentSchema();
    const docField = schema.fields.find(f => f.shortKey === 'Doc');
    const dataUrl = (docField && data && data[docField.name]) ? data[docField.name] : null;

    if (dataUrl) {
        // Ja, ein Link ist auf dem Tag gespeichert. Zeige DIESEN an.
        const button = document.createElement('button');
        button.className = 'btn doc-link-btn';
        
        // KORREKTUR: Das Label sollte immer der Standard-Key 'docOperatingManual'
        // sein, nicht der Feldname.
        const labelKey = 'docOperatingManual'; 
        button.setAttribute('data-i18n', labelKey);
        // Fallback, falls der Key fehlt (sollte nicht passieren)
        button.textContent = window.I18N?.t(labelKey) || 'Betriebsanleitung öffnen'; 
        
        button.addEventListener('click', () => {
            window.open(dataUrl, '_blank', 'noopener,noreferrer');
            // Caching-Logik für den dynamischen Link
            if (link.cacheOffline && 'serviceWorker' in navigator) { // 'link' war hier undefined, korrigiert zu 'docField' (obwohl cacheOffline dort nicht definiert ist)
                // Besser: Wir nehmen an, dass dynamische Links gecacht werden sollen, wenn sie das Schema-Attribut haben
                // Da das Schema-Attribut fehlt, lassen wir es vorerst weg oder fügen es im Schema hinzu.
                // Sicherer ist, es wegzulassen, wenn es nicht im Schema ist.
                // ODER wir beziehen uns auf das Schema-Feld, falls es 'cacheOffline' hätte
                // ODER wir nehmen den statischen Link (falls vorhanden) als Vorlage
                
                // EINFACHSTE LÖSUNG: Caching für dynamische Links (die nicht in brand.json sind)
                // ist im Moment nicht vorgesehen. Wir rufen es nur für statische auf.
                
                // KORREKTUR: Caching nur, wenn es in der Konfiguration steht.
                // Da 'dataUrl' dynamisch ist, hat es keine 'cacheOffline'-Property.
                // Wir fügen es hinzu, wenn das *Schema-Feld* es erlauben würde (zukünftige Fkt.)
                // Fürs Erste: Caching für dynamische Links initiieren.
                if ('serviceWorker' in navigator) {
                     navigator.serviceWorker.controller?.postMessage({
                        action: 'cache-doc',
                        url: dataUrl,
                        tenant: CONFIG.TENANT_ID
                    });
                }
            }
        });
        docLinkContainer.appendChild(button);
        return; // WICHTIG: Beenden, damit statische Links nicht angezeigt werden
    }

    // --- ALTE LOGIK (Statischer Link) als Fallback ---
    // Nein, kein Link auf dem Tag. Zeige statische Links aus brand.json
    const documentLinks = window.SchemaEngine.getDocumentLinks();
    if (!documentLinks || documentLinks.length === 0) {
         // Weder dynamisch noch statisch ein Link vorhanden.
        return;
    }
    
    documentLinks.forEach(link => {
        const button = document.createElement('button');
        button.className = 'btn doc-link-btn';
        button.setAttribute('data-i18n', link.labelKey);
        button.textContent = window.I18N?.t(link.labelKey) || link.labelKey;
        
        button.addEventListener('click', () => {
            window.open(link.url, '_blank', 'noopener,noreferrer');
            
            // Caching für statische Links
            if (link.cacheOffline && 'serviceWorker' in navigator) {
                navigator.serviceWorker.controller?.postMessage({
                    action: 'cache-doc',
                    url: link.url,
                    tenant: CONFIG.TENANT_ID
                });
            }
        });
        
        docLinkContainer.appendChild(button);
    });
}

// ============================================
// FILE OPERATIONS
// ============================================
function saveToFile() {
    const formData = collectFormData();
    
    if (Object.keys(formData).length === 0) {
        showMessage(window.I18N?.t('messages.noDataToCopy') || 'No data to save', 'err');
        return;
    }
    
    const json = JSON.stringify(formData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfc-data-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showMessage(window.I18N?.t('messages.saveSuccess') || 'Data saved', 'ok', 3000);
}

function loadFromFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            populateForm(data);
            showMessage(window.I18N?.t('messages.loadSuccess') || 'Data loaded', 'ok', 3000);
        } catch (error) {
            console.error('[File] Parse error:', error);
            showMessage('Invalid JSON file', 'err');
        }
    };
    
    reader.readAsText(file);
}

function copyReadToForm() {
    if (!appState.lastReadData) {
        showMessage(window.I18N?.t('messages.noDataToCopy') || 'No data to copy', 'err');
        return;
    }
    
    populateForm(appState.lastReadData);
    
    const writeTabLink = document.querySelector('.tab-link[data-tab="write-tab"]');
    if (writeTabLink) {
        writeTabLink.click();
    }
    
    showMessage(window.I18N?.t('messages.copySuccess') || 'Data copied to form', 'ok', 3000);
}

// ============================================
// UPDATE CHECK
// ============================================
async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) return;
    
    showMessage(window.I18N?.t('messages.updateChecking') || 'Checking for updates...', 'info', 0);
    
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
            showMessage(window.I18N?.t('messages.noUpdateFound') || 'No updates available', 'info', 3000);
            return;
        }
        
        await registration.update();
        
        if (registration.waiting) {
            showUpdateBanner();
        } else {
            showMessage(window.I18N?.t('messages.noUpdateFound') || 'No updates available', 'info', 3000);
        }
    } catch (error) {
        console.error('[Update] Check failed:', error);
        showMessage('Update check failed', 'err', 3000);
    }
}

// ============================================
// SERVICE WORKER
// ============================================
function showUpdateBanner() {
    const banner = document.getElementById('update-banner');
    const reloadBtn = document.getElementById('reload-button');
    
    if (banner && reloadBtn) {
        banner.classList.remove('hidden');
        reloadBtn.addEventListener('click', () => {
            navigator.serviceWorker.getRegistration().then(reg => {
                reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
            });
            window.location.reload();
        });
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register(`${REPO_PATH}sw.js`, {
                scope: REPO_PATH 
            });
            console.log('[SW] Registered with scope:', registration.scope);
            
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner();
                        }
                    });
                }
            });
        } catch (error) {
            console.error('[SW] Registration failed:', error);
        }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    if (nfcStatusBadge) {
        nfcStatusBadge.addEventListener('click', handleNfcBadgeClick);
    }
    
    if (copyToFormBtn) {
        copyToFormBtn.addEventListener('click', copyReadToForm);
    }
    
    if (saveJsonBtn) {
        saveJsonBtn.addEventListener('click', saveToFile);
    }
    
    if (loadJsonInput) {
        loadJsonInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                loadFromFile(file);
            }
        });
    }
    
    if (nfcWriteForm) {
        nfcWriteForm.addEventListener('input', updatePayloadDisplay);
        nfcWriteForm.addEventListener('change', updatePayloadDisplay);
    }
    
    const checkUpdateBtn = document.getElementById('check-for-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkForUpdate);
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Starting initialization...');
    
    // Cache DOM elements
    appLogo = document.getElementById('app-logo');
    brandIcon = document.getElementById('brand-icon');
    themeSwitcher = document.querySelector('.theme-switcher');
    imprintContent = document.getElementById('imprint-content');
    privacyLink = document.getElementById('privacy-link');
    nfcStatusBadge = document.getElementById('nfc-status-badge');
    messageBanner = document.getElementById('message-banner');
    nfcFallback = document.getElementById('nfc-fallback');
    protocolCard = document.getElementById('protocol-card');
    docLinkContainer = document.getElementById('doc-link-container');
    readActions = document.getElementById('read-actions');
    readResultContainer = document.getElementById('read-result');
    writeFormContainer = document.getElementById('write-form-container');
    readTab = document.getElementById('read-tab');
    writeTab = document.getElementById('write-tab');
    nfcWriteForm = document.getElementById('nfc-write-form');
    payloadOutput = document.getElementById('payload-output');
    payloadSize = document.getElementById('payload-size');
    copyToFormBtn = document.getElementById('copy-to-form-btn');
    saveJsonBtn = document.getElementById('save-json-btn');
    loadJsonInput = document.getElementById('load-json-input');
    tabLinks = document.querySelectorAll('.tab-link');
    tabContents = document.querySelectorAll('.tab-content');
    eventLogOutput = document.getElementById('event-log-output');
    // NEU: Globale Referenzen für Höhenberechnung
    headerElement = document.querySelector('header');
    tabsContainer = document.querySelector('.tabs');
    legalInfoContainer = document.getElementById('legal-info');
    
    // Load brand & translations
    await loadBrand();
    
    if (window.I18N) {
        await window.I18N.loadTranslations(CONFIG.TENANT_ID);
    }
    
    // Apply brand to UI
    applyBrandToUI();
    
    // Build form from schema
    if (window.SchemaEngine && nfcWriteForm) {
        window.SchemaEngine.buildForm(nfcWriteForm, appState.schema);
    }
    
    if (window.I18N) {
        window.I18N.applyTranslations();
    }
    
    // Initialize UI components
    initThemeSwitcher();
    initTabs();
    initCollapsibles();
    initEventListeners();
    
    // [DER NEUE ABLAUF]
    const dataLoadedFromUrl = processUrlParameters();

    if (!appState.cooldownActive) {
        const writeTabLink = document.querySelector('.tab-link[data-tab="write-tab"]');
        
        if (isIOS()) {
            setNfcStatus('iosRead', 'info');
            if (writeTabLink) {
                writeTabLink.style.display = 'none'; 
            }
        } else if ('NDEFReader' in window) {
            setNfcStatus('startReading', 'info');
        } else {
            setNfcStatus('unsupported', 'err');
            if (nfcFallback) nfcFallback.classList.remove('hidden');
            if (writeTabLink) {
                writeTabLink.style.display = 'none'; 
            }
        }
    }

    // 3. Wenn keine Daten aus URL geladen wurden, zeige Placeholder
    if (readResultContainer && !dataLoadedFromUrl) {
        if (window.SchemaEngine && protocolCard) {
            window.SchemaEngine.renderDisplay({}, protocolCard); // Platzhalter rendern
        }
        // HINZUGEFÜGT: Zeige statische Links (falls vorhanden) auch beim Start
        renderDocumentLinks(appState.lastReadData); 
        readResultContainer.classList.add('expanded');
    }
    
    console.log('[App] Initialization complete for tenant:', CONFIG.TENANT_ID);
});