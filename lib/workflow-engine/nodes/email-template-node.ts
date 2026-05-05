/**
 * Email Template Node Implementation
 * 
 * Renders email templates with dynamic data using Handlebars template engine.
 * Supports variable substitution, conditionals, loops, and helper functions.
 * Can load templates from database or use inline definitions.
 * 
 * Requirement 16: Action Node - Email Template
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { renderEmail, validateTemplate } from '@/lib/email-nodes/template';
import { resolveExpressions, buildExpressionScope } from '../expression';
import type { 
  EmailTemplate,
  RenderedEmail
} from '@/lib/email-nodes/types';

/**
 * Email Template Node - Render email templates with variable substitution
 * 
 * Configuration:
 * - templateId: Template identifier to load from database (optional)
 * - template: Inline template definition (optional, used if templateId not provided)
 *   - subject: Template subject with {{variables}}
 *   - body: Template body with {{variables}}
 *   - bodyType: 'text' | 'html' | 'both'
 * - data: Data object with variable values (optional, uses context if not provided)
 * - failOnMissingVariable: Whether to fail when a variable is missing (default: false)
 * 
 * Requirement 16: Email Template Node SHALL accept a template identifier or inline template definition
 * Requirement 16: Email Template Node SHALL accept a data object with variable values
 */
export class EmailTemplateNode extends BaseNode {
  readonly type = 'email-template';

  /**
   * Execute the email template rendering logic
   * 
   * Requirement 16: Email Template Node SHALL load the template from the database or use the inline definition
   * Requirement 16: Email Template Node SHALL replace all variable placeholders in the template with values from the data object
   * Requirement 16: Email Template Node SHALL support variable syntax using double curly braces ({{variableName}})
   * Requirement 16: Email Template Node SHALL render both subject and body templates
   * Requirement 16: Email Template Node SHALL return the rendered email content (subject and body)
   * Requirement 16: When a variable is missing from the data object, Email Template Node SHALL either use an empty string or fail based on configuration
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Step 1: Get template (from database or inline)
      let template: EmailTemplate;

      if (config.templateId) {
        // Load template from database
        try {
          template = await this.loadTemplateFromDatabase(config.templateId, context.userId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return this.failure(`Failed to load template from database: ${message}`);
        }
      } else if (config.template) {
        // Use inline template definition
        template = {
          subject: config.template.subject,
          body: config.template.body,
          bodyType: config.template.bodyType || 'html'
        };
      } else {
        return this.failure('Either templateId or template must be provided');
      }

      // Step 2: Prepare data for template rendering
      let templateData: Record<string, any>;

      if (config.data) {
        // Use provided data and resolve any expressions within it
        const scope = buildExpressionScope(context.variables, context.nodeOutputs);
        templateData = resolveExpressions(config.data, scope);
      } else {
        // Use all available context data (variables + input + node outputs)
        templateData = {
          ...context.variables,
          ...input,
          // Add node outputs as a nested object for easy access
          nodes: Object.fromEntries(context.nodeOutputs)
        };
      }

      // Step 3: Check for missing variables if failOnMissingVariable is enabled
      if (config.failOnMissingVariable) {
        const missingVars = this.findMissingVariables(template, templateData);
        if (missingVars.length > 0) {
          return this.failure(
            `Missing required variables: ${missingVars.join(', ')}`,
            { missingVariables: missingVars }
          );
        }
      }

      // Step 4: Render the template
      let rendered: RenderedEmail;
      try {
        rendered = renderEmail(template, templateData);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to render template: ${message}`);
      }

      // Step 5: Return rendered email content
      return this.success({
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        bodyType: template.bodyType,
        timestamp: new Date().toISOString(),
        templateId: config.templateId,
        variablesUsed: Object.keys(templateData)
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Unexpected error in email template node: ${message}`);
    }
  }

  /**
   * Validate email template node configuration
   * 
   * Requirement 16: Email Template Node SHALL validate configuration before execution
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate that either templateId or template is provided
    if (!config.templateId && !config.template) {
      errors.push({
        field: 'templateId/template',
        message: 'Either templateId or template must be provided'
      });
    }

    // If both are provided, warn (templateId takes precedence)
    if (config.templateId && config.template) {
      errors.push({
        field: 'templateId/template',
        message: 'Both templateId and template provided; templateId will take precedence'
      });
    }

    // Validate inline template if provided
    if (config.template) {
      const templateValidation = this.validateInlineTemplate(config.template);
      errors.push(...templateValidation);
    }

    // Validate failOnMissingVariable if provided
    if (config.failOnMissingVariable !== undefined && typeof config.failOnMissingVariable !== 'boolean') {
      errors.push({
        field: 'failOnMissingVariable',
        message: 'failOnMissingVariable must be a boolean'
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate inline template configuration
   * 
   * @param template - Inline template configuration
   * @returns Array of validation errors
   */
  private validateInlineTemplate(template: any): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate subject
    if (!template.subject) {
      errors.push({
        field: 'template.subject',
        message: 'template.subject is required'
      });
    } else if (typeof template.subject !== 'string') {
      errors.push({
        field: 'template.subject',
        message: 'template.subject must be a string'
      });
    } else {
      // Validate subject template syntax
      const subjectValidation = validateTemplate(template.subject);
      if (!subjectValidation.valid) {
        errors.push({
          field: 'template.subject',
          message: `Invalid subject template syntax: ${subjectValidation.errors.map(e => e.message).join(', ')}`
        });
      }
    }

    // Validate body
    if (!template.body) {
      errors.push({
        field: 'template.body',
        message: 'template.body is required'
      });
    } else if (typeof template.body !== 'string') {
      errors.push({
        field: 'template.body',
        message: 'template.body must be a string'
      });
    } else {
      // Validate body template syntax
      const bodyValidation = validateTemplate(template.body);
      if (!bodyValidation.valid) {
        errors.push({
          field: 'template.body',
          message: `Invalid body template syntax: ${bodyValidation.errors.map(e => e.message).join(', ')}`
        });
      }
    }

    // Validate bodyType
    if (!template.bodyType) {
      errors.push({
        field: 'template.bodyType',
        message: 'template.bodyType is required'
      });
    } else {
      const validBodyTypes = ['text', 'html', 'both'];
      if (!validBodyTypes.includes(template.bodyType)) {
        errors.push({
          field: 'template.bodyType',
          message: `template.bodyType must be one of: ${validBodyTypes.join(', ')}`
        });
      }
    }

    return errors;
  }

  /**
   * Load template from database
   * 
   * Requirement 28.5: Track template usage count and last used date
   * 
   * @param templateId - Template identifier
   * @param userId - User ID for access control
   * @returns Email template
   */
  private async loadTemplateFromDatabase(templateId: string, userId: string): Promise<EmailTemplate> {
    // Import Supabase client
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = createServerClient();

    // Query template from database
    const { data, error } = await supabase
      .from('email_templates')
      .select('subject, body, format')
      .eq('id', templateId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Requirement 28.5: Track template usage count and last used date
    // Update usage tracking asynchronously (don't wait for it)
    // Wrap in async IIFE to handle promises properly
    (async () => {
      try {
        // Try RPC function first
        const { error: rpcError } = await supabase.rpc('increment_template_usage', { 
          template_id: templateId,
          user_id_param: userId 
        });
        
        if (rpcError) {
          // Fallback to manual update if RPC doesn't exist
          const { data: currentData } = await supabase
            .from('email_templates')
            .select('usage_count')
            .eq('id', templateId)
            .eq('user_id', userId)
            .single();
          
          if (currentData) {
            const newCount = (currentData.usage_count || 0) + 1;
            await supabase
              .from('email_templates')
              .update({
                usage_count: newCount,
                last_used_at: new Date().toISOString()
              })
              .eq('id', templateId)
              .eq('user_id', userId);
          }
        }
      } catch (err) {
        console.error('Failed to update template usage:', err);
      }
    })();

    // Map database fields to EmailTemplate interface
    return {
      subject: data.subject,
      body: data.body,
      bodyType: data.format as 'text' | 'html' | 'both'
    };
  }

  /**
   * Find missing variables in template
   * 
   * @param template - Email template
   * @param data - Data object with variable values
   * @returns Array of missing variable names
   */
  private findMissingVariables(template: EmailTemplate, data: Record<string, any>): string[] {
    const missingVars: string[] = [];

    // Extract variable names from template using regex
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const allTemplateText = `${template.subject} ${template.body}`;

    let match;
    const foundVars = new Set<string>();

    while ((match = variablePattern.exec(allTemplateText)) !== null) {
      // Extract variable name (remove whitespace and helper syntax)
      const varExpression = match[1].trim();
      
      // Skip Handlebars helpers and block expressions
      if (varExpression.startsWith('#') || varExpression.startsWith('/') || varExpression.startsWith('>')) {
        continue;
      }

      // Extract the base variable name (before any dots or spaces)
      const varName = varExpression.split(/[\s.]/)[0];
      
      if (varName && !foundVars.has(varName)) {
        foundVars.add(varName);
        
        // Check if variable exists in data
        if (!(varName in data)) {
          missingVars.push(varName);
        }
      }
    }

    return missingVars;
  }
}
