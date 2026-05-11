/**
 * Gmail Adapter - Email Provider Adapter for Gmail API
 * 
 * This adapter provides email reading and sending capabilities using Gmail API
 * with OAuth2 authentication. It wraps the googleapis library and provides
 * a unified interface conforming to EmailProviderAdapter.
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import type {
  EmailProviderAdapter,
  ProviderConfig,
  FetchOptions,
  EmailMessage,
  OutgoingEmail,
  SendResult,
  RateLimitInfo,
  RawEmail,
  EmailAddress,
} from '../types';
import { parseEmail } from '../parser';

/**
 * Gmail Adapter Implementation
 * 
 * Provides email reading and sending capabilities using Gmail API.
 * Uses googleapis library for Gmail API access with OAuth2 authentication.
 */
export class GmailAdapter implements EmailProviderAdapter {
  private gmail: gmail_v1.Gmail | null = null;
  private oauth2Client: any = null;
  private config: ProviderConfig | null = null;
  private connected: boolean = false;
  private rateLimitInfo: RateLimitInfo = {
    limit: 250, // Gmail API: 250 quota units per user per second
    remaining: 250,
    resetTime: new Date(Date.now() + 1000),
  };

  /**
   * Connect to Gmail API with OAuth2 authentication
   * 
   * @param config - Provider configuration with OAuth2 credentials
   */
  async connect(config: ProviderConfig): Promise<void> {
    if (this.connected && this.gmail) {
      return; // Already connected
    }

    this.config = config;

    // Validate required Gmail configuration
    if (config.credentials.type !== 'oauth2') {
      throw new Error('Gmail adapter requires OAuth2 authentication');
    }

    if (!config.credentials.accessToken) {
      throw new Error('Gmail OAuth2 credentials require accessToken');
    }

    // Use server-side credentials from environment variables
    // Frontend should NOT send clientId/clientSecret for security reasons
    const clientId = config.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = config.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Gmail configuration requires clientId and clientSecret. ' +
        'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server environment variables.'
      );
    }

    try {
      // Create OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        config.redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost'
      );

      // Set credentials
      this.oauth2Client.setCredentials({
        access_token: config.credentials.accessToken,
        refresh_token: config.credentials.refreshToken,
        expiry_date: config.credentials.expiresAt?.getTime(),
      });

      // Handle token refresh
      this.oauth2Client.on('tokens', (tokens: any) => {
        if (tokens.refresh_token) {
          // Update refresh token if provided
          if (this.config && this.config.credentials.type === 'oauth2') {
            this.config.credentials.refreshToken = tokens.refresh_token;
          }
        }
        if (tokens.access_token) {
          // Update access token
          if (this.config && this.config.credentials.type === 'oauth2') {
            this.config.credentials.accessToken = tokens.access_token;
            if (tokens.expiry_date) {
              this.config.credentials.expiresAt = new Date(tokens.expiry_date);
            }
          }
        }
      });

      // Create Gmail API client
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Test connection by getting user profile
      await this.gmail.users.getProfile({ userId: 'me' });

      this.connected = true;
    } catch (error) {
      this.gmail = null;
      this.oauth2Client = null;
      this.connected = false;
      throw new Error(
        `Failed to connect to Gmail API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from Gmail API
   */
  async disconnect(): Promise<void> {
    if (this.gmail && this.connected) {
      // Gmail API doesn't require explicit disconnect
      // Just clear the references
      this.gmail = null;
      this.oauth2Client = null;
      this.connected = false;
    }
  }

  /**
   * Fetch multiple emails based on filter options
   * 
   * This is the main method for retrieving emails from Gmail.
   * It builds Gmail search query from FetchOptions, fetches messages
   * using gmail.users.messages.list API, retrieves full message details
   * for each message, and maps Gmail format to EmailMessage.
   * 
   * @param options - Fetch options with filters and pagination
   * @returns Array of parsed EmailMessage objects
   */
  async fetchEmails(options: FetchOptions): Promise<EmailMessage[]> {
    if (!this.gmail || !this.connected) {
      throw new Error('Not connected to Gmail API. Call connect() first.');
    }

    try {
      // Build Gmail search query
      const query = this.buildGmailQuery(options);

      // Determine label IDs (folder mapping)
      const labelIds = this.mapFolderToLabels(options.folder);

      // Fetch message list with pagination
      const limit = options.limit || 50;
      const maxResults = Math.min(limit, 500); // Gmail API max is 500

      const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: 'me',
        maxResults,
        q: query || undefined,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      };

      // Apply rate limiting
      await this.waitForRateLimit();

      const response = await this.gmail.users.messages.list(listParams);
      this.recordRateLimitUsage(1); // 1 quota unit for list

      const messages = response.data.messages || [];

      // Fetch full message details for each message
      const emailMessages: EmailMessage[] = [];

      for (const msg of messages) {
        if (!msg.id) continue;

        try {
          // Apply rate limiting
          await this.waitForRateLimit();

          // Fetch full message
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'raw', // Get raw MIME content
          });
          this.recordRateLimitUsage(5); // 5 quota units for get

          // Map Gmail message to EmailMessage
          const emailMessage = await this.mapGmailToEmailMessage(fullMessage.data);
          emailMessages.push(emailMessage);
        } catch (error) {
          // Log error but continue with other messages
          console.error(`Failed to fetch Gmail message ${msg.id}:`, error);
        }
      }

      return emailMessages;
    } catch (error) {
      throw new Error(
        `Failed to fetch emails from Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch a single email by ID
   * 
   * @param id - Gmail message ID
   * @returns Parsed EmailMessage object
   */
  async fetchEmail(id: string): Promise<EmailMessage> {
    if (!this.gmail || !this.connected) {
      throw new Error('Not connected to Gmail API. Call connect() first.');
    }

    try {
      // Apply rate limiting
      await this.waitForRateLimit();

      // Fetch full message
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'raw', // Get raw MIME content
      });
      this.recordRateLimitUsage(5); // 5 quota units for get

      // Map Gmail message to EmailMessage
      return await this.mapGmailToEmailMessage(response.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch Gmail message ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Send an email via Gmail API
   * 
   * This method sends emails via Gmail API by:
   * - Building RFC 2822 MIME message
   * - Encoding to base64url
   * - Using gmail.users.messages.send API
   * 
   * @param email - Outgoing email with recipients, subject, body, and attachments
   * @returns Send result with message ID and status
   */
  async sendEmail(email: OutgoingEmail): Promise<SendResult> {
    if (!this.gmail || !this.connected) {
      throw new Error('Not connected to Gmail API. Call connect() first.');
    }

    try {
      // Build RFC 2822 MIME message
      const mimeMessage = this.buildMIMEMessage(email);

      // Encode to base64url (Gmail API requirement)
      const encodedMessage = Buffer.from(mimeMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Prepare send parameters
      const sendParams: gmail_v1.Params$Resource$Users$Messages$Send = {
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: email.inReplyTo ? undefined : undefined, // Thread ID would need to be looked up
        },
      };

      // Apply rate limiting
      await this.waitForRateLimit();

      // Send email
      const response = await this.gmail.users.messages.send(sendParams);
      this.recordRateLimitUsage(100); // 100 quota units for send

      // Apply labels if specified
      if (email.labels && email.labels.length > 0 && response.data.id) {
        try {
          await this.gmail.users.messages.modify({
            userId: 'me',
            id: response.data.id,
            requestBody: {
              addLabelIds: email.labels,
            },
          });
          this.recordRateLimitUsage(5); // 5 quota units for modify
        } catch (labelError) {
          // Log error but don't fail the send
          console.error('Failed to apply labels:', labelError);
        }
      }

      // Return success result
      return {
        success: true,
        messageId: response.data.id ?? undefined,
        threadId: response.data.threadId ?? undefined,
        timestamp: new Date(),
        provider: 'gmail',
      };
    } catch (error) {
      // Return error result
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any).code || 'GMAIL_ERROR';

      return {
        success: false,
        timestamp: new Date(),
        provider: 'gmail',
        error: {
          code: errorCode,
          message: errorMessage,
          retryable: this.isRetryableError(errorCode),
        },
      };
    }
  }

  /**
   * Get rate limit information
   * 
   * Gmail API has a limit of 250 quota units per user per second.
   * 
   * @returns Rate limit info
   */
  getRateLimits(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  /**
   * Build Gmail search query from FetchOptions
   * 
   * Converts our unified FetchOptions format to Gmail search operators.
   * Supports: from:, to:, subject:, has:attachment, is:unread, after:, before:
   * 
   * @param options - Fetch options with filters
   * @returns Gmail search query string
   */
  private buildGmailQuery(options: FetchOptions): string {
    const queryParts: string[] = [];

    // Unread only filter
    if (options.unreadOnly) {
      queryParts.push('is:unread');
    }

    // Date range filter
    if (options.dateRange) {
      if (options.dateRange.start) {
        const dateStr = this.formatGmailDate(options.dateRange.start);
        queryParts.push(`after:${dateStr}`);
      }
      if (options.dateRange.end) {
        const dateStr = this.formatGmailDate(options.dateRange.end);
        queryParts.push(`before:${dateStr}`);
      }
    }

    // Sender filter
    if (options.sender) {
      const senderStr = typeof options.sender === 'string'
        ? options.sender
        : options.sender.source; // For RegExp, use source pattern
      queryParts.push(`from:${senderStr}`);
    }

    // Subject filter
    if (options.subject) {
      const subjectStr = typeof options.subject === 'string'
        ? options.subject
        : options.subject.source; // For RegExp, use source pattern
      queryParts.push(`subject:${subjectStr}`);
    }

    // Attachment filter
    if (options.hasAttachment) {
      queryParts.push('has:attachment');
    }

    // Join query parts with spaces (Gmail AND logic)
    return queryParts.join(' ');
  }

  /**
   * Map folder name to Gmail label IDs
   * 
   * Gmail uses labels instead of folders. This method maps common
   * folder names to Gmail label IDs.
   * 
   * @param folder - Folder name (e.g., 'INBOX', 'Sent', 'Drafts')
   * @returns Array of Gmail label IDs
   */
  private mapFolderToLabels(folder?: string): string[] {
    if (!folder) return [];

    const folderMap: Record<string, string[]> = {
      'INBOX': ['INBOX'],
      'Sent': ['SENT'],
      'Drafts': ['DRAFT'],
      'Trash': ['TRASH'],
      'Spam': ['SPAM'],
      'Important': ['IMPORTANT'],
    };

    return folderMap[folder] || [folder]; // Return as-is if not in map (custom label)
  }

  /**
   * Map Gmail message to EmailMessage format
   * 
   * Converts Gmail API message format to our unified EmailMessage format.
   * Extracts Gmail-specific metadata (thread ID, labels, snippet).
   * 
   * @param gmailMessage - Gmail API message object
   * @returns Parsed EmailMessage object
   */
  private async mapGmailToEmailMessage(gmailMessage: gmail_v1.Schema$Message): Promise<EmailMessage> {
    // Decode raw MIME content
    const rawContent = gmailMessage.raw
      ? Buffer.from(gmailMessage.raw, 'base64').toString('utf-8')
      : '';

    if (!rawContent) {
      throw new Error('Gmail message has no raw content');
    }

    // Create RawEmail object for parser
    const rawEmail: RawEmail = {
      uid: gmailMessage.id || '',
      source: rawContent,
      flags: this.mapGmailLabelsToFlags(gmailMessage.labelIds || []),
      internalDate: gmailMessage.internalDate
        ? new Date(parseInt(gmailMessage.internalDate, 10))
        : new Date(),
      size: gmailMessage.sizeEstimate || 0,
    };

    // Parse using mailparser
    const emailMessage = await parseEmail(rawEmail, 'gmail');

    // Add Gmail-specific metadata
    emailMessage.metadata.threadId = gmailMessage.threadId ?? undefined;
    emailMessage.metadata.labels = gmailMessage.labelIds ?? undefined;
    emailMessage.metadata.snippet = gmailMessage.snippet ?? undefined;

    return emailMessage;
  }

  /**
   * Map Gmail labels to email flags
   * 
   * Converts Gmail label IDs to standard email flags.
   * 
   * @param labelIds - Array of Gmail label IDs
   * @returns Array of flag strings
   */
  private mapGmailLabelsToFlags(labelIds: string[]): string[] {
    const flags: string[] = [];

    if (!labelIds.includes('UNREAD')) {
      flags.push('\\Seen');
    }
    if (labelIds.includes('STARRED')) {
      flags.push('\\Flagged');
    }
    if (labelIds.includes('DRAFT')) {
      flags.push('\\Draft');
    }
    if (labelIds.includes('TRASH')) {
      flags.push('\\Deleted');
    }

    return flags;
  }

  /**
   * Build RFC 2822 MIME message for sending
   * 
   * Constructs a properly formatted MIME message with headers, body,
   * and attachments according to RFC 2822 standard.
   * 
   * @param email - Outgoing email object
   * @returns RFC 2822 formatted MIME message string
   */
  private buildMIMEMessage(email: OutgoingEmail): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const lines: string[] = [];

    // Headers
    lines.push(`To: ${this.formatAddresses(email.to)}`);
    if (email.cc && email.cc.length > 0) {
      lines.push(`Cc: ${this.formatAddresses(email.cc)}`);
    }
    if (email.bcc && email.bcc.length > 0) {
      lines.push(`Bcc: ${this.formatAddresses(email.bcc)}`);
    }
    lines.push(`Subject: ${email.subject}`);
    lines.push(`MIME-Version: 1.0`);

    // Thread headers
    if (email.inReplyTo) {
      lines.push(`In-Reply-To: ${email.inReplyTo}`);
    }
    if (email.references && email.references.length > 0) {
      lines.push(`References: ${email.references.join(' ')}`);
    }

    // Content type
    if (email.attachments && email.attachments.length > 0) {
      // Multipart with attachments
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      lines.push('');

      // Body part
      lines.push(`--${boundary}`);
      if (email.body.html && email.body.text) {
        // Multipart alternative (text + HTML)
        const altBoundary = `----=_Part_Alt_${Date.now()}`;
        lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
        lines.push('');

        // Text part
        lines.push(`--${altBoundary}`);
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.text));
        lines.push('');

        // HTML part
        lines.push(`--${altBoundary}`);
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.html));
        lines.push('');
        lines.push(`--${altBoundary}--`);
      } else if (email.body.html) {
        // HTML only
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.html));
      } else {
        // Text only
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.text || ''));
      }
      lines.push('');

      // Attachments
      for (const attachment of email.attachments) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Type: ${attachment.contentType}; name="${attachment.filename}"`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        if (attachment.contentId) {
          lines.push(`Content-ID: <${attachment.contentId}>`);
        }
        lines.push('');

        // Encode attachment content
        const content = Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content, attachment.encoding || 'utf8');
        lines.push(content.toString('base64'));
        lines.push('');
      }

      lines.push(`--${boundary}--`);
    } else {
      // No attachments
      if (email.body.html && email.body.text) {
        // Multipart alternative (text + HTML)
        lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        lines.push('');

        // Text part
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.text));
        lines.push('');

        // HTML part
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.html));
        lines.push('');
        lines.push(`--${boundary}--`);
      } else if (email.body.html) {
        // HTML only
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.html));
      } else {
        // Text only
        lines.push('Content-Type: text/plain; charset=utf-8');
        lines.push('Content-Transfer-Encoding: quoted-printable');
        lines.push('');
        lines.push(this.encodeQuotedPrintable(email.body.text || ''));
      }
    }

    return lines.join('\r\n');
  }

  /**
   * Format email addresses for MIME headers
   * 
   * Converts EmailAddress objects to format: "Name <email@example.com>"
   * or just "email@example.com" if name is not provided.
   * 
   * @param addresses - Array of EmailAddress objects
   * @returns Formatted address string
   */
  private formatAddresses(addresses: EmailAddress[]): string {
    return addresses
      .map(addr => {
        if (addr.name) {
          return `"${addr.name}" <${addr.address}>`;
        }
        return addr.address;
      })
      .join(', ');
  }

  /**
   * Encode text using quoted-printable encoding
   * 
   * Simple quoted-printable encoding for email body content.
   * 
   * @param text - Text to encode
   * @returns Quoted-printable encoded text
   */
  private encodeQuotedPrintable(text: string): string {
    // Simple implementation - for production, consider using a library
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF=]/g, (char) => {
        const hex = char.charCodeAt(0).toString(16).toUpperCase();
        return `=${hex.padStart(2, '0')}`;
      })
      .replace(/[ \t]+$/gm, (match) => {
        return match.replace(/ /g, '=20').replace(/\t/g, '=09');
      });
  }

  /**
   * Format date for Gmail search query
   * 
   * Gmail date format: YYYY/MM/DD (e.g., "2024/01/15")
   * 
   * @param date - Date object
   * @returns Formatted date string for Gmail
   */
  private formatGmailDate(date: Date | string): string {
    // Convert string to Date if needed
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Validate date
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      throw new Error(`Invalid date: ${date}`);
    }
    
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Check if an error is retryable
   * 
   * Determines if a Gmail API error should trigger a retry attempt.
   * 
   * @param errorCode - Gmail API error code
   * @returns true if error is retryable
   */
  private isRetryableError(errorCode: string | number): boolean {
    const retryableCodes = [
      429, // Rate limit exceeded
      500, // Internal server error
      502, // Bad gateway
      503, // Service unavailable
      504, // Gateway timeout
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
    ];
    return retryableCodes.includes(errorCode);
  }

  /**
   * Wait for rate limit slot to be available
   * 
   * Implements rate limiting to comply with Gmail API limits
   * (250 quota units per user per second).
   */
  private async waitForRateLimit(): Promise<void> {
    const now = new Date();

    // Reset rate limit if reset time has passed
    if (now >= this.rateLimitInfo.resetTime) {
      this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
      this.rateLimitInfo.resetTime = new Date(now.getTime() + 1000); // Reset in 1 second
    }

    // Wait if no quota remaining
    if (this.rateLimitInfo.remaining <= 0) {
      const waitTime = this.rateLimitInfo.resetTime.getTime() - now.getTime();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      // Reset after waiting
      this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
      this.rateLimitInfo.resetTime = new Date(Date.now() + 1000);
    }
  }

  /**
   * Record rate limit usage
   * 
   * Decrements the remaining quota by the specified amount.
   * 
   * @param quotaUnits - Number of quota units consumed
   */
  private recordRateLimitUsage(quotaUnits: number): void {
    this.rateLimitInfo.remaining = Math.max(0, this.rateLimitInfo.remaining - quotaUnits);
  }
}
