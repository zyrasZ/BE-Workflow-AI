/**
 * Example: Error Handling Branches and Global Error Handlers
 * 
 * This example demonstrates how to use error handling branches and global error handlers
 * in workflows to gracefully handle failures and continue execution on alternative paths.
 * 
 * Requirements: 25 (Error Handling and Recovery)
 * Task: 34.2 (Implement error handling branches)
 */

import { WorkflowExecutor } from '../executor';
import { WorkflowDefinition } from '../validator';

/**
 * Example 1: Error Branch Strategy
 * 
 * When a node fails with 'branch' strategy, execution continues on the error branch
 * instead of stopping the workflow.
 */
export const errorBranchExample: WorkflowDefinition = {
  nodes: [
    {
      id: 'start',
      type: 'set-variable',
      config: {
        variableName: 'status',
        value: 'processing',
      },
    },
    {
      id: 'risky-operation',
      type: 'code',
      config: {
        code: `
          // Simulate an operation that might fail
          if (Math.random() > 0.5) {
            throw new Error('Operation failed randomly');
          }
          return { result: 'success' };
        `,
        errorHandling: {
          strategy: 'branch',
          errorBranchNodeId: 'error-handler',
        },
      },
    },
    {
      id: 'success-path',
      type: 'set-variable',
      config: {
        variableName: 'status',
        value: 'completed',
      },
    },
    {
      id: 'error-handler',
      type: 'set-variable',
      config: {
        variableName: 'status',
        value: 'failed-but-handled',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'risky-operation' },
    { id: 'e2', source: 'risky-operation', target: 'success-path' },
    // Note: error-handler is not connected via edges
    // It's activated via errorBranchNodeId when risky-operation fails
  ],
};

/**
 * Example 2: Global Error Handler
 * 
 * A global error handler catches any node failure in the workflow
 * and executes recovery logic.
 */
export const globalErrorHandlerExample: WorkflowDefinition = {
  nodes: [
    {
      id: 'step-1',
      type: 'set-variable',
      config: {
        variableName: 'step',
        value: 1,
      },
    },
    {
      id: 'step-2',
      type: 'code',
      config: {
        code: `
          // This might fail
          throw new Error('Unexpected error in step 2');
        `,
        errorHandling: {
          strategy: 'fail', // Will trigger global error handler
        },
      },
    },
    {
      id: 'step-3',
      type: 'set-variable',
      config: {
        variableName: 'step',
        value: 3,
      },
    },
    {
      id: 'global-error-handler',
      type: 'code',
      config: {
        code: `
          // Access error information from context
          const errorInfo = variables.__globalError;
          
          // Log error and perform cleanup
          console.log('Global error handler activated:', errorInfo);
          
          // Return recovery data
          return {
            recovered: true,
            errorMessage: errorInfo.message,
            failedNodes: errorInfo.failedNodes,
          };
        `,
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'step-1', target: 'step-2' },
    { id: 'e2', source: 'step-2', target: 'step-3' },
  ],
  // Global error handler is specified in metadata
  globalErrorHandler: 'global-error-handler',
};

/**
 * Example 3: Combined Error Handling
 * 
 * Demonstrates using both node-level error branches and global error handler.
 * Node-level error branches take precedence over global error handler.
 */
export const combinedErrorHandlingExample: WorkflowDefinition = {
  nodes: [
    {
      id: 'operation-1',
      type: 'code',
      config: {
        code: `
          // This operation has its own error branch
          throw new Error('Operation 1 failed');
        `,
        errorHandling: {
          strategy: 'branch',
          errorBranchNodeId: 'operation-1-error-handler',
        },
      },
    },
    {
      id: 'operation-1-error-handler',
      type: 'set-variable',
      config: {
        variableName: 'operation1Status',
        value: 'handled-locally',
      },
    },
    {
      id: 'operation-2',
      type: 'code',
      config: {
        code: `
          // This operation will trigger global error handler
          throw new Error('Operation 2 failed');
        `,
        errorHandling: {
          strategy: 'fail', // No local error branch
        },
      },
    },
    {
      id: 'global-error-handler',
      type: 'set-variable',
      config: {
        variableName: 'globalHandlerActivated',
        value: true,
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'operation-1', target: 'operation-2' },
  ],
  globalErrorHandler: 'global-error-handler',
};

/**
 * Example 4: Email Processing with Error Handling
 * 
 * Real-world example: Process emails with error handling for failed operations
 */
export const emailProcessingWithErrorHandling: WorkflowDefinition = {
  nodes: [
    {
      id: 'read-emails',
      type: 'read-email',
      config: {
        emailAccountId: 'account-1',
        folder: 'INBOX',
        unreadOnly: true,
        limit: 10,
      },
    },
    {
      id: 'classify-email',
      type: 'ai-chat',
      config: {
        prompt: 'Classify this email as: urgent, normal, or spam',
        provider: 'gemini',
        errorHandling: {
          strategy: 'branch',
          errorBranchNodeId: 'classification-failed',
        },
      },
    },
    {
      id: 'send-urgent-notification',
      type: 'send-email',
      config: {
        to: 'admin@example.com',
        subject: 'Urgent Email Received',
        errorHandling: {
          strategy: 'retry',
          maxRetries: 3,
          retryDelayMs: 2000,
        },
      },
    },
    {
      id: 'classification-failed',
      type: 'set-variable',
      config: {
        variableName: 'emailCategory',
        value: 'unknown',
      },
    },
    {
      id: 'global-error-handler',
      type: 'send-email',
      config: {
        to: 'admin@example.com',
        subject: 'Workflow Error Alert',
        body: 'An error occurred in the email processing workflow',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'read-emails', target: 'classify-email' },
    { id: 'e2', source: 'classify-email', target: 'send-urgent-notification' },
  ],
  globalErrorHandler: 'global-error-handler',
};

/**
 * Usage Example:
 * 
 * ```typescript
 * import { WorkflowExecutor } from './executor';
 * import { errorBranchExample } from './examples/error-handling-example';
 * 
 * const executor = new WorkflowExecutor();
 * 
 * // Execute workflow with error handling
 * const executionId = await executor.execute(
 *   'workflow-id',
 *   'user-id',
 *   {} // trigger input
 * );
 * 
 * console.log('Workflow executed:', executionId);
 * ```
 */

/**
 * Key Points:
 * 
 * 1. Error Branch Strategy:
 *    - Set errorHandling.strategy = 'branch'
 *    - Specify errorHandling.errorBranchNodeId to the error handler node
 *    - When the node fails, execution continues on the error branch
 *    - Normal downstream nodes are NOT executed
 * 
 * 2. Global Error Handler:
 *    - Set globalErrorHandler in workflow metadata
 *    - Catches any node failure that doesn't have a local error branch
 *    - Has access to error information via context.getVariable('__globalError')
 *    - If global error handler succeeds, workflow continues
 *    - If global error handler fails, workflow fails
 * 
 * 3. Priority:
 *    - Node-level error branches take precedence over global error handler
 *    - If a node has 'branch' strategy, global error handler is NOT triggered
 *    - Only nodes with 'fail' strategy (or no error handling) trigger global handler
 * 
 * 4. Error Information:
 *    - Global error handler can access error details via __globalError variable
 *    - Contains: message, failedNodes, timestamp
 *    - Error branch nodes receive error details in their input
 */
