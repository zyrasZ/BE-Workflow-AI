/**
 * Email Templates API - CRUD Routes
 * 
 * Handles CRUD operations for email templates
 * 
 * Routes:
 * - GET /api/email/templates - List all email templates for authenticated user
 * - POST /api/email/templates - Create new email template
 * 
 * Individual template operations are in /api/email/templates/[id]/route.ts
 * 
 * Requirements: 28 (Template Management)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  extractAllVariables,
  validateTemplateContent
} from '@/lib/email/template-utils';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * Email template types
 */
interface CreateEmailTemplateRequest {
  name: string;
  description?: string;
  subject: string;
  body: string;
  format: 'text' | 'html';
  tags?: string[];
}

/**
 * GET /api/email/templates
 * List all email templates for authenticated user
 * 
 * Requirement 28.1: Provide APIs to read Email_Template definitions
 * 
 * Query parameters:
 * - search: Search in name or description
 * - tags: Filter by tags (comma-separated)
 * - format: Filter by format (text or html)
 * - is_active: Filter by active status (true or false)
 * - sort: Sort field (name, created_at, updated_at, usage_count, last_used_at)
 * - order: Sort order (asc or desc)
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
    const search = searchParams.get('search');
    const tags = searchParams.get('tags');
    const format = searchParams.get('format');
    const is_active = searchParams.get('is_active');
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';
    
    // Build query
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('user_id', user.id);
    
    // Apply filters
    if (format && ['text', 'html'].includes(format)) {
      query = query.eq('format', format);
    }
    
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true');
    }
    
    // Apply search filter (name or description)
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    // Apply tags filter
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      // Filter templates that contain any of the specified tags
      query = query.contains('tags', tagList);
    }
    
    // Apply sorting
    const validSortFields = ['name', 'created_at', 'updated_at', 'usage_count', 'last_used_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const ascending = order === 'asc';
    
    query = query.order(sortField, { ascending });
    
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
 * 
 * Requirement 28.1: Provide APIs to create Email_Template definitions
 * Requirement 28.2: Store template subject and body content
 * Requirement 28.3: Extract and store variable names from template content
 * Requirement 28.4: Support categorizing templates with tags
 * Requirement 28.7: Validate template syntax when templates are saved
 * Requirement 28.8: Support both plain text and HTML template formats
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
    if (!body.name || !body.subject || !body.body || !body.format) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Missing required fields: name, subject, body, format' },
        { status: 400 }
      );
    }
    
    // Requirement 28.8: Validate format
    if (!['text', 'html'].includes(body.format)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid format. Must be "text" or "html"' },
        { status: 400 }
      );
    }
    
    // Requirement 28.7: Validate template syntax when templates are saved
    const validation = validateTemplateContent(body.subject, body.body);
    
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
    const variables = extractAllVariables(body.subject, body.body);
    
    // Insert into database
    const { data: template, error: insertError } = await supabase
      .from('email_templates')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        subject: body.subject,
        body: body.body,
        format: body.format,
        variables,
        tags: body.tags || [],
        is_active: true,
        usage_count: 0
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
      validation: {
        warnings: validation.warnings
      },
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
