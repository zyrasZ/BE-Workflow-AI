/**
 * Unit tests for NodeRegistry
 * 
 * Tests the core functionality of the NodeRegistry class including:
 * - Node registration and validation
 * - Node creation and retrieval
 * - Node type checking
 * - Listing registered nodes
 * - Metadata management
 * 
 * Requirement 20: Node Registry and SDK
 */

import { NodeRegistry } from '../registry';
import { LogicNode, NodeResult, ExecutionContext, ValidationResult } from '../types';

/**
 * Mock node implementation for testing
 */
class MockNode implements LogicNode {
  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return {
      success: true,
      output: { result: 'mock output' },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return {
      valid: true,
      errors: [],
    };
  }
}

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new NodeRegistry();
  });

  describe('register()', () => {
    it('should register a new node type successfully', () => {
      const mockNode = new MockNode('test-node');
      
      expect(() => {
        registry.register('test-node', mockNode);
      }).not.toThrow();

      expect(registry.has('test-node')).toBe(true);
    });

    it('should throw error when registering duplicate node type', () => {
      const mockNode1 = new MockNode('test-node');
      const mockNode2 = new MockNode('test-node');

      registry.register('test-node', mockNode1);

      expect(() => {
        registry.register('test-node', mockNode2);
      }).toThrow("Node type 'test-node' is already registered");
    });

    it('should throw error when node does not have type property', () => {
      const invalidNode = {
        execute: async () => ({ success: true, output: {} }),
        validateConfig: () => ({ valid: true, errors: [] }),
      } as any;

      expect(() => {
        registry.register('invalid-node', invalidNode);
      }).toThrow("Node must have a 'type' property");
    });

    it('should throw error when node does not implement execute method', () => {
      const invalidNode = {
        type: 'invalid-node',
        validateConfig: () => ({ valid: true, errors: [] }),
      } as any;

      expect(() => {
        registry.register('invalid-node', invalidNode);
      }).toThrow("Node 'invalid-node' must implement execute() method");
    });

    it('should throw error when node does not implement validateConfig method', () => {
      const invalidNode = {
        type: 'invalid-node',
        execute: async () => ({ success: true, output: {} }),
      } as any;

      expect(() => {
        registry.register('invalid-node', invalidNode);
      }).toThrow("Node 'invalid-node' must implement validateConfig() method");
    });

    it('should throw error when node type does not match registration type', () => {
      const mockNode = new MockNode('actual-type');

      expect(() => {
        registry.register('different-type', mockNode);
      }).toThrow("Node type mismatch: registering as 'different-type' but node.type is 'actual-type'");
    });

    it('should store metadata when provided', () => {
      const mockNode = new MockNode('test-node');
      const metadata = {
        name: 'Test Node',
        category: 'logic' as const,
        description: 'A test node',
        configSchema: { type: 'object' },
        isSystem: true,
      };

      registry.register('test-node', mockNode, metadata);

      const storedMetadata = registry.getMetadata('test-node');
      expect(storedMetadata).toBeDefined();
      expect(storedMetadata?.name).toBe('Test Node');
      expect(storedMetadata?.category).toBe('logic');
      expect(storedMetadata?.description).toBe('A test node');
    });
  });

  describe('create()', () => {
    it('should create and return a registered node instance', () => {
      const mockNode = new MockNode('test-node');
      registry.register('test-node', mockNode);

      const createdNode = registry.create('test-node');

      expect(createdNode).toBe(mockNode);
      expect(createdNode.type).toBe('test-node');
    });

    it('should throw error when creating unregistered node type', () => {
      expect(() => {
        registry.create('non-existent-node');
      }).toThrow("Unknown node type: 'non-existent-node'");
    });
  });

  describe('has()', () => {
    it('should return true for registered node types', () => {
      const mockNode = new MockNode('test-node');
      registry.register('test-node', mockNode);

      expect(registry.has('test-node')).toBe(true);
    });

    it('should return false for unregistered node types', () => {
      expect(registry.has('non-existent-node')).toBe(false);
    });
  });

  describe('list()', () => {
    it('should return empty array when no nodes are registered', () => {
      const list = registry.list();

      expect(list).toEqual([]);
    });

    it('should return list of registered node types with categories', () => {
      const node1 = new MockNode('node-1');
      const node2 = new MockNode('node-2');

      registry.register('node-1', node1, { category: 'logic' });
      registry.register('node-2', node2, { category: 'data' });

      const list = registry.list();

      expect(list).toHaveLength(2);
      expect(list).toContainEqual({ type: 'node-1', category: 'logic' });
      expect(list).toContainEqual({ type: 'node-2', category: 'data' });
    });

    it('should return "unknown" category when metadata is not provided', () => {
      const mockNode = new MockNode('test-node');
      registry.register('test-node', mockNode);

      const list = registry.list();

      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({ type: 'test-node', category: 'unknown' });
    });
  });

  describe('getMetadata()', () => {
    it('should return metadata for registered node', () => {
      const mockNode = new MockNode('test-node');
      const metadata = {
        name: 'Test Node',
        category: 'logic' as const,
        description: 'A test node',
        configSchema: { type: 'object' },
      };

      registry.register('test-node', mockNode, metadata);

      const retrieved = registry.getMetadata('test-node');

      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('test-node');
      expect(retrieved?.name).toBe('Test Node');
      expect(retrieved?.category).toBe('logic');
    });

    it('should return undefined for unregistered node', () => {
      const metadata = registry.getMetadata('non-existent');

      expect(metadata).toBeUndefined();
    });
  });

  describe('getAllMetadata()', () => {
    it('should return empty array when no nodes are registered', () => {
      const allMetadata = registry.getAllMetadata();

      expect(allMetadata).toEqual([]);
    });

    it('should return all registered node metadata', () => {
      const node1 = new MockNode('node-1');
      const node2 = new MockNode('node-2');

      registry.register('node-1', node1, { name: 'Node 1', category: 'logic' });
      registry.register('node-2', node2, { name: 'Node 2', category: 'data' });

      const allMetadata = registry.getAllMetadata();

      expect(allMetadata).toHaveLength(2);
      expect(allMetadata.find(m => m.type === 'node-1')).toBeDefined();
      expect(allMetadata.find(m => m.type === 'node-2')).toBeDefined();
    });
  });

  describe('unregister()', () => {
    it('should unregister an existing node type', () => {
      const mockNode = new MockNode('test-node');
      registry.register('test-node', mockNode);

      const result = registry.unregister('test-node');

      expect(result).toBe(true);
      expect(registry.has('test-node')).toBe(false);
    });

    it('should return false when unregistering non-existent node', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should remove both node and metadata', () => {
      const mockNode = new MockNode('test-node');
      registry.register('test-node', mockNode, { name: 'Test Node', category: 'logic' });

      registry.unregister('test-node');

      expect(registry.has('test-node')).toBe(false);
      expect(registry.getMetadata('test-node')).toBeUndefined();
    });
  });

  describe('clear()', () => {
    it('should remove all registered nodes', () => {
      const node1 = new MockNode('node-1');
      const node2 = new MockNode('node-2');

      registry.register('node-1', node1);
      registry.register('node-2', node2);

      registry.clear();

      expect(registry.has('node-1')).toBe(false);
      expect(registry.has('node-2')).toBe(false);
      expect(registry.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('should return correct count of registered nodes', () => {
      const node1 = new MockNode('node-1');
      const node2 = new MockNode('node-2');
      const node3 = new MockNode('node-3');

      registry.register('node-1', node1);
      registry.register('node-2', node2);
      registry.register('node-3', node3);

      expect(registry.size).toBe(3);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton nodeRegistry instance', () => {
      const { nodeRegistry } = require('../registry');

      expect(nodeRegistry).toBeInstanceOf(NodeRegistry);
    });
  });
});
