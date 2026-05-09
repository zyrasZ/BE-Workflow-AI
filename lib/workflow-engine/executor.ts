/**
 * Workflow Executor for Workflow Automation System
 * 
 * This module implements the WorkflowExecutor class that orchestrates workflow execution.
 * It handles:
 * - Loading workflows from Supabase
 * - Building adjacency graph from edges
 * - Topological sorting (Kahn's algorithm)
 * - Sequential and parallel node execution
 * - Branching logic (if-else, switch)
 * - Error handling strategies (fail, skip, retry, fallback)
 * - Execution logging
 * 
 * Requirements: 19 (Workflow Executor), 24 (Execution History), 25 (Error Handling)
 */

import { createServiceClient } from '@/lib/supabase/server';
import { nodeRegistry } from './registry';
import { ExecutionContextImpl } from './context';
import { validateWorkflow, WorkflowDefinition, WorkflowNode, WorkflowEdge } from './validator';
import { LogicNode, NodeResult, NodeErrorConfig, WorkflowExecution, NodeExecutionLog } from './types';

/**
 * WorkflowExecutor orchestrates workflow execution
 * 
 * Requirement 19: Workflow Executor SHALL analyze the workflow graph to determine node dependencies
 * Requirement 19: Workflow Executor SHALL execute nodes in parallel when they have no dependencies
 * Requirement 19: Workflow Executor SHALL execute nodes sequentially when dependencies exist
 */
export class WorkflowExecutor {
  /**
   * Execute a workflow
   * 
   * @param workflowId - Workflow ID to execute
   * @param userId - User ID executing the workflow
   * @param triggerInput - Input data from trigger
   * @param existingExecutionId - Optional existing execution ID (to avoid duplicate records)
   * @returns Execution ID
   * 
   * Requirement 19: Workflow Executor SHALL maintain the Execution Context throughout workflow execution
   * Requirement 24: System SHALL record every workflow execution in the database
   */
  async execute(
    workflowId: string,
    userId: string,
    triggerInput: Record<string, any> = {},
    existingExecutionId?: string
  ): Promise<string> {
    const supabase = createServiceClient();

    // Load workflow from database
    const { data: workflow, error: loadError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single();

    if (loadError || !workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Validate workflow structure
    const workflowDefinition: WorkflowDefinition = {
      nodes: workflow.nodes || [],
      edges: workflow.edges || [],
      globalErrorHandler: workflow.metadata?.globalErrorHandler,
    };

    const validationResult = validateWorkflow(workflowDefinition);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors.map(e => e.message).join('; ');
      throw new Error(`Workflow validation failed: ${errorMessages}`);
    }

    // Use existing execution ID or create new execution record
    let executionId: string;
    
    if (existingExecutionId) {
      // Use provided execution ID (API route already created the record)
      executionId = existingExecutionId;
      
      // Verify the execution record exists and belongs to this user
      const { data: existingExecution, error: verifyError } = await supabase
        .from('executions')
        .select('id')
        .eq('id', existingExecutionId)
        .eq('user_id', userId)
        .eq('workflow_id', workflowId)
        .single();
      
      if (verifyError || !existingExecution) {
        throw new Error(`Execution record not found: ${existingExecutionId}`);
      }
    } else {
      // Create new execution record (standalone usage)
      const { data: execution, error: executionError } = await supabase
        .from('executions')
        .insert({
          workflow_id: workflowId,
          user_id: userId,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (executionError || !execution) {
        throw new Error('Failed to create execution record');
      }

      executionId = execution.id;
    }

    // Create execution context
    const context = new ExecutionContextImpl(userId, workflowId, executionId);

    // Merge trigger input into context variables
    context.mergeData(triggerInput);

    try {
      // Execute workflow with global error handler if configured
      await this.executeWorkflow(
        workflowDefinition.nodes,
        workflowDefinition.edges,
        context,
        supabase,
        workflowDefinition.globalErrorHandler
      );

      // Update execution record as completed
      await supabase
        .from('executions')
        .update({
          status: 'completed',
          results: context.toJSON(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      return executionId;
    } catch (error) {
      // Capture error message and stack trace
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Combine error message and stack trace for storage
      const errorDetails = errorStack 
        ? `${errorMessage}\n\nStack Trace:\n${errorStack}`
        : errorMessage;

      // Update execution record as failed
      await supabase
        .from('executions')
        .update({
          status: 'failed',
          error: errorDetails,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      throw error;
    }
  }

  /**
   * Execute workflow nodes
   * 
   * @param nodes - Array of workflow nodes
   * @param edges - Array of workflow edges
   * @param context - Execution context
   * @param supabase - Supabase client
   * @param globalErrorHandler - Optional global error handler node ID
   * 
   * Requirement 19: Workflow Executor SHALL pass output data from each node to its connected downstream nodes
   * Requirement 19: Workflow Executor SHALL track execution status for each node
   * Requirement 25: Workflow Executor SHALL support global error handlers that execute when any node fails
   */
  private async executeWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    context: ExecutionContextImpl,
    supabase: any,
    globalErrorHandler?: string
  ): Promise<void> {
    // Build adjacency graph
    const adjacency = this.buildAdjacencyGraph(nodes, edges);

    // Find trigger node (node with no incoming edges)
    const triggerNodes = this.findTriggerNodes(nodes, edges);

    // Exclude global error handler from trigger nodes
    const actualTriggerNodes = globalErrorHandler
      ? triggerNodes.filter(id => id !== globalErrorHandler)
      : triggerNodes;

    if (actualTriggerNodes.length === 0) {
      throw new Error('No trigger node found (node with no incoming edges)');
    }

    // Use BFS to execute nodes
    const queue: string[] = [...actualTriggerNodes];
    const executed = new Set<string>();
    const inProgress = new Set<string>();

    while (queue.length > 0) {
      // Get nodes at current level (nodes that can execute in parallel)
      const currentLevel: string[] = [];
      const remainingQueue: string[] = [];

      for (const nodeId of queue) {
        // Check if all dependencies are satisfied
        const dependencies = this.getIncomingNodes(nodeId, edges);
        const allDependenciesMet = dependencies.every(dep => executed.has(dep));

        if (allDependenciesMet && !inProgress.has(nodeId)) {
          currentLevel.push(nodeId);
          inProgress.add(nodeId);
        } else {
          remainingQueue.push(nodeId);
        }
      }

      // If no nodes can execute, we have a problem
      if (currentLevel.length === 0 && remainingQueue.length > 0) {
        throw new Error('Workflow execution stuck - possible circular dependency');
      }

      // Execute current level in parallel
      if (currentLevel.length > 0) {
        const nodeResults = await this.executeNodesInParallel(
          currentLevel,
          nodes,
          edges,
          context,
          supabase
        );

        // Mark nodes as executed
        for (const nodeId of currentLevel) {
          executed.add(nodeId);
          inProgress.delete(nodeId);
        }

        // Add downstream nodes to queue based on branches
        for (const nodeId of currentLevel) {
          const result = nodeResults.get(nodeId);
          if (!result) continue;

          // Handle failed nodes
          if (!result.success) {
            // If we have a global error handler, route to it
            if (globalErrorHandler && !executed.has(globalErrorHandler)) {
              console.log(`Node ${nodeId} failed, routing to global error handler: ${globalErrorHandler}`);
              
              // Store error information in context
              context.setVariable('__globalError', {
                message: result.error || 'Node execution failed',
                failedNode: nodeId,
                timestamp: new Date().toISOString(),
              });

              // Add error handler to queue
              if (!remainingQueue.includes(globalErrorHandler)) {
                remainingQueue.push(globalErrorHandler);
              }
            } else {
              // No error handler available, throw error to fail workflow
              throw new Error(`Node ${nodeId} failed: ${result.error || 'Unknown error'}`);
            }
            continue;
          }

          // CRITICAL: if branches is defined (even empty array), use ONLY branches
          // Do NOT fallback to adjacency graph when branches is defined
          if (result.branches !== undefined) {
            // Node explicitly specified branches (could be empty for terminal nodes)
            for (const branchNodeId of result.branches) {
              if (!executed.has(branchNodeId) && !remainingQueue.includes(branchNodeId)) {
                remainingQueue.push(branchNodeId);
              }
            }
          } else {
            // Only fallback to adjacency when branches is undefined (not when empty)
            // This is the default behavior for nodes that don't use branching logic
            const downstreamNodes = adjacency.get(nodeId) || [];
            for (const downstream of downstreamNodes) {
              if (!executed.has(downstream) && !remainingQueue.includes(downstream)) {
                remainingQueue.push(downstream);
              }
            }
          }
        }
      }

      // Update queue
      queue.length = 0;
      queue.push(...remainingQueue);
    }
  }

  /**
   * Execute multiple nodes in parallel
   * 
   * @param nodeIds - Array of node IDs to execute
   * @param nodes - All workflow nodes
   * @param edges - All workflow edges
   * @param context - Execution context
   * @param supabase - Supabase client
   * @returns Map of node IDs to their results (for branch handling)
   * 
   * Requirement 19: Workflow Executor SHALL execute nodes in parallel when they have no dependencies
   */
  private async executeNodesInParallel(
    nodeIds: string[],
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    context: ExecutionContextImpl,
    supabase: any
  ): Promise<Map<string, NodeResult>> {
    const promises = nodeIds.map(nodeId =>
      this.executeNode(nodeId, nodes, edges, context, supabase)
    );

    // Use Promise.allSettled to execute in parallel and collect all results
    const results = await Promise.allSettled(promises);

    // Collect results - don't throw immediately on failure
    // Instead, collect failures as NodeResult with success: false
    const nodeResults = new Map<string, NodeResult>();
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        // Store failure as a result with success: false and empty branches
        nodeResults.set(nodeIds[i], {
          success: false,
          output: {},
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          branches: [], // Empty branches for failed nodes
        });
      } else {
        nodeResults.set(nodeIds[i], result.value);
      }
    }

    return nodeResults;
  }

  /**
   * Execute a single node
   * 
   * @param nodeId - Node ID to execute
   * @param nodes - All workflow nodes
   * @param edges - All workflow edges
   * @param context - Execution context
   * @param supabase - Supabase client
   * @returns Node result with branches information
   * 
   * Requirement 19: Workflow Executor SHALL record execution start time, end time, and duration for each node
   * Requirement 24: System SHALL store individual node execution results and timings
   * Requirement 25: Workflow Executor SHALL support error handling strategies
   */
  private async executeNode(
    nodeId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    context: ExecutionContextImpl,
    supabase: any
  ): Promise<NodeResult> {
    // Find node definition
    const nodeDef = nodes.find(n => n.id === nodeId);
    if (!nodeDef) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Update context
    context.currentNodeId = nodeId;
    context.executionPath.push(nodeId);

    // Get node instance from registry
    if (!nodeRegistry.has(nodeDef.type)) {
      throw new Error(`Unknown node type: ${nodeDef.type}`);
    }

    const nodeInstance = nodeRegistry.create(nodeDef.type);

    // Gather input from parent nodes
    const input = this.gatherNodeInput(nodeId, edges, context);

    // Get node configuration
    const config = nodeDef.config || {};

    // Get error handling configuration
    const errorConfig: NodeErrorConfig = config.errorHandling || {
      strategy: 'fail',
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    // Start execution log
    const startTime = Date.now();
    const logEntry: Partial<NodeExecutionLog> = {
      executionId: context.executionId,
      nodeId: nodeId,
      nodeType: nodeDef.type,
      status: 'running',
      input,
      startedAt: new Date(),
    };

    // Insert log entry
    const { data: logData } = await supabase
      .from('execution_logs')
      .insert(logEntry)
      .select()
      .single();

    const logId = logData?.id;

    try {
      // Execute node with retry logic
      const result = await this.executeNodeWithRetry(
        nodeInstance,
        input,
        config,
        context,
        errorConfig,
        supabase,
        logId
      );

      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Update log entry
      await supabase
        .from('execution_logs')
        .update({
          status: result.success ? 'completed' : 'failed',
          output: result.output,
          error: result.error,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId);

      // Store output in context
      if (result.success) {
        context.nodeOutputs.set(nodeId, result.output);
        return result; // Return result with branches information
      } else {
        // Requirement 25: When all retries are exhausted, mark the workflow execution as failed
        throw new Error(result.error || 'Node execution failed');
      }
    } catch (error) {
      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Capture error message and stack trace
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Combine error message and stack trace for storage
      const errorDetails = errorStack 
        ? `${errorMessage}\n\nStack Trace:\n${errorStack}`
        : errorMessage;

      // Update log entry
      await supabase
        .from('execution_logs')
        .update({
          status: 'failed',
          error: errorDetails,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId);

      throw error;
    }
  }

  /**
   * Execute node with retry logic
   * 
   * @param nodeInstance - Node instance to execute
   * @param input - Input data
   * @param config - Node configuration
   * @param context - Execution context
   * @param errorConfig - Error handling configuration
   * @param supabase - Supabase client for logging
   * @param logId - Execution log ID for retry logging
   * @returns Node result
   * 
   * Requirement 25: Workflow Executor SHALL retry the node execution up to the specified count
   * Requirement 25: Workflow Executor SHALL support error handling strategies (fail, skip, retry, fallback, branch)
   * Requirement 25: Workflow Executor SHALL distinguish between retryable and non-retryable errors
   * Requirement 25: Workflow Executor SHALL log all retry attempts with timestamps
   * Requirement 25: Workflow Executor SHALL support error handling branches where execution continues on different path after failure
   */
  private async executeNodeWithRetry(
    nodeInstance: LogicNode,
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContextImpl,
    errorConfig: NodeErrorConfig,
    supabase: any,
    logId: string
  ): Promise<NodeResult> {
    let lastError: Error | undefined;
    const maxRetries = errorConfig.maxRetries || 3;
    const retryDelayMs = errorConfig.retryDelayMs || 1000;

    // Validate configuration
    const validationResult = nodeInstance.validateConfig(config);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors.map(e => e.message).join('; ');
      return {
        success: false,
        output: {},
        error: `Configuration validation failed: ${errorMessages}`,
      };
    }

    // Try execution with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await nodeInstance.execute(input, config, context);
        
        // If we had previous failures but this attempt succeeded, log the recovery
        if (attempt > 0) {
          await this.logRetryAttempt(
            supabase,
            logId,
            attempt,
            maxRetries,
            true,
            undefined
          );
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Determine if error is retryable
        const isRetryable = this.isRetryableError(lastError);

        // Log retry attempt with timestamp
        await this.logRetryAttempt(
          supabase,
          logId,
          attempt + 1,
          maxRetries,
          false,
          lastError.message
        );

        // If error is non-retryable, don't retry regardless of strategy
        if (!isRetryable) {
          console.log(`Node execution failed with non-retryable error: ${lastError.message}`);
          break;
        }

        // If this is not the last attempt and strategy is retry, wait and retry
        if (attempt < maxRetries && errorConfig.strategy === 'retry') {
          console.log(
            `Node execution failed with retryable error, retrying (attempt ${attempt + 1}/${maxRetries})...`
          );
          await this.delay(retryDelayMs);
          continue;
        }

        // Last attempt or not retry strategy - handle error
        break;
      }
    }

    // Handle error based on strategy
    switch (errorConfig.strategy) {
      case 'skip':
        // Skip node and continue with empty output
        return {
          success: true,
          output: {},
        };

      case 'fallback':
        // Use fallback value
        return {
          success: true,
          output: errorConfig.fallbackValue || {},
        };

      case 'branch':
        // Continue execution on error branch
        // Return success with error branch node ID
        return {
          success: true,
          output: {
            error: lastError?.message || 'Node execution failed',
            errorDetails: {
              name: lastError?.name,
              message: lastError?.message,
              stack: lastError?.stack,
            },
          },
          branches: errorConfig.errorBranchNodeId ? [errorConfig.errorBranchNodeId] : [],
        };

      case 'fail':
      default:
        // Fail workflow execution
        return {
          success: false,
          output: {},
          error: lastError?.message || 'Node execution failed',
        };
    }
  }

  /**
   * Determine if an error is retryable
   * 
   * @param error - Error to check
   * @returns True if error is retryable, false otherwise
   * 
   * Requirement 25: Workflow Executor SHALL distinguish between retryable and non-retryable errors
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Non-retryable errors (configuration, validation, syntax errors)
    const nonRetryablePatterns = [
      'configuration validation failed',
      'invalid configuration',
      'validation failed',
      'syntax error',
      'parse error',
      'invalid syntax',
      'schema validation',
      'missing required',
      'invalid type',
      'malformed',
    ];

    for (const pattern of nonRetryablePatterns) {
      if (errorMessage.includes(pattern) || errorName.includes(pattern)) {
        return false;
      }
    }

    // Retryable errors (network, timeout, temporary failures)
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'econnrefused',
      'econnreset',
      'etimedout',
      'socket hang up',
      'rate limit',
      'too many requests',
      'service unavailable',
      'temporarily unavailable',
      'try again',
    ];

    for (const pattern of retryablePatterns) {
      if (errorMessage.includes(pattern) || errorName.includes(pattern)) {
        return true;
      }
    }

    // Default: treat unknown errors as retryable to be safe
    return true;
  }

  /**
   * Log retry attempt with timestamp
   * 
   * @param supabase - Supabase client
   * @param logId - Execution log ID
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum retry count
   * @param success - Whether the retry succeeded
   * @param errorMessage - Error message if failed
   * 
   * Requirement 25: Workflow Executor SHALL log all retry attempts with timestamps
   */
  private async logRetryAttempt(
    supabase: any,
    logId: string,
    attempt: number,
    maxRetries: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Get current log entry to append retry info
      const { data: currentLog } = await supabase
        .from('execution_logs')
        .select('error')
        .eq('id', logId)
        .single();

      const timestamp = new Date().toISOString();
      const retryInfo = success
        ? `[${timestamp}] Retry attempt ${attempt}/${maxRetries}: SUCCESS - Node execution recovered`
        : `[${timestamp}] Retry attempt ${attempt}/${maxRetries}: FAILED - ${errorMessage}`;

      // Append retry info to error field
      const existingError = currentLog?.error || '';
      const updatedError = existingError
        ? `${existingError}\n${retryInfo}`
        : retryInfo;

      await supabase
        .from('execution_logs')
        .update({ error: updatedError })
        .eq('id', logId);
    } catch (logError) {
      // Don't fail execution if logging fails
      console.error('Failed to log retry attempt:', logError);
    }
  }

  /**
   * Gather input data for a node from its parent nodes
   * 
   * @param nodeId - Node ID to gather input for
   * @param edges - All workflow edges
   * @param context - Execution context
   * @param strategy - Merge strategy: 'namespace' (safe, default) or 'merge' (legacy, has conflicts)
   * @returns Input data object
   * 
   * Requirement 19: Workflow Executor SHALL pass output data from each node to its connected downstream nodes
   */
  private gatherNodeInput(
    nodeId: string,
    edges: WorkflowEdge[],
    context: ExecutionContextImpl,
    strategy: 'namespace' | 'merge' = 'namespace'
  ): Record<string, any> {
    const incomingEdges = edges.filter(e => e.target === nodeId);

    if (incomingEdges.length === 0) {
      // Trigger node - return empty input
      return {};
    }

    if (incomingEdges.length === 1) {
      // Single input - return parent output directly
      const parentId = incomingEdges[0].source;
      return context.getNodeOutput(parentId) || {};
    }

    // Multiple inputs - use strategy to handle merging
    if (strategy === 'namespace') {
      // SAFE: Only use namespaced keys to avoid conflicts completely
      // Each parent's output is stored under __from_<nodeId>
      // Downstream nodes access data via: input.__from_nodeX.field
      const mergedInput: Record<string, any> = {};
      
      for (const edge of incomingEdges) {
        const parentId = edge.source;
        const parentOutput = context.getNodeOutput(parentId) || {};
        mergedInput[`__from_${parentId}`] = parentOutput;
      }
      
      return mergedInput;
    } else {
      // LEGACY: Merge keys directly (has risk of conflicts and array conversion)
      // This is kept for backward compatibility but not recommended
      const mergedInput: Record<string, any> = {};
      
      for (const edge of incomingEdges) {
        const parentId = edge.source;
        const parentOutput = context.getNodeOutput(parentId) || {};
        
        // Store parent output under namespaced key for fallback access
        mergedInput[`__from_${parentId}`] = parentOutput;
        
        // Also merge keys directly
        for (const [key, value] of Object.entries(parentOutput)) {
          if (!(key in mergedInput)) {
            mergedInput[key] = value;
          } else if (!key.startsWith('__from_')) {
            // Key conflict detected - convert to array to preserve both values
            if (!Array.isArray(mergedInput[key])) {
              mergedInput[key] = [mergedInput[key]];
            }
            mergedInput[key].push(value);
          }
        }
      }
      
      return mergedInput;
    }
  }

  /**
   * Build adjacency graph from edges
   * 
   * @param nodes - Array of workflow nodes
   * @param edges - Array of workflow edges
   * @returns Adjacency map (nodeId -> array of downstream nodeIds)
   */
  private buildAdjacencyGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();

    // Initialize with empty arrays
    for (const node of nodes) {
      adjacency.set(node.id, []);
    }

    // Build adjacency list
    for (const edge of edges) {
      const neighbors = adjacency.get(edge.source);
      if (neighbors) {
        neighbors.push(edge.target);
      }
    }

    return adjacency;
  }

  /**
   * Find trigger nodes (nodes with no incoming edges)
   * 
   * @param nodes - Array of workflow nodes
   * @param edges - Array of workflow edges
   * @returns Array of trigger node IDs
   */
  private findTriggerNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    return nodes.filter(n => !nodesWithIncoming.has(n.id)).map(n => n.id);
  }

  /**
   * Get incoming nodes for a node
   * 
   * @param nodeId - Node ID
   * @param edges - Array of workflow edges
   * @returns Array of incoming node IDs
   */
  private getIncomingNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges.filter(e => e.target === nodeId).map(e => e.source);
  }

  /**
   * Delay execution for specified milliseconds
   * 
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
