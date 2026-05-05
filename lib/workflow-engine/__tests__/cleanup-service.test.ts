/**
 * Unit tests for ExecutionCleanupService
 * 
 * Tests cover:
 * - Cleanup configuration and defaults
 * - Cutoff date calculation
 * - Dry run mode (counting without deletion)
 * - Actual deletion of old executions and logs
 * - Batch processing
 * - Error handling
 */

import { ExecutionCleanupService } from '../cleanup-service';
import { createServiceClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}));

describe('ExecutionCleanupService', () => {
  let cleanupService: ExecutionCleanupService;
  let mockSupabase: any;

  beforeEach(() => {
    cleanupService = new ExecutionCleanupService();

    // Create mock query builder that returns itself for chaining
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn(() => mockQueryBuilder),
    };

    // Store reference to query builder for test assertions
    mockSupabase.queryBuilder = mockQueryBuilder;

    (createServiceClient as jest.Mock).mockReturnValue(mockSupabase);

    // Clear environment variables
    delete process.env.EXECUTION_RETENTION_DAYS;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use default retention period of 90 days', () => {
      const config = cleanupService.getConfig();
      expect(config.retentionDays).toBe(90);
    });

    it('should use environment variable for retention period', () => {
      process.env.EXECUTION_RETENTION_DAYS = '30';
      const service = new ExecutionCleanupService();
      const config = service.getConfig();
      expect(config.retentionDays).toBe(30);
    });

    it('should use default if environment variable is invalid', () => {
      process.env.EXECUTION_RETENTION_DAYS = 'invalid';
      const service = new ExecutionCleanupService();
      const config = service.getConfig();
      expect(config.retentionDays).toBe(90);
    });

    it('should use default if environment variable is negative', () => {
      process.env.EXECUTION_RETENTION_DAYS = '-10';
      const service = new ExecutionCleanupService();
      const config = service.getConfig();
      expect(config.retentionDays).toBe(90);
    });
  });

  describe('Dry Run Mode', () => {
    it('should count executions without deleting in dry run mode', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      // Mock count query for executions
      queryBuilder.select.mockResolvedValueOnce({
        count: 5,
        error: null,
      });

      // Mock query for execution IDs
      queryBuilder.select.mockResolvedValueOnce({
        data: [
          { id: 'exec-1' },
          { id: 'exec-2' },
          { id: 'exec-3' },
          { id: 'exec-4' },
          { id: 'exec-5' },
        ],
        error: null,
      });

      // Mock count query for logs
      queryBuilder.select.mockResolvedValueOnce({
        count: 15,
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.executionsDeleted).toBe(5);
      expect(result.logsDeleted).toBe(15);
      expect(result.errors).toHaveLength(0);

      // Verify no delete operations were called
      expect(queryBuilder.delete).not.toHaveBeenCalled();
    });

    it('should handle zero records in dry run mode', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: true,
      });

      expect(result.executionsDeleted).toBe(0);
      expect(result.logsDeleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Actual Deletion', () => {
    it('should delete old executions and logs', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      // Mock fetch executions query
      queryBuilder.select.mockResolvedValueOnce({
        data: [
          { id: 'exec-1' },
          { id: 'exec-2' },
        ],
        error: null,
      });

      // Mock count logs query
      queryBuilder.select.mockResolvedValueOnce({
        count: 6,
        error: null,
      });

      // Mock delete executions
      queryBuilder.delete.mockResolvedValueOnce({
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.executionsDeleted).toBe(2);
      expect(result.logsDeleted).toBe(6);
      expect(result.errors).toHaveLength(0);

      // Verify delete was called
      expect(queryBuilder.delete).toHaveBeenCalled();
    });

    it('should process multiple batches', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      // First batch
      queryBuilder.select.mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({ id: `exec-${i}` })),
        error: null,
      });

      queryBuilder.select.mockResolvedValueOnce({
        count: 300,
        error: null,
      });

      queryBuilder.delete.mockResolvedValueOnce({
        error: null,
      });

      // Second batch
      queryBuilder.select.mockResolvedValueOnce({
        data: Array.from({ length: 50 }, (_, i) => ({ id: `exec-${i + 100}` })),
        error: null,
      });

      queryBuilder.select.mockResolvedValueOnce({
        count: 150,
        error: null,
      });

      queryBuilder.delete.mockResolvedValueOnce({
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: false,
        batchSize: 100,
      });

      expect(result.executionsDeleted).toBe(150);
      expect(result.logsDeleted).toBe(450);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty result set', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: false,
      });

      expect(result.executionsDeleted).toBe(0);
      expect(result.logsDeleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: true,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database connection failed');
    });

    it('should handle deletion errors', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        data: [{ id: 'exec-1' }],
        error: null,
      });

      queryBuilder.select.mockResolvedValueOnce({
        count: 3,
        error: null,
      });

      queryBuilder.delete.mockResolvedValueOnce({
        error: { message: 'Delete operation failed' },
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: false,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Delete operation failed');
    });

    it('should handle unexpected errors', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: false,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unexpected error');
    });
  });

  describe('Cutoff Date Calculation', () => {
    it('should calculate correct cutoff date', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 30,
        dryRun: true,
      });

      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 30);

      // Allow 1 second tolerance for test execution time
      const timeDiff = Math.abs(result.cutoffDate.getTime() - expectedCutoff.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });
  });

  describe('Performance Metrics', () => {
    it('should track execution duration', async () => {
      const queryBuilder = mockSupabase.queryBuilder;

      queryBuilder.select.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      const result = await cleanupService.cleanup({
        retentionDays: 90,
        dryRun: true,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });
  });
});
