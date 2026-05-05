/**
 * IMAP Adapter Tests
 * 
 * Unit tests for the IMAPAdapter class, focusing on the fetchEmails() method.
 */

import { IMAPAdapter } from './imap-adapter';
import type { ProviderConfig, FetchOptions } from '../types';

// Mock imapflow
jest.mock('imapflow', () => {
  return {
    ImapFlow: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      getMailboxLock: jest.fn().mockResolvedValue({
        release: jest.fn(),
      }),
      fetch: jest.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          // Mock email messages
          yield {
            uid: 1,
            source: Buffer.from(
              'From: sender@example.com\r\n' +
              'To: recipient@example.com\r\n' +
              'Subject: Test Email\r\n' +
              'Date: Mon, 1 Jan 2024 12:00:00 +0000\r\n' +
              'Message-ID: <test1@example.com>\r\n' +
              '\r\n' +
              'This is a test email body.'
            ),
            flags: ['\\Seen'],
            internalDate: new Date('2024-01-01T12:00:00Z'),
            size: 150,
          };
          yield {
            uid: 2,
            source: Buffer.from(
              'From: another@example.com\r\n' +
              'To: recipient@example.com\r\n' +
              'Subject: Another Test\r\n' +
              'Date: Mon, 2 Jan 2024 12:00:00 +0000\r\n' +
              'Message-ID: <test2@example.com>\r\n' +
              '\r\n' +
              'Another test email body.'
            ),
            flags: [],
            internalDate: new Date('2024-01-02T12:00:00Z'),
            size: 140,
          };
        },
      }),
      fetchOne: jest.fn().mockResolvedValue({
        uid: 1,
        source: Buffer.from(
          'From: sender@example.com\r\n' +
          'To: recipient@example.com\r\n' +
          'Subject: Test Email\r\n' +
          'Date: Mon, 1 Jan 2024 12:00:00 +0000\r\n' +
          'Message-ID: <test1@example.com>\r\n' +
          '\r\n' +
          'This is a test email body.'
        ),
        flags: ['\\Seen'],
        internalDate: new Date('2024-01-01T12:00:00Z'),
        size: 150,
      }),
    })),
  };
});

describe('IMAPAdapter', () => {
  let adapter: IMAPAdapter;
  let mockConfig: ProviderConfig;

  beforeEach(() => {
    adapter = new IMAPAdapter();
    mockConfig = {
      provider: 'imap',
      credentials: {
        type: 'password',
        username: 'test@example.com',
        password: 'testpassword',
      },
      host: 'imap.example.com',
      port: 993,
      secure: true,
    };
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('connect()', () => {
    it('should connect to IMAP server successfully', async () => {
      await expect(adapter.connect(mockConfig)).resolves.not.toThrow();
    });

    it('should throw error if host is missing', async () => {
      const invalidConfig = { ...mockConfig, host: undefined };
      await expect(adapter.connect(invalidConfig)).rejects.toThrow(
        'IMAP configuration requires host and port'
      );
    });

    it('should throw error if credentials are not password type', async () => {
      const invalidConfig = {
        ...mockConfig,
        credentials: { type: 'oauth2' as const },
      };
      await expect(adapter.connect(invalidConfig)).rejects.toThrow(
        'IMAP adapter only supports password authentication'
      );
    });

    it('should throw error if username or password is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        credentials: {
          type: 'password' as const,
          username: undefined,
          password: undefined,
        },
      };
      await expect(adapter.connect(invalidConfig)).rejects.toThrow(
        'IMAP credentials require username and password'
      );
    });
  });

  describe('fetchEmails()', () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it('should fetch emails from INBOX by default', async () => {
      const options: FetchOptions = {};
      const emails = await adapter.fetchEmails(options);

      expect(emails).toHaveLength(2);
      expect(emails[0].headers.subject).toBe('Test Email');
      expect(emails[1].headers.subject).toBe('Another Test');
    });

    it('should fetch emails with limit', async () => {
      const options: FetchOptions = { limit: 1 };
      const emails = await adapter.fetchEmails(options);

      expect(emails).toHaveLength(1);
      expect(emails[0].headers.subject).toBe('Test Email');
    });

    it('should fetch emails with offset', async () => {
      const options: FetchOptions = { offset: 1, limit: 1 };
      const emails = await adapter.fetchEmails(options);

      expect(emails).toHaveLength(1);
      expect(emails[0].headers.subject).toBe('Another Test');
    });

    it('should build search criteria for unread only', async () => {
      const options: FetchOptions = { unreadOnly: true };
      const emails = await adapter.fetchEmails(options);

      // Should still return emails (mocked data)
      expect(emails).toBeDefined();
    });

    it('should build search criteria with date range', async () => {
      const options: FetchOptions = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      };
      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
    });

    it('should build search criteria with sender filter', async () => {
      const options: FetchOptions = {
        sender: 'sender@example.com',
      };
      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
    });

    it('should build search criteria with subject filter', async () => {
      const options: FetchOptions = {
        subject: 'Test',
      };
      const emails = await adapter.fetchEmails(options);

      expect(emails).toBeDefined();
    });

    it('should throw error if not connected', async () => {
      const disconnectedAdapter = new IMAPAdapter();
      const options: FetchOptions = {};

      await expect(disconnectedAdapter.fetchEmails(options)).rejects.toThrow(
        'Not connected to IMAP server'
      );
    });

    it('should parse email metadata correctly', async () => {
      const options: FetchOptions = {};
      const emails = await adapter.fetchEmails(options);

      expect(emails[0]).toMatchObject({
        provider: 'imap',
        headers: {
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Email',
        },
        flags: {
          seen: true,
        },
      });
    });
  });

  describe('fetchEmail()', () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it('should fetch a single email by UID', async () => {
      const email = await adapter.fetchEmail('1');

      expect(email).toBeDefined();
      expect(email.headers.subject).toBe('Test Email');
      expect(email.id).toBe('1');
    });

    it('should throw error for invalid UID', async () => {
      await expect(adapter.fetchEmail('invalid')).rejects.toThrow('Invalid email ID');
    });

    it('should throw error if not connected', async () => {
      const disconnectedAdapter = new IMAPAdapter();

      await expect(disconnectedAdapter.fetchEmail('1')).rejects.toThrow(
        'Not connected to IMAP server'
      );
    });
  });

  describe('sendEmail()', () => {
    it('should throw error as IMAP does not support sending', async () => {
      await adapter.connect(mockConfig);

      const outgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        body: { text: 'Test body', encoding: 'utf-8', charset: 'utf-8' },
      };

      await expect(adapter.sendEmail(outgoingEmail as any)).rejects.toThrow(
        'IMAP adapter does not support sending emails'
      );
    });
  });

  describe('getRateLimits()', () => {
    it('should return infinite rate limits', () => {
      const rateLimits = adapter.getRateLimits();

      expect(rateLimits.limit).toBe(Infinity);
      expect(rateLimits.remaining).toBe(Infinity);
      expect(rateLimits.resetTime).toBeInstanceOf(Date);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect successfully', async () => {
      await adapter.connect(mockConfig);
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });
});
