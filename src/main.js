const { app, BrowserWindow, Menu, dialog, globalShortcut, clipboard, nativeImage, shell, ipcMain, protocol } = require('electron');
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

// Initialize electron-store for persistent settings
const store = new Store();

// Initialize services with error handling
let authService, dbService, portalService;

try {
  authService = new AuthService();
  dbService = new DatabaseService();
  portalService = new PortalDataTransferService();
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
let authWindow;
let isDevelopment = process.argv.includes('--development') || process.env.NODE_ENV === 'development';
let deeplinkingUrl;

// Protocol for deep linking
const PROTOCOL = 'hintify';

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

// IPC handlers
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

// Auth-related IPC handlers
ipcMain.on('auth-completed', async (event, userInfo) => {
  try {
    // Process authentication through AuthService
    const authResult = await authService.processAuthentication(userInfo);
    
    // Save authentication status to store
    store.set('user_authenticated', true);
    store.set('user_info', authResult.user);
    
    // Close auth window
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    
    // Notify main window of auth status change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth-status-updated', {
        authenticated: true,
        user: authResult.user
      });
    }
    
    // Show main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    
    console.log('✅ Authentication completed and stored in database');
  } catch (error) {
    console.error('❌ Authentication processing failed:', error);
  }
});

ipcMain.on('show-auth-window', () => {
  console.log('🔐 Auth window requested from main app');
  createAuthWindow();
});

ipcMain.on('user-logged-out', async () => {
  console.log('🚪 User logged out');
  
  try {
    // Sign out through AuthService
    await authService.signOut();
    
    // Clear stored auth data
    store.set('user_authenticated', false);
    store.delete('user_info');
    
    console.log('✅ User signed out and session ended');
  } catch (error) {
    console.error('❌ Sign out error:', error);
  }
});

ipcMain.on('close-app', () => {
  app.quit();
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
      enableRemoteModule: true
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

function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: 600,
    height: 800,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: resolveAsset('logo_m.png'),
    title: 'Sign In - Hintify SnapAssist AI',
    show: false
  });

  authWindow.loadFile(path.join(__dirname, 'renderer', 'auth.html'));

  authWindow.once('ready-to-show', () => {
    authWindow.show();
    
    if (isDevelopment) {
      authWindow.webContents.openDevTools();
    }
  });

  authWindow.on('closed', () => {
    authWindow = null;
  });

  // Remove menu bar for auth window
  authWindow.setMenuBarVisibility(false);
  
  return authWindow;
}

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
              createAuthWindow();
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

// Handle deep link
async function handleDeepLink(url) {
  console.log('Deep link received:', url);
  
  if (!url || !url.startsWith(`${PROTOCOL}://`)) {
    return;
  }
  
  try {
    const urlObj = new URL(url);
    const action = urlObj.pathname.slice(1); // Remove leading '/'
    const params = Object.fromEntries(urlObj.searchParams);
    
    console.log('Deep link action:', action, 'params:', params);
    
    if (action === 'auth-success') {
      // Extract user data from URL parameters with comprehensive fallbacks
      const userData = {
        id: params.userId || params.user_id || params.id,
        email: params.email || params.userEmail || params.emailAddress,
        name: params.name || params.fullName || params.userName || params.displayName,
        firstName: params.firstName || params.first_name,
        lastName: params.lastName || params.last_name,
        imageUrl: params.imageUrl || params.image_url || params.avatar || params.picture,
        username: params.username,
        provider: params.provider || 'unknown',
        timestamp: params.timestamp
      };
      
      // Filter out undefined/null/empty values
      Object.keys(userData).forEach(key => {
        if (userData[key] === undefined || userData[key] === null || userData[key] === '') {
          delete userData[key];
        }
      });
      
      console.log('🔑 Authentication successful via deep link. User data:', {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        firstName: userData.firstName,
        lastName: userData.lastName,
        hasImage: !!userData.imageUrl,
        provider: userData.provider,
        username: userData.username
      });
      
      // Validate essential fields
      if (!userData.id && !userData.email) {
        console.error('❌ Invalid authentication data: missing both ID and email');
        return;
      }
      
      // Process authentication through AuthService
      try {
        const authResult = await authService.processAuthentication(userData);
        
        // Save authentication data to store
        store.set('user_authenticated', true);
        store.set('user_info', authResult.user);
        
        console.log('💾 User authenticated and stored in database:', authResult.user.id);
        
        // Immediately notify all windows of successful authentication
        const authStatusUpdate = {
          authenticated: true,
          user: authResult.user
        };
        
        [authWindow, mainWindow].forEach(window => {
          if (window && !window.isDestroyed()) {
            console.log(`📢 Sending auth update to ${window === authWindow ? 'auth' : 'main'} window`);
            
            window.webContents.send('deep-link-received', {
              action: 'auth-success',
              user: authResult.user
            });
            
            window.webContents.send('auth-status-updated', authStatusUpdate);
          }
        });
        
      } catch (authError) {
        console.error('❌ Authentication processing failed:', authError);
        // Still update store with basic info as fallback
        store.set('user_authenticated', true);
        store.set('user_info', {
          ...userData,
          authenticatedAt: new Date().toISOString()
        });
      }
      
      // Update app menu with new auth status
      const menu = Menu.buildFromTemplate(createMenuTemplate());
      Menu.setApplicationMenu(menu);
      
      // Close auth window and show main window
      if (authWindow && !authWindow.isDestroyed()) {
        console.log('🚪 Closing auth window...');
        setTimeout(() => {
          authWindow.close();
        }, 1500); // Give user time to see success message
      }
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('🎯 Focusing main window...');
        setTimeout(() => {
          mainWindow.show();
          mainWindow.focus();
        }, 500);
      }
      
      console.log('✅ Authentication completed and all systems notified');
      
    } else {
      console.log('Unknown deep link action:', action);
    }
  } catch (error) {
    console.error('❌ Error parsing deep link:', error);
  }
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
      // Silently fail for periodic sync
    }
  }, 300000); // Every 5 minutes
}

// App event handlers
app.whenReady().then(() => {
  // Ensure single instance for better deep link handling
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  // Register protocol for deep linking
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
  
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
  setupApp();

  // Handle deep link if app was opened with one
  if (process.argv.length >= 2) {
    const url = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log('Initial deep link:', url);
      setTimeout(() => handleDeepLink(url), 1000); // Delay to ensure windows are created
    }
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

// Handle deep link on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  deeplinkingUrl = url;
  console.log('macOS deep link:', url);
  handleDeepLink(url);
});

// Handle deep link on Windows/Linux
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Someone tried to run a second instance, focus our window instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  
  // Handle deep link from command line
  const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL}://`));
  if (url) {
    console.log('Windows/Linux deep link:', url);
    handleDeepLink(url);
  }
});

// Export for use in renderer processes
module.exports = {
  loadConfig,
  saveConfig,
  createSettingsWindow
};
