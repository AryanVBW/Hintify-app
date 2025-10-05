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

console.log('🚀🚀🚀 [Settings] settings.js is loading! 🚀🚀🚀');

// ============================================================================
// MODULE IMPORTS
// ============================================================================

console.log('[Settings] Loading Electron modules...');
const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const axios = require('axios');
console.log('[Settings] ✅ Electron modules loaded successfully');

// ============================================================================
// INITIALIZATION
// ============================================================================

const store = new Store();
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
    // Remove all theme classes
    document.body.className = '';
    document.documentElement.className = '';
    
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
      window.parent.postMessage({ type: 'close-embedded-settings' }, '*');
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

  // Close settings without saving
  window.parent.postMessage({ type: 'close-embedded-settings' }, '*');

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

    const text = await navigator.clipboard.readText();

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

  // Save button
  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', handleSaveSettings);
    console.log('[Settings] ✓ Save button listener attached');
  }

  // Cancel button
  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener('click', handleCancel);
    console.log('[Settings] ✓ Cancel button listener attached');
  }

  // Test connection button
  if (elements.testConnectionBtn) {
    elements.testConnectionBtn.addEventListener('click', handleTestConnection);
    console.log('[Settings] ✓ Test connection button listener attached');
  }

  // Sign in button
  if (elements.signInBtn) {
    elements.signInBtn.addEventListener('click', handleSignIn);
    console.log('[Settings] ✓ Sign in button listener attached');
  }

  // Sign out button
  if (elements.signOutBtn) {
    elements.signOutBtn.addEventListener('click', handleSignOut);
    console.log('[Settings] ✓ Sign out button listener attached');
  }

  // Refresh Ollama models button
  if (elements.refreshOllamaBtn) {
    elements.refreshOllamaBtn.addEventListener('click', handleRefreshOllamaModels);
    console.log('[Settings] ✓ Refresh Ollama models button listener attached');
  }

  // Paste API key button
  if (elements.pasteKeyBtn) {
    elements.pasteKeyBtn.addEventListener('click', handlePasteApiKey);
    console.log('[Settings] ✓ Paste API key button listener attached');
  }

  // Toggle key visibility button
  if (elements.toggleKeyVisibility) {
    elements.toggleKeyVisibility.addEventListener('click', handleToggleKeyVisibility);
    console.log('[Settings] ✓ Toggle key visibility button listener attached');
  }

  // Check for updates button
  if (elements.checkUpdateBtn) {
    elements.checkUpdateBtn.addEventListener('click', handleCheckForUpdates);
    console.log('[Settings] ✓ Check for updates button listener attached');
  }

  // Update now button
  const updateNowBtn = document.getElementById('update-now-btn');
  if (updateNowBtn) {
    updateNowBtn.addEventListener('click', handleUpdateNow);
    console.log('[Settings] ✓ Update now button listener attached');
  }

  // Update later button
  const updateLaterBtn = document.getElementById('update-later-btn');
  if (updateLaterBtn) {
    updateLaterBtn.addEventListener('click', handleUpdateLater);
    console.log('[Settings] ✓ Update later button listener attached');
  }

  // Provider select change
  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', updateProviderFields);
    console.log('[Settings] ✓ Provider select listener attached');
  }

  // Theme select change (apply immediately)
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
    console.log('[Settings] ✓ Theme select listener attached');
  }

  console.log('[Settings] All event listeners attached successfully');
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

  // Log which elements were found
  const foundElements = Object.entries(elements).filter(([_, el]) => el !== null);
  const missingElements = Object.entries(elements).filter(([_, el]) => el === null);

  console.log(`[Settings] Found ${foundElements.length} elements`);
  if (missingElements.length > 0) {
    console.warn('[Settings] Missing elements:', missingElements.map(([name]) => name));
  }
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
    // Step 1: Cache DOM elements
    cacheElements();

    // Step 2: Attach event listeners
    attachEventListeners();

    // Step 3: Load settings into form
    loadSettingsIntoForm();

    // Step 4: Refresh user card
    await refreshUserCard();

    // Step 5: Initialize updates section
    initializeUpdatesSection();

    // Step 6: Update Ollama models if Ollama is selected
    const config = loadConfig();
    if (config.provider === 'ollama') {
      await updateOllamaModelList();
    }

    // Step 7: Apply current theme
    applyTheme(config.theme);

    // Mark as initialized
    isInitialized = true;

    console.log('[Settings] ✅ Settings page initialized successfully');

  } catch (error) {
    console.error('[Settings] ❌ Failed to initialize settings page:', error);
    if (typeof toast !== 'undefined') {
      toast.error('Failed to load settings. Please refresh the page.', 5000);
    }
  }
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  console.log('[Settings] Waiting for DOM to load...');
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Settings] DOM loaded, initializing...');
    setupIpcListeners();
    await initializeSettings();
  });
} else {
  console.log('[Settings] DOM already loaded, initializing immediately...');
  setupIpcListeners();
  // Use setTimeout to ensure all scripts are loaded
  setTimeout(async () => {
    await initializeSettings();
  }, 100);
}

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
      console.log(`✅ ${name} button:`, {
        id: btn.id,
        disabled: btn.disabled,
        visible: !btn.classList.contains('hidden')
      });
    } else {
      console.error(`❌ ${name} button: NOT FOUND`);
    }
  });

  console.log('🧪 === DEBUG COMPLETE ===');
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

console.log('[Settings] 💡 Debug utilities available:');
console.log('[Settings] - window.debugSettingsButtons() - Check all buttons');
console.log('[Settings] - window.debugSettingsConfig() - View current config');

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


