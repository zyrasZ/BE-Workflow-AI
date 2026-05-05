/**
 * Email Templates API - CRUD Routes
 * 
 * Handles CRUD operations for email templates
 * 
 * Routes:
 * - GET /api/email/templates - List all email templates for authenticated user
 * - POST /api/email/templates - Create new email template
 * - PATCH /api/email/templates/[id] - Update email template
 * - DELETE /api/email/templates/[id] - Delete email template
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Email template types
 */
interface CreateEmailTemplateRequest {
  name: string;
  description?: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  body_type: 'text' | 'html' | 'both';
  variables?: string[];
  category?: string;
  tags?: string[];
}

interface UpdateEmailTemplateRequest {
  name?: string;
  description?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
  body_type?: 'text' | 'html' | 'both';
  variables?: string[];
  category?: string;
  tags?: string[];
  is_active?: boolean;
}

interface EmailTemplateResponse {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  body_type: string;
  variables: string[];
  category: string | null;
  tags: string[];
  usage_count: number;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/email/templates
 * List all email templates for authenticated user
 */
export async function GET(request: NextRequest) {
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
    
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const is_active = searchParams.get('is_active');
    const search = searchParams.get('search');
    
    // Build query
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true');
    }
    
    // Apply search filter (name or description)
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    // Execute query
    const { data: templates, error: queryError } = await query;
    
    if (queryError) {
      console.error('Error fetching email templates:', queryError);
      return NextResponse.json(
        { error: 'Database error', message: queryError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      templates,
      count: templates.length
    });
    
  } catch (error) {
    console.error('Error in GET /api/email/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/templates
 * Create new email template
 */
export async function POST(request: NextRequest) {
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
    
    // Parse request body
    const body: CreateEmailTemplateRequest = await request.json();
    
    // Validate required fields
    if (!body.name || !body.subject || !body.body_type) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Missing required fields: name, subject, body_type' },
        { status: 400 }
      );
    }
    
    // Validate body_type
    const validBodyTypes = ['text', 'html', 'both'];
    if (!validBodyTypes.includes(body.body_type)) {
      return NextResponse.json(
        { error: 'Validation error', message: `Invalid body_type. Must be one of: ${validBodyTypes.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validate body content based on body_type
    if (body.body_type === 'text' && !body.body_text) {
      return NextResponse.json(
        { error: 'Validation error', message: 'body_text is required when body_type is "text"' },
        { status: 400 }
      );
    }
    
    if (body.body_type === 'html' && !body.body_html) {
      return NextResponse.json(
        { error: 'Validation error', message: 'body_html is required when body_type is "html"' },
        { status: 400 }
      );
    }
    
    if (body.body_type === 'both' && (!body.body_text || !body.body_html)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Both body_text and body_html are required when body_type is "both"' },
        { status: 400 }
      );
    }
    
    // Insert into database
    const { data: template, error: insertError } = await supabase
      .from('email_templates')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        subject: body.subject,
        body_text: body.body_text || null,
        body_html: body.body_html || null,
        body_type: body.body_type,
        variables: body.variables || [],
        category: body.category || null,
        tags: body.tags || [],
        is_active: true
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error inserting email template:', insertError);
      
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict', message: 'A template with this name already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: 'Database error', message: insertError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      template,
      message: 'Email template created successfully'
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error in POST /api/email/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/email/templates/[id]
 * Update email template
 */
export async function PATCH(request: NextRequest) {
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
    
    // Extract template ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const templateId = pathParts[pathParts.length - 1];
    
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
                      body.body_text !== undefined || body.body_html !== undefined || 
                      body.body_type || body.variables || body.category !== undefined || 
                      body.tags || body.is_active !== undefined;
    
    if (!hasUpdate) {
      return NextResponse.json(
        { error: 'Validation error', message: 'At least one field must be provided for update' },
        { status: 400 }
      );
    }
    
    // Validate body_type if provided
    if (body.body_type) {
      const validBodyTypes = ['text', 'html', 'both'];
      if (!validBodyTypes.includes(body.body_type)) {
        return NextResponse.json(
          { error: 'Validation error', message: `Invalid body_type. Must be one of: ${validBodyTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Build update object
    const updateData: any = {};
    
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.subject) updateData.subject = body.subject;
    if (body.body_text !== undefined) updateData.body_text = body.body_text;
    if (body.body_html !== undefined) updateData.body_html = body.body_html;
    if (body.body_type) updateData.body_type = body.body_type;
    if (body.variables) updateData.variables = body.variables;
    if (body.category !== undefined) updateData.category = body.category;
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
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not found', message: 'Email template not found' },
          { status: 404 }
        );
      }
      
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
      message: 'Email template updated successfully'
    });
    
  } catch (error) {
    console.error('Error in PATCH /api/email/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/templates/[id]
 * Delete email template
 */
export async function DELETE(request: NextRequest) {
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
    
    // Extract template ID from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const templateId = pathParts[pathParts.length - 1];
    
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
    console.error('Error in DELETE /api/email/templates:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
