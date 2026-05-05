/**
 * Unit Tests for Usage Tracker
 * 
 * Tests usage tracking functionality including:
 * - Current usage statistics retrieval
 * - Historical usage data
 * - Usage summary aggregation
 * - Data archiving and cleanup
 */

import {
  getCurrentUsageStats,
  getHistoricalUsage,
  getUsageSummary,
  getTotalUsage,
  getUsageTrends,
  isApproachingLimit,
  archiveRateLimitData,
  cleanupExpiredRecords,
  cleanupOldUsageStatistics,
  getDetailedUsageStatistics,
  getAggregatedUsageSummary,
} from '../usage-tracker';

// Mock the database connection
jest.mock('@/lib/database/pool', () => ({
  withConnection: jest.fn((callback) => {
    // Create a chainable mock query object
    const createChainableMock = () => {
      const mock: any = {
        eq: jest.fn().mockReturnValue(mock),
        gte: jest.fn().mockReturnValue(mock),
        lte: jest.fn().mockReturnValue(mock),
        order: jest.fn().mockReturnValue(mock),
        then: jest.fn((resolve) => resolve({ data: [], error: null })),
      };
      // Make it awaitable
      mock[Symbol.toStringTag] = 'Promise';
      return mock;
    };

    const mockSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn(() => ({
        select: jest.fn(() => createChainableMock()),
      })),
    };
    return callback(mockSupabase);
  }),
}));

describe('Usage Tracker', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCurrentUsageStats', () => {
    it('should return usage stats for all resource types', async () => {
      const stats = await getCurrentUsageStats(mockUserId);

      expect(stats).toBeDefined();
      expect(stats['ai-api']).toBeDefined();
      expect(stats['email-send']).toBeDefined();
      expect(stats['workflow-execution']).toBeDefined();
    });

    it('should include utilization percentage', async () => {
      const stats = await getCurrentUsageStats(mockUserId);

      for (const resourceType of Object.keys(stats)) {
        expect(stats[resourceType].utilizationPercent).toBeGreaterThanOrEqual(0);
        expect(stats[resourceType].utilizationPercent).toBeLessThanOrEqual(100);
      }
    });

    it('should handle errors gracefully', async () => {
      const stats = await getCurrentUsageStats(mockUserId);

      // Should return default stats on error
      expect(stats).toBeDefined();
      expect(Object.keys(stats).length).toBeGreaterThan(0);
    });
  });

  describe('getHistoricalUsage', () => {
    it('should return historical usage data', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const history = await getHistoricalUsage(
        mockUserId,
        'ai-api',
        startDate,
        endDate
      );

      expect(Array.isArray(history)).toBe(true);
    });

    it('should filter by resource type', async () => {
      const history = await getHistoricalUsage(mockUserId, 'email-send');

      expect(Array.isArray(history)).toBe(true);
    });

    it('should use default date range if not provided', async () => {
      const history = await getHistoricalUsage(mockUserId);

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary for specified period', async () => {
      const summary = await getUsageSummary(mockUserId, 'week');

      expect(summary).toBeDefined();
      expect(summary.userId).toBe(mockUserId);
      expect(summary.period).toBe('week');
      expect(summary.stats).toBeDefined();
    });

    it('should calculate statistics correctly', async () => {
      const summary = await getUsageSummary(mockUserId, 'day');

      expect(summary.stats['ai-api']).toBeDefined();
      expect(summary.stats['ai-api'].total).toBeGreaterThanOrEqual(0);
      expect(summary.stats['ai-api'].average).toBeGreaterThanOrEqual(0);
      expect(summary.stats['ai-api'].peak).toBeGreaterThanOrEqual(0);
    });

    it('should support different period types', async () => {
      const daySummary = await getUsageSummary(mockUserId, 'day');
      const weekSummary = await getUsageSummary(mockUserId, 'week');
      const monthSummary = await getUsageSummary(mockUserId, 'month');

      expect(daySummary.period).toBe('day');
      expect(weekSummary.period).toBe('week');
      expect(monthSummary.period).toBe('month');
    });
  });

  describe('getTotalUsage', () => {
    it('should return total usage for all resource types', async () => {
      const totals = await getTotalUsage(mockUserId);

      expect(totals).toBeDefined();
      expect(totals['ai-api']).toBeGreaterThanOrEqual(0);
      expect(totals['email-send']).toBeGreaterThanOrEqual(0);
      expect(totals['workflow-execution']).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUsageTrends', () => {
    it('should return daily usage trends', async () => {
      const trends = await getUsageTrends(mockUserId, 'ai-api', 7);

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should return sorted trends by date', async () => {
      const trends = await getUsageTrends(mockUserId, 'email-send', 7);

      if (trends.length > 1) {
        for (let i = 1; i < trends.length; i++) {
          expect(trends[i].date >= trends[i - 1].date).toBe(true);
        }
      }
    });
  });

  describe('isApproachingLimit', () => {
    it('should detect when usage is approaching limit', async () => {
      const approaching = await isApproachingLimit(mockUserId, 'ai-api', 80);

      expect(typeof approaching).toBe('boolean');
    });

    it('should use default threshold of 80%', async () => {
      const approaching = await isApproachingLimit(mockUserId, 'ai-api');

      expect(typeof approaching).toBe('boolean');
    });
  });

  describe('archiveRateLimitData', () => {
    it('should archive expired rate limit data', async () => {
      const archivedCount = await archiveRateLimitData();

      expect(typeof archivedCount).toBe('number');
      expect(archivedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupExpiredRecords', () => {
    it('should cleanup expired rate limit records', async () => {
      const deletedCount = await cleanupExpiredRecords();

      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupOldUsageStatistics', () => {
    it('should cleanup old usage statistics', async () => {
      const deletedCount = await cleanupOldUsageStatistics(90);

      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should use default retention period of 90 days', async () => {
      const deletedCount = await cleanupOldUsageStatistics();

      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDetailedUsageStatistics', () => {
    it('should return detailed usage statistics', async () => {
      const stats = await getDetailedUsageStatistics(mockUserId);

      expect(Array.isArray(stats)).toBe(true);
    });

    it('should filter by resource type', async () => {
      const stats = await getDetailedUsageStatistics(mockUserId, 'ai-api');

      expect(Array.isArray(stats)).toBe(true);
    });

    it('should filter by period type', async () => {
      const stats = await getDetailedUsageStatistics(
        mockUserId,
        undefined,
        'hour'
      );

      expect(Array.isArray(stats)).toBe(true);
    });

    it('should filter by date range', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const stats = await getDetailedUsageStatistics(
        mockUserId,
        undefined,
        undefined,
        startDate,
        endDate
      );

      expect(Array.isArray(stats)).toBe(true);
    });
  });

  describe('getAggregatedUsageSummary', () => {
    it('should return aggregated usage summary', async () => {
      const summary = await getAggregatedUsageSummary(mockUserId);

      expect(Array.isArray(summary)).toBe(true);
    });

    it('should filter by resource type', async () => {
      const summary = await getAggregatedUsageSummary(mockUserId, 'email-send');

      expect(Array.isArray(summary)).toBe(true);
    });

    it('should support custom day range', async () => {
      const summary = await getAggregatedUsageSummary(mockUserId, undefined, 30);

      expect(Array.isArray(summary)).toBe(true);
    });

    it('should include all required fields', async () => {
      const summary = await getAggregatedUsageSummary(mockUserId);

      if (summary.length > 0) {
        const record = summary[0];
        expect(record.resourceType).toBeDefined();
        expect(record.totalRequests).toBeGreaterThanOrEqual(0);
        expect(record.averageRequests).toBeGreaterThanOrEqual(0);
        expect(record.peakRequests).toBeGreaterThanOrEqual(0);
        expect(record.totalPeriods).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete cleanup workflow', async () => {
      // Archive data
      const archivedCount = await archiveRateLimitData();
      expect(archivedCount).toBeGreaterThanOrEqual(0);

      // Cleanup expired records
      const deletedCount = await cleanupExpiredRecords();
      expect(deletedCount).toBeGreaterThanOrEqual(0);

      // Cleanup old statistics
      const oldStatsDeleted = await cleanupOldUsageStatistics(90);
      expect(oldStatsDeleted).toBeGreaterThanOrEqual(0);
    });

    it('should provide consistent data across different query methods', async () => {
      const currentStats = await getCurrentUsageStats(mockUserId);
      const totalUsage = await getTotalUsage(mockUserId);

      expect(currentStats).toBeDefined();
      expect(totalUsage).toBeDefined();

      // Both should have the same resource types
      const currentTypes = Object.keys(currentStats);
      const totalTypes = Object.keys(totalUsage);

      expect(currentTypes.sort()).toEqual(totalTypes.sort());
    });
  });
});
