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
    const isGuest = store.get('guest_mode_enabled', false);
    if (elements.userName) elements.userName.textContent = isAuthed ? (status.user.name || status.user.firstName || status.user.email || 'User') : 'Guest User';
    if (elements.userEmail) elements.userEmail.textContent = isAuthed ? (status.user.email || '') : (isGuest ? 'Guest Mode' : 'Using app without account');
    if (elements.userAvatar) {
      const avatarUrl = status?.user?.avatar || status?.user?.imageUrl || status?.user?.image_url || '';
      if (isAuthed && avatarUrl) {
        elements.userAvatar.src = avatarUrl;
      } else {
        // Show a pleasant default avatar for guest users
        elements.userAvatar.src = '../../assets/logo_m.png';
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
    theme: elements.themeSelect.value,
    advanced_mode: !!elements.advancedModeToggle?.checked
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

  // Close after a short delay
  setTimeout(() => {
    try {
      if (window !== window.top) {
        window.parent.postMessage({ type: 'close-embedded-settings' }, '*');
      } else {
        window.close();
      }
    } catch {
      window.close();
    }
  }, 1000);
}

// Cancel and close
function cancelSettings() {
  try {
    if (window !== window.top) {
      window.parent.postMessage({ type: 'close-embedded-settings' }, '*');
    } else {
      window.close();
    }
  } catch {
    window.close();
  }
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
  if (elements.advancedModeToggle) elements.advancedModeToggle.checked = !!config.advanced_mode;

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
  advancedModeToggle: document.getElementById('advanced-mode-toggle'),
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

  // Updates card elements
  elements.currentVersion = document.getElementById('current-version');
  elements.latestVersionText = document.getElementById('latest-version-text');
  elements.checkUpdateBtn = document.getElementById('check-update-btn');
  elements.updateProgress = document.getElementById('update-progress');

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

  // Advanced mode info tip when toggled
  if (elements.advancedModeToggle) {
    elements.advancedModeToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        showStatus('Advanced Hint Mode enabled: screenshots will be sent directly to the AI (vision).', 'success', 2500);
      } else {
        showStatus('Advanced Hint Mode disabled: using OCR → text prompts.', 'info', 2000);
      }
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

  // Initialize Updates card
  initializeUpdatesSection();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSettings);

// Handle window close
window.addEventListener('beforeunload', () => {
  // Clean up if needed
});

// -----------------
// Updates Section
// -----------------
function setUpdateBtnState({ text, disabled = false, primary = false }) {
  if (!elements.checkUpdateBtn) return;
  elements.checkUpdateBtn.textContent = text;
  elements.checkUpdateBtn.disabled = disabled;
  elements.checkUpdateBtn.classList.toggle('btn-primary', primary);
  elements.checkUpdateBtn.classList.toggle('btn-secondary', !primary);
}

function initializeUpdatesSection() {
  let version = '';
  try {
    const pkg = require('../../package.json');
    version = pkg?.version || '';
  } catch {}
  if (elements.currentVersion) {
    elements.currentVersion.textContent = version || 'Unknown';
  }

  // Event wiring
  if (elements.checkUpdateBtn) {
    elements.checkUpdateBtn.addEventListener('click', onCheckOrUpdateClick);
  }

  // Listen for updater events to reflect progress
  ipcRenderer.on('update-status', (_e, payload) => {
    if (payload?.status === 'checking') {
      setUpdateBtnState({ text: 'Checking…', disabled: true });
    }
  });

  ipcRenderer.on('update-available', (_e, info) => {
    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `Update available: v${info?.version}`;
      elements.latestVersionText.classList.remove('hidden');
    }
    setUpdateBtnState({ text: `Update Now`, disabled: false, primary: true });
    elements.checkUpdateBtn.dataset.state = 'ready-to-download';
  });

  ipcRenderer.on('update-not-available', (_e, info) => {
    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `You are on the latest version${info?.currentVersion ? ` (v${info.currentVersion})` : ''}`;
      elements.latestVersionText.classList.remove('hidden');
    }
    setUpdateBtnState({ text: 'Check for Updates', disabled: false, primary: false });
    elements.checkUpdateBtn.dataset.state = 'check';
  });

  ipcRenderer.on('update-download-progress', (_e, progress) => {
    if (elements.updateProgress) {
      elements.updateProgress.classList.remove('hidden');
      const pct = Math.max(0, Math.min(100, Math.round(progress?.percent || 0)));
      elements.updateProgress.innerHTML = `<small>Downloading… ${pct}%</small>`;
    }
    setUpdateBtnState({ text: 'Downloading…', disabled: true, primary: true });
  });

  ipcRenderer.on('update-downloaded', (_e, info) => {
    if (elements.updateProgress) {
      elements.updateProgress.innerHTML = `<small>Update downloaded (v${info?.version}). Installing…</small>`;
    }
    setUpdateBtnState({ text: 'Installing…', disabled: true, primary: true });
  });

  ipcRenderer.on('update-error', (_e, err) => {
    showStatus(`Update error: ${err?.message || err}`, 'error', 4000);
    setUpdateBtnState({ text: 'Check for Updates', disabled: false, primary: false });
    if (elements.updateProgress) elements.updateProgress.classList.add('hidden');
    elements.checkUpdateBtn.dataset.state = 'check';
  });
}

async function onCheckOrUpdateClick() {
  const state = elements.checkUpdateBtn.dataset.state || 'check';
  if (state === 'ready-to-download') {
    // Start download
    setUpdateBtnState({ text: 'Preparing…', disabled: true, primary: true });
    if (elements.updateProgress) {
      elements.updateProgress.classList.remove('hidden');
      elements.updateProgress.innerHTML = `<small>Preparing update…</small>`;
    }
    ipcRenderer.send('download-update');
    return;
  }

  // Otherwise, perform a check
  setUpdateBtnState({ text: 'Checking…', disabled: true });
  if (elements.latestVersionText) {
    elements.latestVersionText.classList.add('hidden');
  }
  try {
    const res = await ipcRenderer.invoke('check-for-updates');
    if (res?.unsupported) {
      showStatus('Auto-update is not supported in this build.', 'info', 3500);
      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      return;
    }
    if (res?.success && res.available) {
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `Update available: v${res.latestVersion} (current v${res.currentVersion})`;
        elements.latestVersionText.classList.remove('hidden');
      }
      setUpdateBtnState({ text: 'Update Now', disabled: false, primary: true });
      elements.checkUpdateBtn.dataset.state = 'ready-to-download';
    } else if (res?.success) {
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `You are on the latest version (v${res.currentVersion})`;
        elements.latestVersionText.classList.remove('hidden');
      }
      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      elements.checkUpdateBtn.dataset.state = 'check';
    } else {
      showStatus(`Failed to check for updates: ${res?.error || 'Unknown error'}`, 'error', 4000);
      setUpdateBtnState({ text: 'Check for Updates', disabled: false });
      elements.checkUpdateBtn.dataset.state = 'check';
    }
  } catch (e) {
    showStatus(`Failed to check for updates: ${e?.message || e}`, 'error', 4000);
    setUpdateBtnState({ text: 'Check for Updates', disabled: false });
    elements.checkUpdateBtn.dataset.state = 'check';
  }
}
