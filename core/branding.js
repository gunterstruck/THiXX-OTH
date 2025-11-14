/**
 * BRANDING MODULE
 * Handles tenant-specific configuration loading and brand customization
 */

(function(window) {
    'use strict';

    const REPO_PATH = '/THiXX-OTH/';

    const Branding = {
        currentBrand: null,
        tenantId: null
    };

    /**
     * Loads brand configuration from config.json and brand.json
     * @returns {Promise<Object>} Brand configuration object
     */
    async function loadBrandConfig() {
        try {
            // 1. Load config.json to determine which tenant to use
            const configResponse = await fetch(`${REPO_PATH}config.json`);
            if (!configResponse.ok) {
                console.warn('[Branding] config.json not found, using default tenant');
                Branding.tenantId = 'thixx_standard';
            } else {
                const config = await configResponse.json();
                Branding.tenantId = config.design || 'thixx_standard';
            }

            console.log(`[Branding] Loading tenant: ${Branding.tenantId}`);

            // 2. Load brand.json for the selected tenant
            const brandResponse = await fetch(`${REPO_PATH}branding/${Branding.tenantId}/brand.json`);
            if (!brandResponse.ok) {
                throw new Error(`Brand configuration not found for tenant: ${Branding.tenantId}`);
            }

            Branding.currentBrand = await brandResponse.json();
            console.log('[Branding] Brand configuration loaded:', Branding.currentBrand);

            return Branding.currentBrand;

        } catch (error) {
            console.error('[Branding] Failed to load brand configuration:', error);
            // Fallback to default brand
            Branding.tenantId = 'thixx_standard';
            Branding.currentBrand = getDefaultBrand();
            return Branding.currentBrand;
        }
    }

    /**
     * Returns default brand configuration as fallback
     * @returns {Object} Default brand configuration
     */
    function getDefaultBrand() {
        return {
            tenantId: 'thixx_standard',
            appName: 'ThiXX NFC Tool',
            short_name: 'ThiXX',
            theme: 'dark',
            lockTheme: false,
            icons: {
                icon192: `${REPO_PATH}assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png`,
                icon512: `${REPO_PATH}assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png`
            },
            brandColors: {
                primary: '#f04e37',
                secondary: '#6c6b66'
            },
            legal: {
                imprint: 'https://thixx.de/impressum',
                privacy: 'https://thixx.de/datenschutz'
            },
            logo: {
                type: 'text',
                text: 'ThiXX',
                class: 'logo thixx'
            }
        };
    }

    /**
     * Loads tenant-specific CSS file (brand.css)
     * @param {string} tenantId - Tenant ID
     */
    function loadBrandCSS(tenantId) {
        if (!tenantId) return;

        // Remove any existing brand CSS
        const existingBrandCSS = document.getElementById('brand-css');
        if (existingBrandCSS) {
            existingBrandCSS.remove();
        }

        // Create and append new brand CSS link
        const link = document.createElement('link');
        link.id = 'brand-css';
        link.rel = 'stylesheet';
        link.href = `${REPO_PATH}branding/${tenantId}/brand.css`;

        // Add error handler in case brand.css doesn't exist
        link.onerror = () => {
            console.log(`[Branding] No brand.css found for tenant: ${tenantId} (this is optional)`);
        };

        document.head.appendChild(link);
        console.log(`[Branding] Loading brand CSS for tenant: ${tenantId}`);
    }

    /**
     * Applies brand configuration to the UI
     * @param {Object} brand - Brand configuration object
     */
    function applyBranding(brand) {
        if (!brand) return;

        console.log('[Branding] Applying brand configuration');

        // Load tenant-specific CSS
        loadBrandCSS(Branding.tenantId);

        // Apply theme
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme !== brand.theme) {
            applyTheme(brand.theme);
        }

        // Apply brand colors (CSS custom properties)
        if (brand.brandColors?.primary) {
            document.documentElement.style.setProperty('--primary-color-override', brand.brandColors.primary);
        }
        if (brand.brandColors?.secondary) {
            document.documentElement.style.setProperty('--secondary-color-override', brand.brandColors.secondary);
        }

        // Update manifest (not on iOS)
        if (!isIOS()) {
            updateManifest(brand);
        }

        // Show/hide theme switcher based on lockTheme
        const themeSwitcher = document.querySelector('.theme-switcher');
        if (themeSwitcher) {
            if (brand.lockTheme) {
                themeSwitcher.classList.add('hidden');
            } else {
                themeSwitcher.classList.remove('hidden');
            }
        }

        // Update customer brand button icon
        const customerBtnImg = document.querySelector('.theme-btn[data-theme="customer-brand"] img');
        if (customerBtnImg && brand.icons?.icon512) {
            customerBtnImg.src = brand.icons.icon512;
        }

        // Update logo
        updateLogo(brand.logo);

        // Apply legal links
        applyLegalLinks(brand.legal);
    }

    /**
     * Updates the logo in the header
     * @param {Object} logoConfig - Logo configuration
     */
    function updateLogo(logoConfig) {
        if (!logoConfig) return;

        const headerContent = document.querySelector('.header-content h1');
        if (!headerContent) return;

        // Clear existing content
        headerContent.className = logoConfig.class || 'logo';
        headerContent.innerHTML = '';

        switch (logoConfig.type) {
            case 'text':
                headerContent.textContent = logoConfig.text || '';
                break;
            case 'html':
                headerContent.innerHTML = logoConfig.html || '';
                break;
            case 'image':
                const img = document.createElement('img');
                img.src = logoConfig.src || '';
                img.alt = logoConfig.alt || 'Logo';
                if (logoConfig.width) img.width = logoConfig.width;
                if (logoConfig.height) img.height = logoConfig.height;
                headerContent.appendChild(img);
                break;
        }
    }

    /**
     * Applies legal links (imprint, privacy policy)
     * @param {Object} legalConfig - Legal configuration
     */
    function applyLegalLinks(legalConfig) {
        if (!legalConfig) return;

        const legalContainer = document.getElementById('legal-info');
        if (!legalContainer) return;

        // Store URLs in data attributes
        if (legalConfig.imprint) {
            legalContainer.dataset.imprintUrl = legalConfig.imprint;
        }
        if (legalConfig.privacy) {
            legalContainer.dataset.privacyUrl = legalConfig.privacy;
        }

        // Update privacy link if it exists
        const privacyLink = legalContainer.querySelector('a[data-i18n="privacyPolicyLink"]');
        if (privacyLink && legalConfig.privacy) {
            privacyLink.href = legalConfig.privacy;
        }

        // Load and display imprint content if it's a local file
        if (legalConfig.imprint && !legalConfig.imprint.startsWith('http')) {
            loadImprintContent(legalConfig.imprint);
        } else {
            // For external URLs, create a link
            updateImprintLink(legalConfig.imprint);
        }
    }

    /**
     * Loads imprint content from a local HTML file
     * @param {string} filePath - Path to the imprint HTML file
     */
    async function loadImprintContent(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                console.warn(`[Branding] Could not load imprint from: ${filePath}`);
                return;
            }

            const html = await response.text();
            const imprintContainer = document.getElementById('imprint-content');
            if (imprintContainer) {
                imprintContainer.innerHTML = html;
                console.log('[Branding] Imprint content loaded');
            }
        } catch (error) {
            console.error('[Branding] Error loading imprint content:', error);
        }
    }

    /**
     * Updates imprint to show as external link
     * @param {string} url - External URL to imprint
     */
    function updateImprintLink(url) {
        const imprintContainer = document.getElementById('imprint-content');
        if (imprintContainer && url) {
            imprintContainer.innerHTML = `
                <p><strong data-i18n="imprintTitle">Impressum</strong><br>
                <a href="${url}" target="_blank" rel="noopener noreferrer" data-i18n="imprintLink">Impressum anzeigen</a></p>
            `;
        }
    }

    /**
     * Updates the web app manifest with brand-specific values
     * @param {Object} brand - Brand configuration
     */
    function updateManifest(brand) {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) return;

        // Revoke old blob URL if it exists
        const oldHref = manifestLink.href;
        if (oldHref && oldHref.startsWith('blob:')) {
            URL.revokeObjectURL(oldHref);
        }

        // Create new manifest
        const manifest = {
            name: brand.appName,
            short_name: brand.short_name,
            start_url: `${REPO_PATH}index.html`,
            scope: REPO_PATH,
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: brand.brandColors?.primary || '#f04e37',
            orientation: 'portrait-primary',
            icons: [
                {
                    src: brand.icons.icon192,
                    sizes: '192x192',
                    type: 'image/png'
                },
                {
                    src: brand.icons.icon512,
                    sizes: '512x512',
                    type: 'image/png'
                }
            ]
        };

        // Create and set new manifest blob URL
        const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        manifestLink.href = URL.createObjectURL(blob);

        console.log('[Branding] Manifest updated');
    }

    /**
     * Applies a theme to the UI
     * @param {string} themeName - Theme name (dark, thixx, customer-brand)
     */
    function applyTheme(themeName) {
        const themeButtons = document.querySelectorAll('.theme-btn');

        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('thixx-theme', themeName);

        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });

        // Update meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const colors = {
                'dark': '#0f172a',
                'thixx': '#f8f9fa',
                'customer-brand': '#FCFCFD'
            };
            metaThemeColor.setAttribute('content', colors[themeName] || '#FCFCFD');
        }

        console.log(`[Branding] Theme applied: ${themeName}`);
    }

    /**
     * Checks if device is iOS
     * @returns {boolean}
     */
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    /**
     * Gets current brand configuration
     * @returns {Object|null}
     */
    function getCurrentBrand() {
        return Branding.currentBrand;
    }

    /**
     * Gets current tenant ID
     * @returns {string|null}
     */
    function getTenantId() {
        return Branding.tenantId;
    }

    // Expose API
    window.BrandingEngine = {
        loadBrandConfig,
        applyBranding,
        applyTheme,
        getCurrentBrand,
        getTenantId,
        isIOS
    };

})(window);
