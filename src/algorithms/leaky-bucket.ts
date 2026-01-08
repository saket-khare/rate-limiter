import { Redis } from "ioredis";
import { IRateLimitAlgorithm, RateLimitResult } from "../types";

/**
 * Leaky Bucket Rate Limiting Algorithm
 *
 * How it works:
 * - Imagine a bucket with a small hole at the bottom
 * - Requests fill the bucket (water going in)
 * - Bucket leaks at a constant rate (hole drains water)
 * - If bucket overflows (too full), request is rejected
 * - Bucket capacity = maxRequests
 * - Leak rate = maxRequests / windowSeconds (requests per second)
 *
 * Example with 100 req/minute:
 * - Bucket capacity: 100 requests
 * - Leak rate: 100/60 = 1.67 requests per second
 * - If 50 requests come in 10 seconds, bucket has ~33 requests
 *   (50 added - 16.7 leaked = 33.3)
 *
 * Pros:
 * - Smooths out traffic spikes
 * - Provides consistent request rate
 * - Good for protecting downstream services
 * - Allows short bursts while maintaining average rate
 *
 * Cons:
 * - More complex implementation
 * - Requires timestamp tracking
 * - Slightly higher computational cost
 *
 * Redis Implementation:
 * - Key: "rate_limit:leaky:{identifier}"
 * - Value: JSON with { level: number, lastLeakTime: number }
 * - level: Current bucket fill level (0 to maxRequests)
 * - lastLeakTime: Timestamp of last leak calculation
 */
export class LeakyBucketRateLimiter implements IRateLimitAlgorithm {
  private leakRate: number; // Requests per second

  constructor(
    private redis: Redis,
    private maxRequests: number,
    private windowSeconds: number,
    private keyPrefix: string = "rate_limit:leaky:"
  ) {
    // Calculate leak rate: requests per second
    this.leakRate = maxRequests / windowSeconds;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}${identifier}`;
    const now = Date.now();

    // Lua script for atomic bucket operations
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local max_requests = tonumber(ARGV[2])
      local leak_rate = tonumber(ARGV[3])
      local window_seconds = tonumber(ARGV[4])
      
      -- Get current bucket state
      local bucket_data = redis.call('GET', key)
      local level = 0
      local last_leak_time = now
      
      if bucket_data then
        local data = cjson.decode(bucket_data)
        level = tonumber(data.level)
        last_leak_time = tonumber(data.lastLeakTime)
      end
      
      -- Calculate how much leaked since last check
      local time_passed = (now - last_leak_time) / 1000 -- Convert to seconds
      local leaked = time_passed * leak_rate
      
      -- Update bucket level (can't go below 0)
      level = math.max(0, level - leaked)
      
      -- Try to add new request
      local allowed = false
      if level < max_requests then
        level = level + 1
        allowed = true
      end
      
      -- Save updated state
      local new_data = cjson.encode({
        level = level,
        lastLeakTime = now
      })
      redis.call('SET', key, new_data, 'EX', window_seconds * 2)
      
      return {allowed and 1 or 0, level}
    `;

    const result = (await this.redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      this.maxRequests.toString(),
      this.leakRate.toString(),
      this.windowSeconds.toString()
    )) as [number, number];

    const [allowedNum, level] = result;
    const allowed = allowedNum === 1;
    const current = Math.ceil(level);
    const remaining = Math.max(0, this.maxRequests - current);

    // Calculate when bucket will have space (for retry)
    const resetAt =
      Math.ceil(now / 1000) +
      Math.ceil((current - this.maxRequests + 1) / this.leakRate);
    const retryAfter = allowed
      ? 0
      : Math.max(1, Math.ceil((current - this.maxRequests) / this.leakRate));

    return {
      allowed,
      current,
      limit: this.maxRequests,
      remaining,
      resetAt: resetAt || Math.floor(now / 1000) + this.windowSeconds,
      retryAfter,
    };
  }

  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}${identifier}`;
    await this.redis.del(key);
  }
}
