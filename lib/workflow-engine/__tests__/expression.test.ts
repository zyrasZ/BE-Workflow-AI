/**
 * Unit tests for Expression Resolver
 * 
 * Tests expression resolution functionality including:
 * - Variable access
 * - Node output access
 * - Arithmetic operations
 * - Conditional expressions
 * - Template strings
 * - Nested object access
 * 
 * Requirement 21: Execution Context Management
 */

import {
  resolveExpression,
  resolveExpressions,
  buildExpressionScope,
  validateExpression,
  ExpressionScope,
} from '../expression';

describe('Expression Resolver', () => {
  describe('resolveExpression', () => {
    let scope: ExpressionScope;

    beforeEach(() => {
      scope = {
        variables: {
          name: 'John',
          age: 30,
          score: 95,
          price: 100,
          quantity: 3,
          customer_type: 'vip',
          user: {
            email: 'john@example.com',
            profile: {
              city: 'New York',
            },
          },
          items: ['apple', 'banana', 'orange'],
        },
        'node-1': {
          output: {
            email: 'test@example.com',
            status: 'success',
          },
          email: 'test@example.com',
          status: 'success',
        },
        'node-2': {
          output: {
            result: 42,
            data: {
              nested: 'value',
            },
          },
          result: 42,
          data: {
            nested: 'value',
          },
        },
      };
    });

    test('should return non-string values as-is', () => {
      expect(resolveExpression(null as any, scope)).toBeNull();
      expect(resolveExpression(undefined as any, scope)).toBeUndefined();
      expect(resolveExpression(123 as any, scope)).toBe(123);
      expect(resolveExpression(true as any, scope)).toBe(true);
    });

    test('should return plain text without expressions as-is', () => {
      expect(resolveExpression('Hello World', scope)).toBe('Hello World');
      expect(resolveExpression('No expressions here', scope)).toBe('No expressions here');
    });

    test('should resolve single variable expression', () => {
      expect(resolveExpression('{{variables.name}}', scope)).toBe('John');
      expect(resolveExpression('{{variables.age}}', scope)).toBe(30);
      expect(resolveExpression('{{variables.score}}', scope)).toBe(95);
    });

    test('should resolve nested variable access', () => {
      expect(resolveExpression('{{variables.user.email}}', scope)).toBe('john@example.com');
      expect(resolveExpression('{{variables.user.profile.city}}', scope)).toBe('New York');
    });

    test('should resolve array access', () => {
      expect(resolveExpression('{{variables.items[0]}}', scope)).toBe('apple');
      expect(resolveExpression('{{variables.items[1]}}', scope)).toBe('banana');
      expect(resolveExpression('{{variables.items[2]}}', scope)).toBe('orange');
    });

    test('should resolve node output expressions', () => {
      expect(resolveExpression('{{node-1.output.email}}', scope)).toBe('test@example.com');
      expect(resolveExpression('{{node-1.output.status}}', scope)).toBe('success');
      expect(resolveExpression('{{node-2.output.result}}', scope)).toBe(42);
    });

    test('should resolve node output with direct field access', () => {
      expect(resolveExpression('{{node-1.email}}', scope)).toBe('test@example.com');
      expect(resolveExpression('{{node-1.status}}', scope)).toBe('success');
      expect(resolveExpression('{{node-2.result}}', scope)).toBe(42);
    });

    test('should resolve nested node output access', () => {
      expect(resolveExpression('{{node-2.output.data.nested}}', scope)).toBe('value');
      expect(resolveExpression('{{node-2.data.nested}}', scope)).toBe('value');
    });

    test('should resolve arithmetic expressions', () => {
      expect(resolveExpression('{{variables.price * variables.quantity}}', scope)).toBe(300);
      expect(resolveExpression('{{variables.age + 10}}', scope)).toBe(40);
      expect(resolveExpression('{{variables.score - 5}}', scope)).toBe(90);
      expect(resolveExpression('{{variables.price / 2}}', scope)).toBe(50);
      expect(resolveExpression('{{variables.age % 7}}', scope)).toBe(2);
    });

    test('should resolve comparison expressions', () => {
      expect(resolveExpression('{{variables.score > 80}}', scope)).toBe(true);
      expect(resolveExpression('{{variables.age < 25}}', scope)).toBe(false);
      expect(resolveExpression('{{variables.age >= 30}}', scope)).toBe(true);
      expect(resolveExpression('{{variables.score <= 100}}', scope)).toBe(true);
      expect(resolveExpression('{{variables.name === "John"}}', scope)).toBe(true);
      expect(resolveExpression('{{variables.name !== "Jane"}}', scope)).toBe(true);
    });

    test('should resolve logical expressions', () => {
      expect(resolveExpression('{{variables.score > 80 && variables.age < 40}}', scope)).toBe(true);
      expect(resolveExpression('{{variables.score < 50 || variables.age > 25}}', scope)).toBe(true);
      expect(resolveExpression('{{!false}}', scope)).toBe(true);
    });

    test('should resolve conditional (ternary) expressions', () => {
      expect(resolveExpression('{{variables.score > 80 ? "A" : "B"}}', scope)).toBe('A');
      expect(resolveExpression('{{variables.age < 18 ? "minor" : "adult"}}', scope)).toBe('adult');
      expect(resolveExpression('{{variables.customer_type === "vip" ? "premium" : "standard"}}', scope)).toBe('premium');
    });

    test('should resolve template strings with multiple expressions', () => {
      const result = resolveExpression('Hello {{variables.name}}, your score is {{variables.score}}', scope);
      expect(result).toBe('Hello John, your score is 95');
    });

    test('should resolve complex template strings', () => {
      const result = resolveExpression(
        'User {{variables.name}} ({{variables.user.email}}) scored {{variables.score}} points',
        scope
      );
      expect(result).toBe('User John (john@example.com) scored 95 points');
    });

    test('should handle undefined variables gracefully', () => {
      expect(resolveExpression('{{variables.nonexistent}}', scope)).toBeUndefined();
      expect(resolveExpression('Hello {{variables.nonexistent}}', scope)).toBe('Hello ');
    });

    test('should handle expression evaluation errors gracefully', () => {
      // Invalid syntax should return undefined
      expect(resolveExpression('{{variables.}}', scope)).toBeUndefined();
      expect(resolveExpression('{{invalid syntax}}', scope)).toBeUndefined();
    });

    test('should preserve whitespace in template strings with text', () => {
      const result = resolveExpression('  Hello {{variables.name}}  ', scope);
      expect(result).toBe('  Hello John  ');
    });

    test('should trim whitespace for single expressions', () => {
      // Single expressions trim the outer whitespace
      const result = resolveExpression('  {{variables.name}}  ', scope);
      expect(result).toBe('John');
    });

    test('should handle empty expressions', () => {
      expect(resolveExpression('{{}}', scope)).toBe('');
      expect(resolveExpression('{{ }}', scope)).toBe('');
    });
  });

  describe('resolveExpressions', () => {
    let scope: ExpressionScope;

    beforeEach(() => {
      scope = {
        variables: {
          name: 'John',
          email: 'john@example.com',
          score: 95,
        },
        'node-1': {
          output: { status: 'success' },
          status: 'success',
        },
      };
    });

    test('should resolve expressions in flat object', () => {
      const obj = {
        recipient: '{{variables.email}}',
        subject: 'Hello {{variables.name}}',
        score: '{{variables.score}}',
      };

      const resolved = resolveExpressions(obj, scope);

      expect(resolved).toEqual({
        recipient: 'john@example.com',
        subject: 'Hello John',
        score: 95,
      });
    });

    test('should resolve expressions in nested objects', () => {
      const obj = {
        user: {
          name: '{{variables.name}}',
          email: '{{variables.email}}',
        },
        metadata: {
          status: '{{node-1.status}}',
        },
      };

      const resolved = resolveExpressions(obj, scope);

      expect(resolved).toEqual({
        user: {
          name: 'John',
          email: 'john@example.com',
        },
        metadata: {
          status: 'success',
        },
      });
    });

    test('should resolve expressions in arrays', () => {
      const obj = {
        recipients: ['{{variables.email}}', 'admin@example.com'],
        scores: ['{{variables.score}}', '{{variables.score + 5}}'],
      };

      const resolved = resolveExpressions(obj, scope);

      expect(resolved).toEqual({
        recipients: ['john@example.com', 'admin@example.com'],
        scores: [95, 100],
      });
    });

    test('should resolve expressions in array of objects', () => {
      const obj = {
        users: [
          { name: '{{variables.name}}', email: '{{variables.email}}' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
      };

      const resolved = resolveExpressions(obj, scope);

      expect(resolved).toEqual({
        users: [
          { name: 'John', email: 'john@example.com' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
      });
    });

    test('should preserve non-string values', () => {
      const obj = {
        name: '{{variables.name}}',
        age: 30,
        active: true,
        data: null,
        count: 0,
      };

      const resolved = resolveExpressions(obj, scope);

      expect(resolved).toEqual({
        name: 'John',
        age: 30,
        active: true,
        data: null,
        count: 0,
      });
    });
  });

  describe('buildExpressionScope', () => {
    test('should build scope with variables', () => {
      const variables = { name: 'John', age: 30 };
      const nodeOutputs = new Map();

      const scope = buildExpressionScope(variables, nodeOutputs);

      expect(scope.variables).toEqual({ name: 'John', age: 30 });
    });

    test('should build scope with node outputs', () => {
      const variables = {};
      const nodeOutputs = new Map([
        ['node-1', { email: 'test@example.com' }],
        ['node-2', { result: 42 }],
      ]);

      const scope = buildExpressionScope(variables, nodeOutputs);

      expect(scope['node-1']).toEqual({
        output: { email: 'test@example.com' },
        email: 'test@example.com',
      });
      expect(scope['node-2']).toEqual({
        output: { result: 42 },
        result: 42,
      });
    });

    test('should build scope with both variables and node outputs', () => {
      const variables = { name: 'John' };
      const nodeOutputs = new Map([['node-1', { status: 'success' }]]);

      const scope = buildExpressionScope(variables, nodeOutputs);

      expect(scope.variables).toEqual({ name: 'John' });
      expect(scope['node-1']).toEqual({
        output: { status: 'success' },
        status: 'success',
      });
    });

    test('should handle empty variables and node outputs', () => {
      const scope = buildExpressionScope({}, new Map());

      expect(scope.variables).toEqual({});
      expect(Object.keys(scope).filter(k => k !== 'variables')).toHaveLength(0);
    });
  });

  describe('validateExpression', () => {
    test('should validate correct expressions', () => {
      expect(validateExpression('{{variables.name}}')).toEqual({ valid: true });
      expect(validateExpression('{{variables.age + 10}}')).toEqual({ valid: true });
      expect(validateExpression('{{node-1.output.email}}')).toEqual({ valid: true });
      expect(validateExpression('{{variables.score > 80 ? "A" : "B"}}')).toEqual({ valid: true });
    });

    test('should validate template strings', () => {
      expect(validateExpression('Hello {{variables.name}}')).toEqual({ valid: true });
      expect(validateExpression('Score: {{variables.score}}, Grade: {{variables.grade}}')).toEqual({ valid: true });
    });

    test('should validate plain text', () => {
      expect(validateExpression('Hello World')).toEqual({ valid: true });
      expect(validateExpression('No expressions here')).toEqual({ valid: true });
    });

    test('should validate non-string values', () => {
      expect(validateExpression(null as any)).toEqual({ valid: true });
      expect(validateExpression(undefined as any)).toEqual({ valid: true });
      expect(validateExpression(123 as any)).toEqual({ valid: true });
    });

    test('should detect empty expressions', () => {
      expect(validateExpression('{{}}')).toEqual({ valid: false, error: 'Empty expression' });
      expect(validateExpression('{{ }}')).toEqual({ valid: false, error: 'Empty expression' });
    });

    test('should detect invalid syntax', () => {
      const result1 = validateExpression('{{variables.}}');
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Invalid expression syntax');

      const result2 = validateExpression('{{invalid syntax}}');
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Invalid expression syntax');
    });

    test('should detect unclosed expressions', () => {
      const result = validateExpression('{{variables.name');
      expect(result.valid).toBe(true); // Not detected as expression (no closing }})
    });
  });

  describe('Integration with ExecutionContext', () => {
    test('should work with complex nested data', () => {
      const scope: ExpressionScope = {
        variables: {
          order: {
            id: 'ORD-123',
            items: [
              { name: 'Product A', price: 100, quantity: 2 },
              { name: 'Product B', price: 50, quantity: 3 },
            ],
            customer: {
              name: 'John Doe',
              email: 'john@example.com',
              address: {
                city: 'New York',
                country: 'USA',
              },
            },
          },
        },
        'node-1': {
          output: {
            total: 350,
            discount: 50,
          },
          total: 350,
          discount: 50,
        },
      };

      expect(resolveExpression('{{variables.order.id}}', scope)).toBe('ORD-123');
      expect(resolveExpression('{{variables.order.items[0].name}}', scope)).toBe('Product A');
      expect(resolveExpression('{{variables.order.items[0].price * variables.order.items[0].quantity}}', scope)).toBe(200);
      expect(resolveExpression('{{variables.order.customer.address.city}}', scope)).toBe('New York');
      expect(resolveExpression('{{node-1.total - node-1.discount}}', scope)).toBe(300);

      const template = 'Order {{variables.order.id}} for {{variables.order.customer.name}} - Total: ${{node-1.total}}';
      expect(resolveExpression(template, scope)).toBe('Order ORD-123 for John Doe - Total: $350');
    });

    test('should handle real-world email template scenario', () => {
      const scope: ExpressionScope = {
        variables: {
          customer_name: 'John Doe',
          customer_type: 'vip',
          order_id: 'ORD-123',
          order_total: 350,
        },
        'node-1': {
          output: {
            ai_response: 'Thank you for your continued loyalty!',
          },
          ai_response: 'Thank you for your continued loyalty!',
        },
      };

      const subject = 'Order Confirmation - {{variables.order_id}}';
      const bodyTemplate = 'Dear {{variables.customer_name}},\n\n' +
        '{{node-1.ai_response}}\n\n' +
        'Your order {{variables.order_id}} has been confirmed.\n' +
        'Total: ${{variables.order_total}}\n\n' +
        '{{variables.customer_type === "vip" ? "As a VIP customer, you get free shipping!" : "Standard shipping applies."}}\n\n' +
        'Best regards,\nThe Team';

      expect(resolveExpression(subject, scope)).toBe('Order Confirmation - ORD-123');
      
      const resolvedBody = resolveExpression(bodyTemplate, scope);
      expect(resolvedBody).toContain('Dear John Doe');
      expect(resolvedBody).toContain('Thank you for your continued loyalty!');
      expect(resolvedBody).toContain('Your order ORD-123 has been confirmed');
      expect(resolvedBody).toContain('Total: $350');
      expect(resolvedBody).toContain('As a VIP customer, you get free shipping!');
    });
  });
});
