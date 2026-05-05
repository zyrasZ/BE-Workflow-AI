/**
 * Email Template Utilities
 * 
 * Provides utilities for email template processing:
 * - Variable extraction from {{variableName}} syntax
 * - Template syntax validation
 * - Template rendering with variable substitution
 * 
 * Requirements: 28 (Template Management)
 */

/**
 * Extract variable names from template content
 * 
 * Requirement 28.3: Extract and store variable names from template content
 * 
 * Finds all {{variableName}} placeholders in the template and returns unique variable names
 * 
 * @param template - Template string with {{variable}} placeholders
 * @returns Array of unique variable names
 */
export function extractVariables(template: string): string[] {
  // Match {{variableName}} pattern
  // Variable names must start with letter or underscore, followed by alphanumeric or underscore
  const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  
  const variables = new Set<string>();
  let match;
  
  while ((match = variableRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables).sort();
}

/**
 * Validation result for template syntax
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate template syntax
 * 
 * Requirement 28.7: Validate template syntax when templates are saved
 * 
 * Checks for:
 * - Matching braces (no unclosed {{)
 * - Valid variable names (alphanumeric and underscore only)
 * - No nested variables
 * 
 * @param template - Template string to validate
 * @returns Validation result with errors and warnings
 */
export function validateTemplateSyntax(template: string): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for unmatched opening braces
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;
  
  if (openBraces !== closeBraces) {
    errors.push(`Unmatched braces: ${openBraces} opening {{ and ${closeBraces} closing }}`);
  }
  
  // Check for invalid variable syntax
  // Valid: {{variableName}}
  // Invalid: {{ variableName }} (spaces), {{123invalid}} (starts with number), {{nested{{var}}}}
  const invalidVariableRegex = /\{\{([^}]*)\}\}/g;
  let match;
  
  while ((match = invalidVariableRegex.exec(template)) !== null) {
    const content = match[1];
    
    // Check for spaces
    if (content.includes(' ')) {
      errors.push(`Invalid variable syntax: "{{${content}}}" contains spaces. Remove spaces around variable name.`);
      continue;
    }
    
    // Check for nested braces
    if (content.includes('{') || content.includes('}')) {
      errors.push(`Invalid variable syntax: "{{${content}}}" contains nested braces. Variables cannot be nested.`);
      continue;
    }
    
    // Check for valid variable name (must start with letter or underscore)
    const validNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validNameRegex.test(content)) {
      errors.push(`Invalid variable name: "{{${content}}}". Variable names must start with a letter or underscore, followed by letters, numbers, or underscores.`);
    }
  }
  
  // Check for single braces (potential typo)
  const singleOpenBrace = template.match(/\{(?!\{)/g);
  const singleCloseBrace = template.match(/(?<!\})\}/g);
  
  if (singleOpenBrace && singleOpenBrace.length > 0) {
    warnings.push(`Found ${singleOpenBrace.length} single opening brace(s) "{". Did you mean "{{" for a variable?`);
  }
  
  if (singleCloseBrace && singleCloseBrace.length > 0) {
    warnings.push(`Found ${singleCloseBrace.length} single closing brace(s) "}". Did you mean "}}" for a variable?`);
  }
  
  // Warn if no variables found
  const variables = extractVariables(template);
  if (variables.length === 0) {
    warnings.push('No variables found in template. Template will be static.');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Render template with variable substitution
 * 
 * Requirement 28.6: Provide a template preview feature with sample data
 * 
 * Replaces {{variableName}} placeholders with values from data object
 * 
 * @param template - Template string with {{variable}} placeholders
 * @param data - Object with variable values
 * @param options - Rendering options
 * @returns Rendered template string
 */
export function renderTemplate(
  template: string,
  data: Record<string, any>,
  options: {
    missingVariableStrategy?: 'empty' | 'keep' | 'error';
  } = {}
): string {
  const { missingVariableStrategy = 'empty' } = options;
  
  return template.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (match, variableName) => {
    if (variableName in data) {
      const value = data[variableName];
      
      // Convert value to string
      if (value === null || value === undefined) {
        return '';
      }
      
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      
      return String(value);
    }
    
    // Handle missing variables
    switch (missingVariableStrategy) {
      case 'keep':
        return match; // Keep {{variableName}} as-is
      case 'error':
        throw new Error(`Missing variable: ${variableName}`);
      case 'empty':
      default:
        return ''; // Replace with empty string
    }
  });
}

/**
 * Validate template content (subject and body)
 * 
 * Validates both subject and body templates and combines results
 * 
 * @param subject - Subject template
 * @param body - Body template
 * @returns Combined validation result
 */
export function validateTemplateContent(
  subject: string,
  body: string
): TemplateValidationResult {
  const subjectValidation = validateTemplateSyntax(subject);
  const bodyValidation = validateTemplateSyntax(body);
  
  return {
    valid: subjectValidation.valid && bodyValidation.valid,
    errors: [
      ...subjectValidation.errors.map(err => `Subject: ${err}`),
      ...bodyValidation.errors.map(err => `Body: ${err}`)
    ],
    warnings: [
      ...subjectValidation.warnings.map(warn => `Subject: ${warn}`),
      ...bodyValidation.warnings.map(warn => `Body: ${warn}`)
    ]
  };
}

/**
 * Extract all variables from subject and body
 * 
 * @param subject - Subject template
 * @param body - Body template
 * @returns Array of unique variable names from both templates
 */
export function extractAllVariables(subject: string, body: string): string[] {
  const subjectVars = extractVariables(subject);
  const bodyVars = extractVariables(body);
  
  // Combine and deduplicate
  const allVars = new Set([...subjectVars, ...bodyVars]);
  return Array.from(allVars).sort();
}
