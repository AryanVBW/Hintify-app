const electron = require('electron');
const { app, BrowserWindow, Menu, dialog, globalShortcut, clipboard, nativeImage, shell, ipcMain, session, protocol, screen, systemPreferences } = electron;
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Load environment variables first
require('dotenv').config({
  path: path.resolve(__dirname, '../.env.local')
});

// Now import services that depend on environment variables
const AuthService = require('./services/AuthService');
const DatabaseService = require('./services/DatabaseService');
const PortalDataTransferService = require('./services/PortalDataTransferService');
const SupabaseService = require('./services/SupabaseService');
const ClerkAuthService = require('./services/ClerkAuthService');

// Initialize electron-store for persistent settings
const store = new Store();

// Optional auto-updater (loaded only if dependency is installed)
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  console.log('AutoUpdater module loaded');
} catch (e) {
  console.warn('electron-updater not installed; auto-update disabled in this build');
}

// Initialize services with error handling
let authService, dbService, portalService, supabaseService, clerkAuthService;

try {
  authService = new AuthService();
  dbService = new DatabaseService();
  portalService = new PortalDataTransferService();
  supabaseService = new SupabaseService();
  clerkAuthService = new ClerkAuthService();
  console.log('✅ All services initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize services:', error.message);
  console.log('The app will continue without database functionality.');

  // Create mock services to prevent crashes
  authService = {
    processAuthentication: async () => ({ user: null, session: null }),
    logActivity: async () => { },
    saveQuestionAnswer: async () => ({ questionId: null, answerId: null }),
    transferDataToPortal: async () => ({ success: false, error: 'Database not available' }),
    exportUserData: async () => ({ success: false, error: 'Database not available' }),
    getUserHistory: async () => [],
    signOut: async () => { },
    requestPasswordReset: async () => ({ success: false, error: 'Service unavailable' }),
    resetPassword: async () => ({ success: false, error: 'Service unavailable' }),
    enableMFA: async () => ({ success: false, error: 'Service unavailable' }),
    verifyMFASetup: async () => ({ success: false, error: 'Service unavailable' }),
    disableMFA: async () => ({ success: false, error: 'Service unavailable' }),
    initializeFromStorage: async () => false,
    getCurrentUser: () => null,
    getCurrentSession: () => null,
    isAuthenticated: () => false,
    getAuthStatus: () => ({ authenticated: false, session: null, lastActivity: null, sessionValid: false })
  };

  // Create mock Clerk auth service
  clerkAuthService = {
    startLogin: async () => ({ state: null, authUrl: null }),
    processCallback: async () => ({ success: false, error: 'Service unavailable' }),
    processDirectLink: async () => ({ success: false, error: 'Service unavailable' }),
    restoreSession: async () => null,
    signOut: async () => { },
    getAuthStatus: () => ({ authenticated: false, user: null }),
    isAuthenticated: () => false,
    getCurrentUser: () => null
  };
}

// Global variables
let mainWindow;
let settingsWindow;
let isDevelopment = process.argv.includes('--development') || process.env.NODE_ENV === 'development';

// Deep linking variables
let deeplinkingUrl = null;

// Log development mode
console.log('Development mode:', isDevelopment);

// Resolve asset path (dev vs packaged)
function resolveAsset(relPath) {
  const isDev = isDevelopment || process.env.NODE_ENV === 'development';
  const base = isDev
    ? path.join(__dirname, '..', 'assets')
    : path.join(process.resourcesPath || path.join(__dirname, '..', '..'), 'assets');
  return path.join(base, relPath);
}
// Development-mode cache clearing
async function clearDevCachesIfDev() {
  try {
    const dev = isDevelopment || process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (!dev) {
      return;
    }
    console.log('🧹 Development mode detected — clearing caches before initialization...');

    // 1) Clear electron-store
    try {
      const devStore = new Store();
      devStore.clear();
      console.log('🧹 Cleared electron-store');
    } catch (e) {
      console.warn('⚠️ Failed to clear electron-store:', e?.message || e);
    }

    // 2) Clear Chromium storage and cache
    try {
      const s = session?.defaultSession;
      if (s) {
        // Clear all storage data types that can retain state between runs
        await s.clearStorageData({
          storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'shadercache', 'websql', 'cachestorage', 'sessions'],
          quotas: ['temporary', 'persistent', 'syncable']
        });
        console.log('🧹 Cleared session storage data');

        // Clear HTTP cache
        try { await s.clearCache(); console.log('🧹 Cleared HTTP cache'); } catch { }
      }
    } catch (e) {
      console.warn('⚠️ Failed to clear session storage/cache:', e?.message || e);
    }
  } catch (e) {
    console.warn('⚠️ Dev cache clearing encountered an error:', e?.message || e);
  }
}

// Default configuration
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  // Enable Advanced Mode by default: direct vision (skip OCR)
  advanced_mode: true,
  windowBounds: { width: 750, height: 600, x: 100, y: 100 }
};

// Load configuration with defaults
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

// Function to register all IPC handlers
function registerIpcHandlers() {
  // macOS Screen Recording permission helpers with comprehensive error handling
  ipcMain.handle('get-screen-permission-status', () => {
    try {
      if (process.platform !== 'darwin') {
        console.log('[Permission] Non-macOS platform, returning granted');
        return 'granted';
      }

      // Check if systemPreferences is available
      if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
        console.error('[Permission] systemPreferences.getMediaAccessStatus not available');
        return 'unknown';
      }

      const rawStatus = systemPreferences.getMediaAccessStatus('screen');
      const normalizedStatus = String(rawStatus || '').toLowerCase().trim();

      console.log(`[Permission] Raw macOS screen permission status: "${rawStatus}" -> normalized: "${normalizedStatus}"`);

      // Handle all known macOS permission states with comprehensive mapping
      if (['granted', 'authorized', 'allow', 'allowed', 'yes', 'true', '1'].includes(normalizedStatus)) {
        console.log('[Permission] Permission status: GRANTED');
        return 'granted';
      } else if (['denied', 'restricted', 'deny', 'blocked', 'no', 'false', '0'].includes(normalizedStatus)) {
        console.log('[Permission] Permission status: DENIED');
        return 'denied';
      } else if (['not-determined', 'undetermined', 'prompt', 'ask'].includes(normalizedStatus)) {
        console.log('[Permission] Permission status: NOT-DETERMINED');
        return 'not-determined';
      } else if (['unknown', '', 'null', 'undefined'].includes(normalizedStatus)) {
        console.log('[Permission] Permission status: UNKNOWN');
        return 'unknown';
      } else {
        console.warn(`[Permission] Unrecognized permission status: "${normalizedStatus}" (raw: "${rawStatus}")`);
        // Log system info for debugging
        console.log('[Permission] System info:', {
          platform: process.platform,
          version: process.version,
          electronVersion: process.versions.electron
        });
        return 'unknown';
      }
    } catch (e) {
      console.error('[Permission] Critical error getting screen permission status:', {
        error: e.message,
        stack: e.stack,
        platform: process.platform,
        electronVersion: process.versions.electron
      });
      return 'unknown';
    }
  });

  ipcMain.handle('open-screen-preferences', async () => {
    try {
      if (process.platform !== 'darwin') return false;

      console.log('[Permission] Opening macOS System Settings for Screen Recording');

      // Try the modern macOS Ventura+ URL first, then fall back to older versions
      const urls = [
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
        'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenRecording'
      ];

      let success = false;
      for (const url of urls) {
        try {
          await shell.openExternal(url);
          console.log(`[Permission] Successfully opened System Settings with URL: ${url}`);
          success = true;
          break;
        } catch (e) {
          console.warn(`[Permission] Failed to open with URL ${url}:`, e.message);
        }
      }

      if (!success) {
        // Final fallback - open System Settings root
        console.log('[Permission] Falling back to opening System Settings root');
        await shell.openExternal('x-apple.systempreferences:');
        success = true;
      }

      return success;
    } catch (e) {
      console.error('[Permission] Error opening System Settings:', e);
      return false;
    }
  });

  ipcMain.handle('is-packaged-app', () => {
    try { return app.isPackaged; } catch { return false; }
  });

  // Debug diagnostics for permission troubleshooting
  ipcMain.handle('get-permission-diagnostics', () => {
    try {
      const diagnostics = {
        platform: process.platform,
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        appVersion: app.getVersion(),
        appName: app.getName(),
        isPackaged: app.isPackaged,
        timestamp: new Date().toISOString()
      };

      if (process.platform === 'darwin') {
        try {
          const screenStatus = systemPreferences.getMediaAccessStatus('screen');
          diagnostics.macOS = {
            screenRecordingStatus: screenStatus,
            systemPreferencesAvailable: !!systemPreferences,
            getMediaAccessStatusAvailable: typeof systemPreferences.getMediaAccessStatus === 'function'
          };
        } catch (e) {
          diagnostics.macOS = {
            error: e.message,
            systemPreferencesAvailable: !!systemPreferences
          };
        }
      }

      console.log('[Permission] Diagnostics collected:', diagnostics);
      return diagnostics;
    } catch (e) {
      console.error('[Permission] Error collecting diagnostics:', e);
      return {
        error: e.message,
        platform: process.platform,
        timestamp: new Date().toISOString()
      };
    }
  });

  ipcMain.handle('get-app-name', () => {
    try { return app.getName(); } catch { return 'Hintify'; }
  });

  ipcMain.handle('get-app-version', () => {
    try { return app.getVersion(); } catch { return '1.0.0'; }
  });

  // Renderer logging handler (for debugging)
  ipcMain.on('renderer-log', (event, message) => {
    console.log('[Renderer]', message);
  });

  // Settings and configuration handlers
  ipcMain.on('open-settings', (event, data) => {
    const theme = data?.theme || 'theme-dark';
    console.log('[Main] Opening settings with theme:', theme);
    createSettingsWindow(theme);
  });

  // Close settings window
  ipcMain.on('close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  // Focus settings window
  ipcMain.handle('focus-settings-window', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
      }
      settingsWindow.show();
      settingsWindow.focus();
      return true;
    }
    return false;
  });

  ipcMain.on('config-updated', (event, newConfig) => {
    saveConfig(newConfig);
    // Notify both main window and settings window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', newConfig);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('config-updated', newConfig);
    }
  });


  // Auth-related IPC handlers with enhanced error handling and validation
  ipcMain.on('auth-completed', async (event, userInfo) => {
    try {
      console.log('🔐 Processing Supabase authentication in main process...');
      console.log('📊 User info received:', {
        hasId: !!userInfo?.id,
        hasEmail: !!userInfo?.email,
        hasName: !!userInfo?.name,
        provider: userInfo?.provider
      });

      // Validate user info before processing
      if (!userInfo || (!userInfo.email && !userInfo.id)) {
        throw new Error('Invalid user data received from renderer process');
      }

      let authResult;
      try {
        // Process authentication through AuthService to create DB user/session
        authResult = await authService.processAuthentication(userInfo);
        console.log('✅ Authentication processed successfully:', {
          userId: authResult.user.id,
          sessionId: authResult.session.id
        });

        // Merge normalized user info back to store
        const finalUserInfo = { ...userInfo, id: authResult.user.id };
        store.set('user_authenticated', true);
        store.set('user_info', finalUserInfo);
        store.set('last_auth_time', new Date().toISOString());

      } catch (dbError) {
        console.error('❌ Failed to persist auth in database:', dbError?.message || dbError);

        // Still persist minimal local state so app can proceed
        // This ensures the app works even if database is unavailable
        store.set('user_authenticated', true);
        store.set('user_info', userInfo);
        store.set('last_auth_time', new Date().toISOString());

        // Log the database error for debugging
        console.warn('⚠️ App will continue with local authentication only');
      }

      // Auth window no longer used - authentication now handled via browser

      // Notify main window of auth status change
      if (mainWindow && !mainWindow.isDestroyed()) {
        const finalUserInfo = store.get('user_info');
        console.log('📡 Notifying main window of authentication success...');

        mainWindow.webContents.send('auth-status-updated', {
          authenticated: true,
          user: finalUserInfo,
          timestamp: new Date().toISOString()
        });
      }

      // Show main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        console.log('🖥️ Main window focused');
      }

      console.log('🎉 Authentication completed successfully via Supabase');

    } catch (error) {
      console.error('❌ Authentication processing failed:', error);

      // Send error notification to main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-status-updated', {
          authenticated: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      // Clear any partial authentication data
      store.set('user_authenticated', false);
      store.delete('user_info');
      store.delete('last_auth_time');
    }
  });

  // Auth window handler removed - now using direct browser authentication

  // Handle sign-up request
  ipcMain.on('show-signup-window', () => {
    console.log('📝 Sign-up window requested from main app - opening browser directly');
    // Open browser for sign-up (same as sign-in page with tabs)
    const authUrl = 'https://hintify.nexus-v.tech/sign-in?source=app';
    const { shell } = require('electron');
    shell.openExternal(authUrl);
  });

  // Handle browser authentication request
  ipcMain.handle('open-browser-auth', async () => {
    try {
      console.log('🌐 Opening browser for Supabase authentication...');

      // Open the production website sign-in page directly
      const authUrl = 'https://hintify.nexus-v.tech/sign-in?source=app';
      const { shell } = require('electron');
      await shell.openExternal(authUrl);

      console.log('✅ Browser opened for authentication at sign-in page');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to open browser for authentication:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle password reset request
  ipcMain.handle('request-password-reset', async (event, email) => {
    try {
      const result = await authService.requestPasswordReset(email);
      return result;
    } catch (error) {
      console.error('Password reset request failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle password reset
  ipcMain.handle('reset-password', async (event, email, code, newPassword) => {
    try {
      const result = await authService.resetPassword(email, code, newPassword);
      return result;
    } catch (error) {
      console.error('Password reset failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle MFA enable request
  ipcMain.handle('enable-mfa', async () => {
    try {
      const result = await authService.enableMFA();
      return result;
    } catch (error) {
      console.error('MFA enable failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle MFA verification
  ipcMain.handle('verify-mfa-setup', async (event, code) => {
    try {
      const result = await authService.verifyMFASetup(code);
      return result;
    } catch (error) {
      console.error('MFA verification failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle MFA disable request
  ipcMain.handle('disable-mfa', async () => {
    try {
      const result = await authService.disableMFA();
      return result;
    } catch (error) {
      console.error('MFA disable failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('user-logged-out', async () => {
    console.log('🚪 User logged out');

    try {
      // Sign out through AuthService
      await authService.signOut();

      // Clear stored auth data
      store.set('user_authenticated', false);
      store.delete('user_info');
      store.delete('last_auth_time');

      console.log('✅ User signed out and session ended');
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
  });

  // Get authentication status
  ipcMain.handle('get-auth-status', async () => {
    try {
      const authStatus = authService.getAuthStatus();
      const storedAuth = store.get('user_authenticated', false);
      const userInfo = store.get('user_info', null);

      return {
        success: true,
        authenticated: authStatus.authenticated && storedAuth,
        user: userInfo,
        session: authStatus.session,
        lastActivity: authStatus.lastActivity,
        sessionValid: authStatus.sessionValid
      };
    } catch (error) {
      console.error('Failed to get auth status:', error);
      return {
        success: false,
        error: error.message,
        authenticated: false
      };
    }
  });

  // ============================================================================
  // CLERK OAUTH AUTHENTICATION HANDLERS
  // ============================================================================

  /**
   * Start Clerk OAuth login flow
   *
   * This handler:
   * 1. Generates a cryptographically secure state parameter using crypto.randomUUID()
   * 2. Opens the system browser to the web app's auth page with the state parameter
   * 3. Returns the state for tracking (though the main process manages validation)
   *
   * Security: The state parameter prevents CSRF attacks by ensuring the callback
   * matches the original request. It's validated when the deep link callback is received.
   */
  ipcMain.handle('auth:start-clerk-login', async () => {
    try {
      console.log('🔐 Starting Clerk OAuth login flow...');

      // Generate state and get auth URL from ClerkAuthService
      const { state, authUrl } = clerkAuthService.startLogin();

      if (!authUrl || typeof authUrl !== 'string') {
        throw new Error('Invalid auth URL from ClerkAuthService');
      }

      // Open system browser to the auth URL
      // Using shell.openExternal() is more secure than embedding a webview because:
      // 1. Uses the system's default browser with its security features
      // 2. Leverages browser's password managers and autofill
      // 3. Prevents credential theft through compromised webviews
      // 4. Users can see the actual URL in their trusted browser
      await shell.openExternal(authUrl);

      console.log('✅ Browser opened for Clerk authentication');

      return {
        success: true,
        message: 'Please complete sign-in in your browser'
      };

    } catch (error) {
      console.error('❌ Failed to start Clerk login:', error);

      // Fallback to direct browser sign-in so users can still authenticate
      try {
        const fallbackUrl = 'https://hintify.nexus-v.tech/sign-in?source=app';
        await shell.openExternal(fallbackUrl);
        console.log('✅ Fallback: Browser opened for authentication');
        return {
          success: true,
          message: 'Please complete sign-in in your browser'
        };
      } catch (fallbackError) {
        console.error('❌ Fallback sign-in failed:', fallbackError);
        return {
          success: false,
          error: error.message || fallbackError.message
        };
      }
    }
  });

  /**
   * Get Clerk authentication status
   *
   * Returns the current authentication state including:
   * - Whether user is authenticated
   * - User information
   * - Session validity
   */
  ipcMain.handle('auth:get-clerk-status', async () => {
    try {
      const authStatus = clerkAuthService.getAuthStatus();

      return {
        success: true,
        authenticated: authStatus.authenticated,
        user: authStatus.user,
        sessionValid: authStatus.sessionValid
      };

    } catch (error) {
      console.error('❌ Failed to get Clerk auth status:', error);
      return {
        success: false,
        error: error.message,
        authenticated: false
      };
    }
  });

  /**
   * Sign out from Clerk
   *
   * This handler:
   * 1. Clears credentials from system keychain (via keytar)
   * 2. Clears session state
   * 3. Notifies renderer of logout
   */
  ipcMain.handle('auth:clerk-logout', async () => {
    try {
      console.log('🚪 Signing out from Clerk...');

      await clerkAuthService.signOut();

      // Notify renderer of logout
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:clerk-status-changed', {
          authenticated: false,
          user: null
        });
      }

      console.log('✅ Clerk logout successful');

      return { success: true };

    } catch (error) {
      console.error('❌ Clerk logout failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Validate current session
  ipcMain.handle('validate-session', async () => {
    try {
      const isValid = await authService.validateSession();
      return {
        success: true,
        valid: isValid
      };
    } catch (error) {
      console.error('Session validation failed:', error);
      return {
        success: false,
        error: error.message,
        valid: false
      };
    }
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });

  // Relaunch app on request (useful after granting macOS permissions)
  ipcMain.handle('relaunch-app', async () => {
    try {
      app.relaunch();
      app.exit(0);
      return true;
    } catch (e) {
      console.error('Failed to relaunch app:', e);
      return false;
    }
  });

  // Handle window focus request
  ipcMain.handle('focus-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      return true;
    }
    return false;
  });

  // Question and Answer handling
  ipcMain.handle('save-question-answer', async (event, data) => {
    try {
      const result = await authService.saveQuestionAnswer(
        data.questionText,
        data.answerText,
        data.questionType || 'text',
        data.aiProvider || 'gemini',
        data.aiModel || 'gemini-2.0-flash',
        data.imageData,
        data.metadata,
        data.processingTime
      );

      return { success: true, ...result };
    } catch (error) {
      console.error('Failed to save question/answer:', error);
      return { success: false, error: error.message };
    }
  });

  // Data transfer to Portal
  ipcMain.handle('transfer-data-to-portal', async () => {
    try {
      const result = await authService.transferDataToPortal();
      return result;
    } catch (error) {
      console.error('Failed to transfer data to Portal:', error);
      return { success: false, error: error.message };
    }
  });

  // Export user data
  ipcMain.handle('export-user-data', async (event, format = 'json') => {
    try {
      const result = await authService.exportUserData(format);
      return result;
    } catch (error) {
      console.error('Failed to export user data:', error);
      return { success: false, error: error.message };
    }
  });

  // Get user history
  ipcMain.handle('get-user-history', async (event, limit = 50) => {
    try {
      const history = await authService.getUserHistory(limit);
      return { success: true, history };
    } catch (error) {
      console.error('Failed to get user history:', error);
      return { success: false, error: error.message };
    }
  });

  // Sync account data
  ipcMain.handle('sync-account-data', async () => {
    try {
      const result = await authService.syncAccountData();
      return { success: true, result };
    } catch (error) {
      console.error('Failed to sync account data:', error);
      return { success: false, error: error.message };
    }
  });

  // Log activity

  // Auto-update IPC handlers
  ipcMain.handle('check-for-updates', async () => {
    // Disable in development mode
    if (isDevelopment || !app.isPackaged) {
      console.log('🚫 Update check: Disabled in development mode');
      return { success: false, unsupported: true, error: 'Auto-updater disabled in development mode' };
    }

    if (!autoUpdater) return { success: false, unsupported: true, error: 'Auto-updater not available in this build' };

    try {
      console.log('🔄 Checking for updates...');
      const res = await autoUpdater.checkForUpdates();
      const currentVersion = app.getVersion();
      const latestVersion = res?.updateInfo?.version;
      const available = !!latestVersion && latestVersion !== currentVersion;

      console.log('✅ Update check completed:', { currentVersion, latestVersion, available });
      return { success: true, available, currentVersion, latestVersion };
    } catch (e) {
      const errorMsg = e?.message || String(e);
      console.error('❌ Update check failed:', errorMsg, e);

      // Provide specific error messages for common issues
      let userFriendlyError = errorMsg;
      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        userFriendlyError = 'Update server not accessible. This may be a private repository requiring authentication.';
      } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('network')) {
        userFriendlyError = 'Network error: Please check your internet connection.';
      } else if (errorMsg.includes('token') || errorMsg.includes('authentication')) {
        userFriendlyError = 'Authentication failed. Please check your update token in Settings.';
      }

      return {
        success: false,
        error: userFriendlyError,
        rawError: errorMsg,
        needsToken: errorMsg.includes('404') || errorMsg.includes('authentication')
      };
    }
  });

  ipcMain.on('download-update', () => {
    // Disable in development mode
    if (isDevelopment || !app.isPackaged) {
      console.log('🚫 Download update: Disabled in development mode');
      return;
    }

    if (!autoUpdater) return;
    try { autoUpdater.downloadUpdate(); } catch (e) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', { message: e?.message || String(e) });
      }
    }
  });

  ipcMain.on('install-update', () => {
    // Disable in development mode
    if (isDevelopment || !app.isPackaged) {
      console.log('🚫 Install update: Disabled in development mode');
      return;
    }

    if (!autoUpdater) return;
    try { autoUpdater.quitAndInstall(false, true); } catch (e) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', { message: e?.message || String(e) });
      }
    }
  });

  // Allow renderer to temporarily dismiss update prompts
  ipcMain.on('dismiss-update', (_e, ms) => {
    try { store.set('update_dismissed_until', Date.now() + (Number(ms) || 0)); } catch { }
  });


  ipcMain.handle('log-activity', async (event, featureName, action, details) => {
    try {
      await authService.logActivity(featureName, action, details);
      return { success: true };
    } catch (error) {
      console.error('Failed to log activity:', error);
      return { success: false, error: error.message };
    }
  });

  // Clipboard read (for secure paste in renderer)
  ipcMain.handle('get-clipboard-text', async () => {
    try {
      return clipboard.readText();
    } catch (e) {
      return '';
    }
  });
}

// Perform data/schema migrations between versions
function performMigrations(fromVersion, toVersion) {
  try {
    console.log(`🔄 Performing migrations from ${fromVersion} to ${toVersion}...`);
    // Add data/schema migrations here as needed in future versions
    // Currently no-op
    console.log('✅ Migrations complete');
  } catch (e) {
    console.warn('⚠️ Migration error:', e?.message || e);
  }
}

function createMainWindow() {
  const config = loadConfig();

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: config.windowBounds.width,
    height: config.windowBounds.height,
    x: config.windowBounds.x,
    y: config.windowBounds.y,
    // Allow smaller minimum sizes so the overlay can be narrowed as needed
    minWidth: 320,
    minHeight: 300,
    alwaysOnTop: true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: true
    },
    icon: resolveAsset('logo_m.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Hintify',
    show: false // Don't show until ready
  });

  // Ensure overlay stays on top of all apps
  try {
    const level = process.platform === 'darwin' ? 'screen-saver' : 'normal';
    mainWindow.setAlwaysOnTop(true, level);
    // Keep visible across workspaces and on fullscreen spaces
    if (mainWindow.setVisibleOnAllWorkspaces) {
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } catch { }


  // Load the main HTML file
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Handle window ready-to-show
  mainWindow.once('ready-to-show', () => {
    // Ensure dock icon set on macOS
    if (process.platform === 'darwin') {
      try {
        const dockImg = nativeImage.createFromPath(resolveAsset('logo_m.png'));
        if (!dockImg.isEmpty()) app.dock.setIcon(dockImg);
      } catch { }
    }
    mainWindow.show();

    // Focus the window
    if (isDevelopment) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Save window bounds when moved or resized
  mainWindow.on('moved', saveWindowBounds);
  mainWindow.on('resized', saveWindowBounds);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

function saveWindowBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    saveConfig({ windowBounds: bounds });
  }
}

function createSettingsWindow(theme = 'theme-dark') {
  // Prevent multiple settings windows
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  console.log('[Main] Creating settings window with theme:', theme);

  // Create a separate BrowserWindow for settings
  settingsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    parent: mainWindow, // Make it a child of main window
    modal: false, // Allow interaction with main window
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false  // Disabled for proper CSS loading and button visibility
    },
    icon: resolveAsset('logo_m.png'),
    title: 'Hintify Settings',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true
  });

  // Load the settings HTML file
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  // Handle window ready-to-show
  settingsWindow.once('ready-to-show', () => {
    // Send theme to settings window after it's ready
    console.log('[Main] Settings window ready, sending theme:', theme);
    settingsWindow.webContents.send('apply-theme', theme);

    settingsWindow.show();
    settingsWindow.focus();

    if (isDevelopment) {
      settingsWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // Handle external links
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return settingsWindow;
}


// createAuthWindow function removed - now using direct browser authentication

// Check authentication status
function checkAuthStatus() {
  const isAuthenticated = store.get('user_authenticated', false);
  const userInfo = store.get('user_info', null);

  console.log('🔍 Auth status check:', {
    isAuthenticated,
    hasUserInfo: !!userInfo,
    userEmail: userInfo?.email
  });

  return {
    authenticated: isAuthenticated,
    user: userInfo
  };
}

function createMenuTemplate() {
  const authStatus = checkAuthStatus();

  const template = [
    {
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          role: 'about'
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => createSettingsWindow()
        },
        { type: 'separator' },
        // Add auth-related menu items
        authStatus.authenticated ? {
          label: `Sign Out (${authStatus.user?.name || authStatus.user?.email || 'User'})`,
          click: () => {
            // End backend session
            Promise.resolve().then(() => authService.signOut()).catch(() => { });

            // Clear auth data
            store.set('user_authenticated', false);
            store.delete('user_info');

            // Notify main window
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('auth-status-updated', {
                authenticated: false
              });
            }
          }
        } : {
          label: 'Sign In...',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('show-sign-in');
            } else {
              // Open browser directly for authentication
              const authUrl = 'https://hintify.nexus-v.tech/sign-in?source=app';
              const { shell } = require('electron');
              shell.openExternal(authUrl);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Hide Hintify',
          accelerator: 'CmdOrCtrl+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'CmdOrCtrl+Alt+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Capture',
      submenu: [
        {
          label: 'Screenshot Selection',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-capture');
            }
          }
        },
        {
          label: 'Process Clipboard',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('process-clipboard');
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          role: 'reload'
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          role: 'forceReload'
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          role: 'toggleDevTools'
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom'
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          role: 'zoomIn'
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut'
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          role: 'togglefullscreen'
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => {
            try {
              // Disable in development mode
              if (isDevelopment || !app.isPackaged) {
                console.log('🚫 Check for updates (menu): Disabled in development mode');
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('update-status', { status: 'unsupported' });
                }
                return;
              }

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-status', { status: 'checking' });
              }
              if (autoUpdater) {
                autoUpdater.checkForUpdates();
              } else if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-status', { status: 'unsupported' });
              }
            } catch (e) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-error', { message: e?.message || String(e) });
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/AryanVBW/Hintify')
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/AryanVBW/Hintify/issues')
        }
      ]
    }
  ];

  return template;
}

function registerGlobalShortcuts() {
  // Register global shortcut for screenshot capture
  const captureShortcut = process.platform === 'darwin' ? 'Cmd+Shift+H' : 'Ctrl+Shift+H';

  globalShortcut.register(captureShortcut, () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-capture');
    }
  });

  console.log(`Global shortcut registered: ${captureShortcut}`);
}

/**
 * Handle deep link authentication callbacks
 *
 * This function handles two types of authentication:
 * 1. Supabase OAuth (legacy): hintify://auth?token=...&refresh_token=...
 * 2. Clerk OAuth (new): myapp://auth/callback?token=...&state=...
 *
 * Platform-specific deep link handling:
 * - macOS: Uses 'open-url' event
 * - Windows/Linux: Uses 'second-instance' event and parses process.argv
 *
 * Security:
 * - Validates state parameter for Clerk OAuth (prevents CSRF attacks)
 * - Verifies JWT tokens before trusting them
 * - Uses secure credential storage (keytar)
 */
async function handleDeepLink(url) {
  try {
    console.log('🔗 Processing deep link:', url);

    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const pathname = urlObj.pathname;

    // Support both hintify:// and myapp:// protocols
    if (protocol !== 'hintify:' && protocol !== 'myapp:') {
      console.warn('⚠️ Invalid protocol for deep link:', protocol);
      return;
    }

    // ========================================================================
    // CLERK OAUTH CALLBACK: myapp://auth/callback?token=...&state=...
    // OR DIRECT LINK FROM WEBSITE: hintify://auth/callback?token=...&user=...
    // ========================================================================
    // Fix: When using hintify://auth/callback, the URL parser might see 'auth' as the host
    // and '/callback' as the pathname. We need to handle both cases.
    const isClerkCallback =
      (protocol === 'myapp:' && pathname === '//auth/callback') ||
      pathname === '/auth/callback' ||
      (urlObj.host === 'auth' && pathname === '/callback');

    if (isClerkCallback) {
      const searchParams = urlObj.searchParams;
      const token = searchParams.get('token');
      const state = searchParams.get('state');
      const userDataStr = searchParams.get('user');

      console.log('🔗 Clerk authentication callback received:', {
        hasToken: !!token,
        hasState: !!state,
        hasUserData: !!userDataStr,
        tokenLength: token?.length
      });

      if (!token) {
        console.error('❌ Missing token for Clerk authentication');

        if (mainWindow) {
          dialog.showErrorBox(
            'Authentication Error',
            'The authentication link is missing the required token. Please try signing in again.'
          );
        }
        return;
      }

      // Two scenarios:
      // 1. OAuth flow (has state): Validate state and process through ClerkAuthService
      // 2. Direct link from website (no state): Just verify token and extract user data

      if (state) {
        // Scenario 1: OAuth flow with state validation
        console.log('🔐 Processing OAuth flow with state validation...');

        // Process Clerk authentication callback
        // This will:
        // 1. Validate the state parameter (CSRF protection)
        // 2. Verify the JWT token using Clerk's JWKS endpoint
        // 3. Store credentials securely in system keychain
        // 4. Establish the user session
        const result = await clerkAuthService.processCallback({ token, state });

        if (result.success) {
          console.log('🎉 Clerk OAuth authentication successful');

          // Notify renderer of successful authentication
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth:clerk-success', {
              user: result.user,
              timestamp: new Date().toISOString()
            });
          }

          // Show and focus main window
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }

        } else {
          console.error('❌ Clerk OAuth authentication failed:', result.error);

          // Show error dialog
          if (mainWindow) {
            dialog.showErrorBox(
              'Authentication Failed',
              result.error || 'Failed to complete authentication. Please try again.'
            );
          }

          // Notify renderer of error
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth:clerk-error', {
              error: result.error,
              timestamp: new Date().toISOString()
            });
          }
        }
      } else {
        // Scenario 2: Direct link from website (no state validation needed)
        console.log('🔗 Processing direct link from website...');

        // Parse user data if provided
        let userData = null;
        if (userDataStr) {
          try {
            userData = JSON.parse(decodeURIComponent(userDataStr));
            console.log('👤 User data parsed:', {
              id: userData.id,
              email: userData.email,
              name: userData.name || userData.firstName
            });
          } catch (error) {
            console.warn('⚠️ Failed to parse user data from deep link:', error);
          }
        }

        // Process the Clerk token without state validation
        // This verifies the JWT token and stores it securely
        const result = await clerkAuthService.processDirectLink({ token, userData });

        if (result.success) {
          console.log('🎉 Clerk direct link authentication successful');

          // Notify renderer of successful authentication
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth:clerk-success', {
              user: result.user,
              timestamp: new Date().toISOString()
            });
          }

          // Show and focus main window
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }

        } else {
          console.error('❌ Clerk direct link authentication failed:', result.error);

          // Show error dialog
          if (mainWindow) {
            dialog.showErrorBox(
              'Authentication Failed',
              result.error || 'Failed to complete authentication. Please try again.'
            );
          }

          // Notify renderer of error
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth:clerk-error', {
              error: result.error,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      return;
    }

    // ========================================================================
    // SUPABASE OAUTH (LEGACY): hintify://auth?token=...&refresh_token=...
    // ========================================================================
    // Fix: When using hintify://auth, the URL parser might see 'auth' as the host
    const isSupabaseCallback =
      pathname === '//auth' ||
      pathname === '/auth' ||
      (urlObj.host === 'auth' && (pathname === '/' || pathname === ''));

    if (isSupabaseCallback) {
      const searchParams = urlObj.searchParams;
      const accessToken = searchParams.get('token') || searchParams.get('access_token');
      const refreshToken = searchParams.get('refresh_token');
      const userDataStr = searchParams.get('user');
      const expiresIn = searchParams.get('expires_in');
      const tokenType = searchParams.get('token_type');

      console.log('🔗 Supabase OAuth callback received:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        hasUserData: !!userDataStr
      });

      if (accessToken && refreshToken) {
        console.log('🔐 Supabase authentication tokens received via deep link');

        // Parse user data
        let userData = null;
        if (userDataStr) {
          try {
            userData = JSON.parse(decodeURIComponent(userDataStr));
            console.log('👤 User data parsed:', {
              id: userData.id,
              email: userData.email,
              name: userData.name
            });
          } catch (error) {
            console.warn('⚠️ Failed to parse user data from deep link:', error);
          }
        }

        // Process the authentication tokens
        await processDeepLinkAuth({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: parseInt(expiresIn) || 3600,
          token_type: tokenType || 'bearer',
          user: userData
        });

        // Show main window and focus it
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }

      } else {
        console.warn('⚠️ Deep link missing required authentication tokens');

        if (mainWindow) {
          dialog.showErrorBox(
            'Authentication Error',
            'The authentication link is missing required information. Please try signing in again from the website.'
          );
        }
      }

      return;
    }

    // Unknown deep link path
    console.warn('⚠️ Unknown deep link path:', pathname);

  } catch (error) {
    console.error('❌ Error processing deep link:', error);

    if (mainWindow) {
      dialog.showErrorBox(
        'Deep Link Error',
        `There was an error processing the authentication link: ${error.message || String(error)}\n\nPlease try again.`
      );
    }
  }
}

// Process authentication tokens from deep link
async function processDeepLinkAuth(tokens) {
  try {
    console.log('🔐 Processing deep link authentication tokens...');

    if (!supabaseService) {
      throw new Error('Supabase service not initialized');
    }

    // Set the session in Supabase
    const sessionData = await supabaseService.setSession(tokens.access_token, tokens.refresh_token);

    let userData;

    // Use user data from deep link if available, otherwise fetch from Supabase
    if (tokens.user && tokens.user.id && tokens.user.email) {
      console.log('📦 Using user data from deep link');
      userData = {
        id: tokens.user.id,
        email: tokens.user.email,
        name: tokens.user.name || tokens.user.firstName,
        firstName: tokens.user.firstName,
        lastName: tokens.user.lastName,
        avatar: tokens.user.avatar,
        supabase_user_id: tokens.user.id
      };
    } else {
      console.log('🔍 Fetching user data from Supabase');
      // Get user data from Supabase
      const user = await supabaseService.getCurrentUser();
      if (!user) {
        throw new Error('Failed to get user data from Supabase');
      }

      // Extract user data in the format expected by AuthService
      userData = supabaseService.extractUserData(user, sessionData.session);
    }

    // Store tokens securely
    store.set('supabase_access_token', tokens.access_token);
    store.set('supabase_refresh_token', tokens.refresh_token);
    store.set('supabase_token_expires_at', Date.now() + (tokens.expires_in * 1000));

    // Process authentication through existing auth service
    if (authService) {
      await authService.processAuthentication(userData);
    }

    // Update local storage
    store.set('user_authenticated', true);
    store.set('user_info', userData);
    store.set('last_auth_time', new Date().toISOString());

    // Notify main window of successful authentication
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-status-updated', {
        authenticated: true,
        user: userData,
        timestamp: new Date().toISOString(),
        source: 'deeplink'
      });
    }

  } catch (error) {
    console.error('❌ Error processing deep link authentication:', error);
    throw error;
  }
}

// Auto-update setup (uses electron-updater if available)
// Configured for public GitHub repository - no authentication required
function setupAutoUpdater() {
  // Completely disable auto-updater in development mode
  if (isDevelopment || !app.isPackaged) {
    console.log('🚫 AutoUpdater: Disabled in development mode');
    return;
  }

  if (!autoUpdater) {
    console.log('AutoUpdater: Not available in this build');
    return;
  }

  try {
    console.log('🔄 Setting up auto-updater for public GitHub repository...');

    // Configure updater for public repository
    autoUpdater.autoDownload = false; // we'll download when user clicks
    autoUpdater.allowDowngrade = false;

    // No authentication needed for public repository
    console.log('✅ Auto-updater configured for public repository: AryanVBW/Hintify-app');

    // Forward updater events to renderer
    autoUpdater.on('checking-for-update', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
          version: info?.version,
          releaseName: info?.releaseName,
          releaseNotes: info?.releaseNotes
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-not-available', { currentVersion: app.getVersion() });
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('AutoUpdater error:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', { message: err?.message || String(err) });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-download-progress', {
          percent: progress?.percent || 0,
          transferred: progress?.transferred,
          total: progress?.total,
          bytesPerSecond: progress?.bytesPerSecond
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('✅ Update downloaded:', info?.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', { version: info?.version });
      }
      // Small delay to allow UI to update, then install
      setTimeout(() => {
        console.log('🔄 Installing update...');
        try { autoUpdater.quitAndInstall(false, true); } catch { }
      }, 1200);
    });

    // Periodic checks (every 6 hours) for public repository
    setInterval(() => {
      console.log('🔄 Periodic update check...');
      try { autoUpdater.checkForUpdates(); } catch { }
    }, 6 * 60 * 60 * 1000);

    console.log('✅ Auto-updater event listeners configured');
  } catch (e) {
    console.error('❌ Failed to initialize auto-updater:', e?.message || e);
  }
}

function setupApp() {
  // Check authentication status
  const authStatus = checkAuthStatus();
  const config = loadConfig();

  console.log('🚀 App setup:', {
    isAuthenticated: authStatus.authenticated
  });

  // Initialize authentication from storage (Supabase)
  authService.initializeFromStorage(store).then(authInitialized => {
    if (authInitialized) {
      console.log('🔄 Supabase authentication restored from storage');
    }
  }).catch(error => {
    console.error('❌ Failed to initialize Supabase authentication:', error);
  });

  // Initialize Clerk authentication from storage
  clerkAuthService.restoreSession().then(userData => {
    if (userData) {
      console.log('🔄 Clerk authentication restored from storage');

      // Notify renderer if main window exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:clerk-status-changed', {
          authenticated: true,
          user: userData
        });
      }
    }
  }).catch(error => {
    console.error('❌ Failed to restore Clerk session:', error);
  });

  // Create and show main window
  createMainWindow();

  // Handle deep link if one was received during startup
  if (deeplinkingUrl) {
    console.log('🔗 Processing startup deep link:', deeplinkingUrl);
    handleDeepLink(deeplinkingUrl);
    deeplinkingUrl = null; // Clear after processing
  }

  // Set up menu
  const menu = Menu.buildFromTemplate(createMenuTemplate());
  Menu.setApplicationMenu(menu);

  // Register global shortcuts
  registerGlobalShortcuts();

  // Start periodic sync of pending data transfers
  setInterval(async () => {
    try {
      await portalService.syncPendingTransfers();
    } catch (error) {
      console.debug('Periodic sync failed (non-fatal):', error?.message || error);
    }
  }, 300000); // Every 5 minutes
}

// ============================================================================
// PROTOCOL REGISTRATION FOR DEEP LINKING
// ============================================================================
// Register both hintify:// (legacy Supabase) and myapp:// (Clerk OAuth) protocols
//
// Platform-specific behavior:
// - macOS: Protocols are registered via Info.plist (configured in package.json build settings)
// - Windows: Protocols are registered in the Windows Registry during installation
// - Linux: Protocols are registered via .desktop files
//
// Single instance lock ensures only one app instance runs at a time
// This is critical for deep link handling - when a deep link is triggered:
// - If app is not running: App launches and receives URL via process.argv
// - If app is already running: 'second-instance' event fires with the URL
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  console.log('⚠️ Another instance is already running, quitting...');
  app.quit();
} else {
  // Register protocols for deep linking
  if (process.defaultApp) {
    // Development mode - register with electron executable path
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('hintify', process.execPath, [path.resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    // Production mode - register normally
    app.setAsDefaultProtocolClient('hintify');
    app.setAsDefaultProtocolClient('myapp');
  }

  console.log('✅ Protocols registered: hintify://, myapp://');
}

// ============================================================================
// DEEP LINK HANDLERS
// ============================================================================

/**
 * Handle deep linking on Windows/Linux
 *
 * When a deep link is triggered while the app is already running,
 * this event fires with the command line arguments including the URL.
 *
 * This is part of the single instance lock mechanism - when a second
 * instance tries to launch, we focus the existing window and handle
 * the deep link instead of launching a new instance.
 */
app.on('second-instance', (event, commandLine) => {
  console.log('🔗 Second instance detected, handling deep link...');

  // Someone tried to run a second instance, focus our window instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  // Handle deep link from command line
  // Support both hintify:// and myapp:// protocols
  const url = commandLine.find(arg => arg.startsWith('hintify://') || arg.startsWith('myapp://'));
  if (url) {
    console.log('🔗 Deep link URL from second instance:', url);
    handleDeepLink(url);
  }
});

/**
 * Handle deep linking on macOS
 *
 * macOS uses the 'open-url' event to handle custom protocol URLs.
 * This event fires when:
 * 1. User clicks a custom protocol link (hintify:// or myapp://)
 * 2. Another app opens a URL with our custom protocol
 *
 * The event is fired regardless of whether the app is already running.
 */
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('🔗 Deep link URL from macOS:', url);
  handleDeepLink(url);
});

// App event handlers
app.whenReady().then(async () => {
  // Clear caches in development before any initialization
  await clearDevCachesIfDev();

  // About panel with author credit
  if (app.setAboutPanelOptions) {
    app.setAboutPanelOptions({
      applicationName: 'Hintify',
      applicationVersion: app.getVersion(),
      authors: ['AryanVBW'],
      website: 'https://github.com/AryanVBW/Hintify',
      copyright: '© 2025 AryanVBW — demo@hintify.app'
    });
  }
  // Register IPC handlers after app is ready
  registerIpcHandlers();

  // Handle deep link from command line arguments (Windows/Linux)
  // Support both hintify:// and myapp:// protocols
  const url = process.argv.find(arg => arg.startsWith('hintify://') || arg.startsWith('myapp://'));
  if (url) {
    console.log('🔗 Deep link URL from command line:', url);
    deeplinkingUrl = url;
  }

  setupApp();

  // Initial update check for public repository (no token needed)
  // Only run in production (packaged app)
  if (!isDevelopment && app.isPackaged) {
    try {
      if (autoUpdater) {
        console.log('🔄 Scheduling initial update check in 3 seconds...');
        setTimeout(() => {
          console.log('🔍 Performing initial update check...');
          try { autoUpdater.checkForUpdates(); } catch (e) {
            console.error('❌ Initial update check failed:', e);
          }
        }, 3000);
      }
    } catch (e) {
      console.error('❌ Failed to schedule initial update check:', e);
    }
  } else {
    console.log('🚫 Initial update check: Skipped (development mode)');
  }

  // Run migrations on version change
  try {
    const currentVersion = app.getVersion();
    const lastVersion = store.get('last_run_version');
    if (lastVersion && lastVersion !== currentVersion) {
      performMigrations(lastVersion, currentVersion);
    }
    store.set('last_run_version', currentVersion);
  } catch { }

  // Initialize auto-updater and perform an initial check (if not dismissed recently)
  // Only in production mode
  setupAutoUpdater();
  if (!isDevelopment && app.isPackaged) {
    try {
      if (autoUpdater) {
        const dismissedUntil = store.get('update_dismissed_until', 0);
        if (!dismissedUntil || Date.now() > dismissedUntil) {
          autoUpdater.checkForUpdates();
        }
      }
    } catch { }
  }


  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

app.on('activate', () => {


  if (mainWindow === null) {
    createMainWindow();
  }
});

// Export for use in renderer processes
module.exports = {
  loadConfig,
  saveConfig,
  createSettingsWindow
};
