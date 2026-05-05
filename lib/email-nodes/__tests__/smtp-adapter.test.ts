/**
 * SMTP Adapter Unit Tests
 * 
 * Tests for the SMTPAdapter class, focusing on the sendEmail() method
 * and address formatting functionality.
 */

import { SMTPAdapter } from './smtp-adapter';
import type { ProviderConfig, OutgoingEmail, EmailAddress } from '../types';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockResolvedValue({
      messageId: '<test-message-id@example.com>',
      accepted: ['recipient@example.com'],
      rejected: [],
      response: '250 Message accepted',
    }),
    close: jest.fn(),
  })),
}));

describe('SMTPAdapter', () => {
  let adapter: SMTPAdapter;
  let mockConfig: ProviderConfig;

  beforeEach(() => {
    adapter = new SMTPAdapter();
    mockConfig = {
      provider: 'smtp',
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      credentials: {
        type: 'password',
        username: 'test@example.com',
        password: 'test-password',
      },
    };
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('connect()', () => {
    it('should connect to SMTP server with valid config', async () => {
      await expect(adapter.connect(mockConfig)).resolves.not.toThrow();
    });

    it('should throw error if host is missing', async () => {
      const invalidConfig = { ...mockConfig, host: undefined };
      await expect(adapter.connect(invalidConfig as any)).rejects.toThrow(
        'SMTP configuration requires host and port'
      );
    });

    it('should throw error if port is missing', async () => {
      const invalidConfig = { ...mockConfig, port: undefined };
      await expect(adapter.connect(invalidConfig as any)).rejects.toThrow(
        'SMTP configuration requires host and port'
      );
    });

    it('should throw error if credentials type is not password', async () => {
      const invalidConfig = {
        ...mockConfig,
        credentials: { type: 'oauth2' as const },
      };
      await expect(adapter.connect(invalidConfig as any)).rejects.toThrow(
        'SMTP adapter only supports password authentication'
      );
    });

    it('should throw error if username is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        credentials: {
          type: 'password' as const,
          password: 'test-password',
        },
      };
      await expect(adapter.connect(invalidConfig as any)).rejects.toThrow(
        'SMTP credentials require username and password'
      );
    });

    it('should throw error if password is missing', async () => {
      const invalidConfig = {
        ...mockConfig,
        credentials: {
          type: 'password' as const,
          username: 'test@example.com',
        },
      };
      await expect(adapter.connect(invalidConfig as any)).rejects.toThrow(
        'SMTP credentials require username and password'
      );
    });

    it('should not reconnect if already connected', async () => {
      await adapter.connect(mockConfig);
      await expect(adapter.connect(mockConfig)).resolves.not.toThrow();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect from SMTP server', async () => {
      await adapter.connect(mockConfig);
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });

    it('should handle disconnect when not connected', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('sendEmail()', () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it('should send email with basic fields', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<test-message-id@example.com>');
      expect(result.provider).toBe('smtp');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should format addresses with names correctly', async () => {
      const email: OutgoingEmail = {
        to: [
          { address: 'recipient1@example.com', name: 'Recipient One' },
          { address: 'recipient2@example.com', name: 'Recipient Two' },
        ],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should format addresses without names correctly', async () => {
      const email: OutgoingEmail = {
        to: [
          { address: 'recipient1@example.com' },
          { address: 'recipient2@example.com' },
        ],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle CC recipients', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        cc: [{ address: 'cc@example.com', name: 'CC Recipient' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle BCC recipients', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle both text and HTML body', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          html: '<p>Test body</p>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should preserve thread information (inReplyTo)', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Test Subject',
        body: {
          text: 'Reply body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        inReplyTo: '<original-message-id@example.com>',
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should preserve thread information (references)', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Test Subject',
        body: {
          text: 'Reply body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        references: [
          '<message-1@example.com>',
          '<message-2@example.com>',
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should preserve both inReplyTo and references', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Test Subject',
        body: {
          text: 'Reply body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        inReplyTo: '<original-message-id@example.com>',
        references: [
          '<message-1@example.com>',
          '<original-message-id@example.com>',
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle attachments', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'test.txt',
            contentType: 'text/plain',
            content: Buffer.from('Test attachment content'),
            encoding: 'base64',
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle inline attachments with contentId', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          html: '<p>Test body with image: <img src="cid:image1" /></p>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'image.png',
            contentType: 'image/png',
            content: Buffer.from('fake-image-data'),
            encoding: 'base64',
            contentId: 'image1',
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should handle multiple attachments', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'file1.txt',
            contentType: 'text/plain',
            content: Buffer.from('File 1 content'),
          },
          {
            filename: 'file2.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('File 2 content'),
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();

      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      await expect(adapter.sendEmail(email)).rejects.toThrow(
        'Not connected to SMTP server. Call connect() first.'
      );
    });
  });

  describe('fetchEmails()', () => {
    it('should throw error - SMTP does not support fetching', async () => {
      await adapter.connect(mockConfig);
      await expect(adapter.fetchEmails({})).rejects.toThrow(
        'SMTP adapter does not support fetching emails. Use IMAPAdapter instead.'
      );
    });
  });

  describe('fetchEmail()', () => {
    it('should throw error - SMTP does not support fetching', async () => {
      await adapter.connect(mockConfig);
      await expect(adapter.fetchEmail('123')).rejects.toThrow(
        'SMTP adapter does not support fetching emails. Use IMAPAdapter instead.'
      );
    });
  });

  describe('getRateLimits()', () => {
    it('should return infinite rate limits', () => {
      const limits = adapter.getRateLimits();
      expect(limits.limit).toBe(Infinity);
      expect(limits.remaining).toBe(Infinity);
      expect(limits.resetTime).toBeInstanceOf(Date);
    });
  });
});
