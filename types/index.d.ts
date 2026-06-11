// Type definitions for cybernate-ai

export interface CybernateOptions {
  /** API base URL (defaults to https://api.cybernate.ai/v1) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default 30000) */
  timeout?: number;
  /** Auto reconnect on connection failure (default true) */
  autoReconnect?: boolean;
  /** Enable WebSocket connections (default true) */
  enableWebSocket?: boolean;
  /** Max reconnection attempts (default 5) */
  reconnectAttempts?: number;
  /** Delay between reconnection attempts in ms (default 1000) */
  reconnectDelay?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatUsage {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  latencyMs: number;
}

export interface ChatResponse {
  success: boolean;
  requestId: string;
  result: string;
  usage: ChatUsage;
  model: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatStreamOptions extends ChatOptions {
  systemPrompt?: string;
  sessionId?: string;
  timeout?: number;
}

export interface EmbedResponse {
  success: boolean;
  requestId: string;
  embeddings: number[][];
  model: string;
  latencyMs: number;
}

export interface Detection {
  label: string;
  confidence: number;
  bbox: number[];
}

export interface DetectObjectsOptions {
  imageBase64?: string;
  imageUrl?: string;
  model?: string;
  confidence?: number;
  classes?: string[];
}

export interface DetectObjectsResponse {
  success: boolean;
  requestId: string;
  detections: Detection[];
  model: string;
  latencyMs: number;
}

export interface StructuredOptions {
  model?: string;
  temperature?: number;
}

export interface StructuredResponse<T = Record<string, unknown>> {
  success: boolean;
  requestId: string;
  result: T;
  model: string;
  latencyMs: number;
}

export type ModerationSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ModerationAction = 'allow' | 'review' | 'block';

export interface ModerationCategories {
  hate?: number;
  harassment?: number;
  violence?: number;
  sexual?: number;
  self_harm?: number;
  spam?: number;
  scam_fraud?: number;
  misinformation?: number;
  illegal_goods?: number;
}

export interface ModerationTextVerdict {
  flagged: boolean;
  categories: ModerationCategories;
  severity: ModerationSeverity;
  action: ModerationAction;
  reason: string;
  language?: string;
}

export interface ModerationImageVerdict {
  detections: Detection[];
  dangerousObjects: Detection[];
  flagged: boolean;
}

export interface ModerateOptions {
  text?: string;
  imageBase64?: string;
  imageUrl?: string;
  /** Platform context, e.g. "comments on a news post" */
  context?: string;
}

export interface ModerateResponse {
  success: boolean;
  requestId: string;
  flagged: boolean;
  severity: ModerationSeverity;
  action: ModerationAction;
  text: ModerationTextVerdict | null;
  image: ModerationImageVerdict | null;
  latencyMs: number;
}

export interface NewsLocation {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  specificity?: 'exact' | 'area' | 'city' | 'state' | 'country';
}

export interface NewsAnalysis {
  is_security_relevant: boolean;
  incident_type: string;
  category: 'crime' | 'terrorism' | 'civil_unrest' | 'disaster' | 'accident' | 'other';
  /** Danger severity 1-10 */
  severity: number;
  locations: NewsLocation[];
  date?: string | null;
  actors?: string[];
  targets?: string[];
  casualties?: { killed?: number; injured?: number; kidnapped?: number };
  summary: string;
  safety_advice?: string;
}

export interface AnalyzeNewsOptions {
  text: string;
  title?: string;
  url?: string;
  publishedAt?: string;
}

export interface AnalyzeNewsResponse {
  success: boolean;
  requestId: string;
  analysis: NewsAnalysis;
  model: string;
  latencyMs: number;
}

export interface ConnectionResult {
  connected: boolean;
  user: Record<string, unknown>;
  organization: Record<string, unknown>;
  websocketEnabled: boolean;
}

export interface ConnectionStatus {
  isConnected: boolean;
  websocketConnected: boolean;
  websocketEnabled: boolean;
  reconnectCount: number;
  activeWatchers: number;
}

export interface WatchOptions {
  streamUrl?: string;
  deviceId?: string;
  businessId?: string;
  name?: string;
  detectionSettings?: {
    sensitivityLevel?: number;
    objectTypes?: string[];
  };
  notificationSettings?: {
    method?: 'socket' | 'webhook';
    webhookUrl?: string;
  };
}

export type EventCallback = (eventData: Record<string, unknown>) => void;

export interface MessageCreateParams {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  session_id?: string;
}

export interface Message {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: Array<{ type: 'text'; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export declare class CybernateAI {
  constructor(apiKey: string, options?: CybernateOptions);

  /** Anthropic-style messages API — uniform shape for all text tasks */
  readonly messages: {
    create(params: MessageCreateParams): Promise<Message>;
  };

  // Core
  connect(): Promise<ConnectionResult>;
  disconnect(): void;
  getConnectionStatus(): ConnectionStatus;
  retryWebSocketConnection(): Promise<boolean>;

  // AI
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(
    messages: ChatMessage[],
    options?: ChatStreamOptions | ((chunk: string) => void),
    onChunk?: (chunk: string) => void
  ): Promise<string>;
  embed(texts: string | string[], model?: string): Promise<EmbedResponse>;
  detectObjects(options: DetectObjectsOptions): Promise<DetectObjectsResponse>;
  structured<T = Record<string, unknown>>(
    prompt: string,
    schema: Record<string, unknown>,
    options?: StructuredOptions
  ): Promise<StructuredResponse<T>>;
  moderate(options: ModerateOptions): Promise<ModerateResponse>;
  analyzeNews(options: AnalyzeNewsOptions): Promise<AnalyzeNewsResponse>;
  listModels(): Promise<{ local: object[]; remote: object[] }>;

  // Conversations
  listConversations(): Promise<{ conversations: object[] }>;
  createConversation(title?: string): Promise<{ conversation: object }>;
  getConversation(conversationId: string): Promise<{ conversation: object; messages: object[] }>;
  updateConversation(conversationId: string, updates: { title?: string; pinned?: boolean }): Promise<{ conversation: object }>;
  deleteConversation(conversationId: string): Promise<{ success: boolean }>;
  sendMessage(conversationId: string, content: string, options?: { model?: string }): Promise<object>;
  rateMessage(conversationId: string, messageId: string, rating: 'up' | 'down' | null): Promise<{ message: object }>;

  // Security monitoring
  watch(options: WatchOptions): Promise<object>;
  unwatch(watcherId: string): Promise<object>;
  getActiveWatchers(): Promise<object[]>;
  queryEvents(query?: Record<string, unknown>): Promise<object>;
  getEventStatistics(query?: Record<string, unknown>): Promise<object>;
  acknowledgeEvent(eventId: string, notes?: string): Promise<object>;

  // Webhooks
  setWebhook(config: { url: string; events?: string[] }): Promise<object>;
  getWebhooks(): Promise<object[]>;
  deleteWebhook(webhookId: string): Promise<object>;
  testWebhook(url: string, payload?: object): Promise<object>;

  // Storage
  uploadFile(options: Record<string, unknown>): Promise<object>;
  getFileInfo(fileId: string): Promise<object>;
  queryFiles(query?: Record<string, unknown>): Promise<object>;
  deleteFile(fileId: string): Promise<object>;
  getFileUrl(fileId: string, expiresIn?: number): Promise<object>;
  captureStreamFrame(streamId: string, options?: object): Promise<object>;

  // Analytics
  getAnalytics(businessId: string, options?: Record<string, unknown>): Promise<object[]>;
  getInsights(businessId: string, options?: Record<string, unknown>): Promise<object>;
  acknowledgeInsight(insightId: string, actionTaken?: string): Promise<object>;
  getDashboardAnalytics(businessId: string): Promise<object>;

  // Integrations
  getIntegrations(query?: Record<string, unknown>): Promise<object>;
  createIntegration(integrationData: Record<string, unknown>): Promise<object>;
  getIntegration(integrationId: string): Promise<object>;
  updateIntegration(integrationId: string, updateData: Record<string, unknown>): Promise<object>;
  deleteIntegration(integrationId: string): Promise<object>;
  testIntegration(integrationId: string): Promise<object>;
  triggerIntegration(integrationId: string, action: string, data?: object): Promise<object>;

  // Notifications
  getNotifications(options?: Record<string, unknown>): Promise<object>;
  markNotificationAsRead(notificationId: string): Promise<object>;
  markAllNotificationsAsRead(): Promise<object>;
  getNotificationPreferences(): Promise<object>;
  updateNotificationPreferences(preferences: Record<string, unknown>): Promise<object>;
  addDeviceToken(token: string): Promise<object>;
  removeDeviceToken(token: string): Promise<object>;

  // Events
  on(event: string, callback: EventCallback): void;
  off(event: string, callback?: EventCallback): void;
}

export default CybernateAI;
