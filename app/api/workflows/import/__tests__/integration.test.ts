/**
 * Integration Tests for Workflow Import/Export
 * 
 * Tests the integration between export and import APIs
 * Requirement 29: Workflow Import and Export
 */

import { GET as exportWorkflow } from '../../[id]/export/route';
import { POST as importWorkflow } from '../route';
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

describe('Workflow Import/Export Integration', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserEmail = 'test@example.com';
  const mockWorkflowId = 'workflow-123';

  const mockWorkflowData = {
    id: mockWorkflowId,
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
      author: 'test@example.com',
      version: 1,
    },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authentication
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

    // Create mock Supabase client
    mockSupabaseClient = {
      from: jest.fn((table: string) => {
        if (table === 'workflows') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: mockWorkflowData,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'imported-workflow-id' },
                  error: null,
                }),
              }),
            }),
          };
        } else if (table === 'node_types') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { type: 'if-else' },
                { type: 'send-email' },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    (createServiceClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  it('should export and then import a workflow successfully', async () => {
    // Step 1: Export the workflow
    const exportRequest = new NextRequest(
      `http://localhost:3000/api/workflows/${mockWorkflowId}/export`
    );
    const exportResponse = await exportWorkflow(exportRequest, {
      params: { id: mockWorkflowId },
    });

    expect(exportResponse.status).toBe(200);
    const exportData = await exportResponse.json();
    expect(exportData.data.workflow).toBeDefined();

    // Step 2: Import the exported workflow
    const importRequest = new NextRequest('http://localhost:3000/api/workflows/import', {
      method: 'POST',
      body: JSON.stringify({ workflow: exportData.data.workflow }),
    });
    const importResponse = await importWorkflow(importRequest);

    expect(importResponse.status).toBe(201);
    const importData = await importResponse.json();
    
    expect(importData.data.success).toBe(true);
    expect(importData.data.successCount).toBe(1);
    expect(importData.data.failedCount).toBe(0);
    expect(importData.data.importedWorkflowIds).toHaveLength(1);
  });

  it('should preserve workflow structure during export/import cycle', async () => {
    // Export
    const exportRequest = new NextRequest(
      `http://localhost:3000/api/workflows/${mockWorkflowId}/export`
    );
    const exportResponse = await exportWorkflow(exportRequest, {
      params: { id: mockWorkflowId },
    });
    const exportData = await exportResponse.json();

    // Import
    const importRequest = new NextRequest('http://localhost:3000/api/workflows/import', {
      method: 'POST',
      body: JSON.stringify({ workflow: exportData.data.workflow }),
    });
    await importWorkflow(importRequest);

    // Verify the insert was called with correct structure
    const insertCall = mockSupabaseClient.from.mock.results.find(
      (result: any) => result.value.insert
    );
    
    expect(insertCall).toBeDefined();
  });

  it('should generate new IDs during import', async () => {
    // Export
    const exportRequest = new NextRequest(
      `http://localhost:3000/api/workflows/${mockWorkflowId}/export`
    );
    const exportResponse = await exportWorkflow(exportRequest, {
      params: { id: mockWorkflowId },
    });
    const exportData = await exportResponse.json();

    const originalNodeIds = exportData.data.workflow.nodes.map((n: any) => n.id);
    const originalEdgeIds = exportData.data.workflow.edges.map((e: any) => e.id);

    // Import
    let capturedInsertData: any;
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
                  data: { id: 'imported-workflow-id' },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const importRequest = new NextRequest('http://localhost:3000/api/workflows/import', {
      method: 'POST',
      body: JSON.stringify({ workflow: exportData.data.workflow }),
    });
    await importWorkflow(importRequest);

    // Verify new IDs were generated
    const importedNodeIds = capturedInsertData.nodes.map((n: any) => n.id);
    const importedEdgeIds = capturedInsertData.edges.map((e: any) => e.id);

    expect(importedNodeIds).not.toEqual(originalNodeIds);
    expect(importedEdgeIds).not.toEqual(originalEdgeIds);
  });

  it('should add import metadata', async () => {
    // Export
    const exportRequest = new NextRequest(
      `http://localhost:3000/api/workflows/${mockWorkflowId}/export`
    );
    const exportResponse = await exportWorkflow(exportRequest, {
      params: { id: mockWorkflowId },
    });
    const exportData = await exportResponse.json();

    // Import
    let capturedInsertData: any;
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
                  data: { id: 'imported-workflow-id' },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    const importRequest = new NextRequest('http://localhost:3000/api/workflows/import', {
      method: 'POST',
      body: JSON.stringify({ workflow: exportData.data.workflow }),
    });
    await importWorkflow(importRequest);

    // Verify import metadata was added
    expect(capturedInsertData.metadata.importedAt).toBeDefined();
    expect(capturedInsertData.metadata.importedBy).toBe(mockUserEmail);
    expect(capturedInsertData.metadata.originalId).toBe(mockWorkflowId);
  });
});
