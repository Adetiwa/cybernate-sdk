# Cybernate AI SDK

[![npm version](https://img.shields.io/npm/v/cybernate-ai.svg)](https://www.npmjs.com/package/cybernate-ai)
[![License](https://img.shields.io/npm/l/cybernate-ai.svg)](https://github.com/cybernate-ai/cybernate-sdk/blob/main/LICENSE)

JavaScript SDK for the Cybernate AI Security Platform. This SDK enables you to integrate with Cybernate's AI-powered security monitoring and response capabilities.

## Installation

```bash
npm install cybernate-ai
```

or with yarn:

```bash
yarn add cybernate-ai
```

## Quick Start

```javascript
import { CybernateAI } from 'cybernate-ai';

// Initialize the client
const cybernate = new CybernateAI('YOUR_API_KEY', {
  baseUrl: 'https://api.cybernate.ai/v1' // Optional, defaults to production API
});

// Connect to the service
await cybernate.connect();

// Start monitoring a video stream
const watcher = await cybernate.watch({
  streamUrl: 'rtsp://camera.example.com/stream1',
  detectionSettings: {
    sensitivityLevel: 0.7,
    objectTypes: ['person', 'vehicle']
  }
});

// Listen for detection events
cybernate.on('detection', (event) => {
  console.log(`Detection: ${event.objects.map(o => o.name).join(', ')}`);
});
```

## Authentication

Obtain your API key from the Cybernate dashboard. This key will be used to authenticate all SDK requests.

```javascript
const cybernate = new CybernateAI('YOUR_API_KEY');
await cybernate.connect();
```

## API Reference

### Core Methods

#### `new CybernateAI(apiKey, options)`

Creates a new Cybernate AI client instance.

Parameters:
- `apiKey` (string): Your Cybernate API key
- `options` (object, optional):
  - `baseUrl` (string): API base URL (defaults to Cybernate production API)
  - `timeout` (number): Request timeout in milliseconds (default: 30000)
  - `autoReconnect` (boolean): Auto reconnect on connection failure (default: true)

#### `connect()`

Establishes a connection to the Cybernate API and validates your API key.

Returns: Promise resolving to an object with connection information.

#### `disconnect()`

Disconnects from the Cybernate service and cleans up resources.

### Event Monitoring

#### `watch(options)`

Begins monitoring a video stream, device, or business for security events.

Parameters:
- `options` (object):
  - `streamUrl` (string, optional): URL of the stream to watch
  - `deviceId` (string, optional): ID of the device to watch
  - `businessId` (string, optional): ID of the business to watch
  - `detectionSettings` (object, optional):
    - `sensitivityLevel` (number): Detection sensitivity (0-1)
    - `objectTypes` (string[]): Object types to detect
  - `notificationSettings` (object, optional):
    - `method` (string): Notification method ('webhook', 'socket')
    - `webhookUrl` (string): Webhook URL (required if method is 'webhook')

Returns: Promise resolving to an object with watcher ID and configuration.

#### `unwatch(watcherId)`

Stops monitoring a stream, device, or business.

Parameters:
- `watcherId` (string): ID of the watcher to stop

Returns: Promise resolving to a response object.

#### `getActiveWatchers()`

Retrieves all currently active watchers.

Returns: Promise resolving to an array of watcher objects.

#### `on(event, callback)`

Registers an event listener for a specific event type.

Parameters:
- `event` (string): Event type to listen for (e.g., 'detection', 'alert', 'notification')
- `callback` (function): Callback function to be called when the event occurs

#### `off(event, callback)`

Removes an event listener.

Parameters:
- `event` (string): Event type
- `callback` (function, optional): Callback function (if omitted, removes all listeners for the event)

### Event Management

#### `queryEvents(query)`

Searches for events with filtering and pagination.

Parameters:
- `query` (object, optional):
  - `streamId` (string): Filter by stream ID
  - `deviceId` (string): Filter by device ID
  - `businessId` (string): Filter by business ID
  - `eventType` (string): Filter by event type
  - `objectType` (string): Filter by detected object type
  - `startDate` (string): Filter by start date (ISO string)
  - `endDate` (string): Filter by end date (ISO string)
  - `page` (number): Page number
  - `limit` (number): Results per page

Returns: Promise resolving to an object with events and pagination info.

#### `getEventStatistics(query)`

Retrieves statistics about events.

Parameters:
- `query` (object, optional): Same as queryEvents

Returns: Promise resolving to an object with event statistics.

#### `acknowledgeEvent(eventId, notes)`

Marks an event as acknowledged.

Parameters:
- `eventId` (string): Event ID
- `notes` (string, optional): Optional notes

Returns: Promise resolving to the updated event.

### Webhook Management

#### `setWebhook(config)`

Configures a webhook for event notifications.

Parameters:
- `config` (object):
  - `url` (string): Webhook URL
  - `events` (string[], optional): Event types to receive (defaults to all)

Returns: Promise resolving to a response object.

#### `getWebhooks()`

Retrieves all configured webhooks.

Returns: Promise resolving to an array of webhook objects.

#### `deleteWebhook(webhookId)`

Deletes a webhook configuration.

Parameters:
- `webhookId` (string): Webhook ID

Returns: Promise resolving to a response object.

#### `testWebhook(url, payload)`

Tests a webhook endpoint.

Parameters:
- `url` (string): Webhook URL to test
- `payload` (object, optional): Optional custom payload

Returns: Promise resolving to a test result object.

### Storage Management

#### `uploadFile(options)`

Uploads a file to Cybernate storage.

Parameters:
- `options` (object):
  - `file` (File|Blob|Buffer): File to upload
  - `fileName` (string): Original file name
  - `eventId` (string, optional): Associated event ID
  - `streamId` (string, optional): Associated stream ID
  - `deviceId` (string, optional): Associated device ID
  - `businessId` (string, optional): Associated business ID
  - `metadata` (object, optional): Additional metadata
  - `isPublic` (boolean, optional): Whether file is publicly accessible (default: false)

Returns: Promise resolving to an object with uploaded file info.

#### `getFileInfo(fileId)`

Retrieves information about a stored file.

Parameters:
- `fileId` (string): File ID

Returns: Promise resolving to a file info object.

#### `queryFiles(query)`

Searches for files with filtering.

Parameters:
- `query` (object, optional):
  - `eventId` (string): Filter by event ID
  - `streamId` (string): Filter by stream ID
  - `deviceId` (string): Filter by device ID
  - `businessId` (string): Filter by business ID
  - `startDate` (string): Filter by start date (ISO string)
  - `endDate` (string): Filter by end date (ISO string)
  - `mimeType` (string): Filter by MIME type
  - `page` (number): Page number
  - `limit` (number): Results per page

Returns: Promise resolving to an object with files and pagination info.

#### `deleteFile(fileId)`

Deletes a file from storage.

Parameters:
- `fileId` (string): File ID

Returns: Promise resolving to a response object.

#### `getFileUrl(fileId, expiresIn)`

Gets a signed URL for a file.

Parameters:
- `fileId` (string): File ID
- `expiresIn` (number, optional): Expiration time in seconds (default: 3600)

Returns: Promise resolving to an object with a signed URL.

#### `captureStreamFrame(streamId, options)`

Captures a frame from a video stream.

Parameters:
- `streamId` (string): Stream ID
- `options` (object, optional):
  - `isPublic` (boolean, optional): Whether captured frame is publicly accessible (default: false)
  - `metadata` (object, optional): Additional metadata

Returns: Promise resolving to an object with captured frame info.

### Analytics

#### `getAnalytics(businessId, options)`

Retrieves analytics data for a business.

Parameters:
- `businessId` (string): Business ID
- `options` (object, optional):
  - `type` (string): Analytics type ('daily', 'weekly', 'monthly', default: 'daily')
  - `period` (string): Specific period to get
  - `startDate` (string): Filter by start date (ISO string)
  - `endDate` (string): Filter by end date (ISO string)
  - `limit` (number): Maximum records to return (default: 30)

Returns: Promise resolving to an array of analytics objects.

#### `getInsights(businessId, options)`

Retrieves insights for a business.

Parameters:
- `businessId` (string): Business ID
- `options` (object, optional):
  - `type` (string): Insight type ('trend', 'anomaly', 'recommendation', 'alert')
  - `minSeverity` (number): Minimum severity level (1-5, default: 1)
  - `isAcknowledged` (boolean): Filter by acknowledgment status
  - `startDate` (string): Filter by start date (ISO string)
  - `endDate` (string): Filter by end date (ISO string)
  - `page` (number): Page number (default: 1)
  - `limit` (number): Results per page (default: 20)

Returns: Promise resolving to an object with insights and pagination info.

#### `acknowledgeInsight(insightId, actionTaken)`

Acknowledges an insight.

Parameters:
- `insightId` (string): Insight ID
- `actionTaken` (string, optional): Action taken in response to insight

Returns: Promise resolving to the updated insight.

#### `getDashboardAnalytics(businessId)`

Retrieves dashboard analytics for a business.

Parameters:
- `businessId` (string): Business ID

Returns: Promise resolving to a dashboard data object.

### Integrations

#### `getIntegrations(query)`

Retrieves all integrations with filtering.

Parameters:
- `query` (object, optional):
  - `type` (string): Filter by integration type
  - `provider` (string): Filter by provider
  - `isActive` (boolean): Filter by active status
  - `page` (number): Page number (default: 1)
  - `limit` (number): Results per page (default: 20)

Returns: Promise resolving to an object with integrations and pagination info.

#### `createIntegration(integrationData)`

Creates a new integration.

Parameters:
- `integrationData` (object):
  - `name` (string): Integration name
  - `type` (string): Integration type
  - `provider` (string): Provider name
  - `businessId` (string): Business ID
  - `config` (object, optional): Configuration
  - `credentials` (object, optional): Credentials
  - `endpoints` (object, optional): Endpoints

Returns: Promise resolving to the created integration.

#### `getIntegration(integrationId)`

Retrieves an integration by ID.

Parameters:
- `integrationId` (string): Integration ID

Returns: Promise resolving to an integration object.

#### `updateIntegration(integrationId, updateData)`

Updates an integration.

Parameters:
- `integrationId` (string): Integration ID
- `updateData` (object): Update data

Returns: Promise resolving to the updated integration.

#### `deleteIntegration(integrationId)`

Deletes an integration.

Parameters:
- `integrationId` (string): Integration ID

Returns: Promise resolving to a response object.

#### `testIntegration(integrationId)`

Tests an integration connection.

Parameters:
- `integrationId` (string): Integration ID

Returns: Promise resolving to a test result object.

#### `triggerIntegration(integrationId, action, data)`

Triggers an integration action manually.

Parameters:
- `integrationId` (string): Integration ID
- `action` (string): Action to trigger
- `data` (object, optional): Action data

Returns: Promise resolving to an action result object.

### Notifications

#### `getNotifications(options)`

Retrieves notifications for the current user.

Parameters:
- `options` (object, optional):
  - `isRead` (boolean): Filter by read status
  - `type` (string): Filter by notification type
  - `category` (string): Filter by category
  - `priority` (string): Filter by priority
  - `startDate` (string): Filter by start date (ISO string)
  - `endDate` (string): Filter by end date (ISO string)
  - `page` (number): Page number (default: 1)
  - `limit` (number): Results per page (default: 20)

Returns: Promise resolving to an object with notifications and pagination info.

#### `markNotificationAsRead(notificationId)`

Marks a notification as read.

Parameters:
- `notificationId` (string): Notification ID

Returns: Promise resolving to the updated notification.

#### `markAllNotificationsAsRead()`

Marks all notifications as read.

Returns: Promise resolving to a response object.

#### `getNotificationPreferences()`

Retrieves notification preferences for the current user.

Returns: Promise resolving to a preferences object.

#### `updateNotificationPreferences(preferences)`

Updates notification preferences.

Parameters:
- `preferences` (object): Updated preferences

Returns: Promise resolving to the updated preferences.

#### `addDeviceToken(token)`

Adds a device token for push notifications.

Parameters:
- `token` (string): Device token

Returns: Promise resolving to a response object.

#### `removeDeviceToken(token)`

Removes a device token.

Parameters:
- `token` (string): Device token

Returns: Promise resolving to a response object.

## Complete Example

```javascript
import { CybernateAI } from 'cybernate-ai';

async function setupSecurity() {
  try {
    // Initialize the client
    const cybernate = new CybernateAI('YOUR_API_KEY');
    
    // Connect to the service
    await cybernate.connect();
    console.log('Connected to Cybernate AI');
    
    // Set up notification preferences
    await cybernate.updateNotificationPreferences({
      email: {
        enabled: true,
        categories: {
          security: true,
          alert: true
        }
      },
      push: {
        enabled: true
      }
    });
    
    // If you're in a browser environment, register for push notifications
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'YOUR_PUBLIC_VAPID_KEY'
      });
      
      await cybernate.addDeviceToken(JSON.stringify(subscription));
    }
    
    // Start monitoring a camera
    const watcher = await cybernate.watch({
      streamUrl: 'rtsp://camera.example.com/stream1',
      detectionSettings: {
        sensitivityLevel: 0.7,
        objectTypes: ['person', 'vehicle', 'animal']
      }
    });
    console.log(`Watching stream with ID: ${watcher.watcherId}`);
    
    // Set up webhook for server-side processing
    await cybernate.setWebhook({
      url: 'https://your-server.com/webhooks/cybernate',
      events: ['detection', 'alert']
    });
    
    // Listen for events in real-time
    cybernate.on('detection', (event) => {
      console.log(`Detection: ${event.objects.map(o => o.name).join(', ')}`);
      
      // Capture a frame when a person is detected
      if (event.objects.some(obj => obj.name === 'person')) {
        cybernate.captureStreamFrame(event.streamId)
          .then(frame => console.log(`Captured frame: ${frame.url}`))
          .catch(err => console.error('Failed to capture frame:', err));
      }
    });
    
    // Add smart home integration
    const integration = await cybernate.createIntegration({
      name: 'Smart Lights',
      type: 'smart_home',
      provider: 'phillips_hue',
      businessId: 'YOUR_BUSINESS_ID',
      config: {
        turnOnLightsOnDetection: true
      },
      credentials: {
        apiKey: 'YOUR_PHILLIPS_HUE_API_KEY'
      }
    });
    
    // Check analytics daily
    setInterval(async () => {
      try {
        const dashboard = await cybernate.getDashboardAnalytics('YOUR_BUSINESS_ID');
        console.log(`Today's events: ${dashboard.currentPeriod.today}`);
        
        // Check for unacknowledged high-priority insights
        const insights = await cybernate.getInsights('YOUR_BUSINESS_ID', {
          minSeverity: 4,
          isAcknowledged: false
        });
        
        for (const insight of insights.insights) {
          console.log(`Important insight: ${insight.title}`);
        }
      } catch (err) {
        console.error('Failed to get analytics:', err);
      }
    }, 24 * 60 * 60 * 1000); // Once per day
    
  } catch (error) {
    console.error('Error setting up Cybernate:', error);
  }
}

setupSecurity();
```

## Error Handling

The SDK throws errors when API requests fail. Always wrap calls in try/catch blocks:

```javascript
try {
  await cybernate.watch({
    streamUrl: 'rtsp://camera.example.com/stream1'
  });
} catch (error) {
  console.error('Failed to start watching stream:', error.message);
}
```

## Browser Support

The SDK works in modern browsers and Node.js environments. For older browsers, you may need to use a fetch polyfill.

## License

MIT