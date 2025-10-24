/**
 * ROBUSTHEITS-UPDATE (Theme-Flickern & UX):
 * Dieses Skript wird vor dem Rest der Seite geladen, um das Theme festzulegen.
 * 1. Es liest das Theme aus dem localStorage.
 * 2. Falls kein Theme gespeichert ist (erster Besuch), erkennt es die
 * Systemeinstellung des Nutzers (hell/dunkel) und wendet sie an.
 * 3. Dies verhindert ein "Flickern" und verbessert die User Experience.
 */
(function() {
  try {
    let theme = localStorage.getItem('thixx-theme');
    if (!theme) {
        // Wenn kein Theme im Speicher ist, prüfe die Systemeinstellung
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        } else {
            // Standard-Fallback, falls weder localStorage noch Systemeinstellung vorhanden
            theme = 'customer-brand'; 
        }
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    console.error('Failed to set theme from localStorage or system preference', e);
    document.documentElement.setAttribute('data-theme', 'customer-brand');
  }
})();

