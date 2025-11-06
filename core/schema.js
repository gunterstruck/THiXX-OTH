/**
 * SCHEMA MODULE
 * Generisches Schema-System für Formular-Generierung, URL-Encoding/Decoding, Validierung
 */

(function(window) {
    'use strict';

    const Schema = {
        current: null,
        documentLinks: [],
        fieldIdentifiers: new Map() // NEU: Map für name -> identifier
    };

    // NEU: Map für identifier -> name
    const identifierToField = new Map();

    // NEU: Setzt die Identifier-Maps zurück
    function resetFieldIdentifiers() {
        Schema.fieldIdentifiers.clear();
        identifierToField.clear();
    }

    // NEU: Sichere Übersetzung mit Fallback
    function translate(key, fallback = '') {
        try {
            if (window.I18N && typeof window.I18N.t === 'function') {
                const result = window.I18N.t(key);
                if (result) {
                    return result;
                }
            }
        } catch (error) {
            console.warn('[Schema] Translation lookup failed:', key, error);
        }

        return fallback || key;
    }

    // NEU: Registriert eine Zuordnung
    function registerFieldIdentifier(field, identifier) {
        Schema.fieldIdentifiers.set(field.name, identifier);
        identifierToField.set(identifier, field.name);
    }

    // NEU: Holt den sauberen Identifier (z.B. "gepruft-von") anhand des Feldnamens (z.B. "geprüft von")
    function getFieldIdentifierByName(name) {
        return Schema.fieldIdentifiers.get(name) || null;
    }

    // NEU: Holt den Feldnamen anhand des sauberen Identifiers
    function getFieldNameByIdentifier(identifier) {
        return identifierToField.get(identifier) || null;
    }

    // NEU: Erstellt eine saubere, HTML-sichere ID aus einem Feldnamen/ShortKey
    function createFieldIdentifier(field, usedIdentifiers) {
        const base = (field.shortKey || field.name || 'field')
            .toString()
            .normalize('NFD') // Umlaute trennen (z.B. "ü" -> "u" + "¨")
            .replace(/[\u0300-\u036f]/g, '') // Diakritische Zeichen entfernen
            .replace(/[^a-zA-Z0-9_]+/g, '-') // Alle nicht-alphanumerischen Zeichen durch "-" ersetzen
            .replace(/^-+|-+$/g, '') // Führende/abschließende "-" entfernen
            .toLowerCase() || 'field';

        let identifier = base;
        let counter = 1;
        // Sicherstellen, dass die ID einzigartig ist
        while (usedIdentifiers.has(identifier) || identifierToField.has(identifier)) {
            identifier = `${base}-${counter++}`;
        }

        usedIdentifiers.add(identifier);
        return identifier;
    }


    /**
     * Default-Schema (aus heutigem fieldMap) für Backward-Compatibility
     */
    function getDefaultSchema() {
        return {
            fields: [
                { name: 'HK-Nr', shortKey: 'HK', type: 'text', group: 'main', required: false },
                { name: 'KKS', shortKey: 'KKS', type: 'text', group: 'main', required: false },
                { name: 'Leistung', shortKey: 'P', type: 'number', unit: 'kW', group: 'electrical', required: false },
                { name: 'Strom', shortKey: 'I', type: 'number', unit: 'A', group: 'electrical', required: false },
                { name: 'Spannung', shortKey: 'U', type: 'number', unit: 'V', group: 'electrical', required: false, min: 0, max: 1000 },
                { name: 'Widerstand', shortKey: 'R', type: 'number', unit: 'Ω', group: 'electrical', required: false },
                { name: 'Anzahl Heizkabeleinheiten', shortKey: 'Anz', type: 'number', unit: 'Stk', group: 'heating', required: false },
                { name: 'Trennkasten', shortKey: 'TB', type: 'number', unit: 'Stk', group: 'heating', required: false },
                { name: 'Heizkabeltyp', shortKey: 'HKT', type: 'text', group: 'heating', required: false },
                { name: 'Schaltung', shortKey: 'Sch', type: 'radio', group: 'heating', required: false, options: [
                    { value: 'Stern', i18nKey: 'schaltungOptions.stern' },
                    { value: 'Dreieck', i18nKey: 'schaltungOptions.dreieck' },
                    { value: 'Wechselstrom', i18nKey: 'schaltungOptions.wechselstrom' }
                ]},
                { name: 'PT 100', shortKey: 'PT100', type: 'checkbox', group: 'sensors', required: false },
                { name: 'NiCr-Ni', shortKey: 'NiCr', type: 'checkbox', group: 'sensors', required: false },
                { name: 'Regler', shortKey: 'Reg', type: 'number', unit: '°C', group: 'control', required: false },
                { name: 'Sicherheitsregler/Begrenzer', shortKey: 'Sich', type: 'number', unit: '°C', group: 'control', required: false },
                { name: 'Wächter', shortKey: 'Wäch', type: 'number', unit: '°C', group: 'control', required: false },
                { name: 'Projekt-Nr', shortKey: 'Proj', type: 'text', group: 'footer', required: false },
                { name: 'geprüft von', shortKey: 'Chk', type: 'text', group: 'footer', required: false },
                { name: 'am', shortKey: 'Date', type: 'date', group: 'footer', required: false },
                // KORREKTUR: 'deprecated: true' entfernt, damit das Feld im Formular erscheint
                { name: 'Dokumentation', shortKey: 'Doc', type: 'url', group: 'footer', required: false }
            ],
            groups: [
                { id: 'main', labelKey: 'acceptanceProtocol', order: 1 },
                { id: 'electrical', labelKey: 'groupElectrical', order: 2 },
                { id: 'heating', labelKey: 'groupHeating', order: 3 },
                { id: 'sensors', labelKey: 'Messwertgeber', order: 4 },
                { id: 'control', labelKey: 'groupControl', order: 5 },
                { id: 'footer', labelKey: 'groupFooter', order: 6 }
            ]
        };
    }

    /**
     * Lädt Schema aus brand.json
     * @param {Object} brand - Brand-Objekt aus brand.json
     * @returns {Object} Schema
     */
    function loadSchema(brand) {
        if (brand.dataSchema && brand.dataSchema.fields) {
            Schema.current = brand.dataSchema;
            console.log('[Schema] Custom schema loaded from brand');
        } else {
            Schema.current = getDefaultSchema();
            console.log('[Schema] Using default schema (backward-compatible)');
        }

        // Dokument-Links speichern
        Schema.documentLinks = brand.documentLinks || [];
        
        return Schema.current;
    }

    /**
     * Baut Formular aus Schema
     * @param {HTMLFormElement} form - Das Form-Element
     * @param {Object} schema - Das Schema
     */
    function buildForm(form, schema) {
        if (!form || !schema) return;

        form.innerHTML = '';

        // NEU: Maps zurücksetzen und Set für benutzte IDs
        resetFieldIdentifiers();
        const usedIdentifiers = new Set();

        // Gruppiere Felder
        const groups = schema.groups || [{ id: 'default', labelKey: 'acceptanceProtocol', order: 1 }];
        groups.sort((a, b) => a.order - b.order);

        groups.forEach(group => {
            const groupFields = schema.fields.filter(f => f.group === group.id && !f.deprecated && !f.hiddenOnIOS);

            if (groupFields.length === 0) return;

            // Spezial-Behandlung für Radio/Checkbox-Gruppen
            const hasRadio = groupFields.some(f => f.type === 'radio');
            const hasCheckbox = groupFields.some(f => f.type === 'checkbox');

            if (hasRadio || hasCheckbox) {
                // Erstelle Fieldset
                const fieldset = document.createElement('fieldset');
                fieldset.className = 'form-group';

                const legend = document.createElement('legend');
                legend.setAttribute('data-i18n', group.labelKey);
                legend.textContent = translate(group.labelKey, group.labelKey);
                fieldset.appendChild(legend);

                const container = document.createElement('div');
                container.className = hasRadio ? 'radio-group' : 'checkbox-group';

                groupFields.forEach(field => {
                    // NEU: Saubere ID generieren und registrieren
                    const identifier = createFieldIdentifier(field, usedIdentifiers);
                    registerFieldIdentifier(field, identifier);

                    if (field.type === 'radio') {
                        field.options.forEach((opt, idx) => {
                            const label = document.createElement('label');
                            const radio = document.createElement('input');
                            radio.type = 'radio';
                            radio.name = identifier; // NEU: saubere ID
                            radio.value = opt.value;
                            radio.id = `${identifier}-${idx}`; // NEU: saubere ID
                            radio.dataset.fieldName = field.name; // NEU: originaler Name
                            if (idx === 0) radio.checked = true;

                            const span = document.createElement('span');
                            span.setAttribute('data-i18n', opt.i18nKey);
                            span.textContent = translate(opt.i18nKey, opt.value);

                            label.appendChild(radio);
                            label.appendChild(span);
                            container.appendChild(label);
                        });
                    } else if (field.type === 'checkbox') {
                        const label = document.createElement('label');
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `has_${identifier}`; // NEU: saubere ID
                        checkbox.name = `has_${identifier}`; // NEU: saubere ID
                        checkbox.dataset.fieldName = field.name; // NEU: originaler Name
                        checkbox.dataset.targetField = identifier; // NEU: Ziel-Input-ID

                        const labelText = document.createTextNode(translate(field.name, field.name));

                        label.appendChild(checkbox);
                        label.appendChild(labelText);

                        const numberInput = document.createElement('input');
                        numberInput.type = 'number';
                        numberInput.id = identifier; // NEU: saubere ID
                        numberInput.name = identifier; // NEU: saubere ID
                        numberInput.dataset.fieldName = field.name; // NEU: originaler Name
                        numberInput.dataset.checkboxValue = 'true'; // NEU: Markierung als Checkbox-Zahlenfeld
                        numberInput.min = 0;
                        numberInput.value = 0;
                        numberInput.disabled = true;

                        // Event-Handler
                        checkbox.addEventListener('change', (e) => {
                            numberInput.disabled = !e.target.checked;
                        });

                        container.appendChild(label);
                        container.appendChild(numberInput);
                    }
                });

                fieldset.appendChild(container);
                form.appendChild(fieldset);

            } else {
                // Standard-Grid für Text/Number/Date/URL-Felder
                const gridContainer = document.createElement('div');
                gridContainer.className = 'form-grid';

                groupFields.forEach(field => {
                    // NEU: Saubere ID generieren und registrieren
                    const identifier = createFieldIdentifier(field, usedIdentifiers);
                    registerFieldIdentifier(field, identifier);

                    const formGroup = document.createElement('div');
                    formGroup.className = 'form-group';
                    if (field.type === 'url') formGroup.classList.add('full-width');

                    const label = document.createElement('label');
                    label.setAttribute('for', identifier); // NEU: saubere ID
                    label.setAttribute('data-i18n', field.name);
                    label.textContent = translate(field.name, field.name);
                    formGroup.appendChild(label);

                    const input = document.createElement('input');
                    input.id = identifier; // NEU: saubere ID
                    input.name = identifier; // NEU: saubere ID
                    input.dataset.fieldName = field.name; // NEU: originaler Name
                    input.type = field.type;

                    if (field.type === 'number') {
                        if (field.min !== undefined) input.min = field.min;
                        if (field.max !== undefined) input.max = field.max;
                        input.step = field.step || '0.1';
                    }

                    if (field.type === 'url') {
                        input.placeholder = 'https://beispiel.de/anleitung.pdf';
                    }

                    formGroup.appendChild(input);
                    gridContainer.appendChild(formGroup);
                });

                form.appendChild(gridContainer);
            }
        });
    }

    /**
     * Erstellt URL-Payload aus Formulardaten
     * @param {Object} data - Form-Daten (key-value pairs)
     * @param {string} baseUrl - Basis-URL
     * @returns {string} Vollständige URL mit Query-Params
     */
    function encodeUrl(data, baseUrl) {
        const params = new URLSearchParams();
        const schema = Schema.current || getDefaultSchema();

        for (const [key, value] of Object.entries(data)) {
            const field = schema.fields.find(f => f.name === key);
            if (field && field.shortKey && value) {
                params.append(field.shortKey, value);
            }
        }

        return `${baseUrl}?${params.toString()}`;
    }

    /**
     * Dekodiert URL-Parameter zurück zu Formulardaten
     * @param {URLSearchParams} params - URL-Parameter
     * @returns {Object} Daten-Objekt
     */
    function decodeUrl(params) {
        const data = {};
        const schema = Schema.current || getDefaultSchema();

        for (const [shortKey, value] of params.entries()) {
            const field = schema.fields.find(f => f.shortKey === shortKey);
            if (field) {
                data[field.name] = decodeURIComponent(value);
            }
        }

        return data;
    }

    /**
     * Validiert Daten gegen Schema
     * @param {Object} data - Daten
     * @returns {Array<string>} Array von Fehler-Meldungen
     */
    function validate(data) {
        const errors = [];
        const schema = Schema.current || getDefaultSchema();

        schema.fields.forEach(field => {
            const value = data[field.name];

            // Required-Check
            if (field.required && (!value || String(value).trim() === '')) {
                errors.push(window.I18N.t('errors.required', { replace: { field: field.name } }));
            }

            // Type-spezifische Validierung
            if (value) {
                if (field.type === 'number') {
                    const num = parseFloat(value);
                    if (isNaN(num)) {
                        errors.push(`${field.name} muss eine Zahl sein.`);
                    } else {
                        if (field.min !== undefined && num < field.min) {
                            errors.push(`${field.name} muss mindestens ${field.min} sein.`);
                        }
                        if (field.max !== undefined && num > field.max) {
                            errors.push(`${field.name} darf maximal ${field.max} sein.`);
                        }
                    }
                }

                if (field.type === 'url') {
                    try {
                        const url = new URL(value);
                        if (!['http:', 'https:'].includes(url.protocol)) {
                            errors.push(window.I18N.t('errors.invalidDocUrl'));
                        }
                    } catch {
                        errors.push(window.I18N.t('errors.invalidDocUrl'));
                    }
                }
            }
        });

        return errors;
    }

    /**
     * Rendert Daten-Anzeige im Read-Tab
     * @param {Object} data - Daten
     * @param {HTMLElement} container - Container-Element
     */
    function renderDisplay(data, container) {
        if (!container) return;

        container.innerHTML = '';
        const schema = Schema.current || getDefaultSchema();

        // Gruppiere nach Schema
        const groups = schema.groups || [{ id: 'default', labelKey: 'acceptanceProtocol', order: 1 }];
        groups.sort((a, b) => a.order - b.order);

        groups.forEach(group => {
            // MODIFIZIERT: Filtert 'Doc' (Dokumentation) hier heraus.
            // Es wird separat von renderDocumentLinks() als Button behandelt.
            const groupFields = schema.fields.filter(f => f.group === group.id && !f.deprecated && f.shortKey !== 'Doc');
            const fragment = document.createDocumentFragment();

            groupFields.forEach(field => {
                const value = data[field.name];
                if (!value || String(value).trim() === '') return;

                const pair = createDataPair(
                    window.I18N.t(field.name),
                    value,
                    field.unit || ''
                );

                if (pair) fragment.appendChild(pair);
            });

            if (fragment.hasChildNodes()) {
                const section = document.createElement('div');
                section.className = group.id === 'main' ? 'card-main' : 
                                    group.id === 'footer' ? 'card-footer' : 'card-section';
                section.appendChild(fragment);
                container.appendChild(section);
            }
        });

        // Falls keine Daten, Placeholder
        if (!container.hasChildNodes()) {
            const p = document.createElement('p');
            p.className = 'placeholder-text';
            p.textContent = window.I18N.t('placeholderRead');
            container.appendChild(p);
        }
    }

    /**
     * Erstellt ein Data-Pair Element
     * @param {string} label - Label
     * @param {string} value - Wert
     * @param {string} unit - Einheit
     * @returns {HTMLElement|null}
     */
    function createDataPair(label, value, unit = '') {
        if (value === undefined || value === null || String(value).trim() === '') return null;

        const div = document.createElement('div');
        div.className = 'data-pair';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'data-pair-label';
        labelSpan.textContent = label;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'data-pair-value';
        valueSpan.textContent = `${value} ${unit}`.trim();

        div.appendChild(labelSpan);
        div.appendChild(valueSpan);

        return div;
    }

    /**
     * Gibt aktuelles Schema zurück
     */
    function getCurrentSchema() {
        return Schema.current || getDefaultSchema();
    }

    /**
     * Gibt Dokument-Links zurück
     */
    function getDocumentLinks() {
        return Schema.documentLinks;
    }

    // Expose API
    window.SchemaEngine = {
        getDefaultSchema,
        loadSchema,
        buildForm,
        encodeUrl,
        decodeUrl,
        validate,
        renderDisplay,
        getCurrentSchema,
        getDocumentLinks,
        // NEU: Exponierte Helper
        getFieldIdentifierByName,
        getFieldNameByIdentifier,
        getFieldByName: (name) => {
            const schema = Schema.current || getDefaultSchema();
            return schema.fields.find(field => field.name === name) || null;
        }
    };

})(window);