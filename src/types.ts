import { Redis } from "ioredis";

/**
 * Rate limiting algorithms available
 */
export enum RateLimitAlgorithm {
  FIXED_WINDOW = "fixed-window",
  SLIDING_WINDOW = "sliding-window",
  LEAKY_BUCKET = "leaky-bucket",
}

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
  /** Redis client instance */
  redis: Redis;

  /** Algorithm to use for rate limiting */
  algorithm: RateLimitAlgorithm;

  /** Maximum number of requests allowed in the window */
  maxRequests: number;

  /** Time window in seconds */
  windowSeconds: number;

  /** Key prefix for Redis keys (default: 'rate_limit:') */
  keyPrefix?: string;

  /** Function to extract identifier from request (e.g., IP, user ID) */
  identifierFn?: (req: any) => string;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Current request count in the window */
  current: number;

  /** Maximum requests allowed */
  limit: number;

  /** Remaining requests before hitting limit */
  remaining: number;

  /** Unix timestamp when the limit resets (in seconds) */
  resetAt: number;

  /** Time until reset in seconds */
  retryAfter: number;
}

/**
 * Base interface for rate limiting algorithms
 */
export interface IRateLimitAlgorithm {
  /**
   * Check if a request should be allowed based on the rate limit
   * @param identifier - Unique identifier for the client (IP, user ID, etc.)
   * @returns Rate limit result
   */
  check(identifier: string): Promise<RateLimitResult>;

  /**
   * Reset the rate limit for a specific identifier
   * @param identifier - Unique identifier to reset
   */
  reset(identifier: string): Promise<void>;
}
