/**
 * Execution History Query API Documentation
 * 
 * Requirement 24: Execution History and Logging
 * - System SHALL provide APIs to query execution history with filters
 * - System SHALL support pagination for execution history queries
 * - System SHALL store individual node execution results and timings
 */

/**
 * GET /api/executions
 * 
 * List user's workflow executions with filtering and pagination support.
 * 
 * Query Parameters:
 * - workflow_id (optional): Filter by specific workflow ID
 * - status (optional): Filter by execution status (running | completed | failed)
 * - start_date (optional): Filter executions started after this date (ISO 8601 format)
 * - end_date (optional): Filter executions started before this date (ISO 8601 format)
 * - limit (optional): Number of results per page (1-100, default: 20)
 * - offset (optional): Number of results to skip (default: 0)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "executions": [
 *       {
 *         "id": "uuid",
 *         "workflow_id": "uuid",
 *         "workflow_name": "string",
 *         "status": "completed",
 *         "started_at": "2024-01-01T10:00:00Z",
 *         "completed_at": "2024-01-01T10:05:00Z",
 *         "duration": 300,  // seconds
 *         "error": null
 *       }
 *     ],
 *     "total": 100,
 *     "limit": 20,
 *     "offset": 0
 *   }
 * }
 * 
 * Examples:
 * 
 * 1. Get all executions (paginated):
 *    GET /api/executions
 * 
 * 2. Get executions for a specific workflow:
 *    GET /api/executions?workflow_id=abc-123
 * 
 * 3. Get failed executions:
 *    GET /api/executions?status=failed
 * 
 * 4. Get executions in date range:
 *    GET /api/executions?start_date=2024-01-01T00:00:00Z&end_date=2024-01-31T23:59:59Z
 * 
 * 5. Get executions with custom pagination:
 *    GET /api/executions?limit=50&offset=100
 * 
 * 6. Combine multiple filters:
 *    GET /api/executions?workflow_id=abc-123&status=completed&start_date=2024-01-01T00:00:00Z
 */

/**
 * GET /api/executions/[id]
 * 
 * Get detailed execution information including node-level logs.
 * 
 * Path Parameters:
 * - id: Execution ID (UUID)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "workflow_id": "uuid",
 *     "workflow_name": "string",
 *     "workflow_description": "string",
 *     "status": "completed",
 *     "results": { ... },  // Overall execution results
 *     "error": null,
 *     "started_at": "2024-01-01T10:00:00Z",
 *     "completed_at": "2024-01-01T10:05:00Z",
 *     "duration": 300,  // seconds
 *     "logs": [
 *       {
 *         "id": "uuid",
 *         "execution_id": "uuid",
 *         "node_id": "node-1",
 *         "node_type": "if-else",
 *         "status": "completed",
 *         "input": { ... },
 *         "output": { ... },
 *         "error": null,
 *         "duration_ms": 50,
 *         "started_at": "2024-01-01T10:00:00Z",
 *         "completed_at": "2024-01-01T10:00:00.050Z"
 *       },
 *       {
 *         "id": "uuid",
 *         "execution_id": "uuid",
 *         "node_id": "node-2",
 *         "node_type": "send-email",
 *         "status": "completed",
 *         "input": { "to": "user@example.com" },
 *         "output": { "messageId": "msg-123" },
 *         "error": null,
 *         "duration_ms": 1200,
 *         "started_at": "2024-01-01T10:00:01Z",
 *         "completed_at": "2024-01-01T10:00:02.200Z"
 *       }
 *     ]
 *   }
 * }
 * 
 * Example:
 *    GET /api/executions/abc-123-def-456
 * 
 * Notes:
 * - The logs array contains detailed information about each node execution
 * - Logs are ordered by started_at (chronological order)
 * - If execution_logs table doesn't exist or query fails, logs will be an empty array
 * - Duration is calculated from started_at and completed_at timestamps
 */

/**
 * Error Responses:
 * 
 * 400 Bad Request:
 * - Invalid limit (must be 1-100)
 * - Invalid offset (must be non-negative)
 * - Invalid status value (must be: running, completed, or failed)
 * - Invalid date format (must be ISO 8601)
 * 
 * 404 Not Found:
 * - Execution not found or doesn't belong to user
 * 
 * 401 Unauthorized:
 * - User not authenticated
 * 
 * 500 Internal Server Error:
 * - Database query failed
 * - Unexpected server error
 */

export {};
