# Multi-Tenancy Branding Configuration

## Übersicht

Dieses Verzeichnis enthält Mandanten-spezifische Konfigurationen für die THiXX-OTH Anwendung.

## Verzeichnisstruktur

```
branding/
├── thixx_standard/
│   └── brand.json
├── peterpohl/
│   └── brand.json
├── sigx/
│   └── brand.json
└── othimm/
    └── brand.json
```

## Mandant wechseln

Um den aktiven Mandanten zu wechseln, bearbeiten Sie die Datei `/config.json` im Hauptverzeichnis:

```json
{
  "design": "othimm"
}
```

Verfügbare Werte für `design`:
- `thixx_standard` - Standard ThiXX Branding
- `peterpohl` - Peter Pohl Branding
- `sigx` - SigX Branding
- `othimm` - O.Thimm Branding

## brand.json Struktur

Jede `brand.json` Datei enthält folgende Konfiguration:

```json
{
  "tenantId": "mandant-id",
  "appName": "App Name für Manifest",
  "short_name": "Kurzer Name",
  "theme": "dark | thixx | customer-brand",
  "lockTheme": false,
  "icons": {
    "icon192": "/THiXX-OTH/assets/icon-192.png",
    "icon512": "/THiXX-OTH/assets/icon-512.png"
  },
  "brandColors": {
    "primary": "#hexcode",
    "secondary": "#hexcode"
  },
  "legal": {
    "imprint": "https://example.com/impressum",
    "privacy": "https://example.com/datenschutz"
  },
  "logo": {
    "type": "text | html | image",
    "text": "Text for text type",
    "html": "<span>HTML for html type</span>",
    "src": "/path/to/image for image type",
    "class": "logo css-class"
  }
}
```

## Logo-Konfiguration

### Text Logo
```json
"logo": {
  "type": "text",
  "text": "ThiXX",
  "class": "logo thixx"
}
```

### HTML Logo (z.B. mehrfarbig)
```json
"logo": {
  "type": "html",
  "html": "<span class=\"logo-orange\">O.</span><span class=\"logo-gray\">Thimm</span>",
  "class": "logo othimm"
}
```

### Bild Logo
```json
"logo": {
  "type": "image",
  "src": "/THiXX-OTH/assets/logo.png",
  "alt": "Company Logo",
  "class": "logo company",
  "width": 150,
  "height": 50
}
```

## Neuen Mandanten hinzufügen

1. Erstellen Sie ein neues Verzeichnis: `branding/neuer-mandant/`
2. Erstellen Sie `brand.json` mit der entsprechenden Konfiguration
3. Optional: Erstellen Sie tenant-spezifische Übersetzungen in `branding/neuer-mandant/lang/de.json`
4. Aktualisieren Sie `/config.json` mit dem neuen Mandanten-Namen

## Mandanten-spezifische Übersetzungen (Optional)

Falls gewünscht, können Sie mandanten-spezifische Übersetzungs-Overrides erstellen:

```
branding/
└── neuer-mandant/
    ├── brand.json
    └── lang/
        ├── de.json
        ├── en.json
        └── ...
```

Diese Übersetzungen überschreiben die Core-Übersetzungen aus `/core/lang/`.

## Technische Details

- Die Branding-Konfiguration wird von `/core/branding.js` geladen
- Die Konfiguration wird beim App-Start durch `/core/app.js` initialisiert
- Die Anwendung unterstützt dynamisches Laden ohne Code-Änderungen
- Alle Mandanten-Einstellungen sind zentral in `brand.json` gespeichert
