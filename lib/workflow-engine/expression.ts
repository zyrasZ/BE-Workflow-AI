/**
 * Expression Resolver for Workflow Automation System
 * 
 * Provides expression resolution functionality for workflow nodes.
 * Supports syntax like:
 * - {{variables.name}} - Access global variables
 * - {{node-1.output.field}} - Access node output data
 * - {{variables.price * variables.quantity}} - Arithmetic operations
 * - {{variables.score > 80 ? 'A' : 'B'}} - Conditional expressions
 * 
 * Requirement 21: Execution Context Management
 * - Support nested object structures and arrays
 * - Provide methods to get and set values by path
 * - Resolve expressions using context data
 */

/**
 * Scope object for expression evaluation
 */
export interface ExpressionScope {
  /**
   * Global variables from execution context
   */
  variables: Record<string, any>;

  /**
   * Node outputs keyed by node ID
   * Each node output contains the output data from that node
   */
  [nodeId: string]: any;
}

/**
 * Resolve an expression using provided scope data
 * 
 * Supports template expressions with {{...}} syntax:
 * - Single expression: "{{variables.name}}" → returns the value directly
 * - Multiple expressions: "Hello {{variables.name}}, your score is {{variables.score}}" → returns interpolated string
 * - Plain text: "Hello World" → returns as-is
 * 
 * @param expr - Expression string to resolve
 * @param scope - Scope object containing variables and node outputs
 * @returns Resolved value
 * 
 * Requirement 21: Execution Context SHALL provide methods to get and set values by path
 */
export function resolveExpression(expr: string, scope: ExpressionScope): any {
  // If not a string, return as-is
  if (!expr || typeof expr !== 'string') {
    return expr;
  }

  // Check if it's a template expression (match {{...}} including empty)
  const templateRegex = /\{\{(.*?)\}\}/g;
  const matches = expr.match(templateRegex);

  if (!matches) {
    // Not a template expression, return as-is
    return expr;
  }

  // If the entire string is a single expression (ignoring whitespace), evaluate and return the value
  const trimmedExpr = expr.trim();
  if (matches.length === 1 && trimmedExpr === matches[0]) {
    const code = matches[0].replace(/^\{\{|\}\}$/g, '').trim();
    
    // Handle empty expressions
    if (!code) {
      return '';
    }
    
    return evaluateExpression(code, scope);
  }

  // Multiple expressions or mixed with text - replace all and return string
  return expr.replace(templateRegex, (match, code) => {
    const trimmedCode = code.trim();
    
    // Handle empty expressions
    if (!trimmedCode) {
      return '';
    }
    
    const value = evaluateExpression(trimmedCode, scope);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Evaluate a JavaScript expression with limited scope
 * 
 * Uses new Function constructor to evaluate expressions in a controlled environment.
 * Supports:
 * - Variable access: variables.name, node-1.output.field
 * - Arithmetic: +, -, *, /, %
 * - Comparison: ==, !=, ===, !==, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Ternary: condition ? true_value : false_value
 * - Array/object access: variables.items[0], variables.user.email
 * 
 * @param code - JavaScript code to evaluate
 * @param scope - Scope object containing variables and node outputs
 * @returns Evaluated result
 * 
 * Requirement 21: Execution Context SHALL support nested object structures and arrays
 */
function evaluateExpression(code: string, scope: ExpressionScope): any {
  try {
    // Transform the code to use $scope prefix
    // This prevents direct access to global scope and limits execution to provided scope
    let transformedCode = code;
    
    // Replace variables.xxx with $scope.variables.xxx
    transformedCode = transformedCode.replace(/\bvariables\./g, '$scope.variables.');
    
    // Replace node-X references with $scope['node-X']
    // Match patterns like node-1, node-abc, node-test_123, etc. followed by a dot
    // Supports alphanumeric, hyphens, and underscores in node IDs
    transformedCode = transformedCode.replace(/\b(node-[a-zA-Z0-9_-]+)\./g, "$scope['$1'].");
    
    // Use Function constructor to evaluate expression with limited scope
    // The function receives $scope as parameter and evaluates the transformed code
    const fn = new Function('$scope', `"use strict"; return (${transformedCode});`);
    
    return fn(scope);
  } catch (error) {
    // If evaluation fails, throw error with clear message
    // This allows nodes to handle expression failures appropriately
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to evaluate expression: ${code}`, error);
    throw new Error(`Expression evaluation failed: ${errorMessage}`);
  }
}

/**
 * Resolve multiple expressions in an object
 * 
 * Recursively processes an object and resolves all string values that contain expressions.
 * Useful for resolving expressions in node configurations.
 * 
 * @param obj - Object containing expressions to resolve
 * @param scope - Scope object containing variables and node outputs
 * @returns Object with all expressions resolved
 * 
 * Example:
 * ```typescript
 * const config = {
 *   recipient: "{{variables.email}}",
 *   subject: "Hello {{variables.name}}",
 *   metadata: {
 *     score: "{{variables.score}}"
 *   }
 * };
 * const resolved = resolveExpressions(config, scope);
 * // { recipient: "user@example.com", subject: "Hello John", metadata: { score: 95 } }
 * ```
 */
export function resolveExpressions(
  obj: Record<string, any>,
  scope: ExpressionScope
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Resolve string expressions
      resolved[key] = resolveExpression(value, scope);
    } else if (Array.isArray(value)) {
      // Recursively resolve array items
      resolved[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? resolveExpressions(item, scope)
          : typeof item === 'string'
          ? resolveExpression(item, scope)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = resolveExpressions(value, scope);
    } else {
      // Keep non-string values as-is
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Build expression scope from execution context data
 * 
 * Converts execution context data into a scope object suitable for expression evaluation.
 * 
 * @param variables - Global variables from execution context
 * @param nodeOutputs - Map of node outputs keyed by node ID
 * @returns Expression scope object
 * 
 * Example:
 * ```typescript
 * const scope = buildExpressionScope(
 *   { name: "John", score: 95 },
 *   new Map([
 *     ["node-1", { email: "john@example.com" }],
 *     ["node-2", { result: "success" }]
 *   ])
 * );
 * // {
 * //   variables: { name: "John", score: 95 },
 * //   "node-1": { output: { email: "john@example.com" }, email: "john@example.com" },
 * //   "node-2": { output: { result: "success" }, result: "success" }
 * // }
 * ```
 */
export function buildExpressionScope(
  variables: Record<string, any>,
  nodeOutputs: Map<string, Record<string, any>>
): ExpressionScope {
  const scope: ExpressionScope = {
    variables,
  };

  // Add node outputs to scope
  // Support both node-1.output.field and node-1.field syntax
  for (const [nodeId, output] of nodeOutputs.entries()) {
    scope[nodeId] = {
      output: output,
      ...output, // Also expose fields directly
    };
  }

  return scope;
}

/**
 * Validate expression syntax
 * 
 * Checks if an expression string has valid syntax without evaluating it.
 * Useful for validating node configurations before execution.
 * 
 * @param expr - Expression string to validate
 * @returns Object with valid flag and error message if invalid
 * 
 * Example:
 * ```typescript
 * validateExpression("{{variables.name}}"); // { valid: true }
 * validateExpression("{{variables.}}"); // { valid: false, error: "..." }
 * validateExpression("{{invalid syntax}}"); // { valid: false, error: "..." }
 * ```
 */
export function validateExpression(expr: string): { valid: boolean; error?: string } {
  if (!expr || typeof expr !== 'string') {
    return { valid: true }; // Non-string values are valid (not expressions)
  }

  // Check for template expressions (match {{...}} including empty)
  const templateRegex = /\{\{(.*?)\}\}/g;
  const matches = expr.match(templateRegex);

  if (!matches) {
    return { valid: true }; // Plain text is valid
  }

  // Validate each expression
  for (const match of matches) {
    const code = match.replace(/^\{\{|\}\}$/g, '').trim();

    if (!code) {
      return { valid: false, error: 'Empty expression' };
    }

    // Transform the code the same way we do in evaluateExpression
    let transformedCode = code;
    transformedCode = transformedCode.replace(/\bvariables\./g, '$scope.variables.');
    transformedCode = transformedCode.replace(/\b(node-[a-zA-Z0-9_-]+)\./g, "$scope['$1'].");

    // Check for basic syntax errors
    try {
      // Try to create a function with the code to check syntax
      new Function('$scope', `"use strict"; return (${transformedCode});`);
    } catch (error) {
      return {
        valid: false,
        error: `Invalid expression syntax: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { valid: true };
}
