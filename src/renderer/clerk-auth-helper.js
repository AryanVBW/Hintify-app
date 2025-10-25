/**
 * Clerk Authentication Helper for Renderer Process
 * 
 * This module provides a simple interface for Clerk OAuth authentication
 * in the renderer process. Since the app uses nodeIntegration: true and
 * contextIsolation: false, we can directly use ipcRenderer.
 * 
 * Usage:
 * ```javascript
 * const ClerkAuthHelper = require('./clerk-auth-helper');
 * const clerkAuth = new ClerkAuthHelper();
 * 
 * // Start login
 * await clerkAuth.startLogin();
 * 
 * // Listen for auth events
 * clerkAuth.on('success', (user) => {
 *   console.log('User logged in:', user);
 * });
 * 
 * clerkAuth.on('error', (error) => {
 *   console.error('Auth error:', error);
 * });
 * 
 * // Get auth status
 * const status = await clerkAuth.getAuthStatus();
 * 
 * // Logout
 * await clerkAuth.logout();
 * ```
 */

const { ipcRenderer } = require('electron');
const EventEmitter = require('events');

class ClerkAuthHelper extends EventEmitter {
  constructor() {
    super();
    
    // Set up IPC listeners for auth events
    this.setupListeners();
    
    // Track authentication state
    this.isAuthenticated = false;
    this.currentUser = null;
  }

  /**
   * Set up IPC listeners for authentication events
   * @private
   */
  setupListeners() {
    // Listen for successful authentication
    ipcRenderer.on('auth:clerk-success', (event, data) => {
      console.log('🎉 Clerk authentication successful:', data);
      
      this.isAuthenticated = true;
      this.currentUser = data.user;
      
      // Emit success event
      this.emit('success', data.user);
      this.emit('statusChanged', { authenticated: true, user: data.user });
    });

    // Listen for authentication errors
    ipcRenderer.on('auth:clerk-error', (event, data) => {
      console.error('❌ Clerk authentication error:', data);
      
      this.isAuthenticated = false;
      this.currentUser = null;
      
      // Emit error event
      this.emit('error', data.error);
      this.emit('statusChanged', { authenticated: false, user: null });
    });

    // Listen for auth status changes (login/logout)
    ipcRenderer.on('auth:clerk-status-changed', (event, data) => {
      console.log('🔄 Clerk auth status changed:', data);
      
      this.isAuthenticated = data.authenticated;
      this.currentUser = data.user;
      
      // Emit status changed event
      this.emit('statusChanged', data);
      
      if (data.authenticated) {
        this.emit('login', data.user);
      } else {
        this.emit('logout');
      }
    });
  }

  /**
   * Start Clerk OAuth login flow
   * 
   * This will:
   * 1. Generate a secure state parameter in the main process
   * 2. Open the system browser to the authentication page
   * 3. Wait for the callback via deep link
   * 
   * The authentication flow:
   * 1. User clicks "Sign in with Google" button
   * 2. This method is called, which sends IPC message to main process
   * 3. Main process generates state UUID and opens browser to:
   *    https://hintify.nexus-v.tech/auth/desktop?state=<uuid>
   * 4. Web app handles Google OAuth via Clerk
   * 5. Web app redirects to: myapp://auth/callback?token=<session_token>&state=<uuid>
   * 6. Main process receives deep link, validates state, verifies token
   * 7. Main process sends 'auth:clerk-success' event to renderer
   * 8. This helper emits 'success' event to application code
   * 
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async startLogin() {
    try {
      console.log('🔐 Starting Clerk OAuth login...');
      
      const result = await ipcRenderer.invoke('auth:start-clerk-login');
      
      if (result.success) {
        console.log('✅ Browser opened for authentication');
        this.emit('loginStarted');
      } else {
        console.error('❌ Failed to start login:', result.error);
        this.emit('error', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error starting login:', error);
      this.emit('error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current Clerk authentication status
   * 
   * @returns {Promise<{success: boolean, authenticated: boolean, user?: object, sessionValid?: boolean}>}
   */
  async getAuthStatus() {
    try {
      const result = await ipcRenderer.invoke('auth:get-clerk-status');
      
      if (result.success) {
        this.isAuthenticated = result.authenticated;
        this.currentUser = result.user;
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error getting auth status:', error);
      return { 
        success: false, 
        error: error.message,
        authenticated: false 
      };
    }
  }

  /**
   * Sign out from Clerk
   * 
   * This will:
   * 1. Clear credentials from system keychain (via keytar)
   * 2. Clear session state in main process
   * 3. Trigger auth status change event
   * 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async logout() {
    try {
      console.log('🚪 Signing out from Clerk...');
      
      const result = await ipcRenderer.invoke('auth:clerk-logout');
      
      if (result.success) {
        console.log('✅ Logout successful');
        this.isAuthenticated = false;
        this.currentUser = null;
        this.emit('logout');
      } else {
        console.error('❌ Logout failed:', result.error);
        this.emit('error', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error during logout:', error);
      this.emit('error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if user is currently authenticated
   * 
   * @returns {boolean}
   */
  isLoggedIn() {
    return this.isAuthenticated;
  }

  /**
   * Get current user data
   * 
   * @returns {object|null}
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Clean up event listeners
   * Call this when the component/page is unmounted
   */
  destroy() {
    ipcRenderer.removeAllListeners('auth:clerk-success');
    ipcRenderer.removeAllListeners('auth:clerk-error');
    ipcRenderer.removeAllListeners('auth:clerk-status-changed');
    this.removeAllListeners();
  }
}

// Export singleton instance for convenience
let instance = null;

module.exports = {
  ClerkAuthHelper,
  
  /**
   * Get singleton instance of ClerkAuthHelper
   * This ensures only one instance exists across the app
   */
  getInstance: () => {
    if (!instance) {
      instance = new ClerkAuthHelper();
    }
    return instance;
  }
};

