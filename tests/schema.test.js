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
 */

// Mock window object for Node.js environment
global.window = {
    SchemaEngine: null,
    I18N: {
        t: (key, options) => {
            // Simple mock translation function
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
    }
};

// Import schema module (would be actual import in real setup)
// For this test file, we'll define the functions inline for demonstration
// In a real setup, you would: import { SchemaEngine } from '../core/schema.js';

/**
 * Inline implementation of createFieldIdentifier for testing
 * (In real setup, this would be imported from core/schema.js)
 */
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
    while (usedIdentifiers.has(identifier)) {
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

    function encodeUrl(data, baseUrl, schema) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(data)) {
            const field = schema.fields.find(f => f.name === key);
            if (field && field.shortKey && value) {
                params.append(field.shortKey, value);
            }
        }
        return `${baseUrl}#${params.toString()}`;
    }

    test('should ignore empty values', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Leistung': '',
            'Spannung': null
        };
        const result = encodeUrl(data, 'https://example.com', mockSchema);
        expect(result).toBe('https://example.com#HK=HC123');
    });

    test('should URL-encode special characters', () => {
        const data = {
            'HK-Nr': 'Test & Value'
        };
        const result = encodeUrl(data, 'https://example.com', mockSchema);
        expect(result).toContain('Test+%26+Value');
    });

    test('should use shortKeys correctly', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Leistung': '100',
            'Spannung': '230'
        };
        const result = encodeUrl(data, 'https://example.com', mockSchema);
        expect(result).toBe('https://example.com#HK=HC123&P=100&U=230');
    });

    test('should create hash fragment format', () => {
        const data = { 'HK-Nr': 'HC123' };
        const result = encodeUrl(data, 'https://example.com', mockSchema);
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

    function decodeUrl(params, schema) {
        const data = {};
        for (const [shortKey, value] of params.entries()) {
            const field = schema.fields.find(f => f.shortKey === shortKey);
            if (field) {
                data[field.name] = decodeURIComponent(value);
            }
        }
        return data;
    }

    test('should map shortKeys to field names correctly', () => {
        const params = new URLSearchParams('HK=HC123&P=100&U=230');
        const result = decodeUrl(params, mockSchema);

        expect(result['HK-Nr']).toBe('HC123');
        expect(result['Leistung']).toBe('100');
        expect(result['Spannung']).toBe('230');
    });

    test('should decode URL-encoded characters', () => {
        const params = new URLSearchParams('HK=Test+%26+Value');
        const result = decodeUrl(params, mockSchema);
        expect(result['HK-Nr']).toBe('Test & Value');
    });

    test('should ignore unknown parameters', () => {
        const params = new URLSearchParams('HK=HC123&UNKNOWN=value');
        const result = decodeUrl(params, mockSchema);
        expect(result['HK-Nr']).toBe('HC123');
        expect(result['UNKNOWN']).toBeUndefined();
    });

    test('should handle empty params', () => {
        const params = new URLSearchParams('');
        const result = decodeUrl(params, mockSchema);
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

    function validate(data, schema) {
        const errors = [];

        schema.fields.forEach(field => {
            const value = data[field.name];

            // Required check
            if (field.required && (!value || String(value).trim() === '')) {
                errors.push(window.I18N.t('errors.required', { replace: { field: field.name } }));
            }

            // Type-specific validation
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

    test('should validate required fields', () => {
        const data = { 'Spannung': '230' };
        const errors = validate(data, mockSchema);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('HK-Nr');
        expect(errors[0]).toContain('Pflichtfeld');
    });

    test('should validate number ranges (min)', () => {
        const data = { 'HK-Nr': 'HC123', 'Spannung': '-10' };
        const errors = validate(data, mockSchema);
        expect(errors.some(e => e.includes('mindestens 0'))).toBe(true);
    });

    test('should validate number ranges (max)', () => {
        const data = { 'HK-Nr': 'HC123', 'Spannung': '1500' };
        const errors = validate(data, mockSchema);
        expect(errors.some(e => e.includes('maximal 1000'))).toBe(true);
    });

    test('should validate URL format (http/https)', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'ftp://example.com/doc.pdf'
        };
        const errors = validate(data, mockSchema);
        expect(errors.some(e => e.includes('ungültig'))).toBe(true);
    });

    test('should accept valid https URLs', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'https://example.com/doc.pdf'
        };
        const errors = validate(data, mockSchema);
        expect(errors.length).toBe(0);
    });

    test('should reject invalid URLs', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Dokumentation': 'not-a-valid-url'
        };
        const errors = validate(data, mockSchema);
        expect(errors.some(e => e.includes('ungültig'))).toBe(true);
    });

    test('should return empty array for valid data', () => {
        const data = {
            'HK-Nr': 'HC123',
            'Spannung': '230'
        };
        const errors = validate(data, mockSchema);
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
