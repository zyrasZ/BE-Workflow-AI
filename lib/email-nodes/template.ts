/**
 * Email Template Engine
 * 
 * Handlebars-based template engine for rendering email content with dynamic data.
 * Supports variable substitution, conditionals, loops, and helper functions.
 * Auto-generates text version from HTML templates.
 */

import Handlebars from 'handlebars';

// ============================================================================
// Template Cache
// ============================================================================

/**
 * Template cache for compiled templates
 * Key: template string hash, Value: compiled template function
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Maximum cache size to prevent memory issues
 */
const MAX_CACHE_SIZE = 1000;

// ============================================================================
// Handlebars Helper Registration
// ============================================================================

/**
 * Format date helper
 * Usage: {{formatDate date "YYYY-MM-DD"}}
 * 
 * @param date - Date to format (Date object or ISO string)
 * @param format - Format string (simplified format tokens)
 * @returns Formatted date string
 */
Handlebars.registerHelper('formatDate', function(date: any, format: string): string {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  
  // Simple format tokens (not full moment.js, but covers common cases)
  const tokens: Record<string, string> = {
    'YYYY': d.getFullYear().toString(),
    'YY': d.getFullYear().toString().slice(-2),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'M': String(d.getMonth() + 1),
    'DD': String(d.getDate()).padStart(2, '0'),
    'D': String(d.getDate()),
    'HH': String(d.getHours()).padStart(2, '0'),
    'H': String(d.getHours()),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'm': String(d.getMinutes()),
    'ss': String(d.getSeconds()).padStart(2, '0'),
    's': String(d.getSeconds()),
  };
  
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(token, 'g'), value);
  }
  
  return result;
});

/**
 * Truncate string helper
 * Usage: {{truncate text 100}}
 * Usage: {{truncate text 100 "..."}}
 * 
 * @param str - String to truncate
 * @param length - Maximum length
 * @param suffix - Suffix to append if truncated (default: "...")
 * @returns Truncated string
 */
Handlebars.registerHelper('truncate', function(str: any, length: number, suffix?: any): string {
  if (!str) return '';
  
  const text = String(str);
  const maxLength = Number(length) || 100;
  
  // Handle Handlebars options object (last parameter)
  let ellipsis = '...';
  if (suffix !== undefined && typeof suffix !== 'object') {
    ellipsis = String(suffix);
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
});

/**
 * Conditional equality helper
 * Usage: {{#ifEquals value "expected"}}...{{/ifEquals}}
 * 
 * @param arg1 - First value to compare
 * @param arg2 - Second value to compare
 * @param options - Handlebars options
 * @returns Rendered block if equal, else inverse block
 */
Handlebars.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: any): string {
  // Loose equality check (== instead of ===) to handle type coercion
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});

// ============================================================================
// Template Compilation and Caching
// ============================================================================

/**
 * Generate a simple hash for cache key
 * 
 * @param str - String to hash
 * @returns Hash string
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Compile a Handlebars template with caching
 * 
 * @param template - Template string
 * @returns Compiled template function
 */
export function compileTemplate(template: string): HandlebarsTemplateDelegate {
  const cacheKey = simpleHash(template);
  
  // Check cache first
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Compile template
  const compiled = Handlebars.compile(template);
  
  // Add to cache (with size limit)
  if (templateCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first entry in Map)
    const firstKey = templateCache.keys().next().value;
    if (firstKey) {
      templateCache.delete(firstKey);
    }
  }
  
  templateCache.set(cacheKey, compiled);
  
  return compiled;
}

// ============================================================================
// Template Validation
// ============================================================================

/**
 * Validation error
 */
export interface TemplateValidationError {
  message: string;
  line?: number;
  column?: number;
}

/**
 * Validation result
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
}

/**
 * Validate template syntax without executing it
 * 
 * @param template - Template string to validate
 * @returns Validation result with errors if any
 */
export function validateTemplate(template: string): TemplateValidationResult {
  const errors: TemplateValidationError[] = [];
  
  try {
    // Try to compile the template
    Handlebars.compile(template);
    
    return {
      valid: true,
      errors: []
    };
  } catch (error: any) {
    // Parse Handlebars error message
    const message = error.message || 'Unknown template syntax error';
    
    // Try to extract line/column from error message
    const lineMatch = message.match(/line (\d+)/i);
    const columnMatch = message.match(/column (\d+)/i);
    
    errors.push({
      message,
      line: lineMatch ? parseInt(lineMatch[1]) : undefined,
      column: columnMatch ? parseInt(columnMatch[1]) : undefined
    });
    
    return {
      valid: false,
      errors
    };
  }
}

// ============================================================================
// HTML to Text Conversion
// ============================================================================

/**
 * Convert HTML to plain text
 * Preserves structure (paragraphs, line breaks, lists) and converts links
 * 
 * @param html - HTML string
 * @returns Plain text string
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // Remove script and style tags with their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Convert common block elements to line breaks
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
  
  // Convert links to text with URL
  text = text.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 [$1]');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Clean up whitespace
  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple blank lines to double line break
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .trim();
  
  return text;
}

// ============================================================================
// Email Rendering
// ============================================================================

/**
 * Rendered email result
 */
export interface RenderedEmail {
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Email template input
 */
export interface EmailTemplate {
  subject: string;
  body: string;
  bodyType: 'text' | 'html' | 'both';
}

/**
 * Render email template with data
 * 
 * @param template - Email template with subject and body
 * @param data - Data object for variable substitution
 * @returns Rendered email with subject, HTML, and text versions
 */
export function renderEmail(template: EmailTemplate, data: any): RenderedEmail {
  // Render subject
  const subjectTemplate = compileTemplate(template.subject);
  const subject = subjectTemplate(data);
  
  // Render body
  const bodyTemplate = compileTemplate(template.body);
  const renderedBody = bodyTemplate(data);
  
  // Prepare result based on body type
  const result: RenderedEmail = {
    subject
  };
  
  if (template.bodyType === 'html' || template.bodyType === 'both') {
    result.html = renderedBody;
    
    // Auto-generate text version from HTML
    if (template.bodyType === 'both') {
      result.text = htmlToText(renderedBody);
    }
  }
  
  if (template.bodyType === 'text') {
    result.text = renderedBody;
  }
  
  return result;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  compileTemplate,
  validateTemplate,
  renderEmail,
  htmlToText
};
