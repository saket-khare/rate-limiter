import { Redis } from "ioredis";
import { IRateLimitAlgorithm, RateLimitResult } from "../types";

/**
 * Fixed Window Rate Limiting Algorithm
 *
 * How it works:
 * - Time is divided into fixed windows (e.g., every minute starts at :00 seconds)
 * - Each window has a counter that starts at 0
 * - Every request increments the counter
 * - When counter reaches limit, all subsequent requests are rejected until window resets
 * - At the start of a new window, counter resets to 0
 *
 * Pros:
 * - Simple to implement and understand
 * - Memory efficient (one counter per identifier)
 * - Fast performance
 *
 * Cons:
 * - Can allow bursts at window boundaries (2x requests around reset time)
 * - Not the most accurate for strict rate limiting
 *
 * Redis Implementation:
 * - Key: "rate_limit:fixed:{identifier}"
 * - Value: Request count (integer)
 * - TTL: Set to window duration, auto-expires when window ends
 */
export class FixedWindowRateLimiter implements IRateLimitAlgorithm {
  constructor(
    private redis: Redis,
    private maxRequests: number,
    private windowSeconds: number,
    private keyPrefix: string = "rate_limit:fixed:"
  ) {}

  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}${identifier}`;
    const now = Math.floor(Date.now() / 1000);

    // Calculate window start time (aligned to window boundaries)
    const windowStart =
      Math.floor(now / this.windowSeconds) * this.windowSeconds;
    const resetAt = windowStart + this.windowSeconds;

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();

    // Increment the counter
    pipeline.incr(key);

    // Get TTL to check if key exists
    pipeline.ttl(key);

    const results = await pipeline.exec();

    if (!results) {
      throw new Error("Redis pipeline execution failed");
    }

    const [incrResult, ttlResult] = results;
    const current = incrResult[1] as number;
    const ttl = ttlResult[1] as number;

    // If key is new (TTL = -1) or expired (TTL = -2), set expiration
    if (ttl === -1 || ttl === -2) {
      const secondsUntilReset = resetAt - now;
      await this.redis.expire(key, secondsUntilReset);
    }

    const allowed = current <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - current);
    const retryAfter = allowed ? 0 : resetAt - now;

    return {
      allowed,
      current,
      limit: this.maxRequests,
      remaining,
      resetAt,
      retryAfter,
    };
  }

  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}${identifier}`;
    await this.redis.del(key);
  }
}
