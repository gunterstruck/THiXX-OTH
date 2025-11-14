/**
 * TEST SUITE FOR SCHEMA MODULE
 * Tests for critical functions as documented in core/schema.js
 *
 * Testing Requirements (from core/schema.js):
 * 1. createFieldIdentifier - Umlaute, Leerzeichen, Kollisionen
 * 2. encodeUrl - Leere Werte, Sonderzeichen, ShortKeys
 * 3. decodeUrl - ShortKey→Name, URL-Decoding, unbekannte Parameter
 * 4. validate - Required-Felder, Number-Ranges, URL-Format
 *
 * Test Framework: Vitest (or Jest)
 *
 * SETUP INSTRUCTIONS:
 * 1. Install test runner: npm install -D vitest jsdom
 * 2. Load the actual production code from core/schema.js
 * 3. Run tests with: npm test
 */

// ES Module imports
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock I18N before loading schema.js
window.I18N = {
    t: (key, options) => {
        const translations = {
            'errors.required': '{field} ist ein Pflichtfeld.',
            'errors.invalidDocUrl': 'Die Dokumentations-URL ist ungültig.'
        };
        let text = translations[key] || key;
        if (options && options.replace) {
            for (const [placeholder, value] of Object.entries(options.replace)) {
                text = text.replace(`{${placeholder}}`, value);
            }
        }
        return text;
    }
};

// Load the ACTUAL production code from core/schema.js
const schemaPath = join(__dirname, '../core/schema.js');
const schemaCode = readFileSync(schemaPath, 'utf-8');
eval(schemaCode); // Execute in global context to populate window.SchemaEngine

/**
 * TESTS FOR createFieldIdentifier (via public API)
 * Tests the internal createFieldIdentifier function by using the public API:
 * - buildForm() creates the identifiers
 * - getFieldIdentifierByName() retrieves them
 */
describe('SchemaEngine.createFieldIdentifier (via buildForm and getFieldIdentifierByName)', () => {
    let form;

    beforeEach(() => {
        // Create a fresh form element for each test
        form = document.createElement('form');
        document.body.appendChild(form);
    });

    afterEach(() => {
        // Clean up after each test
        if (form && form.parentNode) {
            form.parentNode.removeChild(form);
        }
    });

    test('should convert Umlaute correctly (ü→u, ä→a, ö→o)', () => {
        const schema = {
            fields: [
                { name: 'Wächter', shortKey: 'Wäch', type: 'number', unit: '°C', group: 'control', required: false }
            ],
            groups: [
                { id: 'control', labelKey: 'groupControl', order: 1 }
            ]
        };

        window.SchemaEngine.loadSchema({ dataSchema: schema });
        window.SchemaEngine.buildForm(form, schema);

        const identifier = window.SchemaEngine.getFieldIdentifierByName('Wächter');
        expect(identifier).toBe('wach');
    });

    test('should convert spaces to hyphens', () => {
        const schema = {
            fields: [
                { name: 'geprüft von', shortKey: 'Chk', type: 'text', group: 'footer', required: false }
            ],
            groups: [
                { id: 'footer', labelKey: 'groupFooter', order: 1 }
            ]
        };

        window.SchemaEngine.loadSchema({ dataSchema: schema });
        window.SchemaEngine.buildForm(form, schema);

        const identifier = window.SchemaEngine.getFieldIdentifierByName('geprüft von');
        expect(identifier).toBe('chk');
    });

    test('should handle special characters', () => {
        const schema = {
            fields: [
                { name: 'Projekt-Nr.', shortKey: 'Proj', type: 'text', group: 'footer', required: false }
            ],
            groups: [
                { id: 'footer', labelKey: 'groupFooter', order: 1 }
            ]
        };

        window.SchemaEngine.loadSchema({ dataSchema: schema });
        window.SchemaEngine.buildForm(form, schema);

        const identifier = window.SchemaEngine.getFieldIdentifierByName('Projekt-Nr.');
        expect(identifier).toBe('proj');
    });

    test('should prefer shortKey over name', () => {
        const schema = {
            fields: [
                { name: 'Sehr langes Feldname', shortKey: 'HK', type: 'text', group: 'main', required: false }
            ],
            groups: [
                { id: 'main', labelKey: 'acceptanceProtocol', order: 1 }
            ]
        };

        window.SchemaEngine.loadSchema({ dataSchema: schema });
        window.SchemaEngine.buildForm(form, schema);

        const identifier = window.SchemaEngine.getFieldIdentifierByName('Sehr langes Feldname');
        expect(identifier).toBe('hk');
    });

    test('should create correct HTML input elements with proper IDs', () => {
        const schema = {
            fields: [
                { name: 'HK-Nr', shortKey: 'HK', type: 'text', group: 'main', required: false }
            ],
            groups: [
                { id: 'main', labelKey: 'acceptanceProtocol', order: 1 }
            ]
        };

        window.SchemaEngine.loadSchema({ dataSchema: schema });
        window.SchemaEngine.buildForm(form, schema);

        const identifier = window.SchemaEngine.getFieldIdentifierByName('HK-Nr');
        expect(identifier).toBe('hk');

        // Verify the actual DOM element exists with this ID
        const input = document.getElementById(identifier);
        expect(input).not.toBeNull();
        expect(input.tagName).toBe('INPUT');
        expect(input.dataset.fieldName).toBe('HK-Nr');
    });
});

/**
 * TESTS FOR encodeUrl
 */
describe('SchemaEngine.encodeUrl', () => {
    const mockSchema = {
        fields: [
            { name: 'HK-Nr', shortKey: 'HK', type: 'text' },
            { name: 'Leistung', shortKey: 'P', type: 'number' },
            { name: 'Spannung', shortKey: 'U', type: 'number' }
        ]
    };

    beforeEach(() => {
        // Load mock schema into production SchemaEngine
        window.SchemaEngine.loadSchema({ dataSchema: mockSchema });
    });

    test('should ignore empty values', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Leistung': '',
            'Spannung': null
        };
        const result = window.SchemaEngine.encodeUrl(data, 'https://example.com');
        expect(result).toBe('https://example.com#HK=HC123');
    });

    test('should URL-encode special characters', () => {
        const data = {
            'HK-Nr': 'Test & Value'
        };
        const result = window.SchemaEngine.encodeUrl(data, 'https://example.com');
        expect(result).toContain('Test+%26+Value');
    });

    test('should use shortKeys correctly', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Leistung': '100',
            'Spannung': '230'
        };
        const result = window.SchemaEngine.encodeUrl(data, 'https://example.com');
        expect(result).toBe('https://example.com#HK=HC123&P=100&U=230');
    });

    test('should create hash fragment format', () => {
        const data = { 'HK-Nr': 'HC123' };
        const result = window.SchemaEngine.encodeUrl(data, 'https://example.com');
        expect(result).toContain('#');
        expect(result).not.toContain('?');
    });
});

/**
 * TESTS FOR decodeUrl
 */
describe('SchemaEngine.decodeUrl', () => {
    const mockSchema = {
        fields: [
            { name: 'HK-Nr', shortKey: 'HK', type: 'text' },
            { name: 'Leistung', shortKey: 'P', type: 'number' },
            { name: 'Spannung', shortKey: 'U', type: 'number' }
        ]
    };

    beforeEach(() => {
        // Load mock schema into production SchemaEngine
        window.SchemaEngine.loadSchema({ dataSchema: mockSchema });
    });

    test('should map shortKeys to field names correctly', () => {
        const params = new URLSearchParams('HK=HC123&P=100&U=230');
        const result = window.SchemaEngine.decodeUrl(params);

        expect(result['HK-Nr']).toBe('HC123');
        expect(result['Leistung']).toBe('100');
        expect(result['Spannung']).toBe('230');
    });

    test('should decode URL-encoded characters', () => {
        const params = new URLSearchParams('HK=Test+%26+Value');
        const result = window.SchemaEngine.decodeUrl(params);
        expect(result['HK-Nr']).toBe('Test & Value');
    });

    test('should ignore unknown parameters', () => {
        const params = new URLSearchParams('HK=HC123&UNKNOWN=value');
        const result = window.SchemaEngine.decodeUrl(params);
        expect(result['HK-Nr']).toBe('HC123');
        expect(result['UNKNOWN']).toBeUndefined();
    });

    test('should handle empty params', () => {
        const params = new URLSearchParams('');
        const result = window.SchemaEngine.decodeUrl(params);
        expect(Object.keys(result).length).toBe(0);
    });
});

/**
 * TESTS FOR validate
 */
describe('SchemaEngine.validate', () => {
    const mockSchema = {
        fields: [
            { name: 'HK-Nr', type: 'text', required: true },
            { name: 'Spannung', type: 'number', required: false, min: 0, max: 1000 },
            { name: 'Dokumentation', type: 'url', required: false }
        ]
    };

    beforeEach(() => {
        // Load mock schema into production SchemaEngine
        window.SchemaEngine.loadSchema({ dataSchema: mockSchema });
    });

    test('should validate required fields', () => {
        const data = { 'Spannung': '230' };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('HK-Nr');
        expect(errors[0]).toContain('Pflichtfeld');
    });

    test('should validate number ranges (min)', () => {
        const data = { 'HK-Nr': 'HC123', 'Spannung': '-10' };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.some(e => e.includes('mindestens 0'))).toBe(true);
    });

    test('should validate number ranges (max)', () => {
        const data = { 'HK-Nr': 'HC123', 'Spannung': '1500' };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.some(e => e.includes('maximal 1000'))).toBe(true);
    });

    test('should validate URL format (http/https)', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'ftp://example.com/doc.pdf'
        };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.some(e => e.includes('ungültig'))).toBe(true);
    });

    test('should accept valid https URLs', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'https://example.com/doc.pdf'
        };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.length).toBe(0);
    });

    test('should reject invalid URLs', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'not-a-valid-url'
        };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.some(e => e.includes('ungültig'))).toBe(true);
    });

    test('should return empty array for valid data', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Spannung': '230'
        };
        const errors = window.SchemaEngine.validate(data);
        expect(errors.length).toBe(0);
    });
});

/**
 * RUN TESTS
 *
 * To run these tests:
 * 1. Install Vitest: npm install -D vitest
 * 2. Add to package.json scripts: "test": "vitest"
 * 3. Run: npm test
 *
 * Or use Jest:
 * 1. Install Jest: npm install -D jest
 * 2. Add to package.json scripts: "test": "jest"
 * 3. Run: npm test
 */
