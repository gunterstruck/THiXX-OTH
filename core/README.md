# Core Directory

**Status:** Active modular architecture

## Removed Files (2025-01-14)

The following files were removed as they were duplicates from the THiXX-I project:

- ~~`app.js`~~ - Duplicate of `/assets/app.js`
- ~~`theme-bootstrap.js`~~ - Duplicate of `/assets/theme-bootstrap.js`
- ~~`theme.css`~~ - Duplicate of `/assets/style.css`

## Active Core Modules

These modules are **actively used** by THiXX-OTH (loaded in index.html:118-121):

- `i18n.js` - Internationalization module (active - provides window.I18N API)
- `schema.js` - Schema engine module (active - provides window.SchemaEngine API)
- `branding.js` - Branding/theming module (active - provides window.BrandingEngine API)
- `app.js` - Application controller (active - provides window.AppController API)

## Active Project Structure

THiXX-OTH uses a modular architecture:

```
/THiXX-OTH/
├── core/                    ← Core modules (loaded first)
│   ├── i18n.js             ← I18N engine
│   ├── schema.js           ← Schema engine
│   ├── branding.js         ← Branding engine
│   └── app.js              ← App controller
├── assets/
│   ├── app.js              ← Main application logic
│   ├── theme-bootstrap.js  ← Theme initialization
│   └── style.css           ← Styles
├── lang/                    ← Language files (de.json, en.json)
├── index.html
├── sw.js                    ← Service Worker
└── manifest.webmanifest
```

## Module Loading Order

1. `core/i18n.js` - Translation system
2. `core/schema.js` - Form generation and URL encoding/decoding
3. `core/branding.js` - Theme and branding configuration
4. `core/app.js` - Central controller coordinating all modules
5. `assets/app.js` - UI logic and NFC interactions

## Testing

Tests for the schema module are located in `/tests/schema.test.js` and test the production code from `core/schema.js`.
