/**
 * Preload Script - Secure IPC Bridge for Clerk Authentication
 * 
 * This script runs in a privileged context with access to both Node.js APIs
 * and the renderer's DOM. It uses Electron's contextBridge to expose a secure
 * API to the renderer process.
 * 
 * Security Features:
 * - Context isolation enabled: Renderer cannot directly access Node.js APIs
 * - Selective API exposure: Only specific, validated functions are exposed
 * - No direct token access in renderer: Tokens are managed in main process
 * - IPC validation: All messages are validated before processing
 * 
 * Why this is secure:
 * - Prevents XSS attacks from accessing Node.js APIs
 * - Limits attack surface by exposing only necessary functions
 * - Tokens never leave the main process or system keychain
 * - Renderer can only trigger actions, not access sensitive data directly
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose secure Clerk authentication API to renderer
 * 
 * This API is available in the renderer as window.clerkAuth
 * 
 * Example usage in renderer:
 * ```javascript
 * // Start login
 * const result = await window.clerkAuth.startLogin();
 * 
 * // Get auth status
 * const status = await window.clerkAuth.getAuthStatus();
 * 
 * // Logout
 * await window.clerkAuth.logout();
 * 
 * // Listen for auth events
 * window.clerkAuth.onAuthSuccess((user) => {
 *   console.log('User logged in:', user);
 * });
 * ```
 */
contextBridge.exposeInMainWorld('clerkAuth', {
  /**
   * Start Clerk OAuth login flow
   * 
   * This will:
   * 1. Generate a secure state parameter in the main process
   * 2. Open the system browser to the authentication page
   * 3. Wait for the callback via deep link
   * 
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  startLogin: () => ipcRenderer.invoke('auth:start-clerk-login'),

  /**
   * Get current Clerk authentication status
   * 
   * @returns {Promise<{success: boolean, authenticated: boolean, user?: object, sessionValid?: boolean}>}
   */
  getAuthStatus: () => ipcRenderer.invoke('auth:get-clerk-status'),

  /**
   * Sign out from Clerk
   * 
   * This will:
   * 1. Clear credentials from system keychain
   * 2. Clear session state
   * 3. Trigger auth status change event
   * 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  logout: () => ipcRenderer.invoke('auth:clerk-logout'),

  /**
   * Listen for successful authentication
   * 
   * @param {Function} callback - Called with user data when authentication succeeds
   * @returns {Function} Cleanup function to remove the listener
   */
  onAuthSuccess: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('auth:clerk-success', listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('auth:clerk-success', listener);
    };
  },

  /**
   * Listen for authentication errors
   * 
   * @param {Function} callback - Called with error data when authentication fails
   * @returns {Function} Cleanup function to remove the listener
   */
  onAuthError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('auth:clerk-error', listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('auth:clerk-error', listener);
    };
  },

  /**
   * Listen for authentication status changes
   * 
   * @param {Function} callback - Called when auth status changes (login/logout)
   * @returns {Function} Cleanup function to remove the listener
   */
  onAuthStatusChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('auth:clerk-status-changed', listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('auth:clerk-status-changed', listener);
    };
  }
});

/**
 * Expose legacy Supabase authentication API for backward compatibility
 * 
 * This maintains compatibility with existing code while we transition to Clerk
 */
contextBridge.exposeInMainWorld('supabaseAuth', {
  /**
   * Start Supabase OAuth login flow (legacy)
   */
  startLogin: () => ipcRenderer.invoke('open-browser-auth'),

  /**
   * Get Supabase authentication status (legacy)
   */
  getAuthStatus: () => ipcRenderer.invoke('get-auth-status'),

  /**
   * Sign out from Supabase (legacy)
   */
  logout: () => {
    ipcRenderer.send('user-logged-out');
    return Promise.resolve({ success: true });
  },

  /**
   * Listen for Supabase auth status updates (legacy)
   */
  onAuthStatusUpdated: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('auth-status-updated', listener);
    
    return () => {
      ipcRenderer.removeListener('auth-status-updated', listener);
    };
  }
});

/**
 * Expose general app API
 * 
 * This provides access to common app functionality that doesn't involve
 * sensitive authentication data
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Get app version
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Open external URL in system browser
   */
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),

  /**
   * Show notification
   */
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  /**
   * Get platform information
   */
  getPlatform: () => process.platform,

  /**
   * Check if app is packaged
   */
  isPackaged: () => ipcRenderer.invoke('is-packaged-app')
});

console.log('✅ Preload script loaded - Secure IPC bridge established');

