/**
 * Unit Tests for Email Filter Functions
 * 
 * Tests for filterEmails(), evaluateRule(), and matchString() functions
 */

import { filterEmails, evaluateRule, matchString } from '../filter';
import { EmailMessage, FilterRule, FilterConfig } from '../types';

// Helper function to create a mock EmailMessage
function createMockEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'test-email-1',
    provider: 'imap',
    headers: {
      from: { address: 'sender@example.com', name: 'Sender Name' },
      to: [{ address: 'recipient@example.com', name: 'Recipient Name' }],
      subject: 'Test Subject',
      date: new Date('2024-01-15T10:00:00Z'),
      messageId: '<test@example.com>',
    },
    body: {
      text: 'This is the plain text body',
      html: '<p>This is the HTML body</p>',
      encoding: 'utf-8',
      charset: 'utf-8',
    },
    attachments: [],
    metadata: {
      receivedAt: new Date('2024-01-15T10:00:00Z'),
    },
    flags: {
      seen: false,
      flagged: false,
      answered: false,
      draft: false,
      deleted: false,
    },
    ...overrides,
  };
}

describe('Email Filter Functions', () => {
  describe('matchString', () => {
    it('should match with equals operator', () => {
      expect(matchString('hello world', 'equals', 'hello world')).toBe(true);
      expect(matchString('Hello World', 'equals', 'hello world')).toBe(true);
      expect(matchString('hello', 'equals', 'world')).toBe(false);
    });

    it('should match with contains operator', () => {
      expect(matchString('hello world', 'contains', 'world')).toBe(true);
      expect(matchString('Hello World', 'contains', 'WORLD')).toBe(true);
      expect(matchString('hello', 'contains', 'xyz')).toBe(false);
    });

    it('should match with startsWith operator', () => {
      expect(matchString('hello world', 'startsWith', 'hello')).toBe(true);
      expect(matchString('Hello World', 'startsWith', 'HELLO')).toBe(true);
      expect(matchString('hello world', 'startsWith', 'world')).toBe(false);
    });

    it('should match with endsWith operator', () => {
      expect(matchString('hello world', 'endsWith', 'world')).toBe(true);
      expect(matchString('Hello World', 'endsWith', 'WORLD')).toBe(true);
      expect(matchString('hello world', 'endsWith', 'hello')).toBe(false);
    });

    it('should match with regex matches operator', () => {
      expect(matchString('hello123', 'matches', '\\d+')).toBe(true);
      expect(matchString('hello', 'matches', '\\d+')).toBe(false);
      expect(matchString('test@example.com', 'matches', '^[a-z]+@[a-z]+\\.[a-z]+$')).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      expect(matchString('hello', 'matches', '[')).toBe(false);
    });
  });

  describe('evaluateRule - from field', () => {
    it('should match from address with equals', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'from',
        operator: 'equals',
        value: 'sender@example.com',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match from address with contains', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'from',
        operator: 'contains',
        value: 'sender',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - to field', () => {
    it('should match to address with equals', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'to',
        operator: 'equals',
        value: 'recipient@example.com',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match any to address in array', () => {
      const email = createMockEmail({
        headers: {
          from: { address: 'sender@example.com' },
          to: [
            { address: 'recipient1@example.com' },
            { address: 'recipient2@example.com' },
          ],
          subject: 'Test',
          date: new Date(),
          messageId: '<test@example.com>',
        },
      });
      const rule: FilterRule = {
        field: 'to',
        operator: 'contains',
        value: 'recipient2',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - subject field', () => {
    it('should match subject with contains', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'subject',
        operator: 'contains',
        value: 'Test',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should not match subject when value not present', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'subject',
        operator: 'contains',
        value: 'NotPresent',
      };
      expect(evaluateRule(email, rule)).toBe(false);
    });
  });

  describe('evaluateRule - body field', () => {
    it('should match text body with contains', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'body',
        operator: 'contains',
        value: 'plain text',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match HTML body with contains', () => {
      const email = createMockEmail();
      const rule: FilterRule = {
        field: 'body',
        operator: 'contains',
        value: 'HTML body',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should handle missing body gracefully', () => {
      const email = createMockEmail({
        body: {
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      });
      const rule: FilterRule = {
        field: 'body',
        operator: 'contains',
        value: 'test',
      };
      expect(evaluateRule(email, rule)).toBe(false);
    });
  });

  describe('evaluateRule - date field', () => {
    it('should match date with before operator', () => {
      const email = createMockEmail({
        headers: {
          from: { address: 'test@example.com' },
          to: [{ address: 'test@example.com' }],
          subject: 'Test',
          date: new Date('2024-01-15T10:00:00Z'),
          messageId: '<test@example.com>',
        },
      });
      const rule: FilterRule = {
        field: 'date',
        operator: 'before',
        value: '2024-01-20T00:00:00Z',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match date with after operator', () => {
      const email = createMockEmail({
        headers: {
          from: { address: 'test@example.com' },
          to: [{ address: 'test@example.com' }],
          subject: 'Test',
          date: new Date('2024-01-15T10:00:00Z'),
          messageId: '<test@example.com>',
        },
      });
      const rule: FilterRule = {
        field: 'date',
        operator: 'after',
        value: '2024-01-10T00:00:00Z',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match date with between operator', () => {
      const email = createMockEmail({
        headers: {
          from: { address: 'test@example.com' },
          to: [{ address: 'test@example.com' }],
          subject: 'Test',
          date: new Date('2024-01-15T10:00:00Z'),
          messageId: '<test@example.com>',
        },
      });
      const rule: FilterRule = {
        field: 'date',
        operator: 'between',
        value: {
          start: '2024-01-10T00:00:00Z',
          end: '2024-01-20T00:00:00Z',
        },
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match date with equals operator (same day)', () => {
      const email = createMockEmail({
        headers: {
          from: { address: 'test@example.com' },
          to: [{ address: 'test@example.com' }],
          subject: 'Test',
          date: new Date('2024-01-15T10:00:00Z'),
          messageId: '<test@example.com>',
        },
      });
      const rule: FilterRule = {
        field: 'date',
        operator: 'equals',
        value: '2024-01-15T15:00:00Z', // Different time, same day
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - attachment field', () => {
    it('should match hasAttachment with equals operator (true)', () => {
      const email = createMockEmail({
        attachments: [
          {
            id: 'att1',
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
          },
        ],
      });
      const rule: FilterRule = {
        field: 'attachment',
        operator: 'equals',
        value: true,
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match hasAttachment with equals operator (false)', () => {
      const email = createMockEmail({
        attachments: [],
      });
      const rule: FilterRule = {
        field: 'attachment',
        operator: 'equals',
        value: false,
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match attachment filename with contains', () => {
      const email = createMockEmail({
        attachments: [
          {
            id: 'att1',
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
          },
        ],
      });
      const rule: FilterRule = {
        field: 'attachment',
        operator: 'contains',
        value: 'document',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match attachment filename with regex', () => {
      const email = createMockEmail({
        attachments: [
          {
            id: 'att1',
            filename: 'report-2024.pdf',
            contentType: 'application/pdf',
            size: 1024,
          },
        ],
      });
      const rule: FilterRule = {
        field: 'attachment',
        operator: 'matches',
        value: 'report-\\d{4}\\.pdf',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - isUnread field', () => {
    it('should match isUnread when email is unread', () => {
      const email = createMockEmail({
        flags: {
          seen: false,
          flagged: false,
          answered: false,
          draft: false,
          deleted: false,
        },
      });
      const rule: FilterRule = {
        field: 'isUnread',
        operator: 'equals',
        value: true,
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should not match isUnread when email is read', () => {
      const email = createMockEmail({
        flags: {
          seen: true,
          flagged: false,
          answered: false,
          draft: false,
          deleted: false,
        },
      });
      const rule: FilterRule = {
        field: 'isUnread',
        operator: 'equals',
        value: true,
      };
      expect(evaluateRule(email, rule)).toBe(false);
    });

    it('should match when checking for read emails', () => {
      const email = createMockEmail({
        flags: {
          seen: true,
          flagged: false,
          answered: false,
          draft: false,
          deleted: false,
        },
      });
      const rule: FilterRule = {
        field: 'isUnread',
        operator: 'equals',
        value: false,
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - flag field', () => {
    it('should match flag with equals operator', () => {
      const email = createMockEmail({
        flags: {
          seen: true,
          flagged: true,
          answered: false,
          draft: false,
          deleted: false,
        },
      });
      const rule: FilterRule = {
        field: 'flag',
        operator: 'equals',
        value: { seen: true, flagged: true },
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should not match when flags differ', () => {
      const email = createMockEmail({
        flags: {
          seen: true,
          flagged: false,
          answered: false,
          draft: false,
          deleted: false,
        },
      });
      const rule: FilterRule = {
        field: 'flag',
        operator: 'equals',
        value: { seen: true, flagged: true },
      };
      expect(evaluateRule(email, rule)).toBe(false);
    });
  });

  describe('evaluateRule - label field (Gmail)', () => {
    it('should match label with equals operator', () => {
      const email = createMockEmail({
        metadata: {
          labels: ['INBOX', 'IMPORTANT'],
          receivedAt: new Date(),
        },
      });
      const rule: FilterRule = {
        field: 'label',
        operator: 'equals',
        value: 'INBOX',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match label with contains operator', () => {
      const email = createMockEmail({
        metadata: {
          labels: ['INBOX', 'IMPORTANT'],
          receivedAt: new Date(),
        },
      });
      const rule: FilterRule = {
        field: 'label',
        operator: 'contains',
        value: 'import',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('evaluateRule - category field (Outlook)', () => {
    it('should match category with equals operator', () => {
      const email = createMockEmail({
        metadata: {
          categories: ['Work', 'Urgent'],
          receivedAt: new Date(),
        },
      });
      const rule: FilterRule = {
        field: 'category',
        operator: 'equals',
        value: 'Work',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });

    it('should match category with contains operator', () => {
      const email = createMockEmail({
        metadata: {
          categories: ['Work', 'Urgent'],
          receivedAt: new Date(),
        },
      });
      const rule: FilterRule = {
        field: 'category',
        operator: 'contains',
        value: 'urg',
      };
      expect(evaluateRule(email, rule)).toBe(true);
    });
  });

  describe('filterEmails - AND logic', () => {
    it('should filter emails with AND logic', () => {
      const emails = [
        createMockEmail({
          id: 'email1',
          headers: {
            from: { address: 'sender@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Important Meeting',
            date: new Date('2024-01-15T10:00:00Z'),
            messageId: '<email1@example.com>',
          },
          flags: {
            seen: false,
            flagged: false,
            answered: false,
            draft: false,
            deleted: false,
          },
        }),
        createMockEmail({
          id: 'email2',
          headers: {
            from: { address: 'other@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Important Meeting',
            date: new Date('2024-01-15T10:00:00Z'),
            messageId: '<email2@example.com>',
          },
          flags: {
            seen: false,
            flagged: false,
            answered: false,
            draft: false,
            deleted: false,
          },
        }),
      ];

      const config: FilterConfig = {
        rules: [
          { field: 'from', operator: 'contains', value: 'sender' },
          { field: 'subject', operator: 'contains', value: 'Important' },
        ],
        logic: 'AND',
      };

      const result = filterEmails(emails, config);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].id).toBe('email1');
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].id).toBe('email2');
    });
  });

  describe('filterEmails - OR logic', () => {
    it('should filter emails with OR logic', () => {
      const emails = [
        createMockEmail({
          id: 'email1',
          headers: {
            from: { address: 'sender@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Meeting',
            date: new Date('2024-01-15T10:00:00Z'),
            messageId: '<email1@example.com>',
          },
        }),
        createMockEmail({
          id: 'email2',
          headers: {
            from: { address: 'other@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Important Update',
            date: new Date('2024-01-15T10:00:00Z'),
            messageId: '<email2@example.com>',
          },
        }),
        createMockEmail({
          id: 'email3',
          headers: {
            from: { address: 'another@example.com' },
            to: [{ address: 'recipient@example.com' }],
            subject: 'Random',
            date: new Date('2024-01-15T10:00:00Z'),
            messageId: '<email3@example.com>',
          },
        }),
      ];

      const config: FilterConfig = {
        rules: [
          { field: 'from', operator: 'contains', value: 'sender' },
          { field: 'subject', operator: 'contains', value: 'Important' },
        ],
        logic: 'OR',
      };

      const result = filterEmails(emails, config);

      expect(result.matched).toHaveLength(2);
      expect(result.matched.map(e => e.id)).toContain('email1');
      expect(result.matched.map(e => e.id)).toContain('email2');
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].id).toBe('email3');
    });
  });

  describe('filterEmails - edge cases', () => {
    it('should handle empty email array', () => {
      const config: FilterConfig = {
        rules: [{ field: 'from', operator: 'contains', value: 'test' }],
        logic: 'AND',
      };

      const result = filterEmails([], config);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
    });

    it('should handle empty rules array', () => {
      const emails = [createMockEmail()];
      const config: FilterConfig = {
        rules: [],
        logic: 'AND',
      };

      const result = filterEmails(emails, config);

      // With no rules and AND logic, all emails should match (vacuous truth)
      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });

    it('should partition emails correctly (no overlap)', () => {
      const emails = [
        createMockEmail({ id: 'email1' }),
        createMockEmail({ id: 'email2' }),
        createMockEmail({ id: 'email3' }),
      ];

      const config: FilterConfig = {
        rules: [{ field: 'from', operator: 'contains', value: 'sender' }],
        logic: 'AND',
      };

      const result = filterEmails(emails, config);

      // Check that matched and unmatched don't overlap
      const matchedIds = new Set(result.matched.map(e => e.id));
      const unmatchedIds = new Set(result.unmatched.map(e => e.id));
      const intersection = [...matchedIds].filter(id => unmatchedIds.has(id));

      expect(intersection).toHaveLength(0);

      // Check that union equals original
      expect(result.matched.length + result.unmatched.length).toBe(emails.length);
    });
  });
});
