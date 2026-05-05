/**
 * Email Filter API Route
 * 
 * POST /api/email/filter
 * 
 * Filters emails based on various criteria (sender, subject, body, date, attachments, flags, labels)
 * with AND/OR logic support.
 */

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { filterEmails } from '@/lib/email-nodes/filter';
import type { 
  EmailMessage,
  FilterConfig,
  FilterResult
} from '@/lib/email-nodes/types';

export const dynamic = 'force-dynamic';

/**
 * Request body interface
 */
interface FilterEmailRequest {
  emails: EmailMessage[];
  config: FilterConfig;
}

/**
 * Response interface
 */
interface FilterEmailResponse {
  matched: EmailMessage[];
  unmatched: EmailMessage[];
  matchedCount: number;
  unmatchedCount: number;
  totalCount: number;
  timestamp: string;
}

/**
 * POST /api/email/filter
 * 
 * Filter emails based on configuration
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authentication check
    const user = await getUser();
    if (!user) {
      console.warn('[Email Filter API] Unauthorized access attempt');
      return ApiResponse.unauthorized();
    }

    console.log(`[Email Filter API] Request from user: ${user.id}`);

    // Parse and validate request body
    let body: FilterEmailRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Email Filter API] Invalid JSON in request body:', error);
      return ApiResponse.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const validationError = validateRequest(body);
    if (validationError) {
      console.warn('[Email Filter API] Validation error:', validationError);
      return ApiResponse.badRequest(validationError);
    }

    const { emails, config } = body;

    console.log(`[Email Filter API] Filtering ${emails.length} emails with ${config.rules.length} rules (${config.logic} logic)`);

    // Apply filter
    let result: FilterResult;
    try {
      result = filterEmails(emails, config);
      console.log(`[Email Filter API] Filter result: ${result.matched.length} matched, ${result.unmatched.length} unmatched`);
    } catch (error) {
      console.error('[Email Filter API] Filter execution failed:', error);
      return ApiResponse.error(
        `Failed to filter emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'FILTER_ERROR'
      );
    }

    // Prepare response
    const response: FilterEmailResponse = {
      matched: result.matched,
      unmatched: result.unmatched,
      matchedCount: result.matched.length,
      unmatchedCount: result.unmatched.length,
      totalCount: emails.length,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - startTime;
    console.log(`[Email Filter API] Request completed successfully in ${duration}ms`);

    return ApiResponse.success(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Email Filter API] Unexpected error after ${duration}ms:`, error);
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
  // Check emails
  if (!body.emails) {
    return 'Missing required field: emails';
  }

  if (!Array.isArray(body.emails)) {
    return 'Invalid emails: must be an array';
  }

  // Validate each email has required structure
  for (let i = 0; i < body.emails.length; i++) {
    const email = body.emails[i];
    
    if (!email || typeof email !== 'object') {
      return `Invalid email at index ${i}: must be an object`;
    }

    if (!email.id) {
      return `Invalid email at index ${i}: missing id`;
    }

    if (!email.headers || typeof email.headers !== 'object') {
      return `Invalid email at index ${i}: missing or invalid headers`;
    }

    if (!email.body || typeof email.body !== 'object') {
      return `Invalid email at index ${i}: missing or invalid body`;
    }

    if (!email.attachments || !Array.isArray(email.attachments)) {
      return `Invalid email at index ${i}: missing or invalid attachments array`;
    }

    if (!email.metadata || typeof email.metadata !== 'object') {
      return `Invalid email at index ${i}: missing or invalid metadata`;
    }

    if (!email.flags || typeof email.flags !== 'object') {
      return `Invalid email at index ${i}: missing or invalid flags`;
    }
  }

  // Check config
  if (!body.config) {
    return 'Missing required field: config';
  }

  if (typeof body.config !== 'object') {
    return 'Invalid config: must be an object';
  }

  const { config } = body;

  // Validate rules
  if (!config.rules) {
    return 'Missing required field: config.rules';
  }

  if (!Array.isArray(config.rules)) {
    return 'Invalid config.rules: must be an array';
  }

  if (config.rules.length === 0) {
    return 'Invalid config.rules: must contain at least one rule';
  }

  // Validate each rule
  const validFields = ['from', 'to', 'subject', 'body', 'date', 'attachment', 'label', 'category', 'flag'];
  const validOperators = ['equals', 'contains', 'startsWith', 'endsWith', 'matches', 'before', 'after', 'between'];

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];

    if (!rule || typeof rule !== 'object') {
      return `Invalid rule at index ${i}: must be an object`;
    }

    if (!rule.field) {
      return `Invalid rule at index ${i}: missing field`;
    }

    if (!validFields.includes(rule.field)) {
      return `Invalid rule at index ${i}: field must be one of ${validFields.join(', ')}`;
    }

    if (!rule.operator) {
      return `Invalid rule at index ${i}: missing operator`;
    }

    if (!validOperators.includes(rule.operator)) {
      return `Invalid rule at index ${i}: operator must be one of ${validOperators.join(', ')}`;
    }

    if (rule.value === undefined || rule.value === null) {
      return `Invalid rule at index ${i}: missing value`;
    }

    // Validate date operators have date values
    if (['before', 'after', 'between'].includes(rule.operator)) {
      if (rule.operator === 'between') {
        if (typeof rule.value !== 'object' || !rule.value.start || !rule.value.end) {
          return `Invalid rule at index ${i}: between operator requires value with start and end dates`;
        }
      }
    }
  }

  // Validate logic
  if (!config.logic) {
    return 'Missing required field: config.logic';
  }

  if (!['AND', 'OR'].includes(config.logic)) {
    return 'Invalid config.logic: must be "AND" or "OR"';
  }

  return null;
}
