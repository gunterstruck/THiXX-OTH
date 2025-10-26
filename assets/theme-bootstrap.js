/**
 * THEME BOOTSTRAP ENHANCED (Anti-Flicker Version)
 * ------------------------------------------------
 * Dieses Skript wird VOR dem Rendern geladen.
 * Es sorgt dafür, dass Theme UND Brand-Farben sofort aktiv sind.
 * → Kein Flackern mehr beim Laden!
 */
(function() {
  try {


    // --- 0️⃣ SCOPE DEFINITION (WICHTIG: Muss mit index.html übereinstimmen!)
    const SCOPE = '/THiXX-OTH/'; // ← O.Thimm Branding Deployment


    // --- 1️⃣ Alte lokale Themes entfernen
    localStorage.removeItem('thixx-theme');

    // --- 2️⃣ Design-Definitionen (identisch zu app.js)
    const designs = {
      'thixx_standard': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#d54b2a',
          secondary: '#6c6b66'
        }
      },
      'peterpohl': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#00457D',
          secondary: '#FFEC00'
        }
      },
      'sigx': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#5865F2',
          secondary: '#3d3d3d'
        }
      },
      'othimm': {
        theme: 'customer-brand',
        brandColors: {
          primary: '#d54b2a',
          secondary: '#6C6B66'
        }
      }
    };

    // --- 3️⃣ config.json synchron laden
    let selectedDesign = designs['othimm']; // Fallback für O.Thimm

    const request = new XMLHttpRequest();
    request.open('GET', SCOPE + 'config.json', false); // synchron
    request.send(null);

    if (request.status === 200) {
      try {
        const config = JSON.parse(request.responseText);
        if (config && config.design && designs[config.design]) {
          selectedDesign = designs[config.design];
        }
      } catch (jsonErr) {
        console.warn('Theme config parsing failed:', jsonErr);
      }
    } else {
      console.warn('Theme config could not be loaded, using fallback:', request.status);
    }

    // --- 4️⃣ Theme sofort auf Root-Element anwenden
    document.documentElement.setAttribute('data-theme', selectedDesign.theme);

    // --- 5️⃣ Brand-Farben sofort setzen (ANTI-FLICKER!)
    if (selectedDesign.brandColors) {
      const root = document.documentElement;
      
      // Primary Color + Varianten
      root.style.setProperty('--primary-color-override', selectedDesign.brandColors.primary);
      
      // Berechne dunklere und hellere Varianten
      root.style.setProperty('--primary-dark-override', adjustColor(selectedDesign.brandColors.primary, -20));
      root.style.setProperty('--primary-light-override', adjustColor(selectedDesign.brandColors.primary, 20));
      
      // Secondary Color
      if (selectedDesign.brandColors.secondary) {
        root.style.setProperty('--secondary-color-override', selectedDesign.brandColors.secondary);
      }
    }

    // --- 6️⃣ Transitions aktivieren (ANTI-FLICKER!)
    // Nach dem Theme-Setup Klasse hinzufügen, damit CSS-Transitions aktiv werden
    document.documentElement.classList.add('theme-loaded');

    // --- Hilfsfunktion: Farbe aufhellen/abdunkeln
    function adjustColor(color, percent) {
      try {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);

        R = Math.min(255, Math.max(0, parseInt(R * (100 + percent) / 100)));
        G = Math.min(255, Math.max(0, parseInt(G * (100 + percent) / 100)));
        B = Math.min(255, Math.max(0, parseInt(B * (100 + percent) / 100)));

        const RR = R.toString(16).padStart(2, '0');
        const GG = G.toString(16).padStart(2, '0');
        const BB = B.toString(16).padStart(2, '0');

        return '#' + RR + GG + BB;
      } catch (error) {
        console.warn('Could not adjust color:', color, error);
        return color;
      }
    }

  } catch (e) {
    console.error('Theme initialization failed:', e);
    document.documentElement.setAttribute('data-theme', 'customer-brand');
    document.documentElement.classList.add('theme-loaded');
  }
})();