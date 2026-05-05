/**
 * Email Send API Route
 * 
 * POST /api/email/send
 * 
 * Sends emails via configured email provider (SMTP/Gmail/Outlook)
 * with template rendering and attachment support.
 */

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { getAdapter } from '@/lib/email-nodes/adapters';
import { renderEmail } from '@/lib/email-nodes/template';
import type { 
  ProviderConfig, 
  OutgoingEmail,
  SendResult,
  EmailTemplate,
  EmailAddress
} from '@/lib/email-nodes/types';

export const dynamic = 'force-dynamic';

/**
 * Request body interface
 */
interface SendEmailRequest {
  provider: 'smtp' | 'gmail' | 'outlook';
  config: ProviderConfig;
  email: {
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    subject: string;
    body?: {
      text?: string;
      html?: string;
    };
    attachments?: Array<{
      filename: string;
      contentType: string;
      content: string; // Base64 encoded
      encoding?: 'base64' | 'utf8';
      contentId?: string;
    }>;
    inReplyTo?: string;
    references?: string[];
  };
  template?: {
    subject: string;
    body: string;
    bodyType: 'text' | 'html' | 'both';
    data?: Record<string, any>;
  };
}

/**
 * Response interface
 */
interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  provider: string;
  timestamp: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * POST /api/email/send
 * 
 * Send email via email provider
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authentication check
    const user = await getUser();
    if (!user) {
      console.warn('[Email Send API] Unauthorized access attempt');
      return ApiResponse.unauthorized();
    }

    console.log(`[Email Send API] Request from user: ${user.id}`);

    // Parse and validate request body
    let body: SendEmailRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Email Send API] Invalid JSON in request body:', error);
      return ApiResponse.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const validationError = validateRequest(body);
    if (validationError) {
      console.warn('[Email Send API] Validation error:', validationError);
      return ApiResponse.badRequest(validationError);
    }

    const { provider, config, email, template } = body;

    console.log(`[Email Send API] Sending email via provider: ${provider}`);
    console.log(`[Email Send API] Recipients:`, {
      to: email.to.length,
      cc: email.cc?.length || 0,
      bcc: email.bcc?.length || 0,
      hasTemplate: !!template,
      hasAttachments: email.attachments?.length || 0
    });

    // Prepare outgoing email
    let outgoingEmail: OutgoingEmail;

    // If template is provided, render it
    if (template) {
      console.log('[Email Send API] Rendering email template');
      
      try {
        const emailTemplate: EmailTemplate = {
          subject: template.subject,
          body: template.body,
          bodyType: template.bodyType
        };

        const rendered = renderEmail(emailTemplate, template.data || {});
        
        outgoingEmail = {
          to: email.to,
          cc: email.cc,
          bcc: email.bcc,
          subject: rendered.subject,
          body: {
            text: rendered.text,
            html: rendered.html,
            encoding: 'utf-8',
            charset: 'utf-8'
          },
          attachments: email.attachments?.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            content: Buffer.from(att.content, att.encoding || 'base64'),
            encoding: att.encoding,
            contentId: att.contentId
          })),
          inReplyTo: email.inReplyTo,
          references: email.references
        };

        console.log('[Email Send API] Template rendered successfully');
      } catch (error) {
        console.error('[Email Send API] Template rendering failed:', error);
        return ApiResponse.error(
          `Failed to render template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          400,
          'TEMPLATE_ERROR'
        );
      }
    } else {
      // Use provided email content directly
      outgoingEmail = {
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body: {
          text: email.body?.text,
          html: email.body?.html,
          encoding: 'utf-8',
          charset: 'utf-8'
        },
        attachments: email.attachments?.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          content: Buffer.from(att.content, att.encoding || 'base64'),
          encoding: att.encoding,
          contentId: att.contentId
        })),
        inReplyTo: email.inReplyTo,
        references: email.references
      };
    }

    // Get appropriate adapter for the provider
    let adapter;
    try {
      adapter = getAdapter(config);
    } catch (error) {
      console.error('[Email Send API] Failed to get adapter:', error);
      return ApiResponse.error(
        error instanceof Error ? error.message : 'Failed to initialize email adapter',
        500,
        'ADAPTER_ERROR'
      );
    }

    // Connect to email provider
    try {
      await adapter.connect(config);
      console.log(`[Email Send API] Connected to ${provider} successfully`);
    } catch (error) {
      console.error('[Email Send API] Connection failed:', error);
      return ApiResponse.error(
        `Failed to connect to ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503,
        'CONNECTION_ERROR'
      );
    }

    // Send email
    let result: SendResult;
    try {
      result = await adapter.sendEmail(outgoingEmail);
      console.log(`[Email Send API] Email send result:`, {
        success: result.success,
        messageId: result.messageId,
        hasError: !!result.error
      });
    } catch (error) {
      console.error('[Email Send API] Failed to send email:', error);
      
      // Disconnect before returning error
      try {
        await adapter.disconnect();
      } catch (disconnectError) {
        console.error('[Email Send API] Failed to disconnect after send error:', disconnectError);
      }

      return ApiResponse.error(
        `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'SEND_ERROR'
      );
    }

    // Disconnect from provider
    try {
      await adapter.disconnect();
      console.log(`[Email Send API] Disconnected from ${provider}`);
    } catch (error) {
      console.warn('[Email Send API] Failed to disconnect cleanly:', error);
      // Don't fail the request if disconnect fails
    }

    // Prepare response
    const response: SendEmailResponse = {
      success: result.success,
      messageId: result.messageId,
      threadId: result.threadId,
      provider,
      timestamp: result.timestamp.toISOString(),
      error: result.error
    };

    const duration = Date.now() - startTime;
    console.log(`[Email Send API] Request completed in ${duration}ms`);

    // Return appropriate status based on result
    if (result.success) {
      return ApiResponse.success(response);
    } else {
      return ApiResponse.error(
        result.error?.message || 'Failed to send email',
        500,
        result.error?.code || 'SEND_ERROR'
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Email Send API] Unexpected error after ${duration}ms:`, error);
    return errorResponse(error);
  }
}

/**
 * Validate request body
 * 
 * @param body - Request body to validate
 * @returns Error message if validation fails, null otherwise
 */
function validateRequest(body: any): string | null {
  // Check provider
  if (!body.provider) {
    return 'Missing required field: provider';
  }

  const validProviders = ['smtp', 'gmail', 'outlook'];
  if (!validProviders.includes(body.provider)) {
    return `Invalid provider: ${body.provider}. Must be one of: ${validProviders.join(', ')}`;
  }

  // Check config
  if (!body.config) {
    return 'Missing required field: config';
  }

  if (typeof body.config !== 'object') {
    return 'Invalid config: must be an object';
  }

  // Validate config based on provider
  const { config } = body;

  // Check provider field in config matches
  if (config.provider !== body.provider) {
    return 'Provider mismatch between request and config';
  }

  // Validate credentials
  if (!config.credentials) {
    return 'Missing credentials in config';
  }

  if (typeof config.credentials !== 'object') {
    return 'Invalid credentials: must be an object';
  }

  const { credentials } = config;

  if (!credentials.type) {
    return 'Missing credentials type';
  }

  if (!['password', 'oauth2'].includes(credentials.type)) {
    return 'Invalid credentials type: must be "password" or "oauth2"';
  }

  // Validate password credentials
  if (credentials.type === 'password') {
    if (!credentials.username) {
      return 'Missing username in password credentials';
    }
    if (!credentials.password) {
      return 'Missing password in password credentials';
    }
  }

  // Validate OAuth2 credentials
  if (credentials.type === 'oauth2') {
    if (!credentials.accessToken) {
      return 'Missing accessToken in oauth2 credentials';
    }
  }

  // Validate SMTP specific config
  if (body.provider === 'smtp') {
    if (!config.host) {
      return 'Missing host in config for SMTP';
    }
    if (!config.port) {
      return 'Missing port in config for SMTP';
    }
    if (typeof config.port !== 'number') {
      return 'Invalid port: must be a number';
    }
  }

  // Check email or template
  if (!body.email && !body.template) {
    return 'Missing required field: email or template';
  }

  // Validate email if provided
  if (body.email) {
    const { email } = body;

    if (typeof email !== 'object') {
      return 'Invalid email: must be an object';
    }

    // Validate recipients
    if (!email.to || !Array.isArray(email.to) || email.to.length === 0) {
      return 'Missing or invalid recipients: to must be a non-empty array';
    }

    // Validate email addresses
    for (const addr of email.to) {
      if (!addr.address || typeof addr.address !== 'string') {
        return 'Invalid recipient address in to field';
      }
      if (!isValidEmail(addr.address)) {
        return `Invalid email address: ${addr.address}`;
      }
    }

    if (email.cc) {
      if (!Array.isArray(email.cc)) {
        return 'Invalid cc: must be an array';
      }
      for (const addr of email.cc) {
        if (!addr.address || typeof addr.address !== 'string') {
          return 'Invalid recipient address in cc field';
        }
        if (!isValidEmail(addr.address)) {
          return `Invalid email address: ${addr.address}`;
        }
      }
    }

    if (email.bcc) {
      if (!Array.isArray(email.bcc)) {
        return 'Invalid bcc: must be an array';
      }
      for (const addr of email.bcc) {
        if (!addr.address || typeof addr.address !== 'string') {
          return 'Invalid recipient address in bcc field';
        }
        if (!isValidEmail(addr.address)) {
          return `Invalid email address: ${addr.address}`;
        }
      }
    }

    // Validate subject (required if no template)
    if (!body.template && !email.subject) {
      return 'Missing required field: email.subject';
    }

    // Validate body (required if no template)
    if (!body.template && !email.body) {
      return 'Missing required field: email.body';
    }

    if (!body.template && email.body) {
      if (!email.body.text && !email.body.html) {
        return 'Email body must contain at least text or html';
      }
    }

    // Validate attachments if provided
    if (email.attachments) {
      if (!Array.isArray(email.attachments)) {
        return 'Invalid attachments: must be an array';
      }

      for (const att of email.attachments) {
        if (!att.filename || typeof att.filename !== 'string') {
          return 'Invalid attachment: filename is required';
        }
        if (!att.contentType || typeof att.contentType !== 'string') {
          return 'Invalid attachment: contentType is required';
        }
        if (!att.content || typeof att.content !== 'string') {
          return 'Invalid attachment: content is required';
        }
      }
    }
  }

  // Validate template if provided
  if (body.template) {
    const { template } = body;

    if (typeof template !== 'object') {
      return 'Invalid template: must be an object';
    }

    if (!template.subject || typeof template.subject !== 'string') {
      return 'Invalid template: subject is required';
    }

    if (!template.body || typeof template.body !== 'string') {
      return 'Invalid template: body is required';
    }

    if (!template.bodyType) {
      return 'Invalid template: bodyType is required';
    }

    const validBodyTypes = ['text', 'html', 'both'];
    if (!validBodyTypes.includes(template.bodyType)) {
      return `Invalid template bodyType: must be one of ${validBodyTypes.join(', ')}`;
    }

    if (template.data && typeof template.data !== 'object') {
      return 'Invalid template data: must be an object';
    }
  }

  return null;
}

/**
 * Validate email address format
 * 
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
