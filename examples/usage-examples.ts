import Redis from "ioredis";
import { RateLimiter, RateLimitAlgorithm } from "../src";

// Initialize Redis
const redis = new Redis({
  host: "localhost",
  port: 6379,
});

async function runExamples() {
  console.log("🚀 Rate Limiter Usage Examples\n");

  // ============================================================
  // Example 1: Basic Fixed Window Usage
  // ============================================================
  console.log("📌 Example 1: Fixed Window Rate Limiter");
  console.log("─".repeat(50));

  const fixedWindowLimiter = new RateLimiter({
    redis,
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    maxRequests: 5,
    windowSeconds: 10,
  });

  // Simulate 7 requests
  for (let i = 1; i <= 7; i++) {
    const result = await fixedWindowLimiter.check("user:123");
    console.log(`Request ${i}:`, {
      allowed: result.allowed,
      current: result.current,
      remaining: result.remaining,
      resetAt: new Date(result.resetAt * 1000).toISOString(),
    });

    if (!result.allowed) {
      console.log(`   ❌ REJECTED - Retry after ${result.retryAfter} seconds`);
    }

    // Small delay between requests
    await sleep(100);
  }

  console.log("\n");

  // ============================================================
  // Example 2: Sliding Window Usage
  // ============================================================
  console.log("📌 Example 2: Sliding Window Rate Limiter");
  console.log("─".repeat(50));

  const slidingWindowLimiter = new RateLimiter({
    redis,
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
    maxRequests: 3,
    windowSeconds: 5,
  });

  console.log("Making 5 requests rapidly...");
  for (let i = 1; i <= 5; i++) {
    const result = await slidingWindowLimiter.check("user:456");
    const status = result.allowed ? "✅ ALLOWED" : "❌ REJECTED";
    console.log(`Request ${i}: ${status} (${result.current}/${result.limit})`);
  }

  console.log("\nWaiting 3 seconds...");
  await sleep(3000);

  console.log("Making another request after delay:");
  const delayedResult = await slidingWindowLimiter.check("user:456");
  console.log("Result:", {
    allowed: delayedResult.allowed,
    current: delayedResult.current,
    remaining: delayedResult.remaining,
  });

  console.log("\n");

  // ============================================================
  // Example 3: Leaky Bucket Usage
  // ============================================================
  console.log("📌 Example 3: Leaky Bucket Rate Limiter");
  console.log("─".repeat(50));

  const leakyBucketLimiter = new RateLimiter({
    redis,
    algorithm: RateLimitAlgorithm.LEAKY_BUCKET,
    maxRequests: 5,
    windowSeconds: 10, // Leak rate: 0.5 requests per second
  });

  console.log("Burst of 8 requests:");
  for (let i = 1; i <= 8; i++) {
    const result = await leakyBucketLimiter.check("user:789");
    const status = result.allowed ? "✅" : "❌";
    console.log(
      `${status} Request ${i}: Level ${result.current}/${result.limit}`
    );
    await sleep(100);
  }

  console.log("\nWaiting 2 seconds for bucket to leak...");
  await sleep(2000);

  console.log("Making request after leak:");
  const afterLeakResult = await leakyBucketLimiter.check("user:789");
  console.log("Result:", {
    allowed: afterLeakResult.allowed,
    bucketLevel: afterLeakResult.current,
    capacity: afterLeakResult.limit,
  });

  console.log("\n");

  // ============================================================
  // Example 4: Comparing Algorithms
  // ============================================================
  console.log("📌 Example 4: Algorithm Comparison");
  console.log("─".repeat(50));

  const limiters = {
    "Fixed Window": new RateLimiter({
      redis,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      maxRequests: 10,
      windowSeconds: 60,
    }),
    "Sliding Window": new RateLimiter({
      redis,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
      maxRequests: 10,
      windowSeconds: 60,
    }),
    "Leaky Bucket": new RateLimiter({
      redis,
      algorithm: RateLimitAlgorithm.LEAKY_BUCKET,
      maxRequests: 10,
      windowSeconds: 60,
    }),
  };

  console.log("Sending burst of 15 requests to each algorithm:\n");

  for (const [name, limiter] of Object.entries(limiters)) {
    let allowed = 0;
    let rejected = 0;

    for (let i = 0; i < 15; i++) {
      const result = await limiter.check(`comparison:${name}`);
      if (result.allowed) allowed++;
      else rejected++;
      await sleep(50);
    }

    console.log(
      `${name.padEnd(20)}: ✅ ${allowed} allowed, ❌ ${rejected} rejected`
    );
  }

  console.log("\n");

  // ============================================================
  // Example 5: Reset Functionality
  // ============================================================
  console.log("📌 Example 5: Manual Reset");
  console.log("─".repeat(50));

  const resetTestLimiter = new RateLimiter({
    redis,
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    maxRequests: 3,
    windowSeconds: 60,
  });

  console.log("Making 3 requests to hit the limit:");
  for (let i = 1; i <= 3; i++) {
    await resetTestLimiter.check("reset-test");
    console.log(`Request ${i}: Allowed`);
  }

  console.log("\nTrying 4th request (should fail):");
  const beforeReset = await resetTestLimiter.check("reset-test");
  console.log(`Result: ${beforeReset.allowed ? "Allowed" : "REJECTED ❌"}`);

  console.log("\n🔄 Manually resetting rate limit...");
  await resetTestLimiter.reset("reset-test");

  console.log("Trying request after reset:");
  const afterReset = await resetTestLimiter.check("reset-test");
  console.log(`Result: ${afterReset.allowed ? "Allowed ✅" : "REJECTED"}`);

  console.log("\n");

  // ============================================================
  // Example 6: Performance Comparison
  // ============================================================
  console.log("📌 Example 6: Performance Comparison");
  console.log("─".repeat(50));

  const iterations = 100;

  for (const [name, limiter] of Object.entries(limiters)) {
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await limiter.check(`perf:${name}:${i}`);
    }

    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;

    console.log(`${name.padEnd(20)}: ${avgTime.toFixed(2)}ms avg per request`);
  }

  console.log("\n✅ All examples completed!\n");

  // Cleanup
  redis.disconnect();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run examples
runExamples().catch((error) => {
  console.error("Error running examples:", error);
  process.exit(1);
});
