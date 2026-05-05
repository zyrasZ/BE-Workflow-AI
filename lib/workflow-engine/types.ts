/**
 * Core types and interfaces for the Workflow Automation System
 * 
 * This module defines the fundamental interfaces that all workflow components must implement:
 * - LogicNode: Base interface for all node types
 * - NodeResult: Return type for node execution
 * - ExecutionContext: Runtime state management
 * - ValidationResult: Configuration validation results
 * - NodeErrorConfig: Error handling strategies
 * - TriggerConfig: Trigger configuration
 * - TriggerWorker: Trigger worker interface
 * 
 * Requirements: 20 (Node Registry and SDK), 21 (Execution Context Management)
 */

/**
 * Core interface that all node types must implement
 * 
 * Requirement 20: Node SDK SHALL provide a base class or interface for creating custom nodes
 */
export interface LogicNode {
  /**
   * Node type identifier, must match the type in node_types database table
   */
  readonly type: string;

  /**
   * Execute the node logic
   * 
   * @param input - Data from previous node or trigger input
   * @param config - Node configuration from workflow definition
   * @param context - Runtime execution context (variables, node outputs)
   * @returns Promise resolving to node execution result
   * 
   * Requirement 20: Node SDK SHALL define required methods (execute, validate, getSchema)
   */
  execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext
  ): Promise<NodeResult>;

  /**
   * Validate node configuration before execution
   * 
   * @param config - Configuration to validate
   * @returns Validation result with errors if invalid
   * 
   * Requirement 20: Node SDK SHALL define required methods (execute, validate, getSchema)
   */
  validateConfig(config: Record<string, any>): ValidationResult;
}

/**
 * Result returned from node execution
 * 
 * Requirement 19: Workflow Executor SHALL track execution status for each node
 */
export interface NodeResult {
  /**
   * Whether the node executed successfully
   */
  success: boolean;

  /**
   * Output data to pass to downstream nodes
   * 
   * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
   */
  output: Record<string, any>;

  /**
   * Error message if execution failed
   */
  error?: string;

  /**
   * Array of node IDs to execute next (for branching nodes like if-else, switch)
   * If empty or undefined, all connected downstream nodes will execute
   * 
   * Requirement 1: If/Else Node SHALL route execution to "true" or "false" output branch
   * Requirement 2: Switch Node SHALL route execution to matching case output branch
   */
  branches?: string[];
}

/**
 * Runtime execution context that stores workflow state
 * 
 * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
 */
export interface ExecutionContext {
  /**
   * User ID executing the workflow
   */
  userId: string;

  /**
   * Workflow ID being executed
   */
  workflowId: string;

  /**
   * Unique execution ID for this run
   */
  executionId: string;

  /**
   * Global variables storage
   * 
   * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
   */
  variables: Record<string, any>;

  /**
   * Output data from each executed node, keyed by node ID
   * 
   * Requirement 21: Execution Context SHALL store all variables and data produced during workflow execution
   */
  nodeOutputs: Map<string, Record<string, any>>;

  /**
   * Current node being executed
   */
  currentNodeId: string;

  /**
   * History of executed node IDs in order
   * 
   * Requirement 21: Execution Context SHALL maintain a history of all data changes for debugging
   */
  executionPath: string[];

  /**
   * Get output data from a specific node
   * 
   * @param nodeId - ID of the node to get output from
   * @returns Node output data or undefined if not found
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  getNodeOutput(nodeId: string): Record<string, any> | undefined;

  /**
   * Set a global variable value
   * 
   * @param key - Variable name
   * @param value - Variable value
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  setVariable(key: string, value: any): void;

  /**
   * Get a global variable value
   * 
   * @param key - Variable name
   * @returns Variable value or undefined if not found
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  getVariable(key: string): any;

  /**
   * Resolve an expression using context data
   * Supports syntax like: {{variables.name}}, {{node-1.output.field}}
   * 
   * @param expr - Expression string to resolve
   * @returns Resolved value
   * 
   * Requirement 21: Execution Context SHALL provide methods to get and set values by path
   */
  resolveExpression(expr: string): any;
}

/**
 * Result of configuration validation
 * 
 * Requirement 26: System SHALL validate that all node configurations match their schema requirements
 */
export interface ValidationResult {
  /**
   * Whether the configuration is valid
   */
  valid: boolean;

  /**
   * List of validation errors
   * 
   * Requirement 26: System SHALL return a list of validation errors with node identifiers and error descriptions
   */
  errors: Array<{
    /**
     * Field name that failed validation
     */
    field: string;

    /**
     * Human-readable error message
     */
    message: string;
  }>;
}

/**
 * Error handling configuration for nodes
 * 
 * Requirement 25: Workflow Executor SHALL support retry configuration for nodes
 */
export interface NodeErrorConfig {
  /**
   * Error handling strategy
   * - 'fail': Stop workflow execution and mark as failed
   * - 'skip': Skip the node and continue with empty output
   * - 'retry': Retry the node execution with delay
   * - 'fallback': Use fallback value and continue
   * - 'branch': Continue execution on error branch path
   * 
   * Requirement 25: Workflow Executor SHALL support error handling branches
   */
  strategy: 'fail' | 'skip' | 'retry' | 'fallback' | 'branch';

  /**
   * Maximum number of retry attempts (for 'retry' strategy)
   * Default: 3
   * 
   * Requirement 25: Workflow Executor SHALL retry the node execution up to the specified count
   */
  maxRetries?: number;

  /**
   * Delay between retry attempts in milliseconds (for 'retry' strategy)
   * Default: 1000
   * 
   * Requirement 25: Workflow Executor SHALL support retry configuration for nodes (retry count, retry delay)
   */
  retryDelayMs?: number;

  /**
   * Fallback value to use when strategy is 'fallback'
   * 
   * Requirement 25: Workflow Executor SHALL support error handling branches
   */
  fallbackValue?: any;

  /**
   * Node ID to execute when error occurs (for 'branch' strategy)
   * This allows execution to continue on a different path after failure
   * 
   * Requirement 25: Workflow Executor SHALL support error handling branches where execution continues on different path after failure
   */
  errorBranchNodeId?: string;
}

/**
 * Trigger configuration for workflow activation
 * 
 * Requirement 22: Trigger Manager SHALL maintain a registry of all active triggers
 */
export interface TriggerConfig {
  /**
   * Unique trigger identifier
   */
  id: string;

  /**
   * Workflow ID this trigger belongs to
   */
  workflowId: string;

  /**
   * Trigger type
   * - 'manual': User-initiated execution
   * - 'schedule': Cron-based scheduling
   * - 'email': Email arrival trigger
   * - 'webhook': HTTP webhook trigger
   * 
   * Requirement 9: Email Trigger
   * Requirement 10: Schedule Trigger (Cron)
   * Requirement 11: Manual Trigger
   * Requirement 12: Webhook Trigger
   */
  type: 'manual' | 'schedule' | 'email' | 'webhook';

  /**
   * Trigger-specific configuration
   * - For 'schedule': { cronExpression: string, timezone?: string }
   * - For 'email': { emailAccountId: string, filters: EmailFilterRules }
   * - For 'webhook': { secret?: string, authType?: 'none' | 'apiKey' | 'signature' }
   * - For 'manual': {} (no config needed)
   */
  config: Record<string, any>;

  /**
   * Whether the trigger is currently active
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  isActive: boolean;

  /**
   * Timestamp of last trigger activation
   */
  lastTriggeredAt?: Date;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}

/**
 * Interface for trigger worker implementations
 * 
 * Requirement 22: Trigger Manager SHALL maintain a registry of all active triggers
 */
export interface TriggerWorker {
  /**
   * Start monitoring for trigger events
   * 
   * Requirement 22: When a workflow with a trigger is activated, Trigger Manager SHALL start monitoring for that trigger's events
   */
  start(): Promise<void>;

  /**
   * Stop monitoring for trigger events
   * 
   * Requirement 22: When a workflow is deactivated, Trigger Manager SHALL stop monitoring its triggers
   */
  stop(): Promise<void>;

  /**
   * Handle trigger event and initiate workflow execution
   * 
   * @param data - Event data to pass to workflow
   * 
   * Requirement 22: When a trigger event occurs, Trigger Manager SHALL create a new workflow execution
   */
  triggerExecution(data: Record<string, any>): Promise<void>;
}

/**
 * Node metadata stored in database
 * 
 * Requirement 20: Node Registry SHALL store node metadata
 */
export interface NodeMetadata {
  /**
   * Unique node type identifier
   */
  type: string;

  /**
   * Human-readable node name
   */
  name: string;

  /**
   * Node category for organization
   * - 'logic': Control flow nodes (if-else, switch, loop)
   * - 'data': Data transformation nodes (set variable, code, mapper)
   * - 'trigger': Workflow trigger nodes
   * - 'action': Action nodes (email, AI, HTTP)
   */
  category: 'logic' | 'data' | 'trigger' | 'action';

  /**
   * Node description
   */
  description: string;

  /**
   * JSON Schema for node configuration
   * 
   * Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)
   */
  configSchema: Record<string, any>;

  /**
   * JSON Schema for node input
   */
  inputSchema?: Record<string, any>;

  /**
   * JSON Schema for node output
   */
  outputSchema?: Record<string, any>;

  /**
   * Whether this is a system node (built-in) or custom node
   */
  isSystem: boolean;
}

/**
 * Workflow execution record
 * 
 * Requirement 24: System SHALL record every workflow execution in the database
 */
export interface WorkflowExecution {
  /**
   * Unique execution identifier
   */
  id: string;

  /**
   * Workflow ID being executed
   */
  workflowId: string;

  /**
   * User ID who initiated the execution
   */
  userId: string;

  /**
   * Execution status
   * 
   * Requirement 24: System SHALL store execution status (running, completed, failed)
   */
  status: 'running' | 'completed' | 'failed';

  /**
   * Execution results (final output)
   */
  results?: Record<string, any>;

  /**
   * Error message if execution failed
   * 
   * Requirement 24: System SHALL store error messages and stack traces for failed executions
   */
  error?: string;

  /**
   * Execution start timestamp
   * 
   * Requirement 24: System SHALL store execution status, start time, end time, and duration
   */
  startedAt: Date;

  /**
   * Execution completion timestamp
   */
  completedAt?: Date;
}

/**
 * Node execution log entry
 * 
 * Requirement 24: System SHALL store individual node execution results and timings
 */
export interface NodeExecutionLog {
  /**
   * Unique log entry identifier
   */
  id: string;

  /**
   * Execution ID this log belongs to
   */
  executionId: string;

  /**
   * Node ID that was executed
   */
  nodeId: string;

  /**
   * Node type
   */
  nodeType: string;

  /**
   * Node execution status
   */
  status: 'running' | 'completed' | 'failed' | 'skipped';

  /**
   * Input data received by the node
   * 
   * Requirement 24: System SHALL store individual node execution results and timings
   */
  input?: Record<string, any>;

  /**
   * Output data produced by the node
   */
  output?: Record<string, any>;

  /**
   * Error message if node failed
   */
  error?: string;

  /**
   * Execution duration in milliseconds
   * 
   * Requirement 19: Workflow Executor SHALL record execution start time, end time, and duration for each node
   */
  durationMs?: number;

  /**
   * Node execution start timestamp
   */
  startedAt: Date;

  /**
   * Node execution completion timestamp
   */
  completedAt?: Date;
}
