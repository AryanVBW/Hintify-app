const axios = require('axios');
const DatabaseService = require('./DatabaseService');

class PortalDataTransferService {
  constructor() {
    this.portalApiUrl = process.env.PORTAL_API_URL || 'https://portal.hintify.app/api';
    this.transferEndpoint = process.env.PORTAL_DATA_TRANSFER_ENDPOINT || '/data-transfer';
    this.dbService = new DatabaseService();
    
    console.log('✅ PortalDataTransferService initialized with API:', this.portalApiUrl);
  }

  // Transfer user data to Portal
  async transferUserDataToPortal(userId, transferType = 'full_export') {
    try {
      console.log(`🚀 Starting data transfer for user ${userId}, type: ${transferType}`);
      
      // Get comprehensive user data
      const userDataSummary = await this.dbService.getUserDataSummary(userId);
      const userHistory = await this.dbService.getUserHistory(userId, 100); // Get more history
      
      if (!userDataSummary) {
        throw new Error('No user data found');
      }

      // Enhance the data with additional context
      const enhancedData = {
        ...userDataSummary,
        complete_history: userHistory,
        transfer_metadata: {
          app_version: require('electron').app.getVersion(),
          transfer_timestamp: new Date().toISOString(),
          data_version: '1.0.0',
          total_questions: userHistory.length,
          unique_sessions: [...new Set(userHistory.map(h => h.session_id))].length
        }
      };

      // Create data transfer record
      const transferId = await this.dbService.createDataTransfer(
        userId, 
        transferType, 
        enhancedData
      );

      try {
        // Prepare comprehensive data payload for Portal
        const transferData = {
          transfer_id: transferId,
          user_id: userId,
          transfer_type: transferType,
          timestamp: new Date().toISOString(),
          data: enhancedData,
          source: 'hintify_app',
          version: '1.0.0',
          // Add user context for Portal integration
          user_context: {
            stack_user_id: enhancedData.user_info?.stack_user_id,
            email: enhancedData.user_info?.email,
            name: enhancedData.user_info?.name,
            created_at: enhancedData.user_info?.created_at,
            last_login: enhancedData.user_info?.last_login
          },
          // Add analytics summary
          analytics_summary: {
            total_questions: enhancedData.stats?.total_questions || 0,
            total_answers: enhancedData.stats?.total_answers || 0,
            total_sessions: enhancedData.stats?.total_sessions || 0,
            app_usage_events: enhancedData.stats?.app_usage_events || 0,
            first_activity: userHistory.length > 0 ? userHistory[userHistory.length - 1]?.question_created_at : null,
            last_activity: userHistory.length > 0 ? userHistory[0]?.question_created_at : null
          }
        };

        console.log('📦 Preparing to send comprehensive data to Portal:', {
          transferId,
          dataSize: JSON.stringify(transferData).length,
          questionsCount: transferData.analytics_summary.total_questions,
          userEmail: transferData.user_context.email
        });

        // Send data to Portal
        const response = await axios.post(
          `${this.portalApiUrl}${this.transferEndpoint}`,
          transferData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.PORTAL_API_KEY || ''}`,
              'X-Transfer-Source': 'hintify-app',
              'X-Transfer-Version': '1.0.0',
              'X-User-Email': transferData.user_context.email || '',
              'X-Transfer-ID': transferId
            },
            timeout: 30000 // 30 seconds timeout
          }
        );

        if (response.status === 200 || response.status === 201) {
          // Update transfer status to completed
          await this.dbService.updateDataTransferStatus(transferId, 'completed');
          
          console.log(`✅ Data transfer completed successfully for user ${userId}`);
          console.log('📩 Portal response:', response.data);
          
          return {
            success: true,
            transferId,
            portalResponse: response.data,
            dataSize: JSON.stringify(transferData).length,
            questionsCount: transferData.analytics_summary.total_questions,
            message: 'Complete user data successfully transferred to Portal'
          };
        } else {
          throw new Error(`Portal API returned status ${response.status}`);
        }

      } catch (apiError) {
        // Update transfer status to failed
        await this.dbService.updateDataTransferStatus(
          transferId, 
          'failed', 
          apiError.message
        );

        console.error(`❌ Portal API error for user ${userId}:`, apiError.message);
        
        // If Portal is not available, store data locally for later sync
        return await this.storeForLaterSync(userId, transferId, enhancedData);
      }

    } catch (error) {
      console.error(`❌ Data transfer failed for user ${userId}:`, error);
      throw error;
    }
  }

  // Store data locally for later synchronization when Portal is available
  async storeForLaterSync(userId, transferId, userData) {
    try {
      // Update the transfer record with pending status
      await this.dbService.updateDataTransferStatus(
        transferId, 
        'pending', 
        'Portal unavailable - queued for later sync'
      );

      console.log(`📦 Data stored locally for later sync - user ${userId}, transfer ${transferId}`);
      
      return {
        success: true,
        transferId,
        queued: true,
        message: 'Data queued for synchronization when Portal becomes available'
      };
    } catch (error) {
      console.error('Failed to store data for later sync:', error);
      throw error;
    }
  }

  // Sync pending transfers to Portal
  async syncPendingTransfers() {
    try {
      const pendingTransfers = await this.dbService.sql`
        SELECT id, user_id, transfer_type, data_snapshot
        FROM app_data.data_transfers
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
      `;

      console.log(`🔄 Found ${pendingTransfers.length} pending transfers to sync`);

      for (const transfer of pendingTransfers) {
        try {
          await this.transferUserDataToPortal(
            transfer.user_id, 
            transfer.transfer_type
          );
        } catch (error) {
          console.error(`Failed to sync transfer ${transfer.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Failed to sync pending transfers:', error);
    }
  }

  // Export user data in various formats
  async exportUserData(userId, format = 'json') {
    try {
      const userDataSummary = await this.dbService.getUserDataSummary(userId);
      const userHistory = await this.dbService.getUserHistory(userId);

      const exportData = {
        user_info: userDataSummary.user_info,
        stats: userDataSummary.stats,
        recent_activity: userDataSummary.recent_activity,
        full_history: userHistory,
        export_metadata: {
          exported_at: new Date().toISOString(),
          format: format,
          version: '1.0.0',
          source: 'hintify_app'
        }
      };

      switch (format.toLowerCase()) {
        case 'json':
          return {
            data: exportData,
            filename: `hintify_export_${userId}_${Date.now()}.json`,
            mimeType: 'application/json'
          };
        
        case 'csv':
          return await this.convertToCSV(exportData, userId);
        
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

    } catch (error) {
      console.error('Failed to export user data:', error);
      throw error;
    }
  }

  // Convert data to CSV format
  async convertToCSV(exportData, userId) {
    try {
      let csvContent = '';
      
      // Questions and Answers CSV
      csvContent += 'Question ID,Question Text,Question Type,Question Date,Answer Text,AI Provider,AI Model,Answer Date\n';
      
      exportData.full_history.forEach(item => {
        const questionText = (item.question_text || '').replace(/"/g, '""');
        const answerText = (item.answer_text || '').replace(/"/g, '""');
        
        csvContent += `"${item.question_id}","${questionText}","${item.question_type || ''}","${item.question_created_at || ''}","${answerText}","${item.ai_provider || ''}","${item.ai_model || ''}","${item.answer_created_at || ''}"\n`;
      });

      return {
        data: csvContent,
        filename: `hintify_export_${userId}_${Date.now()}.csv`,
        mimeType: 'text/csv'
      };

    } catch (error) {
      console.error('Failed to convert to CSV:', error);
      throw error;
    }
  }

  // Check Portal connectivity
  async checkPortalConnectivity() {
    try {
      const response = await axios.get(`${this.portalApiUrl}/health`, {
        timeout: 5000
      });
      
      return response.status === 200;
    } catch (error) {
      console.log('Portal is not available:', error.message);
      return false;
    }
  }

  // Get transfer history for user
  async getTransferHistory(userId) {
    try {
      const result = await this.dbService.sql`
        SELECT 
          id,
          transfer_type,
          status,
          created_at,
          completed_at,
          error_message
        FROM app_data.data_transfers
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 20
      `;
      
      return result;
    } catch (error) {
      console.error('Failed to get transfer history:', error);
      throw error;
    }
  }
}

module.exports = PortalDataTransferService;