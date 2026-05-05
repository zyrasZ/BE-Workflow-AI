/**
 * Unit tests for Workflow Validator
 * 
 * Tests validation logic for:
 * - Cycle detection using DFS
 * - Node type validation
 * - Node configuration validation
 * - Edge validation
 */

import {
  validateWorkflow,
  validateNodeConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
} from '../validator';
import { nodeRegistry } from '../registry';
import { LogicNode, NodeResult, ValidationResult, ExecutionContext } from '../types';

// Mock node for testing
class MockNode implements LogicNode {
  readonly type = 'mock-node';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return {
      success: true,
      output: { result: 'mock' },
    };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (config.required && !config.value) {
      errors.push({
        field: 'value',
        message: 'Value is required when required flag is set',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

describe('Workflow Validator', () => {
  beforeEach(() => {
    // Clear registry and register mock node
    nodeRegistry.clear();
    nodeRegistry.register('mock-node', new MockNode());
  });

  afterEach(() => {
    nodeRegistry.clear();
  });

  describe('validateWorkflow', () => {
    it('should validate a simple valid workflow', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
          { id: 'node-2', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject workflow with missing nodes array', () => {
      const workflow = {
        edges: [],
      } as any;

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nodes array');
    });

    it('should reject workflow with missing edges array', () => {
      const workflow = {
        nodes: [],
      } as any;

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('edges array');
    });
  });

  describe('Node Validation', () => {
    it('should reject node with missing id', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { type: 'mock-node', config: {} } as any,
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: id'))).toBe(true);
    });

    it('should reject node with missing type', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', config: {} } as any,
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: type'))).toBe(true);
    });

    it('should reject node with unknown type', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'unknown-type', config: {} },
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'missing-node-type')).toBe(true);
      expect(result.errors.some(e => e.message.includes('unknown type'))).toBe(true);
    });
  });

  describe('Edge Validation', () => {
    it('should reject edge with missing id', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
          { id: 'node-2', type: 'mock-node', config: {} },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' } as any,
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: id'))).toBe(true);
    });

    it('should reject edge with missing source', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
          { id: 'node-2', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', target: 'node-2' } as any,
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: source'))).toBe(true);
    });

    it('should reject edge with missing target', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
          { id: 'node-2', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1' } as any,
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing required field: target'))).toBe(true);
    });

    it('should reject edge with non-existent source node', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'non-existent', target: 'node-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('non-existent source node'))).toBe(true);
    });

    it('should reject edge with non-existent target node', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'non-existent' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('non-existent target node'))).toBe(true);
    });

    it('should reject self-loop edges', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'cycle')).toBe(true);
      expect(result.errors.some(e => e.message.includes('self-loop'))).toBe(true);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycle (A → B → A)', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-a', type: 'mock-node', config: {} },
          { id: 'node-b', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-a', target: 'node-b' },
          { id: 'edge-2', source: 'node-b', target: 'node-a' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'cycle')).toBe(true);
      expect(result.errors.some(e => e.message.includes('cycle'))).toBe(true);
    });

    it('should detect complex cycle (A → B → C → A)', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-a', type: 'mock-node', config: {} },
          { id: 'node-b', type: 'mock-node', config: {} },
          { id: 'node-c', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-a', target: 'node-b' },
          { id: 'edge-2', source: 'node-b', target: 'node-c' },
          { id: 'edge-3', source: 'node-c', target: 'node-a' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'cycle')).toBe(true);
    });

    it('should allow DAG without cycles', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-a', type: 'mock-node', config: {} },
          { id: 'node-b', type: 'mock-node', config: {} },
          { id: 'node-c', type: 'mock-node', config: {} },
          { id: 'node-d', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-a', target: 'node-b' },
          { id: 'edge-2', source: 'node-a', target: 'node-c' },
          { id: 'edge-3', source: 'node-b', target: 'node-d' },
          { id: 'edge-4', source: 'node-c', target: 'node-d' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle disconnected components', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-a', type: 'mock-node', config: {} },
          { id: 'node-b', type: 'mock-node', config: {} },
          { id: 'node-c', type: 'mock-node', config: {} },
          { id: 'node-d', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-a', target: 'node-b' },
          { id: 'edge-2', source: 'node-c', target: 'node-d' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate node configurations', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: { required: true, value: 'test' } },
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid node configurations', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node', config: { required: true } },
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'invalid-config')).toBe(true);
      expect(result.errors.some(e => e.message.includes('Value is required'))).toBe(true);
    });

    it('should handle missing config gracefully', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'mock-node' } as any,
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateNodeConfig', () => {
    it('should validate valid config', () => {
      const result = validateNodeConfig('mock-node', { required: true, value: 'test' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid config', () => {
      const result = validateNodeConfig('mock-node', { required: true });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject unknown node type', () => {
      const result = validateNodeConfig('unknown-type', {});

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Unknown node type'))).toBe(true);
    });
  });

  describe('Complex Workflow Scenarios', () => {
    it('should validate workflow with multiple branches', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start', type: 'mock-node', config: {} },
          { id: 'branch-1', type: 'mock-node', config: {} },
          { id: 'branch-2', type: 'mock-node', config: {} },
          { id: 'merge', type: 'mock-node', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'start', target: 'branch-1' },
          { id: 'edge-2', source: 'start', target: 'branch-2' },
          { id: 'edge-3', source: 'branch-1', target: 'merge' },
          { id: 'edge-4', source: 'branch-2', target: 'merge' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple errors', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'unknown-type', config: {} },
          { id: 'node-2', type: 'mock-node', config: { required: true } },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'non-existent' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
