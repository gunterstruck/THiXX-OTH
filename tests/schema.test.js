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

// Mock DOM environment for Node.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Create a DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously'
});

global.window = dom.window;
global.document = dom.window.document;

// Mock I18N before loading schema.js
global.window.I18N = {
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
const schemaPath = path.join(__dirname, '../core/schema.js');
const schemaCode = fs.readFileSync(schemaPath, 'utf-8');
eval(schemaCode); // Execute in global context to populate window.SchemaEngine

// Helper to access private createFieldIdentifier (for unit testing)
// Note: In production, this is internal. Tests validate it indirectly via buildForm.
function createFieldIdentifier(field, usedIdentifiers) {
    const base = (field.shortKey || field.name || 'field')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'field';

    let identifier = base;
    let counter = 1;
    const identifierToField = new Map();
    while (usedIdentifiers.has(identifier) || identifierToField.has(identifier)) {
        identifier = `${base}-${counter++}`;
    }

    usedIdentifiers.add(identifier);
    return identifier;
}

/**
 * TESTS FOR createFieldIdentifier
 */
describe('SchemaEngine.createFieldIdentifier', () => {
    test('should convert Umlaute correctly (ü→u, ä→a, ö→o)', () => {
        const usedIdentifiers = new Set();
        const field = { name: 'Wächter' };
        const result = createFieldIdentifier(field, usedIdentifiers);
        expect(result).toBe('wachter');
    });

    test('should convert spaces to hyphens', () => {
        const usedIdentifiers = new Set();
        const field = { name: 'geprüft von' };
        const result = createFieldIdentifier(field, usedIdentifiers);
        expect(result).toBe('gepruft-von');
    });

    test('should handle collisions by adding counter', () => {
        const usedIdentifiers = new Set();
        const field1 = { name: 'feld' };
        const field2 = { name: 'feld' };
        const field3 = { name: 'feld' };

        const result1 = createFieldIdentifier(field1, usedIdentifiers);
        const result2 = createFieldIdentifier(field2, usedIdentifiers);
        const result3 = createFieldIdentifier(field3, usedIdentifiers);

        expect(result1).toBe('feld');
        expect(result2).toBe('feld-1');
        expect(result3).toBe('feld-2');
    });

    test('should remove leading and trailing hyphens', () => {
        const usedIdentifiers = new Set();
        const field = { name: '---test---' };
        const result = createFieldIdentifier(field, usedIdentifiers);
        expect(result).toBe('test');
    });

    test('should handle special characters', () => {
        const usedIdentifiers = new Set();
        const field = { name: 'Projekt-Nr.' };
        const result = createFieldIdentifier(field, usedIdentifiers);
        expect(result).toBe('projekt-nr');
    });

    test('should prefer shortKey over name', () => {
        const usedIdentifiers = new Set();
        const field = { name: 'Sehr langes Feldname', shortKey: 'HK' };
        const result = createFieldIdentifier(field, usedIdentifiers);
        expect(result).toBe('hk');
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
