/**
 * Email Filter Node Implementation
 * 
 * Filters emails based on various criteria (sender, recipient, subject, body, date, read status)
 * with AND/OR logic support. Returns matched and unmatched email arrays with statistics.
 * 
 * Requirement 15: Action Node - Email Filter
 */

import { BaseNode } from './base-node';
import { NodeResult, ValidationResult, ExecutionContext } from '../types';
import { filterEmails } from '@/lib/email-nodes/filter';
import type { 
  EmailMessage,
  FilterConfig,
  FilterRule,
  FilterResult
} from '@/lib/email-nodes/types';

/**
 * Email Filter Node - Filter emails based on criteria
 * 
 * Configuration:
 * - filterConfig: Filter configuration with logic operator (AND, OR) and rules
 *   - logic: 'AND' | 'OR' - Logic operator for combining rules
 *   - rules: Array of filter rules
 *     - field: 'from' | 'to' | 'subject' | 'body' | 'date' | 'attachment' | 'label' | 'category' | 'flag' | 'isUnread'
 *     - operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches' | 'before' | 'after' | 'between'
 *     - value: Value to match against
 * 
 * Input:
 * - emails: Array of email objects to filter
 * 
 * Output:
 * - matched: Array of emails that match the filter criteria
 * - unmatched: Array of emails that don't match the filter criteria
 * - matchedCount: Number of matched emails
 * - unmatchedCount: Number of unmatched emails
 * - totalCount: Total number of emails processed
 * - timestamp: ISO timestamp of when filtering was performed
 * 
 * Requirement 15: Email Filter Node SHALL accept an array of email objects as input
 * Requirement 15: Email Filter Node SHALL accept filter configuration with logic operator (AND, OR) and rules
 * Requirement 15: Email Filter Node SHALL support filter rules for sender, recipient, subject, body, date, and read status
 * Requirement 15: Email Filter Node SHALL support operators (equals, contains, starts with, ends with, matches regex)
 * Requirement 15: Email Filter Node SHALL evaluate each email against the filter rules
 * Requirement 15: Email Filter Node SHALL return two arrays: matched emails and unmatched emails
 * Requirement 15: Email Filter Node SHALL include match count statistics in the output
 */
export class EmailFilterNode extends BaseNode {
  readonly type = 'email-filter';

  /**
   * Execute the email filter logic
   * 
   * Requirement 15: Email Filter Node SHALL evaluate each email against the filter rules
   * Requirement 15: Email Filter Node SHALL return two arrays: matched emails and unmatched emails
   * Requirement 15: Email Filter Node SHALL include match count statistics in the output
   */
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    try {
      // Extract emails from input
      let emails: EmailMessage[];
      
      // Support both direct emails array and nested in input object
      if (Array.isArray(input.emails)) {
        emails = input.emails;
      } else if (Array.isArray(input)) {
        emails = input;
      } else {
        return this.failure('Input must contain an array of emails');
      }

      // Validate emails array
      if (emails.length === 0) {
        // Empty array is valid, just return empty results
        return this.success({
          matched: [],
          unmatched: [],
          matchedCount: 0,
          unmatchedCount: 0,
          totalCount: 0,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate that emails have required structure
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        if (!this.isValidEmailMessage(email)) {
          return this.failure(`Invalid email structure at index ${i}: missing required fields (id, headers, body, attachments, metadata, flags)`);
        }
      }

      // Resolve filter configuration from expressions
      const filterConfig: FilterConfig = this.resolveFilterConfig(config.filterConfig, context);

      // Validate filter configuration
      const configValidation = this.validateFilterConfig(filterConfig);
      if (!configValidation.valid) {
        const errorMessages = configValidation.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        return this.failure(`Invalid filter configuration: ${errorMessages}`);
      }

      // Apply filter using existing email filter logic
      let result: FilterResult;
      try {
        result = filterEmails(emails, filterConfig);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.failure(`Failed to filter emails: ${message}`);
      }

      // Return result with statistics
      return this.success({
        matched: result.matched,
        unmatched: result.unmatched,
        matchedCount: result.matched.length,
        unmatchedCount: result.unmatched.length,
        totalCount: emails.length,
        timestamp: new Date().toISOString(),
        filterConfig: {
          logic: filterConfig.logic,
          ruleCount: filterConfig.rules.length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.failure(`Unexpected error in email filter node: ${message}`);
    }
  }

  /**
   * Validate email filter node configuration
   * 
   * Requirement 15: Email Filter Node SHALL validate configuration before execution
   */
  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate filterConfig exists
    if (!config.filterConfig) {
      errors.push({
        field: 'filterConfig',
        message: 'filterConfig is required',
      });
      return { valid: false, errors };
    }

    const filterConfig = config.filterConfig;

    // Validate filterConfig is an object
    if (typeof filterConfig !== 'object' || Array.isArray(filterConfig)) {
      errors.push({
        field: 'filterConfig',
        message: 'filterConfig must be an object',
      });
      return { valid: false, errors };
    }

    // Validate logic
    if (!filterConfig.logic) {
      errors.push({
        field: 'filterConfig.logic',
        message: 'logic is required',
      });
    } else if (!['AND', 'OR'].includes(filterConfig.logic)) {
      errors.push({
        field: 'filterConfig.logic',
        message: 'logic must be "AND" or "OR"',
      });
    }

    // Validate rules
    if (!filterConfig.rules) {
      errors.push({
        field: 'filterConfig.rules',
        message: 'rules is required',
      });
    } else if (!Array.isArray(filterConfig.rules)) {
      errors.push({
        field: 'filterConfig.rules',
        message: 'rules must be an array',
      });
    } else if (filterConfig.rules.length === 0) {
      errors.push({
        field: 'filterConfig.rules',
        message: 'rules must contain at least one rule',
      });
    } else {
      // Validate each rule
      const validFields = ['from', 'to', 'subject', 'body', 'date', 'attachment', 'label', 'category', 'flag', 'isUnread'];
      const validOperators = ['equals', 'contains', 'startsWith', 'endsWith', 'matches', 'before', 'after', 'between'];

      for (let i = 0; i < filterConfig.rules.length; i++) {
        const rule = filterConfig.rules[i];

        if (!rule || typeof rule !== 'object') {
          errors.push({
            field: `filterConfig.rules[${i}]`,
            message: 'rule must be an object',
          });
          continue;
        }

        // Validate field
        if (!rule.field) {
          errors.push({
            field: `filterConfig.rules[${i}].field`,
            message: 'field is required',
          });
        } else if (!validFields.includes(rule.field)) {
          errors.push({
            field: `filterConfig.rules[${i}].field`,
            message: `field must be one of: ${validFields.join(', ')}`,
          });
        }

        // Validate operator
        if (!rule.operator) {
          errors.push({
            field: `filterConfig.rules[${i}].operator`,
            message: 'operator is required',
          });
        } else if (!validOperators.includes(rule.operator)) {
          errors.push({
            field: `filterConfig.rules[${i}].operator`,
            message: `operator must be one of: ${validOperators.join(', ')}`,
          });
        }

        // Validate value
        if (rule.value === undefined || rule.value === null) {
          errors.push({
            field: `filterConfig.rules[${i}].value`,
            message: 'value is required',
          });
        }

        // Validate date operators have appropriate values
        if (['before', 'after', 'between'].includes(rule.operator)) {
          if (rule.operator === 'between') {
            if (typeof rule.value !== 'object' || !rule.value.start || !rule.value.end) {
              errors.push({
                field: `filterConfig.rules[${i}].value`,
                message: 'between operator requires value with start and end dates',
              });
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resolve filter configuration from expressions
   * 
   * @param filterConfig - Filter configuration (may contain expressions)
   * @param context - Execution context
   * @returns Resolved filter configuration
   */
  private resolveFilterConfig(
    filterConfig: any,
    context: ExecutionContext
  ): FilterConfig {
    // If filterConfig is a string expression, resolve it
    if (typeof filterConfig === 'string') {
      filterConfig = this.resolveExpression(filterConfig, context);
    }

    // Resolve rules
    const resolvedRules: FilterRule[] = filterConfig.rules.map((rule: any) => {
      // Resolve rule value if it's an expression
      let resolvedValue = rule.value;
      if (typeof rule.value === 'string' && rule.value.includes('{{')) {
        resolvedValue = this.resolveExpression(rule.value, context);
      }

      return {
        field: rule.field,
        operator: rule.operator,
        value: resolvedValue,
      };
    });

    return {
      logic: filterConfig.logic,
      rules: resolvedRules,
    };
  }

  /**
   * Validate filter configuration structure
   * 
   * @param filterConfig - Filter configuration to validate
   * @returns Validation result
   */
  private validateFilterConfig(filterConfig: FilterConfig): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (!filterConfig.logic || !['AND', 'OR'].includes(filterConfig.logic)) {
      errors.push({
        field: 'logic',
        message: 'logic must be "AND" or "OR"',
      });
    }

    if (!Array.isArray(filterConfig.rules) || filterConfig.rules.length === 0) {
      errors.push({
        field: 'rules',
        message: 'rules must be a non-empty array',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that an object is a valid EmailMessage
   * 
   * @param email - Object to validate
   * @returns true if valid EmailMessage, false otherwise
   */
  private isValidEmailMessage(email: any): boolean {
    if (!email || typeof email !== 'object') {
      return false;
    }

    // Check required top-level fields
    if (!email.id || !email.headers || !email.body || !email.attachments || !email.metadata || !email.flags) {
      return false;
    }

    // Check headers structure
    if (!email.headers.from || !email.headers.to || !email.headers.subject || !email.headers.date) {
      return false;
    }

    // Check body structure
    if (typeof email.body !== 'object') {
      return false;
    }

    // Check attachments is array
    if (!Array.isArray(email.attachments)) {
      return false;
    }

    // Check metadata structure
    if (typeof email.metadata !== 'object') {
      return false;
    }

    // Check flags structure
    if (typeof email.flags !== 'object') {
      return false;
    }

    return true;
  }
}
