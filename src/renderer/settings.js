const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const axios = require('axios');

// Initialize store
const store = new Store();

// Default configuration
const defaultConfig = {
  provider: 'ollama',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark'
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
  document.body.className = `theme-${theme || 'dark'}`;
}

// Show status message
function showStatus(message, type = 'info', duration = 3000) {
  const statusEl = elements.statusMessage;
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `status-message ${type} fade-in`;
  statusEl.classList.remove('hidden');

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, duration);
}

// User card helpers
async function refreshUserCard() {
  try {
    const status = await ipcRenderer.invoke('get-auth-status');
    const isAuthed = !!(status && status.success && status.authenticated && status.user);
    if (elements.userName) elements.userName.textContent = isAuthed ? (status.user.name || status.user.firstName || status.user.email || 'User') : 'Guest User';
    if (elements.userEmail) elements.userEmail.textContent = isAuthed ? (status.user.email || '') : 'Using app without account';
    if (elements.userAvatar) {
      const avatarUrl = status?.user?.avatar || status?.user?.imageUrl || status?.user?.image_url || '';
      if (avatarUrl) elements.userAvatar.src = avatarUrl; else elements.userAvatar.removeAttribute('src');
    }
    if (elements.signInBtn && elements.signOutBtn) {
      elements.signInBtn.classList.toggle('hidden', isAuthed);
      elements.signOutBtn.classList.toggle('hidden', !isAuthed);
    }
  } catch (e) {
    // Silent fail; keep defaults
  }
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
      return { success: false, message: 'Ollama is not running. Please start Ollama first.' };
    } else if (error.response?.status === 404) {
      return { success: false, message: `Model "${model}" not found. Please pull it first: ollama pull ${model}` };
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
  const testBtn = elements.testConnectionBtn;
  if (!testBtn) return;

  const provider = elements.providerSelect.value;
  const ollamaModel = elements.ollamaModel.value.trim() || 'granite3.2-vision:2b';
  const geminiModel = elements.geminiModel.value;
  const geminiApiKey = elements.geminiApiKey.value.trim();

  // Set loading state
  testBtn.classList.add('loading');
  testBtn.disabled = true;

  try {
    let result;
    if (provider === 'ollama') {
      result = await testOllamaConnection(ollamaModel);
    } else if (provider === 'gemini') {
      result = await testGeminiConnection(geminiModel, geminiApiKey);
    } else {
      result = { success: false, message: 'Unknown provider' };
    }

    showStatus(result.message, result.success ? 'success' : 'error');
  } catch (error) {
    showStatus(`Connection test failed: ${error.message}`, 'error');
  } finally {
    testBtn.classList.remove('loading');
    testBtn.disabled = false;
  }
}

// Save settings
function saveSettings() {
  const saveBtn = elements.saveBtn;
  if (!saveBtn) return;

  // Get form values
  const config = {
    provider: elements.providerSelect.value,
    ollama_model: elements.ollamaModel.value.trim() || 'granite3.2-vision:2b',
    gemini_model: elements.geminiModel.value,
    theme: elements.themeSelect.value
  };

  // Save Gemini API key separately if provided
  const geminiApiKey = elements.geminiApiKey.value.trim();
  if (geminiApiKey) {
    store.set('gemini_api_key', geminiApiKey);
  }

  // Save configuration
  saveConfig(config);

  // Apply theme immediately
  applyTheme(config.theme);

  // Notify main window of config update
  ipcRenderer.send('config-updated', config);

  showStatus('Settings saved successfully!', 'success');

  // Close window after a short delay
  setTimeout(() => {
    window.close();
  }, 1000);
}

// Cancel and close
function cancelSettings() {
  window.close();
}

// Get clipboard text and paste into API key field
async function pasteFromClipboard() {
  try {
    const { clipboard } = require('electron');
    const text = clipboard.readText();
    if (text && elements.geminiApiKey) {
      elements.geminiApiKey.value = text.trim();
      elements.geminiApiKey.focus();
      showStatus('API key pasted from clipboard', 'success', 2000);
    } else {
      showStatus('No text found in clipboard', 'error', 2000);
    }
  } catch (error) {
    showStatus('Failed to paste from clipboard', 'error', 2000);
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const keyInput = elements.geminiApiKey;
  const toggleBtn = elements.toggleKeyVisibility;

  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    toggleBtn.textContent = '🙈';
    toggleBtn.title = 'Hide API key';
  } else {
    keyInput.type = 'password';
    toggleBtn.textContent = '👁';
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
function loadForm() {
  const config = loadConfig();

  // Set form values
  elements.providerSelect.value = config.provider;
  elements.ollamaModel.value = config.ollama_model;
  elements.geminiModel.value = config.gemini_model;
  elements.themeSelect.value = config.theme;

  // Load Gemini API key
  const geminiApiKey = store.get('gemini_api_key') || '';
  elements.geminiApiKey.value = geminiApiKey;

  // Apply current theme
  applyTheme(config.theme);

  // Update provider-specific fields
  updateProviderFields();
}

// Initialize settings window
function initializeSettings() {
  // Get DOM elements
  elements = {
    providerSelect: document.getElementById('provider-select'),
    ollamaModel: document.getElementById('ollama-model'),
    geminiModel: document.getElementById('gemini-model'),
    geminiApiKey: document.getElementById('gemini-api-key'),
    themeSelect: document.getElementById('theme-select'),
    cancelBtn: document.getElementById('cancel-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    saveBtn: document.getElementById('save-btn'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    pasteKeyBtn: document.getElementById('paste-key-btn'),
    statusMessage: document.getElementById('status-message'),
    // User card elements
    userAvatar: document.getElementById('settings-user-avatar'),
    userName: document.getElementById('settings-user-name'),
    userEmail: document.getElementById('settings-user-email'),
    signInBtn: document.getElementById('settings-signin-btn'),
    signOutBtn: document.getElementById('settings-signout-btn')
  };

  // Ensure API key input can receive paste events
  if (elements.geminiApiKey) {
    // Enable paste operations
    elements.geminiApiKey.addEventListener('paste', (e) => {
      // Allow default paste behavior
      setTimeout(() => {
        // Trim whitespace from pasted content
        elements.geminiApiKey.value = elements.geminiApiKey.value.trim();
      }, 10);
    });

    // Add keyboard shortcut for paste
    elements.geminiApiKey.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Allow native paste
        e.stopPropagation();
      }
    });

    // Add right-click context menu support
    elements.geminiApiKey.addEventListener('contextmenu', (e) => {
      // Allow native context menu with paste option
      e.stopPropagation();
    });

    // Add focus styling
    elements.geminiApiKey.addEventListener('focus', () => {
      elements.geminiApiKey.style.borderColor = 'var(--accent)';
    });

    elements.geminiApiKey.addEventListener('blur', () => {
      elements.geminiApiKey.style.borderColor = 'var(--input-border)';
    });
  }

  // Set up event listeners
  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener('click', cancelSettings);
  }

  if (elements.testConnectionBtn) {
    elements.testConnectionBtn.addEventListener('click', testConnection);
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveSettings);
  }

  if (elements.toggleKeyVisibility) {
    elements.toggleKeyVisibility.addEventListener('click', toggleApiKeyVisibility);
  }

  if (elements.pasteKeyBtn) {
    elements.pasteKeyBtn.addEventListener('click', pasteFromClipboard);
  }

  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', updateProviderFields);
  }

  // Theme change preview
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  // Sign in/out
  if (elements.signInBtn) {
    elements.signInBtn.addEventListener('click', async () => {
      try {
        await ipcRenderer.invoke('open-browser-auth');
        showStatus('Opening sign-in in browser...', 'info', 2000);
      } catch {}
    });
  }
  if (elements.signOutBtn) {
    elements.signOutBtn.addEventListener('click', async () => {
      ipcRenderer.send('user-logged-out');
      showStatus('Signed out', 'success', 1500);
      setTimeout(refreshUserCard, 800);
    });
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
  loadForm();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSettings);

// Handle window close
window.addEventListener('beforeunload', () => {
  // Clean up if needed
});
