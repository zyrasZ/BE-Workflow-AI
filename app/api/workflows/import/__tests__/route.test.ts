/**
 * Unit Tests for Workflow Import API Endpoint
 * 
 * Tests the POST /api/workflows/import endpoint functionality
 * Requirement 29: Workflow Import and Export
 */

import { POST } from '../route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  requireAuth: jest.fn(),
  createServiceClient: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

import { requireAuth, createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

describe('POST /api/workflows/import', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserEmail = 'test@example.com';

  // Sample valid workflow
  const validWorkflow = {
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes: [
      { id: 'node-1', type: 'if-else', config: { condition: 'true' } },
      { id: 'node-2', type: 'send-email', config: { to: 'test@example.com' } },
    ],
    edges: [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
    ],
    metadata: {
      author: 'original@example.com',
      version: 1,
    },
  };

  // Mock Supabase client
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (requireAuth as jest.Mock).mockResolvedValue({
      id: mockUserId,
      email: mockUserEmail,
    });

    // Mock UUID generation
    let uuidCounter = 0;
    (uuidv4 as jest.Mock).mockImplementation(() => {
      uuidCounter++;
      return `new-uuid-${uuidCounter}`;
    });

    // Create fresh mock for each test
    const mockSelect = jest.fn();
    const mockInsert = jest.fn();
    const mockSingle = jest.fn();

    mockSupabaseClient = {
      from: jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { type: 'if-else' },
                { type: 'send-email' },
                { type: 'switch' },
                { type: 'loop' },
              ],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'new-workflow-id' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: mockSelect, insert: mockInsert };
      }),
    };

    (createServiceClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      (requireAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('Request Validation', () => {
    it('should reject request without workflow or workflows field', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Invalid request format');
    });

    it('should reject empty workflows array', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflows: [] }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('No workflows provided for import');
    });
  });

  describe('Single Workflow Import', () => {
    it('should successfully import a valid workflow', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.data.success).toBe(true);
      expect(data.data.successCount).toBe(1);
      expect(data.data.failedCount).toBe(0);
      expect(data.data.importedWorkflowIds).toHaveLength(1);
      expect(data.data.errors).toHaveLength(0);
    });

    it('should generate new UUIDs for nodes and edges', async () => {
      let capturedInsertData: any;
      
      // Override the mock to capture the insert data
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { type: 'if-else' },
                { type: 'send-email' },
              ],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn((data: any) => {
              capturedInsertData = data;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'new-workflow-id' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      await POST(request);

      // Check that node IDs were changed
      expect(capturedInsertData.nodes[0].id).not.toBe('node-1');
      expect(capturedInsertData.nodes[1].id).not.toBe('node-2');
      
      // Check that edge IDs and references were updated
      expect(capturedInsertData.edges[0].id).not.toBe('edge-1');
      expect(capturedInsertData.edges[0].source).toBe(capturedInsertData.nodes[0].id);
      expect(capturedInsertData.edges[0].target).toBe(capturedInsertData.nodes[1].id);
    });

    it('should set user_id to authenticated user', async () => {
      let capturedInsertData: any;
      
      // Override the mock to capture the insert data
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ type: 'if-else' }, { type: 'send-email' }],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn((data: any) => {
              capturedInsertData = data;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'new-workflow-id' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      await POST(request);

      expect(capturedInsertData.user_id).toBe(mockUserId);
    });

    it('should add import metadata', async () => {
      let capturedInsertData: any;
      
      // Override the mock to capture the insert data
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ type: 'if-else' }, { type: 'send-email' }],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn((data: any) => {
              capturedInsertData = data;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'new-workflow-id' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      await POST(request);

      expect(capturedInsertData.metadata.importedAt).toBeDefined();
      expect(capturedInsertData.metadata.importedBy).toBe(mockUserEmail);
      expect(capturedInsertData.metadata.originalId).toBeDefined();
    });
  });

  describe('Multiple Workflows Import', () => {
    it('should successfully import multiple workflows', async () => {
      const workflows = [
        { ...validWorkflow, name: 'Workflow 1' },
        { ...validWorkflow, name: 'Workflow 2' },
      ];

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflows }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.data.successCount).toBe(2);
      expect(data.data.failedCount).toBe(0);
      expect(data.data.importedWorkflowIds).toHaveLength(2);
    });

    it('should return 207 Multi-Status for partial success', async () => {
      const workflows = [
        { ...validWorkflow, name: 'Valid Workflow' },
        { name: 'Invalid Workflow' }, // Missing nodes and edges
      ];

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflows }),
      });

      const response = await POST(request);
      expect(response.status).toBe(207);
      
      const data = await response.json();
      expect(data.data.successCount).toBe(1);
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors).toHaveLength(1);
    });
  });

  describe('Workflow Structure Validation', () => {
    it('should reject workflow without name', async () => {
      const invalidWorkflow = { ...validWorkflow };
      delete (invalidWorkflow as any).name;

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('name is required');
    });

    it('should reject workflow without nodes array', async () => {
      const invalidWorkflow = { ...validWorkflow };
      delete (invalidWorkflow as any).nodes;

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('nodes are required');
    });

    it('should reject workflow without edges array', async () => {
      const invalidWorkflow = { ...validWorkflow };
      delete (invalidWorkflow as any).edges;

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('edges are required');
    });

    it('should reject node without id', async () => {
      const invalidWorkflow = {
        ...validWorkflow,
        nodes: [{ type: 'if-else' }],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('missing required \'id\' field');
    });

    it('should reject node without type', async () => {
      const invalidWorkflow = {
        ...validWorkflow,
        nodes: [{ id: 'node-1' }],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('missing required \'type\' field');
    });

    it('should reject edge with non-existent source node', async () => {
      const invalidWorkflow = {
        ...validWorkflow,
        edges: [
          { id: 'edge-1', source: 'non-existent', target: 'node-2' },
        ],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('non-existent source node');
    });

    it('should reject edge with non-existent target node', async () => {
      const invalidWorkflow = {
        ...validWorkflow,
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'non-existent' },
        ],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: invalidWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('non-existent target node');
    });
  });

  describe('Missing Node Types Handling', () => {
    it('should warn about missing node types but still import', async () => {
      const workflowWithMissingType = {
        ...validWorkflow,
        nodes: [
          { id: 'node-1', type: 'if-else', config: {} },
          { id: 'node-2', type: 'custom-unknown-type', config: {} },
        ],
        edges: [
          { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: workflowWithMissingType }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.data.successCount).toBe(1);
      expect(data.data.warnings).toHaveLength(1);
      expect(data.data.warnings[0].warning).toContain('Missing node types');
      expect(data.data.missingNodeTypes).toContain('custom-unknown-type');
    });

    it('should not duplicate missing node types in report', async () => {
      const workflowWithDuplicateMissingTypes = {
        ...validWorkflow,
        nodes: [
          { id: 'node-1', type: 'unknown-type-1', config: {} },
          { id: 'node-2', type: 'unknown-type-1', config: {} },
          { id: 'node-3', type: 'unknown-type-2', config: {} },
        ],
        edges: [],
      };

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: workflowWithDuplicateMissingTypes }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.missingNodeTypes).toHaveLength(2);
      expect(data.data.missingNodeTypes).toContain('unknown-type-1');
      expect(data.data.missingNodeTypes).toContain('unknown-type-2');
    });
  });

  describe('Database Error Handling', () => {
    it('should handle node_types query failure', async () => {
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toContain('Failed to fetch node types registry');
    });

    it('should handle workflow insertion failure', async () => {
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ type: 'if-else' }, { type: 'send-email' }],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Insertion failed' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data.failedCount).toBe(1);
      expect(data.data.errors[0].error).toContain('Database insertion failed');
    });

    it('should return 400 when all imports fail', async () => {
      mockSupabaseClient.from = jest.fn((table: string) => {
        if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ type: 'if-else' }, { type: 'send-email' }],
              error: null,
            }),
          };
        } else if (table === 'workflows') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Insertion failed' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('All workflow imports failed');
    });
  });

  describe('Import Report', () => {
    it('should provide comprehensive import report', async () => {
      const request = new NextRequest('http://localhost:3000/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: validWorkflow }),
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(data.data).toHaveProperty('success');
      expect(data.data).toHaveProperty('successCount');
      expect(data.data).toHaveProperty('failedCount');
      expect(data.data).toHaveProperty('importedWorkflowIds');
      expect(data.data).toHaveProperty('errors');
      expect(data.data).toHaveProperty('warnings');
      expect(data.data).toHaveProperty('missingNodeTypes');
    });
  });
});
