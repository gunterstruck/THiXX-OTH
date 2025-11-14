# Tests für THiXX-OTH

Diese Test-Suite testet kritische Funktionen des Schema-Moduls, wie in `core/schema.js` dokumentiert.

## Test-Abdeckung

### 1. createFieldIdentifier
- ✅ Umlaute (ü→u, ä→a, ö→o)
- ✅ Leerzeichen zu Bindestrichen
- ✅ Eindeutigkeit bei Kollisionen
- ✅ Führende/abschließende Bindestriche entfernen
- ✅ Sonderzeichen-Handling
- ✅ ShortKey-Priorität

### 2. encodeUrl
- ✅ Leere Werte ignorieren
- ✅ Sonderzeichen URL-encode
- ✅ ShortKeys korrekt zuordnen
- ✅ Hash-Fragment-Format (#param1=value1&param2=value2)

### 3. decodeUrl
- ✅ Korrekte ShortKey→Name Zuordnung
- ✅ URL-Decoding von Sonderzeichen
- ✅ Fehlende/unbekannte Parameter ignorieren

### 4. validate
- ✅ Required-Felder prüfen
- ✅ Number-Ranges (min/max) validieren
- ✅ URL-Format (http/https) prüfen
- ✅ Fehler-Messages korrekt zusammenstellen

## Test-Framework

Die Tests sind kompatibel mit:
- **Vitest** (empfohlen)
- **Jest**

## Installation

### Mit Vitest
```bash
npm install -D vitest
```

### Mit Jest
```bash
npm install -D jest
```

## Tests ausführen

### Mit Vitest
```bash
npm test
```

### Mit Jest
```bash
npm test
```

## Erweiterung der Tests

Wenn Sie weitere Funktionen zu `core/schema.js` hinzufügen, sollten Sie entsprechende Tests in `tests/schema.test.js` ergänzen.

### Beispiel: Neue Funktion testen

```javascript
describe('SchemaEngine.newFunction', () => {
    test('should do something specific', () => {
        const result = newFunction(input);
        expect(result).toBe(expectedOutput);
    });
});
```

## Kontinuierliche Integration (CI)

Fügen Sie die Tests zu Ihrer CI/CD-Pipeline hinzu:

### GitHub Actions Beispiel
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
```

## Test-Philosophie

Diese Tests folgen den Best Practices:
1. **Isolation**: Jeder Test ist unabhängig
2. **Klarheit**: Test-Namen beschreiben das erwartete Verhalten
3. **Vollständigkeit**: Alle dokumentierten Anforderungen sind getestet
4. **Wartbarkeit**: Tests sind einfach zu erweitern und zu pflegen
