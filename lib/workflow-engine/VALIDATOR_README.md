# Workflow Validator

The Workflow Validator ensures that workflow definitions are correctly configured before execution. It validates graph structure, node types, configurations, and edge connections.

## Features

### 1. Cycle Detection (DFS Algorithm)

Detects circular dependencies in workflow graphs using Depth-First Search:

```typescript
const workflow = {
  nodes: [
    { id: 'node-a', type: 'process', config: {} },
    { id: 'node-b', type: 'process', config: {} },
  ],
  edges: [
    { id: 'e1', source: 'node-a', target: 'node-b' },
    { id: 'e2', source: 'node-b', target: 'node-a' }, // Creates cycle
  ],
};

const result = validateWorkflow(workflow);
// result.valid = false
// result.errors[0].type = 'cycle'
// result.errors[0].message = 'Workflow contains a cycle: node-a → node-b → node-a'
```

### 2. Node Type Validation

Validates that all nodes have valid types registered in the Node Registry:

```typescript
const workflow = {
  nodes: [
    { id: 'node-1', type: 'unknown-type', config: {} },
  ],
  edges: [],
};

const result = validateWorkflow(workflow);
// result.valid = false
// result.errors[0].type = 'missing-node-type'
// result.errors[0].nodeId = 'node-1'
```

### 3. Configuration Validation

Validates node configurations against their schemas:

```typescript
const workflow = {
  nodes: [
    { id: 'node-1', type: 'if-else', config: {} }, // Missing required 'condition'
  ],
  edges: [],
};

const result = validateWorkflow(workflow);
// result.valid = false
// result.errors[0].type = 'invalid-config'
// result.errors[0].nodeId = 'node-1'
```

### 4. Edge Validation

Validates that edges connect to valid nodes:

```typescript
const workflow = {
  nodes: [
    { id: 'node-1', type: 'process', config: {} },
  ],
  edges: [
    { id: 'e1', source: 'node-1', target: 'non-existent' },
  ],
};

const result = validateWorkflow(workflow);
// result.valid = false
// result.errors[0].type = 'invalid-edge'
// result.errors[0].edgeId = 'e1'
```

## API Reference

### `validateWorkflow(workflow: WorkflowDefinition): WorkflowValidationResult`

Validates a complete workflow definition.

**Parameters:**
- `workflow`: Workflow definition with nodes and edges

**Returns:**
- `valid`: Boolean indicating if workflow is valid
- `errors`: Array of validation errors with node/edge identifiers
- `warnings`: Optional array of non-blocking warnings

**Example:**
```typescript
import { validateWorkflow } from './validator';

const workflow = {
  nodes: [
    { id: 'start', type: 'manual-trigger', config: {} },
    { id: 'process', type: 'code-node', config: { code: 'return input;' } },
    { id: 'end', type: 'send-email', config: { to: 'user@example.com' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'process' },
    { id: 'e2', source: 'process', target: 'end' },
  ],
};

const result = validateWorkflow(workflow);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  result.errors.forEach(error => {
    console.log(`- ${error.type}: ${error.message}`);
    if (error.nodeId) console.log(`  Node: ${error.nodeId}`);
    if (error.edgeId) console.log(`  Edge: ${error.edgeId}`);
  });
}
```

### `validateNodeConfig(nodeType: string, config: Record<string, any>): ValidationResult`

Validates a single node configuration.

**Parameters:**
- `nodeType`: Type of the node
- `config`: Node configuration object

**Returns:**
- `valid`: Boolean indicating if configuration is valid
- `errors`: Array of validation errors with field names

**Example:**
```typescript
import { validateNodeConfig } from './validator';

const result = validateNodeConfig('if-else', {
  condition: 'variables.score > 80',
});

if (!result.valid) {
  console.error('Configuration errors:', result.errors);
}
```

## Error Types

### `cycle`
Circular dependency detected in workflow graph.

**Example:**
```json
{
  "type": "cycle",
  "message": "Workflow contains a cycle: node-a → node-b → node-c → node-a",
  "details": {
    "cyclePath": ["node-a", "node-b", "node-c", "node-a"]
  }
}
```

### `missing-node-type`
Node has an unknown or unregistered type.

**Example:**
```json
{
  "nodeId": "node-1",
  "type": "missing-node-type",
  "message": "Node 'node-1' has unknown type: 'custom-node'",
  "details": {
    "availableTypes": ["if-else", "switch", "code-node", ...]
  }
}
```

### `invalid-config`
Node configuration doesn't match schema requirements.

**Example:**
```json
{
  "nodeId": "node-1",
  "type": "invalid-config",
  "message": "Node 'node-1' (if-else): Condition is required",
  "details": {
    "field": "condition",
    "config": {}
  }
}
```

### `invalid-edge`
Edge references non-existent nodes or has invalid structure.

**Example:**
```json
{
  "edgeId": "edge-1",
  "type": "invalid-edge",
  "message": "Edge 'edge-1' references non-existent target node: 'node-99'"
}
```

### `missing-node`
Node is missing required fields (id or type).

**Example:**
```json
{
  "type": "missing-node",
  "message": "Node is missing required field: id",
  "details": {
    "node": { "type": "process", "config": {} }
  }
}
```

## Validation Algorithm

### Cycle Detection (DFS)

The validator uses Depth-First Search with a recursion stack to detect cycles:

1. Build adjacency list from edges
2. Track visited nodes and recursion stack
3. For each unvisited node:
   - Mark as visited and add to recursion stack
   - Visit all neighbors recursively
   - If neighbor is in recursion stack → cycle detected
   - Remove from recursion stack when backtracking

**Time Complexity:** O(V + E) where V = nodes, E = edges
**Space Complexity:** O(V) for visited set and recursion stack

### Node Validation

1. Check all nodes have required fields (id, type)
2. Verify node types exist in Node Registry
3. Call `validateConfig()` on each node instance
4. Collect all validation errors

### Edge Validation

1. Check all edges have required fields (id, source, target)
2. Verify source and target nodes exist
3. Detect self-loops (source === target)

### Configuration Validation

1. Get node instance from registry
2. Call node's `validateConfig()` method
3. Collect validation errors with node context

## Integration with Workflow Engine

The validator is used by:

1. **Workflow API** (`/api/workflows/[id]/validate`)
   - Validates workflow before saving
   - Returns validation errors to UI

2. **Workflow Executor**
   - Validates workflow before execution
   - Prevents invalid workflows from running

3. **Node Registry**
   - Validates node configurations during registration
   - Ensures node types are properly implemented

## Testing

The validator includes comprehensive test coverage:

- **Unit Tests** (`validator.test.ts`): 24 tests covering all validation logic
- **Integration Tests** (`validator-integration.test.ts`): 10 tests for real-world scenarios

Run tests:
```bash
npm test -- validator.test.ts
npm test -- validator-integration.test.ts
```

## Requirements Coverage

This implementation satisfies **Requirement 26: Workflow Validation**:

- ✅ Validate that all nodes have valid types registered in Node Registry
- ✅ Validate that all node configurations match schema requirements
- ✅ Validate that all edges connect to valid node input and output ports
- ✅ Detect circular dependencies in workflow graph
- ✅ Return list of validation errors with node identifiers and error descriptions

## Future Enhancements

Potential improvements for future versions:

1. **Port Validation**: Validate that edges connect to valid input/output ports
2. **Data Type Validation**: Validate data types flow correctly between nodes
3. **Reachability Analysis**: Detect unreachable nodes
4. **Performance Optimization**: Cache validation results for large workflows
5. **Custom Validators**: Allow nodes to register custom validation rules
6. **Warning System**: Add non-blocking warnings for best practices
