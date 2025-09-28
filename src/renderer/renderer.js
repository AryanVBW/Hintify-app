const { ipcRenderer, clipboard, nativeImage, shell, desktopCapturer, systemPreferences } = require('electron');
const Store = require('electron-store');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Initialize store
const store = new Store();

// Global variables
let currentConfig = {};
let isProcessing = false;
let userInfo = null;
let currentQuestionData = null; // Store current question for saving to database

// Default configuration
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  // When enabled, screenshots are sent directly to the AI model (vision) without OCR
  advanced_mode: true
};

// Load configuration
function loadConfig() {
  const config = { ...defaultConfig };
  Object.keys(defaultConfig).forEach(key => {
    const stored = store.get(key);
    if (stored !== undefined) {
      config[key] = stored;
    }
  });
  currentConfig = config;
  return config;
}

// Save configuration
function saveConfig(config) {
  Object.keys(config).forEach(key => {
    store.set(key, config[key]);
  });
  currentConfig = { ...currentConfig, ...config };
}

// Apply theme to body
function applyTheme(theme) {
  document.body.className = `theme-${theme || 'dark'}`;
}

// Platform-aware modifier key label for shortcuts
function getModKeyLabel() {
  try { return process.platform === 'darwin' ? 'Cmd' : 'Ctrl'; } catch { return 'Ctrl'; }
}

// Check authentication status with enhanced validation
async function checkAuthStatus() {
  try {
    console.log('🔍 Checking authentication status...');

    // First check local storage
    const isAuthenticated = store.get('user_authenticated', false);
    const userData = store.get('user_info', null);
    const lastAuthTime = store.get('last_auth_time', null);

    console.log('📊 Local auth status:', {
      isAuthenticated,
      hasUserData: !!userData,
      userEmail: userData?.email,
      userName: userData?.name || userData?.firstName,
      lastAuthTime
    });

    if (isAuthenticated && userData) {
      // Validate session with main process
      try {
        const authStatus = await ipcRenderer.invoke('get-auth-status');

        if (authStatus.success && authStatus.authenticated && authStatus.sessionValid) {
          console.log('✅ User is authenticated with valid session, setting up UI...');
          userInfo = userData;
          updateAuthUI(true, userData);
          return true;
        } else {
          console.log('⚠️ Session invalid, clearing authentication...');
          // Session is invalid, clear local data
          store.set('user_authenticated', false);
          store.delete('user_info');
          store.delete('last_auth_time');
          userInfo = null;
          updateAuthUI(false);
          return false;
        }
      } catch (error) {
        console.warn('⚠️ Failed to validate session with main process:', error);
        // Fallback to local check if main process validation fails
        if (isAuthenticated && userData) {
          console.log('✅ Using local authentication data as fallback...');
          userInfo = userData;
          updateAuthUI(true, userData);
          return true;
        }
      }
    }

    console.log('❌ User not authenticated, showing sign-in UI');
    userInfo = null;
    updateAuthUI(false);
    return false;

  } catch (error) {
    console.error('❌ Error checking authentication status:', error);
    userInfo = null;
    updateAuthUI(false);
    return false;
  }
}

// Update authentication UI
function updateAuthUI(isAuthenticated, userData = null, isGuestMode = false) {
  const authBtn = document.getElementById('auth-btn');
  const userAccountSection = document.getElementById('user-account-section');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const accountEmail = document.getElementById('account-email');
  const syncStatus = document.getElementById('sync-status');
  const syncIndicator = syncStatus?.querySelector('.sync-indicator');
  const syncText = syncStatus?.querySelector('.sync-text');

  console.log('🎨 Updating enhanced auth UI:', { isAuthenticated, userData });

  if (isAuthenticated && userData) {
    // Show user account section, hide sign-in button
    if (authBtn) {
      authBtn.classList.add('hidden');
      console.log('🚫 Sign-in button hidden');
    }
    if (userAccountSection) {
      userAccountSection.classList.remove('hidden');
      console.log('✅ User account section shown');
    }

    // Update user avatar with better error handling
    if (userAvatar) {
      const imageUrl = userData.image_url || userData.imageUrl || userData.avatar || userData.picture;
      if (imageUrl) {
        userAvatar.src = imageUrl;
        userAvatar.onerror = (e) => {
          console.warn('Avatar image failed to load, using fallback:', e);
          userAvatar.src = '../../assets/logo_m.png';
        };
        console.log('🖼️ Avatar set:', imageUrl);
      } else {
        userAvatar.src = '../../assets/logo_m.png'; // Default avatar
        console.log('🖼️ Using default avatar');
      }
    }

    // Update user name with comprehensive fallbacks
    if (userName) {
      const displayName = userData.name ||
                         userData.fullName ||
                         (userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : '') ||
                         userData.firstName ||
                         userData.displayName ||
                         userData.username ||
                         userData.email ||
                         'User';

      userName.textContent = displayName;

      console.log('📝 User name set:', displayName);
    }

    // Update account email
    if (accountEmail && userData.email) {
      accountEmail.textContent = userData.email;
      console.log('📧 Account email set:', userData.email);
    }

    // Update sync status
    if (syncIndicator && syncText) {
      const syncStatusData = userData.sync_status || 'active';

      // Reset classes
      syncIndicator.classList.remove('active', 'error');

      switch (syncStatusData) {
        case 'active':
          syncIndicator.classList.add('active');
          syncText.textContent = 'Synced';
          break;
        case 'syncing':
          syncIndicator.classList.add('active');
          syncText.textContent = 'Syncing...';
          break;
        case 'error':
          syncIndicator.classList.add('error');
          syncText.textContent = 'Sync Error';
          break;
        default:
          syncText.textContent = 'Unknown';
      }

      console.log('🔄 Sync status updated:', syncStatusData);
    }

    console.log('✅ Enhanced user authentication UI updated successfully');
  } else if (isGuestMode) {
    // Guest mode UI: keep the topbar minimal — no big Guest Mode button
    if (authBtn) {
      authBtn.classList.add('hidden');
      authBtn.textContent = 'Sign In';
      authBtn.style.backgroundColor = '';
      authBtn.style.color = '';
      authBtn.title = 'Sign In to Hintify';
    }
    if (userAccountSection) {
      userAccountSection.classList.remove('hidden');
      userAccountSection.classList.add('guest');
      console.log('✅ User account section shown for guest mode');
    }

    // Update UI elements for guest mode
    if (userAvatar) {
      userAvatar.src = '../../assets/logo_m.png'; // Default avatar for guest
    }

    if (userName) {
      userName.textContent = 'Guest User';
      userName.style.color = 'var(--fg-text)';
      console.log('👤 Guest user name set');
    }

    if (accountEmail) {
      accountEmail.textContent = 'Using app without account';
      console.log('📧 Guest mode email text set');
    }

    if (syncIndicator && syncText) {
      syncIndicator.classList.remove('active', 'error');
      syncIndicator.classList.add('guest');
      syncText.textContent = 'Guest Mode';
      console.log('🔄 Guest mode sync status set');
    }

    console.log('✅ Guest mode UI updated successfully');
  } else {
    // Show sign-in button, hide user account section
    if (authBtn) {
      authBtn.classList.remove('hidden');
      authBtn.textContent = 'Sign In';
      authBtn.style.backgroundColor = '';
      authBtn.style.color = '';
      authBtn.title = 'Sign In to Hintify';
      console.log('✅ Sign-in button shown');
    }
    if (userAccountSection) {
      userAccountSection.classList.add('hidden');
      console.log('🚫 User account section hidden');
    }

    console.log('❌ User not authenticated - sign-in UI shown');
  }
}

// Handle sign-in button click with improved error handling
function handleSignIn() {
  console.log('🔐 Sign in requested from main app - opening browser directly');

  // Use IPC to tell main process to open browser for authentication
  const { ipcRenderer } = require('electron');
  ipcRenderer.invoke('open-browser-auth').then((result) => {
    if (result.success) {
      updateStatus('Please complete sign-in in your browser...');

      // Set a timeout to offer guest mode if authentication takes too long
      setTimeout(() => {
        if (!userInfo) {
          console.log('⏰ Authentication timeout - offering guest mode');
          showAuthenticationTimeoutDialog();
        }
      }, 60000); // 60 seconds timeout

    } else {
      console.error('❌ Failed to open browser:', result.error);
      handleAuthenticationError('Failed to open browser for sign-in', result.error);
    }
  }).catch((error) => {
    console.error('❌ Browser auth error:', error);
    handleAuthenticationError('Failed to open browser for sign-in', error.message);
  });
}

// Handle authentication errors gracefully
function handleAuthenticationError(message, error) {
  updateStatus('Sign-in failed');

  // Show error dialog with option to continue as guest
  const errorDialog = document.createElement('div');
  errorDialog.className = 'auth-error-dialog';
  errorDialog.innerHTML = `
    <div class="error-dialog-content">
      <h3>🚫 Sign-in Failed</h3>
      <p>${message}</p>
      <p class="error-details">Error: ${error}</p>
      <div class="error-actions">
        <button id="retry-auth-btn" class="btn btn-primary">Try Again</button>
        <button id="continue-guest-error-btn" class="btn btn-secondary">Continue as Guest</button>
      </div>
    </div>
  `;

  document.body.appendChild(errorDialog);

  // Add event listeners
  document.getElementById('retry-auth-btn')?.addEventListener('click', () => {
    document.body.removeChild(errorDialog);
    handleSignIn();
  });

  document.getElementById('continue-guest-error-btn')?.addEventListener('click', () => {
    document.body.removeChild(errorDialog);
    enableGuestMode();
  });
}

// Show authentication timeout dialog
function showAuthenticationTimeoutDialog() {
  const timeoutDialog = document.createElement('div');
  timeoutDialog.className = 'auth-timeout-dialog';
  timeoutDialog.innerHTML = `
    <div class="timeout-dialog-content">
      <h3>⏰ Taking a while?</h3>
      <p>Authentication is taking longer than expected. You can continue using the app while waiting.</p>
      <div class="timeout-actions">
        <button id="wait-auth-btn" class="btn btn-secondary">Keep Waiting</button>
        <button id="continue-guest-timeout-btn" class="btn btn-primary">Continue as Guest</button>
      </div>
    </div>
  `;

  document.body.appendChild(timeoutDialog);

  // Add event listeners
  document.getElementById('wait-auth-btn')?.addEventListener('click', () => {
    document.body.removeChild(timeoutDialog);
  });

  document.getElementById('continue-guest-timeout-btn')?.addEventListener('click', () => {
    document.body.removeChild(timeoutDialog);
    enableGuestMode();
  });
}

// Save question and answer to database (works in both authenticated and guest mode)
async function saveQuestionAnswer(questionText, answerText, questionType = 'text', imageData = null, metadata = null, processingTime = null) {
  if (!userInfo && !window.isGuestMode) {
    console.warn('Cannot save Q&A: user not authenticated and not in guest mode');
    return false;
  }

  // In guest mode, we don't save to database but still return success for UI consistency
  if (window.isGuestMode && !userInfo) {
    console.log('📝 Guest Mode: Q&A would be saved if authenticated:', {
      questionText: questionText.substring(0, 100) + '...',
      questionType,
      hasImageData: !!imageData
    });
    return true; // Return success for UI consistency
  }

  try {
    const data = {
      questionText,
      answerText,
      questionType,
      aiProvider: currentConfig.provider,
      aiModel: currentConfig.provider === 'ollama' ? currentConfig.ollama_model : currentConfig.gemini_model,
      imageData,
      metadata,
      processingTime
    };

    const result = await ipcRenderer.invoke('save-question-answer', data);

    if (result.success) {
      console.log('✅ Question and answer saved to database:', result);

      // Log the activity
      await logActivity('question_answer', 'saved', {
        questionId: result.questionId,
        answerId: result.answerId,
        questionType,
        aiProvider: data.aiProvider
      });

      return true;
    } else {
      console.error('❌ Failed to save Q&A to database:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error saving Q&A to database:', error);
    return false;
  }
}

// Log activity to database (works in both authenticated and guest mode)
async function logActivity(featureName, action, details = null) {
  if (!userInfo && !window.isGuestMode) {
    console.warn('Cannot log activity: user not authenticated and not in guest mode');
    return;
  }

  try {
    if (userInfo) {
      // Authenticated user - log to database
      await ipcRenderer.invoke('log-activity', featureName, action, details);
    } else if (window.isGuestMode) {
      // Guest mode - log locally for debugging/analytics
      console.log(`📊 Guest Activity: ${featureName}.${action}`, details || '');
    }
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Transfer data to Portal
async function transferDataToPortal() {
  if (!userInfo) {
    alert('Please sign in first to transfer your data.');
    return;
  }

  try {
    showLoading(true, 'Transferring data to Portal...');

    const result = await ipcRenderer.invoke('transfer-data-to-portal');

    showLoading(false);

    if (result.success) {
      alert(
        result.queued
          ? 'Data queued for transfer when Portal becomes available.'
          : 'Data successfully transferred to Portal!'
      );
    } else {
      alert(`Failed to transfer data: ${result.error}`);
    }
  } catch (error) {
    showLoading(false);
    console.error('Data transfer error:', error);
    alert('Failed to transfer data. Please try again later.');
  }
}

// Export user data
async function exportUserData(format = 'json') {
  if (!userInfo) {
    alert('Please sign in first to export your data.');
    return;
  }

  try {
    showLoading(true, `Exporting data as ${format.toUpperCase()}...`);

    const result = await ipcRenderer.invoke('export-user-data', format);

    showLoading(false);

    if (result.success) {
      // Create download link
      const blob = new Blob([result.data], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Data exported successfully!');
    } else {
      alert(`Failed to export data: ${result.error}`);
    }
  } catch (error) {
    showLoading(false);
    console.error('Data export error:', error);
    alert('Failed to export data. Please try again later.');
  }
}

// Get user history
async function getUserHistory() {
  if (!userInfo) {
    console.warn('Cannot get history: user not authenticated');
    return [];
  }

  try {
    const result = await ipcRenderer.invoke('get-user-history', 50);

    if (result.success) {
      return result.history;
    } else {
      console.error('Failed to get user history:', result.error);
      return [];
    }
  } catch (error) {
    console.error('Error getting user history:', error);
    return [];
  }
}

// Handle user logout
function handleLogout() {
  console.log('🚪 User logout requested');

  // Clear auth data
  store.set('user_authenticated', false);
  store.delete('user_info');

  // Update UI
  userInfo = null;
  updateAuthUI(false);

  // Send message to main process
  ipcRenderer.send('user-logged-out');
}

// Show history modal
async function showHistoryModal() {
  const modal = document.getElementById('history-modal');
  const historyContent = document.getElementById('history-content');

  if (!modal || !historyContent) return;

  // Show modal
  modal.classList.remove('hidden');

  // Show loading
  historyContent.innerHTML = '<div class="loading-message">Loading history...</div>';

  try {
    const history = await getUserHistory();

    if (history.length === 0) {
      historyContent.innerHTML = `
        <div class="empty-history">
          <h4>No History Yet</h4>
          <p>Start asking questions and generating hints to see your history here!</p>
        </div>
      `;
      return;
    }

    // Group questions and answers
    const groupedHistory = {};
    history.forEach(item => {
      if (!groupedHistory[item.question_id]) {
        groupedHistory[item.question_id] = {
          question: item.question_text,
          questionType: item.question_type,
          questionDate: item.question_created_at,
          answers: []
        };
      }

      if (item.answer_text) {
        groupedHistory[item.question_id].answers.push({
          text: item.answer_text,
          provider: item.ai_provider,
          model: item.ai_model,
          date: item.answer_created_at
        });
      }
    });

    // Generate HTML
    let historyHtml = '';
    Object.values(groupedHistory).forEach(item => {
      const formattedDate = new Date(item.questionDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      historyHtml += `
        <div class="history-item">
          <div class="history-question">${escapeHtml(item.question)}</div>
          ${item.answers.map(answer => `
            <div class="history-answer">${escapeHtml(answer.text)}</div>
            <div class="history-meta">
              <span class="history-date">${formattedDate}</span>
              <span class="history-provider">${answer.provider || 'Unknown'}</span>
            </div>
          `).join('')}
        </div>
      `;
    });

    historyContent.innerHTML = historyHtml;

    // After injecting history, render any math expressions present
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(historyContent, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false,
          trust: true
        });
      }
    } catch (e) { console.warn('KaTeX render (history) failed:', e); }

  } catch (error) {
    console.error('Failed to load history:', error);
    historyContent.innerHTML = `
      <div class="empty-history">
        <h4>Error Loading History</h4>
        <p>Unable to load your question history. Please try again later.</p>
      </div>
    `;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load app images with proper paths
function loadAppImages() {
  try {
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
    const basePath = isDev ? '../../assets/' : (process.resourcesPath + '/assets/');

    const assetUrl = (filename) => {
      if (isDev) return `../../assets/${filename}`;
      try {
        const full = path.join(basePath, filename);
        // Convert to file:// URL for absolute paths
        if (/^[A-Za-z]:\\/.test(full)) {
          // Windows path -> file URL
          return 'file:///' + full.replace(/\\/g, '/');
        }
        if (full.startsWith('/')) return `file://${full}`;
        return full;
      } catch { return `../../assets/${filename}`; }
    };
    const setWithFallback = (img, filename) => {
      if (!img) return;
      img.onerror = () => {
        try { img.src = `../../assets/${filename}`; } catch {}
      };
      img.src = assetUrl(filename);
    };

    // Set logo image
    const appLogo = document.getElementById('app-logo');
    setWithFallback(appLogo, 'logo_m.png');

    // Set capture icon image
    const captureIcon = document.getElementById('capture-icon');
    if (captureIcon) setWithFallback(captureIcon, 'screenshot-64.png');

    // Set settings icon image
    const settingsIcon = document.getElementById('settings-icon');
    if (settingsIcon) setWithFallback(settingsIcon, 'settings-94.png');
  } catch (error) {
    console.error('Error loading app images:', error);
    // Fallback: try to load with relative paths
    const appLogo = document.getElementById('app-logo');
    if (appLogo) appLogo.src = '../../assets/logo_m.png';
    const captureIcon = document.getElementById('capture-icon');
    if (captureIcon && captureIcon.tagName.toLowerCase() === 'img') captureIcon.src = '../../assets/screenshot-64.png';
    const settingsIcon = document.getElementById('settings-icon');
    if (settingsIcon && settingsIcon.tagName.toLowerCase() === 'img') settingsIcon.src = '../../assets/settings-94.png';
  }
}

// Check system readiness and show warnings if needed
async function checkSystemReadiness() {
  const config = loadConfig();

  // If onboarding wasn't completed, this shouldn't run the main app
  if (!config.onboarding_completed) {
    displayHints('⚠️ Please complete the initial setup first. Go to the app menu and select "Run Setup Again".');
    return;
  }

  // Check if AI provider is available
  await checkAIProviderStatus();

  // Check OCR availability
  await checkOCRStatus();
}

// Check AI Provider status
async function checkAIProviderStatus() {
  const config = loadConfig();

  if (config.provider === 'ollama') {
    try {
      await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
      updateStatus('Ready - Ollama connected');
    } catch (error) {
  console.warn('Ollama status check failed:', error && (error.message || error));
      updateStatus('Warning: Ollama not running');
      displayHints(`
        <div class="warning-message">
          <h3>⚠️ Ollama Not Running</h3>
          <p>Ollama is not currently running. To use SnapAssist AI:</p>
          <ul>
            <li>Open Ollama application, or</li>
            <li>Run <code>ollama serve</code> in terminal</li>
            <li>Or go to Settings and switch to Gemini</li>
          </ul>
        </div>
      `);
    }
  } else if (config.provider === 'gemini') {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      updateStatus('Warning: Gemini API key not set');
      displayHints(`
        <div class="warning-message">
          <h3>⚠️ Gemini API Key Missing</h3>
          <p>Please configure your Gemini API key in Settings to use Google's AI.</p>
          <p>Get your free API key from <a href="#" onclick="require('electron').shell.openExternal('https://makersuite.google.com/app/apikey')">Google AI Studio</a></p>
        </div>
      `);
    } else {
      updateStatus('Ready - Gemini configured');
    }
  }
}

// Check OCR status
async function checkOCRStatus() {
  const tesseractAvailable = await checkTesseractAvailable();

  if (!tesseractAvailable) {
    // Native tesseract not present; we'll rely on Tesseract.js node build
    let nodeWorkersOk = true;
    try { require('worker_threads'); } catch { nodeWorkersOk = false; }

    if (!nodeWorkersOk) {
      console.warn('OCR fallback warning: Node worker_threads not available. Built-in OCR may not start on this system.');
    } else {
      console.log('OCR fallback: Using Tesseract.js (Node build)');
    }
  }
}

// Update status text
function updateStatus(text) {
  const statusEl = document.getElementById('status-text');
  if (statusEl) {
    statusEl.textContent = text;
  }
}

// Update mode toggle UI (bottom status bar)
function syncModeToggleUI(cfg) {
  try {
    const input = document.getElementById('mode-toggle');
    const label = document.getElementById('mode-toggle-text');
    if (!input || !label) return;
    input.checked = !!cfg.advanced_mode;
    label.textContent = cfg.advanced_mode ? 'Advanced Mode' : 'Standard Mode';
    label.title = cfg.advanced_mode ? 'Advanced Mode (Direct Vision): send screenshots to the AI without OCR' : 'Standard Mode (OCR): extract text first, then ask the AI';
  } catch {}
}

// Update provider text
function updateProvider(provider, model) {
  const providerEl = document.getElementById('provider-text');
  if (providerEl) {
    providerEl.textContent = `Provider: ${provider} (${model})`;
  }
}

// Show/hide loading overlay
function showLoading(show = true, text = 'Processing...') {
  const overlay = document.getElementById('loading-overlay');

  const loadingText = document.getElementById('loading-text');

  if (overlay) {
    if (show) {
      overlay.classList.remove('hidden');
      if (loadingText) loadingText.textContent = text;
    } else {
      overlay.classList.add('hidden');
    }
  }
}

// Display hints in the UI
function displayHints(hintsText) {
  const hintsDisplay = document.getElementById('hints-display');
  if (!hintsDisplay) return;

  // Clear existing content
  hintsDisplay.innerHTML = '';

  if (!hintsText || hintsText.trim().startsWith('[') || hintsText.includes('Error')) {
    // Show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <h3>Error Processing Image</h3>
      <p>${hintsText || 'Failed to generate hints. Please try again.'}</p>
    `;
    hintsDisplay.appendChild(errorDiv);
    return;
  }

  // Merge multi-line $$...$$ math blocks so they stay within a single element
  const mergeMathBlocks = (text) => {
    const src = String(text || '');
    const rawLines = src.split('\n');
    const out = [];
    let inBlock = false;
    let buf = '';
    for (const ln of rawLines) {
      if (!inBlock) {
        const cc = (ln.match(/\$\$/g) || []).length;
        if (cc % 2 === 1) { // enters a $$ block
          inBlock = true;
          buf = ln;
        } else {
          out.push(ln);
        }
      } else {
        buf += `\n${ln}`;
        const total = (buf.match(/\$\$/g) || []).length;
        if (total % 2 === 0) { // balanced -> close
          out.push(buf);
          buf = '';
          inBlock = false;
        }
      }
    }
    if (buf) out.push(buf);
    return out.filter(l => l && l.trim());
  };

  const lines = mergeMathBlocks(hintsText);
  const parsedHints = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const hintMatch = trimmed.match(/^(Hint\s+\d+:)\s*(.*)$/i);

    if (hintMatch) {
      // This is a hint line
      const hintDiv = document.createElement('div');
      hintDiv.className = 'hint-item fade-in';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'hint-label';
      labelDiv.textContent = hintMatch[1];

  const textDiv = document.createElement('div');
  textDiv.className = 'hint-text';
  // Keep plain text; KaTeX auto-render will scan and transform $...$ / $$...$$
  textDiv.textContent = hintMatch[2];

      hintDiv.appendChild(labelDiv);
      hintDiv.appendChild(textDiv);
      hintsDisplay.appendChild(hintDiv);
      parsedHints.push({ label: hintMatch[1], text: hintMatch[2] });
    } else if (trimmed.toLowerCase().includes('now try') ||
               trimmed.toLowerCase().includes('work carefully') ||
               trimmed.toLowerCase().includes('complete')) {
      // This is encouragement text
      const encDiv = document.createElement('div');
      encDiv.className = 'encouragement fade-in';

  const encText = document.createElement('div');
      encText.className = 'encouragement-text';
  encText.textContent = trimmed;

      encDiv.appendChild(encText);
      hintsDisplay.appendChild(encDiv);
    } else {
      // Regular text
      const textDiv = document.createElement('div');
      textDiv.className = 'hint-text fade-in';
      textDiv.style.marginBottom = '12px';
      textDiv.textContent = trimmed;
      hintsDisplay.appendChild(textDiv);
    }
  });
  // Place one action bar for the entire hint set
  if (parsedHints.length) {
    const footer = document.createElement('div');
    footer.className = 'hints-footer fade-in';
    const qText = (window.currentQuestionData?.questionText || window.currentQuestionData?.answerText || '') || '';
    footer.appendChild(createHintActions({ hints: parsedHints, questionText: qText }));
    hintsDisplay.appendChild(footer);
    if (window.lucide && window.lucide.createIcons) { window.lucide.createIcons(); }
  }
  // Render LaTeX math if KaTeX auto-render is available
  try {
    const anyHasMath = /\$\$[\s\S]*?\$\$|(^|[^\\])\$[^\n]*?\$(?!\w)/.test(hintsText || '');
    if (anyHasMath && window.renderMathInElement) {
      window.renderMathInElement(hintsDisplay, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        trust: true,
        macros: { '\\RR': '\\mathbb{R}' }
      });
    }
  } catch (e) {
    // Non-fatal if math rendering fails
    console.warn('KaTeX render failed:', e);
  }
}

// Build tiny action bar for a hint (used by displayHints)
function createHintActions({ hints, questionText }) {
  const bar = document.createElement('div');
  bar.className = 'hint-actions';
  bar.style.position = 'relative';

  const header = questionText && String(questionText).trim()
    ? `Question:\n${String(questionText).trim()}\n\n`
    : '';
  const flatList = hints.map(h => `${h.label} ${h.text}`).join('\n');
  const formattedAll = `${header}Hints:\n${flatList}`;

  // Small helper: open share target in default browser
  const openShare = (type) => {
    const encBody = encodeURIComponent(formattedAll);
    const encSubject = encodeURIComponent('Hintify     Hints');
    let url = '';
    switch (type) {
      case 'gmail':
        url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encSubject}&body=${encBody}`; break;
      case 'mailto':
        url = `mailto:?subject=${encSubject}&body=${encBody}`; break;
      case 'whatsapp':
        url = `https://wa.me/?text=${encBody}`; break;
      case 'telegram':
        url = `https://t.me/share/url?text=${encBody}`; break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encBody}`; break;
      default:
        url = '';
    }
    if (url) {
      try { require('electron').shell.openExternal(url); } catch {}
    }
  };

  const toggleShareMenu = (anchor) => {
    const existing = document.getElementById('share-menu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'share-menu';
    menu.style.position = 'absolute';
    menu.style.right = '0';
    menu.style.top = '40px';
    menu.style.background = 'var(--panel-bg, #1f1f1f)';
    menu.style.border = '1px solid var(--border, #333)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '8px';
    menu.style.boxShadow = '0 6px 24px rgba(0,0,0,0.35)';
    menu.style.zIndex = '1000';

    const mkItem = (key, label) => {
      const it = document.createElement('button');
      it.className = 'btn btn-secondary';
      it.style.display = 'block';
      it.style.width = '100%';
      it.style.margin = '4px 0';
      it.textContent = label;
      it.addEventListener('click', (e) => { e.stopPropagation(); openShare(key); menu.remove(); });
      return it;
    };

    menu.appendChild(mkItem('gmail', 'Gmail'));
    menu.appendChild(mkItem('mailto', 'Default Mail'));
    menu.appendChild(mkItem('whatsapp', 'WhatsApp'));
    menu.appendChild(mkItem('telegram', 'Telegram'));
    menu.appendChild(mkItem('twitter', 'Twitter / X'));

    bar.appendChild(menu);

    const onDoc = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', onDoc); } };
    setTimeout(() => document.addEventListener('click', onDoc), 0);
  };

  const mkBtn = (action, title, iconName) => {
    const b = document.createElement('button');
    b.className = 'icon-btn';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.dataset.action = action;
    b.innerHTML = `<i data-lucide="${iconName}"></i>`;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        switch (action) {
          case 'copy':
            await navigator.clipboard.writeText(formattedAll);
            updateStatus('All hints copied');
            break;
          case 'speak': {
            const u = new SpeechSynthesisUtterance(flatList);
            window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
            updateStatus('Speaking all hints...');
            break; }
          case 'like':
          case 'dislike':
            await logActivity('review', action, { total_hints: hints.length, total_length: flatList.length });
            updateStatus(action === 'like' ? 'Marked helpful' : 'Marked unhelpful');
            break;
          case 'regen': {
            if (!currentQuestionData) { updateStatus('Nothing to regenerate'); break; }
            showLoading(true, 'Regenerating...');
            const start = Date.now();
            try {
              const regenPrompt = buildRegenerationPrompt(
                currentQuestionData.questionText || currentQuestionData.answerText,
                currentQuestionData.metadata?.question_type || 'text',
                currentQuestionData.metadata?.difficulty || 'Medium',
                currentQuestionData.answerText || ''
              );
              const cfg = currentConfig;
              let newHints;
              if (cfg.provider === 'ollama') {
                newHints = await queryOllama(regenPrompt, cfg.ollama_model);
              } else if (cfg.provider === 'gemini') {
                const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
                newHints = apiKey ? await queryGemini(regenPrompt, cfg.gemini_model, apiKey) : '[Setup] Gemini API key not set. Please configure in Settings.';
              } else {
                newHints = '[Setup] No valid AI provider configured.';
              }
              // Update context for subsequent actions/saves
              currentQuestionData = {
                ...currentQuestionData,
                answerText: newHints,
                metadata: { ...currentQuestionData.metadata, regenerated: true, previous_hints_length: (flatList || '').length },
                processingTime: Date.now() - start
              };
              displayHints(newHints);
            } finally { showLoading(false); }
            break; }
          case 'share':
            toggleShareMenu(b);
            break;
        }
      } catch (err) { updateStatus('Action failed'); }
    });
    bar.appendChild(b);
  };

  // Icons: like, dislike, copy, speak, regenerate, share (Lucide)
  mkBtn('like','Liked the hints','thumbs-up');
  mkBtn('dislike','Disliked the hints','thumbs-down');
  mkBtn('copy','Copy all hints','clipboard');
  mkBtn('speak','Speak all hints','volume-2');
  mkBtn('regen','Regenerate hints','refresh-ccw');
  mkBtn('share','Share','share-2');

  // Render Lucide icons if available
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }

  return bar;
}

// Classify question type (simplified version of Python logic)
function classifyQuestion(text) {
  const mcqPattern = /\([A-D]\)|\b\d\)\b/;
  if (mcqPattern.test(text)) {
    return 'MCQ';
  }
  if (text.includes('?') || /\b(solve|find|calculate|prove|evaluate)\b/i.test(text)) {
    return 'Descriptive';
  }
  return 'Not a Question';
}

// Detect difficulty
function detectDifficulty(text) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 15) return 'Easy';
  if (wordCount < 40) return 'Medium';
  return 'Hard';
}

// Build prompt for AI
function buildPrompt(text, qtype, difficulty) {
  return `You are Hintify, a study buddy for students.

The following text was extracted from a screenshot:
${text}

Classification:
- Type: ${qtype}
- Difficulty: ${difficulty}

Your role:
- Provide ONLY hints, NEVER the exact answer or final numeric/option.
- Do NOT solve the question fully.
- Do NOT mention which option is correct.
- Do NOT provide the final numeric value, simplified expression, or boxed result.
- Instead, give guiding clues that push the student to think.

Response format:
Always output between 3 to 5 hints in this style:
Hint 1: ...
Hint 2: ...
Hint 3: ...
(Hint 4 and Hint 5 only if needed)

Guidelines for hints:
- Focus on relevant formulae, rules, and methods.
- Use progressive layers: concept → formula → setup → approach → final nudge.
- Each hint should guide without completing the solution.
- Keep hints concise for faster responses.

Math formatting:
- Prefer LaTeX notation for mathematical expressions.
- Use $...$ for inline math and $$...$$ for block equations.
- Examples: $a^2+b^2=c^2$, $x_{i}$, $\\frac{dy}{dx}$, $\\int_{0}^{1} x^2\\,dx$, $$\\lim_{n\\to\\infty} \\frac{n}{n+1}$$, matrices with \\begin{bmatrix} ... \\end{bmatrix}.
- For chemical formulas/equations, you may use \\ce{H2O + CO2 -> H2CO3} when relevant.

End with an encouragement such as:
"Now try completing the final step on your own."
or
"Work carefully through the last step to see which option fits."

If the text is not a valid question, reply only:
⚠️ This does not appear to be a question.`;
}

// Improved system prompt specifically for REGENERATION with higher quality hints
function buildRegenerationPrompt(text, qtype, difficulty, previousHints = '') {
  return `You are Hintify, regenerating a new, higher‑quality set of HINTS for the same problem.

Objective:
- Produce a fresh set of 4–6 concise, progressively detailed hints that are MORE thorough and structured than before.
- DO NOT reveal the final answer, numeric result, or which option is correct.
- Treat this as a second pass: clarify concepts, add gentle scaffolding, and include tiny worked fragments (setup only) without completing the solution.

Problem text:
${text}

Classification:
- Type: ${qtype}
- Difficulty: ${difficulty}

Earlier hints (for reference only; avoid repeating verbatim):
${previousHints}

Requirements for regenerated hints:
- Start from prerequisite concept(s) → formula(s) → setup → approach → final nudge.
- Add context or micro‑examples when helpful (e.g., define symbols, typical pitfalls, units) but keep each hint under 2 sentences.
- Prefer numbered hints strictly in the form:
  Hint 1: ...\n  Hint 2: ...\n  Hint 3: ...\n  (Optionally Hint 4..6)
- Absolutely avoid: final value, option letters, or step that directly completes the problem.
- End with one short encouragement line.

Math formatting:
- Prefer LaTeX notation for formulas, calculus symbols, vectors/matrices, and scientific notation.
- Use $...$ for inline math and $$...$$ for block equations.
- Include units and symbols clearly, e.g., $v=\\frac{\\Delta x}{\\Delta t}$, $$\\int e^{x}\\,dx$$, matrix forms \\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}, limits/derivatives, and \\ce{...} for chemical equations if applicable.

Output format (TEXT ONLY):
Hint 1: ...\nHint 2: ...\nHint 3: ...\n(Hint 4..6 if useful)\n<encouragement line>`;
}

// Specialized prompt for direct image hinting (no OCR)
function buildImageHintPrompt() {
  return `You are Hintify, a study buddy for students.

You will receive a screenshot of a problem/question. Your job is to provide ONLY hints without solving it or revealing the final answer.

Rules:
- Do NOT give the final numeric value or the exact option letter.
- Do NOT fully solve the problem.
- Provide 3–5 concise, progressively deeper hints.

Formatting:
Hint 1: ...
Hint 2: ...
Hint 3: ...
(Hint 4 and Hint 5 if helpful)

Guidance:
- Start from concept → formula → setup → approach → final nudge.
- Prefer LaTeX for math, using $...$ for inline and $$...$$ for blocks (e.g., $\\frac{dy}{dx}$, $$\\int x^2\\,dx$$, matrices with \\begin{bmatrix}..\\end{bmatrix}).
- For chemistry, you may use \\ce{...} notation.
- Keep hints short (under 2 sentences each) but helpful.

End with a one-line encouragement (e.g., "Now try the final step yourself.")`;
}


// Query Ollama
async function queryOllama(prompt, model) {
  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: model,
      prompt: prompt,
      stream: false
    });

    return response.data.response || '[LLM Error] Empty response from Ollama';
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return '[Setup] Ollama not running. Please start Ollama first.';
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Query Ollama with an image (vision models)
async function queryOllamaWithImage(prompt, model, imageBuffer) {
  try {
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const response = await axios.post('http://localhost:11434/api/generate', {
      model,
      prompt,
      images: [base64],
      stream: false
    });
    return response.data.response || '[LLM Error] Empty response from Ollama (vision)';
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return '[Setup] Ollama not running. Please start Ollama first.';
    }
    if (error.response?.status === 400 || error.response?.status === 404) {
      return '[Setup] The selected Ollama model may not support images. Try a vision-capable model (e.g., granite3.2-vision:2b, llava, llama3.2-vision) or switch provider in Settings.';
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Query Gemini
async function queryGemini(prompt, model, apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      }
    });

    const candidates = response.data.candidates || [];
    if (!candidates.length) {
      return '[LLM Error] Empty response from Gemini';
    }

    const parts = candidates[0]?.content?.parts || [];
    const texts = parts.map(part => part.text).filter(Boolean);

    return texts.join('\n').trim() || '[LLM Error] Empty response from Gemini';
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      // Fallback to gemini-1.5-flash
      if (model !== 'gemini-1.5-flash') {
        return queryGemini(prompt, 'gemini-1.5-flash', apiKey);
      }
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Query Gemini with an image (vision). Falls back to a known multimodal model if needed.
async function queryGeminiWithImage(prompt, model, apiKey, imageBuffer) {
  async function callModel(m) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/png', data: base64 } },
          { text: prompt }
        ]
      }]
    };
    const resp = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey } });
    const candidates = resp.data.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    const texts = parts.map(p => p.text).filter(Boolean);
    return texts.join('\n').trim() || '[LLM Error] Empty response from Gemini (vision)';
  }
  try {
    return await callModel(model);
  } catch (error) {
    // If model doesn't support images, try a known multimodal fallback
    if (error.response?.status === 404 || error.response?.status === 400 || error.response?.status === 403) {
      const fallback = 'gemini-1.5-flash';
      if (model !== fallback) {
        try { return await callModel(fallback); } catch (e2) { return `[LLM Error] ${e2.message}`; }
      }
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Generate hints using AI
async function generateHints(text, qtype, difficulty, imageData = null, processingStartTime = null) {
  const prompt = buildPrompt(text, qtype, difficulty);
  const config = currentConfig;

  let hints;
  let processingTime = null;

  if (processingStartTime) {
    processingTime = Date.now() - processingStartTime;
  }

  if (config.provider === 'ollama') {
    hints = await queryOllama(prompt, config.ollama_model);
  } else if (config.provider === 'gemini') {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      hints = '[Setup] Gemini API key not set. Please configure in Settings.';
    } else {
      hints = await queryGemini(prompt, config.gemini_model, apiKey);
    }
  } else {
    hints = '[Setup] No valid AI provider configured.';
  }

  // Store current question data for potential saving
  currentQuestionData = {
    questionText: text,
    answerText: hints,
    // Determine question type based on whether image data was used
    questionType: imageData ? 'image_ocr' : 'text',
    imageData: imageData,
    metadata: {
      difficulty: difficulty,
      question_type: qtype,
      timestamp: new Date().toISOString()
    },
    processingTime: processingTime
  };

  // Auto-save Q&A if user is authenticated and hints are valid
  if (userInfo && hints && !hints.startsWith('[') && !hints.includes('Error')) {
    setTimeout(async () => {
      await saveQuestionAnswer(
        currentQuestionData.questionText,
        currentQuestionData.answerText,
        currentQuestionData.questionType,
        currentQuestionData.imageData,
        currentQuestionData.metadata,
        currentQuestionData.processingTime
      );
    }, 100); // Small delay to ensure UI is updated first
  }

  return hints;
}

// Generate hints directly from image (Advanced Mode: no OCR)
async function generateHintsFromImageDirect(imageBuffer, processingStartTime = null) {
  const prompt = buildImageHintPrompt();
  const config = currentConfig;

  let hints;
  let processingTime = null;
  if (processingStartTime) processingTime = Date.now() - processingStartTime;

  if (config.provider === 'ollama') {
    hints = await queryOllamaWithImage(prompt, config.ollama_model, imageBuffer);
  } else if (config.provider === 'gemini') {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      hints = '[Setup] Gemini API key not set. Please configure in Settings.';
    } else {
      hints = await queryGeminiWithImage(prompt, config.gemini_model, apiKey, imageBuffer);
    }
  } else {
    hints = '[Setup] No valid AI provider configured.';
  }

  // Update current question context for saving/sharing
  currentQuestionData = {
    questionText: '[Screenshot input]',
    answerText: hints,
    questionType: 'image_direct',
    imageData: Buffer.from(imageBuffer).toString('base64'),
    metadata: {
      difficulty: 'Unknown',
      question_type: 'Unknown',
      source: 'advanced_mode_image',
      timestamp: new Date().toISOString()
    },
    processingTime
  };

  // Auto-save if user is authenticated and hints look valid
  if (userInfo && hints && !hints.startsWith('[') && !hints.includes('Error')) {
    setTimeout(async () => {
      await saveQuestionAnswer(
        currentQuestionData.questionText,
        currentQuestionData.answerText,
        currentQuestionData.questionType,
        currentQuestionData.imageData,
        currentQuestionData.metadata,
        currentQuestionData.processingTime
      );
    }, 100);
  }

  return hints;
}

// Smart clipboard processing: image if available, otherwise text
async function processClipboardSmart() {
  if (isProcessing) {
    updateStatus('Already processing...');
    return;
  }

  try {
    // Try image first
    const imageBuffer = getClipboardImage();
    if (imageBuffer && imageBuffer.length) {
      await logActivity('clipboard', 'image_found', { image_size: imageBuffer.length });
      return await processImage(imageBuffer);
    }

    // Fallback to text
    const text = (clipboard.readText?.() || '').trim();
    if (text) {
      await logActivity('clipboard', 'text_found', { length: text.length });
      const processingStartTime = Date.now();
      const qtype = classifyQuestion(text);
      const difficulty = detectDifficulty(text);
      updateStatus(`Generating hints... (${qtype}, ${difficulty})`);
      showLoading(true, 'Generating hints...');
      try {
        const hints = await generateHints(text, qtype, difficulty, null, processingStartTime);
        displayHints(hints);
        updateStatus('Ready');
        await logActivity('text_processing', 'completed', {
          question_type: qtype,
          difficulty,
          text_length: text.length,
          total_processing_time_ms: Date.now() - processingStartTime
        });
      } catch (err) {
        console.error('Text processing error:', err);
        displayHints(`[Error] ${err.message}`);
        updateStatus('Error occurred');
        await logActivity('text_processing', 'failed', {
          error: err.message,
          processing_time_ms: Date.now() - processingStartTime
        });
      } finally {
        showLoading(false);
      }
      return;
    }

    // Nothing useful found
    updateStatus('Clipboard empty');
    displayHints('⚠️ Clipboard does not contain an image or text. Copy a question or screenshot, then press Cmd/Ctrl+Shift+V.');
    await logActivity('clipboard', 'empty');
  } catch (e) {
    console.error('Clipboard read error:', e);
    displayHints(`[Error] Clipboard read failed: ${e.message}`);
  }
}

// Check if native Tesseract is available
function checkTesseractAvailable() {
  return new Promise((resolve) => {
    const tesseractProcess = spawn('tesseract', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    tesseractProcess.on('close', (code) => {
      resolve(code === 0);
    });

    tesseractProcess.on('error', () => {
      resolve(false);
    });
  });
}

// Fallback OCR using Tesseract.js with robust Node/Electron configuration
async function extractTextWithTesseractJS(imageBuffer) {
  try {
    updateStatus('Extracting text using built-in OCR...');

    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');

    // Use official entry; avoid brittle deep paths that may not exist in some versions
    const Tesseract = require('tesseract.js');

    // 2) Resolve local tessdata if bundled to avoid remote downloads
    const prodLangDir = path.join(process.resourcesPath || path.join(__dirname, '..', '..'), 'assets', 'tessdata');
    const useLocalLang = !isDev && fs.existsSync(path.join(prodLangDir, 'eng.traineddata'));

    const recognizeOptions = {
      logger: (m) => {
        if (m?.status === 'recognizing text') {
          updateStatus(`OCR Progress: ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
      // Important for Electron: avoid blob URL workers when browser path is used
      workerBlobURL: false
    };
    if (useLocalLang) recognizeOptions.langPath = prodLangDir;

    // 3) Execute recognition
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', recognizeOptions);
    return String(text || '').replace(/\s+/g, ' ').trim();
  } catch (error) {
    // Provide a clean, user-friendly error without leaking internal module paths
    const msg = String(error?.message || error);
    if (/Failed to construct 'Worker'|worker.*not support|V8 platform/i.test(msg)) {
      throw new Error('OCR engine could not start in this environment. You can enable Advanced Mode to send images directly to the AI without OCR.');
    }
    throw new Error(`Fallback OCR failed: ${msg}`);
  }
}

// Extract text from image using native Tesseract with fallback
async function extractTextFromImage(imageBuffer) {
  try {
    updateStatus('Extracting text from image...');

    // First, try native Tesseract
    const tesseractAvailable = await checkTesseractAvailable();

    if (tesseractAvailable) {
      return await extractTextWithNativeTesseract(imageBuffer);
    } else {
  // Use bundled Tesseract.js fallback seamlessly
  updateStatus('Using built-in OCR (no system Tesseract)...');
  return await extractTextWithTesseractJS(imageBuffer);
    }

  } catch (error) {
    return `[OCR Error] ${error.message}`;
  }
}

// Native Tesseract extraction
async function extractTextWithNativeTesseract(imageBuffer) {
  // Create temporary file for the image
  const tempDir = os.tmpdir();
  const tempImagePath = path.join(tempDir, `hintify_temp_${Date.now()}.png`);

  // Write image buffer to temporary file
  fs.writeFileSync(tempImagePath, imageBuffer);

  return new Promise((resolve, reject) => {
    // Use native tesseract command
    const tesseractProcess = spawn('tesseract', [tempImagePath, 'stdout'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let outputText = '';
    let errorText = '';

    tesseractProcess.stdout.on('data', (data) => {
      outputText += data.toString();
    });

    tesseractProcess.stderr.on('data', (data) => {
      errorText += data.toString();
    });

    tesseractProcess.on('close', (code) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError.message);
      }

      if (code === 0) {
        const cleanText = outputText.replace(/\s+/g, ' ').trim();
        resolve(cleanText);
      } else {
        reject(new Error(`Tesseract failed: ${errorText || 'Unknown error'}`));
      }
    });

    tesseractProcess.on('error', (error) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError.message);
      }

      reject(error);
    });
  });
}

// Remove old fallback that required system install; Tesseract.js is used instead

// Get clipboard image
function getClipboardImage() {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return null;
    }
    return image.toPNG();
  } catch (error) {
    console.error('Error reading clipboard:', error);
    return null;
  }
}

// Process clipboard image
async function processClipboardImage() {
  if (isProcessing) {
    updateStatus('Already processing...');
    return;
  }

  // Log clipboard usage
  await logActivity('clipboard', 'accessed');

  const imageBuffer = getClipboardImage();
  if (!imageBuffer) {
    updateStatus('No image found in clipboard');
    displayHints('⚠️ No image found in clipboard. Please copy an image first.');

    // Log clipboard failure
    await logActivity('clipboard', 'no_image_found');
    return;
  }

  // Log successful clipboard image retrieval
  await logActivity('clipboard', 'image_found', {
    image_size: imageBuffer.length
  });

  await processImage(imageBuffer);
}

// Process image (main processing function)
async function processImage(imageBuffer) {
  if (isProcessing) return;

  isProcessing = true;
  const processingStartTime = Date.now();
  showLoading(true, 'Processing image...');
  updateStatus('Processing image...');

  // Log activity start
  await logActivity('image_processing', 'started', {
    image_size: imageBuffer.length,
    timestamp: new Date().toISOString()
  });

  try {
    if (currentConfig.advanced_mode) {
      // Advanced Mode: send image directly to the LLM (no OCR)
      updateStatus('Generating hints (Advanced Mode)...');
      showLoading(true, 'Generating hints...');
      const hints = await generateHintsFromImageDirect(imageBuffer, processingStartTime);
      displayHints(hints);
      updateStatus('Ready');
      await logActivity('image_processing', 'completed', {
        question_type: 'image_direct',
        difficulty: 'Unknown',
        ocr_skipped: true,
        hints_length: (hints || '').length,
        total_processing_time_ms: Date.now() - processingStartTime
      });
    } else {
      // Standard Mode: OCR then text-only prompting
      const text = await extractTextFromImage(imageBuffer);

      if (!text || text.startsWith('[OCR Error]') || text.trim().length === 0) {
        const rawMsg = text?.startsWith('[OCR Error]') ? text : '⚠️ No text found in the image.';

        // If the OCR engine failed to initialize, auto-switch to Advanced Mode and retry with vision
        if (/Failed to construct 'Worker'|V8 platform|worker.*not support|tesseract.*not found|Worker-init failed/i.test(rawMsg)) {
          updateStatus('OCR unavailable. Switching to Advanced Mode...');
          showLoading(true, 'Generating hints (Advanced Mode)...');
          // Persist mode switch
          currentConfig.advanced_mode = true;
          saveConfig({ advanced_mode: true });
          try { syncModeToggleUI(currentConfig); } catch {}

          // Process image directly with the selected vision model
          const hints = await generateHintsFromImageDirect(imageBuffer, processingStartTime);
          displayHints(hints);
          await logActivity('image_processing', 'completed', {
            question_type: 'image_direct',
            difficulty: 'Unknown',
            ocr_skipped: true,
            hints_length: (hints || '').length,
            total_processing_time_ms: Date.now() - processingStartTime
          });
          updateStatus('Ready');
          return;
        }

        // Generic OCR failure message
        let userMsg = [
          '⚠️ OCR could not extract text from the image.',
          '',
          `Details: ${rawMsg}`
        ].join('\n');
        displayHints(userMsg);

        await logActivity('ocr', 'failed', {
          error: rawMsg,
          processing_time_ms: Date.now() - processingStartTime
        });
        return;
      }

      await logActivity('ocr', 'completed', {
        text_length: text.length,
        processing_time_ms: Date.now() - processingStartTime
      });

      const qtype = classifyQuestion(text);
      const difficulty = detectDifficulty(text);

      updateStatus(`Generating hints... (${qtype}, ${difficulty})`);
      showLoading(true, 'Generating hints...');

      const hints = await generateHints(text, qtype, difficulty, imageBuffer.toString('base64'), processingStartTime);
      displayHints(hints);
      updateStatus('Ready');

      await logActivity('image_processing', 'completed', {
        question_type: qtype,
        difficulty: difficulty,
        text_length: text.length,
        hints_length: (hints || '').length,
        total_processing_time_ms: Date.now() - processingStartTime
      });
    }

  } catch (error) {
    console.error('Processing error:', error);
    displayHints(`[Error] ${error.message}`);
    updateStatus('Error occurred');

    // Log processing error
    await logActivity('image_processing', 'failed', {
      error: error.message,
      processing_time_ms: Date.now() - processingStartTime
    });

  } finally {
    isProcessing = false;
    showLoading(false);
  }
}

// Prime macOS Screen Recording permission by briefly requesting a desktop media stream
async function ensureScreenRecordingPermission() {
  try {
    if (process.platform !== 'darwin') return;
    const primed = store.get('screen_permission_primed', false);
    if (primed) return;

    // Try to obtain a minimal screen media stream which will register the app
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    if (!sources || !sources.length) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id
        }
      }
    });

    // Immediately stop to avoid any capture; this just primes TCC registration
    stream.getTracks().forEach(t => t.stop());
    store.set('screen_permission_primed', true);
  } catch (err) {
    // Ignore; the attempt is sufficient to get the app listed in System Settings
    // Users can grant permission there and retry capture
  }
}

// Check current macOS Screen Recording permission status
function getScreenPermissionStatus() {
  try {
    if (process.platform !== 'darwin') return 'granted';
    // Electron exposes 'screen' in getMediaAccessStatus on macOS
    return systemPreferences.getMediaAccessStatus('screen');
  } catch (e) {
    console.warn('Unable to determine screen permission status:', e?.message || e);
    return 'unknown';
  }
}

// Open macOS System Settings to the Screen Recording privacy pane
function openScreenRecordingPreferences() {
  try {
    const { spawn } = require('child_process');
    spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
  } catch (e) {
    console.warn('Failed to open System Settings:', e?.message || e);
  }
}

// Ensure permission is granted or guide the user; returns boolean
async function ensurePermissionOrGuide() {
  if (process.platform !== 'darwin') return true;

  let status = getScreenPermissionStatus();
  // Allow capture when status is granted or unknown/not-determined to trigger the native prompt
  if (status === 'granted' || status === 'not-determined' || status === 'unknown') {
    // Best-effort registration; do not block capture
    try { await ensureScreenRecordingPermission(); } catch {}
    return true;
  }

  // At this point it's explicitly denied/restricted; guide the user
  openScreenRecordingPreferences();

  const message = [
    'Hintify needs Screen Recording permission to capture screenshots.',
  'In System Settings → Privacy & Security → Screen Recording, enable permission for "Hintify".',
    'Then quit and reopen the app to apply the change.'
  ].join('\n\n');

  // Show a simple prompt with options to restart now
  const restartNow = window.confirm(`${message}\n\nWould you like to restart the app now?`);
  if (restartNow) {
    try { await ipcRenderer.invoke('relaunch-app'); } catch {}
  } else {
    updateStatus('Please grant Screen Recording in System Settings, then restart the app.');
  }

  return false;
}

// Trigger screenshot capture
async function triggerCapture() {
  updateStatus('Waiting for screenshot...');

  // On macOS, first ensure the app is registered in Screen Recording permissions
  if (process.platform === 'darwin') {
    // Verify permission and guide user if necessary
    const ok = await ensurePermissionOrGuide();
    if (!ok) return;

    // Also ensure TCC registration in case status just flipped
    await ensureScreenRecordingPermission();

    const { spawn } = require('child_process');
    const capture = spawn('screencapture', ['-i', '-c']);

    capture.on('close', (code) => {
      if (code === 0) {
        // Wait a moment then process clipboard
        setTimeout(() => {
          processClipboardImage();
        }, 1000);
      } else {
        // If user cancelled selection, code is non-zero. If it's due to permission,
        // guide them again.
        const status = getScreenPermissionStatus();
        if (status !== 'granted') {
          updateStatus('Screen Recording permission required');
          openScreenRecordingPreferences();
        } else {
          updateStatus('Screenshot cancelled');
        }
      }
    });
    return;
  }

  if (process.platform === 'win32') {
    // On Windows, we could use PowerShell or other methods
    // For now, just show a message
    updateStatus('Please use Windows Snipping Tool and copy to clipboard');
    displayHints('📸 Please use Windows Snipping Tool (Win+Shift+S) to capture a screenshot, then press Ctrl+Shift+V to process it.');
  } else {
    // Linux and other platforms
    updateStatus('Please copy screenshot to clipboard');
    displayHints('📸 Please capture a screenshot and copy it to clipboard, then press Ctrl+Shift+V to process it.');
  }
}

// Initialize the app with async authentication check
async function initializeApp() {
  console.log('🚀 Initializing Hintify...');

  // Load configuration
  const config = loadConfig();

  // Apply theme
  applyTheme(config.theme);

  // Load images with proper paths
  loadAppImages();

  // Check authentication status (now async)
  const isAuthenticated = await checkAuthStatus();

  // Check if user has made an authentication choice before
  const authChoiceMade = store.get('auth_choice_made', false);
  const guestModeEnabled = store.get('guest_mode_enabled', false);

  console.log('🔍 Auth state check:', { isAuthenticated, authChoiceMade, guestModeEnabled });

  // Always check system readiness (works for both authenticated and guest users)
  checkSystemReadiness();

  // Determine what to show based on authentication state
  if (isAuthenticated) {
    // User is authenticated - show normal authenticated UI
    console.log('✅ User authenticated - showing main app');
  } else if (authChoiceMade && guestModeEnabled) {
    // User previously chose guest mode - restore guest mode
    console.log('🚀 Restoring guest mode from previous session');
    window.isGuestMode = true;
    updateAuthUI(false, null, true);
    const hintsDisplay = document.getElementById('hints-display');
    if (hintsDisplay) {
      const mod = getModKeyLabel();
      hintsDisplay.innerHTML = `
        <div class="hint-item guest-mode-compact">
          <div class="hint-label">🚀 Welcome Back!</div>
          <div class="hint-text">
            You're continuing in guest mode. All core features are available:
            <br><br>
            • Capture screenshots with the 📸 button or <strong>${mod}+Shift+H</strong>
            <br>
            • Process clipboard <em>text or images</em> with <strong>${mod}+Shift+V</strong>
            <br>
            • Bring up the app quickly with the global hotkey <strong>${mod}+Shift+H</strong>
            <br>
            • Get AI-powered hints without spoiling answers
            <br><br>
            <em>Sign in anytime to unlock progress tracking and personalized features!</em>
          </div>
        </div>
      `;
    }
    updateStatus('Ready - Guest Mode');
  } else if (!authChoiceMade) {
    // First time or user hasn't made a choice - show guest mode welcome message
    console.log('❓ No auth choice made - showing guest mode options');
    displayGuestModeMessage();
  } else {
    // Fallback case
    console.log('🔄 Fallback - showing guest mode options');
    displayGuestModeMessage();
  }

  // Update provider display
  updateProvider(config.provider, config.provider === 'ollama' ? config.ollama_model : config.gemini_model);

  // Sync bottom-bar mode toggle
  syncModeToggleUI(config);

  // Set up event listeners
  setupEventListeners();

  updateStatus('Ready');
}

// Set up all event listeners
function setupEventListeners() {
  const captureBtn = document.getElementById('capture-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const authBtn = document.getElementById('auth-btn');
  const modeToggle = document.getElementById('mode-toggle');
  const modeToggleText = document.getElementById('mode-toggle-text');

  if (captureBtn) {
    captureBtn.addEventListener('click', triggerCapture);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', openEmbeddedSettings);
  }

  if (authBtn) {
    authBtn.addEventListener('click', handleSignIn);
  }

  // Mode toggle handler
  if (modeToggle) {
    const applyToggle = (checked) => {
      const newCfg = { advanced_mode: !!checked };
      saveConfig(newCfg);
      syncModeToggleUI({ ...currentConfig, ...newCfg });
      updateStatus(checked ? 'Advanced Mode enabled' : 'Standard Mode enabled');
    };
    // Initialize text in case DOM changed later
    syncModeToggleUI(currentConfig);
    modeToggle.addEventListener('change', (e) => applyToggle(e.target.checked));
    if (modeToggleText) {
      // Clicking the label toggles input automatically; no extra handler needed
    }
  }

  // If main process wants to show sign-in
  ipcRenderer.on('show-sign-in', () => {
    handleSignIn();
  });

  // Setup account menu and modals
  setupAccountMenu();
  setupModals();

  // Account section event listeners
  const viewProfileBtn = document.getElementById('view-profile-btn');
  if (viewProfileBtn) {
    viewProfileBtn.addEventListener('click', () => {
      document.getElementById('account-dropdown').classList.add('hidden');
      showProfileModal();
    });
  }

  const accountSettingsBtn = document.getElementById('account-settings-btn');
  if (accountSettingsBtn) {
    accountSettingsBtn.addEventListener('click', () => {
      document.getElementById('account-dropdown').classList.add('hidden');
      showAccountSettingsModal();
    });
  }

  const syncDataBtn = document.getElementById('sync-data-btn');
  if (syncDataBtn) {
    syncDataBtn.addEventListener('click', () => {
      document.getElementById('account-dropdown').classList.add('hidden');
      handleSyncData();
    });
  }

  const forceSyncBtn = document.getElementById('force-sync-btn');
  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', handleSyncData);
  }

  const clearLocalDataBtn = document.getElementById('clear-local-data-btn');
  if (clearLocalDataBtn) {
    clearLocalDataBtn.addEventListener('click', handleClearLocalData);
  }

  // User menu functionality
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-dropdown');

  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
    });

    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Data transfer button
  const transferDataBtn = document.getElementById('transfer-data-btn');
  if (transferDataBtn) {
    transferDataBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      transferDataToPortal();
    });
  }

  // Export buttons
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      exportUserData('json');
    });
  }

  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      exportUserData('csv');
    });
  }

  // View history button
  const viewHistoryBtn = document.getElementById('view-history-btn');
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      showHistoryModal();
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      handleLogout();
    });
  }

  // History modal functionality
  const historyModal = document.getElementById('history-modal');
  const closeHistoryModal = document.getElementById('close-history-modal');

  if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', () => {
      historyModal.classList.add('hidden');
    });
  }

  if (historyModal) {
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        historyModal.classList.add('hidden');
      }
    });
  }

  // Set up IPC listeners
  ipcRenderer.on('trigger-capture', triggerCapture);
  // Process clipboard (image or text)
  ipcRenderer.on('process-clipboard', processClipboardSmart);

  ipcRenderer.on('config-updated', (event, newConfig) => {
    currentConfig = { ...currentConfig, ...newConfig };
    applyTheme(newConfig.theme);
    updateProvider(newConfig.provider, newConfig.provider === 'ollama' ? newConfig.ollama_model : newConfig.gemini_model);
    syncModeToggleUI(currentConfig);
  });

// Listen for authentication updates
  ipcRenderer.on('auth-status-updated', (event, authData) => {
    console.log('🔄 Auth status updated:', authData);

    if (authData.authenticated && authData.user) {
      console.log('✅ User authenticated via Supabase, updating UI immediately');

      // Clear guest mode if user successfully authenticates
      window.isGuestMode = false;

      // Update local state
      userInfo = authData.user;
      store.set('user_authenticated', true);
      store.set('user_info', authData.user);
      store.set('last_auth_time', new Date().toISOString());
      store.set('auth_choice_made', true);
      store.set('guest_mode_enabled', false);

      // Update UI immediately
      updateAuthUI(true, authData.user);

      // Clear any authentication messages and show system readiness
      checkSystemReadiness();

      updateStatus('Authentication successful! Ready to process images.');

      // Show welcome message
      const userName = authData.user.name || authData.user.firstName || authData.user.email || 'User';
  displayHints(`✅ <strong>Welcome, ${userName}!</strong><br><br>You're now signed in with Supabase and ready to use Hintify. You can start capturing screenshots or processing clipboard images.`);
  // No math here, but if templates change later, keep renderer ready
  try { if (window.renderMathInElement) window.renderMathInElement(document.getElementById('hints-display'), { delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] }); } catch {}

      console.log('🎨 UI updated for authenticated user:', {
        displayName: authData.user.name || authData.user.firstName || authData.user.email,
        email: authData.user.email,
        hasImage: !!(authData.user.imageUrl || authData.user.image_url),
        provider: authData.user.provider
      });

    } else if (authData.error) {
      console.log('❌ Authentication failed:', authData.error);

      // Handle authentication failure gracefully
      handleAuthenticationError('Authentication failed', authData.error);

    } else {
      console.log('🚪 User logged out, updating UI');

      // User logged out
      userInfo = null;
      window.isGuestMode = false;
      store.set('user_authenticated', false);
      store.delete('user_info');

      updateAuthUI(false);
      displayGuestModeMessage();

      updateStatus('Ready');
    }
  });

  // Listen for sign-in request from menu
  ipcRenderer.on('show-sign-in', () => {
    console.log('🔐 Sign-in requested from menu');
    handleSignIn();
  });

  // Open embedded settings when asked by main process (menu or IPC)
  ipcRenderer.on('show-embedded-settings', openEmbeddedSettings);

  // Allow embedded settings (iframe) to request closing the modal
  window.addEventListener('message', (e) => {
    if (e && e.data && e.data.type === 'close-embedded-settings') {
      closeModal('app-settings-modal');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
      e.preventDefault();
      processClipboardSmart();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      triggerCapture();
    }
  });
}

// Handle account menu dropdown
function setupAccountMenu() {
  const accountMenuBtn = document.getElementById('account-menu-btn');
  const accountDropdown = document.getElementById('account-dropdown');

  if (accountMenuBtn && accountDropdown) {
    accountMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      // Bring window to front when opening account menu
      const { ipcRenderer } = require('electron');
      ipcRenderer.invoke('focus-main-window').catch(console.warn);

      accountDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      accountDropdown.classList.add('hidden');
    });

    accountDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// Handle profile modal
function showProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal || !userInfo) return;

  // Update profile modal with user data
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const emailVerifiedBadge = document.getElementById('email-verified-badge');
  const syncStatusBadge = document.getElementById('sync-status-badge');
  const profileProvider = document.getElementById('profile-provider');
  const profileCreated = document.getElementById('profile-created');
  const profileLastSignin = document.getElementById('profile-last-signin');
  const profileSyncStatus = document.getElementById('profile-sync-status');

  if (profileAvatar) {
    profileAvatar.src = userInfo.image_url || userInfo.imageUrl || '../../assets/logo_m.png';
  }
  if (profileName) {
    profileName.textContent = userInfo.name || userInfo.email || 'User';
  }
  if (profileEmail) {
    profileEmail.textContent = userInfo.email || 'No email available';
  }
  if (emailVerifiedBadge) {
    if (userInfo.email_verified) {
      emailVerifiedBadge.classList.remove('hidden');
    } else {
      emailVerifiedBadge.classList.add('hidden');
    }
  }
  if (syncStatusBadge) {
    const status = userInfo.sync_status || 'active';
    syncStatusBadge.className = `badge ${status}`;
    syncStatusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
  if (profileProvider) {
    profileProvider.textContent = userInfo.provider || 'Unknown';
  }
  if (profileCreated && userInfo.account_created_at) {
    profileCreated.textContent = new Date(userInfo.account_created_at).toLocaleDateString();
  }
  if (profileLastSignin && userInfo.last_sign_in_at) {
    profileLastSignin.textContent = new Date(userInfo.last_sign_in_at).toLocaleDateString();
  }
  if (profileSyncStatus) {
    profileSyncStatus.textContent = userInfo.sync_status || 'Active';
  }

  modal.classList.remove('hidden');
  console.log('👤 Profile modal opened');
}

// Handle account settings modal
function showAccountSettingsModal() {
  const modal = document.getElementById('account-settings-modal');
  if (!modal || !userInfo) return;

  modal.classList.remove('hidden');
  console.log('⚙️ Account settings modal opened');
}

// Close modal helper
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Setup modal close handlers
function setupModals() {
  // Profile modal
  const closeProfileBtn = document.getElementById('close-profile-modal');
  if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', () => closeModal('profile-modal'));
  }

  // Account settings modal
  const closeAccountSettingsBtn = document.getElementById('close-account-settings-modal');
  if (closeAccountSettingsBtn) {
    closeAccountSettingsBtn.addEventListener('click', () => closeModal('account-settings-modal'));
  }

  // Close modals when clicking outside
  ['profile-modal', 'account-settings-modal', 'app-settings-modal'].forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(modalId);
        }
      });
    }
  });
}

// Handle sync data manually

// Open Settings inside main window (embedded settings.html via iframe)
function openEmbeddedSettings() {
  const modal = document.getElementById('app-settings-modal');
  const iframe = document.getElementById('app-settings-iframe');
  if (!modal || !iframe) return;
  iframe.src = 'settings.html';
  modal.classList.remove('hidden');
}

// Close button for embedded settings
(() => {
  const btn = document.getElementById('close-app-settings-modal');
  if (btn) {
    btn.addEventListener('click', () => closeModal('app-settings-modal'));
  }
})();

async function handleSyncData() {
  if (!userInfo) {
    alert('Please sign in first to sync your data.');
    return;
  }

  try {
    showLoading(true, 'Syncing account data...');

    // Call the sync function through IPC
    const result = await ipcRenderer.invoke('sync-account-data');

    showLoading(false);

    if (result.success) {
      alert('Account data synced successfully!');
      // Update the sync status in UI
      updateAuthUI(true, userInfo);
    } else {
      alert(`Sync failed: ${result.error}`);
    }
  } catch (error) {
    showLoading(false);
    console.error('Sync error:', error);
    alert('Failed to sync data. Please try again later.');
  }
}

// Handle clear local data
async function handleClearLocalData() {
  if (!userInfo) return;

  const confirmed = confirm(
    'Are you sure you want to clear all local data? This action cannot be undone. Your data in the Portal will remain safe.'
  );

  if (!confirmed) return;

  try {
    showLoading(true, 'Clearing local data...');

    // Sign out user (which clears data)
  ipcRenderer.send('user-logged-out');

    showLoading(false);

    // Reset UI
    userInfo = null;
    updateAuthUI(false);

    alert('Local data cleared successfully. Please sign in again.');
  } catch (error) {
    showLoading(false);
    console.error('Clear data error:', error);
    alert('Failed to clear data. Please try again.');
  }
}

// Display guest mode welcome message in main area
function displayGuestModeMessage() {
  const hintsDisplay = document.getElementById('hints-display');
  if (!hintsDisplay) return;

  const mod = getModKeyLabel();
  hintsDisplay.innerHTML = `
    <div class="welcome-message">
  <h2>🎯 Welcome to Hintify</h2>
      <p>Start using the app right away! Capture screenshots or process clipboard images to get AI-powered hints.</p>
      <div class="instructions">
        <h3>How to Get Started:</h3>
        <ul>
          <li>📸 <strong>Capture Screenshot:</strong> Click the camera button or press <strong>${mod}+Shift+S</strong></li>
          <li>📋 <strong>Process Clipboard (Text or Image):</strong> Copy your question or screenshot and press <strong>${mod}+Shift+V</strong></li>
          <li>⌨️ <strong>Global Hotkey:</strong> Open the app anytime with <strong>${mod}+Shift+H</strong></li>
          <li>🤖 <strong>Get AI Hints:</strong> Receive intelligent hints without spoiling the answer</li>
          <li>⚙️ <strong>Configure AI:</strong> Choose between local Ollama or cloud Gemini in settings</li>
        </ul>
        <div class="guest-mode-actions">
          <button id="continue-guest-btn" class="btn btn-primary">
            <span class="btn-text">Continue as Guest</span>
            <span class="btn-icon">🚀</span>
          </button>
          <button id="sign-in-prompt-btn" class="btn btn-secondary">
            <span class="btn-text">Sign In for More Features</span>
            <span class="btn-icon">🔐</span>
          </button>
        </div>
        <div class="sign-in-benefits">
          <h4>Sign In Benefits:</h4>
          <ul>
            <li>🧠 Track your thinking progress and improvement</li>
            <li>📊 Access your personalized dashboard</li>
            <li>🎯 Get hints tailored to your skill level</li>
            <li>🚀 Sync your preferences across devices</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // Add event listeners for the new buttons
  const continueGuestBtn = document.getElementById('continue-guest-btn');
  const signInPromptBtn = document.getElementById('sign-in-prompt-btn');

  if (continueGuestBtn) {
    continueGuestBtn.addEventListener('click', () => {
      console.log('🚀 User chose to continue as guest');
      enableGuestMode();
    });
  }

  if (signInPromptBtn) {
    signInPromptBtn.addEventListener('click', () => {
      console.log('🔐 User chose to sign in from guest prompt');
      handleSignIn();
    });
  }
}

// Enable guest mode functionality
function enableGuestMode() {
  console.log('🚀 Enabling guest mode...');

  // Set guest mode flag both in memory and persistent storage
  window.isGuestMode = true;
  store.set('guest_mode_enabled', true);
  store.set('auth_choice_made', true); // Mark that user has made a choice

  // Update UI to reflect guest mode
  updateAuthUI(false, null, true); // Pass true for guest mode

  // Show welcome message for guest mode (fix HTML rendering)
  const hintsDisplay = document.getElementById('hints-display');
  if (hintsDisplay) {
    const mod = getModKeyLabel();
    hintsDisplay.innerHTML = `
      <div class="hint-item guest-mode-compact">
        <div class="hint-label">🎯 Guest Mode Activated</div>
        <div class="hint-text">
          You're now using Hintify in guest mode! All core features are available:
          <br><br>
          • Capture screenshots with the 📸 button or <strong>${mod}+Shift+H</strong>
          <br>
          • Process clipboard <em>text or images</em> with <strong>${mod}+Shift+V</strong>
          <br>
          • Bring up the app quickly with the global hotkey <strong>${mod}+Shift+H</strong>
          <br>
          • Get AI-powered hints without spoiling answers
          <br><br>
          <em>Sign in anytime to unlock progress tracking and personalized features!</em>
        </div>
      </div>
    `;
    try { if (window.renderMathInElement) window.renderMathInElement(hintsDisplay, { delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] }); } catch {}
  }

  updateStatus('Ready - Guest Mode');
}

// Display authentication message in main area (legacy - kept for compatibility)
function displayAuthenticationMessage() {
  // Use the new guest mode message instead
  displayGuestModeMessage();
}

// Start clipboard monitoring (simplified)
function startClipboardMonitor() {
  let lastImageHash = null;

  setInterval(() => {
    if (isProcessing) return;

    const imageBuffer = getClipboardImage();
    if (imageBuffer) {
      const crypto = require('crypto');
      const currentHash = crypto.createHash('md5').update(imageBuffer).digest('hex');

      if (currentHash !== lastImageHash) {
        lastImageHash = currentHash;
        // Auto-process new clipboard images (optional behavior)
        // processImage(imageBuffer);
      }
    }
  }, 2000); // Check every 2 seconds
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeApp();
    // Uncomment to enable auto clipboard monitoring
    // startClipboardMonitor();
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    updateStatus('Initialization failed');
    displayHints('❌ Failed to initialize the application. Please refresh and try again.');
  }
});

// ---- Auto-update UI wiring ----
function showUpdateBanner(version) {
  const banner = document.getElementById('update-banner');
  const ver = document.getElementById('update-version');
  if (banner) banner.classList.remove('hidden');
  if (ver && version) ver.textContent = `(v${version})`;
}
function hideUpdateBanner(dismissMs) {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.add('hidden');
  // ask main to remember dismissal window by writing into store via a simple log-activity reuse if needed
  // Simpler: send a custom IPC to main to store; but to avoid new IPC, we skip and let main check periodically
  if (dismissMs) {
    try { ipcRenderer.send('dismiss-update', dismissMs); } catch {}
  }
}
function setUpdateProgress(percent, text) {
  const fill = document.getElementById('update-progress-fill');
  const bar = document.getElementById('update-progress');
  const label = document.getElementById('update-progress-text');
  if (bar) bar.classList.remove('hidden');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.floor(percent || 0)))}%`;
  if (label && text) label.textContent = text;
}

// IPC listeners for updater events
ipcRenderer.on('update-available', (_e, info) => {
  showUpdateBanner(info?.version);
});

// General status updates from main for updater
ipcRenderer.on('update-status', (_e, payload) => {
  const s = payload?.status;
  if (s === 'checking') updateStatus('Checking for updates...');
  else if (s === 'unsupported') updateStatus('Auto-update not supported in this build');
});

// No updates available
ipcRenderer.on('update-not-available', () => {
  updateStatus('You are up to date');
});

try {
  // download progress
  ipcRenderer.on('update-download-progress', (_e, p) => {
    setUpdateProgress(p?.percent || 0, `Downloading... ${Math.floor(p?.percent || 0)}%`);
  });
  // downloaded
  ipcRenderer.on('update-downloaded', (_e, info) => {
    setUpdateProgress(100, 'Ready to install...');
  });
  // errors
  ipcRenderer.on('update-error', (_e, err) => {
    setUpdateProgress(0, 'Update failed');
    updateStatus(`Update error: ${err?.message || err}`);
  });
} catch {}

// Hook buttons
(function wireUpdateButtons(){
  const updateBtn = document.getElementById('update-now-btn');
  const dismissBtn = document.getElementById('dismiss-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      setUpdateProgress(0, 'Preparing download...');
      ipcRenderer.send('download-update');
    });
  }
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      hideUpdateBanner(24*60*60*1000); // 1 day defer
    });
  }
})();

// Optionally trigger a manual check on load (main also checks periodically)
try { ipcRenderer.invoke('check-for-updates'); } catch {}


// Handle app focus
window.addEventListener('focus', () => {
  updateStatus('Ready');
});

// Export functions for potential use
module.exports = {
  processClipboardImage,
  triggerCapture,
  loadConfig,
  saveConfig,
  applyTheme
};
