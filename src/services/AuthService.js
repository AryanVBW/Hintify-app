const DatabaseService = require('./DatabaseService');
const PortalDataTransferService = require('./PortalDataTransferService');

class AuthService {
  constructor() {
    this.dbService = new DatabaseService();
    this.portalService = new PortalDataTransferService();
    this.currentUser = null;
    this.currentSession = null;
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.lastActivity = Date.now();
  }

  // Create/update user and start an app session after Supabase login
  async processAuthentication(userData) {
    try {
      // Validate user data first
      await this.validateSupabaseUser(userData);

      // Normalize incoming Supabase user data for DB
      const normalized = {
        supabase_user_id: userData.supabase_user_id || userData.id || null,
        email: userData.email,
        name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || null,
        first_name: userData.firstName || userData.first_name || null,
        last_name: userData.lastName || userData.last_name || null,
        username: userData.username || null,
        image_url: userData.imageUrl || userData.image_url || null,
        provider: userData.provider || 'supabase',
        email_verified: userData.emailVerified || userData.email_verified || false,
        phone_verified: userData.phoneVerified || userData.phone_verified || false,
        account_created_at: userData.createdAt || userData.created_at || new Date().toISOString(),
        last_sign_in_at: userData.lastSignInAt || userData.last_sign_in_at || new Date().toISOString()
      };

      // Upsert user and start session
      const userId = await this.dbService.createOrUpdateUser(normalized);
      const deviceInfo = this.getDeviceInfo();
      const appVersion = this.getAppVersion();
      const sessionId = await this.dbService.startAppSession(userId, deviceInfo, appVersion);

      // Cache current user + session
      this.currentUser = {
        id: userId,
        email: normalized.email,
        name: normalized.name,
        image_url: normalized.image_url,
        provider: normalized.provider,
        supabase_user_id: normalized.supabase_user_id,
        sync_status: 'active',
        last_sync: new Date().toISOString(),
      };

      this.currentSession = {
        id: sessionId,
        userId,
        startTime: new Date(),
        authMethod: 'supabase'
      };

      // Log login
      await this.dbService.logUsage(
        userId,
        sessionId,
        'authentication',
        'login',
        { provider: 'supabase', deviceInfo, appVersion, timestamp: new Date().toISOString() }
      );

      return { user: this.currentUser, session: this.currentSession };
    } catch (error) {
      console.error('Authentication processing failed:', error);
      throw error;
    }
  }

  // Soft sign-out: end session and clear cache
  async signOut() {
    try {
      if (this.currentSession?.id) {
        await this.dbService.logUsage(
          this.currentUser?.id || null,
          this.currentSession.id,
          'authentication',
          'logout',
          { timestamp: new Date().toISOString() }
        );
        await this.dbService.endAppSession(this.currentSession.id);
      }
    } catch (e) {
      console.warn('Sign-out logging error:', e?.message || e);
    } finally {
      this.currentUser = null;
      this.currentSession = null;
    }
  }

  // Session validation and security methods
  isSessionValid() {
    if (!this.currentSession || !this.currentUser) {
      return false;
    }
    
    const now = Date.now();
    const sessionAge = now - this.lastActivity;
    
    // Check if session has expired
    if (sessionAge > this.sessionTimeout) {
      console.log('Session expired due to inactivity');
      return false;
    }
    
    return true;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  async validateSession() {
    if (!this.isSessionValid()) {
      await this.signOut();
      return false;
    }
    
    this.updateActivity();
    return true;
  }

  // Enhanced authentication validation
  async validateSupabaseUser(userData) {
    if (!userData) {
      throw new Error('No user data provided');
    }

    // Validate required fields
    if (!userData.id && !userData.supabase_user_id) {
      throw new Error('User ID is required');
    }

    if (!userData.email) {
      throw new Error('User email is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error('Invalid email format');
    }

    return true;
  }

  // Placeholders: these flows should be handled via Supabase in the browser
  async requestPasswordReset() {
    return { success: false, error: 'Password reset is handled in the browser via Supabase.' };
  }
  async resetPassword() {
    return { success: false, error: 'Password reset is handled in the browser via Supabase.' };
  }
  async enableMFA() {
    return { success: false, error: 'MFA setup is handled in the browser via Supabase.' };
  }
  async verifyMFASetup() {
    return { success: false, error: 'MFA verification is handled in the browser via Supabase.' };
  }
  async disableMFA() {
    return { success: false, error: 'MFA changes are handled in the browser via Supabase.' };
  }

  // Activity logging with session validation
  async logActivity(featureName, action, details = null) {
    if (!this.currentUser || !this.currentSession) return;
    
    // Validate session before logging
    if (!await this.validateSession()) {
      console.warn('Session invalid, skipping activity log');
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

  // Save Q&A
  async saveQuestionAnswer(entryOrQuestionText,
    answerText,
    questionType = 'text',
    aiProvider = 'gemini',
    aiModel = 'gemini-2.0-flash',
    imageData = null,
    metadata = null) {
    if (!this.currentUser || !this.currentSession) {
      throw new Error('User not authenticated');
    }

    // Support both new object signature and legacy positional params
    const data = typeof entryOrQuestionText === 'object' && entryOrQuestionText !== null
      ? entryOrQuestionText
      : {
          questionText: entryOrQuestionText,
          answerText,
          questionType,
          aiProvider,
          aiModel,
          imageData,
          metadata,
          processingTime: null
        };

    const questionId = await this.dbService.saveQuestion(
      this.currentUser.id,
      this.currentSession.id,
      data.questionText,
      data.questionType,
      data.imageData,
      data.metadata
    );

    const answerId = await this.dbService.saveAnswer(
      questionId,
      this.currentUser.id,
      data.answerText,
      data.aiProvider,
      data.aiModel,
      null,
      data.processingTime || null
    );

    await this.logActivity('question_answer', 'completed', { questionId, answerId, questionType, aiProvider, aiModel });

    // Fire-and-forget: try to push data to Portal shortly after save
    setTimeout(() => {
      this.transferDataToPortal().catch((e) => {
        console.debug('Deferred portal transfer failed (will retry later):', e?.message || e);
      });
    }, 1500);

    return { questionId, answerId };
  }

  async transferDataToPortal() {
    if (!this.currentUser) throw new Error('User not authenticated');
    await this.logActivity('data_transfer', 'initiated');
    const result = await this.portalService.transferUserDataToPortal(this.currentUser.id);
    await this.logActivity('data_transfer', 'completed', { success: result?.success, transferId: result?.transferId });
    return result;
  }

  async exportUserData(format = 'json') {
    if (!this.currentUser) throw new Error('User not authenticated');
    await this.logActivity('data_export', 'initiated', { format });
    const result = await this.portalService.exportUserData(this.currentUser.id, format);
    await this.logActivity('data_export', 'completed', { format });
    return result;
  }

  async getUserHistory(limit = 50) {
    if (!this.currentUser) throw new Error('User not authenticated');
    return this.dbService.getUserHistory(this.currentUser.id, limit);
  }

  async syncAccountData() {
    if (!this.currentUser) throw new Error('User not authenticated');
    await this.logActivity('account_sync', 'initiated');
    const res = await this.portalService.transferUserDataToPortal(this.currentUser.id, 'account_sync');
    await this.logActivity('account_sync', 'completed', { success: res?.success });
    return res;
  }

  // Helpers
  getDeviceInfo() {
    const os = require('os');
    let appVersion = '1.0.0';
  if (process.versions?.electron) {
      const { app } = require('electron');
      appVersion = app.getVersion();
    }
    return {
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      appVersion,
      electronVersion: process.versions.electron || 'n/a',
      nodeVersion: process.versions.node
    };
  }

  getAppVersion() {
    if (process.versions?.electron) {
      const { app } = require('electron');
      return app.getVersion();
    }
    return '1.0.0';
  }

  // Get current user information
  getCurrentUser() {
    return this.currentUser;
  }

  // Get current session information
  getCurrentSession() {
    return this.currentSession;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return this.isSessionValid() && this.currentUser && this.currentSession;
  }

  // Get authentication status
  getAuthStatus() {
    return {
      authenticated: this.isAuthenticated(),
      user: this.currentUser,
      session: this.currentSession,
      lastActivity: this.lastActivity,
      sessionValid: this.isSessionValid()
    };
  }

  // Attempt to restore legacy state if present (best-effort)
  async initializeFromStorage(store) {
    try {
      const isAuthenticated = store.get('user_authenticated', false);
      const userInfo = store.get('user_info', null);
      if (!isAuthenticated || !userInfo?.email) return false;

      // Try to attach to an active session or start a new one
      const user = await this.dbService.getUserByEmail(userInfo.email);
      if (!user) return false;

      let active = await this.dbService.getActiveSession(user.id);
      if (!active) {
        const deviceInfo = this.getDeviceInfo();
        const appVersion = this.getAppVersion();
        const sessionId = await this.dbService.startAppSession(user.id, deviceInfo, appVersion);
        active = { id: sessionId, user_id: user.id };
      }

      this.currentUser = {
        id: user.id,
        email: user.email,
        name: user.name || userInfo.name || null,
        image_url: user.image_url || userInfo.imageUrl || null,
        provider: 'supabase',
        sync_status: 'active',
        last_sync: new Date().toISOString()
      };
      this.currentSession = { id: active.id, userId: user.id, startTime: active.session_start || new Date() };
      return true;
    } catch (e) {
      console.warn('Auth restore failed:', e?.message || e);
      return false;
    }
  }
}

module.exports = AuthService;
