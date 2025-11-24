/**
 * Hintify Settings Page - Rebuilt with Modern Architecture
 *
 * This module handles all settings page functionality with a clean, modular design:
 * - State Management: Centralized state for config, user auth, and UI
 * - Configuration: Load/save/validate settings with electron-store
 * - UI Components: User auth, AI providers, updates, advanced features
 * - Event Handling: Button clicks, IPC communication, form changes
 * - Error Handling: Comprehensive error recovery and user feedback
 *
 * @version 3.0.0
 * @author Hintify Team
 */

'use strict';

console.log('[Settings] ========================================');
console.log('[Settings] Script file is loading...');
console.log('[Settings] ========================================');

// ============================================================================
// MODULE IMPORTS
// ============================================================================

// Note: ipcRenderer may already be declared in the HTML inline script
// We'll use it from the global scope if available, otherwise require it
let Store, axios;

try {
    // ipcRenderer should already be available from the inline script in settings.html
    // If not, we'll require it (but this shouldn't happen in normal usage)
    if (typeof ipcRenderer === 'undefined') {
        // This will only work if ipcRenderer wasn't declared as const in the global scope
        globalThis.ipcRenderer = require('electron').ipcRenderer;
    }
    Store = require('electron-store');
    axios = require('axios');
    console.log('[Settings] ✓ All modules loaded successfully');
} catch (error) {
    console.error('[Settings] ✗ Failed to load modules:', error);
    // Fallback objects to prevent crashes
    if (typeof ipcRenderer === 'undefined') {
        globalThis.ipcRenderer = {
            invoke: () => Promise.resolve({}),
            send: () => { },
            on: () => { }
        };
    }
    Store = class FallbackStore {
        get(_key, defaultValue) { return defaultValue; }
        set(_key, _value) { }
    };
    axios = {
        get: () => Promise.reject(new Error('axios not available')),
        post: () => Promise.reject(new Error('axios not available'))
    };
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Application state container
 */
const AppState = {
    // Initialization
    isInitialized: false,

    // Configuration
    config: {
        provider: 'gemini',
        ollama_model: 'granite3.2-vision:2b',
        gemini_model: 'gemini-2.0-flash',
        gemini_image_model: 'gemini-2.0-flash-exp',
        theme: 'dark',
        advanced_mode: true
    },

    // User authentication
    user: {
        authenticated: false,
        name: 'Guest User',
        email: 'Using app without account',
        avatar: null
    },

    // UI state
    ui: {
        currentProvider: 'gemini',
        ollamaConnected: false,
        ollamaModels: [],
        updateAvailable: false
    },

    // DOM elements cache
    elements: {}
};

/**
 * electron-store instance
 */
let store;
try {
    store = new Store();
    console.log('[Settings] ✓ Store initialized');
} catch (error) {
    console.error('[Settings] ✗ Store initialization failed:', error);
    store = {
        get: (_key, defaultValue) => defaultValue,
        set: (_key, _value) => { },
        delete: (_key) => { }
    };
}

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

/**
 * Configuration module - handles loading, saving, and validating settings
 */
const ConfigManager = {

    /**
     * Default configuration values
     */
    defaults: {
        provider: 'gemini',
        ollama_model: 'granite3.2-vision:2b',
        gemini_model: 'gemini-2.0-flash',
        gemini_image_model: 'gemini-2.0-flash-exp',
        theme: 'dark',
        advanced_mode: true
    },

    /**
     * Load configuration from store
     * @returns {Object} Configuration object
     */
    load() {
        console.log('[Config] Loading configuration...');
        const config = { ...this.defaults };

        for (const key of Object.keys(this.defaults)) {
            const stored = store.get(key);
            if (stored !== undefined) {
                config[key] = stored;
            }
        }

        console.log('[Config] ✓ Configuration loaded:', config);
        return config;
    },

    /**
     * Save configuration to store
     * @param {Object} config - Configuration object to save
     */
    save(config) {
        console.log('[Config] Saving configuration...');

        try {
            for (const key of Object.keys(config)) {
                store.set(key, config[key]);
            }

            console.log('[Config] ✓ Configuration saved successfully');
            return true;
        } catch (error) {
            console.error('[Config] ✗ Failed to save configuration:', error);
            return false;
        }
    },

    /**
     * Validate configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result with {valid: boolean, errors: string[]}
     */
    validate(config) {
        const errors = [];

        // Validate provider
        if (!['gemini', 'ollama'].includes(config.provider)) {
            errors.push('Invalid AI provider selected');
        }

        // Validate Ollama model if Ollama is selected
        if (config.provider === 'ollama' && !config.ollama_model) {
            errors.push('Please select an Ollama model');
        }

        // Validate Gemini model
        if (config.provider === 'gemini' && !config.gemini_model) {
            errors.push('Please select a Gemini model');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
    ,

    /**
     * Get current configuration from form
     * @returns {Object} Configuration object from form values
     */
    getFromForm() {
        const elements = AppState.elements;

        return {
            provider: elements.providerSelect?.value || 'gemini',
            ollama_model: elements.ollamaModel?.value || '',
            gemini_model: elements.geminiModel?.value || 'gemini-2.0-flash',
            gemini_image_model: elements.geminiImageModel?.value || 'gemini-2.0-flash-exp',
            theme: store.get('theme', 'dark'), // Theme is not user-configurable in settings
            advanced_mode: elements.advancedModeToggle?.checked !== false
        };
    },

    /**
     * Load configuration into form
     * @param {Object} config - Configuration to load into form
     */
    loadIntoForm(config) {
        console.log('[Config] Loading configuration into form...');
        const elements = AppState.elements;

        // Provider
        if (elements.providerSelect) {
            elements.providerSelect.value = config.provider || 'gemini';
        }

        // Ollama model
        if (elements.ollamaModel) {
            elements.ollamaModel.value = config.ollama_model || '';
        }

        // Gemini model
        if (elements.geminiModel) {
            elements.geminiModel.value = config.gemini_model || 'gemini-2.0-flash';
        }

        // Gemini image model
        if (elements.geminiImageModel) {
            elements.geminiImageModel.value = config.gemini_image_model || 'gemini-2.0-flash-exp';
        }

        // Gemini API key
        if (elements.geminiApiKey) {
            elements.geminiApiKey.value = store.get('gemini_api_key', '');
        }

        // Advanced mode
        if (elements.advancedModeToggle) {
            elements.advancedModeToggle.checked = config.advanced_mode !== false;
        }

        console.log('[Config] ✓ Configuration loaded into form');
    }
};

// ============================================================================
// DOM ELEMENT MANAGEMENT
// ============================================================================

/**
 * DOM module - handles element caching and DOM operations
 */
const DOMManager = {

    /**
     * Cache all DOM elements
     * @returns {Object} Cached elements object
     */
    cacheElements() {
        console.log('[DOM] Caching DOM elements...');

        const elements = {
            // User authentication
            userName: document.getElementById('user-name'),
            userEmail: document.getElementById('user-email'),
            userAvatar: document.getElementById('user-avatar'),
            userAvatarIcon: document.getElementById('user-avatar-icon'),
            signinBtn: document.getElementById('signin-btn'),
            signoutBtn: document.getElementById('signout-btn'),

            // Updates
            currentVersion: document.getElementById('current-version'),
            latestVersionText: document.getElementById('latest-version-text'),
            checkUpdateBtn: document.getElementById('check-update-btn'),
            updateProgress: document.getElementById('update-progress'),
            updateNotification: document.getElementById('update-notification'),
            updateNewVersion: document.getElementById('update-new-version'),
            updateReleaseNotes: document.getElementById('update-release-notes'),
            updateNowBtn: document.getElementById('update-now-btn'),
            updateLaterBtn: document.getElementById('update-later-btn'),

            // AI Settings
            providerSelect: document.getElementById('provider-select'),
            ollamaModel: document.getElementById('ollama-model'),
            refreshOllamaBtn: document.getElementById('refresh-ollama-btn'),
            ollamaStatus: document.getElementById('ollama-status'),
            geminiModel: document.getElementById('gemini-model'),
            geminiImageModel: document.getElementById('gemini-image-model'),
            geminiApiKey: document.getElementById('gemini-api-key'),
            pasteKeyBtn: document.getElementById('paste-key-btn'),
            toggleKeyVisibility: document.getElementById('toggle-key-visibility'),

            // Features
            advancedModeToggle: document.getElementById('advanced-mode-toggle'),

            // Footer buttons
            cancelBtn: document.getElementById('cancel-btn'),
            testConnectionBtn: document.getElementById('test-connection-btn'),
            saveBtn: document.getElementById('save-btn')
        };

        // Count found elements
        const found = Object.values(elements).filter(el => el !== null).length;
        const total = Object.keys(elements).length;

        console.log(`[DOM] ✓ Cached ${found}/${total} elements`);

        if (found < total) {
            const missing = Object.keys(elements).filter(key => elements[key] === null);
            console.warn('[DOM] ⚠ Missing elements:', missing);
        }

        return elements;
    },

    /**
     * Show or hide element
     * @param {HTMLElement} element - Element to show/hide
     * @param {boolean} show - True to show, false to hide
     */
    toggleElement(element, show) {
        if (!element) return;

        if (show) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    },

    /**
     * Update provider field visibility based on selected provider
     * @param {string} provider - Selected provider ('gemini' or 'ollama')
     */
    updateProviderFields(provider) {
        console.log('[DOM] Updating provider fields for:', provider);

        // Get all Ollama and Gemini fields
        const ollamaFields = document.querySelectorAll('.ollama-field');
        const geminiFields = document.querySelectorAll('.gemini-field');

        // Show/hide based on provider
        for (const field of ollamaFields) {
            field.style.display = provider === 'ollama' ? 'block' : 'none';
        }

        for (const field of geminiFields) {
            field.style.display = provider === 'gemini' ? 'block' : 'none';
        }

        console.log('[DOM] ✓ Provider fields updated');
    }
};


// ============================================================================
// USER AUTHENTICATION
// ============================================================================

/**
 * User authentication module
 */
const UserAuth = {

    /**
     * Update user state from auth status
     */
    _updateUserState(authStatus) {
        AppState.user.authenticated = authStatus.authenticated || false;

        if (authStatus.authenticated && authStatus.user) {
            AppState.user.name = authStatus.user.name || authStatus.user.email || 'User';
            AppState.user.email = authStatus.user.email || '';
            AppState.user.avatar = authStatus.user.avatar || null;
        } else {
            AppState.user.name = 'Guest User';
            AppState.user.email = 'Using app without account';
            AppState.user.avatar = null;
        }
    },

    /**
     * Update user card UI elements
     */
    _updateUserCardUI(elements) {
        // Update name and email
        if (elements.userName) {
            elements.userName.textContent = AppState.user.name;
        }
        if (elements.userEmail) {
            elements.userEmail.textContent = AppState.user.email;
        }
    },

    /**
     * Update avatar display
     */
    _updateAvatarDisplay(elements) {
        if (AppState.user.avatar && elements.userAvatar) {
            elements.userAvatar.src = AppState.user.avatar;
            DOMManager.toggleElement(elements.userAvatar, true);
            DOMManager.toggleElement(elements.userAvatarIcon, false);
        } else {
            DOMManager.toggleElement(elements.userAvatar, false);
            DOMManager.toggleElement(elements.userAvatarIcon, true);
        }
    },

    /**
     * Update auth button visibility
     */
    _updateAuthButtons(elements) {
        const isAuthenticated = AppState.user.authenticated;
        DOMManager.toggleElement(elements.signinBtn, !isAuthenticated);
        DOMManager.toggleElement(elements.signoutBtn, isAuthenticated);
    },

    /**
     * Refresh user card with current authentication status
     */
    async refreshUserCard() {
        console.log('[UserAuth] Refreshing user card...');
        const elements = AppState.elements;

        try {
            // Get authentication status from main process
            const authStatus = await ipcRenderer.invoke('get-auth-status');
            console.log('[UserAuth] Auth status:', authStatus);

            // Update state and UI
            this._updateUserState(authStatus);
            this._updateUserCardUI(elements);
            this._updateAvatarDisplay(elements);
            this._updateAuthButtons(elements);

            console.log('[UserAuth] ✓ User card refreshed');

        } catch (error) {
            console.error('[UserAuth] ✗ Failed to refresh user card:', error);
        }
    },

    /**
     * Handle sign in button click
     */
    async handleSignIn() {
        console.log('[UserAuth] Sign in requested');

        try {
            // Trigger Clerk authentication flow
            await ipcRenderer.invoke('auth:start-clerk-login');
            console.log('[UserAuth] ✓ Sign in flow started');

            // Refresh user card after a delay to allow auth to complete
            setTimeout(() => {
                this.refreshUserCard();
            }, 2000);

        } catch (error) {
            console.error('[UserAuth] ✗ Sign in failed:', error);
            if (globalThis.showToast) {
                globalThis.showToast.error('Failed to sign in. Please try again.');
            }
        }
    },

    /**
     * Handle sign out button click
     */
    async handleSignOut() {
        console.log('[UserAuth] Sign out requested');

        try {
            // Trigger Clerk sign out
            await ipcRenderer.invoke('auth:clerk-logout');
            console.log('[UserAuth] ✓ Signed out successfully');

            if (globalThis.showToast) {
                globalThis.showToast.success('Signed out successfully');
            }

            // Refresh user card
            await this.refreshUserCard();

        } catch (error) {
            console.error('[UserAuth] ✗ Sign out failed:', error);
            if (globalThis.showToast) {
                globalThis.showToast.error('Failed to sign out. Please try again.');
            }
        }
    }
};

// ============================================================================
// OLLAMA INTEGRATION
// ============================================================================

/**
 * Ollama integration module
 */
const OllamaManager = {

    /**
     * Ollama API endpoint
     */
    endpoint: 'http://localhost:11434/api/tags',

    /**
     * Fetch available Ollama models
     * @returns {Promise<Array>} Array of model objects
     */
    async fetchModels() {
        console.log('[Ollama] Fetching models from:', this.endpoint);

        try {
            const response = await axios.get(this.endpoint, { timeout: 5000 });

            if (response.data && response.data.models) {
                const models = response.data.models;
                console.log(`[Ollama] ✓ Found ${models.length} models`);
                return models;
            } else {
                console.warn('[Ollama] ⚠ No models found in response');
                return [];
            }

        } catch (error) {
            console.error('[Ollama] ✗ Failed to fetch models:', error.message);
            throw error;
        }
    },

    /**
     * Update Ollama model dropdown
     */
    async updateModelList() {
        console.log('[Ollama] Updating model list...');
        const elements = AppState.elements;

        if (!elements.ollamaModel || !elements.ollamaStatus) {
            console.warn('[Ollama] ⚠ Required elements not found');
            return;
        }

        // Show loading state
        elements.ollamaModel.innerHTML = '<option value="">Loading models...</option>';
        elements.ollamaStatus.textContent = 'Connecting to Ollama...';
        elements.ollamaStatus.style.color = '#fbbf24'; // Yellow

        // Show refreshing toast
        if (globalThis.showToast && globalThis.showToast.refreshingModels) {
            globalThis.showToast.refreshingModels();
        }

        try {
            const models = await this.fetchModels();

            if (models.length === 0) {
                // No models found
                elements.ollamaModel.innerHTML = '<option value="">No models available</option>';
                elements.ollamaStatus.textContent = 'Ollama connected, but no models found';
                elements.ollamaStatus.style.color = '#fbbf24'; // Yellow

                AppState.ui.ollamaConnected = true;
                AppState.ui.ollamaModels = [];

            } else {
                // Populate dropdown with models
                elements.ollamaModel.innerHTML = models.map(model =>
                    `<option value="${model.name}">${model.name}</option>`
                ).join('');

                // Select saved model if available
                const savedModel = store.get('ollama_model');
                if (savedModel && models.some(m => m.name === savedModel)) {
                    elements.ollamaModel.value = savedModel;
                }

                elements.ollamaStatus.textContent = `✓ Connected - ${models.length} models available`;
                elements.ollamaStatus.style.color = '#22c55e'; // Green

                AppState.ui.ollamaConnected = true;
                AppState.ui.ollamaModels = models;

                console.log('[Ollama] ✓ Model list updated');

                // Show success toast
                if (globalThis.showToast && globalThis.showToast.modelsRefreshed) {
                    globalThis.showToast.modelsRefreshed(models.length);
                }
            }

        } catch (error) {
            // Connection failed
            elements.ollamaModel.innerHTML = '<option value="">Ollama not available</option>';
            elements.ollamaStatus.textContent = '✗ Cannot connect to Ollama (is it running?)';
            elements.ollamaStatus.style.color = '#ef4444'; // Red

            AppState.ui.ollamaConnected = false;
            AppState.ui.ollamaModels = [];

            console.error('[Ollama] ✗ Model list update failed');
        }
    }
};


// ============================================================================
// GEMINI API KEY MANAGEMENT
// ============================================================================

/**
 * Gemini API key management module
 */
const GeminiManager = {

    /**
     * Handle paste API key button click
     */
    async handlePasteApiKey() {
        console.log('[Gemini] Paste API key requested');
        const elements = AppState.elements;

        if (!elements.geminiApiKey) {
            console.warn('[Gemini] ⚠ API key input not found');
            return;
        }

        try {
            // Try IPC handler first (most reliable in Electron)
            let clipboardText = await ipcRenderer.invoke('get-clipboard-text');

            if (clipboardText) {
                elements.geminiApiKey.value = clipboardText.trim();
                console.log('[Gemini] ✓ API key pasted from clipboard (IPC)');

                if (globalThis.showToast) {
                    globalThis.showToast.success('API key pasted successfully');
                }
                return;
            }

            // Fallback to navigator.clipboard
            if (navigator.clipboard && navigator.clipboard.readText) {
                clipboardText = await navigator.clipboard.readText();
                elements.geminiApiKey.value = clipboardText.trim();
                console.log('[Gemini] ✓ API key pasted from clipboard (navigator)');

                if (globalThis.showToast) {
                    globalThis.showToast.success('API key pasted successfully');
                }
                return;
            }

            // No clipboard access available
            console.warn('[Gemini] ⚠ No clipboard access available');
            if (globalThis.showToast) {
                globalThis.showToast.warning('Please paste manually (Cmd/Ctrl+V)');
            }

        } catch (error) {
            console.error('[Gemini] ✗ Failed to paste API key:', error);
            if (globalThis.showToast) {
                globalThis.showToast.error('Failed to paste. Please paste manually.');
            }
        }
    },

    /**
     * Toggle API key visibility
     */
    handleToggleKeyVisibility() {
        console.log('[Gemini] Toggle key visibility requested');
        const elements = AppState.elements;

        if (!elements.geminiApiKey || !elements.toggleKeyVisibility) {
            return;
        }

        const input = elements.geminiApiKey;
        const icon = elements.toggleKeyVisibility.querySelector('.material-icons');

        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.textContent = 'visibility_off';
            console.log('[Gemini] ✓ API key visible');
        } else {
            input.type = 'password';
            if (icon) icon.textContent = 'visibility';
            console.log('[Gemini] ✓ API key hidden');
        }
    }
};

// ============================================================================
// UPDATE MANAGEMENT
// ============================================================================

/**
 * Update management module
 */
const UpdateManager = {

    /**
     * Display current app version
     */
    async displayVersion() {
        console.log('[Update] Displaying version...');
        const elements = AppState.elements;

        if (!elements.currentVersion) {
            return;
        }

        try {
            const version = await ipcRenderer.invoke('get-app-version');
            elements.currentVersion.textContent = `v${version || '1.0.0'}`;
            console.log('[Update] ✓ Version displayed:', version);
        } catch (error) {
            console.error('[Update] ✗ Failed to get version:', error);
            elements.currentVersion.textContent = 'v1.0.0';
        }
    },

    /**
     * Check for updates
     */
    async checkForUpdates() {
        console.log('[Update] Checking for updates...');
        const elements = AppState.elements;

        if (elements.checkUpdateBtn) {
            elements.checkUpdateBtn.disabled = true;
            elements.checkUpdateBtn.textContent = 'Checking...';
        }

        try {
            await ipcRenderer.invoke('check-for-updates');
            console.log('[Update] ✓ Update check initiated');

            if (globalThis.showToast) {
                globalThis.showToast.info('Checking for updates...');
            }

        } catch (error) {
            console.error('[Update] ✗ Update check failed:', error);
            if (globalThis.showToast) {
                globalThis.showToast.error('Failed to check for updates');
            }
        } finally {
            if (elements.checkUpdateBtn) {
                elements.checkUpdateBtn.disabled = false;
                elements.checkUpdateBtn.innerHTML = '<span class="material-icons">cloud_download</span><span>Check for Updates</span>';
            }
        }
    },

    /**
     * Show update notification
     * @param {Object} updateInfo - Update information
     */
    showUpdateNotification(updateInfo) {
        console.log('[Update] Showing update notification:', updateInfo);
        const elements = AppState.elements;

        if (!elements.updateNotification) {
            return;
        }

        // Update notification content
        if (elements.updateNewVersion) {
            elements.updateNewVersion.textContent = updateInfo.version || 'Unknown';
        }

        if (elements.updateReleaseNotes && updateInfo.releaseNotes) {
            elements.updateReleaseNotes.textContent = updateInfo.releaseNotes;
        }

        // Show notification
        DOMManager.toggleElement(elements.updateNotification, true);
        AppState.ui.updateAvailable = true;

        console.log('[Update] ✓ Update notification shown');
    },

    /**
     * Hide update notification
     */
    hideUpdateNotification() {
        console.log('[Update] Hiding update notification');
        const elements = AppState.elements;

        if (elements.updateNotification) {
            DOMManager.toggleElement(elements.updateNotification, false);
            AppState.ui.updateAvailable = false;
        }
    }
};


// ============================================================================
// SETTINGS PERSISTENCE
// ============================================================================

/**
 * Settings persistence module
 */
const SettingsManager = {

    /**
     * Handle save settings button click
     */
    async handleSave() {
        console.log('[Settings] Save requested');
        const elements = AppState.elements;

        try {
            // Get configuration from form
            const config = ConfigManager.getFromForm();

            // Validate configuration
            const validation = ConfigManager.validate(config);

            if (!validation.valid) {
                console.error('[Settings] ✗ Validation failed:', validation.errors);

                if (globalThis.showToast) {
                    globalThis.showToast.error(validation.errors[0] || 'Invalid settings');
                }
                return;
            }

            // Save configuration
            const saved = ConfigManager.save(config);

            if (!saved) {
                throw new Error('Failed to save configuration');
            }

            // Save Gemini API key separately
            if (elements.geminiApiKey) {
                const apiKey = elements.geminiApiKey.value.trim();
                if (apiKey) {
                    store.set('gemini_api_key', apiKey);
                    console.log('[Settings] ✓ Gemini API key saved');
                }
            }

            // Update app state
            AppState.config = config;

            // Notify main process of config update
            ipcRenderer.send('config-updated', config);

            console.log('[Settings] ✓ Settings saved successfully');

            if (globalThis.showToast) {
                globalThis.showToast.success('Settings saved successfully!');
            }

        } catch (error) {
            console.error('[Settings] ✗ Failed to save settings:', error);

            if (globalThis.showToast) {
                globalThis.showToast.error('Failed to save settings. Please try again.');
            }
        }
    },

    /**
     * Handle cancel button click
     */
    handleCancel() {
        console.log('[Settings] Cancel requested');

        // Reload configuration from store
        const config = ConfigManager.load();
        ConfigManager.loadIntoForm(config);

        console.log('[Settings] ✓ Settings reset to saved values');

        if (globalThis.showToast) {
            globalThis.showToast.info('Changes discarded');
        }

        // Close settings window
        ipcRenderer.send('close-settings');
    },

    /**
     * Handle test connection button click
     */
    async handleTestConnection() {
        console.log('[Settings] Test connection requested');
        const elements = AppState.elements;

        // Get current provider
        const provider = elements.providerSelect?.value || 'gemini';

        if (provider === 'ollama') {
            // Test Ollama connection
            await this.testOllamaConnection();
        } else if (provider === 'gemini') {
            // Test Gemini connection
            await this.testGeminiConnection();
        }
    },

    /**
     * Test Ollama connection
     */
    async testOllamaConnection() {
        console.log('[Settings] Testing Ollama connection...');

        if (globalThis.showToast) {
            globalThis.showToast.info('Testing Ollama connection...');
        }

        try {
            const models = await OllamaManager.fetchModels();

            if (models.length > 0) {
                console.log('[Settings] ✓ Ollama connection successful');

                if (globalThis.showToast) {
                    globalThis.showToast.success(`Ollama connected! Found ${models.length} models.`);
                }
            } else {
                console.warn('[Settings] ⚠ Ollama connected but no models found');

                if (globalThis.showToast) {
                    globalThis.showToast.warning('Ollama connected, but no models available.');
                }
            }

        } catch (error) {
            console.error('[Settings] ✗ Ollama connection failed:', error);

            if (globalThis.showToast) {
                globalThis.showToast.error('Cannot connect to Ollama. Is it running?');
            }
        }
    },

    /**
     * Validate Gemini API key input
     */
    _validateGeminiApiKey(apiKey) {
        if (!apiKey) {
            console.warn('[Settings] ⚠ No API key provided');
            if (globalThis.showToast) {
                globalThis.showToast.warning('Please enter a Gemini API key first.');
            }
            return false;
        }
        return true;
    },

    /**
     * Make Gemini API test request
     */
    async _makeGeminiTestRequest(apiKey, model) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`;
        return await axios.get(url, { timeout: 10000 });
    },

    /**
     * Handle Gemini test success
     */
    _handleGeminiTestSuccess() {
        console.log('[Settings] ✓ Gemini API key valid');
        if (globalThis.showToast) {
            globalThis.showToast.success('Gemini API key is valid!');
        }
    },

    /**
     * Handle Gemini test error
     */
    _handleGeminiTestError(error) {
        console.error('[Settings] ✗ Gemini connection failed:', error);

        if (globalThis.showToast) {
            if (error.response && error.response.status === 400) {
                globalThis.showToast.error('Invalid API key. Please check and try again.');
            } else {
                globalThis.showToast.error('Failed to connect to Gemini API.');
            }
        }
    },

    /**
     * Test Gemini connection
     */
    async testGeminiConnection() {
        console.log('[Settings] Testing Gemini connection...');
        const elements = AppState.elements;

        // Get and validate API key
        const apiKey = elements.geminiApiKey?.value.trim();
        if (!this._validateGeminiApiKey(apiKey)) {
            return;
        }

        if (globalThis.showToast) {
            globalThis.showToast.info('Testing Gemini API key...');
        }

        try {
            // Test API key by making a simple request
            const model = elements.geminiModel?.value || 'gemini-2.0-flash';
            const response = await this._makeGeminiTestRequest(apiKey, model);

            if (response.status === 200) {
                this._handleGeminiTestSuccess();
            } else {
                throw new Error('Invalid response from Gemini API');
            }

        } catch (error) {
            this._handleGeminiTestError(error);
        }
    }
};


// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Event handler module - attaches all event listeners
 */
const EventHandlers = {

    /**
     * Attach all event listeners
     */
    attachAll() {
        console.log('[Events] Attaching event listeners...');
        const elements = AppState.elements;

        // User authentication
        if (elements.signinBtn) {
            elements.signinBtn.addEventListener('click', () => UserAuth.handleSignIn());
        }
        if (elements.signoutBtn) {
            elements.signoutBtn.addEventListener('click', () => UserAuth.handleSignOut());
        }

        // Updates
        if (elements.checkUpdateBtn) {
            elements.checkUpdateBtn.addEventListener('click', () => UpdateManager.checkForUpdates());
        }
        if (elements.updateNowBtn) {
            elements.updateNowBtn.addEventListener('click', () => {
                console.log('[Events] Update now clicked');
                ipcRenderer.send('install-update');
            });
        }
        if (elements.updateLaterBtn) {
            elements.updateLaterBtn.addEventListener('click', () => {
                UpdateManager.hideUpdateNotification();
            });
        }

        // AI Provider selection
        if (elements.providerSelect) {
            elements.providerSelect.addEventListener('change', (e) => {
                const provider = e.target.value;
                console.log('[Events] Provider changed to:', provider);
                DOMManager.updateProviderFields(provider);
                AppState.ui.currentProvider = provider;
            });
        }

        // Ollama
        if (elements.refreshOllamaBtn) {
            elements.refreshOllamaBtn.addEventListener('click', () => OllamaManager.updateModelList());
        }

        // Gemini
        if (elements.pasteKeyBtn) {
            elements.pasteKeyBtn.addEventListener('click', () => GeminiManager.handlePasteApiKey());
        }
        if (elements.toggleKeyVisibility) {
            elements.toggleKeyVisibility.addEventListener('click', () => GeminiManager.handleToggleKeyVisibility());
        }

        // Footer buttons
        if (elements.saveBtn) {
            elements.saveBtn.addEventListener('click', () => SettingsManager.handleSave());
        }
        if (elements.cancelBtn) {
            elements.cancelBtn.addEventListener('click', () => SettingsManager.handleCancel());
        }
        if (elements.testConnectionBtn) {
            elements.testConnectionBtn.addEventListener('click', () => SettingsManager.handleTestConnection());
        }

        console.log('[Events] ✓ Event listeners attached');
    },

    /**
     * Attach IPC listeners
     */
    attachIPCListeners() {
        console.log('[Events] Attaching IPC listeners...');

        // Update available
        ipcRenderer.on('update-available', (_event, info) => {
            console.log('[Events] Update available:', info);
            UpdateManager.showUpdateNotification(info);

            if (globalThis.showToast && globalThis.showToast.updateAvailable) {
                globalThis.showToast.updateAvailable(info.version);
            }
        });

        // Update downloaded
        ipcRenderer.on('update-downloaded', (_event, info) => {
            console.log('[Events] Update downloaded:', info);

            if (globalThis.showToast && globalThis.showToast.updateDownloaded) {
                globalThis.showToast.updateDownloaded();
            }
        });

        // Update downloading
        ipcRenderer.on('update-downloading', (_event, progressObj) => {
            console.log('[Events] Update downloading:', progressObj);

            if (globalThis.showToast && globalThis.showToast.updateDownloading) {
                globalThis.showToast.updateDownloading(progressObj.percent);
            }
        });

        // Authentication status changed
        ipcRenderer.on('auth-status-changed', () => {
            console.log('[Events] Auth status changed');
            UserAuth.refreshUserCard();
        });

        console.log('[Events] ✓ IPC listeners attached');
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the settings page
 */
async function initialize() {
    console.log('[Settings] ========================================');
    console.log('[Settings] Initializing Settings Page v3.0.0');
    console.log('[Settings] ========================================');

    try {
        // Cache DOM elements
        AppState.elements = DOMManager.cacheElements();

        // Load configuration
        AppState.config = ConfigManager.load();
        ConfigManager.loadIntoForm(AppState.config);

        // Update provider fields visibility
        DOMManager.updateProviderFields(AppState.config.provider);
        AppState.ui.currentProvider = AppState.config.provider;

        // Attach event listeners
        EventHandlers.attachAll();
        EventHandlers.attachIPCListeners();

        // Initialize components
        await UserAuth.refreshUserCard();
        await UpdateManager.displayVersion();

        // If Ollama is selected, fetch models
        if (AppState.config.provider === 'ollama') {
            await OllamaManager.updateModelList();
        }

        // Mark as initialized
        AppState.isInitialized = true;

        console.log('[Settings] ========================================');
        console.log('[Settings] ✓ Initialization complete');
        console.log('[Settings] ========================================');

    } catch (error) {
        console.error('[Settings] ========================================');
        console.error('[Settings] ✗ Initialization failed:', error);
        console.error('[Settings] ========================================');

        if (globalThis.showToast) {
            globalThis.showToast.error('Failed to initialize settings page');
        }
    }
}

// ============================================================================
// START APPLICATION
// ============================================================================

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    // DOM is already ready
    initialize();
}

console.log('[Settings] Module loaded successfully');
