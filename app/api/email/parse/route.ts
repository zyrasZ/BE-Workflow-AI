/**
 * Email Parse API Route
 * 
 * POST /api/email/parse
 * 
 * Parses raw email content (MIME format) into structured EmailMessage format.
 * Extracts headers, body (text/HTML), attachments, and metadata.
 */

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { parseEmail } from '@/lib/email-nodes/parser';
import type { 
  RawEmail,
  EmailMessage
} from '@/lib/email-nodes/types';

export const dynamic = 'force-dynamic';

/**
 * Request body interface
 */
interface ParseEmailRequest {
  rawEmail: {
    uid: number | string;
    source: string; // Raw MIME content
    flags?: string[];
    internalDate?: string; // ISO date string
    size?: number;
  };
  provider?: 'imap' | 'pop3' | 'gmail' | 'outlook';
}

/**
 * Response interface
 */
interface ParseEmailResponse {
  email: EmailMessage;
  timestamp: string;
}

/**
 * POST /api/email/parse
 * 
 * Parse raw email content into structured format
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authentication check
    const user = await getUser();
    if (!user) {
      console.warn('[Email Parse API] Unauthorized access attempt');
      return ApiResponse.unauthorized();
    }

    console.log(`[Email Parse API] Request from user: ${user.id}`);

    // Parse and validate request body
    let body: ParseEmailRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Email Parse API] Invalid JSON in request body:', error);
      return ApiResponse.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const validationError = validateRequest(body);
    if (validationError) {
      console.warn('[Email Parse API] Validation error:', validationError);
      return ApiResponse.badRequest(validationError);
    }

    const { rawEmail, provider = 'imap' } = body;

    console.log('[Email Parse API] Parsing email:', {
      uid: rawEmail.uid,
      size: rawEmail.size || rawEmail.source.length,
      provider,
      hasFlags: !!rawEmail.flags
    });

    // Prepare RawEmail object
    const rawEmailData: RawEmail = {
      uid: rawEmail.uid,
      source: rawEmail.source,
      flags: rawEmail.flags || [],
      internalDate: rawEmail.internalDate ? new Date(rawEmail.internalDate) : new Date(),
      size: rawEmail.size || rawEmail.source.length
    };

    // Parse email
    let parsedEmail: EmailMessage;
    try {
      parsedEmail = await parseEmail(rawEmailData, provider);
      console.log('[Email Parse API] Email parsed successfully:', {
        id: parsedEmail.id,
        from: parsedEmail.headers.from.address,
        subject: parsedEmail.headers.subject,
        attachmentCount: parsedEmail.attachments.length,
        hasParsingErrors: !!parsedEmail.parsingErrors
      });
    } catch (error) {
      console.error('[Email Parse API] Parsing failed:', error);
      return ApiResponse.error(
        `Failed to parse email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        400,
        'PARSE_ERROR'
      );
    }

    // Prepare response
    const response: ParseEmailResponse = {
      email: parsedEmail,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - startTime;
    console.log(`[Email Parse API] Request completed successfully in ${duration}ms`);

    return ApiResponse.success(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Email Parse API] Unexpected error after ${duration}ms:`, error);
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
  // Check rawEmail
  if (!body.rawEmail) {
    return 'Missing required field: rawEmail';
  }

  if (typeof body.rawEmail !== 'object') {
    return 'Invalid rawEmail: must be an object';
  }

  const { rawEmail } = body;

  // Validate uid
  if (rawEmail.uid === undefined || rawEmail.uid === null) {
    return 'Missing required field: rawEmail.uid';
  }

  if (typeof rawEmail.uid !== 'string' && typeof rawEmail.uid !== 'number') {
    return 'Invalid rawEmail.uid: must be a string or number';
  }

  // Validate source
  if (!rawEmail.source) {
    return 'Missing required field: rawEmail.source';
  }

  if (typeof rawEmail.source !== 'string') {
    return 'Invalid rawEmail.source: must be a string';
  }

  if (rawEmail.source.trim().length === 0) {
    return 'Invalid rawEmail.source: cannot be empty';
  }

  // Validate flags if provided
  if (rawEmail.flags !== undefined) {
    if (!Array.isArray(rawEmail.flags)) {
      return 'Invalid rawEmail.flags: must be an array';
    }

    for (let i = 0; i < rawEmail.flags.length; i++) {
      if (typeof rawEmail.flags[i] !== 'string') {
        return `Invalid flag at index ${i}: must be a string`;
      }
    }
  }

  // Validate internalDate if provided
  if (rawEmail.internalDate !== undefined) {
    if (typeof rawEmail.internalDate !== 'string') {
      return 'Invalid rawEmail.internalDate: must be an ISO date string';
    }

    // Try to parse date
    const date = new Date(rawEmail.internalDate);
    if (isNaN(date.getTime())) {
      return 'Invalid rawEmail.internalDate: must be a valid ISO date string';
    }
  }

  // Validate size if provided
  if (rawEmail.size !== undefined) {
    if (typeof rawEmail.size !== 'number') {
      return 'Invalid rawEmail.size: must be a number';
    }

    if (rawEmail.size < 0) {
      return 'Invalid rawEmail.size: must be non-negative';
    }
  }

  // Validate provider if provided
  if (body.provider !== undefined) {
    const validProviders = ['imap', 'pop3', 'gmail', 'outlook'];
    if (!validProviders.includes(body.provider)) {
      return `Invalid provider: must be one of ${validProviders.join(', ')}`;
    }
  }

  return null;
}
