/**
 * FinanceFlow - Theme Manager
 * Handles dark/light mode toggle with persistence
 */

class ThemeManager {
    constructor() {
        this.theme = 'light';
        this.storageKey = 'financeflow_theme';
    }

    /**
     * Initialize theme from storage or system preference
     */
    init() {
        // Check localStorage first
        const savedTheme = localStorage.getItem(this.storageKey);

        if (savedTheme) {
            this.theme = savedTheme;
        } else {
            // Check system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.theme = 'dark';
            }
        }

        this.applyTheme();
        this.bindEvents();
    }

    /**
     * Apply the current theme to the document
     */
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);

        // Update all toggle checkboxes
        const settingsToggle = document.getElementById('settingsThemeToggle');
        if (settingsToggle) {
            settingsToggle.checked = this.theme === 'dark';
        }
    }

    /**
     * Toggle between light and dark themes
     */
    toggle() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        this.save();
        this.applyTheme();
    }

    /**
     * Set a specific theme
     */
    setTheme(theme) {
        if (theme === 'light' || theme === 'dark') {
            this.theme = theme;
            this.save();
            this.applyTheme();
        }
    }

    /**
     * Save theme preference to localStorage
     */
    save() {
        localStorage.setItem(this.storageKey, this.theme);
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Header theme toggle button
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggle());
        }

        // Settings page toggle
        const settingsToggle = document.getElementById('settingsThemeToggle');
        if (settingsToggle) {
            settingsToggle.addEventListener('change', (e) => {
                this.setTheme(e.target.checked ? 'dark' : 'light');
            });
        }

        // Listen for system preference changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem(this.storageKey)) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    /**
     * Get current theme
     */
    getTheme() {
        return this.theme;
    }

    /**
     * Check if current theme is dark
     */
    isDark() {
        return this.theme === 'dark';
    }
}

// Create and export singleton instance
const themeManager = new ThemeManager();
