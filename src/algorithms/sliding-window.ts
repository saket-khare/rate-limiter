import { Redis } from "ioredis";
import { IRateLimitAlgorithm, RateLimitResult } from "../types";

/**
 * Sliding Window Log Rate Limiting Algorithm
 *
 * How it works:
 * - Stores timestamp of each request in a sorted set
 * - For each new request, removes timestamps older than the window
 * - Counts requests in the current sliding window
 * - Rejects if count exceeds limit
 *
 * Example with 10 req/minute window:
 * - At 10:00:30, check requests from 09:59:30 to 10:00:30
 * - At 10:00:45, check requests from 09:59:45 to 10:00:45
 * - Window continuously slides with each request
 *
 * Pros:
 * - Most accurate rate limiting (no burst issues)
 * - Handles edge cases well
 * - True sliding window behavior
 *
 * Cons:
 * - More memory intensive (stores each request timestamp)
 * - Slightly slower than fixed window
 * - Requires cleanup of old entries
 *
 * Redis Implementation:
 * - Data Structure: Sorted Set (ZSET)
 * - Key: "rate_limit:sliding:{identifier}"
 * - Score: Unix timestamp (milliseconds)
 * - Member: Unique request ID (timestamp + random)
 * - Operations: ZADD (add), ZREMRANGEBYSCORE (cleanup), ZCARD (count)
 */
export class SlidingWindowRateLimiter implements IRateLimitAlgorithm {
  constructor(
    private redis: Redis,
    private maxRequests: number,
    private windowSeconds: number,
    private keyPrefix: string = "rate_limit:sliding:"
  ) {}

  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}${identifier}`;
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    // Use Lua script for atomic operations
    // This ensures consistency even under high concurrency
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_seconds = tonumber(ARGV[4])
      
      -- Remove old entries outside the sliding window
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count current requests in window
      local current = redis.call('ZCARD', key)
      
      -- Add new request if under limit
      if current < max_requests then
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        current = current + 1
      end
      
      -- Set expiration (cleanup old keys)
      redis.call('EXPIRE', key, window_seconds)
      
      return current
    `;

    const current = (await this.redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      this.maxRequests.toString(),
      this.windowSeconds.toString()
    )) as number;

    const allowed = current <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - current);

    // For sliding window, reset time is based on oldest request
    const oldestTimestamp = await this.getOldestTimestamp(key);
    const resetAt = oldestTimestamp
      ? Math.ceil((oldestTimestamp + this.windowSeconds * 1000) / 1000)
      : Math.ceil(now / 1000) + this.windowSeconds;

    const retryAfter = allowed
      ? 0
      : Math.max(0, resetAt - Math.floor(now / 1000));

    return {
      allowed,
      current,
      limit: this.maxRequests,
      remaining,
      resetAt,
      retryAfter,
    };
  }

  private async getOldestTimestamp(key: string): Promise<number | null> {
    const oldest = await this.redis.zrange(key, 0, 0, "WITHSCORES");
    if (oldest.length >= 2) {
      return parseFloat(oldest[1]);
    }
    return null;
  }

  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}${identifier}`;
    await this.redis.del(key);
  }
}
