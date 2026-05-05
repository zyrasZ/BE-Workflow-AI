/**
 * Read Email Node Implementation
 * 
 * Reads emails from configured email provider (IMAP/Gmail/Outlook)
 * with filtering and pagination support.
 * 
 * Requirement 14: Action Node - Email Read
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { getAdapter } from '@/lib/email-nodes/adapters';
import type { 
  ProviderConfig, 
  FetchOptions,
  EmailMessage
} from '@/lib/email-nodes/types';

/**
 * Read Email Node - Fetch emails from email provider
 * 
 * Configuration:
 * - provider: Email provider type ('imap' | 'gmail' | 'outlook')
 * - config: Provider configuration (credentials, host, port, etc.)
 * - folder: Mailbox folder name (default: 'INBOX')
 * - unreadOnly: Fetch only unread emails (optional)
 * - dateRange: Filter by date range (optional)
 * - sender: Filter by sender address or pattern (optional)
 * - subject: Filter by subject pattern (optional)
 * - hasAttachment: Filter emails with attachments (optional)
 * - limit: Maximum number of emails to retrieve (default: 10, max: 100)
 * - offset: Number of emails to skip for pagination (optional)
 * 
 * Requirement 14: Email Read Node SHALL accept an Email_Account configuration and folder name
 * Requirement 14: Email Read Node SHALL accept filter criteria (unread only, date range, sender, subject pattern)
 */
export class ReadEmailNode extends BaseNode {
  readonly type = 'read-email';

  /**
   * Execute the read email logic
   * 
   * Requirement 14: Email Read Node SHALL connect to the email server via IMAP
   * Requirement 14: Email Read Node SHALL retrieve emails matching the filter criteria
   * Requirement 14: Email Read Node SHALL parse email headers (from, to, subject, date) and body (text and HTML)
   * Requirement 14: Email Read Node SHALL extract attachment metadata (filename, size, content type)
   * Requirement 14: Email Read Node SHALL return an array of email objects with parsed data
   * Requirement 14: Email Read Node SHALL support limiting the number of emails retrieved (default 10, maximum 100)
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Resolve configuration values from expressions
      const provider = config.provider;
      const providerConfig: ProviderConfig = config.config;

      // Build fetch options
      const fetchOptions: FetchOptions = {
        folder: config.folder 
          ? this.resolveExpression(config.folder, context)
          : 'INBOX',
        limit: config.limit !== undefined 
          ? this.resolveExpression(config.limit, context)
          : 10,
        offset: config.offset !== undefined
          ? this.resolveExpression(config.offset, context)
          : undefined,
        unreadOnly: config.unreadOnly !== undefined
          ? this.resolveExpression(config.unreadOnly, context)
          : undefined,
        hasAttachment: config.hasAttachment !== undefined
          ? this.resolveExpression(config.hasAttachment, context)
          : undefined
      };

      // Resolve date range filter if provided
      if (config.dateRange) {
        const dateRange = this.resolveExpression(config.dateRange, context);
        if (dateRange) {
          fetchOptions.dateRange = {
            start: dateRange.start ? new Date(dateRange.start) : undefined,
            end: dateRange.end ? new Date(dateRange.end) : undefined
          };
        }
      }

      // Resolve sender filter if provided
      if (config.sender) {
        const sender = this.resolveExpression(config.sender, context);
        if (sender) {
          // If sender is a regex pattern string, convert to RegExp
          if (typeof sender === 'string' && sender.startsWith('/') && sender.endsWith('/')) {
            const pattern = sender.slice(1, -1);
            fetchOptions.sender = new RegExp(pattern);
          } else {
            fetchOptions.sender = sender;
          }
        }
      }

      // Resolve subject filter if provided
      if (config.subject) {
        const subject = this.resolveExpression(config.subject, context);
        if (subject) {
          // If subject is a regex pattern string, convert to RegExp
          if (typeof subject === 'string' && subject.startsWith('/') && subject.endsWith('/')) {
            const pattern = subject.slice(1, -1);
            fetchOptions.subject = new RegExp(pattern);
          } else {
            fetchOptions.subject = subject;
          }
        }
      }

      // Validate limit
      if (fetchOptions.limit && (fetchOptions.limit < 1 || fetchOptions.limit > 100)) {
        return this.failure('Limit must be between 1 and 100');
      }

      // Get appropriate adapter for the provider
      let adapter;
      try {
        adapter = getAdapter(providerConfig);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to initialize email adapter: ${message}`);
      }

      // Connect to email provider
      try {
        await adapter.connect(providerConfig);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to connect to ${provider}: ${message}`);
      }

      // Fetch emails
      let emails: EmailMessage[];
      try {
        emails = await adapter.fetchEmails(fetchOptions);
      } catch (error) {
        // Disconnect before returning error
        try {
          await adapter.disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }

        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to fetch emails: ${message}`);
      }

      // Disconnect from provider
      try {
        await adapter.disconnect();
      } catch (error) {
        // Ignore disconnect errors - emails were fetched successfully
      }

      // Transform emails to output format
      const emailsOutput = emails.map(email => ({
        id: email.id,
        provider: email.provider,
        from: {
          address: email.headers.from.address,
          name: email.headers.from.name
        },
        to: email.headers.to.map(addr => ({
          address: addr.address,
          name: addr.name
        })),
        cc: email.headers.cc?.map(addr => ({
          address: addr.address,
          name: addr.name
        })),
        subject: email.headers.subject,
        date: email.headers.date.toISOString(),
        messageId: email.headers.messageId,
        inReplyTo: email.headers.inReplyTo,
        references: email.headers.references,
        body: {
          text: email.body.text,
          html: email.body.html,
          encoding: email.body.encoding,
          charset: email.body.charset
        },
        attachments: email.attachments.map(att => ({
          id: att.id,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId
        })),
        flags: {
          seen: email.flags.seen,
          flagged: email.flags.flagged,
          answered: email.flags.answered,
          draft: email.flags.draft
        },
        metadata: {
          threadId: email.metadata.threadId,
          labels: email.metadata.labels,
          categories: email.metadata.categories,
          importance: email.metadata.importance,
          snippet: email.metadata.snippet,
          receivedAt: email.metadata.receivedAt.toISOString()
        }
      }));

      // Return result
      return this.success({
        emails: emailsOutput,
        count: emailsOutput.length,
        provider,
        folder: fetchOptions.folder,
        timestamp: new Date().toISOString(),
        filters: {
          unreadOnly: fetchOptions.unreadOnly,
          hasAttachment: fetchOptions.hasAttachment,
          dateRange: fetchOptions.dateRange,
          sender: config.sender,
          subject: config.subject
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Unexpected error in read email node: ${message}`);
    }
  }

  /**
   * Validate read email node configuration
   * 
   * Requirement 14: Email Read Node SHALL validate configuration before execution
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate provider
    if (!config.provider) {
      errors.push({
        field: 'provider',
        message: 'provider is required'
      });
    } else {
      const validProviders = ['imap', 'gmail', 'outlook'];
      if (!validProviders.includes(config.provider)) {
        errors.push({
          field: 'provider',
          message: `provider must be one of: ${validProviders.join(', ')}`
        });
      }
    }

    // Validate config
    if (!config.config) {
      errors.push({
        field: 'config',
        message: 'config is required'
      });
    } else {
      const configValidation = this.validateProviderConfig(config.config, config.provider);
      errors.push(...configValidation);
    }

    // Validate limit if provided
    if (config.limit !== undefined) {
      if (typeof config.limit === 'number') {
        if (config.limit < 1 || config.limit > 100) {
          errors.push({
            field: 'limit',
            message: 'limit must be between 1 and 100'
          });
        }
      } else if (typeof config.limit !== 'string') {
        // Allow string expressions like "{{variables.limit}}"
        errors.push({
          field: 'limit',
          message: 'limit must be a number or expression'
        });
      }
    }

    // Validate offset if provided
    if (config.offset !== undefined) {
      if (typeof config.offset === 'number') {
        if (config.offset < 0) {
          errors.push({
            field: 'offset',
            message: 'offset must be non-negative'
          });
        }
      } else if (typeof config.offset !== 'string') {
        // Allow string expressions
        errors.push({
          field: 'offset',
          message: 'offset must be a number or expression'
        });
      }
    }

    // Validate dateRange if provided
    if (config.dateRange) {
      if (typeof config.dateRange === 'object' && !Array.isArray(config.dateRange)) {
        if (config.dateRange.start && typeof config.dateRange.start !== 'string') {
          errors.push({
            field: 'dateRange.start',
            message: 'dateRange.start must be an ISO date string or expression'
          });
        }
        if (config.dateRange.end && typeof config.dateRange.end !== 'string') {
          errors.push({
            field: 'dateRange.end',
            message: 'dateRange.end must be an ISO date string or expression'
          });
        }
      } else if (typeof config.dateRange !== 'string') {
        // Allow string expressions
        errors.push({
          field: 'dateRange',
          message: 'dateRange must be an object or expression'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate provider configuration
   * 
   * @param config - Provider configuration to validate
   * @param provider - Provider type
   * @returns Array of validation errors
   */
  private validateProviderConfig(
    config: any,
    provider: string
  ): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    if (!config.provider) {
      errors.push({
        field: 'config.provider',
        message: 'config.provider is required'
      });
    }

    if (!config.credentials) {
      errors.push({
        field: 'config.credentials',
        message: 'config.credentials is required'
      });
      return errors;
    }

    if (!config.credentials.type) {
      errors.push({
        field: 'config.credentials.type',
        message: 'config.credentials.type is required'
      });
    } else {
      const validTypes = ['password', 'oauth2'];
      if (!validTypes.includes(config.credentials.type)) {
        errors.push({
          field: 'config.credentials.type',
          message: `config.credentials.type must be one of: ${validTypes.join(', ')}`
        });
      }
    }

    // Validate password credentials
    if (config.credentials.type === 'password') {
      if (!config.credentials.username) {
        errors.push({
          field: 'config.credentials.username',
          message: 'config.credentials.username is required for password authentication'
        });
      }
      if (!config.credentials.password) {
        errors.push({
          field: 'config.credentials.password',
          message: 'config.credentials.password is required for password authentication'
        });
      }
    }

    // Validate OAuth2 credentials
    if (config.credentials.type === 'oauth2') {
      if (!config.credentials.accessToken) {
        errors.push({
          field: 'config.credentials.accessToken',
          message: 'config.credentials.accessToken is required for oauth2 authentication'
        });
      }
    }

    // Validate IMAP specific config
    if (provider === 'imap') {
      if (!config.host) {
        errors.push({
          field: 'config.host',
          message: 'config.host is required for IMAP provider'
        });
      }
      if (!config.port) {
        errors.push({
          field: 'config.port',
          message: 'config.port is required for IMAP provider'
        });
      }
    }

    return errors;
  }
}
