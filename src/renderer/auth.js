const { ipcRenderer, shell } = require('electron');
const Store = require('electron-store');
const path = require('path');

// Initialize store
const store = new Store();

// Load app images with proper paths
function loadAppImages() {
    try {
        const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
        const basePath = isDev ? '../../assets/' : (process.resourcesPath + '/assets/');
        
        console.log('Loading images in', isDev ? 'development' : 'production', 'mode from:', basePath);
        
        // Set logo image
        const appLogo = document.getElementById('app-logo');
        if (appLogo) {
            appLogo.src = path.join(basePath, 'logo_m.png');
        }
    } catch (error) {
        console.error('Error loading app images:', error);
        // Fallback: try to load with relative paths
        const appLogo = document.getElementById('app-logo');
        if (appLogo) appLogo.src = '../../assets/logo_m.png';
    }
}

// Update status text
function updateStatus(text) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

// Handle sign-in button click
function handleSignIn() {
    const signInBtn = document.getElementById('sign-in-btn');
    if (!signInBtn) return;

    // Add loading state
    signInBtn.classList.add('loading');
    signInBtn.disabled = true;
    updateStatus('Opening Hintify website...');

    // Open the website for authentication
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
    const websiteUrl = isDev 
        ? 'http://localhost:3000/auth-success?source=app'
        : 'https://hintify-h4q78ezmn-aryanvbws-projects.vercel.app/auth-success?source=app';
    
    console.log('Opening website URL:', websiteUrl, '(dev mode:', isDev, ')');
    
    shell.openExternal(websiteUrl).then(() => {
        updateStatus('Please complete sign-in in your browser');
        
        // Reset button after a delay
        setTimeout(() => {
            signInBtn.classList.remove('loading');
            signInBtn.disabled = false;
            updateStatus('Waiting for authentication...');
        }, 2000);
    }).catch((error) => {
        console.error('Failed to open website:', error);
        updateStatus('Failed to open website. Please try again.');
        signInBtn.classList.remove('loading');
        signInBtn.disabled = false;
    });
}

// Check authentication status
function checkAuthStatus() {
    // Check if user is authenticated (we'll implement this with deep linking)
    const isAuthenticated = store.get('user_authenticated', false);
    const userInfo = store.get('user_info', null);
    
    if (isAuthenticated && userInfo) {
        updateStatus('Authentication verified! Opening app...');
        
        // Send message to main process to show main window
        setTimeout(() => {
            ipcRenderer.send('auth-completed', userInfo);
        }, 1000);
    } else {
        updateStatus('Ready to sign in');
    }
}

// Listen for authentication updates from main process
ipcRenderer.on('auth-status-updated', (event, authData) => {
    console.log('🔄 Auth status update received:', authData);
    
    if (authData.authenticated && authData.user) {
        const user = authData.user;
        
        // Log received user data for debugging
        console.log('✅ User authenticated successfully:', {
            id: user.id,
            email: user.email,
            name: user.name,
            hasImage: !!user.imageUrl,
            provider: user.provider,
            allFields: Object.keys(user)
        });
        
        updateStatus('Authentication successful!');
        
        // Save auth status with all received data
        store.set('user_authenticated', true);
        store.set('user_info', user);
        
        // Show success message with user details
        const userName = user.name || user.email || user.firstName || 'User';
        setTimeout(() => {
            updateStatus(`Welcome back, ${userName}!`);
        }, 500);
        
        // Close auth window and show main app
        setTimeout(() => {
            ipcRenderer.send('auth-completed', user);
        }, 2000);
    } else {
        console.log('❌ Authentication failed or incomplete data');
        updateStatus('Authentication failed. Please try again.');
    }
});

// Listen for deep link data
ipcRenderer.on('deep-link-received', (event, linkData) => {
    console.log('🔗 Deep link received in auth window:', linkData);
    
    if (linkData.action === 'auth-success' && linkData.user) {
        const user = linkData.user;
        
        // Log detailed user data for debugging
        console.log('📄 Received user data from deep link:', {
            id: user.id,
            email: user.email,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
            provider: user.provider,
            hasAccessToken: !!user.accessToken,
            allKeys: Object.keys(user)
        });
        
        // Validate user data
        if (!user.id && !user.email) {
            console.error('❌ Invalid user data: missing essential fields');
            updateStatus('Authentication failed: Invalid user data');
            return;
        }
        
        updateStatus('Authentication successful!');
        
        // Save auth data with all received information
        store.set('user_authenticated', true);
        store.set('user_info', user);
        
        // Show welcome message
        const userName = user.name || user.firstName || user.email || 'User';
        setTimeout(() => {
            updateStatus(`Welcome, ${userName}!`);
        }, 500);
        
        // Complete authentication
        setTimeout(() => {
            ipcRenderer.send('auth-completed', user);
        }, 1500);
    } else {
        console.log('❌ Invalid deep link data:', linkData);
        updateStatus('Authentication failed: Invalid data received');
    }
});

// Initialize the auth screen
function initializeAuth() {
    console.log('🔐 Initializing authentication screen...');
    console.log('Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        hasDevArg: process.argv.includes('--development'),
        isDev: process.env.NODE_ENV === 'development' || process.argv.includes('--development')
    });
    
    // Load images
    loadAppImages();
    
    // Check existing auth status
    checkAuthStatus();
    
    // Set up event listeners
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
        signInBtn.addEventListener('click', handleSignIn);
    }
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSignIn();
        } else if (e.key === 'Escape') {
            // Allow user to close the app
            ipcRenderer.send('close-app');
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeAuth);

// Handle window focus (user might return from browser)
window.addEventListener('focus', () => {
    // Check if authentication completed while user was away
    checkAuthStatus();
});

// Export functions for potential use
module.exports = {
    handleSignIn,
    checkAuthStatus,
    updateStatus
};