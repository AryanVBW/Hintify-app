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

// Load configuration from store
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

// Save configuration to store
function saveConfig(config) {
  Object.keys(config).forEach((key) => {
    store.set(key, config[key]);
  });
}

// Apply theme to the UI
function applyTheme(theme) {
  // Remove all theme classes
  document.body.className = "";
  document.documentElement.className = "";

  // Apply the selected theme
  if (theme === "glass") {
    document.body.classList.add("theme-dark", "glassy-mode");
    document.documentElement.classList.add("theme-glassy");
    store.set("glassy_mode", true);
  } else {
    document.body.classList.add(`theme-${theme || "dark"}`);
    store.set("glassy_mode", false);
  }
}

// Show status message to user
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

// Refresh user card with current auth status
async function refreshUserCard() {
  try {
    const status = await ipcRenderer.invoke("get-auth-status");
    const isAuthed = !!(
      status &&
      status.success &&
      status.authenticated &&
      status.user
    );
    const isGuest = store.get("guest_mode_enabled", false);

    if (elements.userName) {
      elements.userName.textContent = isAuthed
        ? status.user.name ||
          status.user.firstName ||
          status.user.email ||
          "User"
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
      } else {
        elements.userAvatar.src = "../assets/logo_m.png";
      }
    }

    if (elements.signInBtn && elements.signOutBtn) {
      elements.signInBtn.classList.toggle("hidden", isAuthed);
      elements.signOutBtn.classList.toggle("hidden", !isAuthed);
    }
  } catch (e) {
    console.warn("Failed to refresh user card:", e);
  }
}

// Fetch available Ollama models
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
        message:
          "Ollama is not running. Please start Ollama to see available models.",
      };
    }
    return {
      success: false,
      running: false,
      message: `Error fetching models: ${error.message}`,
    };
  }
}

// Update Ollama model dropdown with available models
async function updateOllamaModelList() {
  const modelSelect = elements.ollamaModel;
  const statusText = document.getElementById("ollama-status-text");
  const refreshBtn = document.getElementById("refresh-ollama-models");

  if (!modelSelect || !statusText) return;

  // Set loading state
  if (refreshBtn) refreshBtn.disabled = true;
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  statusText.textContent = "Checking Ollama status...";
  statusText.style.color = "var(--fg-muted)";

  const result = await fetchOllamaModels();

  if (result.success && result.models.length > 0) {
    // Clear and populate dropdown
    modelSelect.innerHTML = "";

    // Get current saved model
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

    // If current model not found in list, add it as first option
    if (!currentModelFound && currentModel) {
      const option = document.createElement("option");
      option.value = currentModel;
      option.textContent = `${currentModel} (not installed)`;
      option.selected = true;
      modelSelect.insertBefore(option, modelSelect.firstChild);
    }

    statusText.innerHTML = `✅ Ollama is running. Found ${result.models.length} model(s).`;
    statusText.style.color = "var(--success, #4ade80)";
  } else if (!result.running) {
    // Ollama not running
    modelSelect.innerHTML = '<option value="">Ollama not running</option>';
    const currentModel = store.get("ollama_model", "granite3.2-vision:2b");
    if (currentModel) {
      const option = document.createElement("option");
      option.value = currentModel;
      option.textContent = currentModel;
      option.selected = true;
      modelSelect.appendChild(option);
    }
    statusText.innerHTML =
      "⚠️ Ollama is not running. Please start Ollama with: <code>ollama serve</code>";
    statusText.style.color = "var(--warning, #fb923c)";
  } else {
    // Other error
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
    statusText.textContent = result.message || "Failed to load Ollama models";
    statusText.style.color = "var(--error, #ef4444)";
  }

  if (refreshBtn) refreshBtn.disabled = false;
}

// Test Ollama connection
async function testOllamaConnection(model) {
  try {
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: model,
        prompt: "Hello",
        stream: false,
      },
      { timeout: 10000 },
    );

    return { success: true, message: "Ollama connection successful" };
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      return {
        success: false,
        message:
          "Ollama is not running. Please start Ollama first with: ollama serve",
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        message: `Model "${model}" not found. Pull it with: ollama pull ${model}`,
      };
    }
    return { success: false, message: `Ollama error: ${error.message}` };
  }
}

// Test Gemini connection
async function testGeminiConnection(model, apiKey) {
  if (!apiKey) {
    return { success: false, message: "Gemini API key is required" };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: "Hello" }],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        timeout: 10000,
      },
    );

    return { success: true, message: "Gemini connection successful" };
  } catch (error) {
    if (error.response?.status === 401) {
      return { success: false, message: "Invalid Gemini API key" };
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

  const provider = elements.providerSelect?.value;
  const ollamaModel = elements.ollamaModel?.value?.trim();
  const geminiModel = elements.geminiModel?.value;
  const geminiApiKey = elements.geminiApiKey?.value?.trim();

  // Set loading state
  testBtn.classList.add("loading");
  testBtn.disabled = true;
  const originalText = testBtn.textContent;
  testBtn.textContent = "Testing...";

  try {
    let result;
    if (provider === "ollama") {
      if (!ollamaModel) {
        result = {
          success: false,
          message: "Please select an Ollama model first",
        };
      } else {
        result = await testOllamaConnection(ollamaModel);
      }
    } else if (provider === "gemini") {
      if (!geminiApiKey) {
        result = {
          success: false,
          message: "Please enter your Gemini API key first",
        };
      } else {
        result = await testGeminiConnection(geminiModel, geminiApiKey);
      }
    } else {
      result = { success: false, message: "Unknown provider" };
    }

    showStatus(result.message, result.success ? "success" : "error");
  } catch (error) {
    showStatus(`Connection test failed: ${error.message}`, "error");
  } finally {
    testBtn.classList.remove("loading");
    testBtn.disabled = false;
    testBtn.textContent = originalText;
  }
}

// Save settings
async function saveSettings() {
  const saveBtn = elements.saveBtn;
  if (!saveBtn) return;

  try {
    // Set loading state
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";

    // Get form values
    const config = {
      provider: elements.providerSelect?.value || "gemini",
      ollama_model:
        elements.ollamaModel?.value?.trim() || "granite3.2-vision:2b",
      gemini_model: elements.geminiModel?.value || "gemini-2.0-flash",
      theme: elements.themeSelect?.value || "dark",
      advanced_mode: !!elements.advancedModeToggle?.checked,
    };

    // Save Gemini API key separately if provided
    const geminiApiKey = elements.geminiApiKey?.value?.trim();
    if (geminiApiKey) {
      store.set("gemini_api_key", geminiApiKey);
    }

    // Save update token securely via IPC if provided
    const updateToken = elements.updateToken?.value?.trim();
    if (updateToken) {
      try {
        const result = await ipcRenderer.invoke(
          "set-update-token",
          updateToken,
        );
        if (!result.success) {
          throw new Error(result.error || "Failed to save token");
        }
        elements.updateToken.value = ""; // Clear for security
        elements.updateToken.placeholder = "Token saved securely";
      } catch (e) {
        showStatus(`Failed to save update token: ${e.message}`, "error");
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
        return;
      }
    }

    // Save configuration
    saveConfig(config);

    // Apply theme immediately
    applyTheme(config.theme);

    // Notify main window of config update
    const themeConfig = {
      ...config,
      glassy_mode: store.get("glassy_mode", false),
    };
    ipcRenderer.send("config-updated", themeConfig);

    showStatus("Settings saved successfully!", "success");

    // Close after a short delay
    setTimeout(() => {
      closeSettings();
    }, 1000);
  } catch (error) {
    console.error("Error saving settings:", error);
    showStatus(`Failed to save settings: ${error.message}`, "error");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Settings";
    }
  }
}

// Cancel and close settings window
function cancelSettings() {
  closeSettings();
}

// Close settings window helper
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

// Paste from clipboard into API key field
async function pasteFromClipboard() {
  try {
    const text = await ipcRenderer.invoke("get-clipboard-text");
    if (text && elements.geminiApiKey) {
      elements.geminiApiKey.value = String(text).trim();
      elements.geminiApiKey.focus();
      showStatus("API key pasted from clipboard", "success", 2000);
    } else {
      showStatus("No text found in clipboard", "error", 2000);
    }
  } catch (error) {
    console.error("Error pasting from clipboard:", error);
    showStatus("Failed to paste from clipboard", "error", 2000);
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const keyInput = elements.geminiApiKey;
  const toggleBtn = elements.toggleKeyVisibility;

  if (!keyInput || !toggleBtn) return;

  if (keyInput.type === "password") {
    keyInput.type = "text";
    toggleBtn.textContent = "🙈";
    toggleBtn.title = "Hide API key";
  } else {
    keyInput.type = "password";
    toggleBtn.textContent = "👁";
    toggleBtn.title = "Show API key";
  }
}

// Update form fields based on current provider
function updateProviderFields() {
  const provider = elements.providerSelect?.value;
  // Currently showing all fields regardless of provider
  // Can be extended to show/hide specific fields if needed
}

// Load form with current settings
async function loadForm() {
  try {
    const config = loadConfig();

    // Set form values
    if (elements.providerSelect)
      elements.providerSelect.value = config.provider;
    if (elements.geminiModel) elements.geminiModel.value = config.gemini_model;

    // Load Ollama models (will set the saved value after loading)
    await updateOllamaModelList();

    // Handle theme - check if glassy mode is enabled
    const glassyMode = store.get("glassy_mode", false);
    if (elements.themeSelect) {
      if (glassyMode) {
        elements.themeSelect.value = "glass";
      } else {
        elements.themeSelect.value = config.theme;
      }
    }

    if (elements.advancedModeToggle) {
      elements.advancedModeToggle.checked = !!config.advanced_mode;
    }

    // Load Gemini API key
    const geminiApiKey = store.get("gemini_api_key") || "";
    if (elements.geminiApiKey) {
      elements.geminiApiKey.value = geminiApiKey;
    }

    // Load update token status (stored securely via IPC)
    try {
      const hasToken = await ipcRenderer.invoke("has-update-token");
      if (elements.updateToken) {
        elements.updateToken.placeholder = hasToken
          ? "Token configured (hidden for security)"
          : "GitHub token for private repository access";
      }
    } catch (e) {
      console.warn("Failed to check update token status:", e);
      if (elements.updateToken) {
        elements.updateToken.placeholder =
          "GitHub token for private repository access";
      }
    }

    // Apply current theme
    applyTheme(glassyMode ? "glass" : config.theme);

    // Update provider-specific fields
    updateProviderFields();
  } catch (error) {
    console.error("Error loading form:", error);
    showStatus("Failed to load some settings", "error");
  }
}

// Enable paste functionality on input elements
function enablePasteOnInput(inputElement) {
  if (!inputElement) return;

  // Enable paste operations
  inputElement.addEventListener("paste", (e) => {
    // Allow default paste behavior
    setTimeout(() => {
      // Trim whitespace from pasted content
      inputElement.value = inputElement.value.trim();
    }, 10);
  });

  // Add keyboard shortcut for paste
  inputElement.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      // Allow native paste
      e.stopPropagation();
    }
  });

  // Add right-click context menu support
  inputElement.addEventListener("contextmenu", (e) => {
    // Allow native context menu with paste option
    e.stopPropagation();
  });
}

// Set update button state
function setUpdateBtnState({ text, disabled = false, primary = false }) {
  if (!elements.checkUpdateBtn) return;
  elements.checkUpdateBtn.textContent = text;
  elements.checkUpdateBtn.disabled = disabled;
  elements.checkUpdateBtn.classList.toggle("btn-primary", primary);
  elements.checkUpdateBtn.classList.toggle("btn-secondary", !primary);
}

// Initialize updates section
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

  // Listen for updater events
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
      elements.latestVersionText.textContent = `You are on the latest version${info?.currentVersion ? ` (v${info.currentVersion})` : ""}`;
      elements.latestVersionText.classList.remove("hidden");
    }
    setUpdateBtnState({
      text: "Check for Updates",
      disabled: false,
      primary: false,
    });
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "check";
    }
  });

  ipcRenderer.on("update-download-progress", (_e, progress) => {
    if (elements.updateProgress) {
      elements.updateProgress.classList.remove("hidden");
      const pct = Math.max(
        0,
        Math.min(100, Math.round(progress?.percent || 0)),
      );
      elements.updateProgress.innerHTML = `<small>Downloading… ${pct}%</small>`;
    }
    setUpdateBtnState({ text: "Downloading…", disabled: true, primary: true });
  });

  ipcRenderer.on("update-downloaded", (_e, info) => {
    if (elements.updateProgress) {
      elements.updateProgress.innerHTML = `<small>Update downloaded (v${info?.version}). Installing…</small>`;
    }
    setUpdateBtnState({ text: "Installing…", disabled: true, primary: true });
  });

  ipcRenderer.on("update-error", (_e, err) => {
    const errorMsg = err?.message || String(err);
    let displayMsg = `Update error: ${errorMsg}`;

    // Provide helpful context for common errors
    if (errorMsg.includes("404") || errorMsg.includes("Not Found")) {
      displayMsg +=
        ". This may be a private repository requiring an update token.";
    } else if (errorMsg.includes("network") || errorMsg.includes("ENOTFOUND")) {
      displayMsg += ". Please check your internet connection.";
    }

    showStatus(displayMsg, "error", 6000);
    setUpdateBtnState({
      text: "Check for Updates",
      disabled: false,
      primary: false,
    });
    if (elements.updateProgress)
      elements.updateProgress.classList.add("hidden");
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "check";
    }

    console.error("Update error details:", err);
  });
}

// Handle check/update button click
async function onCheckOrUpdateClick() {
  try {
    const state = elements.checkUpdateBtn?.dataset?.state || "check";

    if (state === "ready-to-download") {
      // Start download
      setUpdateBtnState({ text: "Preparing…", disabled: true, primary: true });
      if (elements.updateProgress) {
        elements.updateProgress.classList.remove("hidden");
        elements.updateProgress.innerHTML = `<small>Preparing update…</small>`;
      }
      ipcRenderer.send("download-update");
      return;
    }

    // Otherwise, perform a check
    setUpdateBtnState({ text: "Checking…", disabled: true });
    if (elements.latestVersionText) {
      elements.latestVersionText.classList.add("hidden");
    }

    const res = await ipcRenderer.invoke("check-for-updates");

    if (res?.unsupported) {
      showStatus("Auto-update is not supported in this build.", "info", 3500);
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
      return;
    }

    if (res?.success && res.available) {
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `Update available: v${res.latestVersion} (current v${res.currentVersion})`;
        elements.latestVersionText.classList.remove("hidden");
      }
      setUpdateBtnState({ text: "Update Now", disabled: false, primary: true });
      if (elements.checkUpdateBtn) {
        elements.checkUpdateBtn.dataset.state = "ready-to-download";
      }
    } else if (res?.success) {
      if (elements.latestVersionText) {
        elements.latestVersionText.textContent = `You are on the latest version (v${res.currentVersion})`;
        elements.latestVersionText.classList.remove("hidden");
      }
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
      if (elements.checkUpdateBtn) {
        elements.checkUpdateBtn.dataset.state = "check";
      }
    } else {
      // Show detailed error message
      const errorMsg = res?.error || "Unknown error";
      const fullMsg = res?.needsToken
        ? `${errorMsg} You may need to set an update token for private repository access.`
        : errorMsg;

      showStatus(`Update check failed: ${fullMsg}`, "error", 6000);
      setUpdateBtnState({ text: "Check for Updates", disabled: false });
      if (elements.checkUpdateBtn) {
        elements.checkUpdateBtn.dataset.state = "check";
      }

      // Show raw error in console for debugging
      if (res?.rawError) {
        console.error("Raw update error:", res.rawError);
      }
    }
  } catch (e) {
    const errorMsg = e?.message || String(e);
    showStatus(`Update check failed: ${errorMsg}`, "error", 6000);
    setUpdateBtnState({ text: "Check for Updates", disabled: false });
    if (elements.checkUpdateBtn) {
      elements.checkUpdateBtn.dataset.state = "check";
    }
    console.error("Update check exception:", e);
  }
}

// Attach all event listeners
function attachEventListeners() {
  console.log("=== Attaching Event Listeners ===");

  // Helper function to attach multiple event methods
  const attachClick = (element, handler, name) => {
    if (!element) {
      console.warn(`✗ ${name} not found!`);
      return false;
    }

    console.log(`✓ Attaching ${name} listener`);

    // Method 1: addEventListener with bubble phase
    element.addEventListener(
      "click",
      (e) => {
        console.log(`${name} clicked (addEventListener)!`);
        e.preventDefault();
        e.stopPropagation();
        handler();
      },
      false,
    );

    // Method 2: addEventListener with capture phase (backup)
    element.addEventListener(
      "click",
      (e) => {
        console.log(`${name} clicked (capture)!`);
        e.preventDefault();
        e.stopPropagation();
        handler();
      },
      true,
    );

    // Method 3: Direct onclick (backup)
    const oldOnClick = element.onclick;
    element.onclick = (e) => {
      console.log(`${name} clicked (onclick)!`);
      e.preventDefault();
      e.stopPropagation();
      handler();
      if (oldOnClick) oldOnClick.call(element, e);
    };

    // Method 4: Ensure button is enabled and clickable
    element.disabled = false;
    element.style.pointerEvents = "auto";
    element.style.cursor = "pointer";

    return true;
  };

  // Cancel button
  attachClick(elements.cancelBtn, cancelSettings, "Cancel button");

  // Test connection button
  attachClick(
    elements.testConnectionBtn,
    testConnection,
    "Test Connection button",
  );

  // Save button
  attachClick(elements.saveBtn, saveSettings, "Save button");

  // Toggle API key visibility button
  attachClick(
    elements.toggleKeyVisibility,
    toggleApiKeyVisibility,
    "Toggle Key Visibility button",
  );

  // Paste API key button
  attachClick(elements.pasteKeyBtn, pasteFromClipboard, "Paste button");

  // Provider select change
  if (elements.providerSelect) {
    elements.providerSelect.addEventListener("change", updateProviderFields);
  }

  // Refresh Ollama models button
  const refreshOllamaBtn = document.getElementById("refresh-ollama-models");
  if (refreshOllamaBtn) {
    refreshOllamaBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      showStatus("Refreshing Ollama models...", "info", 1500);
      await updateOllamaModelList();
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
        showStatus(
          "Advanced Hint Mode enabled: screenshots will be sent directly to the AI (vision).",
          "success",
          2500,
        );
      } else {
        showStatus(
          "Advanced Hint Mode disabled: using OCR → text prompts.",
          "info",
          2000,
        );
      }
    });
  }

  // Check/update button
  attachClick(
    elements.checkUpdateBtn,
    onCheckOrUpdateClick,
    "Check Update button",
  );

  // Sign in button
  if (elements.signInBtn) {
    attachClick(
      elements.signInBtn,
      async () => {
        try {
          await ipcRenderer.invoke("open-browser-auth");
          showStatus("Opening sign-in in browser...", "info", 2000);
        } catch (error) {
          console.error("Error opening browser auth:", error);
          showStatus("Failed to open sign-in", "error");
        }
      },
      "Sign In button",
    );
  }

  // Sign out button
  if (elements.signOutBtn) {
    attachClick(
      elements.signOutBtn,
      () => {
        ipcRenderer.send("user-logged-out");
        showStatus("Signed out", "success", 1500);
        setTimeout(refreshUserCard, 800);
      },
      "Sign Out button",
    );
  }

  console.log("=== Event Listeners Attached ===");

  // Enable paste on input fields
  enablePasteOnInput(elements.geminiApiKey);
  enablePasteOnInput(elements.ollamaModel);
  enablePasteOnInput(elements.updateToken);

  // Add focus styling to API key field
  if (elements.geminiApiKey) {
    elements.geminiApiKey.addEventListener("focus", () => {
      elements.geminiApiKey.style.borderColor = "var(--accent)";
    });

    elements.geminiApiKey.addEventListener("blur", () => {
      elements.geminiApiKey.style.borderColor = "var(--input-border)";
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelSettings();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveSettings();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      e.key === "v" &&
      document.activeElement === elements.geminiApiKey
    ) {
      // Allow paste in API key field
      e.stopPropagation();
    }
  });
}

// Test function to manually verify button clicks work
window.testSettingsButtons = function () {
  console.log("=== TESTING SETTINGS BUTTONS ===");

  const buttons = {
    cancel: document.getElementById("cancel-btn"),
    save: document.getElementById("save-btn"),
    testConnection: document.getElementById("test-connection-btn"),
    checkUpdate: document.getElementById("check-update-btn"),
    signIn: document.getElementById("settings-signin-btn"),
    signOut: document.getElementById("settings-signout-btn"),
    paste: document.getElementById("paste-key-btn"),
    toggle: document.getElementById("toggle-key-visibility"),
    refresh: document.getElementById("refresh-ollama-models"),
  };

  console.log("Button elements found:");
  Object.keys(buttons).forEach((key) => {
    const btn = buttons[key];
    if (btn) {
      console.log(`✓ ${key}: Found (id="${btn.id}")`);
      // Check if it has click event listeners
      const hasListeners = btn.onclick || btn.addEventListener;
      console.log(`  - Has handlers: ${!!hasListeners}`);
      console.log(`  - Disabled: ${btn.disabled}`);
      console.log(`  - Display: ${window.getComputedStyle(btn).display}`);
    } else {
      console.warn(`✗ ${key}: NOT FOUND`);
    }
  });

  console.log(
    "\nTry clicking buttons now. Check console for 'clicked!' messages.",
  );
  console.log("You can also call: window.testClickButton('save')");
  console.log("=================================");

  return buttons;
};

// Helper to programmatically test a button click
window.testClickButton = function (buttonName) {
  const buttonIds = {
    cancel: "cancel-btn",
    save: "save-btn",
    test: "test-connection-btn",
    update: "check-update-btn",
    signin: "settings-signin-btn",
    signout: "settings-signout-btn",
    paste: "paste-key-btn",
    toggle: "toggle-key-visibility",
    refresh: "refresh-ollama-models",
  };

  const id = buttonIds[buttonName];
  if (!id) {
    console.error(
      `Unknown button: ${buttonName}. Available: ${Object.keys(buttonIds).join(", ")}`,
    );
    return;
  }

  const btn = document.getElementById(id);
  if (!btn) {
    console.error(`Button not found: ${id}`);
    return;
  }

  console.log(`Programmatically clicking: ${buttonName} (${id})`);
  btn.click();
};

// Initialize settings window
async function initializeSettings() {
  try {
    // Get DOM elements
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
      // User card elements
      userAvatar: document.getElementById("settings-user-avatar"),
      userName: document.getElementById("settings-user-name"),
      userEmail: document.getElementById("settings-user-email"),
      signInBtn: document.getElementById("settings-signin-btn"),
      signOutBtn: document.getElementById("settings-signout-btn"),
      // Updates card elements
      currentVersion: document.getElementById("current-version"),
      latestVersionText: document.getElementById("latest-version-text"),
      updateToken: document.getElementById("update-token"),
      checkUpdateBtn: document.getElementById("check-update-btn"),
      updateProgress: document.getElementById("update-progress"),
    };

    // Debug: Log all elements to see what's found
    console.log("=== Settings Elements Debug ===");
    console.log("cancelBtn:", elements.cancelBtn);
    console.log("saveBtn:", elements.saveBtn);
    console.log("testConnectionBtn:", elements.testConnectionBtn);
    console.log("checkUpdateBtn:", elements.checkUpdateBtn);
    console.log("signInBtn:", elements.signInBtn);
    console.log("signOutBtn:", elements.signOutBtn);
    console.log("pasteKeyBtn:", elements.pasteKeyBtn);
    console.log("toggleKeyVisibility:", elements.toggleKeyVisibility);
    console.log("providerSelect:", elements.providerSelect);
    console.log("themeSelect:", elements.themeSelect);
    console.log("==============================");

    // Attach all event listeners
    attachEventListeners();

    // Load user card
    await refreshUserCard();

    // Load current settings into form
    await loadForm();

    // Initialize Updates card
    initializeUpdatesSection();

    console.log("Settings initialized successfully");
    console.log("\n💡 TIP: Open DevTools Console and run:");
    console.log("   window.testSettingsButtons() - to check all buttons");
    console.log("   window.testClickButton('save') - to test Save button");
    console.log(
      "   window.testClickButton('cancel') - to test Cancel button\n",
    );
  } catch (error) {
    console.error("Failed to initialize settings:", error);
    showStatus("Failed to initialize settings", "error");
  }
}

// Track if settings have been initialized
let settingsInitialized = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

// Wrapper function that tracks initialization state
async function tryInitializeSettings() {
  if (settingsInitialized) {
    console.log("Settings already initialized, skipping...");
    return;
  }

  initializationAttempts++;
  console.log(
    `Initialization attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`,
  );

  try {
    await initializeSettings();
    settingsInitialized = true;
    console.log("✅ Settings initialized successfully!");
  } catch (e) {
    console.error(
      `Failed to initialize settings (attempt ${initializationAttempts}):`,
      e,
    );

    // Retry after delay if not max attempts
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      console.log(`Retrying in 500ms...`);
      setTimeout(tryInitializeSettings, 500);
    } else {
      console.error(
        "❌ Max initialization attempts reached. Settings may not work correctly.",
      );
      alert("Failed to initialize settings. Please refresh the page.");
    }
  }
}

// Method 1: DOMContentLoaded (standard way)
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded event fired");
  await tryInitializeSettings();
});

// Method 2: readystatechange (more reliable in some cases)
document.addEventListener("readystatechange", () => {
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    console.log(`Document readyState: ${document.readyState}`);
    tryInitializeSettings();
  }
});

// Method 3: window.load (backup - fires after all resources loaded)
window.addEventListener("load", () => {
  console.log("Window load event fired");
  tryInitializeSettings();
});

// Method 4: Immediate check if DOM is already ready
if (
  document.readyState === "interactive" ||
  document.readyState === "complete"
) {
  console.log("DOM already ready, initializing immediately");
  tryInitializeSettings();
}

// Method 5: Timeout-based fallback (nuclear option)
setTimeout(() => {
  if (!settingsInitialized) {
    console.warn("⚠️ Timeout fallback triggered - forcing initialization");
    tryInitializeSettings();
  }
}, 1000);

// Method 6: Expose initialization function globally for manual trigger
window.forceInitializeSettings = function () {
  console.log("Manual initialization triggered");
  settingsInitialized = false;
  initializationAttempts = 0;
  return tryInitializeSettings();
};

// Handle window close
window.addEventListener("beforeunload", () => {
  console.log("Settings window closing, cleaning up...");
  settingsInitialized = false;
});

// Add global error handler
window.addEventListener("error", (e) => {
  console.error("Global error in settings:", e.error);
});

// Add unhandled promise rejection handler
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection in settings:", e.reason);
});
