const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const path = require('path');

// Load environment variables
try {
    require('dotenv').config({
        path: path.resolve(__dirname, '../../.env.local')
    });
} catch (e) {
    console.debug('dotenv not loaded in renderer (non-fatal):', e?.message || e);
}

// Initialize store
const store = new Store();

// Authentication state
let authState = {
    user: null,
    session: null,
    isAuthenticated: false
};

// UI Helper Functions
function showLoading(message = 'Loading...') {
    const loadingDiv = document.getElementById('loading');
    const statusDiv = document.getElementById('status');
    
    if (loadingDiv) {
        loadingDiv.style.display = 'block';
        loadingDiv.textContent = message;
    }
    
    if (statusDiv) {
        statusDiv.textContent = message;
    }
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

function showError(title, message) {
    const errorDiv = document.getElementById('error');
    const errorTitleDiv = document.getElementById('error-title');
    const errorMessageDiv = document.getElementById('error-message');
    
    if (errorDiv) errorDiv.style.display = 'block';
    if (errorTitleDiv) errorTitleDiv.textContent = title;
    if (errorMessageDiv) errorMessageDiv.textContent = message;
    
    console.error(`${title}: ${message}`);
}

function hideError() {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function updateStatus(message) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
    }
    console.log(`Status: ${message}`);
}

// Load app images
function loadAppImages() {
    const logoImg = document.getElementById('app-logo');
    if (logoImg) {
        logoImg.src = path.join(__dirname, '../../assets/logo.png');
        logoImg.onerror = () => {
            console.warn('Logo image not found, using fallback');
            logoImg.style.display = 'none';
        };
    }
}

// Check authentication status with main process
async function checkAuthStatus() {
    try {
        const authStatus = await ipcRenderer.invoke('get-auth-status');
        console.log('🔍 Auth status from main process:', authStatus);
        
        if (authStatus?.isAuthenticated && authStatus?.user) {
            console.log('✅ User already authenticated');
            authState.user = authStatus.user;
            authState.isAuthenticated = true;
            
            // Close auth window and return to main app
            ipcRenderer.send('auth-completed', authStatus.user);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Failed to check auth status:', error);
        return false;
    }
}

// Handle successful authentication
function handleAuthSuccess(user, session) {
    console.log('✅ Authentication successful:', {
        userId: user?.id,
        email: user?.email,
        provider: user?.provider || 'supabase'
    });
    
    authState.user = user;
    authState.session = session;
    authState.isAuthenticated = true;
    
    // Update UI
    updateStatus('Authentication successful! Redirecting...');
    hideError();
    hideLoading();
    
    // Send to main process
    ipcRenderer.send('auth-completed', user);
}

// Handle authentication failure
function handleAuthError(error) {
    console.error('❌ Authentication failed:', error);
    
    authState.user = null;
    authState.session = null;
    authState.isAuthenticated = false;
    
    // Update UI
    showError('Authentication Failed', error.message || 'An unexpected error occurred');
    hideLoading();
    updateStatus('Authentication failed');
}

// Initialize Supabase authentication UI
function initializeSupabaseAuth() {
    console.log('🚀 Initializing Supabase authentication...');
    
    // Hide legacy authentication containers (if they exist)
    const legacySignIn = document.getElementById('clerk-signin');
    const legacySignUp = document.getElementById('clerk-signup');
    if (legacySignIn) legacySignIn.style.display = 'none';
    if (legacySignUp) legacySignUp.style.display = 'none';
    
    // Show Supabase authentication UI
    const authActions = document.querySelector('.auth-actions');
    if (authActions) {
        authActions.innerHTML = `
            <div class="supabase-auth-container">
                <div class="auth-message">
                    <h3>Sign in to Hintify</h3>
                    <p>Choose your preferred sign-in method in the browser</p>
                </div>

                <button id="browser-signin-btn" class="btn btn-primary">
                    <span class="btn-text">Open Sign In Page</span>
                    <span class="btn-icon">🌐</span>
                </button>

                <div class="auth-note">
                    <p>You can sign in with <strong>Google</strong> or <strong>Email</strong> in the browser</p>
                    <p class="text-sm">After signing in, click "Open App" to return here</p>
                </div>
            </div>
        `;
        
        // Add event listener for browser sign-in
        const browserSignInBtn = document.getElementById('browser-signin-btn');
        if (browserSignInBtn) {
            browserSignInBtn.addEventListener('click', handleBrowserSignIn);
        }
    }
    
    updateStatus('Ready to sign in');
}

// Handle browser sign-in
async function handleBrowserSignIn() {
    try {
        console.log('🌐 Opening browser for authentication...');
        showLoading('Opening browser for sign-in...');
        
        // Send request to main process to open browser
        const result = await ipcRenderer.invoke('open-browser-auth');
        
        if (result?.success) {
            updateStatus('Please complete sign-in in your browser...');
            // The main process will handle the deep link callback
        } else {
            throw new Error(result?.error || 'Failed to open browser authentication');
        }
        
    } catch (error) {
        console.error('❌ Browser sign-in failed:', error);
        handleAuthError(error);
    }
}

// Listen for authentication events from main process
ipcRenderer.on('auth-status-updated', (event, data) => {
    console.log('📡 Auth status updated:', data);
    
    if (data.authenticated && data.user) {
        handleAuthSuccess(data.user, data.session);
    } else {
        handleAuthError(new Error('Authentication was cancelled or failed'));
    }
});

// Listen for deep link authentication
ipcRenderer.on('deep-link-auth', (event, data) => {
    console.log('🔗 Deep link authentication received:', data);
    
    if (data.success && data.user) {
        handleAuthSuccess(data.user, data.session);
    } else {
        handleAuthError(new Error(data.error || 'Deep link authentication failed'));
    }
});

// Initialize the auth screen
async function initializeAuth() {
    console.log('🔐 Initializing Supabase authentication screen...');
    
    // Load images
    loadAppImages();
    
    // Check existing auth status first
    const isAlreadyAuthenticated = await checkAuthStatus();
    if (isAlreadyAuthenticated) {
        return; // User is already authenticated, auth window will close
    }
    
    // Initialize Supabase authentication UI
    initializeSupabaseAuth();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeAuth);

// Handle window focus
window.addEventListener('focus', () => {
    // Check if authentication completed while user was away
    checkAuthStatus();
});

// Export functions for potential use
module.exports = {
    initializeSupabaseAuth: initializeSupabaseAuth,
    handleAuthSuccess,
    handleAuthError,
    checkAuthStatus,
    updateStatus,
    showError,
    hideError
};
