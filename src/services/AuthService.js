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
      console.log('🔐 Processing authentication:', authData);

      // Extract user information
      const userData = {
        stack_user_id: authData.userId || authData.id,
        email: authData.email,
        name: authData.name || `${authData.firstName || ''} ${authData.lastName || ''}`.trim(),
        first_name: authData.firstName,
        last_name: authData.lastName,
        username: authData.username,
        image_url: authData.imageUrl,
        provider: authData.provider || 'unknown'
      };

      // Validate required fields
      if (!userData.email && !userData.stack_user_id) {
        throw new Error('Missing required authentication data: email or user ID');
      }

      // Create or update user in database
      const userId = await this.dbService.createOrUpdateUser(userData);
      
      // Start new app session
      const deviceInfo = this.getDeviceInfo();
      const appVersion = this.getAppVersion();
      const sessionId = await this.dbService.startAppSession(userId, deviceInfo, appVersion);

      // Store current user and session
      this.currentUser = { ...userData, id: userId };
      this.currentSession = { id: sessionId, userId, startTime: new Date() };

      // Log authentication event
      await this.dbService.logUsage(
        userId, 
        sessionId, 
        'authentication', 
        'login', 
        { provider: userData.provider, method: 'deep_link' }
      );

      console.log('✅ Authentication processed successfully:', {
        userId,
        sessionId,
        email: userData.email
      });

      // Trigger initial data transfer to Portal for new/returning users
      setTimeout(async () => {
        try {
          console.log('🚀 Triggering initial data transfer to Portal...');
          await this.transferDataToPortal();
        } catch (error) {
          console.log('⚠️ Initial Portal transfer failed (will retry later):', error.message);
        }
      }, 5000); // Wait 5 seconds to ensure everything is properly initialized

      return {
        success: true,
        user: this.currentUser,
        session: this.currentSession
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

  // Transfer user data to Portal
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