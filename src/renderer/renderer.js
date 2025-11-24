const { ipcRenderer, clipboard, nativeImage, shell } = require('electron');
const Store = require('electron-store');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const ErrorDisplay = require('./components/ErrorDisplay');
const A11y = require('./a11y');
const { getInstance: getClerkAuthHelper } = require('./clerk-auth-helper');
const NanoBananaService = require('../services/NanoBananaService');

// Initialize store and error display
const store = new Store();
const errorDisplay = new ErrorDisplay();
const nanoBananaService = new NanoBananaService();

// Initialize Clerk authentication helper
const clerkAuth = getClerkAuthHelper();

// Global variables
let currentConfig = {};
let isProcessing = false;
let userInfo = null;
let currentQuestionData = null; // Store current question for saving to database
// Permission state management
class PermissionManager {
  constructor() {
    this.sessionFlags = {
      screenPrefsPrompted: false,
      lastPermissionCheck: 0,
      lastKnownStatus: 'unknown',
      registrationAttempted: false,
      restartDialogShown: false // Track if we've shown the restart dialog this session
    };
    this.PERMISSION_CHECK_INTERVAL = 5000; // 5 seconds minimum between checks
  }

  // Clear all permission-related flags and reset state
  clearPermissionState() {
    console.log('[Permission] Clearing all permission state');
    try {
      store.delete('screen_permission_granted');
      store.delete('screen_permission_primed');
      store.delete('screen_permission_restart_required');
      this.sessionFlags.screenPrefsPrompted = false;
      this.sessionFlags.lastKnownStatus = 'unknown';
      this.sessionFlags.lastPermissionCheck = 0;
    } catch (e) {
      console.error('[Permission] Error clearing permission state:', e);
    }
  }

  // Get cached permission status with validation
  getCachedPermissionStatus() {
    const granted = store.get('screen_permission_granted', false);
    const primed = store.get('screen_permission_primed', false);
    const restartRequired = store.get('screen_permission_restart_required', false);

    return { granted, primed, restartRequired };
  }

  // Update permission status with proper state management and logging
  updatePermissionStatus(status, actuallyGranted = false) {
    permissionLogger.log('info', 'Updating permission status', {
      status,
      actuallyGranted,
      previousStatus: this.sessionFlags.lastKnownStatus
    });

    this.sessionFlags.lastKnownStatus = status;
    this.sessionFlags.lastPermissionCheck = Date.now();

    if (status === 'granted' && actuallyGranted) {
      // Permission is confirmed working
      store.set('screen_permission_granted', true);
      store.set('screen_permission_restart_required', false);
      this.sessionFlags.screenPrefsPrompted = false; // Reset so we can prompt again if needed
      permissionLogger.log('info', 'Permission confirmed as working', { status });
    } else if (status === 'denied') {
      // Permission is explicitly denied
      store.set('screen_permission_granted', false);
      // Don't clear restart_required here - user might have just granted it
      permissionLogger.log('warn', 'Permission explicitly denied', { status });
    } else if (status === 'not-determined') {
      // Permission not yet determined
      store.set('screen_permission_granted', false);
      store.set('screen_permission_restart_required', false);
      permissionLogger.log('info', 'Permission not yet determined', { status });
    } else {
      permissionLogger.log('warn', 'Unknown permission status', { status });
    }
  }

  // Check if we should skip permission checks due to recent check
  shouldSkipPermissionCheck() {
    const now = Date.now();
    const timeSinceLastCheck = now - this.sessionFlags.lastPermissionCheck;
    return timeSinceLastCheck < this.PERMISSION_CHECK_INTERVAL;
  }

  // Reset session flags (useful after app restart or permission changes)
  resetSessionFlags() {
    console.log('[Permission] Resetting session flags');
    this.sessionFlags.screenPrefsPrompted = false;
    this.sessionFlags.lastPermissionCheck = 0;
  }
}

// Initialize permission manager
const permissionManager = new PermissionManager();

// Permission change detection system
class PermissionMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.MONITOR_INTERVAL_MS = 10000; // Check every 10 seconds
    this.lastKnownPermissionState = 'unknown';
  }

  // Start monitoring permission changes
  startMonitoring() {
    if (this.isMonitoring || process.platform !== 'darwin') return;

    console.log('[PermissionMonitor] Starting permission change monitoring');
    this.isMonitoring = true;

    // Initial check
    this.checkPermissionChange();

    // Set up periodic checks
    this.monitorInterval = setInterval(() => {
      this.checkPermissionChange();
    }, this.MONITOR_INTERVAL_MS);
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) return;

    console.log('[PermissionMonitor] Stopping permission change monitoring');
    this.isMonitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  // Check for permission changes
  async checkPermissionChange() {
    try {
      const currentStatus = await getScreenPermissionStatus(true); // Force fresh check

      if (currentStatus !== this.lastKnownPermissionState) {
        console.log(`[PermissionMonitor] Permission state changed: ${this.lastKnownPermissionState} → ${currentStatus}`);

        this.handlePermissionChange(this.lastKnownPermissionState, currentStatus);
        this.lastKnownPermissionState = currentStatus;
      }
    } catch (e) {
      console.error('[PermissionMonitor] Error checking permission change:', e);
    }
  }

  // Handle permission state changes with comprehensive error handling
  handlePermissionChange(oldStatus, newStatus) {
    console.log(`[PermissionMonitor] Handling permission change: ${oldStatus} → ${newStatus}`);

    try {
      if (newStatus === 'granted' && oldStatus !== 'granted') {
        // Permission was just granted
        console.log('[PermissionMonitor] Permission was granted - clearing stale flags');
        permissionManager.updatePermissionStatus('granted', false); // Don't mark as validated yet
        permissionManager.resetSessionFlags();

        // Show user-friendly notification
        updateStatus('✅ Screen Recording permission granted! You can now capture screenshots.');

      } else if (newStatus === 'denied' && oldStatus === 'granted') {
        // Permission was revoked
        console.log('[PermissionMonitor] Permission was revoked');
        permissionManager.clearPermissionState();

        updateStatus('⚠️ Screen Recording permission was revoked. Please re-enable it in System Settings.');

      } else if (newStatus === 'not-determined' && oldStatus === 'denied') {
        // Permission was reset (user might have reset privacy settings)
        console.log('[PermissionMonitor] Permission was reset to not-determined');
        permissionManager.clearPermissionState();

      } else if (newStatus === 'unknown' || oldStatus === 'unknown') {
        // Handle unknown states gracefully
        console.warn('[PermissionMonitor] Unknown permission state detected, clearing cache');
        permissionManager.clearPermissionState();

      } else {
        console.log(`[PermissionMonitor] No action needed for change: ${oldStatus} → ${newStatus}`);
      }
    } catch (e) {
      console.error('[PermissionMonitor] Error handling permission change:', e);
      // Don't let permission change handling errors break the app
      try {
        updateStatus('Permission status update failed - please restart the app if issues persist');
      } catch (statusError) {
        console.error('[PermissionMonitor] Failed to update status:', statusError);
      }
    }
  }

  // Set initial state
  setInitialState(status) {
    this.lastKnownPermissionState = status;
  }
}

// Initialize permission monitor
const permissionMonitor = new PermissionMonitor();

// Debug logging and diagnostics system
class PermissionLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100; // Keep last 100 log entries
  }

  // Log permission events with context
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        platform: process.platform,
        sessionFlags: permissionManager.sessionFlags,
        cachedPermissions: permissionManager.getCachedPermissionStatus()
      }
    };

    this.logs.push(logEntry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console with appropriate level
    const consoleMessage = `[Permission] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMessage, context);
        break;
      case 'warn':
        console.warn(consoleMessage, context);
        break;
      case 'info':
        console.log(consoleMessage, context);
        break;
      case 'debug':
        console.debug(consoleMessage, context);
        break;
      default:
        console.log(consoleMessage, context);
    }
  }

  // Get diagnostic report
  async getDiagnosticReport() {
    try {
      const mainDiagnostics = await ipcRenderer.invoke('get-permission-diagnostics');

      return {
        timestamp: new Date().toISOString(),
        mainProcess: mainDiagnostics,
        renderer: {
          permissionManager: {
            sessionFlags: permissionManager.sessionFlags,
            cachedPermissions: permissionManager.getCachedPermissionStatus()
          },
          permissionMonitor: {
            isMonitoring: permissionMonitor.isMonitoring,
            lastKnownState: permissionMonitor.lastKnownPermissionState
          },
          recentLogs: this.logs.slice(-20) // Last 20 log entries
        }
      };
    } catch (e) {
      return {
        timestamp: new Date().toISOString(),
        error: e.message,
        renderer: {
          permissionManager: {
            sessionFlags: permissionManager.sessionFlags,
            cachedPermissions: permissionManager.getCachedPermissionStatus()
          },
          recentLogs: this.logs.slice(-20)
        }
      };
    }
  }

  // Export logs for debugging
  exportLogs() {
    return {
      timestamp: new Date().toISOString(),
      logs: this.logs,
      summary: {
        totalLogs: this.logs.length,
        errorCount: this.logs.filter(l => l.level === 'error').length,
        warnCount: this.logs.filter(l => l.level === 'warn').length
      }
    };
  }
}

// Initialize permission logger
const permissionLogger = new PermissionLogger();

// Default configuration
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  // When enabled, screenshots are sent directly to the AI model (vision) without OCR
  advanced_mode: true,
  story_mode: false
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
  // Remove all theme classes
  document.body.classList.remove('theme-dark', 'theme-light', 'glassy-mode');
  document.documentElement.classList.remove('theme-glassy');

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
  // New auth button and dropdown elements
  const authBtn = document.getElementById('auth-btn');
  const authBtnIcon = authBtn?.querySelector('.material-icons');
  const authBtnText = authBtn?.querySelector('.btn-text');
  const accountDropdown = document.getElementById('account-dropdown');
  const dropdownAvatar = document.getElementById('account-dropdown-avatar');
  const dropdownAvatarIcon = document.getElementById('account-dropdown-avatar-icon');
  const dropdownName = document.getElementById('account-dropdown-name');
  const dropdownEmail = document.getElementById('account-dropdown-email');

  // Legacy elements (for backward compatibility)
  const userAccountSection = document.getElementById('user-account-section');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const accountEmail = document.getElementById('account-email');
  const syncStatus = document.getElementById('sync-status');
  const syncIndicator = syncStatus?.querySelector('.sync-indicator');
  const syncText = syncStatus?.querySelector('.sync-text');

  console.log('🎨 Updating enhanced auth UI:', { isAuthenticated, userData });

  if (isAuthenticated && userData) {
    // Update auth button to show account info
    if (authBtn) {
      authBtn.classList.add('authenticated');
      authBtn.title = 'Account';

      // Check if user has a profile picture
      const imageUrl = userData.image_url || userData.imageUrl || userData.avatar || userData.picture;

      if (imageUrl) {
        // Replace icon with profile picture
        if (authBtnIcon) {
          // Create or update profile picture element
          let profilePic = authBtn.querySelector('.auth-profile-pic');
          if (!profilePic) {
            profilePic = document.createElement('img');
            profilePic.className = 'auth-profile-pic';
            profilePic.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; object-fit: cover; margin-right: 8px;';
            authBtnIcon.parentNode.insertBefore(profilePic, authBtnIcon);
          }
          profilePic.src = imageUrl;
          profilePic.onerror = () => {
            // Fallback to icon if image fails to load
            profilePic.style.display = 'none';
            authBtnIcon.style.display = 'inline-block';
            authBtnIcon.textContent = 'account_circle';
          };
          profilePic.style.display = 'inline-block';
          authBtnIcon.style.display = 'none';
        }
      } else {
        // No profile picture, use icon
        if (authBtnIcon) {
          authBtnIcon.style.display = 'inline-block';
          authBtnIcon.textContent = 'account_circle';
          const profilePic = authBtn.querySelector('.auth-profile-pic');
          if (profilePic) {
            profilePic.style.display = 'none';
          }
        }
      }

      if (authBtnText) {
        const displayName = userData.name ||
          userData.fullName ||
          (userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : '') ||
          userData.firstName ||
          userData.displayName ||
          userData.username ||
          userData.email?.split('@')[0] ||
          'Account';
        authBtnText.textContent = displayName;
      }

      console.log('✅ Auth button updated to show account with profile picture:', { hasImage: !!imageUrl });
    }

    // Update dropdown content
    if (dropdownName) {
      const displayName = userData.name ||
        userData.fullName ||
        (userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : '') ||
        userData.firstName ||
        userData.displayName ||
        userData.username ||
        userData.email ||
        'User';
      dropdownName.textContent = displayName;
    }

    if (dropdownEmail && userData.email) {
      dropdownEmail.textContent = userData.email;
    }

    // Update dropdown avatar
    if (dropdownAvatar && dropdownAvatarIcon) {
      const imageUrl = userData.image_url || userData.imageUrl || userData.avatar || userData.picture;
      if (imageUrl) {
        dropdownAvatar.src = imageUrl;
        dropdownAvatar.classList.remove('hidden');
        dropdownAvatarIcon.classList.add('hidden');
        dropdownAvatar.onerror = () => {
          dropdownAvatar.classList.add('hidden');
          dropdownAvatarIcon.classList.remove('hidden');
        };
      } else {
        dropdownAvatar.classList.add('hidden');
        dropdownAvatarIcon.classList.remove('hidden');
      }
    }

    // Legacy UI updates (for backward compatibility)
    if (userAccountSection) {
      userAccountSection.classList.remove('hidden');
    }
    if (userAvatar) {
      const imageUrl = userData.image_url || userData.imageUrl || userData.avatar || userData.picture;
      if (imageUrl) {
        userAvatar.src = imageUrl;
        userAvatar.onerror = () => {
          userAvatar.src = '../../assets/logo_m.png';
        };
      } else {
        userAvatar.src = '../../assets/logo_m.png';
      }
    }
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
    }
    if (accountEmail && userData.email) {
      accountEmail.textContent = userData.email;
    }
    if (syncIndicator && syncText) {
      const syncStatusData = userData.sync_status || 'active';
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
    }

    console.log('✅ Enhanced user authentication UI updated successfully');
  } else if (isGuestMode) {
    // Guest mode: show sign-in button
    if (authBtn) {
      authBtn.classList.remove('authenticated');
      authBtn.title = 'Sign In';
      if (authBtnIcon) {
        authBtnIcon.style.display = 'inline-block';
        authBtnIcon.textContent = 'login';
      }
      if (authBtnText) authBtnText.textContent = 'Sign In';
      // Hide profile picture if it exists
      const profilePic = authBtn.querySelector('.auth-profile-pic');
      if (profilePic) {
        profilePic.style.display = 'none';
      }
    }
    if (accountDropdown) {
      accountDropdown.classList.add('hidden');
    }

    // Legacy UI for guest mode
    if (userAccountSection) {
      userAccountSection.classList.remove('hidden');
      userAccountSection.classList.add('guest');
    }
    if (userAvatar) {
      userAvatar.src = '../../assets/logo_m.png';
    }
    if (userName) {
      userName.textContent = 'Guest User';
    }
    if (accountEmail) {
      accountEmail.textContent = 'Using app without account';
    }
    if (syncIndicator && syncText) {
      syncIndicator.classList.remove('active', 'error');
      syncIndicator.classList.add('guest');
      syncText.textContent = 'Guest Mode';
    }

    console.log('✅ Guest mode UI updated successfully');
  } else {
    // Not authenticated: show sign-in button
    if (authBtn) {
      authBtn.classList.remove('authenticated');
      authBtn.title = 'Sign In';
      if (authBtnIcon) {
        authBtnIcon.style.display = 'inline-block';
        authBtnIcon.textContent = 'login';
      }
      if (authBtnText) authBtnText.textContent = 'Sign In';
      // Hide profile picture if it exists
      const profilePic = authBtn.querySelector('.auth-profile-pic');
      if (profilePic) {
        profilePic.style.display = 'none';
      }
      console.log('✅ Sign-in button shown');
    }
    if (accountDropdown) {
      accountDropdown.classList.add('hidden');
    }
    if (userAccountSection) {
      userAccountSection.classList.add('hidden');
    }

    console.log('❌ User not authenticated - sign-in UI shown');
  }
}

// Initialize accessibility after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    const a11y = A11y.init();

    // Expose to window for debugging/tests
    window.__A11Y = a11y;

    // Hook into hint rendering: when hints are added, ensure accessible attributes
    const hintsContainer = document.getElementById('hints-display');
    if (hintsContainer) {
      // Ensure the container has aria-live for dynamic hint announcements
      hintsContainer.setAttribute('aria-live', 'polite');
      hintsContainer.setAttribute('aria-atomic', 'false');
    }

    // Example: add text-to-speech button actions for future hint items
    document.body.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('hint-tts-btn')) {
        const hint = target.closest('.hint-item');
        const text = hint ? (hint.querySelector('.hint-text')?.textContent || hint.textContent) : null;
        if (text) a11y.speak(text);
      }
    });
  } catch (e) {
    console.warn('Accessibility module failed to initialize', e);
  }
});

// ============================================================================
// CLERK OAUTH AUTHENTICATION
// ============================================================================

/**
 * Handle Clerk OAuth sign-in
 *
 * This function initiates the Clerk OAuth flow:
 * 1. Calls main process to generate state and open browser
 * 2. User completes Google OAuth via Clerk in browser
 * 3. Web app redirects to myapp://auth/callback?token=...&state=...
 * 4. Main process validates and sends success/error events
 * 5. Event listeners update UI accordingly
 */
async function handleClerkSignIn() {
  console.log('🔐 Starting Clerk OAuth sign-in...');

  try {
    const result = await clerkAuth.startLogin();

    if (result.success) {
      updateStatus('Please complete sign-in in your browser...');

      // Set a timeout to offer guest mode if authentication takes too long
      setTimeout(() => {
        if (!userInfo) {
          console.log('⏰ Authentication timeout - offering guest mode');
          showAuthenticationTimeoutDialog();
        }
      }, 5 * 60 * 1000); // 5 minutes timeout (matches main process timeout)

    } else {
      console.error('❌ Failed to start Clerk login:', result.error);
      // Fallback: open the browser sign-in directly via main process
      try {
        const { ipcRenderer } = require('electron');
        updateStatus('Opening browser for sign-in...');
        const fb = await ipcRenderer.invoke('open-browser-auth');
        if (fb?.success) {
          updateStatus('Please complete sign-in in your browser...');
        } else {
          handleAuthenticationError('Failed to open browser for sign-in', fb?.error || 'Unknown error');
        }
      } catch (fbErr) {
        handleAuthenticationError('Failed to open browser for sign-in', fbErr.message);
      }
    }

  } catch (error) {
    console.error('❌ Clerk sign-in error:', error);
    // Fallback: attempt direct browser sign-in
    try {
      const { ipcRenderer } = require('electron');
      updateStatus('Opening browser for sign-in...');
      const fb = await ipcRenderer.invoke('open-browser-auth');
      if (fb?.success) {
        updateStatus('Please complete sign-in in your browser...');
      } else {
        handleAuthenticationError('Failed to open browser for sign-in', fb?.error || error.message);
      }
    } catch (fbErr) {
      handleAuthenticationError('Failed to open browser for sign-in', fbErr.message);
    }
  }
}

/**
 * Handle Clerk authentication success
 * Called when main process sends 'auth:clerk-success' event
 */
function handleClerkAuthSuccess(user) {
  console.log('🎉 Clerk authentication successful:', user);

  // Update user info
  userInfo = user;

  // Update UI to show authenticated state
  updateAuthUI(true, user);

  // Update status
  updateStatus('Signed in successfully!');

  // Show success notification
  showNotification('Welcome!', `Signed in as ${user.email || user.name || 'User'}`);
}

/**
 * Handle Clerk authentication error
 * Called when main process sends 'auth:clerk-error' event
 */
function handleClerkAuthError(error) {
  console.error('❌ Clerk authentication error:', error);

  handleAuthenticationError('Authentication failed', error);
}

/**
 * Handle Clerk logout
 */
async function handleClerkLogout() {
  console.log('🚪 Signing out from Clerk...');

  try {
    const result = await clerkAuth.logout();

    if (result.success) {
      console.log('✅ Clerk logout successful');

      // Clear user info
      userInfo = null;

      // Update UI
      updateAuthUI(false);

      // Update status
      updateStatus('Signed out successfully');

    } else {
      console.error('❌ Clerk logout failed:', result.error);
    }

  } catch (error) {
    console.error('❌ Error during Clerk logout:', error);
  }
}

// Set up Clerk authentication event listeners
clerkAuth.on('success', handleClerkAuthSuccess);
clerkAuth.on('error', handleClerkAuthError);
clerkAuth.on('logout', () => {
  console.log('🚪 User logged out');
  userInfo = null;
  updateAuthUI(false);
});

// ============================================================================
// LEGACY SUPABASE AUTHENTICATION (for backward compatibility)
// ============================================================================

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
    // Retry using direct browser sign-in to avoid environment/config issues
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
        try { img.src = `../../assets/${filename}`; } catch { }
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

// Show notification (simple implementation)
function showNotification(title, body) {
  console.log(`📢 ${title}: ${body}`);

  // You can enhance this with a toast notification UI
  // For now, just update the status
  updateStatus(body);
}

// Update mode toggle UI (bottom status bar)
function syncModeToggleUI(cfg) {
  try {
    const input = document.getElementById('mode-toggle');
    const label = document.getElementById('mode-toggle-text');
    if (input && label) {
      input.checked = !!cfg.advanced_mode;
      label.textContent = cfg.advanced_mode ? 'Advanced Mode' : 'Standard Mode';
      label.title = cfg.advanced_mode ? 'Advanced Mode (Direct Vision): send screenshots to the AI without OCR' : 'Standard Mode (OCR): extract text first, then ask the AI';
    }

    const storyInput = document.getElementById('story-mode-toggle');
    if (storyInput) {
      storyInput.checked = !!cfg.story_mode;
    }
  } catch { }
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
    // Show error with beautiful animation
    const errorMessage = hintsText || 'Failed to generate hints. Please try again.';
    let errorType = 'general';

    // Determine error type
    if (errorMessage.includes('OCR')) errorType = 'ocr';
    else if (errorMessage.includes('API') || errorMessage.includes('rate limit')) errorType = 'api';
    else if (errorMessage.includes('network') || errorMessage.includes('connection')) errorType = 'network';
    else if (errorMessage.includes('permission')) errorType = 'permission';

    errorDisplay.show({
      type: errorType,
      title: 'Error Processing Image',
      message: errorMessage,
      actions: [
        {
          text: 'Try Again',
          icon: 'refresh',
          variant: 'btn-primary',
          onClick: () => {
            // Trigger clipboard processing again
            processClipboardSmart();
          }
        },
        {
          text: 'Close',
          icon: 'close',
          variant: 'btn-secondary',
          onClick: () => { }
        }
      ],
      container: hintsDisplay
    });
    return;
  }

  // Check if the text is a generated diagram HTML block
  if (hintsText && hintsText.trim().startsWith('<div class="generated-diagram">')) {
    hintsDisplay.innerHTML = hintsText;
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
      try { require('electron').shell.openExternal(url); } catch { }
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
    b.setAttribute('role', 'button');
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
            // Respect accessibility TTS toggle if available
            try {
              if (window.__A11Y && typeof window.__A11Y.speak === 'function') {
                window.__A11Y.speak(flatList);
              } else if (window.speechSynthesis) {
                const u = new SpeechSynthesisUtterance(flatList);
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(u);
              }
            } catch (ttsErr) {
              console.warn('TTS failed', ttsErr);
            }
            updateStatus('Speaking all hints...');
            break;
          }
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
            break;
          }
          case 'share':
            toggleShareMenu(b);
            break;
        }
      } catch (err) { updateStatus('Action failed'); }
    });
    bar.appendChild(b);
    return b;
  };

  // Icons: like, dislike, copy, speak, regenerate, share (Lucide)
  mkBtn('like', 'Liked the hints', 'thumbs-up');
  mkBtn('dislike', 'Disliked the hints', 'thumbs-down');
  mkBtn('copy', 'Copy all hints', 'clipboard');
  // TTS button: add class for accessibility module to pick up
  const speakBtn = mkBtn('speak', 'Speak all hints', 'volume-2');
  speakBtn.classList.add('hint-tts-btn');
  mkBtn('regen', 'Regenerate hints', 'refresh-ccw');
  mkBtn('share', 'Share', 'share-2');

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
  const config = currentConfig;

  if (config.story_mode) {
    return `You are Hintify, a storyteller who explains complex concepts through engaging physical stories.

The user wants to understand:
${text}

Your goal:
- Create a short, engaging story or analogy that explains the core concept.
- Use physical objects, characters, or scenarios to make it concrete.
- Keep it educational but fun.
- After the story, briefly connect it back to the academic concept.

Format:
**Story:** [Your story here]
**Concept:** [Brief explanation]`;
  }

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
Hint 1: ...
Hint 2: ...
Hint 3: ...
(Hint 4..6 if useful)
<encouragement line>`;
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
          // Show helpful error with option to switch to Advanced Mode
          const hintsDisplay = document.getElementById('hints-display');
          errorDisplay.show({
            type: 'ocr',
            title: 'OCR Engine Unavailable',
            message: 'The OCR engine could not start. Would you like to switch to Advanced Mode? It sends images directly to AI without OCR.',
            actions: [
              {
                text: 'Enable Advanced Mode',
                icon: 'flash_on',
                variant: 'btn-primary',
                onClick: async () => {
                  updateStatus('Switching to Advanced Mode...');
                  showLoading(true, 'Generating hints (Advanced Mode)...');
                  // Persist mode switch
                  currentConfig.advanced_mode = true;
                  saveConfig({ advanced_mode: true });
                  try { syncModeToggleUI(currentConfig); } catch { }

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
                }
              },
              {
                text: 'Cancel',
                icon: 'close',
                variant: 'btn-secondary',
                onClick: () => {
                  updateStatus('Ready');
                }
              }
            ],
            container: hintsDisplay
          });
          return;
        }

        // Generic OCR failure - show with beautiful error UI
        const hintsDisplay = document.getElementById('hints-display');
        errorDisplay.show({
          type: 'ocr',
          title: 'Text Extraction Failed',
          message: `Could not extract text from the image. ${rawMsg}`,
          actions: [
            {
              text: 'Try Again',
              icon: 'refresh',
              variant: 'btn-primary',
              onClick: () => {
                processClipboardSmart();
              }
            },
            {
              text: 'Use Advanced Mode',
              icon: 'flash_on',
              variant: 'btn-secondary',
              onClick: async () => {
                currentConfig.advanced_mode = true;
                saveConfig({ advanced_mode: true });
                try { syncModeToggleUI(currentConfig); } catch { }
                processClipboardSmart();
              }
            }
          ],
          container: hintsDisplay
        });

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

// Legacy function - now handled by the new permission system
// Kept for compatibility but no longer used
async function ensureScreenRecordingPermission() {
  console.warn('[Permission] ensureScreenRecordingPermission is deprecated - use new permission system');
  // The new permission system handles this automatically
}

// Try to actually open a minimal desktop stream to verify permission; returns boolean
async function probeScreenPermissionViaStream() {
  // Disabled to avoid triggering macOS permission prompt loops
  return false;
}

// One-time registration to make app appear in macOS Screen Recording list
async function registerAppForScreenRecordingOnce() {
  if (process.platform !== 'darwin') return;
  if (permissionManager.sessionFlags.registrationAttempted) return;
  permissionManager.sessionFlags.registrationAttempted = true;

  console.log('[Registration] Attempting to register app with macOS Screen Recording...');
  permissionLogger.log('info', 'Starting Screen Recording registration process');

  try {
    // Check current status
    const status = await getScreenPermissionStatus(true);
    console.log(`[Registration] Current permission status: ${status}`);

    // Always attempt registration regardless of status to ensure app appears in list
    const nmd = navigator.mediaDevices;
    if (!nmd || typeof nmd.getDisplayMedia !== 'function') {
      console.log('[Registration] getDisplayMedia not available');
      return;
    }

    console.log('[Registration] Calling getDisplayMedia to register with TCC...');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[Registration] Timeout reached, aborting registration');
      controller.abort();
    }, 5000);

    try {
      const stream = await nmd.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          width: { max: 1 },
          height: { max: 1 }
        },
        audio: false
      });
      clearTimeout(timeout);

      console.log('[Registration] Successfully obtained display media stream');

      // Immediately stop tracks; this is only for registration
      stream.getTracks().forEach(track => {
        console.log(`[Registration] Stopping track: ${track.kind}`);
        track.stop();
      });

      console.log('[Registration] ✅ App registered with macOS Screen Recording');
      permissionLogger.log('info', 'Successfully registered app with macOS Screen Recording via getDisplayMedia');

    } catch (e) {
      clearTimeout(timeout);
      console.log(`[Registration] getDisplayMedia failed: ${e.message}`);

      // This is expected if permission is denied, but the app should still be listed
      if (e.name === 'NotAllowedError') {
        console.log('[Registration] Permission denied, but app should now be listed in System Settings');
        permissionLogger.log('info', 'Registration triggered permission prompt - app should now be visible in settings');
      } else {
        permissionLogger.log('warn', 'Registration attempt failed', { error: e.message, name: e.name });
      }
    }
  } catch (e) {
    console.error('[Registration] Registration flow error:', e);
    permissionLogger.log('error', 'Registration flow encountered an error', { error: e.message });
  }
}

// Check current macOS Screen Recording permission status (via main for reliability)
async function getScreenPermissionStatus(forceCheck = false) {
  try {
    if (process.platform !== 'darwin') {
      console.log('[Permission] Non-macOS platform, returning granted');
      return 'granted';
    }

    // Use cached status if recent and not forcing check
    if (!forceCheck && permissionManager.shouldSkipPermissionCheck()) {
      const cached = permissionManager.sessionFlags.lastKnownStatus;
      if (cached !== 'unknown') {
        console.log(`[Permission] Using cached status: "${cached}"`);
        return cached;
      }
    }

    console.log('[Permission] Requesting fresh permission status from main process');

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Permission status check timeout')), 5000);
    });

    const statusPromise = ipcRenderer.invoke('get-screen-permission-status');
    const status = await Promise.race([statusPromise, timeoutPromise]);

    console.log(`[Permission] Received status from main process: "${status}"`);

    // Validate the received status
    if (!['granted', 'denied', 'not-determined', 'unknown'].includes(status)) {
      console.warn(`[Permission] Invalid status received: "${status}", treating as unknown`);
      return 'unknown';
    }

    // Update permission manager with the new status
    // Do NOT mark as actuallyGranted here; that should only happen after a successful capture
    permissionManager.updatePermissionStatus(status, false);

    return status;
  } catch (e) {
    console.error('[Permission] Error getting screen permission status:', {
      error: e.message,
      stack: e.stack,
      forceCheck,
      platform: process.platform
    });

    // Return cached status if available, otherwise unknown
    const cached = permissionManager.sessionFlags.lastKnownStatus;
    if (cached !== 'unknown') {
      console.log(`[Permission] Falling back to cached status: "${cached}"`);
      return cached;
    }

    return 'unknown';
  }
}

// Open macOS System Settings to the Screen Recording privacy pane
async function openScreenRecordingPreferences() {
  try {
    const result = await ipcRenderer.invoke('open-screen-preferences');
    if (result) {
      permissionManager.sessionFlags.screenPrefsPrompted = true;
      try { store.set('screen_permission_restart_required', true); } catch { }
    }
    return result;
  } catch (e) {
    return false;
  }
}

// Comprehensive permission validation that combines multiple checks
async function validateScreenPermission() {
  if (process.platform !== 'darwin') return { status: 'granted', validated: true };
  const systemStatus = await getScreenPermissionStatus(true);
  if (systemStatus === 'granted') return { status: 'granted', validated: true, method: 'system' };
  if (systemStatus === 'denied') return { status: 'denied', validated: true, method: 'system' };
  if (systemStatus === 'not-determined') return { status: 'not-determined', validated: true, method: 'system' };
  return { status: 'unknown', validated: false, method: 'system' };
}

// Smart permission handler that uses comprehensive validation
async function ensureScreenPermission() {
  if (process.platform !== 'darwin') return { success: true, status: 'granted' };
  const validation = await validateScreenPermission();

  try {
    // If permission is granted and validated, clear the restart flag
    if (validation.status === 'granted' && validation.validated) {
      // Permission is confirmed working - clear restart requirement
      const hadRestartFlag = store.get('screen_permission_restart_required', false);
      if (hadRestartFlag) {
        console.log('[Permission] Clearing restart_required flag - permission is working');
        store.set('screen_permission_restart_required', false);
      }
      return { success: true, status: 'granted', method: validation.method };
    }

    // Only show restart dialog if flag is set AND we haven't shown it this session
    if (validation.status === 'granted' && store.get('screen_permission_restart_required', false)) {
      // Check if we've already shown the restart prompt this session
      if (permissionManager.sessionFlags.restartDialogShown) {
        // Already shown this session, just clear the flag and try to proceed
        console.log('[Permission] Restart dialog already shown this session, clearing flag');
        store.set('screen_permission_restart_required', false);
        return { success: true, status: 'granted', method: validation.method };
      }

      // Mark that we're showing the restart dialog
      permissionManager.sessionFlags.restartDialogShown = true;
      return { success: false, status: 'granted', needsRestart: true, message: 'Screen Recording permission changed. Restart Hintify to apply it.' };
    }
  } catch (e) {
    console.error('[Permission] Error in ensureScreenPermission:', e);
  }

  if (validation.status === 'granted') return { success: true, status: 'granted', method: validation.method };
  // Treat not-determined similar to denied for user guidance
  return { success: false, status: validation.status, message: 'Screen Recording permission is required.' };
}

// Guide user through permission granting process
async function guideUserToGrantPermission() {
  if (process.platform !== 'darwin') return true;

  const packaged = await ipcRenderer.invoke('is-packaged-app');
  const appName = await ipcRenderer.invoke('get-app-name');

  // Don't prompt repeatedly in the same session unless permission status changed
  if (permissionManager.sessionFlags.screenPrefsPrompted) {
    console.log('[Permission] Already prompted user in this session');
    return false;
  }

  const targetName = packaged ? appName : 'Electron (development)';

  // Try to proactively register the app in macOS Screen Recording (one-time per session)
  await registerAppForScreenRecordingOnce();
  const message = [
    'Hintify needs Screen Recording permission to capture screenshots.',
    `In System Settings → Privacy & Security → Screen Recording, enable permission for "${targetName}".`,
    packaged ? 'Then quit and reopen the app to apply the change.' : 'Development builds appear as "Electron". After enabling, quit and restart this dev app.'
  ].join('\n\n');

  // Open System Settings
  const opened = await openScreenRecordingPreferences();
  if (!opened) {
    console.error('[Permission] Failed to open System Settings');
    updateStatus('Please manually open System Settings → Privacy & Security → Screen Recording');
    return false;
  }

  // Show guidance dialog
  const restartNow = window.confirm(`${message}\n\nWould you like to restart the app now?`);
  if (restartNow) {
    try {
      await ipcRenderer.invoke('relaunch-app');
      return true;
    } catch (e) {
      console.error('[Permission] Failed to restart app:', e);
    }
  } else {
    updateStatus('Please grant Screen Recording in System Settings, then restart the app.');
  }

  return false;
}

// Diagnostic function for troubleshooting permission issues
async function diagnosePermissionIssues() {
  permissionLogger.log('info', 'Starting permission diagnostics');

  try {
    const report = await permissionLogger.getDiagnosticReport();

    console.group('🔍 Permission Diagnostic Report');
    console.log('📊 Full Report:', report);
    console.log('🖥️ Main Process:', report.mainProcess);
    console.log('🎨 Renderer Process:', report.renderer);
    console.log('📝 Recent Logs:', report.renderer.recentLogs);
    console.groupEnd();

    // Also display in UI for user
    const summary = [
      `Platform: ${report.mainProcess.platform}`,
      `App Version: ${report.mainProcess.appVersion}`,
      `Packaged: ${report.mainProcess.isPackaged}`,
      `Permission Status: ${report.mainProcess.macOS?.screenRecordingStatus || 'N/A'}`,
      `Cached Status: ${report.renderer.permissionManager.sessionFlags.lastKnownStatus}`,
      `Monitoring: ${report.renderer.permissionMonitor.isMonitoring ? 'Active' : 'Inactive'}`
    ].join('\n');

    updateStatus(`Permission Diagnostics:\n${summary}`);

    return report;
  } catch (e) {
    permissionLogger.log('error', 'Failed to generate diagnostic report', { error: e.message });
    console.error('Failed to generate permission diagnostic report:', e);
    return null;
  }
}

// Make diagnostic function available globally for debugging
window.diagnosePermissions = diagnosePermissionIssues;

// Cleanup function for app shutdown
function cleanupPermissionSystem() {
  permissionLogger.log('info', 'Cleaning up permission system');

  try {
    // Stop permission monitoring
    permissionMonitor.stopMonitoring();

    // Clear any pending timeouts or intervals
    // (The PermissionMonitor class handles its own cleanup)

    console.log('[Permission] Permission system cleanup completed');
  } catch (e) {
    console.error('[Permission] Error during cleanup:', e);
  }
}

// Register cleanup on window unload
window.addEventListener('beforeunload', cleanupPermissionSystem);

// Test function for permission system (development/debugging)
async function testPermissionSystem() {
  console.group('🧪 Permission System Test');

  try {
    console.log('1. Testing permission status check...');
    const status = await getScreenPermissionStatus(true);
    console.log(`   Status: ${status}`);

    console.log('2. Testing permission validation...');
    const validation = await validateScreenPermission();
    console.log('   Validation result:', validation);

    console.log('3. Testing smart permission check...');
    const smartCheck = await ensureScreenPermission();
    console.log('   Smart check result:', smartCheck);

    console.log('4. Getting diagnostic report...');
    const diagnostics = await diagnosePermissionIssues();
    console.log('   Diagnostics available:', !!diagnostics);

    console.log('✅ Permission system test completed');
    return { success: true, status, validation, smartCheck, diagnostics };

  } catch (e) {
    console.error('❌ Permission system test failed:', e);
    return { success: false, error: e.message };
  } finally {
    console.groupEnd();
  }
}

// Make test function available globally for debugging
window.testPermissionSystem = testPermissionSystem;

// Trigger screenshot capture with improved permission handling
async function triggerCapture() {
  updateStatus('Preparing screenshot capture...');

  // On macOS, use the new smart permission system
  if (process.platform === 'darwin') {
    console.log('[Capture] Checking screen recording permission');

    const permissionResult = await ensureScreenPermission();
    console.log('[Capture] Permission check result:', permissionResult);

    if (!permissionResult.success) {
      if (permissionResult.needsRestart) {
        // Permission is granted but needs restart
        const restart = window.confirm(`${permissionResult.message}\n\nWould you like to restart Hintify now?`);
        if (restart) {
          try {
            await ipcRenderer.invoke('relaunch-app');
            return;
          } catch (e) {
            console.error('[Capture] Failed to restart app:', e);
          }
        } else {
          updateStatus('Please restart Hintify to use screenshot capture.');
          return;
        }
      } else if (permissionResult.status === 'denied' || permissionResult.status === 'not-determined') {
        // Permission is denied - guide user
        updateStatus('Screen Recording permission required');
        const guided = await guideUserToGrantPermission();
        if (!guided) {
          updateStatus('Please grant Screen Recording permission in System Settings');
        }
        return;
      } else {
        // Other permission issues
        updateStatus(permissionResult.message || 'Permission check failed');
        return;
      }
    }

    // Permission is confirmed - proceed with capture
    console.log('[Capture] Permission confirmed, starting screencapture');
    updateStatus('Click and drag to select area to capture...');

    const { spawn } = require('child_process');
    const capture = spawn('screencapture', ['-i', '-c', '-x']);

    capture.on('close', async (code) => {
      if (code === 0) {
        console.log('[Capture] Screenshot captured successfully');
        // Mark permission as working
        permissionManager.updatePermissionStatus('granted', true);

        // Wait a moment then process clipboard
        setTimeout(() => {
          processClipboardImage();
        }, 1000);
      } else {
        console.log(`[Capture] Screenshot capture failed with code: ${code}`);

        // Re-validate permission to see what happened
        const validation = await validateScreenPermission();
        console.log('[Capture] Post-failure validation:', validation);

        if (validation.status === 'denied') {
          updateStatus('Screen Recording permission was denied');
          await guideUserToGrantPermission();
        } else {
          // Likely user cancelled or other non-permission issue
          updateStatus('Screenshot cancelled');
        }
      }
    });

    capture.on('error', (error) => {
      console.error('[Capture] Screenshot capture error:', error);
      updateStatus('Screenshot capture failed');
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

  // Apply theme (check if glassy mode is enabled)
  const glassyMode = store.get('glassy_mode', false);
  if (glassyMode) {
    applyTheme('glass');
  } else {
    applyTheme(config.theme);
  }

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

  // Start permission monitoring on macOS
  if (process.platform === 'darwin') {
    // Set initial permission state and start monitoring
    try {
      const initialStatus = await getScreenPermissionStatus();
      permissionMonitor.setInitialState(initialStatus);
      permissionMonitor.startMonitoring();
      console.log(`[Permission] Started monitoring with initial state: ${initialStatus}`);

      // Register app with macOS Screen Recording immediately on startup
      await registerAppForScreenRecordingOnce();
    } catch (e) {
      console.error('[Permission] Failed to start permission monitoring:', e);
    }
  }

  // Determine what to show based on authentication state
  if (isAuthenticated) {
    // User is authenticated - show normal authenticated UI
    console.log('✅ User authenticated - showing main app');
  } else if (authChoiceMade && guestModeEnabled) {
    // User previously chose guest mode - restore guest mode
    console.log('🚀 Restoring guest mode from previous session');
    window.isGuestMode = true;
    updateAuthUI(false, null, true);
    // Show default welcome message (same as in index.html)
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
    // Handle auth button click - either sign in or show account dropdown
    authBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      // Check if user is authenticated
      if (authBtn.classList.contains('authenticated')) {
        // Show account dropdown
        const accountDropdown = document.getElementById('account-dropdown');
        if (accountDropdown) {
          accountDropdown.classList.toggle('hidden');
        }
      } else {
        // Start sign-in flow
        handleClerkSignIn();
      }
    });
  }

  // Set up account dropdown event listeners
  setupAccountDropdown();

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

  // Story Mode toggle handler
  const storyModeToggle = document.getElementById('story-mode-toggle');
  if (storyModeToggle) {
    storyModeToggle.addEventListener('change', (e) => {
      const newCfg = { story_mode: !!e.target.checked };
      saveConfig(newCfg);
      updateStatus(e.target.checked ? 'Story Mode enabled' : 'Story Mode disabled');
    });
    // Sync initial state
    storyModeToggle.checked = !!currentConfig.story_mode;
  }

  // Diagram button handler
  const diagramBtn = document.getElementById('diagram-btn');
  if (diagramBtn) {
    diagramBtn.addEventListener('click', async () => {
      if (!currentQuestionData) {
        alert('Please ask a question or capture a screenshot first.');
        return;
      }

      const topic = currentQuestionData.questionText || 'educational topic';
      showLoading(true, 'Generating diagram...');
      try {
        const imageUrl = await generateDiagram(topic);
        if (imageUrl.startsWith('[NanoBanana Error]')) {
          alert(imageUrl);
        } else {
          // Display the generated diagram
          displayHints(`
             <div class="generated-diagram">
                <h3>Generated Diagram</h3>
                <img src="${imageUrl}" alt="Educational Diagram" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">
             </div>
             `);
          updateStatus('Diagram generated');
        }
      } catch (e) {
        console.error(e);
        alert('Failed to generate diagram');
      } finally {
        showLoading(false);
      }
    });
  }

  // If main process wants to show sign-in
  ipcRenderer.on('show-sign-in', () => {
    handleClerkSignIn(); // Use Clerk OAuth
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
    // Apply theme (check if glassy_mode is in newConfig)
    if (newConfig.glassy_mode) {
      applyTheme('glass');
    } else {
      applyTheme(newConfig.theme);
    }
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
      try { if (window.renderMathInElement) window.renderMathInElement(document.getElementById('hints-display'), { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] }); } catch { }

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
    handleClerkSignIn(); // Use Clerk OAuth
  });

  // Settings are now opened in separate window via IPC

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

// Set up account dropdown (new auth button dropdown)
function setupAccountDropdown() {
  const accountDropdown = document.getElementById('account-dropdown');
  const profileBtn = document.getElementById('account-dropdown-profile');
  const settingsBtn = document.getElementById('account-dropdown-settings');
  const logoutBtn = document.getElementById('account-dropdown-logout');

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (accountDropdown && !accountDropdown.classList.contains('hidden')) {
      const authBtn = document.getElementById('auth-btn');
      if (!accountDropdown.contains(e.target) && e.target !== authBtn && !authBtn?.contains(e.target)) {
        accountDropdown.classList.add('hidden');
      }
    }
  });

  // Prevent dropdown from closing when clicking inside it
  if (accountDropdown) {
    accountDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Profile button
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      if (accountDropdown) accountDropdown.classList.add('hidden');
      showProfileModal();
    });
  }

  // Settings button
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (accountDropdown) accountDropdown.classList.add('hidden');
      showAccountSettingsModal();
    });
  }

  // Logout button
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (accountDropdown) accountDropdown.classList.add('hidden');
      await handleClerkLogout();
    });
  }
}

// Handle account menu dropdown (legacy)
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

// Open Settings in separate window
function openEmbeddedSettings() {
  console.log('🔧 Opening settings in separate window...');

  // Get current theme from the actual body class (more reliable)
  const bodyClasses = document.body.className;
  let currentTheme = 'theme-dark'; // default

  if (bodyClasses.includes('theme-pastel')) {
    currentTheme = 'theme-pastel';
  } else if (bodyClasses.includes('theme-light')) {
    currentTheme = 'theme-light';
  } else if (bodyClasses.includes('theme-dark')) {
    currentTheme = 'theme-dark';
  }

  console.log('🎨 Current body classes:', bodyClasses);
  console.log('🎨 Detected current theme:', currentTheme);
  console.log('🎨 Sending theme to settings:', currentTheme);

  ipcRenderer.send('open-settings', { theme: currentTheme });
}

// Settings are now opened in separate window
// Modal close functionality no longer needed

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
          <li>📸 <strong>Capture Screenshot:</strong> Click the camera button or press <strong>${mod}+Shift+H</strong></li>
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
      handleClerkSignIn(); // Use Clerk OAuth
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

  // Clear the guest mode prompt and show the default welcome message
  const hintsDisplay = document.getElementById('hints-display');
  if (hintsDisplay) {
    const mod = getModKeyLabel();
    hintsDisplay.innerHTML = `
      <div class="welcome-message material-welcome">
        <div class="welcome-icon">
          <span class="material-icons" style="font-size: 64px; color: #667eea;">school</span>
        </div>
        <h2>Welcome to Hintify - Guest Mode</h2>
        <p class="subtitle">Get AI-powered hints without spoiling the answer</p>
        <div class="quick-start">
          <h3>Quick Start Guide</h3>
          <div class="feature-grid">
            <div class="feature-item">
              <span class="material-icons">screenshot_monitor</span>
              <h4>Capture Screenshot</h4>
              <p>Press <kbd>${mod}</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd></p>
            </div>
            <div class="feature-item">
              <span class="material-icons">content_paste</span>
              <h4>Process Clipboard</h4>
              <p>Press <kbd>${mod}</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd></p>
            </div>
            <div class="feature-item">
              <span class="material-icons">psychology</span>
              <h4>Get Hints</h4>
              <p>AI analyzes and provides helpful hints</p>
            </div>
            <div class="feature-item">
              <span class="material-icons">settings</span>
              <h4>Configure AI</h4>
              <p>Choose Ollama or Gemini in settings</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Show default welcome message (same as in index.html)
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

// Theme Toggle Functionality
function initializeThemeToggle() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themes = ['theme-dark', 'theme-pastel', 'theme-light'];
  const themeNames = {
    'theme-dark': 'Dark',
    'theme-pastel': 'Pastel',
    'theme-light': 'Light'
  };
  let currentThemeIndex = 0;

  const applyThemeClass = (themeClass) => {
    const themeClasses = ['theme-dark', 'theme-pastel', 'theme-light'];
    document.body.classList.remove(...themeClasses);
    document.body.classList.add(themeClass);
    document.body.classList.add('material-ui');
  };

  // Load saved theme
  const savedTheme = store.get('app-theme', 'theme-dark');
  currentThemeIndex = themes.indexOf(savedTheme);
  if (currentThemeIndex === -1) currentThemeIndex = 0;

  // Apply saved theme
  applyThemeClass(themes[currentThemeIndex]);

  // Theme toggle button click handler
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      // Cycle to next theme
      currentThemeIndex = (currentThemeIndex + 1) % themes.length;
      const newTheme = themes[currentThemeIndex];

      // Apply theme with animation
      document.body.style.transition = 'background 0.3s ease, color 0.3s ease';
      applyThemeClass(newTheme);

      // Save theme preference
      store.set('app-theme', newTheme);

      // Show theme name briefly
      const themeName = themeNames[newTheme] || 'Unknown';
      updateStatus(`Theme: ${themeName}`);
      setTimeout(() => updateStatus('Ready'), 2000);
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeApp();
    initializeThemeToggle(); // Initialize theme toggle
    // Uncomment to enable auto clipboard monitoring
    // startClipboardMonitor();
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    updateStatus('Initialization failed');
    displayHints('❌ Failed to initialize the application. Please refresh and try again.');
  }
});



// Handle app focus
window.addEventListener('focus', () => {
  updateStatus('Ready');
});

// Query Nano Banana
async function queryNanoBanana(prompt, model) {
  try {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (apiKey) {
      nanoBananaService.setApiKey(apiKey);
    }
    const result = await nanoBananaService.generateImage(prompt, model);
    if (result.success) {
      return result.imageUrl;
    } else {
      return `[NanoBanana Error] ${result.error}`;
    }
  } catch (error) {
    return `[NanoBanana Error] ${error.message}`;
  }
}

// Fetch related URLs using Gemini
async function fetchRelatedUrls(topic) {
  const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const prompt = `Find 3 high-quality, educational URLs related to: "${topic}".
  Return ONLY the URLs, one per line. No descriptions.`;

  try {
    const response = await queryGemini(prompt, 'gemini-2.0-flash', apiKey);
    if (response.includes('[LLM Error]')) return [];
    return response.split('\n').filter(url => url.startsWith('http'));
  } catch (e) {
    console.error('Error fetching URLs:', e);
    return [];
  }
}

// Generate Diagram
async function generateDiagram(topic) {
  const prompt = `Educational diagram explaining: ${topic}`;
  const imageModel = store.get('gemini_image_model') || 'gemini-2.0-flash-exp';
  return await queryNanoBanana(prompt, imageModel);
}

// Export functions for potential use
module.exports = {
  processClipboardImage,
  triggerCapture,
  loadConfig,
  saveConfig,
  applyTheme
};
