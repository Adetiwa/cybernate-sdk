// Import polyfill for fetch in Node.js environments
let fetch;
if (typeof window !== 'undefined') {
  fetch = window.fetch;
} else {
  // Node.js environment
  try {
    fetch = require('cross-fetch');
  } catch (e) {
    throw new Error('cross-fetch is required for Node.js environments');
  }
}

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
   * @param {boolean} [options.enableWebSocket] - Enable WebSocket connections (default: true)
   * @param {number} [options.reconnectAttempts] - Max reconnection attempts (default: 5)
   * @param {number} [options.reconnectDelay] - Delay between reconnection attempts in ms (default: 1000)
   */
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || 'https://api.cybernate.ai/v1';
    this.timeout = options.timeout || 30000;
    this.autoReconnect = options.autoReconnect !== false;
    this.enableWebSocket = options.enableWebSocket !== false;
    this.reconnectAttempts = options.reconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 1000;
    
    this.eventListeners = {};
    this.activeWatchers = new Map();
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectCount = 0;
    
    // Live video streaming (https://live.cybernate.ai) — see createStreamingApi below
    this.streaming = createStreamingApi(this);

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
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }
    
    this.isConnecting = true;
    
    try {
      // Validate API key with server
      const response = await this._request('GET', '/auth/validate');
      
      // Store user and organization info
      this.user = response.user;
      this.organization = response.organization;
      
      try {
        await this._setupWebSocket();
      } catch (socketError) {
        console.warn('WebSocket unavailable, using HTTP-only mode:', socketError.message);
      }

      
      this.isConnected = true;
      this.isConnecting = false;
      
      return {
        connected: true,
        user: this.user,
        organization: this.organization,
        websocketEnabled: !!this.socket?.connected
      };
    } catch (error) {
      this.isConnected = false;
      this.isConnecting = false;
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
      endpoint = '/events/watch';
      payload = {
        targetUrl: options.streamUrl,
        type: 'stream',
        id: options.businessId,
        name: options.name || `Stream ${new Date().toISOString()}`,
        // detectionSettings: options.detectionSettings || {}
      };
    } else if (options.deviceId) {
      endpoint = '/devices/watch';
      payload = {
        type: 'device',
        id: options.deviceId,
        detectionSettings: options.detectionSettings || {}
      };
    } else {
      endpoint = '/businesses/watch';
      payload = {
        type: 'business',
        id: options.businessId,
        detectionSettings: options.detectionSettings || {}
      };
    }
    
    // Add notification settings - prefer WebSocket if available, fallback to webhook
    payload.notificationSettings = options.notificationSettings || { 
      method: (this.socket?.connected) ? 'socket' : 'webhook' 
    };
    
    // If webhook but no URL, throw error
    if (payload.notificationSettings.method === 'webhook' && !payload.notificationSettings.webhookUrl) {
      throw new Error('webhookUrl is required for webhook notifications');
    }
    
    // Set up the watcher with explicit authentication
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
    
    const response = await this._fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
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
    
    // If WebSocket is enabled but not connected, try to set it up
    if (this.enableWebSocket && this._socketIsEnabled() && !this.socket?.connected) {
      this._setupWebSocket()
        .catch(err => console.warn('Failed to setup WebSocket for event listener:', err.message));
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
   * Get WebSocket connection status
   * @returns {Object} - Connection status info
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      websocketConnected: !!this.socket?.connected,
      websocketEnabled: this.enableWebSocket,
      reconnectCount: this.reconnectCount,
      activeWatchers: this.activeWatchers.size
    };
  }

  /**
   * Manually retry WebSocket connection
   * @returns {Promise<boolean>} - Success status
   */
  async retryWebSocketConnection() {
    if (!this.enableWebSocket || !this._socketIsEnabled()) {
      throw new Error('WebSocket not enabled or available');
    }
    
    if (this.socket?.connected) {
      return true;
    }
    
    try {
      await this._setupWebSocket();
      return true;
    } catch (error) {
      console.error('Manual WebSocket retry failed:', error.message);
      return false;
    }
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
    this.isConnecting = false;
    this.reconnectCount = 0;
    this.activeWatchers.clear();
  }

  // ===== PRIVATE METHODS =====

  /**
   * Make API request with enhanced authentication
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
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Cybernate-SDK/1.0',
      'Accept': 'application/json'
    };

    const options = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await this._fetchWithTimeout(url, options);
      
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
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
        }

        if (response.status === 401) {
          throw new Error(`Authentication failed: ${errorData.message || 'Invalid API key'}`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden: ${errorData.message || 'Insufficient permissions'}`);
        } else if (response.status === 404) {
          throw new Error(`Endpoint not found: ${errorData.message || 'The requested resource was not found'}`);
        } else if (response.status >= 500) {
          throw new Error(`Server error: ${errorData.message || 'Internal server error'}`);
        } else {
          throw new Error(errorData.message || `HTTP error ${response.status}`);
        }
      }
      
      // 204 No Content (e.g. deletes) has no body
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      // Enhanced error context
      if (error.message.includes('fetch')) {
        throw new Error(`Network error: Unable to connect to ${url}. Please check your internet connection.`);
      }
      
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  /**
   * fetch with a real timeout via AbortController.
   * (Plain fetch ignores a `timeout` option — this enforces this.timeout.)
   * @private
   */
  async _fetchWithTimeout(url, options = {}, timeoutMs) {
    const ms = timeoutMs || this.timeout;
    const supportsAbort = typeof AbortController !== 'undefined';
    if (!supportsAbort) {
      return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${ms}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Set up WebSocket connection with improved error handling
   * @returns {Promise<void>}
   * @private
   */
  async _setupWebSocket() {
    return new Promise((resolve, reject) => {
      if (!this._socketIsEnabled()) {
        return reject(new Error('WebSocket not enabled or supported'));
      }
      
      try {
        let io;
        // Load socket.io client in browser environment
        if (typeof window !== 'undefined' && typeof window.io !== 'undefined') {
          io = window.io;
        } else if (typeof require === 'function') {
          // In Node.js
          try {
            io = require('socket.io-client');
          } catch (e) {
            return reject(new Error('socket.io-client package not found. Install with: npm install socket.io-client'));
          }
        } else {
          return reject(new Error('Socket.io client not available. Include socket.io-client in your project.'));
        }
        
        // Clean up existing socket
        if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
        }
        
        // Create new socket with better configuration
        this.socket = io(`${this.baseUrl}/events`, {
          auth: { token: this.apiKey },
          transports: ['websocket', 'polling'], // Allow fallback to polling
          reconnection: this.autoReconnect,
          reconnectionAttempts: this.reconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
          timeout: this.timeout,
          forceNew: true
        });
        
        this.socket.on('connect', () => {
          this.reconnectCount = 0;
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          if (reason === 'io server disconnect' && this.autoReconnect) {
            setTimeout(() => {
              if (this.reconnectCount < this.reconnectAttempts) {
                this.reconnectCount++;
                this._setupWebSocket().catch(() => {});
              }
            }, this.reconnectDelay);
          }
        });

        this.socket.on('connect_error', (error) => {
          if (this.reconnectCount === 0) {
            reject(new Error(`WebSocket connection failed: ${error.message}`));
          }
        });

        this.socket.on('error', () => {});
        
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
        
        // Listen for system events
        this.socket.on('system', (systemData) => {
          this._dispatchEvent({
            ...systemData,
            eventType: 'system'
          });
        });
        
        const connectionTimeout = setTimeout(() => {
          if (!this.socket?.connected) {
            this.socket?.disconnect();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.timeout);

        this.socket.once('connect', () => clearTimeout(connectionTimeout));
        
      } catch (error) {
        reject(new Error(`Failed to initialize WebSocket: ${error.message}`));
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
      (typeof window !== 'undefined' && typeof window.io !== 'undefined') ||
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

  // ===== AI METHODS =====

  /**
   * Send a chat message to the AI engine.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options]
   * @param {string} [options.model] - Model ID, defaults to 'default'
   * @param {number} [options.maxTokens] - Max tokens to generate (default 400)
   * @param {number} [options.temperature] - Sampling temperature 0–1
   * @returns {Promise<{result: string, usage: Object, model: string}>}
   */
  async chat(messages, options = {}) {
    this._ensureConnected();
    return this._request('POST', '/ai/chat', {
      messages,
      model: options.model || 'default',
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  /**
   * Generate vector embeddings for one or more texts.
   * @param {string|string[]} texts
   * @param {string} [model] - Embedding model (default 'all-MiniLM-L6-v2')
   * @returns {Promise<{embeddings: number[][], model: string}>}
   */
  async embed(texts, model) {
    this._ensureConnected();
    return this._request('POST', '/ai/embed', {
      texts: Array.isArray(texts) ? texts : [texts],
      model,
    });
  }

  /**
   * Run object detection on an image.
   * @param {Object} options
   * @param {string} [options.imageBase64] - Base64-encoded image
   * @param {string} [options.imageUrl] - URL of the image
   * @param {string} [options.model] - Detection model (default 'rt-detr')
   * @param {number} [options.confidence] - Confidence threshold 0–1
   * @param {string[]} [options.classes] - Object classes to detect
   * @returns {Promise<{detections: Object[], model: string}>}
   */
  async detectObjects(options = {}) {
    this._ensureConnected();
    return this._request('POST', '/ai/vision/detect', {
      image_base64: options.imageBase64,
      image_url: options.imageUrl,
      model: options.model,
      confidence: options.confidence,
      classes: options.classes,
    });
  }

  /**
   * Stream a chat response token-by-token (Server-Sent Events).
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options]
   * @param {string} [options.model] - Model ID, defaults to 'default'
   * @param {number} [options.maxTokens] - Max tokens to generate
   * @param {number} [options.temperature] - Sampling temperature 0–1
   * @param {string} [options.systemPrompt] - System prompt override
   * @param {string} [options.sessionId] - Session ID for conversation memory
   * @param {Function} [onChunk] - Called with each text fragment as it arrives
   * @returns {Promise<string>} - The full response text once the stream ends
   */
  async chatStream(messages, options = {}, onChunk) {
    this._ensureConnected();
    if (typeof options === 'function') {
      onChunk = options;
      options = {};
    }

    const response = await this._fetchWithTimeout(`${this.baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        messages,
        model: options.model || 'default',
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        systemPrompt: options.systemPrompt,
        session_id: options.sessionId,
        stream: true
      })
    }, options.timeout || 300000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error ${response.status}`);
    }

    let fullText = '';
    let buffer = '';

    const handleSSE = (textChunk) => {
      buffer += textChunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = event.replace(/^data:\s*/, '').trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            if (onChunk) onChunk(content);
          }
        } catch (e) { /* partial line — wait for more data */ }
      }
    };

    if (response.body && typeof response.body.getReader === 'function') {
      // WHATWG streams (browsers, Node 18+ native fetch)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        handleSSE(decoder.decode(value, { stream: true }));
      }
    } else if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
      // Node.js readable streams (node-fetch / cross-fetch)
      for await (const chunk of response.body) {
        handleSSE(chunk.toString('utf8'));
      }
    } else {
      // No streaming support — fall back to reading the whole body
      handleSSE(await response.text());
    }

    return fullText;
  }

  /**
   * Extract structured JSON from text using a schema you define.
   * The building block for custom applications: fraud triage, document
   * extraction, agricultural reports, IoT alert parsing, etc.
   * @param {string} prompt - The text/instruction to analyze
   * @param {Object} schema - JSON Schema describing the output you want
   * @param {Object} [options]
   * @param {string} [options.model] - Model ID
   * @param {number} [options.temperature] - Default 0.1 for deterministic output
   * @returns {Promise<{result: Object, model: string, latencyMs: number}>}
   */
  async structured(prompt, schema, options = {}) {
    this._ensureConnected();
    return this._request('POST', '/ai/structured', {
      prompt,
      schema,
      model: options.model,
      temperature: options.temperature
    });
  }

  /**
   * Moderate user content (text and/or image) — built for social platforms.
   * Understands African languages, pidgin, and local slang.
   * @param {Object} options
   * @param {string} [options.text] - Text content to moderate
   * @param {string} [options.imageBase64] - Base64-encoded image to scan
   * @param {string} [options.imageUrl] - URL of an image to scan
   * @param {string} [options.context] - Platform context (e.g. "comments on a news post")
   * @returns {Promise<{flagged: boolean, severity: string, action: string, text: Object, image: Object}>}
   *  - severity: none | low | medium | high | critical
   *  - action: allow | review | block
   *  - text.categories: per-category scores 0–1 (hate, harassment, violence, ...)
   *  - image.dangerousObjects: detected weapons/dangerous items, if an image was given
   */
  async moderate(options = {}) {
    this._ensureConnected();
    if (!options.text && !options.imageBase64 && !options.imageUrl) {
      throw new Error('Provide text, imageBase64, or imageUrl to moderate');
    }
    return this._request('POST', '/ai/moderate', {
      text: options.text,
      imageBase64: options.imageBase64,
      imageUrl: options.imageUrl,
      context: options.context
    });
  }

  /**
   * Analyze a news article or incident report and extract structured
   * danger-zone data: locations, incident type, category, severity,
   * casualties, and safety advice. Built for security intelligence (Sety).
   * @param {Object} options
   * @param {string} options.text - Article body / report text (required)
   * @param {string} [options.title] - Headline
   * @param {string} [options.url] - Source URL
   * @param {string} [options.publishedAt] - Publication date (ISO string)
   * @returns {Promise<{analysis: Object, model: string, latencyMs: number}>}
   *  analysis: { is_security_relevant, incident_type, category, severity (1-10),
   *              locations: [{name, city, state, country, specificity}],
   *              date, actors, targets, casualties, summary, safety_advice }
   */
  async analyzeNews(options = {}) {
    this._ensureConnected();
    if (!options.text) {
      throw new Error('text is required');
    }
    return this._request('POST', '/ai/analyze/news', {
      text: options.text,
      title: options.title,
      url: options.url,
      publishedAt: options.publishedAt
    });
  }

  /**
   * Anthropic-style messages API — a familiar, uniform shape that serves
   * every text task (analysis, news, moderation prompts, summarization...).
   * Code written against `client.messages.create({...})` works as-is:
   *
   *   const message = await cybernate.messages.create({
   *     model: 'default',
   *     max_tokens: 700,
   *     system: SYSTEM_PROMPT,
   *     messages: [{ role: 'user', content: buildPrompt(title, body) }],
   *   });
   *   const text = message.content[0].text;
   *
   * Tip: if you are prompting for JSON, prefer `structured(prompt, schema)` —
   * the platform parses (and repairs) the JSON server-side, so you don't need
   * the ```json fence-stripping cleanup.
   */
  get messages() {
    const self = this;
    return {
      /**
       * @param {Object} params
       * @param {string} [params.model] - Model ID (default 'default')
       * @param {number} [params.max_tokens] - Max tokens to generate
       * @param {string} [params.system] - System prompt
       * @param {Array<{role: string, content: string}>} params.messages
       * @param {number} [params.temperature]
       * @returns {Promise<{id, model, role, content: [{type: 'text', text}], usage}>}
       */
      async create(params = {}) {
        self._ensureConnected();
        if (!params.messages || !params.messages.length) {
          throw new Error('messages is required');
        }
        const resp = await self._request('POST', '/ai/chat', {
          messages: params.messages,
          model: params.model || 'default',
          maxTokens: params.max_tokens,
          temperature: params.temperature,
          systemPrompt: params.system,
          session_id: params.session_id
        });
        return {
          id: resp.requestId,
          type: 'message',
          role: 'assistant',
          model: resp.model,
          content: [{ type: 'text', text: resp.result || '' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: resp.usage?.tokensIn || 0,
            output_tokens: resp.usage?.tokensOut || 0
          }
        };
      }
    };
  }

  /**
   * List available AI models.
   * @returns {Promise<{local: Object[], remote: Object[]}>}
   */
  async listModels() {
    this._ensureConnected();
    return this._request('GET', '/ai/models');
  }

  // ===== CONVERSATION METHODS =====

  /**
   * List all conversations for the authenticated user.
   * @returns {Promise<{conversations: Object[]}>}
   */
  async listConversations() {
    this._ensureConnected();
    return this._request('GET', '/conversations');
  }

  /**
   * Create a new conversation.
   * @param {string} [title]
   * @returns {Promise<{conversation: Object}>}
   */
  async createConversation(title) {
    this._ensureConnected();
    return this._request('POST', '/conversations', { title });
  }

  /**
   * Get a conversation and its messages.
   * @param {string} conversationId
   * @returns {Promise<{conversation: Object, messages: Object[]}>}
   */
  async getConversation(conversationId) {
    this._ensureConnected();
    return this._request('GET', `/conversations/${conversationId}`);
  }

  /**
   * Update a conversation (title or pinned state).
   * @param {string} conversationId
   * @param {Object} updates - { title?, pinned? }
   * @returns {Promise<{conversation: Object}>}
   */
  async updateConversation(conversationId, updates) {
    this._ensureConnected();
    return this._request('PATCH', `/conversations/${conversationId}`, updates);
  }

  /**
   * Delete a conversation and all its messages.
   * @param {string} conversationId
   * @returns {Promise<{success: boolean}>}
   */
  async deleteConversation(conversationId) {
    this._ensureConnected();
    return this._request('DELETE', `/conversations/${conversationId}`);
  }

  /**
   * Send a message in a conversation and get an AI reply.
   * The full conversation history is used for context automatically.
   * @param {string} conversationId
   * @param {string} content - The user message
   * @param {Object} [options]
   * @param {string} [options.model] - Model ID
   * @returns {Promise<{result: string, usage: Object, model: string, conversationTitle: string}>}
   */
  async sendMessage(conversationId, content, options = {}) {
    this._ensureConnected();
    return this._request('POST', `/conversations/${conversationId}/messages`, {
      content,
      model: options.model,
    });
  }

  /**
   * Rate an AI message (thumbs up / thumbs down).
   * @param {string} conversationId
   * @param {string} messageId
   * @param {'up'|'down'|null} rating
   * @returns {Promise<{message: Object}>}
   */
  async rateMessage(conversationId, messageId, rating) {
    this._ensureConnected();
    return this._request('PATCH', `/conversations/${conversationId}/messages/${messageId}/rate`, { rating });
  }

  // ===== INTERNAL =====

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

// ===== STREAMING =====

function queryString(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, v instanceof Date ? v.toISOString() : String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Live streaming API: `client.streaming.*`.
 * A stream is one broadcast: create it, give `ingest.stream_url` (or rtmp_url +
 * stream_key) to the broadcaster, show `playback.hls_url` to viewers. Lifecycle
 * changes arrive as signed webhooks (see CybernateAI.verifyWebhook) and are
 * billed from your Cybernate credits (live minutes + viewer minutes).
 * @param {CybernateAI} client
 */
function createStreamingApi(client) {
  const req = (method, path, body) => client._request(method, `/streaming${path}`, body);
  const unwrap = (res) => (res && res.data !== undefined ? res.data : res);
  const enc = encodeURIComponent;

  return {
    /**
     * Create a stream. The stream key is only returned here (and on resetKey).
     * @param {{title?: string, external_id?: string, metadata?: object}} [params]
     */
    createStream: async (params = {}) => unwrap(await req('POST', '/streams', params)),
    /** @param {{status?: string, external_id?: string, limit?: number, starting_after?: string}} [params] */
    listStreams: async (params = {}) => req('GET', `/streams${queryString(params)}`),
    getStream: async (streamId) => unwrap(await req('GET', `/streams/${enc(streamId)}`)),
    updateStream: async (streamId, changes) => unwrap(await req('PATCH', `/streams/${enc(streamId)}`, changes)),
    /** End the stream now; the broadcaster is disconnected. */
    endStream: async (streamId) => unwrap(await req('POST', `/streams/${enc(streamId)}/end`)),
    /** Only while the stream is idle (not yet live). Returns the new key. */
    resetStreamKey: async (streamId) => unwrap(await req('POST', `/streams/${enc(streamId)}/reset-key`)),
    deleteStream: async (streamId) => { await req('DELETE', `/streams/${enc(streamId)}`); return true; },
    /** { current, peak, unique, viewer_seconds } */
    getViewers: async (streamId) => unwrap(await req('GET', `/streams/${enc(streamId)}/viewers`)),

    /** Recent lifecycle events (with webhook delivery status). */
    listEvents: async (params = {}) => req('GET', `/events${queryString(params)}`),
    redeliverEvent: async (eventId) => unwrap(await req('POST', `/events/${enc(eventId)}/redeliver`)),

    /** Webhook endpoint + signing secret for your business. */
    getSettings: async () => unwrap(await req('GET', '/settings')),
    /** @param {{webhook_url?: string|null}} changes */
    updateSettings: async (changes) => unwrap(await req('PATCH', '/settings', changes)),
    rotateWebhookSecret: async () => unwrap(await req('POST', '/settings/webhook-secret/rotate')),
    getWebhookSecret: async () => unwrap(await req('GET', '/settings/webhook-secret')),
    sendTestWebhook: async () => unwrap(await req('POST', '/settings/webhook-test')),

    /** Billed usage: { totals, rates, items }. Defaults to the last 30 days. */
    getUsage: async (params = {}) => unwrap(await req('GET', `/usage${queryString(params)}`)),
  };
}

/**
 * Verify a Cybernate webhook (streaming events).
 * Header: `Cybernate-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
 * Use the RAW request body (not re-serialised JSON). Works in Node 18+ and browsers.
 * @param {string} secret - webhook signing secret (whsec_…)
 * @param {string} rawBody
 * @param {string} signatureHeader
 * @param {number} [toleranceSeconds=300] - reject older timestamps (replay protection)
 * @returns {Promise<boolean>}
 */
async function verifyWebhook(secret, rawBody, signatureHeader, toleranceSeconds = 300) {
  const parts = String(signatureHeader || '').split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k === 't') acc.t = Number(v);
    else if (k === 'v1' && v) acc.v1.push(v);
    return acc;
  }, { t: null, v1: [] });
  if (!parts.t || parts.v1.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - parts.t) > toleranceSeconds) return false;

  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) || null;
  if (!subtle) throw new Error('verifyWebhook requires the Web Crypto API (Node 18+ or a modern browser)');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await subtle.sign('HMAC', key, enc.encode(`${parts.t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  return parts.v1.some((candidate) => {
    if (candidate.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

CybernateAI.verifyWebhook = verifyWebhook;

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CybernateAI };
} else if (typeof window !== 'undefined') {
  window.CybernateAI = CybernateAI;
}