/**
 * Extended Cybernate AI SDK Client
 * JavaScript client for integrating with Cybernate AI security platform
 * Includes support for all services: Events, Webhooks, Storage, Analytics, Integrations, and Notifications
 */
class CybernateAI {
    /**
     * Create a new Cybernate AI client
     * @param {string} apiKey - Your Cybernate API key
     * @param {Object} [options] - Configuration options
     * @param {string} [options.baseUrl] - API base URL (defaults to Cybernate production API)
     * @param {number} [options.timeout] - Request timeout in milliseconds
     * @param {boolean} [options.autoReconnect] - Auto reconnect on connection failure
     */
    constructor(apiKey, options = {}) {
      if (!apiKey) {
        throw new Error('API key is required');
      }
      
      this.apiKey = apiKey;
      this.baseUrl = options.baseUrl || 'https://api.cybernate.ai/v1';
      this.timeout = options.timeout || 30000;
      this.autoReconnect = options.autoReconnect !== false;
      
      this.eventListeners = {};
      this.activeWatchers = new Map();
      this.socket = null;
      this.isConnected = false;
      
      // Track rate limits
      this.rateLimit = {
        limit: 0,
        remaining: 0,
        reset: 0
      };
    }
  
    /**
     * Set up authentication and connection
     * @returns {Promise<Object>} - Connection result
     */
    async connect() {
      try {
        // Validate API key with server
        const response = await this._request('GET', '/auth/validate');
        
        // Store user and organization info
        this.user = response.user;
        this.organization = response.organization;
        
        // If socket is enabled, initialize it
        if (this._socketIsEnabled()) {
          await this._setupWebSocket();
        }
        
        this.isConnected = true;
        return {
          connected: true,
          user: this.user,
          organization: this.organization
        };
      } catch (error) {
        this.isConnected = false;
        throw new Error(`Failed to connect to Cybernate: ${error.message}`);
      }
    }
  
    // ===== EVENT SERVICE METHODS =====
  
    /**
     * Watch a video stream, device or business for security events
     * @param {Object} options - Watch options
     * @param {string} [options.streamUrl] - URL of the stream to watch
     * @param {string} [options.deviceId] - ID of the device to watch
     * @param {string} [options.businessId] - ID of the business to watch
     * @param {Object} [options.detectionSettings] - AI detection settings
     * @param {number} [options.detectionSettings.sensitivityLevel] - Detection sensitivity (0-1)
     * @param {string[]} [options.detectionSettings.objectTypes] - Object types to detect
     * @param {Object} [options.notificationSettings] - How to receive notifications
     * @returns {Promise<Object>} - Watch config with ID
     */
    async watch(options) {
      this._ensureConnected();
      
      // Validate options
      if (!options.streamUrl && !options.deviceId && !options.businessId) {
        throw new Error('You must specify either streamUrl, deviceId, or businessId');
      }
      
      let endpoint;
      let payload;
      
      // Determine what we're watching
      if (options.streamUrl) {
        endpoint = '/streams/watch';
        payload = {
          url: options.streamUrl,
          name: options.name || `Stream ${new Date().toISOString()}`,
          detectionSettings: options.detectionSettings || {}
        };
      } else if (options.deviceId) {
        endpoint = '/devices/watch';
        payload = {
          deviceId: options.deviceId,
          detectionSettings: options.detectionSettings || {}
        };
      } else {
        endpoint = '/businesses/watch';
        payload = {
          businessId: options.businessId,
          detectionSettings: options.detectionSettings || {}
        };
      }
      
      // Add notification settings
      payload.notificationSettings = options.notificationSettings || { 
        method: this._socketIsEnabled() ? 'socket' : 'webhook' 
      };
      
      // If webhook but no URL, throw error
      if (payload.notificationSettings.method === 'webhook' && !payload.notificationSettings.webhookUrl) {
        throw new Error('webhookUrl is required for webhook notifications');
      }
      
      // Set up the watcher
      const response = await this._request('POST', endpoint, payload);
      
      // Store active watcher
      this.activeWatchers.set(response.watcherId, {
        id: response.watcherId,
        type: response.type,
        entityId: response.entityId,
        createdAt: new Date()
      });
      
      return response;
    }
  
    /**
     * Stop watching a stream, device or business
     * @param {string} watcherId - Watcher ID to stop
     * @returns {Promise<Object>} - Response
     */
    async unwatch(watcherId) {
      this._ensureConnected();
      
      if (!watcherId) {
        throw new Error('watcherId is required');
      }
      
      // Remove the watcher
      const response = await this._request('DELETE', `/events/watch/${watcherId}`);
      
      // Remove from active watchers
      this.activeWatchers.delete(watcherId);
      
      return response;
    }
  
    /**
     * Get all active watchers
     * @returns {Promise<Array>} - List of active watchers
     */
    async getActiveWatchers() {
      this._ensureConnected();
      
      const response = await this._request('GET', '/events/watchers');
      
      // Update local cache
      this.activeWatchers.clear();
      for (const watcher of response.watchers) {
        this.activeWatchers.set(watcher.id, watcher);
      }
      
      return response.watchers;
    }
  
    /**
     * Query events with filtering and pagination
     * @param {Object} query - Query parameters
     * @param {string} [query.streamId] - Filter by stream ID
     * @param {string} [query.deviceId] - Filter by device ID
     * @param {string} [query.businessId] - Filter by business ID
     * @param {string} [query.eventType] - Filter by event type
     * @param {string} [query.objectType] - Filter by detected object type
     * @param {string} [query.startDate] - Filter by start date (ISO string)
     * @param {string} [query.endDate] - Filter by end date (ISO string)
     * @param {number} [query.page=1] - Page number
     * @param {number} [query.limit=20] - Results per page
     * @returns {Promise<Object>} - Query results with pagination
     */
    async queryEvents(query = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      
      // Add all query parameters
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/events?${queryParams.toString()}`);
    }
  
    /**
     * Get event statistics
     * @param {Object} [query] - Filter parameters (same as queryEvents)
     * @returns {Promise<Object>} - Statistics
     */
    async getEventStatistics(query = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      
      // Add all query parameters
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/events/statistics?${queryParams.toString()}`);
    }
  
    /**
     * Acknowledge an event
     * @param {string} eventId - Event ID
     * @param {string} [notes] - Optional notes
     * @returns {Promise<Object>} - Updated event
     */
    async acknowledgeEvent(eventId, notes) {
      this._ensureConnected();
      
      if (!eventId) {
        throw new Error('eventId is required');
      }
      
      return this._request('POST', `/events/${eventId}/acknowledge`, {
        notes: notes || ''
      });
    }
  
    // ===== WEBHOOK SERVICE METHODS =====
  
    /**
     * Set webhook URL for event notifications
     * @param {Object} config - Webhook configuration
     * @param {string} config.url - Webhook URL
     * @param {Array<string>} [config.events] - Event types to receive (defaults to all)
     * @returns {Promise<Object>} - Response
     */
    async setWebhook(config) {
      this._ensureConnected();
      
      if (!config.url) {
        throw new Error('url is required');
      }
      
      return this._request('POST', '/webhooks/configure', {
        url: config.url,
        events: config.events || ['detection', 'connection_lost', 'alert']
      });
    }
  
    /**
     * Get all webhooks
     * @returns {Promise<Array>} - List of webhooks
     */
    async getWebhooks() {
      this._ensureConnected();
      
      return this._request('GET', '/webhooks');
    }
  
    /**
     * Delete a webhook
     * @param {string} webhookId - Webhook ID
     * @returns {Promise<Object>} - Response
     */
    async deleteWebhook(webhookId) {
      this._ensureConnected();
      
      return this._request('DELETE', `/webhooks/${webhookId}`);
    }
  
    /**
     * Test a webhook
     * @param {string} url - Webhook URL to test
     * @param {Object} [payload] - Optional custom payload
     * @returns {Promise<Object>} - Test result
     */
    async testWebhook(url, payload) {
      this._ensureConnected();
      
      return this._request('POST', '/webhooks/test', {
        url,
        payload
      });
    }
  
    // ===== STORAGE SERVICE METHODS =====
  
    /**
     * Upload a file to storage
     * @param {Object} options - Upload options
     * @param {File|Blob|Buffer} options.file - File to upload
     * @param {string} options.fileName - Original file name
     * @param {string} [options.eventId] - Associated event ID
     * @param {string} [options.streamId] - Associated stream ID
     * @param {string} [options.deviceId] - Associated device ID
     * @param {string} [options.businessId] - Associated business ID
     * @param {Object} [options.metadata] - Additional metadata
     * @param {boolean} [options.isPublic=false] - Whether file is publicly accessible
     * @returns {Promise<Object>} - Uploaded file info
     */
    async uploadFile(options) {
      this._ensureConnected();
      
      if (!options.file) {
        throw new Error('file is required');
      }
      
      if (!options.fileName) {
        throw new Error('fileName is required');
      }
      
      // Create form data
      const formData = new FormData();
      formData.append('file', options.file);
      formData.append('fileName', options.fileName);
      
      if (options.eventId) formData.append('eventId', options.eventId);
      if (options.streamId) formData.append('streamId', options.streamId);
      if (options.deviceId) formData.append('deviceId', options.deviceId);
      if (options.businessId) formData.append('businessId', options.businessId);
      if (options.metadata) formData.append('metadata', JSON.stringify(options.metadata));
      if (options.isPublic !== undefined) formData.append('isPublic', options.isPublic);
      
      // Use fetch directly for multipart form data
      const url = `${this.baseUrl}/storage/upload`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData,
        timeout: this.timeout
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error ${response.status}`);
      }
      
      return await response.json();
    }
  
    /**
     * Get information about a stored file
     * @param {string} fileId - File ID
     * @returns {Promise<Object>} - File info
     */
    async getFileInfo(fileId) {
      this._ensureConnected();
      
      return this._request('GET', `/storage/files/${fileId}`);
    }
  
    /**
     * Get a list of files with filtering
     * @param {Object} query - Query parameters
     * @param {string} [query.eventId] - Filter by event ID
     * @param {string} [query.streamId] - Filter by stream ID
     * @param {string} [query.deviceId] - Filter by device ID
     * @param {string} [query.businessId] - Filter by business ID
     * @param {string} [query.startDate] - Filter by start date (ISO string)
     * @param {string} [query.endDate] - Filter by end date (ISO string)
     * @param {string} [query.mimeType] - Filter by MIME type
     * @param {number} [query.page=1] - Page number
     * @param {number} [query.limit=20] - Results per page
     * @returns {Promise<Object>} - Query results with pagination
     */
    async queryFiles(query = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      
      // Add all query parameters
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/storage/files?${queryParams.toString()}`);
    }
  
    /**
     * Delete a file
     * @param {string} fileId - File ID
     * @returns {Promise<Object>} - Response
     */
    async deleteFile(fileId) {
      this._ensureConnected();
      
      return this._request('DELETE', `/storage/files/${fileId}`);
    }
  
    /**
     * Get a signed URL for a file
     * @param {string} fileId - File ID
     * @param {number} [expiresIn=3600] - Expiration time in seconds
     * @returns {Promise<Object>} - Response with signed URL
     */
    async getFileUrl(fileId, expiresIn = 3600) {
      this._ensureConnected();
      
      return this._request('GET', `/storage/files/${fileId}/url?expiresIn=${expiresIn}`);
    }
  
    /**
     * Capture a frame from a stream
     * @param {string} streamId - Stream ID
     * @param {Object} [options] - Capture options
     * @param {boolean} [options.isPublic=false] - Whether captured frame is publicly accessible
     * @param {Object} [options.metadata] - Additional metadata
     * @returns {Promise<Object>} - Captured frame info
     */
    async captureStreamFrame(streamId, options = {}) {
      this._ensureConnected();
      
      return this._request('POST', `/storage/capture/${streamId}`, options);
    }
  
    // ===== ANALYTICS SERVICE METHODS =====
  
    /**
     * Get analytics for a business
     * @param {string} businessId - Business ID
     * @param {Object} [options] - Query options
     * @param {string} [options.type='daily'] - Analytics type (daily, weekly, monthly)
     * @param {string} [options.period] - Specific period to get
     * @param {string} [options.startDate] - Filter by start date (ISO string)
     * @param {string} [options.endDate] - Filter by end date (ISO string)
     * @param {number} [options.limit=30] - Maximum records to return
     * @returns {Promise<Array>} - Analytics data
     */
    async getAnalytics(businessId, options = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      queryParams.append('businessId', businessId);
      
      // Add all query parameters
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/analytics?${queryParams.toString()}`);
    }
  
    /**
     * Get insights for a business
     * @param {string} businessId - Business ID
     * @param {Object} [options] - Query options
     * @param {string} [options.type] - Insight type (trend, anomaly, recommendation, alert)
     * @param {number} [options.minSeverity=1] - Minimum severity level (1-5)
     * @param {boolean} [options.isAcknowledged] - Filter by acknowledgment status
     * @param {string} [options.startDate] - Filter by start date (ISO string)
     * @param {string} [options.endDate] - Filter by end date (ISO string)
     * @param {number} [options.page=1] - Page number
     * @param {number} [options.limit=20] - Results per page
     * @returns {Promise<Object>} - Insights with pagination
     */
    async getInsights(businessId, options = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      queryParams.append('businessId', businessId);
      
      // Add all query parameters
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/analytics/insights?${queryParams.toString()}`);
    }
  
    /**
     * Acknowledge an insight
     * @param {string} insightId - Insight ID
     * @param {string} [actionTaken] - Action taken in response to insight
     * @returns {Promise<Object>} - Updated insight
     */
    async acknowledgeInsight(insightId, actionTaken) {
      this._ensureConnected();
      
      return this._request('POST', `/analytics/insights/${insightId}/acknowledge`, {
        actionTaken: actionTaken || 'Reviewed'
      });
    }
  
    /**
     * Get dashboard analytics for a business
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} - Dashboard data
     */
    async getDashboardAnalytics(businessId) {
      this._ensureConnected();
      
      return this._request('GET', `/analytics/dashboard/${businessId}`);
    }
  
    // ===== INTEGRATION SERVICE METHODS =====
  
    /**
     * Get all integrations
     * @param {Object} [query] - Query parameters
     * @param {string} [query.type] - Filter by integration type
     * @param {string} [query.provider] - Filter by provider
     * @param {boolean} [query.isActive] - Filter by active status
     * @param {number} [query.page=1] - Page number
     * @param {number} [query.limit=20] - Results per page
     * @returns {Promise<Object>} - Integrations with pagination
     */
    async getIntegrations(query = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      
      // Add all query parameters
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/integrations?${queryParams.toString()}`);
    }
  
    /**
     * Create a new integration
     * @param {Object} integrationData - Integration data
     * @param {string} integrationData.name - Integration name
     * @param {string} integrationData.type - Integration type
     * @param {string} integrationData.provider - Provider name
     * @param {string} integrationData.businessId - Business ID
     * @param {Object} [integrationData.config] - Configuration
     * @param {Object} [integrationData.credentials] - Credentials
     * @param {Object} [integrationData.endpoints] - Endpoints
     * @returns {Promise<Object>} - Created integration
     */
    async createIntegration(integrationData) {
      this._ensureConnected();
      
      return this._request('POST', '/integrations', integrationData);
    }
  
    /**
     * Get integration by ID
     * @param {string} integrationId - Integration ID
     * @returns {Promise<Object>} - Integration
     */
    async getIntegration(integrationId) {
      this._ensureConnected();
      
      return this._request('GET', `/integrations/${integrationId}`);
    }
  
    /**
     * Update an integration
     * @param {string} integrationId - Integration ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object>} - Updated integration
     */
    async updateIntegration(integrationId, updateData) {
      this._ensureConnected();
      
      return this._request('PUT', `/integrations/${integrationId}`, updateData);
    }
  
    /**
     * Delete an integration
     * @param {string} integrationId - Integration ID
     * @returns {Promise<Object>} - Response
     */
    async deleteIntegration(integrationId) {
      this._ensureConnected();
      
      return this._request('DELETE', `/integrations/${integrationId}`);
    }
  
    /**
     * Test an integration
     * @param {string} integrationId - Integration ID
     * @returns {Promise<Object>} - Test result
     */
    async testIntegration(integrationId) {
      this._ensureConnected();
      
      return this._request('POST', `/integrations/${integrationId}/test`);
    }
  
    /**
     * Trigger an integration action
     * @param {string} integrationId - Integration ID
     * @param {string} action - Action to trigger
     * @param {Object} [data] - Action data
     * @returns {Promise<Object>} - Action result
     */
    async triggerIntegration(integrationId, action, data = {}) {
      this._ensureConnected();
      
      return this._request('POST', `/integrations/${integrationId}/trigger`, {
        action,
        data
      });
    }
  
    // ===== NOTIFICATION SERVICE METHODS =====
  
    /**
     * Get notifications for the current user
     * @param {Object} [options] - Query options
     * @param {boolean} [options.isRead] - Filter by read status
     * @param {string} [options.type] - Filter by notification type
     * @param {string} [options.category] - Filter by category
     * @param {string} [options.priority] - Filter by priority
     * @param {string} [options.startDate] - Filter by start date (ISO string)
     * @param {string} [options.endDate] - Filter by end date (ISO string)
     * @param {number} [options.page=1] - Page number
     * @param {number} [options.limit=20] - Results per page
     * @returns {Promise<Object>} - Notifications with pagination
     */
    async getNotifications(options = {}) {
      this._ensureConnected();
      
      const queryParams = new URLSearchParams();
      
      // Add all query parameters
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value);
        }
      });
      
      return this._request('GET', `/notifications?${queryParams.toString()}`);
    }
  
    /**
     * Mark a notification as read
     * @param {string} notificationId - Notification ID
     * @returns {Promise<Object>} - Updated notification
     */
    async markNotificationAsRead(notificationId) {
      this._ensureConnected();
      
      return this._request('POST', `/notifications/${notificationId}/read`);
    }
  
    /**
     * Mark all notifications as read
     * @returns {Promise<Object>} - Response
     */
    async markAllNotificationsAsRead() {
      this._ensureConnected();
      
      return this._request('POST', '/notifications/read-all');
    }
  
    /**
     * Get notification preferences
     * @returns {Promise<Object>} - Notification preferences
     */
    async getNotificationPreferences() {
      this._ensureConnected();
      
      return this._request('GET', '/notifications/preferences');
    }
  
    /**
     * Update notification preferences
     * @param {Object} preferences - Updated preferences
     * @returns {Promise<Object>} - Updated preferences
     */
    async updateNotificationPreferences(preferences) {
      this._ensureConnected();
      
      return this._request('PUT', '/notifications/preferences', preferences);
    }
  
    /**
     * Add a device token for push notifications
     * @param {string} token - Device token
     * @returns {Promise<Object>} - Response
     */
    async addDeviceToken(token) {
      this._ensureConnected();
      
      return this._request('POST', '/notifications/device-token', {
        token
      });
    }
  
    /**
     * Remove a device token
     * @param {string} token - Device token
     * @returns {Promise<Object>} - Response
     */
    async removeDeviceToken(token) {
      this._ensureConnected();
      
      return this._request('DELETE', `/notifications/device-token?token=${encodeURIComponent(token)}`);
    }
  
    // ===== EVENT LISTENER METHODS =====
  
    /**
     * Register event listener
     * @param {string} event - Event type to listen for
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
      if (typeof callback !== 'function') {
        throw new Error('Callback must be a function');
      }
      
      if (!this.eventListeners[event]) {
        this.eventListeners[event] = [];
      }
      
      this.eventListeners[event].push(callback);
      
      // If using webhooks, nothing more to do
      // If using sockets, ensure socket is connected
      if (this._socketIsEnabled() && !this.socket) {
        this._setupWebSocket()
          .catch(err => console.error('Failed to setup WebSocket:', err));
      }
    }
  
    /**
     * Remove event listener
     * @param {string} event - Event type
     * @param {Function} [callback] - Callback function (if omitted, removes all listeners for event)
     */
    off(event, callback) {
      if (!this.eventListeners[event]) {
        return;
      }
      
      if (!callback) {
        delete this.eventListeners[event];
        return;
      }
      
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  
    /**
     * Disconnect from the service
     */
    disconnect() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      
      this.isConnected = false;
      this.activeWatchers.clear();
    }
  
    // ===== PRIVATE METHODS =====
  
    /**
     * Make API request
     * @param {string} method - HTTP method
     * @param {string} path - API path
     * @param {Object} [data] - Request data
     * @returns {Promise<Object>} - Response data
     * @private
     */
    async _request(method, path, data = null) {
      const url = `${this.baseUrl}${path}`;
      
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Cybernate-SDK/1.0'
      };
      
      const options = {
        method,
        headers,
        timeout: this.timeout
      };
      
      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
      }
      
      try {
        const response = await fetch(url, options);
        
        // Track rate limits
        if (response.headers.has('X-RateLimit-Limit')) {
          this.rateLimit.limit = parseInt(response.headers.get('X-RateLimit-Limit'), 10);
        }
        if (response.headers.has('X-RateLimit-Remaining')) {
          this.rateLimit.remaining = parseInt(response.headers.get('X-RateLimit-Remaining'), 10);
        }
        if (response.headers.has('X-RateLimit-Reset')) {
          this.rateLimit.reset = parseInt(response.headers.get('X-RateLimit-Reset'), 10);
        }
        
        // Check for errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP error ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        // Enhance error with context
        throw new Error(`API request failed: ${error.message}`);
      }
    }
  
    /**
     * Set up WebSocket connection
     * @returns {Promise<void>}
     * @private
     */
    async _setupWebSocket() {
      return new Promise((resolve, reject) => {
        if (!this._socketIsEnabled()) {
          return reject(new Error('WebSocket not enabled or supported'));
        }
        
        try {
          // Load socket.io client in browser environment
          if (typeof io === 'undefined' && typeof require === 'function') {
            // In Node.js
            const io = require('socket.io-client');
            this.socket = io(`${this.baseUrl}/events`, {
              auth: { token: this.apiKey },
              transports: ['websocket'],
              reconnection: this.autoReconnect
            });
          } else if (typeof io !== 'undefined') {
            // In browser with io already loaded
            this.socket = io(`${this.baseUrl}/events`, {
              auth: { token: this.apiKey },
              transports: ['websocket'],
              reconnection: this.autoReconnect
            });
          } else {
            return reject(new Error('Socket.io client not available. Include socket.io-client in your project.'));
          }
          
          this.socket.on('connect', () => {
            console.log('Connected to Cybernate events socket');
            resolve();
          });
          
          this.socket.on('disconnect', () => {
            console.log('Disconnected from Cybernate events socket');
          });
          
          this.socket.on('error', (error) => {
            console.error('Socket error:', error);
          });
          
          // Listen for events and dispatch to registered listeners
          this.socket.on('event', (eventData) => {
            this._dispatchEvent(eventData);
          });
          
          // Listen for notifications
          this.socket.on('notification', (notificationData) => {
            // Dispatch as a special event type
            this._dispatchEvent({
              ...notificationData,
              eventType: 'notification'
            });
          });
          
          // Wait for connection or timeout
          setTimeout(() => {
            if (!this.socket.connected) {
              reject(new Error('WebSocket connection timeout'));
            }
          }, this.timeout);
        } catch (error) {
          reject(error);
        }
      });
    }
  
    /**
     * Dispatch event to registered listeners
     * @param {Object} eventData - Event data
     * @private
     */
    _dispatchEvent(eventData) {
      // Extract event type or default to 'detection'
      const eventType = eventData.eventType || 'detection';
      
      // Call specific event listeners
      if (this.eventListeners[eventType]) {
        this.eventListeners[eventType].forEach(callback => {
          try {
            callback(eventData);
          } catch (error) {
            console.error(`Error in event listener for ${eventType}:`, error);
          }
        });
      }
      
      // Call 'all' event listeners
      if (this.eventListeners['all']) {
        this.eventListeners['all'].forEach(callback => {
          try {
            callback(eventData);
          } catch (error) {
            console.error('Error in "all" event listener:', error);
          }
        });
      }
    }
  
    /**
     * Check if socket.io is available
     * @returns {boolean}
     * @private
     */
    _socketIsEnabled() {
      return (
        (typeof window !== 'undefined' && typeof io !== 'undefined') ||
        (typeof require === 'function' && this._isSocketIOAvailable())
      );
    }
  
    /**
     * Check if socket.io-client is available in Node.js
     * @returns {boolean}
     * @private
     */
    _isSocketIOAvailable() {
      try {
        require.resolve('socket.io-client');
        return true;
      } catch (e) {
        return false;
      }
    }
  
    /**
     * Ensure client is connected
     * @private
     */
    _ensureConnected() {
      if (!this.isConnected) {
        throw new Error('Not connected to Cybernate API. Call connect() first.');
      }
    }
  }
  
  // Export for both CommonJS and ES modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CybernateAI };
  } else {
    window.CybernateAI = CybernateAI;
  }