/**
 * Email Read API Route
 * 
 * POST /api/email/read
 * 
 * Fetches emails from configured email provider (IMAP/POP3/Gmail/Outlook)
 * with filtering and pagination support.
 */

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { getAdapter } from '@/lib/email-nodes/adapters';
import type { 
  ProviderConfig, 
  FetchOptions, 
  EmailMessage 
} from '@/lib/email-nodes/types';

export const dynamic = 'force-dynamic';

/**
 * Request body interface
 */
interface ReadEmailRequest {
  provider: 'imap' | 'pop3' | 'gmail' | 'outlook';
  config: ProviderConfig;
  options?: FetchOptions;
}

/**
 * Response interface
 */
interface ReadEmailResponse {
  emails: EmailMessage[];
  count: number;
  provider: string;
  timestamp: string;
}

/**
 * POST /api/email/read
 * 
 * Fetch emails from email provider
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authentication check
    const user = await getUser();
    if (!user) {
      console.warn('[Email Read API] Unauthorized access attempt');
      return ApiResponse.unauthorized();
    }

    console.log(`[Email Read API] Request from user: ${user.id}`);

    // Parse and validate request body
    let body: ReadEmailRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Email Read API] Invalid JSON in request body:', error);
      return ApiResponse.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const validationError = validateRequest(body);
    if (validationError) {
      console.warn('[Email Read API] Validation error:', validationError);
      return ApiResponse.badRequest(validationError);
    }

    const { provider, config, options = {} } = body;

    console.log(`[Email Read API] Fetching emails from provider: ${provider}`);
    console.log(`[Email Read API] Fetch options:`, {
      folder: options.folder,
      unreadOnly: options.unreadOnly,
      limit: options.limit,
      hasFilters: !!(options.sender || options.subject || options.dateRange)
    });

    // Get appropriate adapter for the provider
    let adapter;
    try {
      adapter = getAdapter(config);
    } catch (error) {
      console.error('[Email Read API] Failed to get adapter:', error);
      return ApiResponse.error(
        error instanceof Error ? error.message : 'Failed to initialize email adapter',
        500,
        'ADAPTER_ERROR'
      );
    }

    // Connect to email provider
    try {
      await adapter.connect(config);
      console.log(`[Email Read API] Connected to ${provider} successfully`);
    } catch (error) {
      console.error('[Email Read API] Connection failed:', error);
      return ApiResponse.error(
        `Failed to connect to ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503,
        'CONNECTION_ERROR'
      );
    }

    // Fetch emails
    let emails: EmailMessage[];
    try {
      emails = await adapter.fetchEmails(options);
      console.log(`[Email Read API] Fetched ${emails.length} emails successfully`);
    } catch (error) {
      console.error('[Email Read API] Failed to fetch emails:', error);
      
      // Disconnect before returning error
      try {
        await adapter.disconnect();
      } catch (disconnectError) {
        console.error('[Email Read API] Failed to disconnect after fetch error:', disconnectError);
      }

      return ApiResponse.error(
        `Failed to fetch emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'FETCH_ERROR'
      );
    }

    // Disconnect from provider
    try {
      await adapter.disconnect();
      console.log(`[Email Read API] Disconnected from ${provider}`);
    } catch (error) {
      console.warn('[Email Read API] Failed to disconnect cleanly:', error);
      // Don't fail the request if disconnect fails
    }

    // Prepare response
    const response: ReadEmailResponse = {
      emails,
      count: emails.length,
      provider,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - startTime;
    console.log(`[Email Read API] Request completed successfully in ${duration}ms`);

    return ApiResponse.success(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Email Read API] Unexpected error after ${duration}ms:`, error);
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

  const validProviders = ['imap', 'pop3', 'gmail', 'outlook'];
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

  // Validate IMAP/POP3/SMTP specific config
  if (['imap', 'pop3', 'smtp'].includes(body.provider)) {
    if (!config.host) {
      return `Missing host in config for ${body.provider}`;
    }
    if (!config.port) {
      return `Missing port in config for ${body.provider}`;
    }
    if (typeof config.port !== 'number') {
      return 'Invalid port: must be a number';
    }
  }

  // Validate options if provided
  if (body.options) {
    if (typeof body.options !== 'object') {
      return 'Invalid options: must be an object';
    }

    const { options } = body;

    // Validate limit
    if (options.limit !== undefined) {
      if (typeof options.limit !== 'number' || options.limit < 1) {
        return 'Invalid limit: must be a positive number';
      }
      if (options.limit > 1000) {
        return 'Invalid limit: maximum is 1000';
      }
    }

    // Validate offset
    if (options.offset !== undefined) {
      if (typeof options.offset !== 'number' || options.offset < 0) {
        return 'Invalid offset: must be a non-negative number';
      }
    }

    // Validate batchSize
    if (options.batchSize !== undefined) {
      if (typeof options.batchSize !== 'number' || options.batchSize < 1) {
        return 'Invalid batchSize: must be a positive number';
      }
      if (options.batchSize > 100) {
        return 'Invalid batchSize: maximum is 100';
      }
    }

    // Validate dateRange
    if (options.dateRange) {
      if (typeof options.dateRange !== 'object') {
        return 'Invalid dateRange: must be an object';
      }

      if (options.dateRange.start && !(options.dateRange.start instanceof Date || typeof options.dateRange.start === 'string')) {
        return 'Invalid dateRange.start: must be a Date or ISO string';
      }

      if (options.dateRange.end && !(options.dateRange.end instanceof Date || typeof options.dateRange.end === 'string')) {
        return 'Invalid dateRange.end: must be a Date or ISO string';
      }
    }
  }

  return null;
}
