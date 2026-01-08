import express from "express";
import Redis from "ioredis";
import { createRateLimiter, RateLimitAlgorithm } from "../src";

const app = express();
app.use(express.json());

// Initialize Redis client
const redis = new Redis({
  host: "localhost",
  port: 6379,
  // Retry strategy for reconnection
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

// ==================================================================
// EXAMPLE 1: Fixed Window Rate Limiter
// ==================================================================
// Allows 10 requests per 60 seconds (1 minute)
// Simple and efficient, but can allow bursts at window boundaries
const fixedWindowLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 10,
  windowSeconds: 60,
  keyPrefix: "api:fixed:",
});

app.get("/api/fixed-window", fixedWindowLimiter.middleware(), (req, res) => {
  res.json({
    message: "Success! Request passed Fixed Window rate limiter",
    algorithm: "Fixed Window",
    timestamp: new Date().toISOString(),
  });
});

// ==================================================================
// EXAMPLE 2: Sliding Window Rate Limiter
// ==================================================================
// Allows 15 requests per 60 seconds (1 minute)
// Most accurate, prevents burst issues
const slidingWindowLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 15,
  windowSeconds: 60,
  keyPrefix: "api:sliding:",
});

app.get(
  "/api/sliding-window",
  slidingWindowLimiter.middleware(),
  (req, res) => {
    res.json({
      message: "Success! Request passed Sliding Window rate limiter",
      algorithm: "Sliding Window",
      timestamp: new Date().toISOString(),
    });
  }
);

// ==================================================================
// EXAMPLE 3: Leaky Bucket Rate Limiter
// ==================================================================
// Allows 20 requests per 60 seconds (1 minute)
// Smooths out traffic spikes, constant drain rate
const leakyBucketLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.LEAKY_BUCKET,
  maxRequests: 20,
  windowSeconds: 60,
  keyPrefix: "api:leaky:",
});

app.get("/api/leaky-bucket", leakyBucketLimiter.middleware(), (req, res) => {
  res.json({
    message: "Success! Request passed Leaky Bucket rate limiter",
    algorithm: "Leaky Bucket",
    timestamp: new Date().toISOString(),
  });
});

// ==================================================================
// EXAMPLE 4: Custom Identifier (User-based rate limiting)
// ==================================================================
// Rate limit per user ID instead of IP address
const userRateLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 100,
  windowSeconds: 3600, // 1 hour
  keyPrefix: "api:user:",
  // Extract user ID from request
  identifierFn: (req) => {
    const userId = req.headers["x-user-id"] || req.query.userId || "anonymous";
    return `user:${userId}`;
  },
});

app.get("/api/user-limited", userRateLimiter.middleware(), (req, res) => {
  res.json({
    message: "Success! Request passed user-based rate limiter",
    algorithm: "Sliding Window (User-based)",
    timestamp: new Date().toISOString(),
  });
});

// ==================================================================
// EXAMPLE 5: Custom handler on limit reached
// ==================================================================
const customHandlerLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 5,
  windowSeconds: 30,
  keyPrefix: "api:custom:",
});

app.get(
  "/api/custom-handler",
  customHandlerLimiter.middleware({
    onLimitReached: (req, res, result) => {
      console.log(`⚠️  Rate limit exceeded for ${req.ip}`, result);

      // You could log to monitoring service, send alerts, etc.
      // The middleware will still return 429, but you can do additional actions here
    },
  }),
  (req, res) => {
    res.json({
      message: "Success with custom handler",
      timestamp: new Date().toISOString(),
    });
  }
);

// ==================================================================
// EXAMPLE 6: Strict rate limiting for sensitive endpoints
// ==================================================================
const strictLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 3,
  windowSeconds: 300, // 5 minutes - very strict!
  keyPrefix: "api:strict:",
});

app.post("/api/sensitive-action", strictLimiter.middleware(), (req, res) => {
  res.json({
    message: "Sensitive action completed",
    note: "This endpoint is heavily rate limited (3 requests per 5 minutes)",
  });
});

// ==================================================================
// EXAMPLE 7: Multiple rate limiters (tiered limiting)
// ==================================================================
const tierOneLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: "api:tier1:",
});

const tierTwoLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 10,
  windowSeconds: 1,
  keyPrefix: "api:tier2:",
});

app.get(
  "/api/tiered",
  tierOneLimiter.middleware(), // First check: 100 per minute
  tierTwoLimiter.middleware(), // Second check: 10 per second
  (req, res) => {
    res.json({
      message: "Success! Passed both rate limiters",
      limits: {
        perMinute: 100,
        perSecond: 10,
      },
    });
  }
);

// ==================================================================
// Test endpoint (no rate limiting)
// ==================================================================
app.get("/", (req, res) => {
  res.json({
    message: "Rate Limiter Demo Server",
    endpoints: {
      "/api/fixed-window": "10 requests per 60 seconds (Fixed Window)",
      "/api/sliding-window": "15 requests per 60 seconds (Sliding Window)",
      "/api/leaky-bucket": "20 requests per 60 seconds (Leaky Bucket)",
      "/api/user-limited": "100 requests per hour (User-based)",
      "/api/custom-handler": "5 requests per 30 seconds (with custom handler)",
      "/api/sensitive-action": "3 requests per 5 minutes (POST, very strict)",
      "/api/tiered": "100/min AND 10/sec (multiple limiters)",
      "/status": "Check rate limit status",
    },
    instructions: {
      testFixedWindow: "curl http://localhost:3000/api/fixed-window",
      testSlidingWindow: "curl http://localhost:3000/api/sliding-window",
      testLeakyBucket: "curl http://localhost:3000/api/leaky-bucket",
      testUserBased:
        'curl -H "X-User-Id: user123" http://localhost:3000/api/user-limited',
      stressTest:
        'for i in {1..20}; do curl http://localhost:3000/api/fixed-window; echo ""; done',
    },
  });
});

// Status endpoint to check current rate limit
app.get("/status", async (req, res) => {
  try {
    const result = await fixedWindowLimiter.rateLimiter.checkRequest(req);
    res.json({
      message: "Current rate limit status",
      status: result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `\n🚀 Rate Limiter Demo Server running on http://localhost:${PORT}`
  );
  console.log(`\n📊 Test the endpoints:`);
  console.log(`   curl http://localhost:${PORT}/api/fixed-window`);
  console.log(`   curl http://localhost:${PORT}/api/sliding-window`);
  console.log(`   curl http://localhost:${PORT}/api/leaky-bucket`);
  console.log(`\n💥 Stress test (will hit rate limit):`);
  console.log(
    `   for i in {1..20}; do curl http://localhost:${PORT}/api/fixed-window; echo ""; done`
  );
  console.log("");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\n👋 Shutting down gracefully...");
  redis.disconnect();
  process.exit(0);
});
