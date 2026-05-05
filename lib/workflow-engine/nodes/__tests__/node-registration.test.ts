/**
 * Test: Node Registration
 * 
 * Verifies that all action nodes are properly registered in the node registry.
 * 
 * Task 26: Register all action nodes
 * Requirement 20: Node Registry SHALL maintain a list of all available node types with their metadata
 */

import { nodeRegistry } from '../../registry';
import '../index'; // Import to trigger auto-registration

describe('Node Registration', () => {
  describe('Action Nodes Registration', () => {
    it('should register SendEmailNode', () => {
      expect(nodeRegistry.has('send-email')).toBe(true);
      const metadata = nodeRegistry.getMetadata('send-email');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Send Email');
      expect(metadata?.category).toBe('action');
    });

    it('should register ReadEmailNode', () => {
      expect(nodeRegistry.has('read-email')).toBe(true);
      const metadata = nodeRegistry.getMetadata('read-email');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Read Email');
      expect(metadata?.category).toBe('action');
    });

    it('should register AIChatNode', () => {
      expect(nodeRegistry.has('ai-chat')).toBe(true);
      const metadata = nodeRegistry.getMetadata('ai-chat');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('AI Chat');
      expect(metadata?.category).toBe('action');
    });

    it('should register AIClassifierNode', () => {
      expect(nodeRegistry.has('ai-classifier')).toBe(true);
      const metadata = nodeRegistry.getMetadata('ai-classifier');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('AI Classifier');
      expect(metadata?.category).toBe('action');
    });

    it('should register EmailFilterNode', () => {
      expect(nodeRegistry.has('email-filter')).toBe(true);
      const metadata = nodeRegistry.getMetadata('email-filter');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Email Filter');
      expect(metadata?.category).toBe('action');
    });

    it('should register EmailTemplateNode', () => {
      expect(nodeRegistry.has('email-template')).toBe(true);
      const metadata = nodeRegistry.getMetadata('email-template');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Email Template');
      expect(metadata?.category).toBe('action');
    });
  });

  describe('All Nodes Registration', () => {
    it('should register all 14 node types', () => {
      const allNodes = nodeRegistry.list();
      expect(allNodes.length).toBe(14);
    });

    it('should have complete metadata for all action nodes', () => {
      const actionNodes = [
        'send-email',
        'read-email',
        'ai-chat',
        'ai-classifier',
        'email-filter',
        'email-template',
      ];

      actionNodes.forEach((nodeType) => {
        const metadata = nodeRegistry.getMetadata(nodeType);
        expect(metadata).toBeDefined();
        expect(metadata?.type).toBe(nodeType);
        expect(metadata?.name).toBeTruthy();
        expect(metadata?.category).toBe('action');
        expect(metadata?.description).toBeTruthy();
        expect(metadata?.configSchema).toBeDefined();
        expect(metadata?.isSystem).toBe(true);
      });
    });

    it('should be able to create instances of all action nodes', () => {
      const actionNodes = [
        'send-email',
        'read-email',
        'ai-chat',
        'ai-classifier',
        'email-filter',
        'email-template',
      ];

      actionNodes.forEach((nodeType) => {
        const node = nodeRegistry.create(nodeType);
        expect(node).toBeDefined();
        expect(node.type).toBe(nodeType);
        expect(typeof node.execute).toBe('function');
        expect(typeof node.validateConfig).toBe('function');
      });
    });
  });

  describe('Node Registry API', () => {
    it('should list all registered nodes with categories', () => {
      const nodes = nodeRegistry.list();
      
      // Check that we have nodes from all categories
      const categories = new Set(nodes.map((n) => n.category));
      expect(categories.has('logic')).toBe(true);
      expect(categories.has('data')).toBe(true);
      expect(categories.has('action')).toBe(true);
    });

    it('should get all metadata', () => {
      const allMetadata = nodeRegistry.getAllMetadata();
      expect(allMetadata.length).toBe(14);
      
      // Verify each metadata has required fields
      allMetadata.forEach((meta) => {
        expect(meta.type).toBeTruthy();
        expect(meta.name).toBeTruthy();
        expect(meta.category).toBeTruthy();
        expect(meta.configSchema).toBeDefined();
      });
    });

    it('should return correct registry size', () => {
      expect(nodeRegistry.size).toBe(14);
    });
  });
});
