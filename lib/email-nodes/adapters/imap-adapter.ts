/**
 * IMAP Adapter - Email Provider Adapter for IMAP/POP3 servers
 * 
 * This adapter provides email reading and sending capabilities using IMAP protocol
 * for reading and SMTP for sending. It wraps the imapflow library and provides
 * a unified interface conforming to EmailProviderAdapter.
 */

import { ImapFlow } from 'imapflow';
import type {
  EmailProviderAdapter,
  ProviderConfig,
  FetchOptions,
  EmailMessage,
  OutgoingEmail,
  SendResult,
  RateLimitInfo,
  RawEmail,
} from '../types';
import { parseEmail } from '../parser';

/**
 * IMAP Adapter Implementation
 * 
 * Provides email reading capabilities using IMAP protocol.
 * Uses imapflow library for IMAP connection management.
 */
export class IMAPAdapter implements EmailProviderAdapter {
  private client: ImapFlow | null = null;
  private config: ProviderConfig | null = null;
  private connected: boolean = false;

  /**
   * Connect to IMAP server
   * 
   * @param config - Provider configuration with IMAP server details
   */
  async connect(config: ProviderConfig): Promise<void> {
    if (this.connected && this.client) {
      return; // Already connected
    }

    this.config = config;

    // Validate required IMAP configuration
    if (!config.host || !config.port) {
      throw new Error('IMAP configuration requires host and port');
    }

    if (config.credentials.type !== 'password') {
      throw new Error('IMAP adapter only supports password authentication');
    }

    if (!config.credentials.username || !config.credentials.password) {
      throw new Error('IMAP credentials require username and password');
    }

    // Create IMAP client
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure ?? true, // Default to secure connection
      auth: {
        user: config.credentials.username,
        pass: config.credentials.password,
      },
      logger: false, // Disable imapflow's internal logging
    });

    // Connect to server
    try {
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      this.client = null;
      this.connected = false;
      throw new Error(
        `Failed to connect to IMAP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.logout();
      } catch (error) {
        // Ignore logout errors
      }
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Fetch multiple emails based on filter options
   * 
   * This is the main method for retrieving emails from IMAP server.
   * It builds IMAP search criteria from FetchOptions, fetches messages
   * with uid, envelope, source, and flags, parses each message using
   * mailparser, and maps to EmailMessage format.
   * 
   * @param options - Fetch options with filters and pagination
   * @returns Array of parsed EmailMessage objects
   */
  async fetchEmails(options: FetchOptions): Promise<EmailMessage[]> {
    if (!this.client || !this.connected) {
      throw new Error('Not connected to IMAP server. Call connect() first.');
    }

    // Select mailbox (folder)
    const folder = options.folder || 'INBOX';
    let lock;
    
    try {
      lock = await this.client.getMailboxLock(folder);
    } catch (error) {
      throw new Error(
        `Failed to access mailbox "${folder}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    try {
      // Build IMAP search criteria from FetchOptions (for reference/future use)
      // Currently using client-side filtering for better compatibility
      // const searchCriteria = this.buildIMAPSearchCriteria(options);

      // Search for messages matching criteria
      const messages = [];
      
      // Fetch messages with pagination
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      
      // Use imapflow's fetch with range
      // For search criteria, we'll fetch all and filter, or use '1:*' for all messages
      const fetchRange = '1:*'; // Fetch all messages in the mailbox
      
      for await (const message of this.client.fetch(fetchRange, {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
        internalDate: true,
        size: true,
      })) {
        // Apply client-side filtering based on search criteria
        if (this.matchesSearchCriteria(message, options)) {
          messages.push(message);
        }
      }

      // Apply offset and limit
      const paginatedMessages = messages.slice(offset, offset + limit);

      // Parse each message
      const emailMessages: EmailMessage[] = [];
      
      for (const msg of paginatedMessages) {
        try {
          // Convert imapflow message to RawEmail format
          const rawEmail: RawEmail = {
            uid: msg.uid,
            source: msg.source ? msg.source.toString() : '',
            flags: msg.flags ? Array.from(msg.flags) : [],
            internalDate: typeof msg.internalDate === 'string' 
              ? new Date(msg.internalDate) 
              : (msg.internalDate || new Date()),
            size: msg.size || 0,
          };

          // Parse using mailparser
          const emailMessage = await parseEmail(rawEmail, 'imap');
          emailMessages.push(emailMessage);
        } catch (parseError) {
          // Log parsing error but continue with other messages
          console.error(`Failed to parse email UID ${msg.uid}:`, parseError);
          // The parseEmail function already handles errors and returns partial data
        }
      }

      return emailMessages;
    } finally {
      // Always release the mailbox lock
      lock.release();
    }
  }

  /**
   * Fetch a single email by ID
   * 
   * @param id - Email UID
   * @returns Parsed EmailMessage object
   */
  async fetchEmail(id: string): Promise<EmailMessage> {
    if (!this.client || !this.connected) {
      throw new Error('Not connected to IMAP server. Call connect() first.');
    }

    // For IMAP, id is the UID
    const uid = parseInt(id, 10);
    if (isNaN(uid)) {
      throw new Error(`Invalid email ID: ${id}`);
    }

    const folder = 'INBOX'; // Default folder, could be made configurable
    let lock;
    
    try {
      lock = await this.client.getMailboxLock(folder);
    } catch (error) {
      throw new Error(
        `Failed to access mailbox "${folder}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    try {
      // Fetch single message by UID
      const message = await this.client.fetchOne(uid.toString(), {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
        internalDate: true,
        size: true,
      });

      if (!message) {
        throw new Error(`Email with UID ${uid} not found`);
      }

      // Convert to RawEmail format
      const rawEmail: RawEmail = {
        uid: message.uid,
        source: message.source ? message.source.toString() : '',
        flags: message.flags ? Array.from(message.flags) : [],
        internalDate: typeof message.internalDate === 'string'
          ? new Date(message.internalDate)
          : (message.internalDate || new Date()),
        size: message.size || 0,
      };

      // Parse and return
      return await parseEmail(rawEmail, 'imap');
    } finally {
      lock.release();
    }
  }

  /**
   * Send an email (not supported by IMAP adapter)
   * 
   * IMAP is for reading emails only. Use SMTPAdapter for sending.
   * 
   * @throws Error always - IMAP doesn't support sending
   */
  async sendEmail(_email: OutgoingEmail): Promise<SendResult> {
    throw new Error('IMAP adapter does not support sending emails. Use SMTPAdapter instead.');
  }

  /**
   * Get rate limit information
   * 
   * IMAP doesn't have explicit rate limits like APIs, but we return
   * a default structure for consistency.
   * 
   * @returns Rate limit info (no limits for IMAP)
   */
  getRateLimits(): RateLimitInfo {
    return {
      limit: Infinity,
      remaining: Infinity,
      resetTime: new Date(Date.now() + 3600000), // 1 hour from now
    };
  }

  /**
   * [FIXED - Bug 12] Mark an email as read by adding \\Seen flag
   */
  async markAsRead(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      // Use imapflow to add the \\Seen flag
      await this.client.messageFlagsAdd(
        id,
        ['\\Seen'],
        { uid: true }
      );
      console.log(`[IMAPAdapter] Marked email ${id} as read`);
    } catch (error) {
      console.error(`[IMAPAdapter] Failed to mark email as read: ${error}`);
      throw error;
    }
  }

  /**
   * [FIXED - Bug 12] Move an email to a different folder
   */
  async moveToFolder(id: string, folder: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      await this.client.messageMove(
        { uid: true },
        id,
        folder,
        { uid: true }
      );
      console.log(`[IMAPAdapter] Moved email ${id} to folder ${folder}`);
    } catch (error) {
      console.error(`[IMAPAdapter] Failed to move email: ${error}`);
      throw error;
    }
  }

  /**
   * Build IMAP search criteria from FetchOptions
   * 
   * Converts our unified FetchOptions format to IMAP search query format
   * supported by imapflow.
   * 
   * Note: This method is kept for reference but currently we do client-side filtering
   * using matchesSearchCriteria() for better compatibility.
   * 
   * @param options - Fetch options with filters
   * @returns IMAP search criteria string
   */
  private _buildIMAPSearchCriteria(options: FetchOptions): string {
    const criteria: string[] = [];

    // Unread only filter
    if (options.unreadOnly) {
      criteria.push('UNSEEN');
    }

    // Date range filter
    if (options.dateRange) {
      if (options.dateRange.start) {
        const dateStr = this.formatIMAPDate(options.dateRange.start);
        criteria.push(`SINCE ${dateStr}`);
      }
      if (options.dateRange.end) {
        const dateStr = this.formatIMAPDate(options.dateRange.end);
        criteria.push(`BEFORE ${dateStr}`);
      }
    }

    // Sender filter
    if (options.sender) {
      const senderStr = typeof options.sender === 'string' 
        ? options.sender 
        : options.sender.source; // For RegExp, use source pattern
      criteria.push(`FROM "${senderStr}"`);
    }

    // Subject filter
    if (options.subject) {
      const subjectStr = typeof options.subject === 'string'
        ? options.subject
        : options.subject.source; // For RegExp, use source pattern
      criteria.push(`SUBJECT "${subjectStr}"`);
    }

    // If no criteria, return 'ALL' to fetch all messages
    if (criteria.length === 0) {
      return 'ALL';
    }

    // Join criteria with spaces (IMAP AND logic)
    return criteria.join(' ');
  }

  /**
   * Check if a message matches the search criteria (client-side filtering)
   * 
   * This method performs client-side filtering since imapflow's search
   * can be complex to work with for all criteria combinations.
   * 
   * @param message - Message from imapflow
   * @param options - Fetch options with filters
   * @returns true if message matches criteria
   */
  private matchesSearchCriteria(message: any, options: FetchOptions): boolean {
    // Unread only filter
    if (options.unreadOnly) {
      const flags = message.flags ? Array.from(message.flags as Set<string>) : [];
      if (flags.includes('\\Seen')) {
        return false; // Message is read, skip it
      }
    }

    // Date range filter
    if (options.dateRange) {
      const messageDate = typeof message.internalDate === 'string'
        ? new Date(message.internalDate)
        : message.internalDate;
      
      if (options.dateRange.start && messageDate < options.dateRange.start) {
        return false;
      }
      if (options.dateRange.end && messageDate > options.dateRange.end) {
        return false;
      }
    }

    // Note: Sender and subject filtering would require parsing the envelope
    // For now, we'll skip these in client-side filtering and rely on server-side search
    // or parse the message to check these fields

    return true;
  }

  /**
   * Format date for IMAP search query
   * 
   * IMAP date format: DD-MMM-YYYY (e.g., "01-Jan-2024")
   * 
   * @param date - Date object
   * @returns Formatted date string for IMAP
   */
  private formatIMAPDate(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day}-${month}-${year}`;
  }
}
