# Cybernate AI SDK - API Documentation

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Authentication](#authentication)
- [Core Methods](#core-methods)
  - [Constructor](#constructor)
  - [connect](#connect)
  - [disconnect](#disconnect)
- [AI Service](#ai-service)
  - [chat](#chat)
  - [messages.create](#messagescreate)
  - [chatStream](#chatstream)
  - [structured](#structured)
  - [moderate](#moderate)
  - [analyzeNews](#analyzenews)
  - [embed](#embed)
  - [detectObjects](#detectobjects)
  - [listModels](#listmodels)
  - [Recipe: video scanning](#recipe-video-scanning)
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

## AI Service

All AI methods require a prior `connect()` call and count toward your
subscription's token usage. Errors surface as thrown `Error`s with the
server message included.

### chat

```javascript
chat(messages, options?)
```

One-shot chat completion.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `messages` | `Array<{role, content}>` | Yes | Conversation messages; roles: `system`, `user`, `assistant` |
| `options.model` | string | No | Model ID (default `'default'`) |
| `options.maxTokens` | number | No | Max tokens to generate |
| `options.temperature` | number | No | Sampling temperature 0–1 |

**Returns:** `Promise<{ success, requestId, result, usage: { tokensIn, tokensOut, totalTokens, latencyMs }, model }>`

**Example:**
```javascript
const { result, usage } = await cybernate.chat(
  [{ role: 'user', content: 'Summarize this report: ...' }],
  { maxTokens: 400 }
);
```

### messages.create

```javascript
messages.create(params)
```

Anthropic-style messages API — the same engine as `chat()`, exposed in a
familiar shape so a single pattern serves every text task (news analysis,
moderation prompts, classification, summarization).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `params.messages` | `Array<{role, content}>` | Yes | Conversation messages |
| `params.model` | string | No | Model ID (default `'default'`) |
| `params.max_tokens` | number | No | Max tokens to generate |
| `params.system` | string | No | System prompt |
| `params.temperature` | number | No | Sampling temperature |

**Returns:** `Promise<{ id, type, role, model, content: [{ type: 'text', text }], stop_reason, usage: { input_tokens, output_tokens } }>`

**Example:**
```javascript
const message = await cybernate.messages.create({
  model: 'default',
  max_tokens: 700,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildPrompt(title, body) }],
});
const text = message.content[0].text;
```

> If your prompt asks for JSON, prefer [`structured`](#structured) — the
> platform parses and repairs the JSON server-side, so no
> ` ```json `-fence cleanup is needed.

### chatStream

```javascript
chatStream(messages, options?, onChunk?)
```

Streams the response token-by-token over Server-Sent Events. `onChunk` is
called with each text fragment; the promise resolves with the full text.

**Example:**
```javascript
const full = await cybernate.chatStream(
  [{ role: 'user', content: 'Tell me about Nairobi' }],
  { sessionId: 'user-42' },
  (chunk) => process.stdout.write(chunk)
);
```

### structured

```javascript
structured(prompt, schema, options?)
```

Schema-constrained JSON extraction. Define the JSON you want; the platform
prompts the model, parses the output, and retries/repairs invalid JSON
before returning. This is the generic building block for custom
applications: fraud triage, KYC document extraction, agricultural field
reports, IoT alert classification, and more.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | Yes | The text/instruction to analyze |
| `schema` | object | Yes | JSON Schema describing the desired output |
| `options.model` | string | No | Model ID |
| `options.temperature` | number | No | Default 0.1 for deterministic output |

**Returns:** `Promise<{ success, requestId, result, model, latencyMs }>` — `result` is the parsed object.

**Example (fintech fraud triage):**
```javascript
const { result } = await cybernate.structured(transactionDescription, {
  type: 'object',
  properties: {
    fraud_risk: { type: 'number', description: 'risk score 0-1' },
    signals: { type: 'array', items: { type: 'string' } },
    recommended_action: { type: 'string', enum: ['approve', 'challenge', 'block'] },
  },
});
```

### moderate

```javascript
moderate(options)
```

Content moderation for text and/or images — built for social platforms
(e.g. Whatever). The text verdict understands African languages, pidgin,
and local slang; images are scanned for dangerous objects, and the stricter
of the two verdicts wins.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `options.text` | string | One of text/image | Text content to moderate |
| `options.imageBase64` | string | One of text/image | Base64-encoded image |
| `options.imageUrl` | string | One of text/image | Image URL |
| `options.context` | string | No | Platform context, e.g. `"comments on a news post"` |

**Returns:**
```javascript
{
  success: true,
  requestId: '...',
  flagged: true,
  severity: 'high',          // none | low | medium | high | critical
  action: 'review',          // allow | review | block
  text: {                    // null if no text given
    flagged: true,
    categories: { hate: 0.1, harassment: 0.8, violence: 0.2, sexual: 0,
                  self_harm: 0, spam: 0.1, scam_fraud: 0, misinformation: 0,
                  illegal_goods: 0 },
    severity: 'high',
    action: 'review',
    reason: 'Targeted harassment of a named individual',
    language: 'Nigerian Pidgin'
  },
  image: {                   // null if no image given
    detections: [...],
    dangerousObjects: [{ label: 'knife', confidence: 0.91, bbox: [...] }],
    flagged: true
  },
  latencyMs: 1840
}
```

**Example:**
```javascript
const verdict = await cybernate.moderate({
  text: post.caption,
  imageUrl: post.imageUrl,
  context: 'public posts on a social feed',
});
if (verdict.action === 'block') await hidePost(post);
else if (verdict.action === 'review') await queueForModerator(post);
```

### analyzeNews

```javascript
analyzeNews(options)
```

Extracts structured danger-zone intelligence from a news article or
incident report — locations (down to neighbourhood/road level when stated),
incident type, category, severity 1–10, casualties, and safety advice.
Built to feed safety platforms like Sety: the output maps directly onto a
danger-zone record.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `options.text` | string | Yes | Article body / report text |
| `options.title` | string | No | Headline |
| `options.url` | string | No | Source URL |
| `options.publishedAt` | string | No | Publication date (ISO) |

**Returns:**
```javascript
{
  success: true,
  requestId: '...',
  analysis: {
    is_security_relevant: true,
    incident_type: 'kidnapping',   // armed_robbery | kidnapping | terrorism | banditry |
                                   // protest | communal_clash | cult_violence | theft |
                                   // assault | natural_disaster | fire | accident | fraud | other
    category: 'crime',             // crime | terrorism | civil_unrest | disaster | accident | other
    severity: 8,                   // 1-10
    locations: [{
      name: 'Abuja-Kaduna expressway, near Katari',
      city: 'Katari', state: 'Kaduna', country: 'Nigeria',
      specificity: 'area'          // exact | area | city | state | country
    }],
    date: '2026-06-10',
    actors: ['armed gunmen'],
    targets: ['travellers'],
    casualties: { killed: 2, injured: 5, kidnapped: 12 },
    summary: 'Gunmen attacked travellers along the Abuja-Kaduna expressway...',
    safety_advice: 'Avoid the Katari stretch of the expressway; travel in convoys during daylight.'
  },
  model: 'cyb-1',
  latencyMs: 2310
}
```

**Example (news pipeline → Sety danger zones):**
```javascript
for (const article of await fetchNewsBatch()) {
  const { analysis } = await cybernate.analyzeNews({
    title: article.title,
    text: article.body,
    url: article.link,
    publishedAt: article.publishedAt,
  });
  if (analysis.is_security_relevant && analysis.severity >= 5) {
    await sety.createDangerZone(analysis);
  }
}
```

### embed

```javascript
embed(texts, model?)
```

Generates dense vector embeddings for semantic search / RAG.

**Returns:** `Promise<{ success, requestId, embeddings: number[][], model, latencyMs }>`

### detectObjects

```javascript
detectObjects(options)
```

Object detection on an image (`imageBase64` or `imageUrl`), with optional
`confidence` threshold and `classes` label filter.

**Returns:** `Promise<{ success, requestId, detections: [{ label, confidence, bbox }], model, latencyMs }>`

### listModels

```javascript
listModels()
```

Lists available models. **Returns:** `Promise<{ local, remote }>`

### Recipe: video scanning

Video moderation/analysis = frame sampling + the image methods. Sample
1 frame per second (ffmpeg), moderate each frame, and flag the video if any
frame is flagged:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');

// 1 fps frame extraction
execSync(`ffmpeg -i ${videoPath} -vf fps=1 /tmp/frames/frame_%04d.jpg`);

let verdict = { flagged: false, severity: 'none', frames: [] };
for (const f of fs.readdirSync('/tmp/frames')) {
  const result = await cybernate.moderate({
    imageBase64: fs.readFileSync(`/tmp/frames/${f}`).toString('base64'),
  });
  if (result.flagged) {
    verdict.flagged = true;
    verdict.frames.push({ frame: f, ...result });
  }
}
```

For live streams, use `watch()` instead — the platform samples and analyzes
frames server-side and pushes events over WebSocket/webhooks.

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