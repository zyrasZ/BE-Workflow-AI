/**
 * Email Filter - Filter emails based on various criteria
 * 
 * This module provides email filtering functionality that filters emails based on
 * sender, subject, body content, date range, attachment presence, flags, and more.
 * Supports AND/OR logic for multiple filter rules.
 */

import { EmailMessage, FilterRule, FilterConfig, FilterResult } from './types';

/**
 * Filter emails based on configuration
 * 
 * This is the main filtering function that partitions emails into matched and unmatched sets
 * based on the provided filter configuration.
 * 
 * @param emails - Array of EmailMessage objects to filter
 * @param config - Filter configuration with rules and logic
 * @returns FilterResult with matched and unmatched email arrays
 */
export function filterEmails(emails: EmailMessage[], config: FilterConfig): FilterResult {
  const matched: EmailMessage[] = [];
  const unmatched: EmailMessage[] = [];

  for (const email of emails) {
    let isMatch: boolean;

    if (config.logic === 'AND') {
      // All rules must match
      isMatch = config.rules.every(rule => evaluateRule(email, rule));
    } else {
      // At least one rule must match (OR logic)
      isMatch = config.rules.some(rule => evaluateRule(email, rule));
    }

    if (isMatch) {
      matched.push(email);
    } else {
      unmatched.push(email);
    }
  }

  return { matched, unmatched };
}

/**
 * Evaluate a single filter rule against an email
 * 
 * @param email - EmailMessage to evaluate
 * @param rule - FilterRule to apply
 * @returns true if the email matches the rule, false otherwise
 */
export function evaluateRule(email: EmailMessage, rule: FilterRule): boolean {
  switch (rule.field) {
    case 'from':
      return evaluateFromRule(email, rule);
    
    case 'to':
      return evaluateToRule(email, rule);
    
    case 'subject':
      return evaluateSubjectRule(email, rule);
    
    case 'body':
      return evaluateBodyRule(email, rule);
    
    case 'date':
      return evaluateDateRule(email, rule);
    
    case 'attachment':
      return evaluateAttachmentRule(email, rule);
    
    case 'label':
      return evaluateLabelRule(email, rule);
    
    case 'category':
      return evaluateCategoryRule(email, rule);
    
    case 'flag':
      return evaluateFlagRule(email, rule);
    
    case 'isUnread':
      return evaluateIsUnreadRule(email, rule);
    
    default:
      // Unknown field type, return false
      return false;
  }
}

/**
 * Evaluate 'from' field rule
 */
function evaluateFromRule(email: EmailMessage, rule: FilterRule): boolean {
  const fromAddress = email.headers.from.address;
  return matchString(fromAddress, rule.operator, rule.value);
}

/**
 * Evaluate 'to' field rule
 */
function evaluateToRule(email: EmailMessage, rule: FilterRule): boolean {
  const toAddresses = email.headers.to.map(addr => addr.address);
  
  // Check if any 'to' address matches
  return toAddresses.some(address => matchString(address, rule.operator, rule.value));
}

/**
 * Evaluate 'subject' field rule
 */
function evaluateSubjectRule(email: EmailMessage, rule: FilterRule): boolean {
  const subject = email.headers.subject;
  return matchString(subject, rule.operator, rule.value);
}

/**
 * Evaluate 'body' field rule
 */
function evaluateBodyRule(email: EmailMessage, rule: FilterRule): boolean {
  // Check both text and HTML body
  const textBody = email.body.text || '';
  const htmlBody = email.body.html || '';
  
  // Match if either text or HTML body matches
  return matchString(textBody, rule.operator, rule.value) || 
         matchString(htmlBody, rule.operator, rule.value);
}

/**
 * Evaluate 'date' field rule
 */
function evaluateDateRule(email: EmailMessage, rule: FilterRule): boolean {
  const emailDate = email.headers.date;
  
  switch (rule.operator) {
    case 'before':
      return emailDate < new Date(rule.value);
    
    case 'after':
      return emailDate > new Date(rule.value);
    
    case 'between':
      // Expect value to be an object with start and end dates
      if (typeof rule.value === 'object' && rule.value.start && rule.value.end) {
        const start = new Date(rule.value.start);
        const end = new Date(rule.value.end);
        return emailDate >= start && emailDate <= end;
      }
      return false;
    
    case 'equals':
      // Check if dates are on the same day
      const targetDate = new Date(rule.value);
      return emailDate.toDateString() === targetDate.toDateString();
    
    default:
      return false;
  }
}

/**
 * Evaluate 'attachment' field rule
 */
function evaluateAttachmentRule(email: EmailMessage, rule: FilterRule): boolean {
  const hasAttachments = email.attachments.length > 0;
  
  switch (rule.operator) {
    case 'equals':
      // Check if has attachments matches the boolean value
      return hasAttachments === Boolean(rule.value);
    
    case 'contains':
      // Check if any attachment filename contains the value
      return email.attachments.some(att => 
        att.filename.toLowerCase().includes(String(rule.value).toLowerCase())
      );
    
    case 'matches':
      // Check if any attachment filename matches the regex
      const regex = new RegExp(String(rule.value));
      return email.attachments.some(att => regex.test(att.filename));
    
    default:
      return false;
  }
}

/**
 * Evaluate 'label' field rule (Gmail-specific)
 */
function evaluateLabelRule(email: EmailMessage, rule: FilterRule): boolean {
  const labels = email.metadata.labels || [];
  
  switch (rule.operator) {
    case 'equals':
      return labels.includes(String(rule.value));
    
    case 'contains':
      return labels.some(label => 
        label.toLowerCase().includes(String(rule.value).toLowerCase())
      );
    
    default:
      return false;
  }
}

/**
 * Evaluate 'category' field rule (Outlook-specific)
 */
function evaluateCategoryRule(email: EmailMessage, rule: FilterRule): boolean {
  const categories = email.metadata.categories || [];
  
  switch (rule.operator) {
    case 'equals':
      return categories.includes(String(rule.value));
    
    case 'contains':
      return categories.some(category => 
        category.toLowerCase().includes(String(rule.value).toLowerCase())
      );
    
    default:
      return false;
  }
}

/**
 * Evaluate 'flag' field rule
 */
function evaluateFlagRule(email: EmailMessage, rule: FilterRule): boolean {
  // Expect value to be an object like { seen: true, flagged: false }
  if (typeof rule.value !== 'object' || rule.value === null) {
    return false;
  }
  
  const flagChecks = rule.value as Record<string, boolean>;
  
  switch (rule.operator) {
    case 'equals':
      // All specified flags must match
      return Object.entries(flagChecks).every(([flagName, expectedValue]) => {
        const actualValue = email.flags[flagName as keyof typeof email.flags];
        return actualValue === expectedValue;
      });
    
    default:
      return false;
  }
}

/**
 * Evaluate 'isUnread' field rule
 * 
 * Checks if the email is unread (seen flag is false)
 */
function evaluateIsUnreadRule(email: EmailMessage, rule: FilterRule): boolean {
  const isUnread = !email.flags.seen;
  
  switch (rule.operator) {
    case 'equals':
      // Check if isUnread matches the boolean value
      return isUnread === Boolean(rule.value);
    
    default:
      return false;
  }
}

/**
 * Match a string value against an operator and expected value
 * 
 * Supports: equals, contains, startsWith, endsWith, matches (regex)
 * 
 * @param actual - Actual string value from email
 * @param operator - Comparison operator
 * @param expected - Expected value to compare against
 * @returns true if the string matches, false otherwise
 */
export function matchString(
  actual: string,
  operator: FilterRule['operator'],
  expected: any
): boolean {
  const actualLower = actual.toLowerCase();
  const expectedStr = String(expected).toLowerCase();
  
  switch (operator) {
    case 'equals':
      return actualLower === expectedStr;
    
    case 'contains':
      return actualLower.includes(expectedStr);
    
    case 'startsWith':
      return actualLower.startsWith(expectedStr);
    
    case 'endsWith':
      return actualLower.endsWith(expectedStr);
    
    case 'matches':
      // Regex matching (case-insensitive by default)
      try {
        const regex = new RegExp(String(expected), 'i');
        return regex.test(actual);
      } catch (error) {
        // Invalid regex, return false
        return false;
      }
    
    default:
      return false;
  }
}
