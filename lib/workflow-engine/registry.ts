/**
 * Node Registry for Workflow Automation System
 * 
 * This module implements the NodeRegistry class that manages all available node types
 * in the workflow system. It provides registration, creation, and querying capabilities
 * for both built-in and custom node types.
 * 
 * Requirement 20: Node Registry and SDK
 * - Maintains a list of all available node types with their metadata
 * - Provides methods to register, create, query, and list node types
 * - Uses singleton pattern for global registry instance
 */

import { LogicNode, NodeMetadata } from './types';

/**
 * NodeRegistry manages all available node types in the workflow system
 * 
 * Requirement 20: Node Registry SHALL maintain a list of all available node types with their metadata
 */
export class NodeRegistry {
  /**
   * Internal storage for registered node instances
   * Maps node type identifier to node instance
   */
  private nodes = new Map<string, LogicNode>();

  /**
   * Internal storage for node metadata
   * Maps node type identifier to metadata
   */
  private metadata = new Map<string, NodeMetadata>();

  /**
   * Register a new node type in the registry
   * 
   * @param type - Unique identifier for the node type
   * @param node - Node instance implementing the LogicNode interface
   * @param metadata - Optional metadata for the node type
   * @throws Error if the node type is already registered
   * 
   * Requirement 20: When a custom node is registered, Node Registry SHALL validate that it implements the required interface
   */
  register(
    type: string,
    node: LogicNode,
    metadata?: Partial<NodeMetadata>
  ): void {
    // Validate that the node type is not already registered
    if (this.nodes.has(type)) {
      throw new Error(`Node type '${type}' is already registered`);
    }

    // Validate that the node implements the required interface
    if (!node.type) {
      throw new Error(`Node must have a 'type' property`);
    }

    if (typeof node.execute !== 'function') {
      throw new Error(`Node '${type}' must implement execute() method`);
    }

    if (typeof node.validateConfig !== 'function') {
      throw new Error(`Node '${type}' must implement validateConfig() method`);
    }

    // Validate that the node type matches the registration type
    if (node.type !== type) {
      throw new Error(
        `Node type mismatch: registering as '${type}' but node.type is '${node.type}'`
      );
    }

    // Store the node instance
    this.nodes.set(type, node);

    // Store metadata if provided
    if (metadata) {
      const fullMetadata: NodeMetadata = {
        type,
        name: metadata.name || type,
        category: metadata.category || 'data',
        description: metadata.description || '',
        configSchema: metadata.configSchema || {},
        inputSchema: metadata.inputSchema,
        outputSchema: metadata.outputSchema,
        isSystem: metadata.isSystem !== undefined ? metadata.isSystem : true,
      };
      this.metadata.set(type, fullMetadata);
    }
  }

  /**
   * Create a node instance by type
   * 
   * @param type - Node type identifier
   * @returns Node instance
   * @throws Error if the node type is not registered
   * 
   * Requirement 20: Node Registry SHALL provide an API to query available node types
   */
  create(type: string): LogicNode {
    const node = this.nodes.get(type);
    
    if (!node) {
      throw new Error(`Unknown node type: '${type}'`);
    }

    return node;
  }

  /**
   * Check if a node type is registered
   * 
   * @param type - Node type identifier
   * @returns True if the node type exists, false otherwise
   * 
   * Requirement 20: Node Registry SHALL provide an API to query available node types
   */
  has(type: string): boolean {
    return this.nodes.has(type);
  }

  /**
   * List all registered node types with their categories
   * 
   * @returns Array of objects containing type and category for each registered node
   * 
   * Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)
   */
  list(): Array<{ type: string; category: string }> {
    const result: Array<{ type: string; category: string }> = [];

    for (const [type, node] of this.nodes.entries()) {
      // Try to get category from metadata first
      const meta = this.metadata.get(type);
      const category = meta?.category || 'unknown';

      result.push({
        type,
        category,
      });
    }

    return result;
  }

  /**
   * Get metadata for a specific node type
   * 
   * @param type - Node type identifier
   * @returns Node metadata or undefined if not found
   * 
   * Requirement 20: Node Registry SHALL store node metadata (name, category, description, input schema, output schema)
   */
  getMetadata(type: string): NodeMetadata | undefined {
    return this.metadata.get(type);
  }

  /**
   * Get all registered node metadata
   * 
   * @returns Array of all node metadata
   * 
   * Requirement 20: Node Registry SHALL provide an API to query available node types
   */
  getAllMetadata(): NodeMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Unregister a node type (useful for testing or dynamic node management)
   * 
   * @param type - Node type identifier
   * @returns True if the node was unregistered, false if it didn't exist
   */
  unregister(type: string): boolean {
    const hadNode = this.nodes.delete(type);
    this.metadata.delete(type);
    return hadNode;
  }

  /**
   * Clear all registered nodes (useful for testing)
   */
  clear(): void {
    this.nodes.clear();
    this.metadata.clear();
  }

  /**
   * Get the count of registered node types
   * 
   * @returns Number of registered node types
   */
  get size(): number {
    return this.nodes.size;
  }
}

/**
 * Global singleton instance of NodeRegistry
 * 
 * Requirement 20: Use singleton pattern for global registry instance
 */
export const nodeRegistry = new NodeRegistry();
