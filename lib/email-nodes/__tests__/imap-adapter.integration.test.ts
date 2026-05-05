/**
 * IMAP Adapter Integration Tests
 * 
 * These tests require actual IMAP server credentials and are meant to be run manually
 * or in a staging environment with test email accounts.
 * 
 * To run these tests:
 * 1. Set up environment variables with test IMAP credentials
 * 2. Run: npm test -- imap-adapter.integration.test.ts
 * 
 * Environment variables needed:
 * - TEST_IMAP_HOST
 * - TEST_IMAP_PORT
 * - TEST_IMAP_USER
 * - TEST_IMAP_PASSWORD
 */

import { IMAPAdapter } from './imap-adapter';
import type { ProviderConfig, FetchOptions } from '../types';

// Skip these tests by default (only run when explicitly enabled)
const describeIfEnabled = process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

describeIfEnabled('IMAPAdapter Integration Tests', () => {
  let adapter: IMAPAdapter;
  let config: ProviderConfig;

  beforeAll(() => {
    // Load configuration from environment variables
    const host = process.env.TEST_IMAP_HOST;
    const port = parseInt(process.env.TEST_IMAP_PORT || '993', 10);
    const username = process.env.TEST_IMAP_USER;
    const password = process.env.TEST_IMAP_PASSWORD;

    if (!host || !username || !password) {
      throw new Error(
        'Integration tests require TEST_IMAP_HOST, TEST_IMAP_USER, and TEST_IMAP_PASSWORD environment variables'
      );
    }

    config = {
      provider: 'imap',
      credentials: {
        type: 'password',
        username,
        password,
      },
      host,
      port,
      secure: true,
    };

    adapter = new IMAPAdapter();
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  describe('Real IMAP Connection', () => {
    it('should connect to real IMAP server', async () => {
      await expect(adapter.connect(config)).resolves.not.toThrow();
    }, 30000); // 30 second timeout for network operations

    it('should fetch emails from INBOX', async () => {
      await adapter.connect(config);

      const options: FetchOptions = {
        limit: 5,
      };

      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
      expect(Array.isArray(emails)).toBe(true);
      
      if (emails.length > 0) {
        const firstEmail = emails[0];
        expect(firstEmail).toHaveProperty('id');
        expect(firstEmail).toHaveProperty('headers');
        expect(firstEmail).toHaveProperty('body');
        expect(firstEmail.provider).toBe('imap');
        
        console.log('Sample email fetched:');
        console.log('- From:', firstEmail.headers.from.address);
        console.log('- Subject:', firstEmail.headers.subject);
        console.log('- Date:', firstEmail.headers.date);
      }
    }, 30000);

    it('should fetch only unread emails', async () => {
      await adapter.connect(config);

      const options: FetchOptions = {
        unreadOnly: true,
        limit: 10,
      };

      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
      
      // All fetched emails should be unread
      emails.forEach(email => {
        expect(email.flags.seen).toBe(false);
      });

      console.log(`Fetched ${emails.length} unread emails`);
    }, 30000);

    it('should fetch emails from specific folder', async () => {
      await adapter.connect(config);

      const options: FetchOptions = {
        folder: 'Sent', // Try to fetch from Sent folder
        limit: 5,
      };

      // This might fail if the folder doesn't exist, which is expected
      try {
        const emails = await adapter.fetchEmails(options);
        expect(emails).toBeDefined();
        console.log(`Fetched ${emails.length} emails from Sent folder`);
      } catch (error) {
        console.log('Sent folder not accessible (this is OK for some accounts)');
      }
    }, 30000);

    it('should fetch emails with date range filter', async () => {
      await adapter.connect(config);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const options: FetchOptions = {
        dateRange: {
          start: thirtyDaysAgo,
        },
        limit: 10,
      };

      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
      
      // All emails should be from the last 30 days
      emails.forEach(email => {
        expect(email.headers.date.getTime()).toBeGreaterThanOrEqual(thirtyDaysAgo.getTime());
      });

      console.log(`Fetched ${emails.length} emails from last 30 days`);
    }, 30000);

    it('should fetch single email by UID', async () => {
      await adapter.connect(config);

      // First, get a list of emails to get a valid UID
      const listOptions: FetchOptions = { limit: 1 };
      const emails = await adapter.fetchEmails(listOptions);

      if (emails.length > 0) {
        const uid = emails[0].id;
        const singleEmail = await adapter.fetchEmail(uid);

        expect(singleEmail).toBeDefined();
        expect(singleEmail.id).toBe(uid);
        expect(singleEmail.headers.subject).toBe(emails[0].headers.subject);

        console.log('Successfully fetched single email by UID:', uid);
      } else {
        console.log('No emails in inbox to test single fetch');
      }
    }, 30000);

    it('should handle pagination correctly', async () => {
      await adapter.connect(config);

      // Fetch first page
      const page1Options: FetchOptions = {
        limit: 2,
        offset: 0,
      };
      const page1 = await adapter.fetchEmails(page1Options);

      // Fetch second page
      const page2Options: FetchOptions = {
        limit: 2,
        offset: 2,
      };
      const page2 = await adapter.fetchEmails(page2Options);

      // Pages should not overlap
      if (page1.length > 0 && page2.length > 0) {
        const page1Ids = new Set(page1.map(e => e.id));
        const page2Ids = new Set(page2.map(e => e.id));
        
        page2Ids.forEach(id => {
          expect(page1Ids.has(id)).toBe(false);
        });

        console.log('Pagination working correctly');
      }
    }, 30000);

    it('should parse email with attachments', async () => {
      await adapter.connect(config);

      const options: FetchOptions = {
        hasAttachment: true,
        limit: 5,
      };

      const emails = await adapter.fetchEmails(options);

      // Find an email with attachments
      const emailWithAttachments = emails.find(e => e.attachments.length > 0);

      if (emailWithAttachments) {
        expect(emailWithAttachments.attachments.length).toBeGreaterThan(0);
        
        const attachment = emailWithAttachments.attachments[0];
        expect(attachment).toHaveProperty('filename');
        expect(attachment).toHaveProperty('contentType');
        expect(attachment).toHaveProperty('size');

        console.log('Found email with attachment:');
        console.log('- Filename:', attachment.filename);
        console.log('- Content Type:', attachment.contentType);
        console.log('- Size:', attachment.size, 'bytes');
      } else {
        console.log('No emails with attachments found');
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid credentials gracefully', async () => {
      const invalidConfig = {
        ...config,
        credentials: {
          type: 'password' as const,
          username: 'invalid@example.com',
          password: 'wrongpassword',
        },
      };

      const invalidAdapter = new IMAPAdapter();

      await expect(invalidAdapter.connect(invalidConfig)).rejects.toThrow();
    }, 30000);

    it('should handle invalid folder gracefully', async () => {
      await adapter.connect(config);

      const options: FetchOptions = {
        folder: 'NonExistentFolder123456',
        limit: 5,
      };

      await expect(adapter.fetchEmails(options)).rejects.toThrow();
    }, 30000);

    it('should handle network timeout gracefully', async () => {
      const timeoutConfig = {
        ...config,
        host: '192.0.2.1', // TEST-NET-1, should timeout
      };

      const timeoutAdapter = new IMAPAdapter();

      await expect(timeoutAdapter.connect(timeoutConfig)).rejects.toThrow();
    }, 30000);
  });
});
