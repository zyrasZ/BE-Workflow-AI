/**
 * Email Provider Adapters Registry
 * 
 * This module exports all available email provider adapters and provides
 * a factory function to get the appropriate adapter based on provider type.
 */

import { IMAPAdapter } from './imap-adapter';
import { SMTPAdapter } from './smtp-adapter';
import { GmailAdapter } from './gmail-adapter';
import type { EmailProviderAdapter, ProviderConfig } from '../types';

/**
 * Get an email provider adapter instance based on provider type
 * 
 * @param config - Provider configuration
 * @returns EmailProviderAdapter instance
 * @throws Error if provider type is not supported
 */
export function getAdapter(config: ProviderConfig): EmailProviderAdapter {
  switch (config.provider) {
    case 'imap':
    case 'pop3':
      return new IMAPAdapter();
    
    case 'smtp':
      return new SMTPAdapter();
    
    case 'gmail':
      return new GmailAdapter();
    
    case 'outlook':
      // TODO: Implement OutlookAdapter (Post-MVP)
      throw new Error('Outlook adapter not yet implemented');
    
    default:
      throw new Error(`Unsupported provider: ${(config as any).provider}`);
  }
}

// Export all adapters
export { IMAPAdapter } from './imap-adapter';
export { SMTPAdapter } from './smtp-adapter';
export { GmailAdapter } from './gmail-adapter';
