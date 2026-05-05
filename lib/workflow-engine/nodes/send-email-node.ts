/**
 * Send Email Node Implementation
 * 
 * Sends emails via configured email provider (SMTP/Gmail/Outlook)
 * with template rendering and attachment support.
 * 
 * Requirement 13: Action Node - Email Send
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { getAdapter } from '@/lib/email-nodes/adapters';
import { renderEmail } from '@/lib/email-nodes/template';
import type { 
  ProviderConfig, 
  OutgoingEmail,
  SendResult,
  EmailTemplate,
  EmailAddress
} from '@/lib/email-nodes/types';

/**
 * Send Email Node - Send emails via email provider
 * 
 * Configuration:
 * - provider: Email provider type ('smtp' | 'gmail' | 'outlook')
 * - config: Provider configuration (credentials, host, port, etc.)
 * - to: Recipient addresses (array of EmailAddress or expression)
 * - cc: CC addresses (optional, array of EmailAddress or expression)
 * - bcc: BCC addresses (optional, array of EmailAddress or expression)
 * - subject: Email subject (string or expression)
 * - body: Email body content (object with text/html or expression)
 * - attachments: File attachments (optional, array or expression)
 * - template: Email template configuration (optional)
 * - inReplyTo: Message ID to reply to (optional)
 * - references: Array of message IDs for threading (optional)
 * 
 * Requirement 13: Email Send Node SHALL accept recipient addresses (to, cc, bcc), subject, and body as inputs
 * Requirement 13: Email Send Node SHALL accept an Email_Account configuration for SMTP connection
 */
export class SendEmailNode extends BaseNode {
  readonly type = 'send-email';

  /**
   * Execute the send email logic
   * 
   * Requirement 13: Email Send Node SHALL connect to the SMTP server using the configured account
   * Requirement 13: Email Send Node SHALL send the email with the specified recipients, subject, and body
   * Requirement 13: Email Send Node SHALL support both plain text and HTML email formats
   * Requirement 13: Email Send Node SHALL support file attachments from the Execution Context
   * Requirement 13: Email Send Node SHALL support Email_Template rendering with variable substitution
   * Requirement 13: When email sending succeeds, Email Send Node SHALL return the message ID
   * Requirement 13: When email sending fails, Email Send Node SHALL return a descriptive error message
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

      // Resolve recipient addresses
      const to = this.resolveRecipients(config.to, context);
      const cc = config.cc ? this.resolveRecipients(config.cc, context) : undefined;
      const bcc = config.bcc ? this.resolveRecipients(config.bcc, context) : undefined;

      // Prepare outgoing email
      let outgoingEmail: OutgoingEmail;

      // If template is provided, render it
      if (config.template) {
        const templateData = config.template.data 
          ? this.resolveExpression(config.template.data, context)
          : { ...context.variables, ...input };

        const emailTemplate: EmailTemplate = {
          subject: config.template.subject,
          body: config.template.body,
          bodyType: config.template.bodyType || 'html'
        };

        const rendered = renderEmail(emailTemplate, templateData);

        outgoingEmail = {
          to,
          cc,
          bcc,
          subject: rendered.subject,
          body: {
            text: rendered.text,
            html: rendered.html,
            encoding: 'utf-8',
            charset: 'utf-8'
          },
          attachments: config.attachments 
            ? this.resolveAttachments(config.attachments, context)
            : undefined,
          inReplyTo: config.inReplyTo 
            ? this.resolveExpression(config.inReplyTo, context)
            : undefined,
          references: config.references 
            ? this.resolveExpression(config.references, context)
            : undefined
        };
      } else {
        // Use provided email content directly
        const subject = this.resolveExpression(config.subject, context);
        const body = this.resolveBody(config.body, context);

        outgoingEmail = {
          to,
          cc,
          bcc,
          subject,
          body: {
            text: body.text,
            html: body.html,
            encoding: 'utf-8',
            charset: 'utf-8'
          },
          attachments: config.attachments 
            ? this.resolveAttachments(config.attachments, context)
            : undefined,
          inReplyTo: config.inReplyTo 
            ? this.resolveExpression(config.inReplyTo, context)
            : undefined,
          references: config.references 
            ? this.resolveExpression(config.references, context)
            : undefined
        };
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

      // Send email
      let result: SendResult;
      try {
        result = await adapter.sendEmail(outgoingEmail);
      } catch (error) {
        // Disconnect before returning error
        try {
          await adapter.disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }

        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to send email: ${message}`);
      }

      // Disconnect from provider
      try {
        await adapter.disconnect();
      } catch (error) {
        // Ignore disconnect errors - email was sent successfully
      }

      // Return result
      if (result.success) {
        return this.success({
          messageId: result.messageId,
          threadId: result.threadId,
          provider,
          timestamp: result.timestamp.toISOString(),
          recipients: {
            to: to.length,
            cc: cc?.length || 0,
            bcc: bcc?.length || 0
          }
        });
      } else {
        return this.failure(
          result.error?.message || 'Failed to send email',
          {
            provider,
            error: result.error
          }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Unexpected error in send email node: ${message}`);
    }
  }

  /**
   * Validate send email node configuration
   * 
   * Requirement 13: Email Send Node SHALL validate configuration before execution
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
      const validProviders = ['smtp', 'gmail', 'outlook'];
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

    // Validate recipients
    if (!config.to) {
      errors.push({
        field: 'to',
        message: 'to (recipient addresses) is required'
      });
    }

    // Validate email content (either template or subject+body)
    if (config.template) {
      // Validate template configuration
      if (!config.template.subject) {
        errors.push({
          field: 'template.subject',
          message: 'template.subject is required when using template'
        });
      }
      if (!config.template.body) {
        errors.push({
          field: 'template.body',
          message: 'template.body is required when using template'
        });
      }
      if (config.template.bodyType) {
        const validBodyTypes = ['text', 'html', 'both'];
        if (!validBodyTypes.includes(config.template.bodyType)) {
          errors.push({
            field: 'template.bodyType',
            message: `template.bodyType must be one of: ${validBodyTypes.join(', ')}`
          });
        }
      }
    } else {
      // Validate direct email content
      if (!config.subject) {
        errors.push({
          field: 'subject',
          message: 'subject is required when not using template'
        });
      }
      if (!config.body) {
        errors.push({
          field: 'body',
          message: 'body is required when not using template'
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

    // Validate SMTP specific config
    if (provider === 'smtp') {
      if (!config.host) {
        errors.push({
          field: 'config.host',
          message: 'config.host is required for SMTP provider'
        });
      }
      if (!config.port) {
        errors.push({
          field: 'config.port',
          message: 'config.port is required for SMTP provider'
        });
      }
    }

    return errors;
  }

  /**
   * Resolve recipient addresses from configuration
   * 
   * @param recipients - Recipients configuration (array or expression)
   * @param context - Execution context
   * @returns Array of EmailAddress objects
   */
  private resolveRecipients(
    recipients: any,
    context: ExecutionContext
  ): EmailAddress[] {
    // If it's a string expression, resolve it
    if (typeof recipients === 'string') {
      const resolved = this.resolveExpression(recipients, context);
      return this.normalizeRecipients(resolved);
    }

    // If it's already an array, normalize it
    if (Array.isArray(recipients)) {
      return this.normalizeRecipients(recipients);
    }

    // Single recipient object
    return this.normalizeRecipients([recipients]);
  }

  /**
   * Normalize recipients to EmailAddress array
   * 
   * @param recipients - Recipients in various formats
   * @returns Array of EmailAddress objects
   */
  private normalizeRecipients(recipients: any): EmailAddress[] {
    if (!Array.isArray(recipients)) {
      recipients = [recipients];
    }

    return recipients.map((recipient: any) => {
      if (typeof recipient === 'string') {
        return { address: recipient };
      }
      if (typeof recipient === 'object' && recipient.address) {
        return {
          address: recipient.address,
          name: recipient.name
        };
      }
      throw new Error(`Invalid recipient format: ${JSON.stringify(recipient)}`);
    });
  }

  /**
   * Resolve email body from configuration
   * 
   * @param body - Body configuration (object or expression)
   * @param context - Execution context
   * @returns Email body with text and/or html
   */
  private resolveBody(
    body: any,
    context: ExecutionContext
  ): { text?: string; html?: string } {
    // If it's a string expression, resolve it
    if (typeof body === 'string') {
      const resolved = this.resolveExpression(body, context);
      if (typeof resolved === 'string') {
        return { text: resolved };
      }
      return resolved;
    }

    // If it's an object, resolve each field
    const result: { text?: string; html?: string } = {};

    if (body.text) {
      result.text = typeof body.text === 'string' && body.text.includes('{{')
        ? this.resolveExpression(body.text, context)
        : body.text;
    }

    if (body.html) {
      result.html = typeof body.html === 'string' && body.html.includes('{{')
        ? this.resolveExpression(body.html, context)
        : body.html;
    }

    return result;
  }

  /**
   * Resolve attachments from configuration
   * 
   * @param attachments - Attachments configuration (array or expression)
   * @param context - Execution context
   * @returns Array of attachment objects
   */
  private resolveAttachments(
    attachments: any,
    context: ExecutionContext
  ): Array<{
    filename: string;
    contentType: string;
    content: Buffer | string;
    encoding?: 'base64' | 'utf8';
    contentId?: string;
  }> {
    // If it's a string expression, resolve it
    if (typeof attachments === 'string') {
      const resolved = this.resolveExpression(attachments, context);
      return this.normalizeAttachments(resolved);
    }

    // If it's already an array, normalize it
    if (Array.isArray(attachments)) {
      return this.normalizeAttachments(attachments);
    }

    return [];
  }

  /**
   * Normalize attachments to proper format
   * 
   * @param attachments - Attachments in various formats
   * @returns Array of normalized attachment objects
   */
  private normalizeAttachments(attachments: any): Array<{
    filename: string;
    contentType: string;
    content: Buffer | string;
    encoding?: 'base64' | 'utf8';
    contentId?: string;
  }> {
    if (!Array.isArray(attachments)) {
      return [];
    }

    return attachments.map((att: any) => {
      // Convert base64 string to Buffer if needed
      const content = typeof att.content === 'string' && att.encoding === 'base64'
        ? Buffer.from(att.content, 'base64')
        : att.content;

      return {
        filename: att.filename,
        contentType: att.contentType,
        content,
        encoding: att.encoding,
        contentId: att.contentId
      };
    });
  }
}
