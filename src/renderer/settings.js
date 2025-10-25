/**
 * Hintify Settings Page - Production-Ready Implementation
 *
 * This file handles all settings page functionality including:
 * - User authentication UI
 * - AI provider configuration
 * - Theme and appearance settings
 * - Update management
 * - Settings persistence
 *
 * @version 2.0.0
 * @author Hintify Team
 */

'use strict';

// ============================================================================
// MODULE IMPORTS WITH ERROR HANDLING
// ============================================================================

let ipcRenderer, Store, axios;

try {
    ({ ipcRenderer } = require('electron'));
    Store = require('electron-store');
    axios = require('axios');
    console.log('[Settings] All modules loaded successfully');
} catch (error) {
    console.error('[Settings] Failed to load modules:', error);
    // Create fallback objects to prevent crashes
    ipcRenderer = {
        invoke: () => Promise.resolve({}),
        send: () => {},
        on: () => {}
    };
    Store = class FallbackStore {
        get(key, defaultValue) { return defaultValue; }
        set() {}
    };
    axios = {
        get: () => Promise.reject(new Error('axios not available')),
        post: () => Promise.reject(new Error('axios not available'))
    };
}

// ============================================================================
// INITIALIZATION WITH ERROR HANDLING
// ============================================================================

let store;
try {
    store = new Store();
    console.log('[Settings] Store initialized successfully');
} catch (error) {
    console.error('[Settings] Failed to initialize store:', error);
    // Create fallback store
    store = {
        get: (key, defaultValue) => defaultValue,
        set: () => {},
        delete: () => {}
    };
}

let isInitialized = false;
let elements = {};

// Default configuration
const DEFAULT_CONFIG = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  advanced_mode: true
};

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

/**
 * Load configuration from store with defaults
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const config = { ...DEFAULT_CONFIG };
  Object.keys(DEFAULT_CONFIG).forEach(key => {
    const stored = store.get(key);
    if (stored !== undefined) {
      config[key] = stored;
    }
  });
  return config;
}

/**
 * Save configuration to store
 * @param {Object} config - Configuration object to save
 */
function saveConfig(config) {
  try {
    Object.keys(config).forEach(key => {
      store.set(key, config[key]);
    });
    console.log('[Settings] Configuration saved successfully');
  } catch (error) {
    console.error('[Settings] Failed to save configuration:', error);
    throw error;
  }
}

/**
 * Validate configuration before saving
 * @param {Object} config - Configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateConfig(config) {
  const errors = [];

  // Validate provider
  if (!['gemini', 'ollama'].includes(config.provider)) {
    errors.push('Invalid AI provider selected');
  }

  // Validate Gemini API key if Gemini is selected
  if (config.provider === 'gemini') {
    const apiKey = elements.geminiApiKey?.value?.trim();
    if (!apiKey) {
      errors.push('Gemini API key is required when using Gemini provider');
    } else if (apiKey.length < 10) {
      errors.push('Gemini API key appears to be invalid (too short)');
    }
  }

  // Validate Ollama model if Ollama is selected
  if (config.provider === 'ollama' && !config.ollama_model) {
    errors.push('Please select an Ollama model');
  }

  // Validate theme
  if (!['dark', 'light', 'glass'].includes(config.theme)) {
    errors.push('Invalid theme selected');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Apply theme to the document
 * @param {string} theme - Theme name ('dark', 'light', or 'glass')
 */
function applyTheme(theme) {
  try {
    // Remove only theme-related classes, preserve other classes
    const themeClasses = ['theme-dark', 'theme-pastel', 'theme-light', 'glassy-mode'];
    const glassyClasses = ['theme-glassy'];

    document.body.classList.remove(...themeClasses);
    document.documentElement.classList.remove(...glassyClasses);

    // Apply the selected theme
    if (theme === 'glass') {
      document.body.classList.add('theme-dark', 'glassy-mode');
      document.documentElement.classList.add('theme-glassy');
      store.set('glassy_mode', true);
    } else {
      document.body.classList.add(`theme-${theme || 'dark'}`);
      store.set('glassy_mode', false);
    }

    console.log('[Settings] Theme applied:', theme);
  } catch (error) {
    console.error('[Settings] Failed to apply theme:', error);
  }
}

// ============================================================================
// USER INTERFACE UPDATES
// ============================================================================

/**
 * Refresh user card with current authentication status
 */
async function refreshUserCard() {
  try {
    const status = await ipcRenderer.invoke('get-auth-status');
    const isAuthed = !!(status?.success && status?.authenticated && status?.user);
    const isGuest = store.get('guest_mode_enabled', false);

    // Update user name
    if (elements.userName) {
      elements.userName.textContent = isAuthed
        ? (status.user.name || status.user.firstName || status.user.email || 'User')
        : 'Guest User';
    }

    // Update user email
    if (elements.userEmail) {
      elements.userEmail.textContent = isAuthed
        ? (status.user.email || '')
        : (isGuest ? 'Guest Mode' : 'Using app without account');
    }

    // Handle avatar
    if (elements.userAvatar && elements.userAvatarIcon) {
      const avatarUrl = status?.user?.avatar || status?.user?.imageUrl || status?.user?.image_url || '';

      if (isAuthed && avatarUrl) {
        elements.userAvatar.src = avatarUrl;
        elements.userAvatar.classList.remove('hidden');
        elements.userAvatarIcon.classList.add('hidden');
      } else {
        elements.userAvatar.classList.add('hidden');
        elements.userAvatarIcon.classList.remove('hidden');
      }
    }

    // Toggle sign in/out buttons
    if (elements.signInBtn && elements.signOutBtn) {
      if (isAuthed) {
        elements.signInBtn.classList.add('hidden');
        elements.signOutBtn.classList.remove('hidden');
      } else {
        elements.signInBtn.classList.remove('hidden');
        elements.signOutBtn.classList.add('hidden');
      }
    }

    console.log('[Settings] User card refreshed');
  } catch (error) {
    console.error('[Settings] Failed to refresh user card:', error);
  }
}

/**
 * Update provider-specific fields visibility
 */
function updateProviderFields() {
  const provider = elements.providerSelect?.value;

  if (!provider) return;

  // Show/hide Ollama fields
  const ollamaFields = document.querySelectorAll('.ollama-field, #ollama-model, #refresh-ollama-models, #ollama-status-text');
  ollamaFields.forEach(field => {
    if (field) {
      field.closest('.setting-group')?.style.setProperty('display', provider === 'ollama' ? 'block' : 'none');
    }
  });

  // Show/hide Gemini fields
  const geminiFields = document.querySelectorAll('.gemini-field, #gemini-model, #gemini-api-key, #paste-key-btn, #toggle-key-visibility');
  geminiFields.forEach(field => {
    if (field) {
      const group = field.closest('.setting-group');
      if (group) {
        group.style.display = provider === 'gemini' ? 'block' : 'none';
      }
    }
  });

  console.log('[Settings] Provider fields updated for:', provider);
}

/**
 * Load settings into form fields
 */
function loadSettingsIntoForm() {
  try {
    const config = loadConfig();

    // Load provider
    if (elements.providerSelect) {
      elements.providerSelect.value = config.provider || 'gemini';
    }

    // Load models
    if (elements.ollamaModel) {
      elements.ollamaModel.value = config.ollama_model || '';
    }
    if (elements.geminiModel) {
      elements.geminiModel.value = config.gemini_model || 'gemini-2.0-flash';
    }

    // Load API key
    if (elements.geminiApiKey) {
      elements.geminiApiKey.value = store.get('gemini_api_key', '');
    }

    // Load theme
    if (elements.themeSelect) {
      elements.themeSelect.value = config.theme || 'dark';
    }

    // Load advanced mode
    if (elements.advancedModeToggle) {
      elements.advancedModeToggle.checked = config.advanced_mode !== false;
    }

    // Update provider fields visibility
    updateProviderFields();

    console.log('[Settings] Settings loaded into form');
  } catch (error) {
    console.error('[Settings] Failed to load settings into form:', error);
  }
}

// ============================================================================
// OLLAMA INTEGRATION
// ============================================================================

/**
 * Update Ollama model list from local Ollama instance
 */
async function updateOllamaModelList() {
  const statusText = document.getElementById('ollama-status-text');
  const modelSelect = elements.ollamaModel;

  if (!modelSelect) return;

  try {
    // Show loading state
    if (statusText) {
      statusText.textContent = 'Checking Ollama...';
      statusText.className = '';
    }

    // Fetch models from Ollama
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 5000
    });

    const models = response.data?.models || [];

    // Clear and populate dropdown
    modelSelect.innerHTML = '';

    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      if (statusText) {
        statusText.textContent = 'No models installed in Ollama';
        statusText.className = 'text-warning';
      }
      if (typeof toast !== 'undefined') {
        toast.warning('No Ollama models found. Please install models first.');
      }
      return;
    }

    // Add models to dropdown
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    });

    // Restore saved selection
    const savedModel = store.get('ollama_model');
    if (savedModel && models.some(m => m.name === savedModel)) {
      modelSelect.value = savedModel;
    }

    if (statusText) {
      statusText.textContent = `✓ ${models.length} model(s) available`;
      statusText.className = 'text-success';
    }

    if (typeof toast !== 'undefined') {
      toast.success(`Found ${models.length} Ollama model(s)`);
    }

    console.log('[Settings] Ollama models updated:', models.length);
  } catch (error) {
    console.error('[Settings] Failed to fetch Ollama models:', error);

    modelSelect.innerHTML = '<option value="">Ollama not available</option>';

    if (statusText) {
      statusText.textContent = '✗ Ollama not running or not installed';
      statusText.className = 'text-error';
    }

    if (typeof toast !== 'undefined') {
      toast.error('Could not connect to Ollama. Make sure it\'s running.');
    }
  }
}

// ============================================================================
// BUTTON ACTION HANDLERS
// ============================================================================

/**
 * Handle Save Settings button click
 */
async function handleSaveSettings() {
  try {
    console.log('[Settings] Save button clicked');

    // Gather configuration from form
    const config = {
      provider: elements.providerSelect?.value || 'gemini',
      ollama_model: elements.ollamaModel?.value || '',
      gemini_model: elements.geminiModel?.value || 'gemini-2.0-flash',
      theme: elements.themeSelect?.value || 'dark',
      advanced_mode: elements.advancedModeToggle?.checked !== false
    };

    // Save API key separately (sensitive data)
    const apiKey = elements.geminiApiKey?.value?.trim();
    if (apiKey) {
      store.set('gemini_api_key', apiKey);
    }

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.error('[Settings] Validation failed:', validation.errors);
      if (typeof toast !== 'undefined') {
        validation.errors.forEach(error => {
          toast.error(error, 4000);
        });
      }
      return;
    }

    // Save configuration
    saveConfig(config);

    // Apply theme immediately
    applyTheme(config.theme);

    // Notify main process
    ipcRenderer.send('config-updated', config);

    // Show success message
    if (typeof toast !== 'undefined') {
      toast.success('Settings saved successfully!', 3000);
    }

    console.log('[Settings] Settings saved successfully');

    // Close settings window after short delay
    setTimeout(() => {
      ipcRenderer.send('close-settings');
    }, 1000);

  } catch (error) {
    console.error('[Settings] Failed to save settings:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to save settings. Please try again.', 4000);
    }
  }
}

/**
 * Handle Cancel button click
 */
function handleCancel() {
  console.log('[Settings] Cancel button clicked');

  // Close settings window by sending IPC message
  ipcRenderer.send('close-settings');

  if (typeof toast !== 'undefined') {
    toast.info('Settings not saved', 2000);
  }
}

/**
 * Handle Test Connection button click
 */
async function handleTestConnection() {
  try {
    console.log('[Settings] Test connection button clicked');

    const provider = elements.providerSelect?.value;

    if (!provider) {
      if (typeof toast !== 'undefined') {
        toast.warning('Please select an AI provider first');
      }
      return;
    }

    // Show loading state
    if (typeof toast !== 'undefined') {
      toast.info('Testing connection...', 2000);
    }

    if (provider === 'gemini') {
      // Test Gemini connection
      const apiKey = elements.geminiApiKey?.value?.trim();

      if (!apiKey) {
        if (typeof toast !== 'undefined') {
          toast.error('Please enter your Gemini API key first');
        }
        return;
      }

      // Make a simple test request to Gemini
      const model = elements.geminiModel?.value || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await axios.post(url, {
        contents: [{
          parts: [{ text: 'Hello' }]
        }]
      }, {
        timeout: 10000
      });

      if (response.status === 200) {
        if (typeof toast !== 'undefined') {
          toast.success('✓ Gemini connection successful!', 3000);
        }
        console.log('[Settings] Gemini connection test passed');
      }

    } else if (provider === 'ollama') {
      // Test Ollama connection
      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 5000
      });

      if (response.status === 200) {
        const models = response.data?.models || [];
        if (typeof toast !== 'undefined') {
          toast.success(`✓ Ollama connected! Found ${models.length} model(s)`, 3000);
        }
        console.log('[Settings] Ollama connection test passed');
      }
    }

  } catch (error) {
    console.error('[Settings] Connection test failed:', error);

    let errorMessage = 'Connection test failed';

    if (error.response?.status === 400) {
      errorMessage = 'Invalid API key or request format';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = 'Invalid API key or unauthorized';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect. Make sure Ollama is running.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timed out';
    }

    if (typeof toast !== 'undefined') {
      toast.error(errorMessage, 4000);
    }
  }
}

/**
 * Handle Sign In button click
 */
async function handleSignIn() {
  try {
    console.log('[Settings] Sign in button clicked');

    await ipcRenderer.invoke('open-browser-auth');

    if (typeof toast !== 'undefined') {
      toast.info('Opening browser for sign in...', 3000);
    }

  } catch (error) {
    console.error('[Settings] Sign in failed:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to open sign in page', 3000);
    }
  }
}

/**
 * Handle Sign Out button click
 */
async function handleSignOut() {
  try {
    console.log('[Settings] Sign out button clicked');

    ipcRenderer.send('user-logged-out');

    if (typeof toast !== 'undefined') {
      toast.success('Signed out successfully', 2000);
    }

    // Refresh user card after short delay
    setTimeout(refreshUserCard, 800);

  } catch (error) {
    console.error('[Settings] Sign out failed:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to sign out', 3000);
    }
  }
}

/**
 * Handle Refresh Ollama Models button click
 */
async function handleRefreshOllamaModels() {
  console.log('[Settings] Refresh Ollama models button clicked');

  if (typeof toast !== 'undefined') {
    toast.info('Refreshing Ollama models...', 2000);
  }

  await updateOllamaModelList();
}

/**
 * Handle Paste API Key button click
 */
async function handlePasteApiKey() {
  try {
    console.log('[Settings] Paste API key button clicked');

    let text = '';
    // Try navigator.clipboard first
    try {
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (e) {
      console.warn('[Settings] navigator.clipboard.readText() failed:', e?.message);
    }

    // Fallback to Electron clipboard
    if (!text) {
      try {
        const { clipboard } = require('electron');
        text = clipboard.readText();
      } catch (e) {
        console.warn('[Settings] Electron clipboard fallback failed:', e?.message);
      }
    }

    if (text && elements.geminiApiKey) {
      elements.geminiApiKey.value = text.trim();

      if (typeof toast !== 'undefined') {
        toast.success('API key pasted from clipboard', 2000);
      }
    } else {
      if (typeof toast !== 'undefined') {
        toast.warning('Clipboard is empty', 2000);
      }
    }

  } catch (error) {
    console.error('[Settings] Failed to paste from clipboard:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to read clipboard', 3000);
    }
  }
}

/**
 * Handle Toggle API Key Visibility button click
 */
function handleToggleKeyVisibility() {
  console.log('[Settings] Toggle key visibility button clicked');

  if (!elements.geminiApiKey || !elements.toggleKeyVisibility) return;

  const isPassword = elements.geminiApiKey.type === 'password';
  elements.geminiApiKey.type = isPassword ? 'text' : 'password';

  // Update icon
  const icon = elements.toggleKeyVisibility.querySelector('.material-icons');
  if (icon) {
    icon.textContent = isPassword ? 'visibility_off' : 'visibility';
  }

  if (typeof toast !== 'undefined') {
    toast.info(isPassword ? 'API key visible' : 'API key hidden', 1500);
  }
}

// ============================================================================
// UPDATE MANAGEMENT
// ============================================================================

/**
 * Handle Check for Updates button click
 */
async function handleCheckForUpdates() {
  try {
    console.log('[Settings] Check for updates button clicked');

    if (typeof toast !== 'undefined') {
      toast.info('Checking for updates...', 2000);
    }

    // Trigger update check via IPC
    ipcRenderer.send('check-for-updates');

  } catch (error) {
    console.error('[Settings] Failed to check for updates:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to check for updates', 3000);
    }
  }
}

/**
 * Handle Update Now button click
 */
function handleUpdateNow() {
  console.log('[Settings] Update now button clicked');

  // Hide notification banner
  const updateNotification = document.getElementById('update-notification');
  if (updateNotification) {
    updateNotification.classList.add('hidden');
  }

  // Trigger update download
  ipcRenderer.send('download-update');

  if (typeof toast !== 'undefined') {
    toast.info('Downloading update...', 3000);
  }
}

/**
 * Handle Update Later button click
 */
function handleUpdateLater() {
  console.log('[Settings] Update later button clicked');

  // Hide notification banner
  const updateNotification = document.getElementById('update-notification');
  if (updateNotification) {
    updateNotification.classList.add('hidden');
  }

  // Dismiss update for 24 hours
  ipcRenderer.send('dismiss-update', 24 * 60 * 60 * 1000);

  if (typeof toast !== 'undefined') {
    toast.info('Update reminder dismissed for 24 hours', 3000);
  }
}

/**
 * Initialize updates section
 */
function initializeUpdatesSection() {
  try {
    // Load and display current version
    let version = '';
    try {
      const pkg = require('../../package.json');
      version = pkg?.version || '';
    } catch (error) {
      console.warn('[Settings] Could not load package.json:', error);
    }

    const currentVersionEl = document.getElementById('current-version');
    if (currentVersionEl) {
      currentVersionEl.textContent = version || 'Unknown';
    }

    console.log('[Settings] Updates section initialized, version:', version);
  } catch (error) {
    console.error('[Settings] Failed to initialize updates section:', error);
  }
}

// ============================================================================
// EVENT LISTENER SETUP
// ============================================================================

/**
 * Attach event listeners to all interactive elements
 */
function attachEventListeners() {
  console.log('[Settings] Attaching event listeners...');

  // Track successful and failed listener attachments
  const attached = [];
  const failed = [];

  // Helper function to safely attach event listeners
  function safeAttach(element, elementName, event, handler) {
    try {
      if (element && typeof element.addEventListener === 'function') {
        element.addEventListener(event, (e) => {
          try {
            console.log(`[Settings] Button clicked: ${elementName}`);
            // Prevent default behavior for buttons
            if (e.preventDefault) e.preventDefault();
            // Stop bubbling in case any parent overlay captures clicks
            if (e.stopPropagation) e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();

            // Call the handler
            handler(e);
          } catch (error) {
            console.error(`[Settings] Error in ${elementName} handler:`, error);
          }
        });
        attached.push(elementName);
        console.log(`[Settings] ✓ ${elementName} listener attached`);
        return true;
      } else {
        failed.push(`${elementName} (element not found or invalid)`);
        console.error(`[Settings] ❌ ${elementName} element not found or invalid:`, element);
        return false;
      }
    } catch (error) {
      failed.push(`${elementName} (error: ${error.message})`);
      console.error(`[Settings] ❌ Failed to attach ${elementName} listener:`, error);
      return false;
    }
  }

  // Attach all event listeners
  safeAttach(elements.saveBtn, 'Save button', 'click', handleSaveSettings);
  safeAttach(elements.cancelBtn, 'Cancel button', 'click', handleCancel);
  safeAttach(elements.testConnectionBtn, 'Test connection button', 'click', handleTestConnection);
  safeAttach(elements.signInBtn, 'Sign in button', 'click', handleSignIn);
  safeAttach(elements.signOutBtn, 'Sign out button', 'click', handleSignOut);
  safeAttach(elements.refreshOllamaBtn, 'Refresh Ollama models button', 'click', handleRefreshOllamaModels);
  safeAttach(elements.pasteKeyBtn, 'Paste API key button', 'click', handlePasteApiKey);
  safeAttach(elements.toggleKeyVisibility, 'Toggle key visibility button', 'click', handleToggleKeyVisibility);
  safeAttach(elements.checkUpdateBtn, 'Check for updates button', 'click', handleCheckForUpdates);

  // Update-related buttons (may not be cached in elements object)
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateLaterBtn = document.getElementById('update-later-btn');
  safeAttach(updateNowBtn, 'Update now button', 'click', handleUpdateNow);
  safeAttach(updateLaterBtn, 'Update later button', 'click', handleUpdateLater);

  // Provider and theme change listeners
  safeAttach(elements.providerSelect, 'Provider select', 'change', updateProviderFields);
  safeAttach(elements.themeSelect, 'Theme select', 'change', (e) => {
    applyTheme(e.target.value);
  });

  // Summary
  console.log(`[Settings] Event listeners summary:`);
  console.log(`[Settings] ✓ Successfully attached: ${attached.length} listeners`);
  if (attached.length > 0) {
    console.log(`[Settings]   - ${attached.join(', ')}`);
  }

  if (failed.length > 0) {
    console.error(`[Settings] ❌ Failed to attach: ${failed.length} listeners`);
    console.error(`[Settings]   - ${failed.join(', ')}`);
  }

  // If critical buttons failed, try alternative approach
  if (failed.some(f => f.includes('Save button') || f.includes('Cancel button'))) {
    console.log('[Settings] Attempting alternative button selection...');

    // Try to find buttons by different methods
    const saveBtn = document.querySelector('#save-btn, button[id="save-btn"], .btn-primary[type="button"]');
    const cancelBtn = document.querySelector('#cancel-btn, button[id="cancel-btn"], .btn-secondary[type="button"]');

    if (saveBtn) {
      console.log('[Settings] Found Save button via alternative selector');
      safeAttach(saveBtn, 'Save button (alternative)', 'click', handleSaveSettings);
    }

    if (cancelBtn) {
      console.log('[Settings] Found Cancel button via alternative selector');
      safeAttach(cancelBtn, 'Cancel button (alternative)', 'click', handleCancel);
    }
  }

  return { attached: attached.length, failed: failed.length };
}

// ============================================================================
// DOM ELEMENT CACHING
// ============================================================================

/**
 * Cache references to all DOM elements
 */
function cacheElements() {
  console.log('[Settings] Caching DOM elements...');

  elements = {
    // User card
    userName: document.getElementById('settings-user-name'),
    userEmail: document.getElementById('settings-user-email'),
    userAvatar: document.getElementById('settings-user-avatar'),
    userAvatarIcon: document.getElementById('settings-user-avatar-icon'),
    signInBtn: document.getElementById('settings-signin-btn'),
    signOutBtn: document.getElementById('settings-signout-btn'),

    // AI Settings
    providerSelect: document.getElementById('provider-select'),
    ollamaModel: document.getElementById('ollama-model'),
    geminiModel: document.getElementById('gemini-model'),
    geminiApiKey: document.getElementById('gemini-api-key'),
    pasteKeyBtn: document.getElementById('paste-key-btn'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    refreshOllamaBtn: document.getElementById('refresh-ollama-models'),

    // Appearance
    themeSelect: document.getElementById('theme-select'),
    advancedModeToggle: document.getElementById('advanced-mode-toggle'),

    // Updates
    checkUpdateBtn: document.getElementById('check-update-btn'),

    // Footer buttons
    cancelBtn: document.getElementById('cancel-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    saveBtn: document.getElementById('save-btn'),

    // Status message
    statusMessage: document.getElementById('status-message')
  };

  // Log which elements were found and ensure they exist
  const foundElements = Object.entries(elements).filter(([_, el]) => el !== null);
  const missingElements = Object.entries(elements).filter(([_, el]) => el === null);

  console.log(`[Settings] Found ${foundElements.length}/${Object.keys(elements).length} elements`);

  if (missingElements.length > 0) {
    console.error('[Settings] Missing critical elements:', missingElements.map(([name]) => name));

    // For critical buttons, try alternative selection methods
    const criticalButtons = ['saveBtn', 'cancelBtn', 'testConnectionBtn'];
    criticalButtons.forEach(btnName => {
      if (!elements[btnName]) {
        const btnId = btnName.replace('Btn', '-btn');
        const element = document.querySelector(`#${btnId}`) || document.querySelector(`button[id="${btnId}"]`);
        if (element) {
          elements[btnName] = element;
          console.log(`[Settings] ✓ Found ${btnName} using fallback selector`);
        } else {
          console.error(`[Settings] ❌ Critical button ${btnName} (id: ${btnId}) not found`);
        }
      }
    });
  }

  return elements;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the settings page
 */
async function initializeSettings() {
  // Prevent double initialization
  if (isInitialized) {
    console.warn('[Settings] Already initialized, skipping...');
    return;
  }

  console.log('[Settings] 🚀 Initializing settings page...');

  try {
    // Step 1: Wait for DOM to be fully ready
    if (document.readyState !== 'complete') {
      console.log('[Settings] Waiting for document ready state...');
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
          // Fallback timeout
          setTimeout(resolve, 2000);
        }
      });
    }

    // Step 2: Cache DOM elements with retry logic
    console.log('[Settings] Step 1/7: Caching DOM elements...');
    const elementsFound = cacheElements();

    // Retry element caching if critical elements are missing
    const criticalElements = ['saveBtn', 'cancelBtn'];
    const missingCritical = criticalElements.filter(name => !elements[name]);

    if (missingCritical.length > 0) {
      console.warn('[Settings] Missing critical elements, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, 500));
      cacheElements();
    }

    // Step 3: Attach event listeners
    console.log('[Settings] Step 2/7: Attaching event listeners...');
    const listenerResults = attachEventListeners();

    if (listenerResults.failed > 0) {
      console.warn(`[Settings] Some event listeners failed to attach (${listenerResults.failed} failed, ${listenerResults.attached} succeeded)`);
    }
    // Step 2.5: Install global click logger and delegated handlers for robustness
    try {
      installGlobalClickLogger();
      installDelegatedHandlers();
      logElementDiagnostics();
    } catch (e) {
      console.warn('[Settings] Failed to install global click handlers/diagnostics:', e?.message);
    }


    // Step 4: Load settings into form
    console.log('[Settings] Step 3/7: Loading settings into form...');
    loadSettingsIntoForm();

    // Step 5: Refresh user card
    console.log('[Settings] Step 4/7: Refreshing user card...');
    await refreshUserCard();

    // Step 6: Initialize updates section
    console.log('[Settings] Step 5/7: Initializing updates section...');
    initializeUpdatesSection();

    // Step 7: Update Ollama models if Ollama is selected
    console.log('[Settings] Step 6/7: Checking Ollama configuration...');
    const config = loadConfig();
    if (config.provider === 'ollama') {
      await updateOllamaModelList();
    }

    // Step 8: Apply current theme
    console.log('[Settings] Step 7/7: Applying theme...');
    applyTheme(config.theme);

    // Mark as initialized
    isInitialized = true;

    console.log('[Settings] ✅ Settings page initialized successfully');

    // Add a small delay and then test button functionality
    setTimeout(() => {
      console.log('[Settings] Running post-initialization button test...');
      testButtonFunctionality();
    }, 1000);

  } catch (error) {
    console.error('[Settings] ❌ Failed to initialize settings page:', error);

    // Show error to user if toast is available
    if (typeof toast !== 'undefined') {
      toast.error('Failed to load settings. Please refresh the page.', 5000);
    } else {
      // Fallback: show alert
      alert('Failed to load settings. Please refresh the page.\n\nError: ' + error.message);
    }

    // Try to recover by retrying initialization after a delay
    console.log('[Settings] Attempting recovery in 3 seconds...');
    setTimeout(async () => {
      isInitialized = false;
      await initializeSettings();
    }, 3000);
  }
}

/**
 * Test button functionality after initialization
 */
function testButtonFunctionality() {
  console.log('[Settings] 🧪 Testing button functionality...');

  const buttonsToTest = [
    { name: 'Save', element: elements.saveBtn, id: 'save-btn' },
    { name: 'Cancel', element: elements.cancelBtn, id: 'cancel-btn' },
    { name: 'Test Connection', element: elements.testConnectionBtn, id: 'test-connection-btn' }
  ];

  const workingButtons = [];
  const brokenButtons = [];

  buttonsToTest.forEach(({ name, element, id }) => {
    if (element && element.onclick !== undefined) {
      // Check if element is visible and not disabled
      const isVisible = !element.classList.contains('hidden') &&
                       element.style.display !== 'none' &&
                       element.offsetParent !== null;
      const isEnabled = !element.disabled;

      if (isVisible && isEnabled) {
        workingButtons.push(name);
        console.log(`[Settings] ✓ ${name} button: Working (visible: ${isVisible}, enabled: ${isEnabled})`);
      } else {
        brokenButtons.push(`${name} (visible: ${isVisible}, enabled: ${isEnabled})`);
        console.warn(`[Settings] ⚠️ ${name} button: Issue detected (visible: ${isVisible}, enabled: ${isEnabled})`);
      }
    } else {
      brokenButtons.push(`${name} (element not found)`);
      console.error(`[Settings] ❌ ${name} button: Not found or invalid`);

      // Try to find the element again
      const fallbackElement = document.getElementById(id);
      if (fallbackElement) {
        console.log(`[Settings] Found ${name} button using fallback selector`);
      }
    }
  });

  if (workingButtons.length === buttonsToTest.length) {
    console.log('[Settings] ✅ All critical buttons are working!');
  } else {
    console.error(`[Settings] ❌ ${brokenButtons.length} buttons have issues:`, brokenButtons);
  }

  return {
    working: workingButtons,
    broken: brokenButtons,
    total: buttonsToTest.length
  };
}

// ============================================================================
// IPC EVENT LISTENERS
// ============================================================================

/**
 * Set up IPC event listeners for communication with main process
 */
function setupIpcListeners() {
  console.log('[Settings] Setting up IPC listeners...');

  // Listen for authentication updates
  ipcRenderer.on('auth-status-changed', async () => {
    console.log('[Settings] Auth status changed, refreshing user card...');
    await refreshUserCard();
  });

  // Listen for update status changes
  ipcRenderer.on('update-status', (event, payload) => {
    console.log('[Settings] Update status:', payload);

    if (payload.status === 'available') {
      // Show update notification
      const updateNotification = document.getElementById('update-notification');
      const updateNewVersion = document.getElementById('update-new-version');
      const updateReleaseNotes = document.getElementById('update-release-notes');

      if (updateNotification) {
        updateNotification.classList.remove('hidden');
      }
      if (updateNewVersion) {
        updateNewVersion.textContent = payload.version || '';
      }
      if (updateReleaseNotes && payload.releaseNotes) {
        updateReleaseNotes.textContent = payload.releaseNotes;
      }

      if (typeof toast !== 'undefined') {
        toast.info(`Update available: ${payload.version}`, 4000);
      }
    } else if (payload.status === 'not-available') {
      if (typeof toast !== 'undefined') {
        toast.success('You are using the latest version!', 3000);
      }
    } else if (payload.status === 'downloading') {
      if (typeof toast !== 'undefined') {
        toast.info('Downloading update...', 3000);
      }
    } else if (payload.status === 'downloaded') {
      if (typeof toast !== 'undefined') {
        toast.success('Update downloaded! Restart to install.', 5000);
      }
    } else if (payload.status === 'error') {
      if (typeof toast !== 'undefined') {
        toast.error('Update check failed', 3000);
      }
    }
  });

  console.log('[Settings] IPC listeners set up successfully');
}

// ============================================================================
// DOCUMENT READY
// ============================================================================

// ============================================================================
// DOCUMENT READY HANDLING
// ============================================================================

/**
 * Robust initialization that handles various document ready states
 */
function initializeWhenReady() {
  console.log('[Settings] Document ready state:', document.readyState);

  // Set up IPC listeners immediately
  setupIpcListeners();

  // Initialize based on current document state
  if (document.readyState === 'loading') {
    console.log('[Settings] Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', async () => {
      console.log('[Settings] DOMContentLoaded fired, initializing...');
      // Add small delay to ensure all scripts are loaded
      setTimeout(async () => {
        await initializeSettings();
      }, 100);
    });
  } else if (document.readyState === 'interactive') {
    console.log('[Settings] Document interactive, initializing with delay...');
    // Document has finished loading but sub-resources might still be loading
    setTimeout(async () => {
      await initializeSettings();
    }, 200);
  } else {
    console.log('[Settings] Document complete, initializing immediately...');
    // Document and all sub-resources have finished loading
    setTimeout(async () => {
      await initializeSettings();
    }, 50);
  }
}
/**
 * Install a capture-phase click logger to trace where clicks go
 */
function installGlobalClickLogger() {
  if (installGlobalClickLogger._installed) return;
  installGlobalClickLogger._installed = true;
  document.addEventListener('click', (e) => {
    try {
      const path = (e.composedPath ? e.composedPath() : []).map(el => el?.id || el?.className || el?.tagName).slice(0, 6);
      const tgt = describeEl(e.target);
      console.log('[Settings][Capture] click:', { target: tgt, path, x: e.clientX, y: e.clientY });
    } catch {}
  }, true);
}

/**
 * Delegated handlers to ensure buttons work even if direct listeners fail
 */
function installDelegatedHandlers() {
  if (installDelegatedHandlers._installed) return;
  installDelegatedHandlers._installed = true;
  const map = [
    { id: 'save-btn', name: 'Save', handler: handleSaveSettings },
    { id: 'test-connection-btn', name: 'Test Connection', handler: handleTestConnection },
    { id: 'paste-key-btn', name: 'Paste API key', handler: handlePasteApiKey },
    { id: 'toggle-key-visibility', name: 'Toggle key visibility', handler: handleToggleKeyVisibility },
    { id: 'settings-signin-btn', name: 'Sign In', handler: handleSignIn }
  ];
  document.addEventListener('click', (e) => {
    try {
      for (const { id, name, handler } of map) {
        const el = e.target?.closest ? e.target.closest(`#${id}`) : null;
        if (el) {
          console.log(`[Settings][Delegation] Handling ${name} via capture`);
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          try { handler.call(el, e); } catch (err) {
            console.error(`[Settings] Delegated handler error for ${name}:`, err);
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[Settings] Delegation handler error:', err?.message);
    }
  }, true);
}

/**
 * Log interactive diagnostics for key buttons
 */
function logElementDiagnostics() {
  const list = [
    { name: 'Save', el: elements.saveBtn },
    { name: 'Test Connection', el: elements.testConnectionBtn },
    { name: 'Paste', el: elements.pasteKeyBtn },
    { name: 'Toggle', el: elements.toggleKeyVisibility },
    { name: 'Sign In', el: elements.signInBtn }
  ];
  list.forEach(({ name, el }) => {
    try {
      if (!el) { console.warn(`[Settings][Diag] ${name}: element not found`); return; }
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      console.log(`[Settings][Diag] ${name}:`, {
        exists: !!el,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        pointerEvents: cs.pointerEvents,
        disabled: !!el.disabled,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        zIndex: cs.zIndex
      });
    } catch (err) {
      console.warn(`[Settings][Diag] ${name}: failed to inspect`, err?.message);
    }
  });
}

function describeEl(el) {
  if (!el) return 'null';
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className ? `.${String(el.className).split(' ').join('.')}` : '';
  return `${el.tagName}${id}${cls}`;
}


// Start initialization
initializeWhenReady();

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Debug function to test all buttons (callable from console)
 */
window.debugSettingsButtons = function() {
  console.log('🧪 === SETTINGS BUTTONS DEBUG ===');

  const buttons = {
    'Save': elements.saveBtn,
    'Cancel': elements.cancelBtn,
    'Test Connection': elements.testConnectionBtn,
    'Sign In': elements.signInBtn,
    'Sign Out': elements.signOutBtn,
    'Refresh Ollama': elements.refreshOllamaBtn,
    'Paste Key': elements.pasteKeyBtn,
    'Toggle Visibility': elements.toggleKeyVisibility,
    'Check Updates': elements.checkUpdateBtn
  };

  Object.entries(buttons).forEach(([name, btn]) => {
    if (btn) {
      const isVisible = !btn.classList.contains('hidden') &&
                       btn.style.display !== 'none' &&
                       btn.offsetParent !== null;
      const isEnabled = !btn.disabled;

      console.log(`✅ ${name} button:`, {
        id: btn.id,
        disabled: btn.disabled,
        visible: isVisible,
        enabled: isEnabled,
        hasEventListeners: btn.onclick !== null || btn._listeners !== undefined,
        classList: Array.from(btn.classList),
        style: btn.style.cssText
      });
    } else {
      console.error(`❌ ${name} button: NOT FOUND`);
    }
  });

  console.log('🧪 === DEBUG COMPLETE ===');
};

/**
 * Test button click functionality
 */
window.testButtonClicks = function() {
  console.log('🧪 === TESTING BUTTON CLICKS ===');

  const testButtons = [
    { name: 'Save', element: elements.saveBtn, handler: handleSaveSettings },
    { name: 'Cancel', element: elements.cancelBtn, handler: handleCancel },
    { name: 'Test Connection', element: elements.testConnectionBtn, handler: handleTestConnection }
  ];

  testButtons.forEach(({ name, element, handler }) => {
    if (element) {
      console.log(`Testing ${name} button...`);
      try {
        // Test if we can call the handler directly
        console.log(`  - Handler function exists: ${typeof handler === 'function'}`);

        // Test if click event can be dispatched
        const clickEvent = new MouseEvent('click', { bubbles: true });
        element.dispatchEvent(clickEvent);
        console.log(`  ✅ ${name} click event dispatched successfully`);

      } catch (error) {
        console.error(`  ❌ ${name} click test failed:`, error);
      }
    } else {
      console.error(`  ❌ ${name} button element not found`);
    }
  });

  console.log('🧪 === CLICK TESTING COMPLETE ===');
};

/**
 * Manual button test - actually trigger functionality
 */
window.manualButtonTest = function(buttonName) {
  console.log(`🧪 === MANUAL TEST: ${buttonName.toUpperCase()} ===`);

  const handlers = {
    'save': handleSaveSettings,
    'cancel': handleCancel,
    'test': handleTestConnection,
    'signin': handleSignIn,
    'signout': handleSignOut,
    'refresh': handleRefreshOllamaModels,
    'paste': handlePasteApiKey,
    'toggle': handleToggleKeyVisibility,
    'update': handleCheckForUpdates
  };

  const handler = handlers[buttonName.toLowerCase()];
  if (handler && typeof handler === 'function') {
    try {
      console.log(`Manually calling ${buttonName} handler...`);
      handler();
      console.log(`✅ ${buttonName} handler executed successfully`);
    } catch (error) {
      console.error(`❌ ${buttonName} handler failed:`, error);
    }
  } else {
    console.error(`❌ Handler for ${buttonName} not found or not a function`);
    console.log('Available handlers:', Object.keys(handlers));
  }
};

/**
 * Debug function to check current configuration
 */
window.debugSettingsConfig = function() {
  console.log('🔧 === CURRENT CONFIGURATION ===');
  const config = loadConfig();
  console.log(config);
  console.log('🔧 === CONFIG COMPLETE ===');
};

/**
 * Force reinitialize settings (useful for debugging)
 */
window.forceReinitialize = function() {
  console.log('🔄 === FORCING REINITIALIZATION ===');
  isInitialized = false;
  setTimeout(async () => {
    await initializeSettings();
    console.log('✅ Reinitialization complete');
  }, 100);
};

console.log('[Settings] 💡 Debug utilities available:');
console.log('[Settings] - window.debugSettingsButtons() - Check all buttons');
console.log('[Settings] - window.testButtonClicks() - Test button click events');
console.log('[Settings] - window.manualButtonTest("save") - Manually test specific button');
console.log('[Settings] - window.debugSettingsConfig() - View current config');
console.log('[Settings] - window.forceReinitialize() - Force settings reinit');
console.log('[Settings] - Available manual tests: save, cancel, test, signin, signout, refresh, paste, toggle, update');

// ============================================================================
// EXPORTS (for potential use by other modules)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadConfig,
    saveConfig,
    applyTheme,
    refreshUserCard,
    updateOllamaModelList
  };
}


