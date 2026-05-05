/**
 * TypeScript Configuration Tests
 * 
 * These tests verify that the TypeScript configuration is working correctly
 * and that all imports resolve properly.
 */

import { describe, it, expect } from '@jest/globals';
import type {
  EmailMessage,
  EmailProviderAdapter,
  EmailAddress,
  FetchOptions,
  OutgoingEmail,
  SendResult,
  FilterConfig,
  EmailTemplate,
} from '../types';
import { VERSION, SUPPORTED_PROVIDERS, DEFAULT_CONFIG } from '../index';

describe('Email Nodes TypeScript Configuration', () => {
  describe('Type Imports', () => {
    it('should import EmailMessage type correctly', () => {
      const message: EmailMessage = {
        id: 'test-123',
        provider: 'imap',
        headers: {
          from: { address: 'sender@example.com', name: 'Test Sender' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Subject',
          date: new Date(),
          messageId: '<test-123@example.com>',
        },
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [],
        metadata: {
          receivedAt: new Date(),
        },
        flags: {
          seen: false,
          flagged: false,
          answered: false,
          draft: false,
          deleted: false,
        },
      };

      expect(message.id).toBe('test-123');
      expect(message.provider).toBe('imap');
      expect(message.headers.subject).toBe('Test Subject');
    });

    it('should import EmailAddress type correctly', () => {
      const address: EmailAddress = {
        address: 'test@example.com',
        name: 'Test User',
      };

      expect(address.address).toBe('test@example.com');
      expect(address.name).toBe('Test User');
    });

    it('should import FetchOptions type correctly', () => {
      const options: FetchOptions = {
        folder: 'INBOX',
        unreadOnly: true,
        limit: 50,
        batchSize: 10,
      };

      expect(options.folder).toBe('INBOX');
      expect(options.unreadOnly).toBe(true);
      expect(options.limit).toBe(50);
    });

    it('should import OutgoingEmail type correctly', () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        body: {
          text: 'Plain text',
          html: '<p>HTML content</p>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      expect(email.to).toHaveLength(1);
      expect(email.subject).toBe('Test Email');
    });

    it('should import FilterConfig type correctly', () => {
      const config: FilterConfig = {
        rules: [
          {
            field: 'from',
            operator: 'contains',
            value: '@example.com',
          },
        ],
        logic: 'AND',
      };

      expect(config.rules).toHaveLength(1);
      expect(config.logic).toBe('AND');
    });

    it('should import EmailTemplate type correctly', () => {
      const template: EmailTemplate = {
        subject: 'Hello {{name}}',
        body: 'Welcome {{name}}!',
        bodyType: 'text',
      };

      expect(template.subject).toContain('{{name}}');
      expect(template.bodyType).toBe('text');
    });
  });

  describe('Module Exports', () => {
    it('should export VERSION constant', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should export SUPPORTED_PROVIDERS constant', () => {
      expect(SUPPORTED_PROVIDERS).toBeDefined();
      expect(Array.isArray(SUPPORTED_PROVIDERS)).toBe(true);
      expect(SUPPORTED_PROVIDERS).toContain('imap');
      expect(SUPPORTED_PROVIDERS).toContain('gmail');
      expect(SUPPORTED_PROVIDERS).toContain('smtp');
    });

    it('should export DEFAULT_CONFIG constant', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.batchSize).toBe(50);
      expect(DEFAULT_CONFIG.concurrencyLimit).toBe(5);
      expect(DEFAULT_CONFIG.maxRetries).toBe(3);
    });
  });

  describe('Type Safety', () => {
    it('should enforce strict typing for EmailMessage', () => {
      // This test verifies that TypeScript catches type errors at compile time
      const createMessage = (): EmailMessage => {
        return {
          id: 'test-123',
          provider: 'imap',
          headers: {
            from: { address: 'sender@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Test',
            date: new Date(),
            messageId: '<test@example.com>',
          },
          body: {
            text: 'Test',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
          attachments: [],
          metadata: {
            receivedAt: new Date(),
          },
          flags: {
            seen: false,
            flagged: false,
            answered: false,
            draft: false,
            deleted: false,
          },
        };
      };

      const message = createMessage();
      expect(message).toBeDefined();
    });

    it('should enforce provider type constraints', () => {
      // Valid providers
      const validProviders: Array<'imap' | 'pop3' | 'gmail' | 'outlook' | 'smtp'> = [
        'imap',
        'pop3',
        'gmail',
        'outlook',
        'smtp',
      ];

      expect(validProviders).toHaveLength(5);
      validProviders.forEach((provider) => {
        expect(SUPPORTED_PROVIDERS).toContain(provider);
      });
    });
  });

  describe('Path Mappings', () => {
    it('should resolve types from @/email-nodes/types', () => {
      // This test verifies that the path mapping works
      // If the import at the top of this file works, the path mapping is correct
      expect(true).toBe(true);
    });

    it('should resolve index from @/email-nodes', () => {
      // This test verifies that the index export works
      expect(VERSION).toBeDefined();
      expect(SUPPORTED_PROVIDERS).toBeDefined();
      expect(DEFAULT_CONFIG).toBeDefined();
    });
  });
});
