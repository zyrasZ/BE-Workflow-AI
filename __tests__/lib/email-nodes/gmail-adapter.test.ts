/**
 * Gmail Adapter Unit Tests
 * 
 * Tests for tasks 9.4, 9.6, and 9.7:
 * - fetchEmails() method
 * - sendEmail() method
 * - Helper functions: buildGmailQuery(), mapGmailToEmailMessage(), buildMIMEMessage()
 */

import { GmailAdapter } from '../../../lib/email-nodes/adapters/gmail-adapter';
import type { FetchOptions, OutgoingEmail, EmailAddress } from '../../../lib/email-nodes/types';

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;

  beforeEach(() => {
    adapter = new GmailAdapter();
  });

  describe('Task 9.7: Helper Functions', () => {
    describe('buildGmailQuery()', () => {
      it('should build query for unread emails', () => {
        const options: FetchOptions = {
          unreadOnly: true,
        };
        
        // Access private method via type assertion
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toBe('is:unread');
      });

      it('should build query with date range', () => {
        const options: FetchOptions = {
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-01-31'),
          },
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toContain('after:2024/01/01');
        expect(query).toContain('before:2024/01/31');
      });

      it('should build query with sender filter', () => {
        const options: FetchOptions = {
          sender: 'test@example.com',
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toBe('from:test@example.com');
      });

      it('should build query with subject filter', () => {
        const options: FetchOptions = {
          subject: 'Important',
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toBe('subject:Important');
      });

      it('should build query with attachment filter', () => {
        const options: FetchOptions = {
          hasAttachment: true,
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toBe('has:attachment');
      });

      it('should combine multiple filters with AND logic', () => {
        const options: FetchOptions = {
          unreadOnly: true,
          sender: 'test@example.com',
          hasAttachment: true,
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toContain('is:unread');
        expect(query).toContain('from:test@example.com');
        expect(query).toContain('has:attachment');
      });

      it('should handle RegExp sender filter', () => {
        const options: FetchOptions = {
          sender: /.*@example\.com/,
        };
        
        const query = (adapter as any).buildGmailQuery(options);
        
        expect(query).toContain('from:');
        expect(query).toContain('.*@example\\.com');
      });
    });

    describe('mapFolderToLabels()', () => {
      it('should map INBOX to INBOX label', () => {
        const labels = (adapter as any).mapFolderToLabels('INBOX');
        expect(labels).toEqual(['INBOX']);
      });

      it('should map Sent to SENT label', () => {
        const labels = (adapter as any).mapFolderToLabels('Sent');
        expect(labels).toEqual(['SENT']);
      });

      it('should map Drafts to DRAFT label', () => {
        const labels = (adapter as any).mapFolderToLabels('Drafts');
        expect(labels).toEqual(['DRAFT']);
      });

      it('should return custom label as-is', () => {
        const labels = (adapter as any).mapFolderToLabels('CustomLabel');
        expect(labels).toEqual(['CustomLabel']);
      });

      it('should return empty array for undefined folder', () => {
        const labels = (adapter as any).mapFolderToLabels(undefined);
        expect(labels).toEqual([]);
      });
    });

    describe('buildMIMEMessage()', () => {
      it('should build simple text email', () => {
        const email: OutgoingEmail = {
          to: [{ address: 'recipient@example.com', name: 'Recipient' }],
          subject: 'Test Subject',
          body: {
            text: 'Test body',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('To: "Recipient" <recipient@example.com>');
        expect(mime).toContain('Subject: Test Subject');
        expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
        expect(mime).toContain('Test body');
      });

      it('should build HTML email', () => {
        const email: OutgoingEmail = {
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Subject',
          body: {
            html: '<p>Test body</p>',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('To: recipient@example.com');
        expect(mime).toContain('Subject: Test Subject');
        expect(mime).toContain('Content-Type: text/html; charset=utf-8');
        expect(mime).toContain('<p>Test body</p>');
      });

      it('should build multipart email with text and HTML', () => {
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
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('Content-Type: multipart/alternative');
        expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
        expect(mime).toContain('Content-Type: text/html; charset=utf-8');
        expect(mime).toContain('Test body');
        expect(mime).toContain('<p>Test body</p>');
      });

      it('should include CC and BCC recipients', () => {
        const email: OutgoingEmail = {
          to: [{ address: 'to@example.com' }],
          cc: [{ address: 'cc@example.com' }],
          bcc: [{ address: 'bcc@example.com' }],
          subject: 'Test Subject',
          body: {
            text: 'Test body',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('To: to@example.com');
        expect(mime).toContain('Cc: cc@example.com');
        expect(mime).toContain('Bcc: bcc@example.com');
      });

      it('should include thread headers for replies', () => {
        const email: OutgoingEmail = {
          to: [{ address: 'recipient@example.com' }],
          subject: 'Re: Test Subject',
          body: {
            text: 'Reply body',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
          inReplyTo: '<original-message-id@example.com>',
          references: ['<original-message-id@example.com>'],
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('In-Reply-To: <original-message-id@example.com>');
        expect(mime).toContain('References: <original-message-id@example.com>');
      });

      it('should handle attachments', () => {
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
            },
          ],
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('Content-Type: multipart/mixed');
        expect(mime).toContain('Content-Type: text/plain; name="test.txt"');
        expect(mime).toContain('Content-Disposition: attachment; filename="test.txt"');
        expect(mime).toContain('Content-Transfer-Encoding: base64');
      });

      it('should handle inline attachments with contentId', () => {
        const email: OutgoingEmail = {
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test Subject',
          body: {
            html: '<img src="cid:image1">',
            encoding: 'utf-8',
            charset: 'utf-8',
          },
          attachments: [
            {
              filename: 'image.png',
              contentType: 'image/png',
              content: Buffer.from('fake-image-data'),
              contentId: 'image1',
            },
          ],
        };
        
        const mime = (adapter as any).buildMIMEMessage(email);
        
        expect(mime).toContain('Content-ID: <image1>');
      });
    });

    describe('formatAddresses()', () => {
      it('should format address with name', () => {
        const addresses: EmailAddress[] = [
          { address: 'test@example.com', name: 'Test User' },
        ];
        
        const formatted = (adapter as any).formatAddresses(addresses);
        
        expect(formatted).toBe('"Test User" <test@example.com>');
      });

      it('should format address without name', () => {
        const addresses: EmailAddress[] = [
          { address: 'test@example.com' },
        ];
        
        const formatted = (adapter as any).formatAddresses(addresses);
        
        expect(formatted).toBe('test@example.com');
      });

      it('should format multiple addresses', () => {
        const addresses: EmailAddress[] = [
          { address: 'test1@example.com', name: 'Test User 1' },
          { address: 'test2@example.com' },
        ];
        
        const formatted = (adapter as any).formatAddresses(addresses);
        
        expect(formatted).toBe('"Test User 1" <test1@example.com>, test2@example.com');
      });
    });

    describe('formatGmailDate()', () => {
      it('should format date in Gmail format (YYYY/MM/DD)', () => {
        const date = new Date('2024-01-15T10:30:00Z');
        
        const formatted = (adapter as any).formatGmailDate(date);
        
        expect(formatted).toBe('2024/01/15');
      });

      it('should pad single-digit months and days', () => {
        const date = new Date('2024-03-05T10:30:00Z');
        
        const formatted = (adapter as any).formatGmailDate(date);
        
        expect(formatted).toBe('2024/03/05');
      });
    });

    describe('mapGmailLabelsToFlags()', () => {
      it('should map UNREAD absence to \\Seen flag', () => {
        const labelIds = ['INBOX'];
        
        const flags = (adapter as any).mapGmailLabelsToFlags(labelIds);
        
        expect(flags).toContain('\\Seen');
      });

      it('should not include \\Seen if UNREAD is present', () => {
        const labelIds = ['INBOX', 'UNREAD'];
        
        const flags = (adapter as any).mapGmailLabelsToFlags(labelIds);
        
        expect(flags).not.toContain('\\Seen');
      });

      it('should map STARRED to \\Flagged', () => {
        const labelIds = ['STARRED'];
        
        const flags = (adapter as any).mapGmailLabelsToFlags(labelIds);
        
        expect(flags).toContain('\\Flagged');
      });

      it('should map DRAFT to \\Draft', () => {
        const labelIds = ['DRAFT'];
        
        const flags = (adapter as any).mapGmailLabelsToFlags(labelIds);
        
        expect(flags).toContain('\\Draft');
      });

      it('should map TRASH to \\Deleted', () => {
        const labelIds = ['TRASH'];
        
        const flags = (adapter as any).mapGmailLabelsToFlags(labelIds);
        
        expect(flags).toContain('\\Deleted');
      });
    });

    describe('isRetryableError()', () => {
      it('should identify 429 as retryable', () => {
        const retryable = (adapter as any).isRetryableError(429);
        expect(retryable).toBe(true);
      });

      it('should identify 500 as retryable', () => {
        const retryable = (adapter as any).isRetryableError(500);
        expect(retryable).toBe(true);
      });

      it('should identify ETIMEDOUT as retryable', () => {
        const retryable = (adapter as any).isRetryableError('ETIMEDOUT');
        expect(retryable).toBe(true);
      });

      it('should identify 400 as not retryable', () => {
        const retryable = (adapter as any).isRetryableError(400);
        expect(retryable).toBe(false);
      });
    });
  });

  describe('Task 9.4 & 9.6: Connection Requirements', () => {
    it('should throw error when fetchEmails is called without connection', async () => {
      const options: FetchOptions = {
        folder: 'INBOX',
      };
      
      await expect(adapter.fetchEmails(options)).rejects.toThrow(
        'Not connected to Gmail API. Call connect() first.'
      );
    });

    it('should throw error when sendEmail is called without connection', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'test@example.com' }],
        subject: 'Test',
        body: {
          text: 'Test',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };
      
      await expect(adapter.sendEmail(email)).rejects.toThrow(
        'Not connected to Gmail API. Call connect() first.'
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should initialize with correct rate limit info', () => {
      const rateLimits = adapter.getRateLimits();
      
      expect(rateLimits.limit).toBe(250); // Gmail API limit
      expect(rateLimits.remaining).toBe(250);
      expect(rateLimits.resetTime).toBeInstanceOf(Date);
    });

    it('should record rate limit usage', () => {
      const initialRemaining = adapter.getRateLimits().remaining;
      
      (adapter as any).recordRateLimitUsage(10);
      
      const newRemaining = adapter.getRateLimits().remaining;
      expect(newRemaining).toBe(initialRemaining - 10);
    });

    it('should not go below zero remaining', () => {
      (adapter as any).recordRateLimitUsage(300);
      
      const remaining = adapter.getRateLimits().remaining;
      expect(remaining).toBe(0);
    });
  });
});
