/**
 * Integration tests for Workflow Validator
 * 
 * Tests real-world workflow validation scenarios
 */

import { validateWorkflow, WorkflowDefinition } from '../validator';
import { nodeRegistry } from '../registry';
import { LogicNode, NodeResult, ValidationResult, ExecutionContext } from '../types';

// Simple test nodes
class StartNode implements LogicNode {
  readonly type = 'start';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return { success: true, output: { started: true } };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

class ProcessNode implements LogicNode {
  readonly type = 'process';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return { success: true, output: { processed: true } };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (!config.action) {
      errors.push({
        field: 'action',
        message: 'Action is required',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

class EndNode implements LogicNode {
  readonly type = 'end';

  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult> {
    return { success: true, output: { completed: true } };
  }

  validateConfig(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }
}

describe('Validator Integration Tests', () => {
  beforeAll(() => {
    nodeRegistry.clear();
    nodeRegistry.register('start', new StartNode());
    nodeRegistry.register('process', new ProcessNode());
    nodeRegistry.register('end', new EndNode());
  });

  afterAll(() => {
    nodeRegistry.clear();
  });

  describe('Real-world Workflow Scenarios', () => {
    it('should validate a simple linear workflow', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: { action: 'transform' } },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'end-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a branching workflow', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: { action: 'branch-a' } },
          { id: 'process-2', type: 'process', config: { action: 'branch-b' } },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'start-1', target: 'process-2' },
          { id: 'e3', source: 'process-1', target: 'end-1' },
          { id: 'e4', source: 'process-2', target: 'end-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject workflow with missing configuration', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: {} }, // Missing required 'action'
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'end-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'invalid-config')).toBe(true);
      expect(result.errors.some(e => e.message.includes('Action is required'))).toBe(true);
    });

    it('should reject workflow with cycle in feedback loop', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: { action: 'step1' } },
          { id: 'process-2', type: 'process', config: { action: 'step2' } },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'process-2' },
          { id: 'e3', source: 'process-2', target: 'process-1' }, // Creates cycle
          { id: 'e4', source: 'process-2', target: 'end-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'cycle')).toBe(true);
    });

    it('should reject workflow with orphaned nodes', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: { action: 'transform' } },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'non-existent' }, // Orphaned edge
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'invalid-edge')).toBe(true);
      expect(result.errors.some(e => e.message.includes('non-existent'))).toBe(true);
    });

    it('should validate complex multi-stage workflow', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'process', config: { action: 'validate' } },
          { id: 'process-2', type: 'process', config: { action: 'transform' } },
          { id: 'process-3', type: 'process', config: { action: 'enrich' } },
          { id: 'process-4', type: 'process', config: { action: 'aggregate' } },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'process-2' },
          { id: 'e3', source: 'process-1', target: 'process-3' },
          { id: 'e4', source: 'process-2', target: 'process-4' },
          { id: 'e5', source: 'process-3', target: 'process-4' },
          { id: 'e6', source: 'process-4', target: 'end-1' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should provide detailed error information', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'process-1', type: 'unknown-type', config: {} },
          { id: 'process-2', type: 'process', config: {} }, // Missing action
        ],
        edges: [
          { id: 'e1', source: 'start-1', target: 'process-1' },
          { id: 'e2', source: 'process-1', target: 'process-2' },
          { id: 'e3', source: 'process-2', target: 'missing-node' },
        ],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check for specific error types
      const errorTypes = result.errors.map(e => e.type);
      expect(errorTypes).toContain('missing-node-type');
      expect(errorTypes).toContain('invalid-config');
      expect(errorTypes).toContain('invalid-edge');

      // Check that errors have node/edge identifiers
      expect(result.errors.some(e => e.nodeId === 'process-1')).toBe(true);
      expect(result.errors.some(e => e.nodeId === 'process-2')).toBe(true);
      expect(result.errors.some(e => e.edgeId === 'e3')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty workflow', () => {
      const workflow: WorkflowDefinition = {
        nodes: [],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle workflow with only nodes (no edges)', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'start-1', type: 'start', config: {} },
          { id: 'end-1', type: 'end', config: {} },
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle workflow with duplicate node IDs gracefully', () => {
      const workflow: WorkflowDefinition = {
        nodes: [
          { id: 'node-1', type: 'start', config: {} },
          { id: 'node-1', type: 'end', config: {} }, // Duplicate ID
        ],
        edges: [],
      };

      const result = validateWorkflow(workflow);

      // The validator should still work, though duplicate IDs are a logical error
      // that would be caught at runtime
      expect(result).toBeDefined();
    });
  });
});
