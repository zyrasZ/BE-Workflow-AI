/**
 * Unit Tests for Email Template Utilities
 * 
 * Tests variable extraction, template validation, and template rendering
 * 
 * Requirements: 28 (Template Management)
 */

import {
  extractVariables,
  validateTemplateSyntax,
  renderTemplate,
  validateTemplateContent,
  extractAllVariables
} from '../template-utils';

describe('extractVariables', () => {
  it('should extract single variable from template', () => {
    const template = 'Hello {{name}}!';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['name']);
  });

  it('should extract multiple variables from template', () => {
    const template = 'Hello {{firstName}} {{lastName}}! Your order {{orderId}} is ready.';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['firstName', 'lastName', 'orderId']);
  });

  it('should deduplicate repeated variables', () => {
    const template = 'Hello {{name}}! Welcome back, {{name}}.';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['name']);
  });

  it('should return empty array when no variables found', () => {
    const template = 'Hello! This is a static template.';
    const variables = extractVariables(template);
    
    expect(variables).toEqual([]);
  });

  it('should handle variables with underscores', () => {
    const template = 'Hello {{first_name}} {{last_name}}!';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['first_name', 'last_name']);
  });

  it('should handle variables starting with underscore', () => {
    const template = 'Value: {{_privateVar}}';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['_privateVar']);
  });

  it('should ignore invalid variable names', () => {
    const template = 'Hello {{123invalid}}! {{valid_name}}';
    const variables = extractVariables(template);
    
    // Only valid variable names are extracted
    expect(variables).toEqual(['valid_name']);
  });

  it('should sort variables alphabetically', () => {
    const template = '{{zebra}} {{apple}} {{banana}}';
    const variables = extractVariables(template);
    
    expect(variables).toEqual(['apple', 'banana', 'zebra']);
  });
});

describe('validateTemplateSyntax', () => {
  it('should validate correct template syntax', () => {
    const template = 'Hello {{name}}! Your order {{orderId}} is ready.';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should detect unmatched opening braces', () => {
    const template = 'Hello {{name! Missing closing braces.';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Unmatched braces');
  });

  it('should detect unmatched closing braces', () => {
    const template = 'Hello name}}! Extra closing braces.';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Unmatched braces');
  });

  it('should detect spaces in variable names', () => {
    const template = 'Hello {{ name }}!';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('contains spaces');
  });

  it('should detect nested braces', () => {
    const template = 'Hello {{{{nested}}}}!';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should detect invalid variable names starting with numbers', () => {
    const template = 'Hello {{123invalid}}!';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Invalid variable name');
  });

  it('should warn about single braces', () => {
    const template = 'Hello {name}! Use {{ for variables.';
    const result = validateTemplateSyntax(template);
    
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('single opening brace');
  });

  it('should warn when no variables found', () => {
    const template = 'Hello! This is a static template.';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('No variables found');
  });

  it('should validate multiple variables correctly', () => {
    const template = 'Hello {{firstName}} {{lastName}}! Order {{orderId}}.';
    const result = validateTemplateSyntax(template);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('renderTemplate', () => {
  it('should render template with single variable', () => {
    const template = 'Hello {{name}}!';
    const data = { name: 'Alice' };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello Alice!');
  });

  it('should render template with multiple variables', () => {
    const template = 'Hello {{firstName}} {{lastName}}!';
    const data = { firstName: 'Alice', lastName: 'Smith' };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello Alice Smith!');
  });

  it('should replace missing variables with empty string by default', () => {
    const template = 'Hello {{name}}! Your order {{orderId}} is ready.';
    const data = { name: 'Alice' };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello Alice! Your order  is ready.');
  });

  it('should keep missing variables when strategy is "keep"', () => {
    const template = 'Hello {{name}}! Your order {{orderId}} is ready.';
    const data = { name: 'Alice' };
    const rendered = renderTemplate(template, data, { missingVariableStrategy: 'keep' });
    
    expect(rendered).toBe('Hello Alice! Your order {{orderId}} is ready.');
  });

  it('should throw error for missing variables when strategy is "error"', () => {
    const template = 'Hello {{name}}! Your order {{orderId}} is ready.';
    const data = { name: 'Alice' };
    
    expect(() => {
      renderTemplate(template, data, { missingVariableStrategy: 'error' });
    }).toThrow('Missing variable: orderId');
  });

  it('should handle null values', () => {
    const template = 'Hello {{name}}!';
    const data = { name: null };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello !');
  });

  it('should handle undefined values', () => {
    const template = 'Hello {{name}}!';
    const data = { name: undefined };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello !');
  });

  it('should convert numbers to strings', () => {
    const template = 'Order {{orderId}} total: ${{amount}}';
    const data = { orderId: 12345, amount: 99.99 };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Order 12345 total: $99.99');
  });

  it('should convert objects to JSON strings', () => {
    const template = 'Data: {{data}}';
    const data = { data: { key: 'value' } };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Data: {"key":"value"}');
  });

  it('should handle repeated variables', () => {
    const template = 'Hello {{name}}! Welcome back, {{name}}.';
    const data = { name: 'Alice' };
    const rendered = renderTemplate(template, data);
    
    expect(rendered).toBe('Hello Alice! Welcome back, Alice.');
  });
});

describe('validateTemplateContent', () => {
  it('should validate both subject and body', () => {
    const subject = 'Order {{orderId}} Confirmation';
    const body = 'Hello {{name}}! Your order {{orderId}} is confirmed.';
    const result = validateTemplateContent(subject, body);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should report errors from subject', () => {
    const subject = 'Order {{orderId Confirmation';
    const body = 'Hello {{name}}!';
    const result = validateTemplateContent(subject, body);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Subject:');
  });

  it('should report errors from body', () => {
    const subject = 'Order {{orderId}} Confirmation';
    const body = 'Hello {{name!';
    const result = validateTemplateContent(subject, body);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Body:');
  });

  it('should report errors from both subject and body', () => {
    const subject = 'Order {{orderId Confirmation';
    const body = 'Hello {{name!';
    const result = validateTemplateContent(subject, body);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should combine warnings from both templates', () => {
    const subject = 'Static Subject';
    const body = 'Static Body';
    const result = validateTemplateContent(subject, body);
    
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(2); // One warning for each template
  });
});

describe('extractAllVariables', () => {
  it('should extract variables from both subject and body', () => {
    const subject = 'Order {{orderId}} Confirmation';
    const body = 'Hello {{name}}! Your order {{orderId}} is confirmed.';
    const variables = extractAllVariables(subject, body);
    
    expect(variables).toEqual(['name', 'orderId']);
  });

  it('should deduplicate variables across subject and body', () => {
    const subject = 'Hello {{name}}!';
    const body = 'Welcome back, {{name}}. Your order {{orderId}} is ready.';
    const variables = extractAllVariables(subject, body);
    
    expect(variables).toEqual(['name', 'orderId']);
  });

  it('should return empty array when no variables in either template', () => {
    const subject = 'Static Subject';
    const body = 'Static Body';
    const variables = extractAllVariables(subject, body);
    
    expect(variables).toEqual([]);
  });

  it('should sort combined variables alphabetically', () => {
    const subject = '{{zebra}} {{apple}}';
    const body = '{{banana}} {{cherry}}';
    const variables = extractAllVariables(subject, body);
    
    expect(variables).toEqual(['apple', 'banana', 'cherry', 'zebra']);
  });
});
