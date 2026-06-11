# Cybernate AI SDK

[![npm version](https://img.shields.io/npm/v/cybernate-ai.svg)](https://www.npmjs.com/package/cybernate-ai)
[![License](https://img.shields.io/npm/l/cybernate-ai.svg)](https://github.com/cybernate-ai/cybernate-sdk/blob/main/LICENSE)

JavaScript SDK for the [Cybernate AI](https://cybernate.ai) platform — general-purpose AI inference built for Africa. Chat, multi-turn conversations, embeddings, vision, and security monitoring in one client.

## Installation

```bash
npm install cybernate-ai
# or
yarn add cybernate-ai
```

## Quick Start

```javascript
import { CybernateAI } from 'cybernate-ai';

const cybernate = new CybernateAI('YOUR_API_KEY');
await cybernate.connect();

// One-shot chat
const { result } = await cybernate.chat([
  { role: 'user', content: 'Summarise this report in Swahili.' }
]);
console.log(result);

// Persistent conversation (history managed server-side)
const { conversation } = await cybernate.createConversation('My session');
const reply = await cybernate.sendMessage(conversation._id, 'Hello!');
console.log(reply.result);
```

Get your API key from the [Cybernate dashboard](https://cybernate.ai/dashboard).

---

## AI — Chat

```javascript
const { result, usage, model } = await cybernate.chat(
  [{ role: 'user', content: 'What is 2+2?' }],
  { model: 'default', maxTokens: 400, temperature: 0.7 }
);

// List available models
const { local, remote } = await cybernate.listModels();
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | string | `'default'` | Model ID |
| `maxTokens` | number | `400` | Max tokens to generate |
| `temperature` | number | `0.7` | Sampling temperature (0–1) |

---

## AI — Messages API (uniform text interface)

A familiar `messages.create` shape that serves **every** text task — news
analysis, moderation prompts, summarization, classification. If you've
written code against this pattern before, it works as-is:

```javascript
const message = await cybernate.messages.create({
  model: 'default',
  max_tokens: 700,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildPrompt(title, body) }],
});

const text = message.content[0].text;
// message.usage → { input_tokens, output_tokens }
```

> **Prompting for JSON?** Use [`structured()`](#ai--structured-extraction)
> instead — the platform parses and repairs the JSON server-side, so you can
> drop the ` ```json ` fence-stripping cleanup entirely. For the common cases
> we already ship turnkey methods: [`moderate()`](#ai--content-moderation)
> and [`analyzeNews()`](#ai--news--incident-analysis).

---

## AI — Streaming Chat

Get tokens as they are generated (Server-Sent Events under the hood):

```javascript
const fullText = await cybernate.chatStream(
  [{ role: 'user', content: 'Tell me about Lagos' }],
  { model: 'default', sessionId: 'my-session' },
  (chunk) => process.stdout.write(chunk)   // called per text fragment
);
```

The returned promise resolves with the complete response text once the
stream ends. Works in Node 16+ and modern browsers.

---

## AI — Structured Extraction

Define a JSON schema, get back JSON — the building block for custom
applications (fraud triage, document extraction, agri reports, IoT alerts):

```javascript
const { result } = await cybernate.structured(
  `Transaction: ₦2,400,000 transfer at 03:12 AM to a newly added beneficiary,
   device changed 10 minutes before, location Lagos → Abuja in 1 hour.`,
  {
    type: 'object',
    properties: {
      fraud_risk: { type: 'number', description: 'risk score 0-1' },
      signals: { type: 'array', items: { type: 'string' } },
      recommended_action: { type: 'string', enum: ['approve', 'challenge', 'block'] },
    },
  }
);
// result: { fraud_risk: 0.87, signals: [...], recommended_action: 'challenge' }
```

---

## AI — Content Moderation

Built for social platforms — understands African languages, pidgin, and
local slang. Moderates text, images, or both in one call:

```javascript
const verdict = await cybernate.moderate({
  text: userPost.caption,
  imageUrl: userPost.imageUrl,           // or imageBase64
  context: 'public posts on a social feed',
});

// verdict.flagged   → boolean
// verdict.action    → 'allow' | 'review' | 'block'
// verdict.severity  → 'none' | 'low' | 'medium' | 'high' | 'critical'
// verdict.text.categories → { hate, harassment, violence, sexual, spam, scam_fraud, ... } (0–1 scores)
// verdict.image.dangerousObjects → detected weapons/dangerous items

if (verdict.action === 'block') hidePost(userPost);
else if (verdict.action === 'review') sendToModQueue(userPost);
```

For video, sample frames (e.g. 1 fps) and pass each frame as `imageBase64` —
see the video scanning recipe in [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

---

## AI — News / Incident Analysis

Turn news articles and reports into structured danger-zone data
(locations, category, severity) — built for safety intelligence like Sety:

```javascript
const { analysis } = await cybernate.analyzeNews({
  title: 'Gunmen attack travellers along Abuja-Kaduna road',
  text: articleBody,
  url: 'https://news.example.com/article',
  publishedAt: '2026-06-10T08:00:00Z',
});

// analysis.is_security_relevant → true
// analysis.incident_type        → 'armed_robbery' | 'kidnapping' | 'terrorism' | ...
// analysis.category             → 'crime' | 'terrorism' | 'civil_unrest' | 'disaster' | ...
// analysis.severity             → 1–10
// analysis.locations            → [{ name, city, state, country, specificity }]
// analysis.casualties           → { killed, injured, kidnapped }
// analysis.summary, analysis.safety_advice
```

---

## AI — Conversations

Server-managed history — no need to replay the full thread on each call.

```javascript
// Create
const { conversation } = await cybernate.createConversation('Support chat');

// Send messages — history is fetched automatically
const { result, usage } = await cybernate.sendMessage(conversation._id, 'Hi there');

// List all conversations
const { conversations } = await cybernate.listConversations();

// Get a conversation with its messages
const { conversation: conv, messages } = await cybernate.getConversation(id);

// Update title or pin it
await cybernate.updateConversation(id, { title: 'New title', pinned: true });

// Rate an AI message
await cybernate.rateMessage(conversationId, messageId, 'up'); // 'up' | 'down' | null

// Delete
await cybernate.deleteConversation(id);
```

---

## AI — Embeddings

```javascript
const { embeddings } = await cybernate.embed([
  'Patient has a fever of 39°C',
  'Mgonjwa ana homa ya 39°C',
]);
// embeddings: number[][] — one vector per input string
```

---

## AI — Vision / Object Detection

```javascript
const { detections } = await cybernate.detectObjects({
  imageUrl: 'https://example.com/farm.jpg',
  confidence: 0.5,
  classes: ['crop', 'pest', 'weed'],
});
// or use imageBase64 for local files
```

---

## Security Monitoring

```javascript
// Watch a camera stream for detections
const watcher = await cybernate.watch({
  streamUrl: 'rtsp://camera.example.com/stream1',
  detectionSettings: { sensitivityLevel: 0.7, objectTypes: ['person', 'vehicle'] },
  notificationSettings: { method: 'webhook', webhookUrl: 'https://your-server.com/hook' },
});

// Listen for real-time events via WebSocket
cybernate.on('detection', (event) => {
  console.log('Detected:', event.objects.map(o => o.name).join(', '));
});

// Query past events
const { events } = await cybernate.queryEvents({
  businessId: 'YOUR_BUSINESS_ID',
  startDate: '2026-01-01T00:00:00Z',
  eventType: 'intrusion',
});

// Acknowledge an event
await cybernate.acknowledgeEvent(events[0]._id, 'Reviewed and resolved');

// Stop watching
await cybernate.unwatch(watcher.watcherId);
```

---

## API Reference

### Constructor

#### `new CybernateAI(apiKey, options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | string | `https://api.cybernate.ai/v1` | API base URL |
| `timeout` | number | `30000` | Request timeout (ms) |
| `autoReconnect` | boolean | `true` | Auto-reconnect WebSocket |
| `enableWebSocket` | boolean | `true` | Enable WebSocket for real-time events |
| `reconnectAttempts` | number | `5` | Max reconnect attempts |
| `reconnectDelay` | number | `1000` | Delay between attempts (ms) |

### Core

| Method | Description |
|---|---|
| `connect()` | Validate API key and open WebSocket (optional) |
| `disconnect()` | Close connection and clean up |
| `getConnectionStatus()` | Returns `{ isConnected, websocketConnected, activeWatchers }` |

### AI

| Method | Description |
|---|---|
| `chat(messages, options?)` | One-shot inference |
| `messages.create(params)` | Anthropic-style messages API (same engine, familiar shape) |
| `chatStream(messages, options?, onChunk?)` | Streaming inference (SSE) — resolves with full text |
| `embed(texts, model?)` | Generate vector embeddings |
| `detectObjects(options)` | Object detection on an image |
| `structured(prompt, schema, options?)` | Schema-constrained JSON extraction |
| `moderate(options)` | Text + image content moderation |
| `analyzeNews(options)` | Extract danger locations/category/severity from news |
| `listModels()` | List available local and remote models |

### Conversations

| Method | Description |
|---|---|
| `createConversation(title?)` | Create a new conversation |
| `listConversations()` | List all conversations |
| `getConversation(id)` | Get conversation with messages |
| `updateConversation(id, updates)` | Update title or pinned state |
| `deleteConversation(id)` | Delete conversation and messages |
| `sendMessage(id, content, options?)` | Send a message and get AI reply |
| `rateMessage(convId, msgId, rating)` | Rate a message `'up'`, `'down'`, or `null` |

### Security Monitoring

| Method | Description |
|---|---|
| `watch(options)` | Start watching a stream, device, or business |
| `unwatch(watcherId)` | Stop a watcher |
| `getActiveWatchers()` | List active watchers |
| `queryEvents(query?)` | Search events with filters + pagination |
| `getEventStatistics(query?)` | Aggregate event statistics |
| `acknowledgeEvent(eventId, notes?)` | Mark event as acknowledged |
| `on(event, callback)` | Register real-time event listener |
| `off(event, callback?)` | Remove event listener |

### Webhooks

| Method | Description |
|---|---|
| `setWebhook(config)` | Configure a webhook URL and event types |
| `getWebhooks()` | List all webhooks |
| `deleteWebhook(webhookId)` | Delete a webhook |
| `testWebhook(url, payload?)` | Send a test payload to a webhook |

### Storage

| Method | Description |
|---|---|
| `uploadFile(options)` | Upload a file |
| `getFileInfo(fileId)` | Get file metadata |
| `queryFiles(query?)` | Search files with filters |
| `deleteFile(fileId)` | Delete a file |
| `getFileUrl(fileId, expiresIn?)` | Get a signed URL |
| `captureStreamFrame(streamId, options?)` | Capture a frame from a stream |

### Analytics

| Method | Description |
|---|---|
| `getAnalytics(businessId, options?)` | Daily / weekly / monthly analytics |
| `getInsights(businessId, options?)` | AI-generated insights |
| `acknowledgeInsight(insightId, actionTaken?)` | Mark insight as actioned |
| `getDashboardAnalytics(businessId)` | Dashboard summary |

### Integrations

| Method | Description |
|---|---|
| `getIntegrations(query?)` | List integrations |
| `createIntegration(data)` | Create an integration |
| `getIntegration(id)` | Get integration by ID |
| `updateIntegration(id, data)` | Update an integration |
| `deleteIntegration(id)` | Delete an integration |
| `testIntegration(id)` | Test an integration connection |
| `triggerIntegration(id, action, data?)` | Trigger an integration action |

### Notifications

| Method | Description |
|---|---|
| `getNotifications(options?)` | List notifications |
| `markNotificationAsRead(id)` | Mark one as read |
| `markAllNotificationsAsRead()` | Mark all as read |
| `getNotificationPreferences()` | Get preferences |
| `updateNotificationPreferences(prefs)` | Update preferences |
| `addDeviceToken(token)` | Register push token |
| `removeDeviceToken(token)` | Remove push token |

---

## Complete Example

```javascript
import { CybernateAI } from 'cybernate-ai';

const cybernate = new CybernateAI('YOUR_API_KEY');
await cybernate.connect();

// ── Chat ──────────────────────────────────────────────────────────────────────
const { result } = await cybernate.chat([
  { role: 'user', content: 'Explain crop rotation in Yoruba.' }
], { maxTokens: 512 });
console.log(result);

// ── Persistent conversation ───────────────────────────────────────────────────
const { conversation } = await cybernate.createConversation('Support session');
const reply1 = await cybernate.sendMessage(conversation._id, 'What symptoms indicate malaria?');
const reply2 = await cybernate.sendMessage(conversation._id, 'What is the recommended treatment?');
await cybernate.rateMessage(conversation._id, reply1.messageId, 'up');

// ── Embeddings ────────────────────────────────────────────────────────────────
const { embeddings } = await cybernate.embed([
  'Patient has a fever of 39°C',
  'Mgonjwa ana homa ya 39°C',
]);
console.log('Dimensions:', embeddings[0].length);

// ── Vision ────────────────────────────────────────────────────────────────────
const { detections } = await cybernate.detectObjects({
  imageUrl: 'https://example.com/farm.jpg',
  confidence: 0.6,
  classes: ['crop', 'pest'],
});
console.log('Detected:', detections.map(d => d.label));

// ── Security monitoring ───────────────────────────────────────────────────────
const watcher = await cybernate.watch({
  streamUrl: 'rtsp://camera.example.com/stream1',
  detectionSettings: { sensitivityLevel: 0.8, objectTypes: ['person'] },
  notificationSettings: { method: 'socket' },
});

cybernate.on('detection', (event) => {
  console.log('Alert:', event.objects.map(o => o.name).join(', '));
});

cybernate.disconnect();
```

---

## Error Handling

```javascript
try {
  const { result } = await cybernate.chat([{ role: 'user', content: 'Hello' }]);
} catch (error) {
  // error.message describes what went wrong
  console.error(error.message);
}
```

Errors include descriptive messages for `401 Authentication failed`, `403 Access forbidden`, `404 Not found`, and `5xx Server error`.

---

## Browser Support

Works in all modern browsers and Node.js ≥ 16. The `cross-fetch` dependency is included automatically for Node.js. WebSocket support requires `socket.io-client` (optional peer dependency — only needed for real-time event streaming).

```bash
npm install socket.io-client
```

## License

MIT
