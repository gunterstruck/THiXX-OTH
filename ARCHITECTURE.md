# THiXX-OTH Architecture Documentation

## Übersicht

THiXX-OTH nutzt eine modulare Multi-Tenancy-Architektur, die es ermöglicht, verschiedene Mandanten (Brands) mit unterschiedlichen Konfigurationen zu unterstützen, ohne Code-Änderungen vornehmen zu müssen.

## Architektur-Prinzipien

1. **Modularität**: Code ist in wiederverwendbare Module aufgeteilt
2. **Multi-Tenancy**: Mandanten-spezifische Konfigurationen sind von der Logik getrennt
3. **Separation of Concerns**: Jedes Modul hat eine klar definierte Verantwortung
4. **Configuration over Code**: Änderungen erfolgen durch Konfiguration, nicht durch Code

## Verzeichnisstruktur

```
THiXX-OTH/
├── assets/
│   └── app.js              # Hauptanwendung (nur noch Controller-Logik)
├── branding/               # Mandanten-Konfigurationen
│   ├── thixx_standard/
│   ├── peterpohl/
│   ├── sigx/
│   └── othimm/
│       └── brand.json      # Mandanten-spezifische Konfiguration
├── core/                   # Core-Module
│   ├── app.js             # Zentrale App-Steuerung
│   ├── branding.js        # Branding-Management
│   ├── i18n.js            # Internationalisierung
│   ├── schema.js          # Schema-Engine für Formulare
│   └── lang/              # Core-Übersetzungen
│       ├── de.json
│       ├── en.json
│       ├── es.json
│       └── fr.json
├── lang/                   # Legacy-Übersetzungen (für Kompatibilität)
├── config.json            # Aktiver Mandant
└── index.html
```

## Module

### 1. core/i18n.js - Internationalisierung

**Verantwortung:**
- Laden von Übersetzungen (Core + Tenant-Overrides)
- Bereitstellung der `t()` Funktion für Übersetzungen
- Anwendung von Übersetzungen auf DOM-Elemente

**API:**
```javascript
window.I18N = {
  loadTranslations(tenantId),
  t(key, options),
  applyTranslations(),
  getCurrentLang(),
  getTenantId()
}
```

**Verwendung:**
```javascript
await I18N.loadTranslations('othimm');
const text = I18N.t('appTitle');
I18N.applyTranslations();
```

### 2. core/schema.js - Schema-Engine

**Verantwortung:**
- Definition und Verwaltung des Datenmodells
- Formular-Generierung aus Schema
- URL-Encoding/Decoding
- Validierung
- Daten-Anzeige

**API:**
```javascript
window.SchemaEngine = {
  loadSchema(brand),
  buildForm(form, schema),
  encodeUrl(data, baseUrl),
  decodeUrl(params),
  validate(data),
  renderDisplay(data, container),
  getCurrentSchema(),
  getDocumentLinks()
}
```

### 3. core/branding.js - Branding-Management

**Verantwortung:**
- Laden der Mandanten-Konfiguration
- Anwendung von Branding (Farben, Icons, Logo)
- Theme-Management
- Manifest-Generierung

**API:**
```javascript
window.BrandingEngine = {
  loadBrandConfig(),
  applyBranding(brand),
  applyTheme(themeName),
  getCurrentBrand(),
  getTenantId(),
  isIOS()
}
```

### 4. core/app.js - App-Controller

**Verantwortung:**
- Orchestrierung aller Core-Module
- Initialisierung der App in korrekter Reihenfolge
- Bereitstellung von Helper-Funktionen

**API:**
```javascript
window.AppController = {
  initialize(),
  getCurrentBrand(),
  isInitialized(),
  t(key, options),        // Shortcut zu I18N.t()
  applyTheme(themeName),  // Shortcut zu BrandingEngine.applyTheme()
  buildForm(form),
  encodeUrl(data, baseUrl),
  decodeUrl(params),
  validate(data),
  renderDisplay(data, container),
  getDocumentLinks()
}
```

### 5. assets/app.js - Hauptanwendung

**Verantwortung:**
- UI-Logik (Event-Handler, DOM-Manipulation)
- NFC-Funktionalität
- Service Worker Management
- Anwendungsspezifische Features

**Abhängigkeiten:**
- Nutzt `window.AppController` für Core-Funktionalität
- Keine direkte Verwendung von branding/i18n/schema

## Initialisierungsablauf

```
1. Browser lädt index.html
2. Theme-Bootstrap wird ausgeführt (theme-bootstrap.js)
3. Core-Module werden geladen:
   a. core/i18n.js
   b. core/schema.js
   c. core/branding.js
   d. core/app.js
4. assets/app.js wird geladen
5. DOMContentLoaded Event:
   a. AppController.initialize()
      - BrandingEngine.loadBrandConfig()      # Lädt branding/{tenant}/brand.json
      - I18N.loadTranslations(tenantId)       # Lädt Übersetzungen
      - SchemaEngine.loadSchema(brand)         # Lädt Schema
      - BrandingEngine.applyBranding(brand)    # Wendet Branding an
      - I18N.applyTranslations()               # Wendet Übersetzungen an
   b. Service Worker Registrierung
   c. Event Listener Setup
   d. NFC Support Check
   e. URL Parameter Verarbeitung
```

## Mandantenwechsel

### Schritt 1: config.json bearbeiten

```json
{
  "design": "peterpohl"
}
```

### Schritt 2: App neu laden

Die App lädt automatisch:
1. `/branding/peterpohl/brand.json`
2. `/core/lang/de.json` (Core-Übersetzungen)
3. `/branding/peterpohl/lang/de.json` (optional, Tenant-Overrides)

### Schritt 3: Branding wird angewendet

- Logo wird aktualisiert
- Farben werden angewendet
- Theme wird gesetzt
- Manifest wird generiert
- Icons werden aktualisiert

## Vorteile dieser Architektur

### 1. Wartbarkeit
- **Modular**: Jedes Modul hat eine klare Verantwortung
- **Testbar**: Module können unabhängig getestet werden
- **Erweiterbar**: Neue Features können als Module hinzugefügt werden

### 2. Multi-Tenancy
- **Konfigurationsbasiert**: Keine Code-Änderungen für neue Mandanten
- **Isoliert**: Mandanten-Konfigurationen sind getrennt
- **Skalierbar**: Beliebig viele Mandanten möglich

### 3. Code-Qualität
- **DRY**: Keine Duplikation von Branding-Code
- **Single Source of Truth**: Konfiguration in brand.json
- **Type Safety**: Klare API-Definitionen

### 4. Performance
- **Lazy Loading**: Nur aktiver Mandant wird geladen
- **Caching**: Service Worker cached mandanten-spezifische Assets
- **Optimiert**: Minimale Overhead durch modulare Struktur

## Migration von Legacy zu Modularer Architektur

### Vorher (Monolithisch)
```javascript
// In assets/app.js
const designs = {
  'thixx_standard': { /* config */ },
  'peterpohl': { /* config */ },
  // ...
};

async function loadConfig() { /* ... */ }
async function loadTranslations() { /* ... */ }
function applyConfig(config) { /* ... */ }
```

### Nachher (Modular)
```javascript
// In core/branding.js
async function loadBrandConfig() { /* ... */ }

// In core/i18n.js
async function loadTranslations(tenantId) { /* ... */ }

// In core/app.js
async function initialize() {
  await BrandingEngine.loadBrandConfig();
  await I18N.loadTranslations(tenantId);
  // ...
}

// In assets/app.js
await AppController.initialize();
```

## Best Practices

### 1. Neuen Mandanten hinzufügen
1. Erstellen Sie `/branding/{tenant-id}/brand.json`
2. Optional: Erstellen Sie `/branding/{tenant-id}/lang/{lang}.json` für Übersetzungs-Overrides
3. Fügen Sie Assets (Icons, Logos) zu `/assets/` hinzu
4. Aktualisieren Sie `config.json`

### 2. Core-Module erweitern
- Ändern Sie Core-Module nur für generische Funktionalität
- Halten Sie mandanten-spezifische Logik in `brand.json`
- Dokumentieren Sie neue API-Funktionen

### 3. Assets/app.js ändern
- Nutzen Sie `AppController` für Core-Funktionalität
- Vermeiden Sie direkte Verwendung von `BrandingEngine`, `I18N`, `SchemaEngine`
- Halten Sie UI-Logik getrennt von Konfiguration

### 4. Testen
- Testen Sie alle Mandanten nach Änderungen
- Prüfen Sie Theme-Switching
- Verifizieren Sie Übersetzungen
- Testen Sie auf iOS und Android

## Kompatibilität

- **Rückwärtskompatibel**: Legacy-Pfade (`/lang/*.json`) werden noch unterstützt
- **iOS-Kompatibel**: Spezielle Behandlung für iOS (kein Manifest-Update)
- **Progressive Enhancement**: Funktioniert auch ohne Service Worker

## Zukünftige Erweiterungen

1. **Schema pro Mandant**: Mandanten-spezifische Formular-Definitionen
2. **Tenant-spezifische Assets**: Separate Asset-Verzeichnisse
3. **A/B Testing**: Theme-Varianten pro Mandant
4. **Analytics**: Mandanten-spezifisches Tracking
5. **API-Integration**: Mandanten-spezifische Backend-Endpoints
