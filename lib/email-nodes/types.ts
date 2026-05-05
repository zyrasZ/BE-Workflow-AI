/**
 * Email Processing Nodes - Core Type Definitions
 * 
 * This file contains all core interfaces and types for the Email Processing Nodes feature.
 * These types provide a unified interface for email operations across different providers
 * (IMAP/POP3, Gmail API, Outlook API).
 */

// ============================================================================
// Email Message Types
// ============================================================================

/**
 * Represents a complete email message with all metadata
 */
export interface EmailMessage {
  id: string;
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook';
  headers: EmailHeaders;
  body: EmailBody;
  attachments: Attachment[];
  metadata: EmailMetadata;
  flags: EmailFlags;
  parsingErrors?: string[];
}

/**
 * Email address with optional name
 */
export interface EmailAddress {
  address: string;
  name?: string;
}

/**
 * Standard email headers
 */
export interface EmailHeaders {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  date: Date;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  replyTo?: EmailAddress;
  customHeaders?: Record<string, string>;
}

/**
 * Email body content (plain text and/or HTML)
 */
export interface EmailBody {
  text?: string;
  html?: string;
  encoding: string;
  charset: string;
}

/**
 * Email attachment metadata and content
 */
export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string; // For inline attachments
  content?: Buffer; // Actual content (lazy loaded)
  url?: string; // Reference URL for large attachments
}

/**
 * Email flags (read/unread, flagged, etc.)
 */
export interface EmailFlags {
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  deleted: boolean;
}

/**
 * Provider-specific and processing metadata
 */
export interface EmailMetadata {
  // Provider-specific metadata
  threadId?: string; // Gmail, Outlook
  labels?: string[]; // Gmail
  categories?: string[]; // Outlook
  importance?: 'low' | 'normal' | 'high'; // Outlook
  snippet?: string; // Gmail
  
  // Processing metadata
  receivedAt: Date;
  processedAt?: Date;
  classification?: Classification;
  validationResult?: ValidationResult;
}

/**
 * Email classification result
 */
export interface Classification {
  categories: string[];
  confidence: Record<string, number>;
  method: 'rule-based' | 'ai-based';
}

// ============================================================================
// Provider Adapter Interface
// ============================================================================

/**
 * Unified interface for all email provider adapters
 * Implementations: IMAPAdapter, GmailAdapter, OutlookAdapter
 */
export interface EmailProviderAdapter {
  /**
   * Connect to the email provider
   */
  connect(config: ProviderConfig): Promise<void>;
  
  /**
   * Disconnect from the email provider
   */
  disconnect(): Promise<void>;
  
  /**
   * Fetch emails based on filter options
   */
  fetchEmails(options: FetchOptions): Promise<EmailMessage[]>;
  
  /**
   * Fetch a single email by ID
   */
  fetchEmail(id: string): Promise<EmailMessage>;
  
  /**
   * Send an email
   */
  sendEmail(email: OutgoingEmail): Promise<SendResult>;
  
  /**
   * Get rate limit information for this provider
   */
  getRateLimits(): RateLimitInfo;
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Configuration for email provider connection
 */
export interface ProviderConfig {
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook' | 'smtp';
  credentials: EmailCredentials;
  
  // IMAP/POP3/SMTP specific
  host?: string;
  port?: number;
  secure?: boolean; // SSL/TLS
  
  // OAuth2 specific (Gmail, Outlook)
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

/**
 * Email credentials (password or OAuth2)
 */
export interface EmailCredentials {
  type: 'password' | 'oauth2';
  
  // Password authentication
  username?: string;
  password?: string;
  
  // OAuth2 authentication
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

// ============================================================================
// Fetch Options
// ============================================================================

/**
 * Options for fetching emails
 */
export interface FetchOptions {
  // Folder/mailbox selection
  folder?: string; // e.g., 'INBOX', 'Sent', 'Drafts'
  
  // Filtering
  unreadOnly?: boolean;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  sender?: string | RegExp;
  subject?: string | RegExp;
  hasAttachment?: boolean;
  
  // Provider-specific filters
  labels?: string[]; // Gmail
  categories?: string[]; // Outlook
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Batch processing
  batchSize?: number;
}

// ============================================================================
// Outgoing Email Types
// ============================================================================

/**
 * Email to be sent
 */
export interface OutgoingEmail {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: EmailBody;
  attachments?: OutgoingAttachment[];
  
  // Threading
  inReplyTo?: string;
  references?: string[];
  
  // Provider-specific options
  labels?: string[]; // Gmail
  categories?: string[]; // Outlook
  importance?: 'low' | 'normal' | 'high'; // Outlook
  
  // Template data
  templateData?: Record<string, any>;
}

/**
 * Attachment for outgoing email
 */
export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  content: Buffer | string;
  encoding?: 'base64' | 'utf8';
  contentId?: string; // For inline attachments
}

/**
 * Result of sending an email
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  timestamp: Date;
  provider: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Single filter rule
 */
export interface FilterRule {
  field: 'from' | 'to' | 'subject' | 'body' | 'date' | 'attachment' | 'label' | 'category' | 'flag' | 'isUnread';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'before' | 'after' | 'between';
  value: any;
}

/**
 * Complete filter configuration
 */
export interface FilterConfig {
  rules: FilterRule[];
  logic: 'AND' | 'OR';
  outputUnmatched?: boolean;
}

/**
 * Result of filtering emails
 */
export interface FilterResult {
  matched: EmailMessage[];
  unmatched: EmailMessage[];
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Email template
 */
export interface EmailTemplate {
  subject: string; // Template with {{variables}}
  body: string; // Template with {{variables}}
  bodyType: 'text' | 'html' | 'both';
  attachments?: AttachmentConfig[];
}

/**
 * Attachment configuration for templates
 */
export interface AttachmentConfig {
  filename: string;
  contentType: string;
  source: 'file' | 'url' | 'inline';
  path?: string;
  url?: string;
  content?: string;
}

/**
 * Compiled template (cached)
 */
export interface CompiledTemplate {
  render(data: any): string;
}

/**
 * Rendered email result from template engine
 */
export interface RenderedEmail {
  subject: string;
  html?: string;
  text?: string;
}

// ============================================================================
// Thread Analysis Types
// ============================================================================

/**
 * Email thread analysis result
 */
export interface ThreadAnalysis {
  threadId: string;
  messages: EmailMessage[];
  participants: EmailAddress[];
  initiator: EmailAddress;
  latestResponder: EmailAddress;
  messageCount: number;
  threadDuration: number; // milliseconds
  averageResponseTime: number; // milliseconds
  summary?: string; // AI-generated summary
}

/**
 * Thread context for reply
 */
export interface ThreadContext {
  originalMessage: EmailMessage;
  previousReplies: EmailMessage[];
  quotedText: string[];
  newContent: string;
}

// ============================================================================
// Queue Types
// ============================================================================

/**
 * Email queue status
 */
export interface QueueStatus {
  total: number;
  processed: number;
  pending: number;
  failed: number;
  paused: boolean;
}

/**
 * Queue processing result
 */
export interface ProcessResult {
  emailId: string;
  success: boolean;
  error?: string;
  processingTime: number; // milliseconds
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Email processing error
 */
export interface EmailError {
  category: 'connection' | 'parsing' | 'validation' | 'rate_limit' | 'authentication';
  code: string;
  message: string;
  retryable: boolean;
  details?: any;
}

/**
 * Error context for handling
 */
export interface ErrorContext {
  operation: string;
  attempt: number;
  maxAttempts: number;
  provider?: string;
  emailId?: string;
}

/**
 * Error resolution strategy
 */
export interface ErrorResolution {
  action: 'retry' | 'skip' | 'fail' | 'fallback';
  delay?: number; // milliseconds
  fallbackValue?: any;
}

// ============================================================================
// Raw Email Types (for parsing)
// ============================================================================

/**
 * Raw email data from provider (before parsing)
 */
export interface RawEmail {
  uid: number | string;
  source: string; // Raw MIME content
  flags: string[];
  internalDate: Date;
  size: number;
}

/**
 * Parsed MIME structure
 */
export interface ParsedMIME {
  headers: Record<string, string>;
  textPart?: string;
  htmlPart?: string;
  attachments: Attachment[];
}

// ============================================================================
// Node Configuration Types
// ============================================================================

/**
 * Email Input Node configuration
 */
export interface EmailInputConfig {
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook';
  config: ProviderConfig;
  fetchOptions: FetchOptions;
  markAsRead?: boolean;
}

/**
 * Email Output Node configuration
 */
export interface EmailOutputConfig {
  provider: 'smtp' | 'gmail' | 'outlook';
  config: ProviderConfig;
  template?: EmailTemplate;
  replyTo?: string; // Email ID to reply to
}

/**
 * Email Filter Node configuration
 */
export interface EmailFilterConfig {
  filterConfig: FilterConfig;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  maxSize: number;
  minSize: number;
  idleTimeout: number; // milliseconds
  acquireTimeout: number; // milliseconds
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
  batchSize: number;
  concurrencyLimit: number;
  delayBetweenBatches?: number; // milliseconds
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}
