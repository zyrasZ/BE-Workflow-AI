/**
 * Email Processing Nodes - Main Entry Point
 * 
 * This file exports all public APIs from the email-nodes module.
 * Use this for importing email-nodes functionality in your application.
 */

// Export all types
export * from './types';

// Export adapters
export { IMAPAdapter } from './adapters/imap-adapter';
// export { SMTPAdapter } from './adapters/smtp-adapter';
// export { GmailAdapter } from './adapters/gmail-adapter';

// Export utilities
export { parseEmail, mapAddress, mapAddresses, generateId } from './parser';
// export { filterEmails } from './filter';
export { 
  renderEmail, 
  compileTemplate, 
  validateTemplate, 
  htmlToText,
  type EmailTemplate,
  type RenderedEmail,
  type TemplateValidationResult,
  type TemplateValidationError
} from './template';

/**
 * Module version
 */
export const VERSION = '0.1.0';

/**
 * Supported email providers
 */
export const SUPPORTED_PROVIDERS = ['imap', 'pop3', 'gmail', 'outlook', 'smtp'] as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  batchSize: 50,
  concurrencyLimit: 5,
  maxRetries: 3,
  retryDelay: 1000,
  connectionTimeout: 30000,
  requestTimeout: 60000,
} as const;
