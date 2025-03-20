# Cybernate AI SDK - API Documentation

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Authentication](#authentication)
- [Core Methods](#core-methods)
  - [Constructor](#constructor)
  - [connect](#connect)
  - [disconnect](#disconnect)
- [Event Service](#event-service)
  - [watch](#watch)
  - [unwatch](#unwatch)
  - [getActiveWatchers](#getactivewatchers)
  - [queryEvents](#queryevents)
  - [getEventStatistics](#geteventstatistics)
  - [acknowledgeEvent](#acknowledgeevent)
- [Webhook Service](#webhook-service)
  - [setWebhook](#setwebhook)
  - [getWebhooks](#getwebhooks)
  - [deleteWebhook](#deletewebhook)
  - [testWebhook](#testwebhook)
- [Storage Service](#storage-service)
  - [uploadFile](#uploadfile)
  - [getFileInfo](#getfileinfo)
  - [queryFiles](#queryfiles)
  - [deleteFile](#deletefile)
  - [getFileUrl](#getfileurl)
  - [captureStreamFrame](#capturestreamframe)
- [Analytics Service](#analytics-service)
  - [getAnalytics](#getanalytics)
  - [getInsights](#getinsights)
  - [acknowledgeInsight](#acknowledgeinsight)
  - [getDashboardAnalytics](#getdashboardanalytics)
- [Integration Service](#integration-service)
  - [getIntegrations](#getintegrations)
  - [createIntegration](#createintegration)
  - [getIntegration](#getintegration)
  - [updateIntegration](#updateintegration)
  - [deleteIntegration](#deleteintegration)
  - [testIntegration](#testintegration)
  - [triggerIntegration](#triggerintegration)
- [Notification Service](#notification-service)
  - [getNotifications](#getnotifications)
  - [markNotificationAsRead](#marknotificationasread)
  - [markAllNotificationsAsRead](#markallnotificationsasread)
  - [getNotificationPreferences](#getnotificationpreferences)
  - [updateNotificationPreferences](#updatenotificationpreferences)
  - [addDeviceToken](#adddevicetoken)
  - [removeDeviceToken](#removedevicetoken)
- [Event Listeners](#event-listeners)
  - [on](#on)
  - [off](#off)
- [Error Handling](#error-handling)
- [TypeScript Support](#typescript-support)

## Introduction

The Cybernate AI SDK provides a comprehensive interface to interact with the Cybernate security platform. It enables developers to integrate AI-powered security monitoring, event processing, analytics, and third-party system integration into their applications.

## Installation

```bash
npm install cybernate-ai
```

## Authentication

All API interactions require authentication using an API key.

```javascript
import { CybernateAI } from 'cybernate-ai';

const cybernate = new CybernateAI('YOUR_API_KEY');
await cybernate.connect();
```

## Core Methods

### Constructor

```javascript
new CybernateAI(apiKey, options)
```

Creates a new instance of the Cybernate AI SDK.

**Parameters:**
- `apiKey` (string, required): Your Cybernate API key
- `options` (object, optional):
  - `baseUrl` (string): API base URL (defaults to Cybernate production API)
  - `timeout` (number): Request timeout in milliseconds (default: 30000)
  - `autoReconnect` (boolean): Auto reconnect on connection failure (default: true)

**Example:**
```javascript
const cybernate = new CybernateAI('YOUR_API_KEY', {
  baseUrl: 'https://api.staging.cybernate.ai/v1',
  timeout: 60000
});
```

### connect

```javascript
async connect()
```

Establishes a connection to the Cybernate API and validates your API key.

**Returns:** Promise<Object> - Connection information including user and organization details

**Example:**
```javascript
try {
  const connectionInfo = await cybernate.connect();
  console.log(`Connected as ${connectionInfo.user.name}`);
} catch (error) {
  console.error('Failed to connect:', error);
}
```

### disconnect

```javascript
disconnect()
```

Disconnects from the Cybernate service and cleans up resources.

**Example:**
```javascript
// When your application is shutting down
cybernate.disconnect();
```

## Event Service

### watch

```javascript
async watch(options)
```

Begins monitoring a video stream, device, or business for security events.

**Parameters:**
- `options` (object, required):
  - `streamUrl` (string, optional): URL of the stream to watch
  - `deviceId` (string, optional): ID of the device to watch
  - `businessId` (string, optional): ID of the business to watch
  - `detectionSettings` (object, optional):
    - `sensitivityLevel` (number): Detection sensitivity (0-1)
    - `objectTypes` (string[]): Object types to detect
  - `notificationSettings` (object, optional):
    - `method` (string): Notification method ('webhook', 'socket')
    - `webhookUrl` (string): Webhook URL (required if method is 'webhook')

**Returns:** Promise<Object> - Watcher ID and configuration

**Example:**
```javascript
const watcher = await cybernate.watch({
  streamUrl: 'rtsp://camera.example.com/stream1',
  detectionSettings: {
    sensitivityLevel: 0.7,
    objectTypes: ['person', 'vehicle']
  }
});

console.log(`Watching with ID: ${watcher.watcherId}`);
```

### unwatch

```javascript
async unwatch(watcherId)
```

Stops monitoring a stream, device, or business.

**Parameters:**
- `watcherId` (string, required): ID of the watcher to stop

**Returns:** Promise<Object> - Response object

**Example:**
```javascript
await cybernate.unwatch('watcher_id_123');
console.log('Stopped watching stream');
```

### getActiveWatchers

```javascript
async getActiveWatchers()
```

Retrieves all currently active watchers.

**Returns:** Promise<Array> - Array of watcher objects

**Example:**
```javascript
const watchers = await cybernate.getActiveWatchers();
console.log(`You have ${watchers.length} active watchers`);
```

### queryEvents

```javascript
async queryEvents(query)
```

Searches for events with filtering and pagination.

**Parameters:**
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

**Returns:** Promise<Object> - Events with pagination information

**Example:**
```javascript
const events = await cybernate.queryEvents({
  businessId: 'business_123',
  startDate: '2023-09-01T00:00:00Z',
  endDate: '2023-09-30T23:59:59Z',
  page: 1,
  limit: 50
});

console.log(`Found ${events.pagination.total} events`);
```

### getEventStatistics

```javascript
async getEventStatistics(query)
```

Retrieves statistics about events.

**Parameters:**
- `query` (object, optional): Same as queryEvents

**Returns:** Promise<Object> - Event statistics

**Example:**
```javascript
const stats = await cybernate.getEventStatistics({
  businessId: 'business_123',
  startDate: '2023-09-01T00:00:00Z',
  endDate: '2023-09-30T23:59:59Z'
});

console.log(`Total events: ${stats.totalEvents}`);
```

### acknowledgeEvent

```javascript
async acknowledgeEvent(eventId, notes)
```

Marks an event as acknowledged.

**Parameters:**
- `eventId` (string, required): Event ID
- `notes` (string, optional): Optional notes

**Returns:** Promise<Object> - Updated event

**Example:**
```javascript
await cybernate.acknowledgeEvent('event_123', 'False alarm, employee arrival');
```

## Webhook Service

### setWebhook

```javascript
async setWebhook(config)
```

Configures a webhook for event notifications.

**Parameters:**
- `config` (object, required):
  - `url` (string, required): Webhook URL
  - `events` (string[], optional): Event types to receive (defaults to all)

**Returns:** Promise<Object> - Response object

**Example:**
```javascript
await cybernate.setWebhook({
  url: 'https://your-server.com/webhooks/cybernate',
  events: ['detection', 'alert']
});
```

### getWebhooks

```javascript
async getWebhooks()
```

Retrieves all configured webhooks.

**Returns:** Promise<Array> - Array of webhook objects

**Example:**
```javascript
const webhooks = await cybernate.getWebhooks();
console.log(`You have ${webhooks.length} webhooks configured`);
```

### deleteWebhook

```javascript
async deleteWebhook(webhookId)
```

Deletes a webhook configuration.

**Parameters:**
- `webhookId` (string, required): Webhook ID

**Returns:** Promise<Object> - Response object

**Example:**
```javascript
await cybernate.deleteWebhook('webhook_123');
```

### testWebhook

```javascript
async testWebhook(url, payload)
```

Tests a webhook endpoint.

**Parameters:**
- `url` (string, required): Webhook URL to test
- `payload` (object, optional): Optional custom payload

**Returns:** Promise<Object> - Test result

**Example:**
```javascript
const result