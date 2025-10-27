const keytar = require('keytar');
const { createClerkClient } = require('@clerk/backend');
const crypto = require('crypto');
const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');

/**
 * ClerkAuthService - Secure OAuth authentication bridge for Clerk
 * 
 * This service handles the OAuth flow between the Electron app and web application:
 * 1. Generates cryptographically secure state parameters to prevent CSRF attacks
 * 2. Validates Clerk session tokens using JWT verification
 * 3. Stores credentials securely using the system keychain (keytar)
 * 4. Manages session lifecycle and token refresh
 * 
 * Security Features:
 * - State parameter validation prevents CSRF/replay attacks
 * - JWT signature verification using Clerk's JWKS endpoint
 * - Secure credential storage via system keychain (macOS Keychain, Windows Credential Vault, Linux Secret Service)
 * - Token expiration and refresh handling
 * - Never logs sensitive tokens to console
 */
class ClerkAuthService {
  constructor() {
    // Service name for keychain storage
    this.SERVICE_NAME = 'com.hintify.clerk-auth';

    // Clerk configuration - load from environment variables
    this.clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    this.clerkSecretKey = process.env.CLERK_SECRET_KEY;
    this.clerkFrontendApi = this.extractFrontendApi(this.clerkPublishableKey);

    // Initialize Clerk client if secret key is available
    this.clerkClient = this.clerkSecretKey ? createClerkClient({
      secretKey: this.clerkSecretKey
    }) : null;

    // JWKS client for JWT verification
    // This fetches Clerk's public keys to verify JWT signatures
    // Only initialize if we have a frontend API configured
    this.jwksClient = null;
    if (this.clerkFrontendApi) {
      try {
        this.jwksClient = jwksClient({
          jwksUri: `https://${this.clerkFrontendApi}/.well-known/jwks.json`,
          cache: true,
          cacheMaxAge: 600000, // 10 minutes
          rateLimit: true,
          jwksRequestsPerMinute: 10
        });
      } catch (error) {
        console.warn('⚠️ Failed to initialize JWKS client:', error.message);
      }
    }

    // Active authentication state
    // The state parameter is a cryptographically secure random UUID that prevents CSRF attacks
    // by ensuring the callback matches the original request
    this.pendingAuthState = null;
    this.pendingAuthTimeout = null;
    this.AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    // Current session
    this.currentSession = null;
    this.currentUser = null;
  }

  /**
   * Extract frontend API from Clerk publishable key
   * Format: pk_test_xxx or pk_live_xxx
   */
  extractFrontendApi(publishableKey) {
    if (!publishableKey) {
      console.warn('⚠️ Clerk publishable key not configured');
      return null;
    }
    
    // Extract the domain from the publishable key
    // Clerk keys contain the frontend API domain
    const match = publishableKey.match(/pk_(test|live)_(.+)/);
    if (match) {
      // For most Clerk instances, the frontend API is in the format:
      // clerk.[your-domain].com or [instance].clerk.accounts.dev
      // We'll need to get this from environment or construct it
      return process.env.CLERK_FRONTEND_API || 'clerk.hintify.nexus-v.tech';
    }
    
    return null;
  }

  /**
   * Generate a cryptographically secure state parameter
   * This prevents CSRF attacks by ensuring the callback matches the original request
   * 
   * @returns {string} UUID v4 state parameter
   */
  generateState() {
    // crypto.randomUUID() uses cryptographically secure random number generation
    // This is critical for security - never use Math.random() for security tokens
    return crypto.randomUUID();
  }

  /**
   * Start the OAuth login flow
   *
   * This method:
   * 1. Generates a secure state parameter
   * 2. Sets a timeout to prevent indefinite waiting
   * 3. Returns the URL to open in the system browser
   *
   * @returns {Object} { state, authUrl }
   */
  startLogin() {
    // Check if Clerk is configured
    if (!this.clerkFrontendApi) {
      console.warn('⚠️ Clerk not configured - cannot start login');
      throw new Error('Clerk authentication not configured. Please set CLERK_PUBLISHABLE_KEY in .env.local');
    }

    // Generate cryptographically secure state parameter
    const state = this.generateState();
    this.pendingAuthState = state;

    // Set timeout to clear pending state after 5 minutes
    // This prevents the app from waiting indefinitely for a callback
    if (this.pendingAuthTimeout) {
      clearTimeout(this.pendingAuthTimeout);
    }

    this.pendingAuthTimeout = setTimeout(() => {
      console.log('⏰ Authentication timeout - clearing pending state');
      this.pendingAuthState = null;
    }, this.AUTH_TIMEOUT_MS);

    // Construct the authentication URL
    // The web app will handle Google OAuth via Clerk and redirect back with the token
    const authUrl = `https://hintify.nexus-v.tech/auth/desktop?state=${state}`;

    console.log('🔐 Starting Clerk OAuth flow with state parameter');
    // Never log the actual state value to prevent security issues

    return { state, authUrl };
  }

  /**
   * Validate the state parameter from the callback
   * This prevents CSRF attacks by ensuring the callback matches the original request
   * 
   * @param {string} receivedState - State parameter from the deep link callback
   * @returns {boolean} True if state is valid
   */
  validateState(receivedState) {
    if (!this.pendingAuthState) {
      console.error('❌ No pending authentication state - possible timeout or replay attack');
      return false;
    }
    
    if (this.pendingAuthState !== receivedState) {
      console.error('❌ State parameter mismatch - possible CSRF attack');
      return false;
    }
    
    // Clear the pending state and timeout
    this.pendingAuthState = null;
    if (this.pendingAuthTimeout) {
      clearTimeout(this.pendingAuthTimeout);
      this.pendingAuthTimeout = null;
    }
    
    console.log('✅ State parameter validated successfully');
    return true;
  }

  /**
   * Get signing key from JWKS endpoint
   * This is used to verify JWT signatures
   */
  async getSigningKey(kid) {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(err);
        } else {
          const signingKey = key.getPublicKey();
          resolve(signingKey);
        }
      });
    });
  }

  /**
   * Verify Clerk session token using JWT verification
   * 
   * This method verifies:
   * 1. JWT signature using Clerk's public key (from JWKS endpoint)
   * 2. Token expiration (exp claim)
   * 3. Issuer (iss claim)
   * 4. Token structure and required claims
   * 
   * @param {string} token - Clerk session token (JWT)
   * @returns {Object} Decoded and verified token payload
   */
  async verifyToken(token) {
    // Check if Clerk is configured
    if (!this.clerkFrontendApi || !this.jwksClient) {
      console.warn('⚠️ Clerk not configured - skipping token verification');
      throw new Error('Clerk authentication not configured. Please set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env.local');
    }

    try {
      // Decode the token header to get the key ID (kid)
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new Error('Invalid token structure - missing kid in header');
      }

      // Get the signing key from Clerk's JWKS endpoint
      const signingKey = await this.getSigningKey(decoded.header.kid);

      // Verify the JWT signature and claims
      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'], // Clerk uses RS256 for JWT signing
        issuer: `https://${this.clerkFrontendApi}`, // Verify the issuer
        clockTolerance: 10 // Allow 10 seconds clock skew
      });

      console.log('✅ Token verified successfully');

      return verified;
    } catch (error) {
      console.error('❌ Token verification failed:', error.message);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Alternative token verification using Clerk's backend API
   * This calls Clerk's /v1/sessions/:sessionId endpoint to verify the token
   * 
   * @param {string} sessionId - Clerk session ID
   * @returns {Object} Session data from Clerk
   */
  async verifyTokenWithClerkAPI(sessionId) {
    if (!this.clerkClient) {
      throw new Error('Clerk client not initialized - missing CLERK_SECRET_KEY');
    }
    
    try {
      const session = await this.clerkClient.sessions.getSession(sessionId);
      
      if (session.status !== 'active') {
        throw new Error(`Session is not active: ${session.status}`);
      }
      
      console.log('✅ Session verified via Clerk API');
      return session;
    } catch (error) {
      console.error('❌ Clerk API verification failed:', error.message);
      throw new Error(`Clerk API verification failed: ${error.message}`);
    }
  }

  /**
   * Process authentication callback from deep link
   * 
   * This method:
   * 1. Validates the state parameter
   * 2. Verifies the Clerk session token
   * 3. Stores credentials securely in the system keychain
   * 4. Establishes the user session
   * 
   * @param {Object} params - Callback parameters
   * @param {string} params.token - Clerk session token
   * @param {string} params.state - State parameter for CSRF protection
   * @returns {Object} { success, user, error }
   */
  async processCallback({ token, state }) {
    try {
      // Step 1: Validate state parameter (CSRF protection)
      if (!this.validateState(state)) {
        return {
          success: false,
          error: 'Invalid state parameter - authentication request may have expired or been tampered with'
        };
      }
      
      // Step 2: Verify the Clerk session token
      let tokenPayload;
      try {
        tokenPayload = await this.verifyToken(token);
      } catch (verifyError) {
        return {
          success: false,
          error: `Token verification failed: ${verifyError.message}`
        };
      }
      
      // Step 3: Extract user information from token
      const userId = tokenPayload.sub; // Subject claim contains user ID
      const sessionId = tokenPayload.sid; // Session ID
      
      // Step 4: Store token securely in system keychain
      // keytar uses:
      // - macOS: Keychain
      // - Windows: Credential Vault
      // - Linux: Secret Service API (libsecret)
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_session_token', token);
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_user_id', userId);
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_session_id', sessionId);
      
      console.log('✅ Credentials stored securely in system keychain');
      
      // Step 5: Fetch full user data from Clerk (if API client available)
      let userData = {
        id: userId,
        sessionId: sessionId
      };
      
      if (this.clerkClient) {
        try {
          const user = await this.clerkClient.users.getUser(userId);
          userData = {
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            imageUrl: user.imageUrl,
            sessionId: sessionId
          };
        } catch (error) {
          console.warn('⚠️ Could not fetch full user data from Clerk:', error.message);
        }
      }
      
      // Step 6: Establish session
      this.currentSession = {
        token,
        sessionId,
        userId,
        expiresAt: new Date(tokenPayload.exp * 1000),
        createdAt: new Date()
      };
      
      this.currentUser = userData;
      
      console.log('🎉 Authentication completed successfully');
      
      return {
        success: true,
        user: userData
      };
      
    } catch (error) {
      console.error('❌ Error processing authentication callback:', error);
      
      // Clear any partial data
      await this.clearStoredCredentials();
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process direct link authentication from website
   *
   * This handles authentication when the user clicks "Open in App" from the website.
   * Unlike the OAuth flow, this doesn't require state validation since the user
   * is already authenticated on the website and we're just transferring the session.
   *
   * Security:
   * - Still verifies the JWT token signature
   * - Stores credentials securely in keychain
   * - Validates token expiration
   *
   * @param {Object} params - Direct link parameters
   * @param {string} params.token - Clerk session token
   * @param {Object} params.userData - User data from website (optional)
   * @returns {Object} { success, user, error }
   */
  async processDirectLink({ token, userData }) {
    try {
      // Step 1: Verify the Clerk session token
      let tokenPayload;
      try {
        tokenPayload = await this.verifyToken(token);
      } catch (verifyError) {
        return {
          success: false,
          error: `Token verification failed: ${verifyError.message}`
        };
      }

      // Step 2: Extract user information from token
      const userId = tokenPayload.sub; // Subject claim contains user ID
      const sessionId = tokenPayload.sid; // Session ID

      // Step 3: Store token securely in system keychain
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_session_token', token);
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_user_id', userId);
      await keytar.setPassword(this.SERVICE_NAME, 'clerk_session_id', sessionId);

      console.log('✅ Credentials stored securely in system keychain');

      // Step 4: Use provided user data or fetch from Clerk
      let finalUserData = userData || {
        id: userId,
        sessionId: sessionId
      };

      // If we have Clerk client and no user data was provided, fetch it
      if (this.clerkClient && !userData) {
        try {
          const user = await this.clerkClient.users.getUser(userId);
          finalUserData = {
            id: user.id,
            email: user.emailAddresses[0]?.emailAddress,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
            avatar: user.imageUrl,
            sessionId: sessionId
          };
        } catch (error) {
          console.warn('⚠️ Could not fetch full user data from Clerk:', error.message);
        }
      }

      // Step 5: Establish session
      this.currentSession = {
        token,
        sessionId,
        userId,
        expiresAt: new Date(tokenPayload.exp * 1000),
        createdAt: new Date()
      };

      this.currentUser = finalUserData;

      console.log('🎉 Direct link authentication completed successfully');

      return {
        success: true,
        user: finalUserData
      };

    } catch (error) {
      console.error('❌ Error processing direct link authentication:', error);

      // Clear any partial data
      await this.clearStoredCredentials();

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get stored credentials from system keychain
   *
   * @returns {Object|null} Stored credentials or null if not found
   */
  async getStoredCredentials() {
    try {
      const token = await keytar.getPassword(this.SERVICE_NAME, 'clerk_session_token');
      const userId = await keytar.getPassword(this.SERVICE_NAME, 'clerk_user_id');
      const sessionId = await keytar.getPassword(this.SERVICE_NAME, 'clerk_session_id');
      
      if (!token || !userId || !sessionId) {
        return null;
      }
      
      return { token, userId, sessionId };
    } catch (error) {
      console.error('❌ Error retrieving stored credentials:', error);
      return null;
    }
  }

  /**
   * Clear stored credentials from system keychain
   */
  async clearStoredCredentials() {
    try {
      await keytar.deletePassword(this.SERVICE_NAME, 'clerk_session_token');
      await keytar.deletePassword(this.SERVICE_NAME, 'clerk_user_id');
      await keytar.deletePassword(this.SERVICE_NAME, 'clerk_session_id');
      
      this.currentSession = null;
      this.currentUser = null;
      
      console.log('✅ Credentials cleared from system keychain');
    } catch (error) {
      console.error('❌ Error clearing credentials:', error);
    }
  }

  /**
   * Restore session from stored credentials
   * This is called on app startup to restore the user's session
   * 
   * @returns {Object|null} User data if session restored, null otherwise
   */
  async restoreSession() {
    try {
      const credentials = await this.getStoredCredentials();
      
      if (!credentials) {
        console.log('ℹ️ No stored credentials found');
        return null;
      }
      
      // Verify the stored token is still valid
      try {
        const tokenPayload = await this.verifyToken(credentials.token);
        
        // Check if token is expired
        const expiresAt = new Date(tokenPayload.exp * 1000);
        if (expiresAt < new Date()) {
          console.log('⚠️ Stored token has expired');
          await this.clearStoredCredentials();
          return null;
        }
        
        // Fetch user data
        let userData = {
          id: credentials.userId,
          sessionId: credentials.sessionId
        };
        
        if (this.clerkClient) {
          try {
            const user = await this.clerkClient.users.getUser(credentials.userId);
            userData = {
              id: user.id,
              email: user.emailAddresses[0]?.emailAddress,
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              imageUrl: user.imageUrl,
              sessionId: credentials.sessionId
            };
          } catch (error) {
            console.warn('⚠️ Could not fetch user data:', error.message);
          }
        }
        
        this.currentSession = {
          token: credentials.token,
          sessionId: credentials.sessionId,
          userId: credentials.userId,
          expiresAt: expiresAt,
          createdAt: new Date()
        };
        
        this.currentUser = userData;
        
        console.log('✅ Session restored from stored credentials');
        return userData;
        
      } catch (error) {
        console.error('❌ Stored token verification failed:', error.message);
        await this.clearStoredCredentials();
        return null;
      }
      
    } catch (error) {
      console.error('❌ Error restoring session:', error);
      return null;
    }
  }

  /**
   * Sign out and clear all credentials
   */
  async signOut() {
    await this.clearStoredCredentials();
    console.log('🚪 User signed out');
  }

  /**
   * Get current authentication status
   * 
   * @returns {Object} { authenticated, user, sessionValid }
   */
  getAuthStatus() {
    const authenticated = !!(this.currentSession && this.currentUser);
    
    let sessionValid = false;
    if (this.currentSession) {
      sessionValid = this.currentSession.expiresAt > new Date();
    }
    
    return {
      authenticated,
      user: this.currentUser,
      session: this.currentSession,
      sessionValid
    };
  }
}

module.exports = ClerkAuthService;

