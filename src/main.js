const electron = require('electron');
const { app, BrowserWindow, Menu, dialog, globalShortcut, clipboard, nativeImage, shell, ipcMain, protocol } = electron;
const path = require('path');
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

// Initialize electron-store for persistent settings
const store = new Store();

// Initialize services with error handling
let authService, dbService, portalService, supabaseService;

try {
  authService = new AuthService();
  dbService = new DatabaseService();
  portalService = new PortalDataTransferService();
  supabaseService = new SupabaseService();
  console.log('✅ All services initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize services:', error.message);
  console.log('The app will continue without database functionality.');
  
  // Create mock services to prevent crashes
  authService = {
    processAuthentication: async () => ({ user: null, session: null }),
    logActivity: async () => {},
    saveQuestionAnswer: async () => ({ questionId: null, answerId: null }),
    transferDataToPortal: async () => ({ success: false, error: 'Database not available' }),
    exportUserData: async () => ({ success: false, error: 'Database not available' }),
    getUserHistory: async () => [],
    signOut: async () => {},
    requestPasswordReset: async () => ({ success: false, error: 'Service unavailable' }),
    resetPassword: async () => ({ success: false, error: 'Service unavailable' }),
    enableMFA: async () => ({ success: false, error: 'Service unavailable' }),
    verifyMFASetup: async () => ({ success: false, error: 'Service unavailable' }),
    disableMFA: async () => ({ success: false, error: 'Service unavailable' }),
    initializeFromStorage: async () => false,
    getCurrentUser: () => null,
    getCurrentSession: () => null,
    isAuthenticated: () => false
  };
}

// Global variables
let mainWindow;
let settingsWindow;
let onboardingWindow;
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

// Default configuration
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
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
  // Settings and configuration handlers
  ipcMain.on('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.on('config-updated', (event, newConfig) => {
    saveConfig(newConfig);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', newConfig);
    }
  });

  ipcMain.on('onboarding-completed', (event, config) => {
    console.log('✅ Onboarding completed with config:', config);
    saveConfig(config);
    
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close();
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', config);
      mainWindow.show();
      mainWindow.focus();
      
      // After onboarding, check if user needs to authenticate
      const authStatus = checkAuthStatus();
      if (!authStatus.authenticated) {
        console.log('🔐 Onboarding complete, but user needs to authenticate');
        // The main window will show the auth UI automatically
      }
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
  ipcMain.handle('log-activity', async (event, featureName, action, details) => {
    try {
      await authService.logActivity(featureName, action, details);
      return { success: true };
    } catch (error) {
      console.error('Failed to log activity:', error);
      return { success: false, error: error.message };
    }
  });
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: true
  },
  icon: resolveAsset('logo_m.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Hintify SnapAssist AI',
    show: false // Don't show until ready
  });

  // Load the main HTML file
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Handle window ready-to-show
  mainWindow.once('ready-to-show', () => {
    // Ensure dock icon set on macOS
    if (process.platform === 'darwin') {
      try {
        const dockImg = nativeImage.createFromPath(resolveAsset('logo_m.png'));
        if (!dockImg.isEmpty()) app.dock.setIcon(dockImg);
      } catch {}
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

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 460,
    height: 500,
    resizable: false,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
  },
  icon: resolveAsset('logo_m.png'),
    title: 'Settings - Hintify SnapAssist AI'
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // Remove menu bar for settings window
  settingsWindow.setMenuBarVisibility(false);
  
  // Enable dev tools for debugging if needed
  if (isDevelopment) {
    settingsWindow.webContents.openDevTools();
  }
}

function createOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return;
  }

  onboardingWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    resizable: true,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
  },
  icon: resolveAsset('logo_m.png'),
    title: 'Setup - Hintify SnapAssist AI',
    show: false
  });

  onboardingWindow.loadFile(path.join(__dirname, 'renderer', 'onboarding.html'));

  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow.show();
    
    if (isDevelopment) {
      onboardingWindow.webContents.openDevTools();
    }
  });

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
    // Show main window when onboarding is closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Remove menu bar for onboarding window
  onboardingWindow.setMenuBarVisibility(false);
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
        {
          label: 'Run Setup Again...',
          click: () => {
            // Reset onboarding completed flag and show onboarding
            store.set('onboarding_completed', false);
            createOnboardingWindow();
          }
        },
        { type: 'separator' },
        // Add auth-related menu items
        authStatus.authenticated ? {
          label: `Sign Out (${authStatus.user?.name || authStatus.user?.email || 'User'})`,
          click: () => {
            // End backend session
            Promise.resolve().then(() => authService.signOut()).catch(() => {});

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
          label: 'Hide SnapAssist AI',
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

// Handle deep link authentication
async function handleDeepLink(url) {
  try {
    console.log('🔗 Processing deep link:', url);

    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const pathname = urlObj.pathname;

    if (protocol !== 'hintify:') {
      console.warn('⚠️ Invalid protocol for deep link:', protocol);
      return;
    }

    // Handle authentication deep link
    if (pathname === '//auth' || pathname === '/auth') {
      const searchParams = urlObj.searchParams;
      const accessToken = searchParams.get('token') || searchParams.get('access_token'); // Support both formats
      const refreshToken = searchParams.get('refresh_token');
      const userDataStr = searchParams.get('user');
      const expiresIn = searchParams.get('expires_in');
      const tokenType = searchParams.get('token_type');

      console.log('🔗 Deep link parameters received:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        hasUserData: !!userDataStr,
        accessTokenLength: accessToken?.length,
        refreshTokenLength: refreshToken?.length
      });

      if (accessToken && refreshToken) {
        console.log('🔐 Authentication tokens received via deep link');

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

        // Auth window no longer used - authentication handled via browser

      } else {
        console.warn('⚠️ Deep link missing required authentication tokens');

        // Show error dialog
        if (mainWindow) {
          dialog.showErrorBox(
            'Authentication Error',
            'The authentication link is missing required information. Please try signing in again from the website.'
          );
        }
      }
    } else {
      console.warn('⚠️ Unknown deep link path:', pathname);
    }

  } catch (error) {
    console.error('❌ Error processing deep link:', error);

    if (mainWindow) {
      dialog.showErrorBox(
        'Deep Link Error',
        'There was an error processing the authentication link. Please try again.'
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

    console.log('✅ Deep link authentication processed successfully');

  } catch (error) {
    console.error('❌ Error processing deep link authentication:', error);
    throw error;
  }
}

function setupApp() {
  // Check authentication status and onboarding status
  const authStatus = checkAuthStatus();
  const config = loadConfig();
  const isFirstRun = !config.onboarding_completed;
  
  console.log('🚀 App setup:', {
    isAuthenticated: authStatus.authenticated,
    isFirstRun,
    onboardingCompleted: config.onboarding_completed
  });
  
  // Initialize authentication from storage
  authService.initializeFromStorage(store).then(authInitialized => {
    if (authInitialized) {
      console.log('🔄 Authentication restored from storage');
    }
  }).catch(error => {
    console.error('❌ Failed to initialize authentication:', error);
  });
  
  // Create main window
  createMainWindow();
  
  // Priority order:
  // 1. First-time users see onboarding (regardless of auth)
  // 2. Authenticated users see main app
  // 3. Non-authenticated users see sign-in in main app
  if (isFirstRun) {
    console.log('🚀 First run detected - showing onboarding wizard');
    // Hide main window and show onboarding for first-time users
    if (mainWindow) {
      mainWindow.hide();
    }
    createOnboardingWindow();
  } else {
    console.log('🛠️ Returning user - showing main app');
    // Show main window - it will handle auth state internally
    if (mainWindow) {
      mainWindow.show();
    }
  }

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

// Protocol registration for deep linking
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('hintify', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('hintify');
}

// Handle deep linking on Windows/Linux
app.on('second-instance', (event, commandLine) => {
  console.log('🔗 Second instance detected, handling deep link...');

  // Someone tried to run a second instance, focus our window instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  // Handle deep link from command line
  const url = commandLine.find(arg => arg.startsWith('hintify://'));
  if (url) {
    console.log('🔗 Deep link URL from second instance:', url);
    handleDeepLink(url);
  }
});

// Handle deep linking on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('🔗 Deep link URL from macOS:', url);
  handleDeepLink(url);
});

// App event handlers
app.whenReady().then(() => {
  // About panel with author credit
  if (app.setAboutPanelOptions) {
    app.setAboutPanelOptions({
      applicationName: 'Hintify SnapAssist AI',
      applicationVersion: app.getVersion(),
      authors: ['AryanVBW'],
      website: 'https://github.com/AryanVBW/Hintify',
      copyright: '© 2025 AryanVBW — demo@hintify.app'
    });
  }
  // Register IPC handlers after app is ready
  registerIpcHandlers();

  // Handle deep link from command line arguments (Windows/Linux)
  const url = process.argv.find(arg => arg.startsWith('hintify://'));
  if (url) {
    console.log('🔗 Deep link URL from command line:', url);
    deeplinkingUrl = url;
  }

  setupApp();

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
