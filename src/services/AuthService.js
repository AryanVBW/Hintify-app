const DatabaseService = require('./DatabaseService');
const PortalDataTransferService = require('./PortalDataTransferService');

class AuthService {
  constructor() {
    this.dbService = new DatabaseService();
    this.portalService = new PortalDataTransferService();
    this.currentUser = null;
    this.currentSession = null;
  }

  // Process authentication from deep link or auth window
  async processAuthentication(authData) {
    try {
      console.log('🔐 Processing comprehensive authentication from website transfer:', authData);

      // Extract comprehensive user information from transferred data
      const userData = {
        stack_user_id: authData.userId || authData.id,
        email: authData.email,
        name: authData.name || `${authData.firstName || ''} ${authData.lastName || ''}`.trim(),
        first_name: authData.firstName,
        last_name: authData.lastName,
        username: authData.username,
        image_url: authData.imageUrl || authData.profileImageUrl,
        provider: authData.provider || 'unknown',
        auth_method: authData.authMethod || 'deep_link',
        session_id: authData.sessionId,
        source: authData.source || 'unknown',
        account_created_at: authData.accountCreatedAt ? new Date(authData.accountCreatedAt) : null,
        last_sign_in_at: authData.lastSignInAt ? new Date(authData.lastSignInAt) : null,
        email_verified: authData.emailVerified === 'true',
        user_preferences: authData.userPreferences ? JSON.parse(authData.userPreferences) : null,
        transferred_at: new Date().toISOString()
      };

      // Validate required fields with enhanced checks
      if (!userData.email && !userData.stack_user_id) {
        throw new Error('Missing required authentication data: email or user ID');
      }

      // Log the comprehensive transfer
      console.log('📊 Account transfer details:', {
        userId: userData.stack_user_id,
        email: userData.email,
        provider: userData.provider,
        authMethod: userData.auth_method,
        source: userData.source,
        hasPreferences: !!userData.user_preferences,
        emailVerified: userData.email_verified,
        accountAge: userData.account_created_at ? 
          Math.floor((Date.now() - new Date(userData.account_created_at).getTime()) / (1000 * 60 * 60 * 24)) + ' days' : 'unknown'
      });

      // Create or update user in database with enhanced data
      const userId = await this.dbService.createOrUpdateUser(userData);
      
      // Start new app session with transfer context
      const deviceInfo = this.getDeviceInfo();
      const appVersion = this.getAppVersion();
      const sessionId = await this.dbService.startAppSession(userId, deviceInfo, appVersion);

      // Store current user and session with additional metadata
      this.currentUser = { 
        ...userData, 
        id: userId,
        app_session_id: sessionId,
        sync_status: 'active',
        last_sync: new Date().toISOString()
      };
      this.currentSession = { 
        id: sessionId, 
        userId, 
        startTime: new Date(),
        transferSource: userData.source,
        authMethod: userData.auth_method
      };

      // Log authentication event with transfer details
      await this.dbService.logUsage(
        userId, 
        sessionId, 
        'authentication', 
        'auto_login', 
        { 
          provider: userData.provider,
          method: userData.auth_method,
          source: userData.source,
          transfer_session: userData.session_id,
          email_verified: userData.email_verified
        }
      );

      console.log('✅ Account transfer and authentication completed successfully:', {
        userId,
        sessionId,
        email: userData.email,
        syncStatus: 'active'
      });

      // Trigger initial data sync for transferred account
      setTimeout(async () => {
        try {
          console.log('🚀 Initiating account data synchronization...');
          await this.syncAccountData();
        } catch (error) {
          console.log('⚠️ Account sync will retry later:', error.message);
        }
      }, 3000); // Wait 3 seconds to ensure everything is properly initialized

      return {
        success: true,
        user: this.currentUser,
        session: this.currentSession,
        transferCompleted: true,
        syncStatus: 'active'
      };

    } catch (error) {
      console.error('❌ Authentication processing failed:', error);
      throw error;
    }
  }

  // Verify and refresh authentication token
  async verifyToken(token) {
    try {
      const payload = await this.dbService.verifyToken(token);
      
      // Get user from database
      const user = await this.dbService.getUserByEmail(payload.email);
      
      if (!user) {
        throw new Error('User not found');
      }

      this.currentUser = user;
      return user;

    } catch (error) {
      console.error('Token verification failed:', error);
      throw error;
    }
  }

  // Get current authenticated user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get current session
  getCurrentSession() {
    return this.currentSession;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.currentUser;
  }

  // Log user activity
  async logActivity(featureName, action, details = null) {
    if (!this.currentUser || !this.currentSession) {
      console.warn('Cannot log activity: no authenticated user or session');
      return;
    }

    try {
      await this.dbService.logUsage(
        this.currentUser.id,
        this.currentSession.id,
        featureName,
        action,
        details
      );
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  // Save question and answer
  async saveQuestionAnswer(questionText, answerText, questionType = 'text', aiProvider = 'gemini', aiModel = 'gemini-2.0-flash', imageData = null, metadata = null, processingTime = null) {
    if (!this.currentUser || !this.currentSession) {
      throw new Error('User not authenticated');
    }

    try {
      // Save question
      const questionId = await this.dbService.saveQuestion(
        this.currentUser.id,
        this.currentSession.id,
        questionText,
        questionType,
        imageData,
        metadata
      );

      // Save answer
      const answerId = await this.dbService.saveAnswer(
        questionId,
        this.currentUser.id,
        answerText,
        aiProvider,
        aiModel,
        null, // confidence score
        processingTime
      );

      // Log the Q&A activity
      await this.logActivity('question_answer', 'completed', {
        questionId,
        answerId,
        questionType,
        aiProvider,
        aiModel
      });

      console.log('✅ Question and answer saved successfully:', { questionId, answerId });

      // Automatically trigger data transfer to Portal after each Q&A
      // This ensures the Portal always has the latest user data
      setTimeout(async () => {
        try {
          console.log('🚀 Auto-transferring latest data to Portal...');
          await this.transferDataToPortal();
        } catch (error) {
          console.log('⚠️ Auto-transfer to Portal failed (will retry later):', error.message);
        }
      }, 2000); // Wait 2 seconds to ensure data is fully saved

      return { questionId, answerId };

    } catch (error) {
      console.error('Failed to save question/answer:', error);
      throw error;
    }
  }

  // Sync account data after transfer
  async syncAccountData() {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('🔄 Starting account data synchronization...');
      
      // Log sync activity
      await this.logActivity('account_sync', 'initiated', {
        transferSource: this.currentSession?.transferSource,
        authMethod: this.currentSession?.authMethod
      });

      // Update user sync status
      this.currentUser.sync_status = 'syncing';
      this.currentUser.last_sync = new Date().toISOString();

      // Perform comprehensive data sync
      const syncResult = await this.portalService.transferUserDataToPortal(
        this.currentUser.id,
        'account_sync'
      );

      // Update sync status based on result
      this.currentUser.sync_status = syncResult.success ? 'active' : 'error';
      this.currentUser.last_sync = new Date().toISOString();

      // Log completion
      await this.logActivity('account_sync', 'completed', {
        success: syncResult.success,
        syncStatus: this.currentUser.sync_status
      });

      console.log('✅ Account data synchronization completed:', {
        success: syncResult.success,
        syncStatus: this.currentUser.sync_status
      });

      return syncResult;

    } catch (error) {
      // Update sync status to error
      if (this.currentUser) {
        this.currentUser.sync_status = 'error';
        this.currentUser.last_sync = new Date().toISOString();
      }

      // Log failure
      await this.logActivity('account_sync', 'failed', {
        error: error.message
      });
      
      throw error;
    }
  }

  // Get account sync status
  getAccountSyncStatus() {
    return {
      status: this.currentUser?.sync_status || 'unknown',
      lastSync: this.currentUser?.last_sync,
      transferSource: this.currentSession?.transferSource,
      authMethod: this.currentSession?.authMethod
    };
  }
  async transferDataToPortal() {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      // Log data transfer activity
      await this.logActivity('data_transfer', 'initiated');

      const result = await this.portalService.transferUserDataToPortal(this.currentUser.id);

      // Log completion
      await this.logActivity('data_transfer', 'completed', {
        transferId: result.transferId,
        success: result.success
      });

      return result;

    } catch (error) {
      // Log failure
      await this.logActivity('data_transfer', 'failed', {
        error: error.message
      });
      
      throw error;
    }
  }

  // Export user data
  async exportUserData(format = 'json') {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      await this.logActivity('data_export', 'initiated', { format });

      const result = await this.portalService.exportUserData(this.currentUser.id, format);

      await this.logActivity('data_export', 'completed', { format });

      return result;

    } catch (error) {
      await this.logActivity('data_export', 'failed', {
        format,
        error: error.message
      });
      
      throw error;
    }
  }

  // Get user history
  async getUserHistory(limit = 50) {
    if (!this.currentUser) {
      throw new Error('User not authenticated');
    }

    return await this.dbService.getUserHistory(this.currentUser.id, limit);
  }

  // Sign out user
  async signOut() {
    try {
      if (this.currentSession) {
        // Log signout activity
        await this.logActivity('authentication', 'logout');

        // End current session
        await this.dbService.endAppSession(this.currentSession.id);
      }

      // Clear current user and session
      this.currentUser = null;
      this.currentSession = null;

      console.log('🚪 User signed out successfully');

    } catch (error) {
      console.error('Failed to sign out properly:', error);
      // Clear local state anyway
      this.currentUser = null;
      this.currentSession = null;
    }
  }

  // Get device information
  getDeviceInfo() {
    const os = require('os');
    
    // Check if we're running in Electron context
    let appVersion = '1.0.0';
    try {
      const { app } = require('electron');
      appVersion = app.getVersion();
    } catch (error) {
      // Not running in Electron context (e.g., testing)
      appVersion = '1.0.0-test';
    }

    return {
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      appVersion: appVersion,
      electronVersion: process.versions.electron || 'n/a',
      nodeVersion: process.versions.node
    };
  }

  // Get app version
  getAppVersion() {
    try {
      const { app } = require('electron');
      return app.getVersion();
    } catch (error) {
      // Not running in Electron context
      return '1.0.0-test';
    }
  }

  // Initialize authentication from stored data
  async initializeFromStorage(store) {
    try {
      const isAuthenticated = store.get('user_authenticated', false);
      const userInfo = store.get('user_info', null);

      if (isAuthenticated && userInfo && userInfo.email) {
        // Get user from database
        const user = await this.dbService.getUserByEmail(userInfo.email);
        
        if (user) {
          this.currentUser = user;

          // Check for active session or create new one
          let activeSession = await this.dbService.getActiveSession(user.id);
          
          if (!activeSession) {
            // Start new session
            const deviceInfo = this.getDeviceInfo();
            const appVersion = this.getAppVersion();
            const sessionId = await this.dbService.startAppSession(user.id, deviceInfo, appVersion);
            activeSession = { id: sessionId, user_id: user.id };
          }

          this.currentSession = {
            id: activeSession.id,
            userId: user.id,
            startTime: activeSession.session_start || new Date()
          };

          console.log('🔄 Authentication restored from storage:', {
            userId: user.id,
            sessionId: activeSession.id,
            email: user.email
          });

          return true;
        }
      }

      return false;

    } catch (error) {
      console.error('Failed to initialize authentication from storage:', error);
      return false;
    }
  }
}

module.exports = AuthService;