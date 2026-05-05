/**
 * Email Template API Route
 * 
 * POST /api/email/template
 * 
 * Renders email templates with dynamic data using Handlebars template engine.
 * Supports variable substitution, conditionals, loops, and helper functions.
 */

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { ApiResponse } from '@/lib/utils/response';
import { errorResponse } from '@/lib/utils/errors';
import { renderEmail, validateTemplate } from '@/lib/email-nodes/template';
import type { 
  EmailTemplate,
  RenderedEmail
} from '@/lib/email-nodes/types';

export const dynamic = 'force-dynamic';

/**
 * Request body interface
 */
interface RenderTemplateRequest {
  template: EmailTemplate;
  data: Record<string, any>;
  validateOnly?: boolean;
}

/**
 * Response interface for rendering
 */
interface RenderTemplateResponse {
  subject: string;
  text?: string;
  html?: string;
  timestamp: string;
}

/**
 * Response interface for validation
 */
interface ValidateTemplateResponse {
  valid: boolean;
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
  timestamp: string;
}

/**
 * POST /api/email/template
 * 
 * Render email template with data or validate template syntax
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authentication check
    const user = await getUser();
    if (!user) {
      console.warn('[Email Template API] Unauthorized access attempt');
      return ApiResponse.unauthorized();
    }

    console.log(`[Email Template API] Request from user: ${user.id}`);

    // Parse and validate request body
    let body: RenderTemplateRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('[Email Template API] Invalid JSON in request body:', error);
      return ApiResponse.badRequest('Invalid JSON in request body');
    }

    // Validate required fields
    const validationError = validateRequest(body);
    if (validationError) {
      console.warn('[Email Template API] Validation error:', validationError);
      return ApiResponse.badRequest(validationError);
    }

    const { template, data, validateOnly } = body;

    // If validateOnly mode, just validate template syntax
    if (validateOnly) {
      console.log('[Email Template API] Validating template syntax only');

      try {
        // Validate subject template
        const subjectValidation = validateTemplate(template.subject);
        
        // Validate body template
        const bodyValidation = validateTemplate(template.body);

        // Combine validation results
        const allErrors = [
          ...subjectValidation.errors.map(err => ({ ...err, field: 'subject' })),
          ...bodyValidation.errors.map(err => ({ ...err, field: 'body' }))
        ];

        const isValid = subjectValidation.valid && bodyValidation.valid;

        const response: ValidateTemplateResponse = {
          valid: isValid,
          errors: allErrors,
          timestamp: new Date().toISOString()
        };

        const duration = Date.now() - startTime;
        console.log(`[Email Template API] Validation completed in ${duration}ms: ${isValid ? 'valid' : 'invalid'}`);

        return ApiResponse.success(response);
      } catch (error) {
        console.error('[Email Template API] Validation failed:', error);
        return ApiResponse.error(
          `Failed to validate template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          500,
          'VALIDATION_ERROR'
        );
      }
    }

    // Render template with data
    console.log('[Email Template API] Rendering template with data');

    let rendered: RenderedEmail;
    try {
      rendered = renderEmail(template, data);
      console.log('[Email Template API] Template rendered successfully');
    } catch (error) {
      console.error('[Email Template API] Template rendering failed:', error);
      return ApiResponse.error(
        `Failed to render template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        400,
        'RENDER_ERROR'
      );
    }

    // Prepare response
    const response: RenderTemplateResponse = {
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - startTime;
    console.log(`[Email Template API] Request completed successfully in ${duration}ms`);

    return ApiResponse.success(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Email Template API] Unexpected error after ${duration}ms:`, error);
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
  // Check template
  if (!body.template) {
    return 'Missing required field: template';
  }

  if (typeof body.template !== 'object') {
    return 'Invalid template: must be an object';
  }

  const { template } = body;

  // Validate subject
  if (!template.subject) {
    return 'Missing required field: template.subject';
  }

  if (typeof template.subject !== 'string') {
    return 'Invalid template.subject: must be a string';
  }

  // Validate body
  if (!template.body) {
    return 'Missing required field: template.body';
  }

  if (typeof template.body !== 'string') {
    return 'Invalid template.body: must be a string';
  }

  // Validate bodyType
  if (!template.bodyType) {
    return 'Missing required field: template.bodyType';
  }

  const validBodyTypes = ['text', 'html', 'both'];
  if (!validBodyTypes.includes(template.bodyType)) {
    return `Invalid template.bodyType: must be one of ${validBodyTypes.join(', ')}`;
  }

  // Check data (required unless validateOnly mode)
  if (!body.validateOnly) {
    if (!body.data) {
      return 'Missing required field: data (or set validateOnly: true)';
    }

    if (typeof body.data !== 'object') {
      return 'Invalid data: must be an object';
    }
  }

  // Validate validateOnly flag if present
  if (body.validateOnly !== undefined && typeof body.validateOnly !== 'boolean') {
    return 'Invalid validateOnly: must be a boolean';
  }

  return null;
}
