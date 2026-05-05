/**
 * Unit Tests for Usage API Endpoint
 * 
 * Tests the GET /api/usage endpoint functionality
 */

import { GET } from '../route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  getUser: jest.fn(),
  createServiceClient: jest.fn(),
}));

jest.mock('@/lib/middleware/usage-tracker', () => ({
  getCurrentUsageStats: jest.fn(),
  getHistoricalUsage: jest.fn(),
  getUsageSummary: jest.fn(),
  getTotalUsage: jest.fn(),
  getUsageTrends: jest.fn(),
  isApproachingLimit: jest.fn(),
  getDetailedUsageStatistics: jest.fn(),
  getAggregatedUsageSummary: jest.fn(),
}));

import { getUser, createServiceClient } from '@/lib/supabase/server';
import {
  getCurrentUsageStats,
  getHistoricalUsage,
  getUsageSummary,
  getTotalUsage,
  getUsageTrends,
  isApproachingLimit,
  getDetailedUsageStatistics,
  getAggregatedUsageSummary,
} from '@/lib/middleware/usage-tracker';

describe('GET /api/usage', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';

  // Mock Supabase client
  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (getUser as jest.Mock).mockResolvedValue({ id: mockUserId });
    (createServiceClient as jest.Mock).mockReturnValue(mockSupabaseClient);
    
    // Mock user_settings query to return basic tier by default
    mockSupabaseClient.single.mockResolvedValue({
      data: {
        preferences: { quotaTier: 'basic' },
      },
      error: null,
    });
    (getCurrentUsageStats as jest.Mock).mockResolvedValue({
      'ai-api': {
        resourceType: 'ai-api',
        totalRequests: 10,
        currentWindowRequests: 10,
        maxRequests: 20,
        remaining: 10,
        windowStart: new Date(),
        windowEnd: new Date(),
        utilizationPercent: 50,
      },
      'email-send': {
        resourceType: 'email-send',
        totalRequests: 50,
        currentWindowRequests: 50,
        maxRequests: 100,
        remaining: 50,
        windowStart: new Date(),
        windowEnd: new Date(),
        utilizationPercent: 50,
      },
      'workflow-execution': {
        resourceType: 'workflow-execution',
        totalRequests: 100,
        currentWindowRequests: 100,
        maxRequests: 1000,
        remaining: 900,
        windowStart: new Date(),
        windowEnd: new Date(),
        utilizationPercent: 10,
      },
    });
    (getTotalUsage as jest.Mock).mockResolvedValue({
      'ai-api': 100,
      'email-send': 500,
      'workflow-execution': 1000,
    });
    (getUsageSummary as jest.Mock).mockResolvedValue({
      userId: mockUserId,
      period: 'week',
      startDate: new Date(),
      endDate: new Date(),
      stats: {
        'ai-api': { total: 100, average: 14.3, peak: 20 },
        'email-send': { total: 500, average: 71.4, peak: 100 },
        'workflow-execution': { total: 1000, average: 142.9, peak: 200 },
      },
    });
    (isApproachingLimit as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    (getUser as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/usage');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return basic usage statistics', async () => {
    const request = new NextRequest('http://localhost:3000/api/usage');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.userId).toBe(mockUserId);
    expect(data.current).toBeDefined();
    expect(data.total).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(data.warnings).toBeDefined();
  });

  it('should include historical data when requested', async () => {
    (getHistoricalUsage as jest.Mock).mockResolvedValue([
      {
        date: new Date(),
        resourceType: 'ai-api',
        requestCount: 10,
        maxRequests: 20,
      },
    ]);

    const request = new NextRequest(
      'http://localhost:3000/api/usage?includeHistory=true'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.history).toBeDefined();
    expect(getHistoricalUsage).toHaveBeenCalled();
  });

  it('should include trends when requested', async () => {
    (getUsageTrends as jest.Mock).mockResolvedValue([
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 15 },
    ]);

    const request = new NextRequest(
      'http://localhost:3000/api/usage?includeTrends=true'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.trends).toBeDefined();
    expect(getUsageTrends).toHaveBeenCalled();
  });

  it('should include detailed statistics when requested', async () => {
    (getDetailedUsageStatistics as jest.Mock).mockResolvedValue([
      {
        resourceType: 'ai-api',
        periodType: 'hour',
        periodStart: new Date(),
        periodEnd: new Date(),
        requestCount: 10,
        maxRequests: 20,
        peakRequests: 15,
        averageRequests: 10,
        utilizationPercent: 50,
      },
    ]);
    (getAggregatedUsageSummary as jest.Mock).mockResolvedValue([
      {
        resourceType: 'ai-api',
        totalRequests: 100,
        averageRequests: 14.3,
        peakRequests: 20,
        totalPeriods: 7,
      },
    ]);

    const request = new NextRequest(
      'http://localhost:3000/api/usage?includeDetailed=true'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.detailed).toBeDefined();
    expect(data.aggregated).toBeDefined();
    expect(getDetailedUsageStatistics).toHaveBeenCalled();
    expect(getAggregatedUsageSummary).toHaveBeenCalled();
  });

  it('should filter by resource type', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/usage?resourceType=ai-api'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.current).toBeDefined();
  });

  it('should support different period types', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/usage?period=day'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify getUsageSummary was called with 'day' period
    expect(getUsageSummary).toHaveBeenCalledWith(mockUserId, 'day');
  });

  it('should support date range filtering', async () => {
    const startDate = new Date('2024-01-01').toISOString();
    const endDate = new Date('2024-01-07').toISOString();

    const request = new NextRequest(
      `http://localhost:3000/api/usage?startDate=${startDate}&endDate=${endDate}&includeHistory=true`
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getHistoricalUsage).toHaveBeenCalledWith(
      mockUserId,
      undefined,
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('should include warnings for approaching limits', async () => {
    (isApproachingLimit as jest.Mock).mockResolvedValue(true);

    const request = new NextRequest('http://localhost:3000/api/usage');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.warnings).toBeDefined();
    expect(Array.isArray(data.warnings)).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    (getCurrentUsageStats as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const request = new NextRequest('http://localhost:3000/api/usage');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.error).toBe('Failed to fetch usage statistics');
    expect(data.message).toBe('Database error');
  });

  it('should support period type filtering for detailed stats', async () => {
    (getDetailedUsageStatistics as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost:3000/api/usage?includeDetailed=true&periodType=hour'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getDetailedUsageStatistics).toHaveBeenCalledWith(
      mockUserId,
      undefined,
      'hour',
      undefined,
      undefined
    );
  });

  it('should calculate correct days for aggregated summary', async () => {
    (getAggregatedUsageSummary as jest.Mock).mockResolvedValue([]);

    // Test day period (1 day)
    const dayRequest = new NextRequest(
      'http://localhost:3000/api/usage?includeDetailed=true&period=day'
    );
    await GET(dayRequest);
    expect(getAggregatedUsageSummary).toHaveBeenCalledWith(
      mockUserId,
      undefined,
      1
    );

    // Test week period (7 days)
    const weekRequest = new NextRequest(
      'http://localhost:3000/api/usage?includeDetailed=true&period=week'
    );
    await GET(weekRequest);
    expect(getAggregatedUsageSummary).toHaveBeenCalledWith(
      mockUserId,
      undefined,
      7
    );

    // Test month period (30 days)
    const monthRequest = new NextRequest(
      'http://localhost:3000/api/usage?includeDetailed=true&period=month'
    );
    await GET(monthRequest);
    expect(getAggregatedUsageSummary).toHaveBeenCalledWith(
      mockUserId,
      undefined,
      30
    );
  });

  describe('Quota Tier Support', () => {
    it('should return basic tier limits by default', async () => {
      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.quotaTier).toBe('basic');
      expect(data.quotaLimits).toEqual({
        'ai-api': 20,
        'email-send': 100,
        'workflow-execution': 1000,
      });
    });

    it('should return pro tier limits when user has pro tier', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'pro' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.quotaTier).toBe('pro');
      expect(data.quotaLimits).toEqual({
        'ai-api': 100,
        'email-send': 500,
        'workflow-execution': 5000,
      });
    });

    it('should return enterprise tier limits when user has enterprise tier', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'enterprise' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.quotaTier).toBe('enterprise');
      expect(data.quotaLimits).toEqual({
        'ai-api': 500,
        'email-send': 2000,
        'workflow-execution': 20000,
      });
    });

    it('should default to basic tier when user_settings not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.quotaTier).toBe('basic');
    });

    it('should default to basic tier when quotaTier is invalid', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'invalid-tier' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.quotaTier).toBe('basic');
    });

    it('should apply tier limits to current usage stats', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'pro' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // Pro tier has 100 AI requests per minute
      expect(data.current['ai-api'].maxRequests).toBe(100);
      expect(data.current['ai-api'].remaining).toBe(90); // 100 - 10 current
      
      // Pro tier has 500 emails per hour
      expect(data.current['email-send'].maxRequests).toBe(500);
      expect(data.current['email-send'].remaining).toBe(450); // 500 - 50 current
      
      // Pro tier has 5000 workflow executions per day
      expect(data.current['workflow-execution'].maxRequests).toBe(5000);
      expect(data.current['workflow-execution'].remaining).toBe(4900); // 5000 - 100 current
    });

    it('should calculate utilization percent based on tier limits', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'enterprise' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // Enterprise tier has 500 AI requests per minute, current is 10
      expect(data.current['ai-api'].utilizationPercent).toBe(2); // (10/500) * 100 = 2%
      
      // Enterprise tier has 2000 emails per hour, current is 50
      expect(data.current['email-send'].utilizationPercent).toBe(2.5); // (50/2000) * 100 = 2.5%
      
      // Enterprise tier has 20000 workflow executions per day, current is 100
      expect(data.current['workflow-execution'].utilizationPercent).toBe(0.5); // (100/20000) * 100 = 0.5%
    });

    it('should include tier in warning messages', async () => {
      // Mock high usage to trigger warnings (90% utilization on basic tier)
      (getCurrentUsageStats as jest.Mock).mockResolvedValue({
        'ai-api': {
          resourceType: 'ai-api',
          totalRequests: 90,
          currentWindowRequests: 90,
          maxRequests: 100,
          remaining: 10,
          windowStart: new Date(),
          windowEnd: new Date(),
          utilizationPercent: 90,
        },
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: {
          preferences: { quotaTier: 'pro' },
        },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.warnings.length).toBeGreaterThan(0);
      expect(data.warnings[0].tier).toBe('pro');
    });
  });
});

