/**
 * Email Template Node Tests
 * 
 * Tests for the EmailTemplateNode implementation
 * Requirement 16: Action Node - Email Template
 */

import { EmailTemplateNode } from '../email-template-node';
import { ExecutionContext } from '../../types';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: {
                subject: 'Hello {{name}}',
                body_html: '<p>Welcome {{name}}, your score is {{score}}</p>',
                body_text: 'Welcome {{name}}, your score is {{score}}',
                body_type: 'html'
              },
              error: null
            }))
          }))
        }))
      }))
    }))
  }))
}));

describe('EmailTemplateNode', () => {
  let node: EmailTemplateNode;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    node = new EmailTemplateNode();
    
    // Create mock execution context
    mockContext = {
      userId: 'test-user-id',
      workflowId: 'test-workflow-id',
      executionId: 'test-execution-id',
      variables: {
        name: 'John Doe',
        score: 95
      },
      nodeOutputs: new Map(),
      currentNodeId: 'test-node',
      executionPath: [],
      getNodeOutput: jest.fn(),
      setVariable: jest.fn(),
      getVariable: jest.fn(),
      resolveExpression: jest.fn()
    };
  });

  describe('validateConfig', () => {
    it('should validate inline template configuration', () => {
      const config = {
        template: {
          subject: 'Test Subject',
          body: 'Test Body',
          bodyType: 'html'
        }
      };

      const result = node.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate templateId configuration', () => {
      const config = {
        templateId: 'test-template-id'
      };

      const result = node.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when neither templateId nor template is provided', () => {
      const config = {};

      const result = node.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Either templateId or template must be provided');
    });

    it('should fail when template is missing required fields', () => {
      const config = {
        template: {
          subject: 'Test Subject'
          // Missing body and bodyType
        }
      };

      const result = node.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when bodyType is invalid', () => {
      const config = {
        template: {
          subject: 'Test Subject',
          body: 'Test Body',
          bodyType: 'invalid'
        }
      };

      const result = node.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'template.bodyType')).toBe(true);
    });
  });

  describe('execute', () => {
    it('should render inline template with provided data', async () => {
      const config = {
        template: {
          subject: 'Hello {{name}}',
          body: '<p>Welcome {{name}}, your score is {{score}}</p>',
          bodyType: 'html'
        },
        data: {
          name: 'John Doe',
          score: 95
        }
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.subject).toBe('Hello John Doe');
      expect(result.output.html).toContain('Welcome John Doe');
      expect(result.output.html).toContain('95');
      expect(result.output.bodyType).toBe('html');
    });

    it('should render inline template with context variables', async () => {
      const config = {
        template: {
          subject: 'Hello {{name}}',
          body: '<p>Welcome {{name}}, your score is {{score}}</p>',
          bodyType: 'html'
        }
        // No data provided, should use context variables
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.subject).toBe('Hello John Doe');
      expect(result.output.html).toContain('Welcome John Doe');
      expect(result.output.html).toContain('95');
    });

    it('should render template with both text and html', async () => {
      const config = {
        template: {
          subject: 'Test Subject',
          body: '<p>Test HTML Body</p>',
          bodyType: 'both'
        }
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.html).toBe('<p>Test HTML Body</p>');
      expect(result.output.text).toBeTruthy();
      expect(result.output.text).toContain('Test HTML Body');
    });

    it('should render text-only template', async () => {
      const config = {
        template: {
          subject: 'Test Subject',
          body: 'Plain text body',
          bodyType: 'text'
        }
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.text).toBe('Plain text body');
      expect(result.output.html).toBeUndefined();
    });

    it('should fail when template is missing', async () => {
      const config = {};

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either templateId or template must be provided');
    });

    it('should load template from database when templateId is provided', async () => {
      const config = {
        templateId: 'test-template-id',
        data: {
          name: 'Jane Smith',
          score: 88
        }
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.subject).toBe('Hello Jane Smith');
      expect(result.output.html).toContain('Welcome Jane Smith');
      expect(result.output.html).toContain('88');
      expect(result.output.templateId).toBe('test-template-id');
    });

    it('should handle missing variables gracefully when failOnMissingVariable is false', async () => {
      const config = {
        template: {
          subject: 'Hello {{name}}',
          body: 'Your score is {{score}} and grade is {{grade}}',
          bodyType: 'text'
        },
        data: {
          name: 'John',
          score: 95
          // grade is missing
        },
        failOnMissingVariable: false
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.subject).toBe('Hello John');
      expect(result.output.text).toContain('Your score is 95');
    });

    it('should fail when required variables are missing and failOnMissingVariable is true', async () => {
      const config = {
        template: {
          subject: 'Hello {{name}}',
          body: 'Your score is {{score}} and grade is {{grade}}',
          bodyType: 'text'
        },
        data: {
          name: 'John',
          score: 95
          // grade is missing
        },
        failOnMissingVariable: true
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required variables');
      expect(result.error).toContain('grade');
    });

    it('should include metadata in output', async () => {
      const config = {
        template: {
          subject: 'Test',
          body: 'Test body',
          bodyType: 'text'
        }
      };

      const result = await node.execute({}, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.output.timestamp).toBeTruthy();
      expect(result.output.variablesUsed).toBeTruthy();
      expect(Array.isArray(result.output.variablesUsed)).toBe(true);
    });
  });

  describe('type', () => {
    it('should have correct node type', () => {
      expect(node.type).toBe('email-template');
    });
  });
});
