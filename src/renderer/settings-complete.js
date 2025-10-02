const { ipcRenderer } = require("electron");
const Store = require("electron-store");
const axios = require("axios");

// Initialize store
const store = new Store();

// Default configuration
const defaultConfig = {
  provider: "gemini",
  ollama_model: "granite3.2-vision:2b",
  gemini_model: "gemini-2.0-flash",
  theme: "dark",
  advanced_mode: true,
};

// DOM elements cache
let elements = {};

// State management
let isProcessing = false;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function loadConfig() {
  const config = { ...defaultConfig };
  Object.keys(defaultConfig).forEach((key) => {
    const stored = store.get(key);
    if (stored !== undefined) {
      config[key] = stored;
    }
  });
  return config;
}

function saveConfig(config) {
  Object.keys(config).forEach((key) => {
    store.set(key, config[key]);
  });
}

function applyTheme(theme) {
  document.body.className = "";
  document.documentElement.className = "";

  if (theme === "glass") {
    document.body.classList.add("theme-dark", "glassy-mode");
    document.documentElement.classList.add("theme-glassy");
    store.set("glassy_mode", true);
  } else {
    document.body.classList.add(`theme-${theme || "dark"}`);
    store.set("glassy_mode", false);
  }
}

function showStatus(message, type = "info", duration = 3000) {
  const statusEl = elements.statusMessage;
  if (!statusEl) {
    console.log(`[Status] ${type}: ${message}`);
    return;
  }

  statusEl.textContent = message;
  statusEl.className = `status-message ${type} fade-in`;
  statusEl.classList.remove("hidden");

  setTimeout(() => {
    statusEl.classList.add("hidden");
  }, duration);
}

function setButtonLoading(button, loading, originalText = null) {
  if (!button) return originalText;

  if (loading) {
    const text = button.textContent;
    button.disabled = true;
    button.classList.add("loading");
    button.dataset.originalText = text;
    button.textContent = "Processing...";
    return text;
  } else {
    button.disabled = false;
    button.classList.remove("loading");
    if (originalText) {
      button.textContent = originalText;
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    return null;
  }
}

// ============================================================================
// BUTTON 1: CANCEL BUTTON - Close settings without saving
// ============================================================================

async function handleCancelButton() {
  console.log("Cancel button clicked - closing settings");

  try {
    // Check if there are unsaved changes
    const currentConfig = loadConfig();
    const hasChanges = checkForUnsavedChanges(currentConfig);

    if (hasChanges) {
      const confirm = window.confirm(
        "You have unsaved changes. Are you sure you want to close?"
      );
      if (!confirm) {
        console.log("User cancelled the close action");
        return;
      }
    }

    // Close the window
    closeSettings();
  } catch (error) {
    console.error("Error in cancel button:", error);
    closeSettings(); // Close anyway
  }
}

function checkForUnsavedChanges(savedConfig) {
  try {
    if (!elements.providerSelect) return false;

    const currentValues = {
      provider: elements.providerSelect?.value,
      ollama_model: elements.ollamaModel?.value,
      gemini_model: elements.geminiModel?.value,
      theme: elements.themeSelect?.value === "glass" ? "glass" : elements.themeSelect?.value,
      advanced_mode: elements.advancedModeToggle?.checked,
    };

    return Object.keys(currentValues).some(
      (key) => currentValues[key] !== savedConfig[key]
    );
  } catch {
    return false;
  }
}

function closeSettings() {
  try {
    if (window !== window.top) {
      window.parent.postMessage({ type: "close-embedded-settings" }, "*");
    } else {
      window.close();
    }
  } catch (error) {
    console.error("Error closing settings:", error);
    window.close();
  }
}

// ============================================================================
// BUTTON 2: SAVE SETTINGS BUTTON - Save all configuration
// ============================================================================

async function handleSaveButton() {
  if (isProcessing) {
    console.log("Already processing, ignoring save request");
    return;
  }

  console.log("Save button clicked - saving settings");
  isProcessing = true;

  const originalText = setButtonLoading(elements.saveBtn, true);

  try {
    // Gather all form values
    const config = {
      provider: elements.providerSelect?.value || "gemini",
      ollama_model: elements.ollamaModel?.value?.trim() || "granite3.2-vision:2b",
      gemini_model: elements.geminiModel?.value || "gemini-2.0-flash",
      theme: elements.themeSelect?.value || "dark",
      advanced_mode: !!elements.advancedModeToggle?.checked,
    };

    console.log("Saving configuration:", config);

    // Save Gemini API key separately (encrypted storage)
    const geminiApiKey = elements.geminiApiKey?.value?.trim();
    if (geminiApiKey) {
      console.log("Saving Gemini API key");
      store.set("gemini_api_key", geminiApiKey);
    }

    // Save update token via IPC (secure storage)
    const updateToken = elements.updateToken?.value?.trim();
    if (updateToken) {
      console.log("Saving update token securely");
      try {
        const result = await ipcRenderer.invoke("set-update-token", updateToken);
        if (!result.success) {
          throw new Error(result.error || "Failed to save token");
        }
        elements.updateToken.value = "";
        elements.updateToken.placeholder = "Token saved securely";
      } catch (e) {
        throw new Error(`Failed to save update token: ${e.message}`);
      }
    }

    // Save main configuration
    saveConfig(config);

    // Apply theme immediately
    applyTheme(config.theme);

    // Notify main window of config update
    const themeConfig = {
      ...config,
      glassy_mode: store.get("glassy_mode", false),
    };
    ipcRenderer.send("config-updated", themeConfig);

    // Show success message
    showStatus("✅ Settings saved successfully!", "success");

    console.log("Settings saved successfully");

    // Close after delay
    setTimeout(() => {
      closeSettings();
    }, 1000);
  } catch (error) {
    console.error("Error saving settings:", error);
    showStatus(`❌ Failed to save: ${error.message}`, "error", 5000);
  } finally {
    setButtonLoading(elements.saveBtn, false, originalText);
    isProcessing = false;
  }
}

// ============================================================================
// BUTTON 3: TEST CONNECTION BUTTON - Test AI provider connectivity
// ============================================================================

async function handleTestConnectionButton() {
  if (isProcessing) return;

  console.log("Test Connection button clicked");
  isProcessing = true;

  const originalText = setButtonLoading(elements.testConnectionBtn, true);

  try {
    const provider = elements.providerSelect?.value;
    console.log(`Testing ${provider} connection`);

    let result;
    if (provider === "ollama") {
      const model = elements.ollamaModel?.value?.trim();
      if (!model) {
        throw new Error("Please select an Ollama model first");
      }
      result = await testOllamaConnection(model);
    } else if (provider === "gemini") {
      const apiKey = elements.geminiApiKey?.value?.trim();
      if (!apiKey) {
        throw new Error("Please enter your Gemini API key first");
      }
      const model = elements.geminiModel?.value;
      result = await testGeminiConnection(model, apiKey);
    } else {
      throw new Error("Unknown provider selected");
    }

    if (result.success) {
      showStatus(`✅ ${result.message}`, "success", 3000);
      console.log("Connection test successful");
    } else {
      showStatus(`❌ ${result.message}`, "error", 5000);
      console.log("Connection test failed:", result.message);
    }
  } catch (error) {
    console.error("Connection test error:", error);
    showStatus(`❌ ${error.message}`, "error", 5000);
  } finally {
    setButtonLoading(elements.testConnectionBtn, false, originalText);
    isProcessing = false;
  }
}

async function testOllamaConnection(model) {
  try {
    console.log(`Testing Ollama with model: ${model}`);
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: model,
        prompt: "Hello, this is a connection test.",
        stream: false,
      },
      { timeout: 15000 }
    );

    if (response.data && response.data.response) {
      return {
        success: true,
        message: `Ollama connection successful! Model ${model} is working.`,
      };
    }

    return { success: true, message: "Ollama connection successful!" };
  } catch (error) {
    console.error("Ollama connection error:", error);

    if (error.code === "ECONNREFUSED") {
      return {
        success: false,
        message: "Ollama is not running. Start it with: ollama serve",
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        message: `Model "${model}" not found. Install it with: ollama pull ${model}`,
      };
    }
    return {
      success: false,
      message: `Ollama error: ${error.message}`,
    };
  }
}

async function testGeminiConnection(model, apiKey) {
  try {
    console.log(`Testing Gemini with model: ${model}`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: "Hello, this is a connection test." }],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        timeout: 15000,
      }
    );

    if (response.data && response.data.candidates) {
      return {
        success: true,
        message: `Gemini connection successful! Model ${model} is working.`,
      };
    }

    return { success: true, message: "Gemini connection successful!" };
  } catch (error) {
    console.error("Gemini connection error:", error);

    if (error.response?.status === 401 || error.response?.status === 403) {
      return {
        success: false,
        message: "Invalid Gemini API key. Please check your API key.",
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        message: `Model "${model}" not available. Try gemini-2.0-flash or gemini-1.5-flash.`,
      };
    } else if (error.response?.status === 429) {
      return {
        success: false,
        message: "Rate limit exceeded. Please wait a moment and try again.",
      };
    }
    return {
      success: false,
      message: `Gemini error: ${error.message}`,
    };
  }
}

// ============================================================================
// BUTTON 4: CHECK FOR UPDATES BUTTON - Check for app updates
// ============================================================================

async function handleCheckUpdateButton() {
  if (isProcessing) return;

  console.log("Check Update button clicked");
  isProcessing = true;

  const state = elements.checkUpdateBtn?.dataset?.state || "check";

  if (state === "ready-to-download") {
    // User clicked "Update Now" - start download
    console.log("Starting update download");
    setUpdateBtnState({ text: "Preparing…", disabled: true, primary: true });

    if (elements.updateProgress) {
      elements.updateProgress.classList.remove("hidden");
      elements.updateProgress.innerHTML = `<small>Preparing update…</small>`;
    }

    ipcRenderer.send("download-update");
    isProcessing = false;
    return;
  }

  // Perform update check
  const originalText = setButtonLoading(elements.checkUpdateBtn, true);

  try {
    console.log("Checking for updates...");
    if (elements.latestVersionText) {
      elements.latestVersionText.classList.add("hidden");
    }

    const result = await ipcRenderer.invoke("check-for-updates");
    console.log("Update check result:", result);

    if (result?.unsupported) {
      showStatus("Auto-update is not supported in this build.", "info", 4000);
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
    } else if (result?.success && result.available) {
      // Update available
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent =
          `Update available: v${result.latestVersion} (current: v${result.currentVersion})`;
        elements.latestVersionText.classList.remove("hidden");
      }
      setUpdateBtnState({ text: "Update Now", disabled: false, primary: true });
      elements.checkUpdateBtn.dataset.state = "ready-to-download";
      showStatus(
        `✅ Update available: v${result.latestVersion}`,
        "success",
        4000
      );
    } else if (result?.success) {
      // Already on latest
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent =
          `You are on the latest version (v${result.currentVersion})`;
        elements.latestVersionText.classList.remove("hidden");
      }
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
      elements.checkUpdateBtn.dataset.state = "check";
      showStatus("✅ You're on the latest version!", "success", 3000);
    } else {
      // Error
      const errorMsg = result?.error || "Update check failed";
      const fullMsg = result?.needsToken
        ? `${errorMsg} You may need to set an update token.`
        : errorMsg;

      showStatus(`❌ ${fullMsg}`, "error", 6000);
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
      elements.checkUpdateBtn.dataset.state = "check";
    }
  } catch (error) {
    console.error("Update check error:", error);
    showStatus(`❌ Update check failed: ${error.message}`, "error", 6000);
    setUpdateBtnState({ text: "Check for Updates", disabled: false });
    elements.checkUpdateBtn.dataset.state = "check";
  } finally {
    setButtonLoading(elements.checkUpdateBtn, false, originalText);
    isProcessing = false;
  }
}

function setUpdateBtnState({ text, disabled = false, primary = false }) {
  if (!elements.checkUpdateBtn) return;
  elements.checkUpdateBtn.textContent = text;
  elements.checkUpdateBtn.disabled = disabled;
  elements.checkUpdateBtn.classList.toggle("btn-primary", primary);
  elements.checkUpdateBtn.classList.toggle("btn-secondary", !primary);
}

// ============================================================================
// BUTTON 5: SIGN IN BUTTON - Authenticate user
// ============================================================================

async function handleSignInButton() {
  if (isProcessing) return;

  console.log("Sign In button clicked");
  isProcessing = true;

  const originalText = setButtonLoading(elements.signInBtn, true);

  try {
    console.log("Opening browser for authentication");
    showStatus("🔐 Opening browser for sign in...", "info", 3000);

    const result = await ipcRenderer.invoke("open-browser-auth");

    if (result && result.success) {
      showStatus("✅ Please complete sign in in your browser", "success", 4000);
      console.log("Authentication initiated successfully");

      // Wait a bit then refresh user card
      setTimeout(async () => {
        await refreshUserCard();
      }, 2000);
    } else {
      throw new Error(result?.error || "Failed to open authentication");
    }
  } catch (error) {
    console.error("Sign in error:", error);
    showStatus(`❌ Sign in failed: ${error.message}`, "error", 5000);
  } finally {
    setButtonLoading(elements.signInBtn, false, originalText);
    isProcessing = false;
  }
}

// ============================================================================
// BUTTON 6: SIGN OUT BUTTON - Log out user
// ============================================================================

async function handleSignOutButton() {
  if (isProcessing) return;

  console.log("Sign Out button clicked");
  isProcessing = true;

  const originalText = setButtonLoading(elements.signOutBtn, true);

  try {
    const confirm = window.confirm("Are you sure you want to sign out?");

    if (!confirm) {
      console.log("User cancelled sign out");
      return;
    }

    console.log("Signing out user");
    ipcRenderer.send("user-logged-out");

    // Clear any stored user data
    store.delete("user_data");
    store.delete("auth_token");

    showStatus("✅ Signed out successfully", "success", 2000);

    // Refresh user card to show guest state
    setTimeout(async () => {
      await refreshUserCard();
    }, 800);
  } catch (error) {
    console.error("Sign out error:", error);
    showStatus(`❌ Sign out failed: ${error.message}`, "error", 5000);
  } finally {
    setButtonLoading(elements.signOutBtn, false, originalText);
    isProcessing = false;
  }
}

// ============================================================================
// BUTTON 7: PASTE API KEY BUTTON - Paste from clipboard
// ============================================================================

async function handlePasteButton() {
  console.log("Paste button clicked");

  try {
    const text = await ipcRenderer.invoke("get-clipboard-text");

    if (text && elements.geminiApiKey) {
      const trimmedText = String(text).trim();
      elements.geminiApiKey.value = trimmedText;
      elements.geminiApiKey.focus();

      // Flash the input to show it was pasted
      elements.geminiApiKey.style.borderColor = "var(--accent)";
      setTimeout(() => {
        elements.geminiApiKey.style.borderColor = "var(--input-border)";
      }, 1000);

      showStatus("✅ API key pasted from clipboard", "success", 2000);
      console.log("API key pasted successfully");
    } else {
      showStatus("❌ No text found in clipboard", "error", 2000);
      console.log("Clipboard is empty");
    }
  } catch (error) {
    console.error("Paste error:", error);
    showStatus("❌ Failed to paste from clipboard", "error", 2000);
  }
}

// ============================================================================
// BUTTON 8: TOGGLE API KEY VISIBILITY BUTTON - Show/hide API key
// ============================================================================

function handleToggleVisibilityButton() {
  console.log("Toggle visibility button clicked");

  const keyInput = elements.geminiApiKey;
  const toggleBtn = elements.toggleKeyVisibility;

  if (!keyInput || !toggleBtn) {
    console.error("API key input or toggle button not found");
    return;
  }

  if (keyInput.type === "password") {
    keyInput.type = "text";
    toggleBtn.textContent = "🙈";
    toggleBtn.title = "Hide API key";
    console.log("API key visibility: shown");
  } else {
    keyInput.type = "password";
    toggleBtn.textContent = "👁";
    toggleBtn.title = "Show API key";
    console.log("API key visibility: hidden");
  }
}

// ============================================================================
// BUTTON 9: REFRESH OLLAMA MODELS BUTTON - Reload model list
// ============================================================================

async function handleRefreshModelsButton() {
  if (isProcessing) return;

  console.log("Refresh Models button clicked");
  isProcessing = true;

  const refreshBtn = document.getElementById("refresh-ollama-models");
  const originalText = refreshBtn ? refreshBtn.textContent : "";

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "🔄 Refreshing...";
  }

  try {
    showStatus("🔄 Refreshing Ollama models...", "info", 2000);
    await updateOllamaModelList();
    showStatus("✅ Ollama models refreshed", "success", 2000);
    console.log("Ollama models refreshed successfully");
  } catch (error) {
    console.error("Refresh models error:", error);
    showStatus("❌ Failed to refresh models", "error", 3000);
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = originalText || "🔄";
    }
    isProcessing = false;
  }
}

async function updateOllamaModelList() {
  const modelSelect = elements.ollamaModel;
  const statusText = document.getElementById("ollama-status-text");

  if (!modelSelect) return;

  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  if (statusText) {
    statusText.textContent = "Checking Ollama status...";
    statusText.style.color = "var(--fg-muted)";
  }

  const result = await fetchOllamaModels();

  if (result.success && result.models.length > 0) {
    modelSelect.innerHTML = "";
    const currentModel = store.get("ollama_model", "granite3.2-vision:2b");
    let currentModelFound = false;

    result.models.forEach((model) => {
      const modelName = model.name;
      const option = document.createElement("option");
      option.value = modelName;
      option.textContent = modelName;
      if (modelName === currentModel) {
        option.selected = true;
        currentModelFound = true;
      }
      modelSelect.appendChild(option);
    });

    if (!currentModelFound && currentModel) {
      const option = document.createElement("option");
      option.value = currentModel;
      option.textContent = `${currentModel} (not installed)`;
      option.selected = true;
      modelSelect.insertBefore(option, modelSelect.firstChild);
    }

    if (statusText) {
      statusText.innerHTML = `✅ Ollama is running. Found ${result.models.length} model(s).`;
      statusText.style.color = "var(--success, #4ade80)";
    }
  } else if (!result.running) {
    modelSelect.innerHTML = '<option value="">Ollama not running</option>';
    const currentModel = store.get("ollama_model", "granite3.2-vision:2b");
    if (currentModel) {
      const option = document.createElement("option");
      option.value = currentModel;
      option.textContent = currentModel;
      option.selected = true;
      modelSelect.appendChild(option);
    }
    if (statusText) {
      statusText.innerHTML =
        "⚠️ Ollama is not running. Start it with: <code>ollama serve</code>";
      statusText.style.color = "var(--warning, #fb923c)";
    }
  } else {
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    if (statusText) {
      statusText.textContent = result.message || "Failed to load Ollama models";
      statusText.style.color = "var(--error, #ef4444)";
    }
  }
}

async function fetchOllamaModels() {
  try {
    const response = await axios.get("http://localhost:11434/api/tags", {
      timeout: 5000,
    });
    return {
      success: true,
      models: response.data.models || [],
      running: true,
    };
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return {
        success: false,
        running: false,
        message: "Ollama is not running. Start it with: ollama serve",
      };
    }
    return {
      success: false,
      running: false,
      message: `Error: ${error.message}`,
    };
  }
}

// ============================================================================
// USER CARD - Display user information
// ============================================================================

async function refreshUserCard() {
  try {
    console.log("Refreshing user card");
    const status = await ipcRenderer.invoke("get-auth-status");
    const isAuthed = !!(status && status.success && status.authenticated && status.user);
    const isGuest = store.get("guest_mode_enabled", false);

    if (elements.userName) {
      elements.userName.textContent = isAuthed
        ? status.user.name || status.user.firstName || status.user.email || "User"
        : "Guest User";
    }

    if (elements.userEmail) {
      elements.userEmail.textContent = isAuthed
        ? status.user.email || ""
        : isGuest
          ? "Guest Mode"
          : "Using app without account";
    }

    if (elements.userAvatar) {
      const avatarUrl =
        status?.user?.avatar ||
        status?.user?.imageUrl ||
        status?.user?.image_url ||
        "";
      if (isAuthed && avatarUrl) {
        elements.userAvatar.src = avatarUrl;
        elements.userAvatar.onerror = () => {
          elements.userAvatar.src = "../assets/logo_m.png";
        };
      } else {
        elements.userAvatar.src = "../assets/logo_m.png";
      }
    }

    if (elements.signInBtn && elements.signOutBtn) {
      elements.signInBtn.classList.toggle("hidden", isAuthed);
      elements.signOutBtn.classList.toggle("hidden", !isAuthed);
    }

    console.log("User card refreshed. Authenticated:", isAuthed);
  } catch (error) {
    console.error("Failed to refresh user card:", error);
  }
}

// ============================================================================
// FORM LOADING - Load current settings into form
// ============================================================================

async function loadForm() {
  try {
    console.log("Loading form with current settings");
    const config = loadConfig();

    if (elements.providerSelect) elements.providerSelect.value = config.provider;
    if (elements.geminiModel) elements.geminiModel.value = config.gemini_model;

    await updateOllamaModelList();

    const glassyMode = store.get("glassy_mode", false);
    if (elements.themeSelect) {
      elements.themeSelect.value = glassyMode ? "glass" : config.theme;
    }

    if (elements.advancedModeToggle) {
      elements.advancedModeToggle.checked = !!config.advanced_mode;
    }

    const geminiApiKey = store.get("gemini_api_key") || "";
    if (elements.geminiApiKey) {
      elements.geminiApiKey.value = geminiApiKey;
    }

    try {
      const hasToken = await ipcRenderer.invoke("has-update-token");
      if (elements.updateToken) {
        elements.updateToken.placeholder = hasToken
          ? "Token configured (hidden)"
          : "GitHub token for private repo";
      }
    } catch (e) {
      console.warn("Failed to check update token status:", e);
    }

    applyTheme(glassyMode ? "glass" : config.theme);
    console.log("Form loaded successfully");
  } catch (error) {
    console.error("Error loading form:", error);
    showStatus("Failed to load some settings", "error");
  }
}

// ============================================================================
// UPDATES SECTION - Handle update notifications
// ============================================================================

function initializeUpdatesSection() {
  let version = "";
  try {
    const pkg = require("../../package.json");
    version = pkg?.version || "";
  } catch (error) {
    console.warn("Failed to load package.json:", error);
  }

  if (elements.currentVersion) {
    elements.currentVersion.textContent = version || "Unknown";
  }

  ipcRenderer.on("update-status", (_e, payload) => {
    if (payload?.status === "checking") {
      setUpdateBtnState({ text: "Checking…", disabled: true });
    }
  });

  ipcRenderer.on("update-available", (_e, info) => {
    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `Update available: v${info?.version}`;
      elements.latestVersionText.classList.remove("hidden");
    }
    setUpdateBtnState({ text: "Update Now", disabled: false, primary: true });
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "ready-to-download";
    }
  });

  ipcRenderer.on("update-not-available", (_e, info) => {
    if (elements.latestVersionText) {
      elements.latestVersionText.textContent = `Latest version (v${info?.currentVersion || version})`;
      elements.latestVersionText.classList.remove("hidden");
    }
    setUpdateBtnState({ text: "Check for Updates", disabled: false, primary: false });
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "check";
    }
  });

  ipcRenderer.on("update-download-progress", (_e, progress) => {
    if (elements.updateProgress) {
      elements.updateProgress.classList.remove("hidden");
      const pct = Math.round(progress?.percent || 0);
      elements.updateProgress.innerHTML = `<small>Downloading… ${pct}%</small>`;
    }
    setUpdateBtnState({ text: "Downloading…", disabled: true, primary: true });
  });

  ipcRenderer.on("update-downloaded", (_e, info) => {
    if (elements.updateProgress) {
      elements.updateProgress.innerHTML = `<small>Update ready (v${info?.version}). Restarting…</small>`;
    }
    setUpdateBtnState({ text: "Installing…", disabled: true, primary: true });
  });

  ipcRenderer.on("update-error", (_e, err) => {
    const errorMsg = err?.message
 || String(err);
    showStatus(`Update error: ${errorMsg}`, "error", 6000);
    setUpdateBtnState({ text: "Check for Updates", disabled: false });
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "check";
    }
  });
}

// ============================================================================
// EVENT LISTENERS - Attach all button handlers
// ============================================================================

function attachEventListeners() {
  console.log("=== Attaching Event Listeners ===");

  // BUTTON 1: Cancel
  if (elements.cancelBtn) {
    console.log("✓ Cancel button");
    elements.cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleCancelButton();
    });
  }

  // BUTTON 2: Save Settings
  if (elements.saveBtn) {
    console.log("✓ Save button");
    elements.saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleSaveButton();
    });
  }

  // BUTTON 3: Test Connection
  if (elements.testConnectionBtn) {
    console.log("✓ Test Connection button");
    elements.testConnectionBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleTestConnectionButton();
    });
  }

  // BUTTON 4: Check for Updates
  if (elements.checkUpdateBtn) {
    console.log("✓ Check Update button");
    elements.checkUpdateBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleCheckUpdateButton();
    });
  }

  // BUTTON 5: Sign In
  if (elements.signInBtn) {
    console.log("✓ Sign In button");
    elements.signInBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleSignInButton();
    });
  }

  // BUTTON 6: Sign Out
  if (elements.signOutBtn) {
    console.log("✓ Sign Out button");
    elements.signOutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleSignOutButton();
    });
  }

  // BUTTON 7: Paste API Key
  if (elements.pasteKeyBtn) {
    console.log("✓ Paste button");
    elements.pasteKeyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handlePasteButton();
    });
  }

  // BUTTON 8: Toggle Visibility
  if (elements.toggleKeyVisibility) {
    console.log("✓ Toggle Visibility button");
    elements.toggleKeyVisibility.addEventListener("click", (e) => {
      e.preventDefault();
      handleToggleVisibilityButton();
    });
  }

  // BUTTON 9: Refresh Ollama Models
  const refreshBtn = document.getElementById("refresh-ollama-models");
  if (refreshBtn) {
    console.log("✓ Refresh Models button");
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleRefreshModelsButton();
    });
  }

  // Provider select change
  if (elements.providerSelect) {
    elements.providerSelect.addEventListener("change", () => {
      console.log("Provider changed to:", elements.providerSelect.value);
    });
  }

  // Theme change preview
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value);
    });
  }

  // Advanced mode toggle
  if (elements.advancedModeToggle) {
    elements.advancedModeToggle.addEventListener("change", (e) => {
      if (e.target.checked) {
        showStatus("Advanced Hint Mode enabled", "success", 2000);
      } else {
        showStatus("Advanced Hint Mode disabled", "info", 2000);
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      handleCancelButton();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSaveButton();
    }
  });

  console.log("=== All Event Listeners Attached ===");
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeSettings() {
  try {
    console.log("Initializing settings...");

    elements = {
      providerSelect: document.getElementById("provider-select"),
      ollamaModel: document.getElementById("ollama-model"),
      geminiModel: document.getElementById("gemini-model"),
      geminiApiKey: document.getElementById("gemini-api-key"),
      themeSelect: document.getElementById("theme-select"),
      advancedModeToggle: document.getElementById("advanced-mode-toggle"),
      cancelBtn: document.getElementById("cancel-btn"),
      testConnectionBtn: document.getElementById("test-connection-btn"),
      saveBtn: document.getElementById("save-btn"),
      toggleKeyVisibility: document.getElementById("toggle-key-visibility"),
      pasteKeyBtn: document.getElementById("paste-key-btn"),
      statusMessage: document.getElementById("status-message"),
      userAvatar: document.getElementById("settings-user-avatar"),
      userName: document.getElementById("settings-user-name"),
      userEmail: document.getElementById("settings-user-email"),
      signInBtn: document.getElementById("settings-signin-btn"),
      signOutBtn: document.getElementById("settings-signout-btn"),
      currentVersion: document.getElementById("current-version"),
      latestVersionText: document.getElementById("latest-version-text"),
      updateToken: document.getElementById("update-token"),
      checkUpdateBtn: document.getElementById("check-update-btn"),
      updateProgress: document.getElementById("update-progress"),
    };

    attachEventListeners();
    await refreshUserCard();
    await loadForm();
    initializeUpdatesSection();

    console.log("✅ Settings initialized successfully!");
    showStatus("Settings loaded", "success", 2000);
  } catch (error) {
    console.error("Failed to initialize settings:", error);
    showStatus("Failed to initialize settings", "error");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSettings);
} else {
  initializeSettings();
}
