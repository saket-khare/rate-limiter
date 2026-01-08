import { Redis } from "ioredis";
import {
  RateLimiterConfig,
  RateLimitResult,
  RateLimitAlgorithm,
  IRateLimitAlgorithm,
} from "./types";
import {
  FixedWindowRateLimiter,
  SlidingWindowRateLimiter,
  LeakyBucketRateLimiter,
} from "./algorithms";

/**
 * Main RateLimiter class that manages different rate limiting algorithms
 * and provides a unified interface for rate limiting
 */
export class RateLimiter {
  private algorithm: IRateLimitAlgorithm;
  private identifierFn: (req: any) => string;

  constructor(config: RateLimiterConfig) {
    this.identifierFn = config.identifierFn || this.defaultIdentifierFn;

    const keyPrefix = config.keyPrefix || "rate_limit:";

    // Initialize the appropriate algorithm based on configuration
    switch (config.algorithm) {
      case RateLimitAlgorithm.FIXED_WINDOW:
        this.algorithm = new FixedWindowRateLimiter(
          config.redis,
          config.maxRequests,
          config.windowSeconds,
          keyPrefix
        );
        break;

      case RateLimitAlgorithm.SLIDING_WINDOW:
        this.algorithm = new SlidingWindowRateLimiter(
          config.redis,
          config.maxRequests,
          config.windowSeconds,
          keyPrefix
        );
        break;

      case RateLimitAlgorithm.LEAKY_BUCKET:
        this.algorithm = new LeakyBucketRateLimiter(
          config.redis,
          config.maxRequests,
          config.windowSeconds,
          keyPrefix
        );
        break;

      default:
        throw new Error(`Unknown algorithm: ${config.algorithm}`);
    }
  }

  /**
   * Check if a request should be rate limited
   * @param identifier - Unique identifier for the client
   * @returns Rate limit result with allowed status and metadata
   */
  async check(identifier: string): Promise<RateLimitResult> {
    return this.algorithm.check(identifier);
  }

  /**
   * Check rate limit using request object (uses identifierFn)
   * @param req - Request object (Express request or similar)
   * @returns Rate limit result
   */
  async checkRequest(req: any): Promise<RateLimitResult> {
    const identifier = this.identifierFn(req);
    return this.check(identifier);
  }

  /**
   * Reset rate limit for a specific identifier
   * @param identifier - Unique identifier to reset
   */
  async reset(identifier: string): Promise<void> {
    return this.algorithm.reset(identifier);
  }

  /**
   * Default identifier function - extracts IP address from request
   * @param req - Request object
   * @returns IP address or 'unknown'
   */
  private defaultIdentifierFn(req: any): string {
    // Try to get real IP from various headers (proxy-aware)
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }

    const realIp = req.headers["x-real-ip"];
    if (realIp) {
      return realIp;
    }

    // Fallback to direct connection IP
    return req.ip || req.connection?.remoteAddress || "unknown";
  }

  /**
   * Create Express middleware for rate limiting
   * @param options - Optional configuration for middleware behavior
   * @returns Express middleware function
   */
  middleware(
    options: {
      skipFailedRequests?: boolean;
      skipSuccessfulRequests?: boolean;
      onLimitReached?: (req: any, res: any, result: RateLimitResult) => void;
    } = {}
  ) {
    return async (req: any, res: any, next: any) => {
      try {
        const result = await this.checkRequest(req);

        // Set rate limit headers (standard HTTP headers)
        res.setHeader("X-RateLimit-Limit", result.limit.toString());
        res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
        res.setHeader("X-RateLimit-Reset", result.resetAt.toString());

        if (!result.allowed) {
          // Set Retry-After header for 429 responses
          res.setHeader("Retry-After", result.retryAfter.toString());

          // Call custom handler if provided
          if (options.onLimitReached) {
            options.onLimitReached(req, res, result);
          }

          // Return 429 Too Many Requests
          return res.status(429).json({
            error: "Too Many Requests",
            message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
            limit: result.limit,
            current: result.current,
            resetAt: result.resetAt,
            retryAfter: result.retryAfter,
          });
        }

        // Request is allowed, continue to next middleware
        next();
      } catch (error) {
        console.error("Rate limiter error:", error);
        // On error, allow the request to proceed (fail open)
        next();
      }
    };
  }
}

/**
 * Factory function to create a rate limiter with Express middleware
 * @param config - Rate limiter configuration
 * @returns Object with rateLimiter instance and middleware
 */
export function createRateLimiter(config: RateLimiterConfig) {
  const rateLimiter = new RateLimiter(config);

  return {
    rateLimiter,
    middleware: rateLimiter.middleware.bind(rateLimiter),
  };
}
