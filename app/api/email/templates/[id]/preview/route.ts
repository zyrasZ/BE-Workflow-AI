/**
 * Email Template Preview API
 * 
 * Provides template preview with sample data
 * 
 * Routes:
 * - POST /api/email/templates/[id]/preview - Preview template with sample data
 * 
 * Requirements: 28.6 (Template preview feature)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/email/template-utils';

/**
 * Preview request body
 */
interface PreviewRequest {
  data: Record<string, any>;
  missingVariableStrategy?: 'empty' | 'keep' | 'error';
}

/**
 * POST /api/email/templates/[id]/preview
 * Preview template with sample data
 * 
 * Requirement 28.6: Provide a template preview feature with sample data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const templateId = (await params).id;
    // Get authenticated user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(templateId)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'Invalid template ID format' },
        { status: 400 }
      );
    }
    
    // Parse request body
    const body: PreviewRequest = await request.json();
    
    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json(
        { error: 'Validation error', message: 'Request body must include "data" object with variable values' },
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
    
    // Render template with provided data
    try {
      const renderedSubject = renderTemplate(
        template.subject,
        body.data,
        { missingVariableStrategy: body.missingVariableStrategy || 'empty' }
      );
      
      const renderedBody = renderTemplate(
        template.body,
        body.data,
        { missingVariableStrategy: body.missingVariableStrategy || 'empty' }
      );
      
      // Identify missing variables
      const providedVariables = Object.keys(body.data);
      const requiredVariables = template.variables as string[];
      const missingVariables = requiredVariables.filter(
        (varName: string) => !providedVariables.includes(varName)
      );
      
      // Identify unused variables
      const unusedVariables = providedVariables.filter(
        varName => !requiredVariables.includes(varName)
      );
      
      return NextResponse.json({
        preview: {
          subject: renderedSubject,
          body: renderedBody,
          format: template.format
        },
        template: {
          id: template.id,
          name: template.name,
          variables: requiredVariables
        },
        analysis: {
          missingVariables,
          unusedVariables,
          allVariablesProvided: missingVariables.length === 0
        }
      });
      
    } catch (renderError) {
      // Handle rendering errors (e.g., missing variable with 'error' strategy)
      return NextResponse.json(
        {
          error: 'Rendering error',
          message: renderError instanceof Error ? renderError.message : 'Failed to render template'
        },
        { status: 400 }
      );
    }
    
  } catch (error) {
    console.error('Error in POST /api/email/templates/[id]/preview:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
