const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const axios = require('axios');

// Initialize store
const store = new Store();

// (Removed duplicate/broken saveSettings block at top)
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  advanced_mode: true
};

// DOM elements
let elements = {};

// Load configuration
function loadConfig() {
  const config = { ...defaultConfig };
  Object.keys(defaultConfig).forEach(key => {
    const stored = store.get(key);
    if (stored !== undefined) {
      config[key] = stored;
    }
  });
  return config;
}

// Save configuration
function saveConfig(config) {
  Object.keys(config).forEach(key => {
    store.set(key, config[key]);
  });
}

// Apply theme
function applyTheme(theme) {
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
}

// Show status message (now using toast notifications)
function showStatus(message, type = 'info', duration = 3000) {
  console.log(`[Settings] 📢 Status: ${type} - ${message}`);

  // Use toast notification system
  if (typeof toast !== 'undefined') {
    toast.show(message, type, duration);
  } else {
    // Fallback to old system if toast not loaded
    const statusEl = elements.statusMessage;
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status-message ${type} fade-in`;
    statusEl.classList.remove('hidden');

    setTimeout(() => {
      statusEl.classList.add('hidden');
    }, duration);
  }
}

// User card helpers
async function refreshUserCard() {
  try {
    const status = await ipcRenderer.invoke('get-auth-status');
    const isAuthed = !!(status && status.success && status.authenticated && status.user);
    const isGuest = store.get('guest_mode_enabled', false);
    if (elements.userName) elements.userName.textContent = isAuthed ? (status.user.name || status.user.firstName || status.user.email || 'User') : 'Guest User';
    if (elements.userEmail) elements.userEmail.textContent = isAuthed ? (status.user.email || '') : (isGuest ? 'Guest Mode' : 'Using app without account');

    // Handle avatar - show image if available, otherwise show icon
    if (elements.userAvatar && elements.userAvatarIcon) {
      const avatarUrl = status?.user?.avatar || status?.user?.imageUrl || status?.user?.image_url || '';
      if (isAuthed && avatarUrl) {
        // Show user's profile picture
        elements.userAvatar.src = avatarUrl;
        elements.userAvatar.classList.remove('hidden');
        elements.userAvatarIcon.classList.add('hidden');
      } else {
        // Show default icon for guest users
        elements.userAvatar.classList.add('hidden');
        elements.userAvatarIcon.classList.remove('hidden');
      }
    }

    if (elements.signInBtn && elements.signOutBtn) {
      elements.signInBtn.classList.toggle('hidden', isAuthed);
      elements.signOutBtn.classList.toggle('hidden', !isAuthed);
    }
  } catch (e) {
    // Silent fail; keep defaults
  }
}

// Fetch available Ollama models
async function fetchOllamaModels() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
    return { 
      success: true, 
      models: response.data.models || [],
      running: true
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { 
        success: false, 
        running: false,
        message: 'Ollama is not running. Please start Ollama to see available models.' 
      };
    }
    return { 
      success: false, 
      running: false,
      message: `Error fetching models: ${error.message}` 
    };
  }
}

// Update Ollama model dropdown with available models
async function updateOllamaModelList() {
  const modelSelect = elements.ollamaModel;
  const statusText = document.getElementById('ollama-status-text');
  const refreshBtn = document.getElementById('refresh-ollama-models');
  
  if (!modelSelect || !statusText) return;

  // Set loading state
  if (refreshBtn) refreshBtn.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  statusText.textContent = 'Checking Ollama status...';
  statusText.style.color = 'var(--fg-muted)';

  const result = await fetchOllamaModels();

  if (result.success && result.models.length > 0) {
    // Clear and populate dropdown
    modelSelect.innerHTML = '';
    
    // Get current saved model
    const currentModel = store.get('ollama_model', 'granite3.2-vision:2b');
    
    let currentModelFound = false;
    result.models.forEach(model => {
      const modelName = model.name;
      const option = document.createElement('option');
      option.value = modelName;
      option.textContent = modelName;
      if (modelName === currentModel) {
        option.selected = true;
        currentModelFound = true;
      }
      modelSelect.appendChild(option);
    });
    
    // If current model not found in list, add it as first option
    if (!currentModelFound && currentModel) {
      const option = document.createElement('option');
      option.value = currentModel;
      option.textContent = `${currentModel} (not installed)`;
      option.selected = true;
      modelSelect.insertBefore(option, modelSelect.firstChild);
    }
    
    statusText.innerHTML = `✅ Ollama is running. Found ${result.models.length} model(s).`;
    statusText.style.color = 'var(--success, #4ade80)';

    // Show success toast
    if (typeof toast !== 'undefined') {
      toast.modelsRefreshed(result.models.length);
    }
  } else if (!result.running) {
    // Ollama not running
    modelSelect.innerHTML = '<option value="">Ollama not running</option>';
    const currentModel = store.get('ollama_model', 'granite3.2-vision:2b');
    if (currentModel) {
      const option = document.createElement('option');
      option.value = currentModel;
      option.textContent = currentModel;
      option.selected = true;
      modelSelect.appendChild(option);
    }
    statusText.innerHTML = '⚠️ Ollama is not running. Please start Ollama with: <code>ollama serve</code>';
    statusText.style.color = 'var(--warning, #fb923c)';

    // Show warning toast
    if (typeof toast !== 'undefined') {
      toast.warning('Ollama is not running. Please start Ollama first.', 4000);
    }
  } else {
    // Other error
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    statusText.textContent = result.message || 'Failed to load Ollama models';
    statusText.style.color = 'var(--error, #ef4444)';

    // Show error toast
    if (typeof toast !== 'undefined') {
      toast.modelsError(result.message || 'Unknown error');
    }
  }

  if (refreshBtn) refreshBtn.disabled = false;
}

// Test Ollama connection
async function testOllamaConnection(model) {
  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: model,
      prompt: 'Hello',
      stream: false
    }, { timeout: 10000 });

    return { success: true, message: 'Ollama connection successful' };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return { success: false, message: 'Ollama is not running. Please start Ollama first with: ollama serve' };
    } else if (error.response?.status === 404) {
      return { success: false, message: `Model "${model}" not found. Pull it with: ollama pull ${model}` };
    }
    return { success: false, message: `Ollama error: ${error.message}` };
  }
}

// Test Gemini connection
async function testGeminiConnection(model, apiKey) {
  if (!apiKey) {
    return { success: false, message: 'Gemini API key is required' };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: 'Hello' }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      timeout: 10000
    });

    return { success: true, message: 'Gemini connection successful' };
  } catch (error) {
    if (error.response?.status === 401) {
      return { success: false, message: 'Invalid Gemini API key' };
    } else if (error.response?.status === 404) {
      return { success: false, message: `Model "${model}" not available` };
    }
    return { success: false, message: `Gemini error: ${error.message}` };
  }
}

// Test connection based on selected provider
async function testConnection() {
  console.log('[Settings] 🔌 testConnection() called');
  const testBtn = elements.testConnectionBtn;
  if (!testBtn) {
    console.error('[Settings] ❌ Test Connection button element not found!');
    return;
  }

  const provider = elements.providerSelect.value;
  const ollamaModel = elements.ollamaModel?.value?.trim();
  const geminiModel = elements.geminiModel?.value;
  const geminiApiKey = elements.geminiApiKey?.value?.trim();

  console.log('[Settings] 🔍 Testing connection for provider:', provider);

  // Set loading state
  testBtn.classList.add('loading');
  testBtn.disabled = true;
  const btnText = testBtn.querySelector('span:not(.material-icons)');
  const originalText = btnText ? btnText.textContent : 'Test Connection';
  if (btnText) btnText.textContent = 'Testing...';

  try {
    let result;
    if (provider === 'ollama') {
      if (!ollamaModel) {
        result = { success: false, message: 'Please select an Ollama model first' };
      } else {
        result = await testOllamaConnection(ollamaModel);
      }
    } else if (provider === 'gemini') {
      if (!geminiApiKey) {
        result = { success: false, message: 'Please enter your Gemini API key first' };
      } else {
        result = await testGeminiConnection(geminiModel, geminiApiKey);
      }
    } else {
      result = { success: false, message: 'Unknown provider' };
    }

    // Show result with toast
    if (result.success) {
      if (typeof toast !== 'undefined') {
        toast.connectionSuccess(provider === 'ollama' ? 'Ollama' : 'Gemini');
      } else {
        showStatus(result.message, 'success');
      }
    } else {
      if (typeof toast !== 'undefined') {
        toast.connectionFailed(provider === 'ollama' ? 'Ollama' : 'Gemini', result.message);
      } else {
        showStatus(result.message, 'error');
      }
    }
  } catch (error) {
    console.error('[Settings] ❌ Connection test error:', error);
    if (typeof toast !== 'undefined') {
      toast.error(`Connection test failed: ${error.message}`);
    } else {
      showStatus(`Connection test failed: ${error.message}`, 'error');
    }
  } finally {
    testBtn.classList.remove('loading');
    testBtn.disabled = false;
    if (btnText) btnText.textContent = originalText;
  }
}

// Save settings
async function saveSettings() {
  console.log('[Settings] 💾 saveSettings() called');
  const saveBtn = elements.saveBtn;
  if (!saveBtn) {
    console.error('[Settings] ❌ Save button element not found!');
    return;
  }

  // Get form values
  const config = {
    provider: elements.providerSelect?.value || 'gemini',
    ollama_model: elements.ollamaModel?.value?.trim() || 'granite3.2-vision:2b',
    gemini_model: elements.geminiModel?.value || 'gemini-2.0-flash',
    theme: elements.themeSelect?.value || 'dark',
    advanced_mode: !!elements.advancedModeToggle?.checked
  };

  console.log('[Settings] 📝 Configuration to save:', config);

  // Save Gemini API key separately if provided
  const geminiApiKey = elements.geminiApiKey.value.trim();
  if (geminiApiKey) {
    store.set('gemini_api_key', geminiApiKey);
  }

  // Save configuration
  saveConfig(config);
  console.log('[Settings] ✅ Configuration saved to store');

  // Apply theme immediately
  applyTheme(config.theme);

  // Notify main window of config update (including glassy mode status)
  const themeConfig = {
    ...config,
    glassy_mode: store.get('glassy_mode', false)
  };
  ipcRenderer.send('config-updated', themeConfig);

  // Show success toast
  if (typeof toast !== 'undefined') {
    toast.settingsSaved();
  } else {
    showStatus('Settings saved successfully!', 'success');
  }

  // Close after a short delay
  setTimeout(() => {
    console.log('[Settings] 🚪 Closing settings window after save');
    try {
      if (window !== window.top) {
        window.parent.postMessage({ type: 'close-embedded-settings' }, '*');
      } else {
        window.close();
      }
    } catch (error) {
      console.error('[Settings] ❌ Error closing window:', error);
      window.close();
    }
  }, 1000);
}

// Cancel and close
function cancelSettings() {
  console.log('[Settings] 🚪 cancelSettings() called - closing window...');
  try {
    if (window !== window.top) {
      console.log('[Settings] 📤 Sending close message to parent window');
      window.parent.postMessage({ type: 'close-embedded-settings' }, '*');
    } else {
      console.log('[Settings] 🔒 Closing standalone window');
      window.close();
    }
  } catch (error) {
    console.error('[Settings] ❌ Error closing window:', error);
    window.close();
  }
}

// Get clipboard text safely via IPC and paste into API key field
async function pasteFromClipboard() {
  console.log('[Settings] 📋 pasteFromClipboard() called');
  try {
    const text = await ipcRenderer.invoke('get-clipboard-text');
    if (text && elements.geminiApiKey) {
      elements.geminiApiKey.value = String(text).trim();
      elements.geminiApiKey.focus();

      // Show success toast
      if (typeof toast !== 'undefined') {
        toast.apiKeyPasted();
      } else {
        showStatus('API key pasted from clipboard', 'success', 2000);
      }
    } else {
      // Show warning toast
      if (typeof toast !== 'undefined') {
        toast.clipboardEmpty();
      } else {
        showStatus('No text found in clipboard', 'warning', 2000);
      }
    }
  } catch (error) {
    console.error('[Settings] ❌ Paste error:', error);
    // Show error toast
    if (typeof toast !== 'undefined') {
      toast.clipboardError();
    } else {
      showStatus('Failed to paste from clipboard', 'error', 2000);
    }
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const keyInput = elements.geminiApiKey;
  const toggleBtn = elements.toggleKeyVisibility;
  const icon = toggleBtn.querySelector('.material-icons');

  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    if (icon) icon.textContent = 'visibility_off';
    toggleBtn.title = 'Hide API key';
  } else {
    keyInput.type = 'password';
    if (icon) icon.textContent = 'visibility';
    toggleBtn.title = 'Show API key';
  }
}

// Update form fields based on current provider
function updateProviderFields() {
  const provider = elements.providerSelect.value;

  // You could show/hide relevant fields here
  // For now, we show all fields
}

// Load form with current settings
async function loadForm() {
  const config = loadConfig();

  // Set form values
  if (elements.providerSelect) elements.providerSelect.value = config.provider;
  if (elements.geminiModel) elements.geminiModel.value = config.gemini_model;
  
  // Load Ollama models (will set the saved value after loading)
  await updateOllamaModelList();
  
  // Handle theme - check if glassy mode is enabled
  const glassyMode = store.get('glassy_mode', false);
  if (glassyMode) {
    elements.themeSelect.value = 'glass';
  } else {
    elements.themeSelect.value = config.theme;
  }
  
  if (elements.advancedModeToggle) elements.advancedModeToggle.checked = !!config.advanced_mode;

  // Load Gemini API key
  const geminiApiKey = store.get('gemini_api_key') || '';
  elements.geminiApiKey.value = geminiApiKey;
  
  // Load update token status (stored securely via IPC)
  try {
    const hasToken = await ipcRenderer.invoke('has-update-token');
    if (elements.updateToken) {
      elements.updateToken.placeholder = hasToken ? 'Token configured (hidden for security)' : 'GitHub token for private repository access';
    }
  } catch (e) {
    console.warn('Failed to check update token status:', e);
    if (elements.updateToken) {
      elements.updateToken.placeholder = 'GitHub token for private repository access';
    }
  }

  // Apply current theme
  applyTheme(config.theme);

  // Update provider-specific fields
  updateProviderFields();
}

// Initialize settings window
async function initializeSettings() {
  console.log('[Settings] 🚀 Initializing settings window...');

  // Get DOM elements
  elements = {
    providerSelect: document.getElementById('provider-select'),
    ollamaModel: document.getElementById('ollama-model'),
    geminiModel: document.getElementById('gemini-model'),
    geminiApiKey: document.getElementById('gemini-api-key'),
    themeSelect: document.getElementById('theme-select'),
    advancedModeToggle: document.getElementById('advanced-mode-toggle'),
    cancelBtn: document.getElementById('cancel-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    saveBtn: document.getElementById('save-btn'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    pasteKeyBtn: document.getElementById('paste-key-btn'),
    statusMessage: document.getElementById('status-message'),
    // User card elements
    userAvatar: document.getElementById('settings-user-avatar'),
    userAvatarIcon: document.getElementById('settings-user-avatar-icon'),
    userName: document.getElementById('settings-user-name'),
    userEmail: document.getElementById('settings-user-email'),
    signInBtn: document.getElementById('settings-signin-btn'),
    signOutBtn: document.getElementById('settings-signout-btn')
  };

  // Debug: Log which elements were found
  console.log('[Settings] 📋 Button elements found:', {
    cancelBtn: !!elements.cancelBtn,
    testConnectionBtn: !!elements.testConnectionBtn,
    saveBtn: !!elements.saveBtn,
    toggleKeyVisibility: !!elements.toggleKeyVisibility,
    pasteKeyBtn: !!elements.pasteKeyBtn,
    signInBtn: !!elements.signInBtn,
    signOutBtn: !!elements.signOutBtn
  });

  // Updates card elements
  elements.currentVersion = document.getElementById('current-version');
  elements.latestVersionText = document.getElementById('latest-version-text');
  elements.updateToken = document.getElementById('update-token');
  elements.checkUpdateBtn = document.getElementById('check-update-btn');
  elements.updateProgress = document.getElementById('update-progress');

  // Enable paste on all text inputs for better UX
  const enablePasteOnInput = (inputElement) => {
    if (!inputElement) return;
    
    // Enable paste operations
    inputElement.addEventListener('paste', (e) => {
      // Allow default paste behavior
      setTimeout(() => {
        // Trim whitespace from pasted content
        inputElement.value = inputElement.value.trim();
      }, 10);
    });

    // Add keyboard shortcut for paste
    inputElement.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Allow native paste
        e.stopPropagation();
      }
    });

    // Add right-click context menu support
    inputElement.addEventListener('contextmenu', (e) => {
      // Allow native context menu with paste option
      e.stopPropagation();
    });
  };

  // Enable paste on all input fields
  enablePasteOnInput(elements.geminiApiKey);
  enablePasteOnInput(elements.ollamaModel);
  enablePasteOnInput(elements.updateToken);

  // Add focus styling to API key field
  if (elements.geminiApiKey) {
    elements.geminiApiKey.addEventListener('focus', () => {
      elements.geminiApiKey.style.borderColor = 'var(--accent)';
    });

    elements.geminiApiKey.addEventListener('blur', () => {
      elements.geminiApiKey.style.borderColor = 'var(--input-border)';
    });
  }

  // Set up event listeners with debug logging
  console.log('[Settings] 🔗 Setting up event listeners...');

  if (elements.cancelBtn) {
    console.log('[Settings] ✅ Attaching click handler to Cancel button');
    elements.cancelBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Cancel button clicked!');
      cancelSettings();
    });
  } else {
    console.error('[Settings] ❌ Cancel button not found!');
  }

  if (elements.testConnectionBtn) {
    console.log('[Settings] ✅ Attaching click handler to Test Connection button');
    elements.testConnectionBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Test Connection button clicked!');
      testConnection();
    });
  } else {
    console.error('[Settings] ❌ Test Connection button not found!');
  }

  if (elements.saveBtn) {
    console.log('[Settings] ✅ Attaching click handler to Save button');
    elements.saveBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Save button clicked!');
      saveSettings();
    });
  } else {
    console.error('[Settings] ❌ Save button not found!');
  }

  if (elements.toggleKeyVisibility) {
    console.log('[Settings] ✅ Attaching click handler to Toggle Visibility button');
    elements.toggleKeyVisibility.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Toggle Visibility button clicked!');
      toggleApiKeyVisibility();
    });
  } else {
    console.error('[Settings] ❌ Toggle Visibility button not found!');
  }

  if (elements.pasteKeyBtn) {
    console.log('[Settings] ✅ Attaching click handler to Paste Key button');
    elements.pasteKeyBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Paste Key button clicked!');
      pasteFromClipboard();
    });
  } else {
    console.error('[Settings] ❌ Paste Key button not found!');
  }

  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', updateProviderFields);
  }

  // Refresh Ollama models button
  const refreshOllamaBtn = document.getElementById('refresh-ollama-models');
  if (refreshOllamaBtn) {
    console.log('[Settings] ✅ Attaching click handler to Refresh Ollama Models button');
    refreshOllamaBtn.addEventListener('click', async () => {
      console.log('[Settings] 🖱️ Refresh Ollama Models button clicked!');

      // Show refreshing toast
      if (typeof toast !== 'undefined') {
        toast.refreshingModels();
      } else {
        showStatus('Refreshing Ollama models...', 'info', 1500);
      }

      await updateOllamaModelList();
    });
  } else {
    console.error('[Settings] ❌ Refresh Ollama Models button not found!');
  }

  // Theme change preview
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  // Advanced mode info tip when toggled
  if (elements.advancedModeToggle) {
    elements.advancedModeToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (typeof toast !== 'undefined') {
          toast.advancedModeEnabled();
        } else {
          showStatus('Advanced Hint Mode enabled: screenshots will be sent directly to the AI (vision).', 'success', 2500);
        }
      } else {
        if (typeof toast !== 'undefined') {
          toast.advancedModeDisabled();
        } else {
          showStatus('Advanced Hint Mode disabled: using OCR → text prompts.', 'info', 2000);
        }
      }
    });
  }

  // Sign in/out
  if (elements.signInBtn) {
    console.log('[Settings] ✅ Attaching click handler to Sign In button');
    elements.signInBtn.addEventListener('click', async () => {
      console.log('[Settings] 🖱️ Sign In button clicked!');
      try {
        await ipcRenderer.invoke('open-browser-auth');

        // Show toast
        if (typeof toast !== 'undefined') {
          toast.signingIn();
        } else {
          showStatus('Opening sign-in in browser...', 'info', 2000);
        }
      } catch (error) {
        console.error('[Settings] ❌ Sign in error:', error);

        // Show error toast
        if (typeof toast !== 'undefined') {
          toast.authError('Failed to open sign-in');
        } else {
          showStatus('Failed to open sign-in', 'error', 2000);
        }
      }
    });
  } else {
    console.error('[Settings] ❌ Sign In button not found!');
  }

  if (elements.signOutBtn) {
    console.log('[Settings] ✅ Attaching click handler to Sign Out button');
    elements.signOutBtn.addEventListener('click', async () => {
      console.log('[Settings] 🖱️ Sign Out button clicked!');
      try {
        ipcRenderer.send('user-logged-out');

        // Show toast
        if (typeof toast !== 'undefined') {
          toast.signedOut();
        } else {
          showStatus('Signed out', 'success', 1500);
        }

        setTimeout(refreshUserCard, 800);
      } catch (error) {
        console.error('[Settings] ❌ Sign out error:', error);

        // Show error toast
        if (typeof toast !== 'undefined') {
          toast.authError('Failed to sign out');
        } else {
          showStatus('Failed to sign out', 'error', 2000);
        }
      }
    });
  } else {
    console.error('[Settings] ❌ Sign Out button not found!');
  }

  // Load user card
  refreshUserCard();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelSettings();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && document.activeElement === elements.geminiApiKey) {
      // Allow paste in API key field
      e.stopPropagation();
    }
  });

  // Load current settings into form
  await loadForm();

  // Initialize Updates card
  initializeUpdatesSection();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeSettings();
  } catch (e) {
    console.error('Failed to initialize settings:', e);
  }
});

// Handle window close
window.addEventListener('beforeunload', () => {
  // Clean up if needed
});

// -----------------
// Updates Section
// -----------------
function setUpdateBtnState({ text, disabled = false, primary = false }) {
  if (!elements.checkUpdateBtn) return;

  // Update only the text span, not the icon
  const btnText = elements.checkUpdateBtn.querySelector('span:not(.material-icons)');
  if (btnText) {
    btnText.textContent = text;
  } else {
    // Fallback if no text span exists
    elements.checkUpdateBtn.textContent = text;
  }

  elements.checkUpdateBtn.disabled = disabled;
  elements.checkUpdateBtn.classList.toggle('btn-primary', primary);
  elements.checkUpdateBtn.classList.toggle('btn-secondary', !primary);
}

function initializeUpdatesSection() {
  console.log('[Settings] 🔄 Initializing updates section...');

  let version = '';
  try {
    const pkg = require('../../package.json');
    version = pkg?.version || '';
  } catch {}
  if (elements.currentVersion) {
    elements.currentVersion.textContent = version || 'Unknown';
  }

  // Get update notification elements
  const updateNotification = document.getElementById('update-notification');
  const updateNewVersion = document.getElementById('update-new-version');
  const updateReleaseNotes = document.getElementById('update-release-notes');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateLaterBtn = document.getElementById('update-later-btn');

  // Event wiring for Check for Updates button
  if (elements.checkUpdateBtn) {
    console.log('[Settings] ✅ Attaching click handler to Check for Updates button');
    elements.checkUpdateBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Check for Updates button clicked!');
      onCheckOrUpdateClick();
    });
  } else {
    console.error('[Settings] ❌ Check for Updates button not found!');
  }

  // Wire up update notification banner buttons
  if (updateNowBtn) {
    updateNowBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Update Now button clicked!');
      // Hide notification
      if (updateNotification) updateNotification.classList.add('hidden');
      // Trigger download
      onCheckOrUpdateClick();
    });
  }

  if (updateLaterBtn) {
    updateLaterBtn.addEventListener('click', () => {
      console.log('[Settings] 🖱️ Update Later button clicked!');
      // Hide notification
      if (updateNotification) updateNotification.classList.add('hidden');
      // Dismiss for 24 hours
      ipcRenderer.send('dismiss-update', 24 * 60 * 60 * 1000);

      // Show toast
      if (typeof toast !== 'undefined') {
        toast.info('Update reminder dismissed for 24 hours', 3000);
      }
    });
  }

  // Listen for updater events to reflect progress
  ipcRenderer.on('update-status', (_e, payload) => {
    console.log('[Settings] 📡 Update status:', payload);
    if (payload?.status === 'checking') {
      setUpdateBtnState({ text: 'Checking…', disabled: true });

      // Show toast
      if (typeof toast !== 'undefined') {
        toast.checkingUpdates();
      }
    }
  });

  ipcRenderer.on('update-available', (_e, info) => {
    console.log('[Settings] 📡 Update available:', info);

    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `Update available: v${info?.version}`;
      elements.latestVersionText.classList.remove('hidden');
    }

    setUpdateBtnState({ text: `Update Now`, disabled: false, primary: true });
    elements.checkUpdateBtn.dataset.state = 'ready-to-download';

    // Show update notification banner
    if (updateNotification && updateNewVersion) {
      updateNewVersion.textContent = info?.version || 'Unknown';

      // Show release notes if available
      if (updateReleaseNotes && info?.releaseNotes) {
        const notes = typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : info.releaseNotes[0]?.note || '';
        updateReleaseNotes.textContent = notes.substring(0, 200) + (notes.length > 200 ? '...' : '');
      }

      updateNotification.classList.remove('hidden');
    }

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.updateAvailable(info?.version || 'Unknown');
    }
  });

  ipcRenderer.on('update-not-available', (_e, info) => {
    console.log('[Settings] 📡 Update not available:', info);

    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `You are on the latest version${info?.currentVersion ? ` (v${info.currentVersion})` : ''}`;
      elements.latestVersionText.classList.remove('hidden');
    }

    setUpdateBtnState({ text: 'Check for Updates', disabled: false, primary: false });
    elements.checkUpdateBtn.dataset.state = 'check';

    // Hide update notification banner
    if (updateNotification) {
      updateNotification.classList.add('hidden');
    }

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.updateNotAvailable();
    }
  });

  ipcRenderer.on('update-download-progress', (_e, progress) => {
    console.log('[Settings] 📡 Download progress:', progress);

    if (elements.updateProgress) {
      elements.updateProgress.classList.remove('hidden');
      const pct = Math.max(0, Math.min(100, Math.round(progress?.percent || 0)));
      elements.updateProgress.innerHTML = `<small>Downloading… ${pct}%</small>`;
    }

    setUpdateBtnState({ text: 'Downloading…', disabled: true, primary: true });

    // Update toast with progress (remove old toast and show new one)
    if (typeof toast !== 'undefined' && progress?.percent) {
      toast.updateDownloading(Math.round(progress.percent));
    }
  });

  ipcRenderer.on('update-downloaded', (_e, info) => {
    console.log('[Settings] 📡 Update downloaded:', info);

    if (elements.updateProgress) {
      elements.updateProgress.innerHTML = `<small>Update downloaded (v${info?.version}). Installing…</small>`;
    }

    setUpdateBtnState({ text: 'Installing…', disabled: true, primary: true });

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.updateDownloaded();
    }
  });

  ipcRenderer.on('update-error', (_e, err) => {
    console.error('[Settings] 📡 Update error:', err);

    const errorMsg = err?.message || String(err);
    let displayMsg = errorMsg;

    // Provide helpful context for common errors
    if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
      displayMsg = 'Update not found. Please check the repository releases.';
    } else if (errorMsg.includes('network') || errorMsg.includes('ENOTFOUND')) {
      displayMsg = 'Network error. Please check your internet connection.';
    } else if (errorMsg.includes('ECONNREFUSED')) {
      displayMsg = 'Connection refused. Please try again later.';
    }

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.updateError(displayMsg);
    } else {
      showStatus(`Update error: ${displayMsg}`, 'error', 6000);
    }

    setUpdateBtnState({ text: 'Check for Updates', disabled: false, primary: false });
    if (elements.updateProgress) elements.updateProgress.classList.add('hidden');
    elements.checkUpdateBtn.dataset.state = 'check';

    // Hide update notification banner
    if (updateNotification) {
      updateNotification.classList.add('hidden');
    }
  });
}

async function onCheckOrUpdateClick() {
  console.log('[Settings] 🔄 onCheckOrUpdateClick() called');

  const state = elements.checkUpdateBtn.dataset.state || 'check';

  if (state === 'ready-to-download') {
    console.log('[Settings] 📥 Starting update download...');

    // Start download
    setUpdateBtnState({ text: 'Preparing…', disabled: true, primary: true });
    if (elements.updateProgress) {
      elements.updateProgress.classList.remove('hidden');
      elements.updateProgress.innerHTML = `<small>Preparing update…</small>`;
    }

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.info('Preparing to download update...', 2000, 'cloud_download');
    }

    ipcRenderer.send('download-update');
    return;
  }

  // Otherwise, perform a check
  console.log('[Settings] 🔍 Checking for updates...');

  setUpdateBtnState({ text: 'Checking…', disabled: true });
  if (elements.latestVersionText) {
    elements.latestVersionText.classList.add('hidden');
  }

  // Show toast
  if (typeof toast !== 'undefined') {
    toast.checkingUpdates();
  }

  try {
    const res = await ipcRenderer.invoke('check-for-updates');
    console.log('[Settings] 📡 Update check result:', res);

    if (res?.unsupported) {
      if (typeof toast !== 'undefined') {
        toast.warning('Auto-update is not supported in this build', 3500);
      } else {
        showStatus('Auto-update is not supported in this build.', 'info', 3500);
      }
      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      return;
    }

    if (res?.success && res.available) {
      console.log('[Settings] ✅ Update available:', res.latestVersion);

      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `Update available: v${res.latestVersion} (current v${res.currentVersion})`;
        elements.latestVersionText.classList.remove('hidden');
      }

      setUpdateBtnState({ text: 'Update Now', disabled: false, primary: true });
      elements.checkUpdateBtn.dataset.state = 'ready-to-download';

      // Show toast
      if (typeof toast !== 'undefined') {
        toast.updateAvailable(res.latestVersion);
      }
    } else if (res?.success) {
      console.log('[Settings] ✅ Already on latest version:', res.currentVersion);

      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `You are on the latest version (v${res.currentVersion})`;
        elements.latestVersionText.classList.remove('hidden');
      }

      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      elements.checkUpdateBtn.dataset.state = 'check';

      // Show toast
      if (typeof toast !== 'undefined') {
        toast.updateNotAvailable();
      }
    } else {
      console.error('[Settings] ❌ Update check failed:', res);

      // Show detailed error message
      const errorMsg = res?.error || 'Unknown error';

      // Show toast
      if (typeof toast !== 'undefined') {
        toast.updateError(errorMsg);
      } else {
        showStatus(`Update check failed: ${errorMsg}`, 'error', 6000);
      }

      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      elements.checkUpdateBtn.dataset.state = 'check';

      // Show raw error in console for debugging
      if (res?.rawError) {
        console.error('Raw update error:', res.rawError);
      }
    }
  } catch (e) {
    console.error('[Settings] ❌ Update check exception:', e);

    const errorMsg = e?.message || String(e);

    // Show toast
    if (typeof toast !== 'undefined') {
      toast.updateError(errorMsg);
    } else {
      showStatus(`Update check failed: ${errorMsg}`, 'error', 6000);
    }

    setUpdateBtnState({ text: 'Check for Updates', disabled: false });
    elements.checkUpdateBtn.dataset.state = 'check';
  }
}
