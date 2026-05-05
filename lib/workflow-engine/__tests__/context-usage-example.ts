/**
 * Usage examples for ExecutionContext
 * 
 * This file demonstrates how to use the ExecutionContext class
 * in workflow execution scenarios.
 */

import { ExecutionContextImpl } from '../context';

/**
 * Example 1: Basic variable storage and retrieval
 */
function example1_BasicVariables() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Set variables
  context.setVariable('customerName', 'John Doe');
  context.setVariable('orderTotal', 150.50);
  context.setVariable('isPremium', true);

  // Get variables
  console.log(context.getVariable('customerName')); // 'John Doe'
  console.log(context.getVariable('orderTotal'));   // 150.50
  console.log(context.getVariable('isPremium'));    // true
}

/**
 * Example 2: Storing node outputs
 */
function example2_NodeOutputs() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Simulate node execution results
  context.nodeOutputs.set('email-read-node', {
    from: 'customer@example.com',
    subject: 'Order Inquiry',
    body: 'I would like to know about my order status',
  });

  context.nodeOutputs.set('ai-classify-node', {
    category: 'support',
    confidence: 0.95,
    sentiment: 'neutral',
  });

  // Retrieve node outputs
  const emailData = context.getNodeOutput('email-read-node');
  console.log(emailData?.from); // 'customer@example.com'

  const classification = context.getNodeOutput('ai-classify-node');
  console.log(classification?.category); // 'support'
}

/**
 * Example 3: Expression resolution
 */
function example3_ExpressionResolution() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Setup data
  context.setVariable('customerName', 'Jane Smith');
  context.setVariable('orderAmount', 200);
  context.setVariable('discount', 0.1);

  context.nodeOutputs.set('node-1', {
    email: 'jane@example.com',
    phone: '+1234567890',
  });

  // Resolve simple variable
  const name = context.resolveExpression('{{variables.customerName}}');
  console.log(name); // 'Jane Smith'

  // Resolve arithmetic expression
  const finalAmount = context.resolveExpression('{{variables.orderAmount * (1 - variables.discount)}}');
  console.log(finalAmount); // 180

  // Resolve node output
  const email = context.resolveExpression('{{node-1.email}}');
  console.log(email); // 'jane@example.com'

  // Resolve template string
  const message = context.resolveExpression('Hello {{variables.customerName}}, your email is {{node-1.email}}');
  console.log(message); // 'Hello Jane Smith, your email is jane@example.com'

  // Conditional expression
  const status = context.resolveExpression('{{variables.orderAmount > 100 ? "premium" : "standard"}}');
  console.log(status); // 'premium'
}

/**
 * Example 4: Tracking execution path
 */
function example4_ExecutionPath() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Simulate workflow execution
  context.currentNodeId = 'trigger-node';
  context.executionPath.push('trigger-node');

  context.currentNodeId = 'if-else-node';
  context.executionPath.push('if-else-node');

  context.currentNodeId = 'send-email-node';
  context.executionPath.push('send-email-node');

  console.log('Execution path:', context.executionPath);
  // ['trigger-node', 'if-else-node', 'send-email-node']

  console.log('Current node:', context.currentNodeId);
  // 'send-email-node'
}

/**
 * Example 5: Serialization and deserialization
 */
function example5_Serialization() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Setup context
  context.setVariable('status', 'processing');
  context.nodeOutputs.set('node-1', { result: 'success' });
  context.executionPath = ['node-1', 'node-2'];

  // Serialize to JSON (for database storage)
  const json = context.toJSON();
  console.log(JSON.stringify(json, null, 2));

  // Deserialize from JSON (restore from database)
  const restored = ExecutionContextImpl.fromJSON(json);
  console.log(restored.getVariable('status')); // 'processing'
  console.log(restored.getNodeOutput('node-1')); // { result: 'success' }
}

/**
 * Example 6: Nested object access
 */
function example6_NestedObjects() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Store nested objects
  context.setVariable('user', {
    name: 'John Doe',
    email: 'john@example.com',
    address: {
      street: '123 Main St',
      city: 'New York',
      zip: '10001',
    },
  });

  // Access nested properties using expressions
  const city = context.resolveExpression('{{variables.user.address.city}}');
  console.log(city); // 'New York'

  // Use path-based access
  const email = context.getValueByPath('variables.user.email');
  console.log(email); // 'john@example.com'
}

/**
 * Example 7: Merging data
 */
function example7_MergeData() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  // Initial data
  context.setVariable('name', 'John');
  context.setVariable('age', 30);

  // Merge additional data
  context.mergeData({
    city: 'New York',
    country: 'USA',
    age: 31, // This will overwrite the existing age
  });

  console.log(context.getVariable('name'));    // 'John'
  console.log(context.getVariable('age'));     // 31 (updated)
  console.log(context.getVariable('city'));    // 'New York'
  console.log(context.getVariable('country')); // 'USA'
}

/**
 * Example 8: Cloning context for branching
 */
function example8_Cloning() {
  const context = new ExecutionContextImpl('user-123', 'workflow-456', 'exec-789');

  context.setVariable('counter', 0);
  context.nodeOutputs.set('node-1', { value: 'original' });

  // Clone for parallel execution branch
  const branch1 = context.clone();
  const branch2 = context.clone();

  // Modify branches independently
  branch1.setVariable('counter', 1);
  branch1.setVariable('branch', 'A');

  branch2.setVariable('counter', 2);
  branch2.setVariable('branch', 'B');

  // Original context is unchanged
  console.log(context.getVariable('counter')); // 0
  console.log(context.getVariable('branch'));  // undefined

  console.log(branch1.getVariable('counter')); // 1
  console.log(branch1.getVariable('branch'));  // 'A'

  console.log(branch2.getVariable('counter')); // 2
  console.log(branch2.getVariable('branch'));  // 'B'
}

// Export examples for documentation
export {
  example1_BasicVariables,
  example2_NodeOutputs,
  example3_ExpressionResolution,
  example4_ExecutionPath,
  example5_Serialization,
  example6_NestedObjects,
  example7_MergeData,
  example8_Cloning,
};
