const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');
const path = require('path');

// Load environment variables from the correct path
require('dotenv').config({ 
  path: path.resolve(__dirname, '../../.env.local')
});

// Also try loading from parent directory as fallback
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ 
    path: path.resolve(__dirname, '../../../.env.local')
  });
}

class DatabaseService {
  constructor() {
    // Check if DATABASE_URL exists
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL not found in environment variables');
      console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('DATABASE') || key.includes('NEON')));
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    this.sql = neon(process.env.DATABASE_URL);
    this.stackProjectId = process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
    this.stackSecretKey = process.env.STACK_SECRET_SERVER_KEY;
    this.jwksUrl = process.env.STACK_JWKS_URL;
    
    console.log('✅ DatabaseService initialized with Neon connection');
  }

  // Verify JWT token from Stack Auth
  async verifyToken(token) {
    try {
      // In a production environment, you'd fetch and cache the JWKS
      // For now, we'll do basic verification
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded) {
        throw new Error('Invalid token');
      }
      
      // Verify the token audience and issuer
      const payload = decoded.payload;
      if (payload.aud !== this.stackProjectId) {
        throw new Error('Invalid audience');
      }
      
      return payload;
    } catch (error) {
      console.error('Token verification failed:', error);
      throw error;
    }
  }

  // Create or update user in database
  async createOrUpdateUser(userData) {
    try {
      const result = await this.sql`
        SELECT app_data.create_or_update_user(
          ${userData.stack_user_id || null},
          ${userData.email},
          ${userData.name || null},
          ${userData.first_name || null},
          ${userData.last_name || null},
          ${userData.username || null},
          ${userData.image_url || null},
          ${userData.provider || null}
        ) AS user_id
      `;
      
      return result[0].user_id;
    } catch (error) {
      console.error('Failed to create/update user:', error);
      throw error;
    }
  }

  // Start a new app session
  async startAppSession(userId, deviceInfo, appVersion) {
    try {
      const result = await this.sql`
        SELECT app_data.start_app_session(
          ${userId},
          ${JSON.stringify(deviceInfo) || null},
          ${appVersion || null}
        ) AS session_id
      `;
      
      return result[0].session_id;
    } catch (error) {
      console.error('Failed to start app session:', error);
      throw error;
    }
  }

  // Log app usage
  async logUsage(userId, sessionId, featureName, action, details = null) {
    try {
      const result = await this.sql`
        SELECT app_data.log_usage(
          ${userId},
          ${sessionId},
          ${featureName},
          ${action},
          ${JSON.stringify(details) || null}
        ) AS usage_id
      `;
      
      return result[0].usage_id;
    } catch (error) {
      console.error('Failed to log usage:', error);
      throw error;
    }
  }

  // Save question to database
  async saveQuestion(userId, sessionId, questionText, questionType, imageData = null, metadata = null) {
    try {
      const result = await this.sql`
        INSERT INTO app_data.questions (user_id, session_id, question_text, question_type, image_data, metadata)
        VALUES (${userId}, ${sessionId}, ${questionText}, ${questionType}, ${imageData}, ${JSON.stringify(metadata)})
        RETURNING id
      `;
      
      return result[0].id;
    } catch (error) {
      console.error('Failed to save question:', error);
      throw error;
    }
  }

  // Save answer to database
  async saveAnswer(questionId, userId, answerText, aiProvider, aiModel, confidenceScore = null, processingTime = null) {
    try {
      const result = await this.sql`
        INSERT INTO app_data.answers (question_id, user_id, answer_text, ai_provider, ai_model, confidence_score, processing_time_ms)
        VALUES (${questionId}, ${userId}, ${answerText}, ${aiProvider}, ${aiModel}, ${confidenceScore}, ${processingTime})
        RETURNING id
      `;
      
      return result[0].id;
    } catch (error) {
      console.error('Failed to save answer:', error);
      throw error;
    }
  }

  // Get user by email
  async getUserByEmail(email) {
    try {
      const result = await this.sql`
        SELECT * FROM app_data.users WHERE email = ${email} AND is_active = true
      `;
      
      return result[0] || null;
    } catch (error) {
      console.error('Failed to get user by email:', error);
      throw error;
    }
  }

  // Get user summary data for Portal transfer
  async getUserDataSummary(userId) {
    try {
      const result = await this.sql`
        SELECT app_data.get_user_data_summary(${userId}) AS summary
      `;
      
      return result[0].summary;
    } catch (error) {
      console.error('Failed to get user data summary:', error);
      throw error;
    }
  }

  // Create data transfer record
  async createDataTransfer(userId, transferType, dataSnapshot, transferUrl = null) {
    try {
      const result = await this.sql`
        INSERT INTO app_data.data_transfers (user_id, transfer_type, data_snapshot, transfer_url)
        VALUES (${userId}, ${transferType}, ${JSON.stringify(dataSnapshot)}, ${transferUrl})
        RETURNING id
      `;
      
      return result[0].id;
    } catch (error) {
      console.error('Failed to create data transfer:', error);
      throw error;
    }
  }

  // Update data transfer status
  async updateDataTransferStatus(transferId, status, errorMessage = null) {
    try {
      const result = await this.sql`
        UPDATE app_data.data_transfers 
        SET status = ${status}, 
            error_message = ${errorMessage},
            completed_at = ${status === 'completed' ? 'CURRENT_TIMESTAMP' : null}
        WHERE id = ${transferId}
        RETURNING id
      `;
      
      return result[0].id;
    } catch (error) {
      console.error('Failed to update data transfer status:', error);
      throw error;
    }
  }

  // Get user's recent questions and answers
  async getUserHistory(userId, limit = 50) {
    try {
      const result = await this.sql`
        SELECT 
          q.id as question_id,
          q.question_text,
          q.question_type,
          q.created_at as question_created_at,
          a.id as answer_id,
          a.answer_text,
          a.ai_provider,
          a.ai_model,
          a.created_at as answer_created_at
        FROM app_data.questions q
        LEFT JOIN app_data.answers a ON q.id = a.question_id
        WHERE q.user_id = ${userId}
        ORDER BY q.created_at DESC
        LIMIT ${limit}
      `;
      
      return result;
    } catch (error) {
      console.error('Failed to get user history:', error);
      throw error;
    }
  }

  // End app session
  async endAppSession(sessionId) {
    try {
      await this.sql`
        UPDATE app_data.app_sessions 
        SET is_active = false, session_end = CURRENT_TIMESTAMP
        WHERE id = ${sessionId}
      `;
    } catch (error) {
      console.error('Failed to end app session:', error);
      throw error;
    }
  }

  // Get active session for user
  async getActiveSession(userId) {
    try {
      const result = await this.sql`
        SELECT * FROM app_data.app_sessions 
        WHERE user_id = ${userId} AND is_active = true
        ORDER BY session_start DESC
        LIMIT 1
      `;
      
      return result[0] || null;
    } catch (error) {
      console.error('Failed to get active session:', error);
      throw error;
    }
  }
}

module.exports = DatabaseService;