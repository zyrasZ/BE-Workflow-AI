/**
 * Unit tests for ExecutionContext
 * 
 * Tests Requirement 21: Execution Context Management
 */

import { ExecutionContextImpl } from '../context';

describe('ExecutionContext', () => {
  let context: ExecutionContextImpl;

  beforeEach(() => {
    context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');
  });

  describe('Constructor', () => {
    it('should initialize with correct IDs', () => {
      expect(context.userId).toBe('user-123');
      expect(context.workflowId).toBe('workflow-456');
      expect(context.executionId).toBe('exec-789');
    });

    it('should initialize with empty variables', () => {
      expect(context.variables).toEqual({});
    });

    it('should initialize with empty nodeOutputs Map', () => {
      expect(context.nodeOutputs.size).toBe(0);
    });

    it('should initialize with empty executionPath', () => {
      expect(context.executionPath).toEqual([]);
    });

    it('should initialize with empty currentNodeId', () => {
      expect(context.currentNodeId).toBe('');
    });
  });

  describe('setVariable and getVariable', () => {
    it('should set and get a simple variable', () => {
      context.setVariable('name', 'John');
      expect(context.getVariable('name')).toBe('John');
    });

    it('should set and get multiple variables', () => {
      context.setVariable('name', 'John');
      context.setVariable('age', 30);
      context.setVariable('active', true);

      expect(context.getVariable('name')).toBe('John');
      expect(context.getVariable('age')).toBe(30);
      expect(context.getVariable('active')).toBe(true);
    });

    it('should return undefined for non-existent variable', () => {
      expect(context.getVariable('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing variable', () => {
      context.setVariable('name', 'John');
      context.setVariable('name', 'Jane');
      expect(context.getVariable('name')).toBe('Jane');
    });

    it('should store complex objects', () => {
      const user = { name: 'John', email: 'john@example.com' };
      context.setVariable('user', user);
      expect(context.getVariable('user')).toEqual(user);
    });

    it('should store arrays', () => {
      const items = [1, 2, 3, 4, 5];
      context.setVariable('items', items);
      expect(context.getVariable('items')).toEqual(items);
    });
  });

  describe('getNodeOutput', () => {
    it('should return undefined for non-existent node', () => {
      expect(context.getNodeOutput('node-1')).toBeUndefined();
    });

    it('should return node output after it is set', () => {
      const output = { result: 'success', data: 123 };
      context.nodeOutputs.set('node-1', output);
      expect(context.getNodeOutput('node-1')).toEqual(output);
    });

    it('should return different outputs for different nodes', () => {
      context.nodeOutputs.set('node-1', { value: 'A' });
      context.nodeOutputs.set('node-2', { value: 'B' });

      expect(context.getNodeOutput('node-1')).toEqual({ value: 'A' });
      expect(context.getNodeOutput('node-2')).toEqual({ value: 'B' });
    });
  });

  describe('resolveExpression', () => {
    beforeEach(() => {
      context.setVariable('name', 'John');
      context.setVariable('age', 30);
      context.setVariable('price', 100);
      context.setVariable('quantity', 5);
      context.nodeOutputs.set('node-1', { email: 'john@example.com', status: 'active' });
      context.nodeOutputs.set('node-2', { result: 'success', count: 42 });
    });

    it('should return non-expression values as-is', () => {
      expect(context.resolveExpression('plain text')).toBe('plain text');
      expect(context.resolveExpression('123')).toBe('123');
    });

    it('should resolve simple variable expression', () => {
      expect(context.resolveExpression('{{variables.name}}')).toBe('John');
      expect(context.resolveExpression('{{variables.age}}')).toBe(30);
    });

    it('should resolve node output expression', () => {
      expect(context.resolveExpression('{{node-1.output.email}}')).toBe('john@example.com');
      expect(context.resolveExpression('{{node-2.output.count}}')).toBe(42);
    });

    it('should resolve node output without .output prefix', () => {
      expect(context.resolveExpression('{{node-1.email}}')).toBe('john@example.com');
      expect(context.resolveExpression('{{node-2.result}}')).toBe('success');
    });

    it('should resolve arithmetic expressions', () => {
      expect(context.resolveExpression('{{variables.price * variables.quantity}}')).toBe(500);
      expect(context.resolveExpression('{{variables.age + 10}}')).toBe(40);
    });

    it('should resolve conditional expressions', () => {
      expect(context.resolveExpression('{{variables.age > 18 ? "adult" : "minor"}}')).toBe('adult');
    });

    it('should resolve string concatenation in template', () => {
      const result = context.resolveExpression('Hello {{variables.name}}, you are {{variables.age}} years old');
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should handle multiple expressions in one string', () => {
      const result = context.resolveExpression('{{variables.name}} - {{node-1.email}}');
      expect(result).toBe('John - john@example.com');
    });

    it('should return undefined for invalid expressions', () => {
      expect(context.resolveExpression('{{variables.nonexistent}}')).toBeUndefined();
    });

    it('should handle expressions with undefined values gracefully', () => {
      const result = context.resolveExpression('Value: {{variables.missing}}');
      expect(result).toBe('Value: ');
    });

    it('should return non-string values as-is', () => {
      expect(context.resolveExpression(123 as any)).toBe(123);
      expect(context.resolveExpression(null as any)).toBe(null);
      expect(context.resolveExpression(undefined as any)).toBe(undefined);
    });
  });

  describe('getValueByPath', () => {
    beforeEach(() => {
      context.setVariable('user', { name: 'John', email: 'john@example.com' });
      context.nodeOutputs.set('node-1', { result: { status: 'success', code: 200 } });
    });

    it('should get value from variables by path', () => {
      expect(context.getValueByPath('variables.user.name')).toBe('John');
      expect(context.getValueByPath('variables.user.email')).toBe('john@example.com');
    });

    it('should get value from nodeOutputs by path', () => {
      expect(context.getValueByPath('nodeOutputs.node-1.result.status')).toBe('success');
      expect(context.getValueByPath('nodeOutputs.node-1.result.code')).toBe(200);
    });

    it('should return undefined for non-existent path', () => {
      expect(context.getValueByPath('variables.nonexistent')).toBeUndefined();
      expect(context.getValueByPath('variables.user.nonexistent')).toBeUndefined();
    });
  });

  describe('setValueByPath', () => {
    it('should set simple variable by path', () => {
      context.setValueByPath('variables.name', 'Jane');
      expect(context.getVariable('name')).toBe('Jane');
    });

    it('should set nested variable by path', () => {
      context.setValueByPath('variables.user.name', 'Jane');
      expect(context.variables.user.name).toBe('Jane');
    });

    it('should create nested objects if they do not exist', () => {
      context.setValueByPath('variables.config.api.url', 'https://api.example.com');
      expect(context.variables.config.api.url).toBe('https://api.example.com');
    });

    it('should set variable directly if path does not start with variables', () => {
      context.setValueByPath('name', 'Jane');
      expect(context.getVariable('name')).toBe('Jane');
    });
  });

  describe('mergeData', () => {
    it('should merge new data into variables', () => {
      context.setVariable('name', 'John');
      context.mergeData({ age: 30, city: 'New York' });

      expect(context.getVariable('name')).toBe('John');
      expect(context.getVariable('age')).toBe(30);
      expect(context.getVariable('city')).toBe('New York');
    });

    it('should overwrite existing variables', () => {
      context.setVariable('name', 'John');
      context.mergeData({ name: 'Jane' });

      expect(context.getVariable('name')).toBe('Jane');
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should serialize to JSON', () => {
      context.setVariable('name', 'John');
      context.nodeOutputs.set('node-1', { result: 'success' });
      context.currentNodeId = 'node-2';
      context.executionPath = ['node-1', 'node-2'];

      const json = context.toJSON();

      expect(json.userId).toBe('user-123');
      expect(json.workflowId).toBe('workflow-456');
      expect(json.executionId).toBe('exec-789');
      expect(json.variables).toEqual({ name: 'John' });
      expect(json.nodeOutputs).toEqual({ 'node-1': { result: 'success' } });
      expect(json.currentNodeId).toBe('node-2');
      expect(json.executionPath).toEqual(['node-1', 'node-2']);
    });

    it('should deserialize from JSON', () => {
      const json = {
        userId: 'user-123',
        workflowId: 'workflow-456',
        executionId: 'exec-789',
        variables: { name: 'John' },
        nodeOutputs: { 'node-1': { result: 'success' } },
        currentNodeId: 'node-2',
        executionPath: ['node-1', 'node-2'],
      };

      const restored = ExecutionContextImpl.fromJSON(json);

      expect(restored.userId).toBe('user-123');
      expect(restored.workflowId).toBe('workflow-456');
      expect(restored.executionId).toBe('exec-789');
      expect(restored.getVariable('name')).toBe('John');
      expect(restored.getNodeOutput('node-1')).toEqual({ result: 'success' });
      expect(restored.currentNodeId).toBe('node-2');
      expect(restored.executionPath).toEqual(['node-1', 'node-2']);
    });

    it('should handle empty data in fromJSON', () => {
      const json = {
        userId: 'user-123',
        workflowId: 'workflow-456',
        executionId: 'exec-789',
      };

      const restored = ExecutionContextImpl.fromJSON(json);

      expect(restored.variables).toEqual({});
      expect(restored.nodeOutputs.size).toBe(0);
      expect(restored.currentNodeId).toBe('');
      expect(restored.executionPath).toEqual([]);
    });
  });

  describe('clone', () => {
    it('should create a shallow copy of the context', () => {
      context.setVariable('name', 'John');
      context.nodeOutputs.set('node-1', { result: 'success' });
      context.currentNodeId = 'node-2';
      context.executionPath = ['node-1', 'node-2'];

      const cloned = context.clone();

      expect(cloned.userId).toBe(context.userId);
      expect(cloned.workflowId).toBe(context.workflowId);
      expect(cloned.executionId).toBe(context.executionId);
      expect(cloned.getVariable('name')).toBe('John');
      expect(cloned.getNodeOutput('node-1')).toEqual({ result: 'success' });
      expect(cloned.currentNodeId).toBe('node-2');
      expect(cloned.executionPath).toEqual(['node-1', 'node-2']);
    });

    it('should create independent copy', () => {
      context.setVariable('name', 'John');
      const cloned = context.clone();

      cloned.setVariable('name', 'Jane');
      cloned.setVariable('age', 30);

      expect(context.getVariable('name')).toBe('John');
      expect(context.getVariable('age')).toBeUndefined();
      expect(cloned.getVariable('name')).toBe('Jane');
      expect(cloned.getVariable('age')).toBe(30);
    });
  });

  describe('clear', () => {
    it('should clear all data from context', () => {
      context.setVariable('name', 'John');
      context.nodeOutputs.set('node-1', { result: 'success' });
      context.currentNodeId = 'node-2';
      context.executionPath = ['node-1', 'node-2'];

      context.clear();

      expect(context.variables).toEqual({});
      expect(context.nodeOutputs.size).toBe(0);
      expect(context.currentNodeId).toBe('');
      expect(context.executionPath).toEqual([]);
    });

    it('should not clear immutable IDs', () => {
      context.clear();

      expect(context.userId).toBe('user-123');
      expect(context.workflowId).toBe('workflow-456');
      expect(context.executionId).toBe('exec-789');
    });
  });

  describe('Execution path tracking', () => {
    it('should track execution path', () => {
      context.executionPath.push('node-1');
      context.executionPath.push('node-2');
      context.executionPath.push('node-3');

      expect(context.executionPath).toEqual(['node-1', 'node-2', 'node-3']);
    });

    it('should maintain execution history', () => {
      context.currentNodeId = 'node-1';
      context.executionPath.push('node-1');
      
      context.currentNodeId = 'node-2';
      context.executionPath.push('node-2');

      expect(context.executionPath.length).toBe(2);
      expect(context.currentNodeId).toBe('node-2');
    });
  });
});
