# Core Directory

**Status:** Partially cleaned up

## Removed Files (2025-01-14)

The following files were removed as they were duplicates from the THiXX-I project and not used in THiXX-OTH:

- ~~`app.js`~~ - Duplicate of `/assets/app.js`
- ~~`theme-bootstrap.js`~~ - Duplicate of `/assets/theme-bootstrap.js`
- ~~`theme.css`~~ - Duplicate of `/assets/style.css`

## Remaining Files

- `i18n.js` - Internationalization module (not currently used, kept for potential future use)
- `schema.js` - Schema engine module (not currently used, kept for potential future use)
- `lang/` - Language files (duplicates of `/lang/`, kept for reference)

## Active Project Structure

THiXX-OTH uses the following structure:

```
/THiXX-OTH/
├── assets/
│   ├── app.js ← Active application code
│   ├── theme-bootstrap.js ← Active theme initialization
│   └── style.css ← Active styles
├── lang/ ← Active language files
├── index.html
├── sw.js ← Service Worker (now correctly configured)
└── manifest.webmanifest
```

## Note

If the modular architecture from THiXX-I (with separate i18n.js and schema.js modules) is needed in the future, these files can be integrated or restored from Git history.
