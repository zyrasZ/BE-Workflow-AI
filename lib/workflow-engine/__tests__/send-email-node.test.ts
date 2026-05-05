/**
 * Unit tests for SendEmailNode
 * 
 * Tests Requirement 13: Action Node - Email Send
 */

import { SendEmailNode } from '../nodes/send-email-node';
import { ExecutionContextImpl } from '../context';

// Mock the email adapter
jest.mock('@/lib/email-nodes/adapters', () => ({
  getAdapter: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue({
      success: true,
      messageId: 'test-message-id-123',
      threadId: 'test-thread-id-456',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      provider: 'smtp'
    })
  }))
}));

// Mock the template renderer
jest.mock('@/lib/email-nodes/template', () => ({
  renderEmail: jest.fn((template, data) => ({
    subject: `Rendered: ${template.subject}`,
    html: `<html>Rendered: ${template.body}</html>`,
    text: `Rendered: ${template.body}`
  }))
}));

describe('SendEmailNode', () => {
  let node: SendEmailNode;
  let context: ExecutionContextImpl;

  beforeEach(() => {
    node = new SendEmailNode();
    context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');
    jest.clearAllMocks();
  });

  describe('Node metadata', () => {
    it('should have correct type', () => {
      expect(node.type).toBe('send-email');
    });
  });

  describe('validateConfig', () => {
    it('should validate required fields', () => {
      const result = node.validateConfig({});
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'provider')).toBe(true);
      expect(result.errors.some(e => e.field === 'config')).toBe(true);
      expect(result.errors.some(e => e.field === 'to')).toBe(true);
    });

    it('should validate provider type', () => {
      const result = node.validateConfig({
        provider: 'invalid',
        config: {},
        to: []
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'provider')).toBe(true);
    });

    it('should validate email content (subject and body required without template)', () => {
      const result = node.validateConfig({
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'test@example.com' }]
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'subject')).toBe(true);
      expect(result.errors.some(e => e.field === 'body')).toBe(true);
    });

    it('should validate template configuration', () => {
      const result = node.validateConfig({
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'test@example.com' }],
        template: {
          // Missing subject and body
        }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'template.subject')).toBe(true);
      expect(result.errors.some(e => e.field === 'template.body')).toBe(true);
    });

    it('should accept valid SMTP configuration', () => {
      const result = node.validateConfig({
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'test@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' }
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should accept valid Gmail configuration', () => {
      const result = node.validateConfig({
        provider: 'gmail',
        config: {
          provider: 'gmail',
          credentials: { type: 'oauth2', accessToken: 'test-token' }
        },
        to: [{ address: 'test@example.com' }],
        subject: 'Test Subject',
        body: { html: '<p>Test body</p>' }
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('execute - basic email sending', () => {
    it('should send email with plain text body', async () => {
      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body content' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
      expect(result.output.messageId).toBe('test-message-id-123');
      expect(result.output.provider).toBe('smtp');
    });

    it('should send email with HTML body', async () => {
      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { html: '<p>Test body content</p>' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
      expect(result.output.messageId).toBe('test-message-id-123');
    });

    it('should send email with both text and HTML body', async () => {
      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: {
          text: 'Test body content',
          html: '<p>Test body content</p>'
        }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
    });
  });

  describe('execute - multiple recipients', () => {
    it('should send email to multiple recipients', async () => {
      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [
          { address: 'recipient1@example.com' },
          { address: 'recipient2@example.com' }
        ],
        cc: [{ address: 'cc@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
      expect(result.output.recipients.to).toBe(2);
      expect(result.output.recipients.cc).toBe(1);
      expect(result.output.recipients.bcc).toBe(1);
    });
  });

  describe('execute - template rendering', () => {
    it('should render email template', async () => {
      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        template: {
          subject: 'Hello {{name}}',
          body: 'Welcome {{name}}!',
          bodyType: 'html',
          data: { name: 'John' }
        }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
      expect(result.output.messageId).toBe('test-message-id-123');
    });
  });

  describe('execute - expression resolution', () => {
    it('should resolve expressions in subject and body', async () => {
      context.setVariable('customerName', 'John Doe');
      context.setVariable('orderNumber', '12345');

      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Order {{variables.orderNumber}} for {{variables.customerName}}',
        body: { text: 'Thank you {{variables.customerName}}!' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
    });

    it('should resolve recipient addresses from expressions', async () => {
      context.setVariable('recipientEmail', 'dynamic@example.com');

      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: '{{variables.recipientEmail}}',
        subject: 'Test Subject',
        body: { text: 'Test body' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(true);
    });
  });

  describe('execute - error handling', () => {
    it('should handle adapter initialization failure', async () => {
      const { getAdapter } = require('@/lib/email-nodes/adapters');
      getAdapter.mockImplementationOnce(() => {
        throw new Error('Failed to initialize adapter');
      });

      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to initialize email adapter');
    });

    it('should handle connection failure', async () => {
      const { getAdapter } = require('@/lib/email-nodes/adapters');
      getAdapter.mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: jest.fn().mockResolvedValue(undefined),
        sendEmail: jest.fn()
      }));

      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect');
    });

    it('should handle send failure', async () => {
      const { getAdapter } = require('@/lib/email-nodes/adapters');
      getAdapter.mockImplementationOnce(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        sendEmail: jest.fn().mockRejectedValue(new Error('Send failed'))
      }));

      const config = {
        provider: 'smtp',
        config: {
          provider: 'smtp',
          credentials: { type: 'password', username: 'test', password: 'test' },
          host: 'smtp.example.com',
          port: 587
        },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Subject',
        body: { text: 'Test body' }
      };

      const result = await node.execute({}, config, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send email');
    });
  });
});
