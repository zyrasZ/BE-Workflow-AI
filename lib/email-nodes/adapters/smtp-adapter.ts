/**
 * SMTP Adapter - Email Provider Adapter for SMTP servers
 * 
 * This adapter provides email sending capabilities using SMTP protocol.
 * It wraps the nodemailer library and provides a unified interface
 * conforming to EmailProviderAdapter.
 */

import nodemailer, { Transporter } from 'nodemailer';
import type {
  EmailProviderAdapter,
  ProviderConfig,
  FetchOptions,
  EmailMessage,
  OutgoingEmail,
  SendResult,
  RateLimitInfo,
  EmailAddress,
} from '../types';

/**
 * SMTP Adapter Implementation
 * 
 * Provides email sending capabilities using SMTP protocol.
 * Uses nodemailer library for SMTP connection management.
 */
export class SMTPAdapter implements EmailProviderAdapter {
  private transporter: Transporter | null = null;
  private config: ProviderConfig | null = null;
  private connected: boolean = false;

  /**
   * Connect to SMTP server
   * 
   * @param config - Provider configuration with SMTP server details
   */
  async connect(config: ProviderConfig): Promise<void> {
    if (this.connected && this.transporter) {
      return; // Already connected
    }

    this.config = config;

    // Validate required SMTP configuration
    if (!config.host || !config.port) {
      throw new Error('SMTP configuration requires host and port');
    }

    if (config.credentials.type !== 'password') {
      throw new Error('SMTP adapter only supports password authentication');
    }

    if (!config.credentials.username || !config.credentials.password) {
      throw new Error('SMTP credentials require username and password');
    }

    // Create SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? true, // Default to secure connection (SSL/TLS)
      auth: {
        user: config.credentials.username,
        pass: config.credentials.password,
      },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      this.connected = true;
    } catch (error) {
      this.transporter = null;
      this.connected = false;
      throw new Error(
        `Failed to connect to SMTP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Disconnect from SMTP server
   */
  async disconnect(): Promise<void> {
    if (this.transporter && this.connected) {
      this.transporter.close();
      this.transporter = null;
      this.connected = false;
    }
  }

  /**
   * Fetch emails (not supported by SMTP adapter)
   * 
   * SMTP is for sending emails only. Use IMAPAdapter for reading.
   * 
   * @throws Error always - SMTP doesn't support fetching
   */
  async fetchEmails(_options: FetchOptions): Promise<EmailMessage[]> {
    throw new Error('SMTP adapter does not support fetching emails. Use IMAPAdapter instead.');
  }

  /**
   * Fetch a single email (not supported by SMTP adapter)
   * 
   * SMTP is for sending emails only. Use IMAPAdapter for reading.
   * 
   * @throws Error always - SMTP doesn't support fetching
   */
  async fetchEmail(_id: string): Promise<EmailMessage> {
    throw new Error('SMTP adapter does not support fetching emails. Use IMAPAdapter instead.');
  }

  /**
   * Send an email via SMTP
   * 
   * This is the core method of the SMTP adapter that sends emails via SMTP server
   * using nodemailer. It:
   * - Formats addresses using formatAddress() helper
   * - Maps OutgoingEmail to nodemailer format
   * - Handles attachments
   * - Preserves thread (inReplyTo, references)
   * 
   * @param email - Outgoing email with recipients, subject, body, and attachments
   * @returns Send result with message ID and status
   */
  async sendEmail(email: OutgoingEmail): Promise<SendResult> {
    if (!this.transporter || !this.connected) {
      throw new Error('Not connected to SMTP server. Call connect() first.');
    }

    try {
      // Format addresses
      const from = this.config?.credentials.username || '';
      const to = email.to.map(addr => this.formatAddress(addr));
      const cc = email.cc?.map(addr => this.formatAddress(addr));
      const bcc = email.bcc?.map(addr => this.formatAddress(addr));

      // Build nodemailer message
      const mailOptions: any = {
        from,
        to: to.join(', '),
        subject: email.subject,
      };

      // Add CC if present
      if (cc && cc.length > 0) {
        mailOptions.cc = cc.join(', ');
      }

      // Add BCC if present
      if (bcc && bcc.length > 0) {
        mailOptions.bcc = bcc.join(', ');
      }

      // Add body content
      if (email.body.text) {
        mailOptions.text = email.body.text;
      }
      if (email.body.html) {
        mailOptions.html = email.body.html;
      }

      // Preserve thread information (inReplyTo, references)
      if (email.inReplyTo) {
        mailOptions.inReplyTo = email.inReplyTo;
      }
      if (email.references && email.references.length > 0) {
        mailOptions.references = email.references.join(' ');
      }

      // Handle attachments
      if (email.attachments && email.attachments.length > 0) {
        mailOptions.attachments = email.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          encoding: att.encoding || 'base64',
          cid: att.contentId, // For inline attachments
        }));
      }

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      // Return success result
      return {
        success: true,
        messageId: info.messageId,
        timestamp: new Date(),
        provider: 'smtp',
      };
    } catch (error) {
      // Return error result
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as any).code || 'SMTP_ERROR';
      
      return {
        success: false,
        timestamp: new Date(),
        provider: 'smtp',
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
   * SMTP doesn't have explicit rate limits like APIs, but we return
   * a default structure for consistency.
   * 
   * @returns Rate limit info (no limits for SMTP)
   */
  getRateLimits(): RateLimitInfo {
    return {
      limit: Infinity,
      remaining: Infinity,
      resetTime: new Date(Date.now() + 3600000), // 1 hour from now
    };
  }

  /**
   * Format an EmailAddress to string format for nodemailer
   * 
   * Converts EmailAddress object to format: "Name <email@example.com>"
   * or just "email@example.com" if name is not provided.
   * 
   * @param address - EmailAddress object with address and optional name
   * @returns Formatted address string
   */
  private formatAddress(address: EmailAddress): string {
    if (address.name) {
      return `"${address.name}" <${address.address}>`;
    }
    return address.address;
  }

  /**
   * Check if an error is retryable
   * 
   * Determines if an SMTP error should trigger a retry attempt.
   * 
   * @param errorCode - SMTP error code
   * @returns true if error is retryable
   */
  private isRetryableError(errorCode: string): boolean {
    const retryableCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'EAI_AGAIN',
    ];
    return retryableCodes.includes(errorCode);
  }
}
