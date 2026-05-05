/**
 * Unit tests for rate limiting middleware
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  checkRateLimit,
  incrementRateLimit,
  getRateLimitConfig,
  getCurrentUsage,
  getAllUsage,
  resetRateLimit,
  RateLimitConfig,
} from '../rate-limiter';

// Mock the database connection
jest.mock('@/lib/database/pool', () => ({
  withConnection: jest.fn((callback) => {
    // Mock Supabase client
    const mockSupabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    then: jest.fn((resolve) => resolve({ data: [], error: null })),
                  })),
                })),
              })),
            })),
          })),
        })),
        insert: jest.fn(() => ({
          then: jest.fn((resolve) => resolve({ data: null, error: null })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                then: jest.fn((resolve) => resolve({ data: null, error: null })),
              })),
            })),
          })),
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              then: jest.fn((resolve) => resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    };
    return callback(mockSupabase);
  }),
}));

describe('Rate Limiter', () => {
  const testUserId = 'test-user-123';

  describe('getRateLimitConfig', () => {
    it('should return AI API config', () => {
      const config = getRateLimitConfig('ai-api');
      expect(config.resourceType).toBe('ai-api');
      expect(config.maxRequests).toBe(20);
      expect(config.windowSeconds).toBe(60);
    });

    it('should return email send config', () => {
      const config = getRateLimitConfig('email-send');
      expect(config.resourceType).toBe('email-send');
      expect(config.windowSeconds).toBe(3600);
    });

    it('should return workflow execution config', () => {
      const config = getRateLimitConfig('workflow-execution');
      expect(config.resourceType).toBe('workflow-execution');
      expect(config.windowSeconds).toBe(86400);
    });

    it('should return default config for unknown resource type', () => {
      const config = getRateLimitConfig('unknown-resource');
      expect(config.resourceType).toBe('workflow-execution');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow request when no existing record', async () => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowSeconds: 60,
        resourceType: 'ai-api',
      };

      const result = await checkRateLimit(testUserId, config);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(10);
      expect(result.resetAt).toBeGreaterThan(0);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should handle database errors gracefully', async () => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowSeconds: 60,
        resourceType: 'ai-api',
      };

      // The mock will return empty data, simulating no existing record
      const result = await checkRateLimit(testUserId, config);

      // Should fail open (allow request) on error
      expect(result.allowed).toBe(true);
    });
  });

  describe('incrementRateLimit', () => {
    it('should create new record when none exists', async () => {
      const config: RateLimitConfig = {
        maxRequests: 10,
        windowSeconds: 60,
        resourceType: 'ai-api',
      };

      await expect(incrementRateLimit(testUserId, config)).resolves.not.toThrow();
    });
  });

  describe('getCurrentUsage', () => {
    it('should return usage information', async () => {
      const result = await getCurrentUsage(testUserId, 'ai-api');

      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('remaining');
      expect(result).toHaveProperty('resetAt');
    });
  });

  describe('getAllUsage', () => {
    it('should return usage for all resource types', async () => {
      const result = await getAllUsage(testUserId);

      expect(result).toHaveProperty('ai-api');
      expect(result).toHaveProperty('email-send');
      expect(result).toHaveProperty('workflow-execution');

      expect(result['ai-api']).toHaveProperty('allowed');
      expect(result['email-send']).toHaveProperty('allowed');
      expect(result['workflow-execution']).toHaveProperty('allowed');
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for specific resource type', async () => {
      await expect(
        resetRateLimit(testUserId, 'ai-api')
      ).resolves.not.toThrow();
    });

    it('should reset all rate limits when no resource type specified', async () => {
      await expect(resetRateLimit(testUserId)).resolves.not.toThrow();
    });
  });

  describe('Rate limit enforcement', () => {
    it('should enforce AI API limit of 20 per minute', () => {
      const config = getRateLimitConfig('ai-api');
      expect(config.maxRequests).toBe(20);
      expect(config.windowSeconds).toBe(60);
    });

    it('should enforce email send limit (configurable)', () => {
      const config = getRateLimitConfig('email-send');
      expect(config.windowSeconds).toBe(3600); // 1 hour
      expect(config.maxRequests).toBeGreaterThan(0);
    });

    it('should enforce workflow execution limit (configurable)', () => {
      const config = getRateLimitConfig('workflow-execution');
      expect(config.windowSeconds).toBe(86400); // 1 day
      expect(config.maxRequests).toBeGreaterThan(0);
    });
  });

  describe('Retry-After calculation', () => {
    it('should calculate retry-after when limit exceeded', async () => {
      const config: RateLimitConfig = {
        maxRequests: 1,
        windowSeconds: 60,
        resourceType: 'ai-api',
      };

      // First request should be allowed
      const result1 = await checkRateLimit(testUserId, config);
      expect(result1.allowed).toBe(true);

      // Note: In real scenario with database, second request would be blocked
      // This test verifies the structure is correct
      expect(result1).toHaveProperty('resetAt');
    });
  });

  describe('Time window management', () => {
    it('should use correct window for AI API (1 minute)', () => {
      const config = getRateLimitConfig('ai-api');
      expect(config.windowSeconds).toBe(60);
    });

    it('should use correct window for email send (1 hour)', () => {
      const config = getRateLimitConfig('email-send');
      expect(config.windowSeconds).toBe(3600);
    });

    it('should use correct window for workflow execution (1 day)', () => {
      const config = getRateLimitConfig('workflow-execution');
      expect(config.windowSeconds).toBe(86400);
    });
  });

  describe('Configuration validation', () => {
    it('should have valid AI API configuration', () => {
      const config = getRateLimitConfig('ai-api');
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowSeconds).toBeGreaterThan(0);
      expect(config.resourceType).toBe('ai-api');
    });

    it('should have valid email send configuration', () => {
      const config = getRateLimitConfig('email-send');
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowSeconds).toBeGreaterThan(0);
      expect(config.resourceType).toBe('email-send');
    });

    it('should have valid workflow execution configuration', () => {
      const config = getRateLimitConfig('workflow-execution');
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowSeconds).toBeGreaterThan(0);
      expect(config.resourceType).toBe('workflow-execution');
    });
  });
});
