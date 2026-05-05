/**
 * Read Email Node Tests
 * 
 * Tests for the ReadEmailNode implementation
 * 
 * Requirement 14: Action Node - Email Read
 */

import { ReadEmailNode } from '../read-email-node';
import { ExecutionContext } from '../../types';

describe('ReadEmailNode', () => {
  let node: ReadEmailNode;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    node = new ReadEmailNode();
    
    // Create mock execution context
    mockContext = {
      userId: 'test-user',
      workflowId: 'test-workflow',
      executionId: 'test-execution',
      variables: {},
      nodeOutputs: new Map(),
      currentNodeId: 'test-node',
      executionPath: [],
      getNodeOutput: jest.fn(),
      setVariable: jest.fn(),
      getVariable: jest.fn(),
      resolveExpression: jest.fn(),
    };
  });

  describe('validateConfig', () => {
    it('should validate required fields', () => {
      const result = node.validateConfig({});
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'provider',
        message: 'provider is required'
      });
      expect(result.errors).toContainEqual({
        field: 'config',
        message: 'config is required'
      });
    });

    it('should validate provider type', () => {
      const result = node.validateConfig({
        provider: 'invalid',
        config: {}
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'provider',
        message: 'provider must be one of: imap, gmail, outlook'
      });
    });

    it('should validate limit range', () => {
      const result = node.validateConfig({
        provider: 'imap',
        config: {
          provider: 'imap',
          credentials: {
            type: 'password',
            username: 'test@example.com',
            password: 'password'
          },
          host: 'imap.example.com',
          port: 993
        },
        limit: 150
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'limit',
        message: 'limit must be between 1 and 100'
      });
    });

    it('should validate offset is non-negative', () => {
      const result = node.validateConfig({
        provider: 'imap',
        config: {
          provider: 'imap',
          credentials: {
            type: 'password',
            username: 'test@example.com',
            password: 'password'
          },
          host: 'imap.example.com',
          port: 993
        },
        offset: -5
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'offset',
        message: 'offset must be non-negative'
      });
    });

    it('should accept valid IMAP configuration', () => {
      const result = node.validateConfig({
        provider: 'imap',
        config: {
          provider: 'imap',
          credentials: {
            type: 'password',
            username: 'test@example.com',
            password: 'password'
          },
          host: 'imap.example.com',
          port: 993
        },
        folder: 'INBOX',
        limit: 10
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid Gmail OAuth2 configuration', () => {
      const result = node.validateConfig({
        provider: 'gmail',
        config: {
          provider: 'gmail',
          credentials: {
            type: 'oauth2',
            accessToken: 'test-token'
          }
        },
        unreadOnly: true,
        limit: 20
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate password credentials', () => {
      const result = node.validateConfig({
        provider: 'imap',
        config: {
          provider: 'imap',
          credentials: {
            type: 'password'
          },
          host: 'imap.example.com',
          port: 993
        }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'config.credentials.username',
        message: 'config.credentials.username is required for password authentication'
      });
      expect(result.errors).toContainEqual({
        field: 'config.credentials.password',
        message: 'config.credentials.password is required for password authentication'
      });
    });

    it('should validate OAuth2 credentials', () => {
      const result = node.validateConfig({
        provider: 'gmail',
        config: {
          provider: 'gmail',
          credentials: {
            type: 'oauth2'
          }
        }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'config.credentials.accessToken',
        message: 'config.credentials.accessToken is required for oauth2 authentication'
      });
    });

    it('should validate IMAP requires host and port', () => {
      const result = node.validateConfig({
        provider: 'imap',
        config: {
          provider: 'imap',
          credentials: {
            type: 'password',
            username: 'test@example.com',
            password: 'password'
          }
        }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'config.host',
        message: 'config.host is required for IMAP provider'
      });
      expect(result.errors).toContainEqual({
        field: 'config.port',
        message: 'config.port is required for IMAP provider'
      });
    });
  });

  describe('type', () => {
    it('should have correct type identifier', () => {
      expect(node.type).toBe('read-email');
    });
  });
});
