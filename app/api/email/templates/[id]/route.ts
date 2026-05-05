/**
 * Email Template API - Individual Template Routes
 * 
 * Handles operations on individual email templates
 * 
 * Routes:
 * - GET /api/email/templates/[id] - Get specific email template
 * - PATCH /api/email/templates/[id] - Update email template
 * - DELETE /api/email/templates/[id] - Delete email template
 * 
 * Requirements: 28 (Template Management)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  extractAllVariables,
  validateTemplateContent
} from '@/lib/email/template-utils';

/**
 * Email template update request
 */
interface UpdateEmailTemplateRequest {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  format?: 'text' | 'html';
  tags?: string[];
  is_active?: boolean;
}

/**
 * GET /api/email/templates/[id]
 * Get specific email template
 * 
 * Requirement 28.1: Provide APIs to read Email_Template definitions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const templateId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid template ID format' },
        { status: 400 }
      );
    }
    
    // Fetch template
    const { data: template, error: queryError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();
    
    if (queryError) {
      if (queryError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not found', message: 'Email template not found' },
          { status: 404 }
        );
      }
      
      console.error('Error fetching email template:', queryError);
      return NextResponse.json(
        { error: 'Database error', message: queryError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ template });
    
  } catch (error) {
    console.error('Error in GET /api/email/templates/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/email/templates/[id]
 * Update email template
 * 
 * Requirement 28.1: Provide APIs to update Email_Template definitions
 * Requirement 28.3: Extract and store variable names from template content
 * Requirement 28.7: Validate template syntax when templates are saved
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const templateId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid template ID format' },
        { status: 400 }
      );
    }
    
    // Parse request body
    const body: UpdateEmailTemplateRequest = await request.json();
    
    // Validate at least one field to update
    const hasUpdate = body.name || body.description !== undefined || body.subject || 
                      body.body || body.format || body.tags || body.is_active !== undefined;
    
    if (!hasUpdate) {
      return NextResponse.json(
        { error: 'Validation error', message: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }
    
    // Validate format if provided
    if (body.format && !['text', 'html'].includes(body.format)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid format. Must be "text" or "html"' },
        { status: 400 }
      );
    }
    
    // Fetch existing template to get current values
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not found', message: 'Email template not found' },
          { status: 404 }
        );
      }
      
      console.error('Error fetching email template:', fetchError);
      return NextResponse.json(
        { error: 'Database error', message: fetchError.message },
        { status: 500 }
      );
    }
    
    // Use existing values if not provided in update
    const finalSubject = body.subject || existingTemplate.subject;
    const finalBody = body.body || existingTemplate.body;
    
    // Requirement 28.7: Validate template syntax when templates are saved
    const validation = validateTemplateContent(finalSubject, finalBody);
    
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'Template syntax validation failed',
          errors: validation.errors,
          warnings: validation.warnings
        },
        { status: 400 }
      );
    }
    
    // Requirement 28.3: Extract and store variable names from template content
    const variables = extractAllVariables(finalSubject, finalBody);
    
    // Build update object
    const updateData: any = {
      variables // Always update variables when subject or body changes
    };
    
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.subject) updateData.subject = body.subject;
    if (body.body) updateData.body = body.body;
    if (body.format) updateData.format = body.format;
    if (body.tags) updateData.tags = body.tags;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    
    // Update template
    const { data: template, error: updateError } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', templateId)
      .eq('user_id', user.id)
      .select()
      .single();
    
    if (updateError) {
      // Handle unique constraint violation
      if (updateError.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict', message: 'A template with this name already exists' },
          { status: 409 }
        );
      }
      
      console.error('Error updating email template:', updateError);
      return NextResponse.json(
        { error: 'Database error', message: updateError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      template,
      validation: {
        warnings: validation.warnings
      },
      message: 'Email template updated successfully'
    });
    
  } catch (error) {
    console.error('Error in PATCH /api/email/templates/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/templates/[id]
 * Delete email template
 * 
 * Requirement 28.1: Provide APIs to delete Email_Template definitions
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const templateId = params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid template ID format' },
        { status: 400 }
      );
    }
    
    // Delete template
    const { error: deleteError } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', user.id);
    
    if (deleteError) {
      console.error('Error deleting email template:', deleteError);
      return NextResponse.json(
        { error: 'Database error', message: deleteError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      message: 'Email template deleted successfully'
    });
    
  } catch (error) {
    console.error('Error in DELETE /api/email/templates/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
