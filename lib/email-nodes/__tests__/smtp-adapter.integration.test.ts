/**
 * SMTP Adapter Integration Tests
 * 
 * These tests demonstrate the SMTP adapter working in realistic scenarios.
 * Note: These tests use mocked nodemailer for CI/CD compatibility.
 * For real integration testing with actual SMTP servers, set up test accounts
 * and remove the mocks.
 */

import { SMTPAdapter } from './smtp-adapter';
import type { ProviderConfig, OutgoingEmail } from '../types';

// Mock nodemailer for integration tests
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockImplementation((mailOptions) => {
      // Simulate realistic nodemailer response
      return Promise.resolve({
        messageId: `<${Date.now()}.${Math.random()}@example.com>`,
        accepted: [
          ...(Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to]),
          ...(mailOptions.cc ? (Array.isArray(mailOptions.cc) ? mailOptions.cc : [mailOptions.cc]) : []),
        ],
        rejected: [],
        response: '250 2.0.0 OK',
        envelope: {
          from: mailOptions.from,
          to: [
            ...(Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to]),
            ...(mailOptions.cc ? (Array.isArray(mailOptions.cc) ? mailOptions.cc : [mailOptions.cc]) : []),
            ...(mailOptions.bcc ? (Array.isArray(mailOptions.bcc) ? mailOptions.bcc : [mailOptions.bcc]) : []),
          ],
        },
      });
    }),
    close: jest.fn(),
  })),
}));

describe('SMTPAdapter Integration Tests', () => {
  let adapter: SMTPAdapter;
  let config: ProviderConfig;

  beforeEach(async () => {
    adapter = new SMTPAdapter();
    config = {
      provider: 'smtp',
      host: 'smtp.gmail.com',
      port: 587,
      secure: true,
      credentials: {
        type: 'password',
        username: 'test@example.com',
        password: 'test-app-password',
      },
    };
    await adapter.connect(config);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('Scenario: Send simple notification email', () => {
    it('should send a plain text notification', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'user@example.com', name: 'John Doe' }],
        subject: 'Your order has been shipped',
        body: {
          text: 'Hello John,\n\nYour order #12345 has been shipped and will arrive in 2-3 business days.\n\nThank you for your purchase!',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.provider).toBe('smtp');
    });
  });

  describe('Scenario: Send HTML marketing email', () => {
    it('should send an HTML email with both text and HTML versions', async () => {
      const email: OutgoingEmail = {
        to: [
          { address: 'customer1@example.com', name: 'Customer One' },
          { address: 'customer2@example.com', name: 'Customer Two' },
        ],
        subject: 'Special Offer: 20% Off This Weekend!',
        body: {
          text: 'Special Offer: 20% Off This Weekend!\n\nDon\'t miss out on our exclusive weekend sale. Use code WEEKEND20 at checkout.',
          html: '<html><body><h1>Special Offer: 20% Off This Weekend!</h1><p>Don\'t miss out on our exclusive weekend sale.</p><p>Use code <strong>WEEKEND20</strong> at checkout.</p></body></html>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Reply to an email thread', () => {
    it('should send a reply preserving thread information', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'original-sender@example.com', name: 'Original Sender' }],
        subject: 'Re: Question about your product',
        body: {
          text: 'Thank you for your question!\n\nOur product supports the following features:\n- Feature A\n- Feature B\n- Feature C\n\nLet me know if you have any other questions.',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        inReplyTo: '<original-message-id@example.com>',
        references: [
          '<thread-start@example.com>',
          '<original-message-id@example.com>',
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Send email with PDF attachment', () => {
    it('should send an email with a PDF invoice attachment', async () => {
      const pdfContent = Buffer.from('Mock PDF content');

      const email: OutgoingEmail = {
        to: [{ address: 'customer@example.com', name: 'Customer' }],
        subject: 'Your Invoice #INV-2024-001',
        body: {
          text: 'Dear Customer,\n\nPlease find attached your invoice for the recent purchase.\n\nThank you for your business!',
          html: '<html><body><p>Dear Customer,</p><p>Please find attached your invoice for the recent purchase.</p><p>Thank you for your business!</p></body></html>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'invoice-INV-2024-001.pdf',
            contentType: 'application/pdf',
            content: pdfContent,
            encoding: 'base64',
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Send HTML email with inline image', () => {
    it('should send an email with an inline image', async () => {
      const imageContent = Buffer.from('Mock image data');

      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Check out our new logo!',
        body: {
          html: '<html><body><h1>Our New Logo</h1><p>We\'re excited to share our new logo with you:</p><img src="cid:logo" alt="Company Logo" /></body></html>',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'logo.png',
            contentType: 'image/png',
            content: imageContent,
            encoding: 'base64',
            contentId: 'logo',
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Send email with CC and BCC', () => {
    it('should send an email with CC and BCC recipients', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'primary@example.com', name: 'Primary Recipient' }],
        cc: [
          { address: 'manager@example.com', name: 'Manager' },
          { address: 'team@example.com', name: 'Team' },
        ],
        bcc: [{ address: 'archive@example.com' }],
        subject: 'Project Update - Q1 2024',
        body: {
          text: 'Team,\n\nHere is the Q1 2024 project update.\n\nBest regards,\nProject Manager',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Send email with multiple attachments', () => {
    it('should send an email with multiple file attachments', async () => {
      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Project Documents',
        body: {
          text: 'Please find attached the project documents:\n- Project Plan\n- Budget Spreadsheet\n- Timeline',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
        attachments: [
          {
            filename: 'project-plan.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('Mock PDF content'),
          },
          {
            filename: 'budget.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            content: Buffer.from('Mock Excel content'),
          },
          {
            filename: 'timeline.png',
            contentType: 'image/png',
            content: Buffer.from('Mock image content'),
          },
        ],
      };

      const result = await adapter.sendEmail(email);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Scenario: Handle connection errors gracefully', () => {
    it('should return error result when not connected', async () => {
      await adapter.disconnect();

      const email: OutgoingEmail = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        body: {
          text: 'Test',
          encoding: 'utf-8',
          charset: 'utf-8',
        },
      };

      await expect(adapter.sendEmail(email)).rejects.toThrow(
        'Not connected to SMTP server'
      );
    });
  });
});
