# Redis Rate Limiter

A comprehensive, production-ready rate limiting library for Node.js using Redis. Implements three popular rate limiting algorithms with detailed explanations and examples.

## 🎯 What is Rate Limiting?

Rate limiting is a technique to control the number of requests a client can make to your API within a specific time window. It's essential for:

- **Preventing abuse**: Stop malicious actors from overwhelming your system
- **Ensuring fair usage**: Prevent one user from consuming all resources
- **Protecting infrastructure**: Avoid crashes from traffic spikes
- **Cost control**: Limit resource consumption in pay-per-use systems
- **SLA enforcement**: Implement tiered service levels

When a client exceeds the limit, the server responds with `429 Too Many Requests` status code.

## 📚 Rate Limiting Algorithms

This library implements three widely-used algorithms, each with different characteristics:

### 1. Fixed Window 🪟

**How it works:**
- Time is divided into fixed windows (e.g., each minute starts at :00)
- Each window has a counter starting at 0
- Every request increments the counter
- When limit is reached, reject requests until window resets
- At window boundary, counter resets to 0

**Example:** 10 requests per minute
```
Window 1 (00:00-00:59): ✅✅✅✅✅✅✅✅✅✅ ❌❌❌
Window 2 (01:00-01:59): ✅✅✅✅✅✅✅✅✅✅ ❌❌
```

**Pros:**
- ✅ Simple to implement and understand
- ✅ Memory efficient (one counter per identifier)
- ✅ Fast performance
- ✅ Easy to reason about

**Cons:**
- ❌ **Burst problem**: Can allow 2x limit around window boundaries
  - Example: 10 requests at 00:59, then 10 more at 01:00 = 20 requests in 1 second!
- ❌ Not accurate for strict rate limiting

**Use cases:**
- General API rate limiting
- When simplicity is priority
- When occasional bursts are acceptable

**Redis Implementation:**
```
Key:   rate_limit:fixed:{identifier}
Value: Request count (integer)
TTL:   Window duration (auto-expires)
```

---

### 2. Sliding Window Log 🎢

**How it works:**
- Stores timestamp of every request
- For each new request, removes timestamps older than the window
- Counts requests in the sliding window
- Window moves continuously with each request

**Example:** 10 requests per minute
```
At 10:00:30 → Check requests from 09:59:30 to 10:00:30
At 10:00:45 → Check requests from 09:59:45 to 10:00:45
Window continuously slides!
```

**Pros:**
- ✅ Most accurate rate limiting
- ✅ No burst problem
- ✅ True sliding window behavior
- ✅ Handles edge cases perfectly

**Cons:**
- ❌ Higher memory usage (stores each timestamp)
- ❌ Slightly slower than fixed window
- ❌ Requires cleanup of old entries

**Use cases:**
- Strict rate limiting requirements
- Payment/billing APIs
- Critical security endpoints
- When accuracy is paramount

**Redis Implementation:**
```
Data Structure: Sorted Set (ZSET)
Key:   rate_limit:sliding:{identifier}
Score: Unix timestamp (milliseconds)
Value: Unique request ID
Operations: ZADD, ZREMRANGEBYSCORE, ZCARD
```

---

### 3. Leaky Bucket 🪣💧

**How it works:**
- Imagine a bucket with a hole at the bottom
- Requests fill the bucket (water going in)
- Bucket "leaks" at constant rate (water draining)
- If bucket overflows, request is rejected
- Leak rate = maxRequests / windowSeconds

**Example:** 100 requests per minute
```
Bucket capacity: 100 requests
Leak rate: 100/60 = 1.67 requests/second

Timeline:
t=0s:  50 requests arrive → Bucket level: 50
t=10s: Bucket leaked ~17 → Level: 33
t=10s: 20 new requests → Level: 53
t=20s: Bucket leaked ~17 more → Level: 36
```

**Pros:**
- ✅ Smooths out traffic spikes
- ✅ Provides consistent request rate
- ✅ Allows short bursts while maintaining average
- ✅ Great for protecting downstream services

**Cons:**
- ❌ More complex to implement
- ❌ Requires precise timestamp tracking
- ❌ Slightly higher computational cost

**Use cases:**
- Smoothing bursty traffic
- Protecting rate-sensitive backends
- Video streaming / data processing
- When you want controlled flow rate

**Redis Implementation:**
```
Key:   rate_limit:leaky:{identifier}
Value: JSON with { level: number, lastLeakTime: number }
Atomic operations via Lua script
```

---

## 📊 Algorithm Comparison

| Feature | Fixed Window | Sliding Window | Leaky Bucket |
|---------|--------------|----------------|--------------|
| **Accuracy** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Memory** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Burst Protection** | ❌ | ✅ | ✅ |
| **Traffic Smoothing** | ❌ | ❌ | ✅ |
| **Complexity** | Simple | Medium | Complex |

**Quick Decision Guide:**
- 🟢 **Fixed Window**: Default choice for most APIs
- 🔵 **Sliding Window**: When accuracy is critical
- 🟣 **Leaky Bucket**: When you need smooth traffic flow

---

## 🚀 Installation

```bash
# Using npm
npm install redis-rate-limiter

# Using pnpm
pnpm install redis-rate-limiter

# Using yarn
yarn add redis-rate-limiter
```

**Prerequisites:**
- Node.js 16+
- Redis server running (local or remote)

---

## 💻 Quick Start

### Basic Usage

```typescript
import Redis from 'ioredis';
import { RateLimiter, RateLimitAlgorithm } from 'redis-rate-limiter';

// Initialize Redis
const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// Create rate limiter
const limiter = new RateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 60, // 100 requests per minute
});

// Check rate limit
const result = await limiter.check('user-123');

if (result.allowed) {
  console.log('Request allowed!');
  console.log(`Remaining: ${result.remaining}/${result.limit}`);
} else {
  console.log(`Rate limit exceeded! Retry after ${result.retryAfter}s`);
}
```

### Express Middleware

```typescript
import express from 'express';
import { createRateLimiter, RateLimitAlgorithm } from 'redis-rate-limiter';

const app = express();

// Create rate limiter with middleware
const { middleware } = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
});

// Apply to all routes
app.use(middleware());

// Or apply to specific routes
app.get('/api/users', middleware(), (req, res) => {
  res.json({ users: [] });
});

app.listen(3000);
```

---

## 📖 API Reference

### `RateLimiter` Class

#### Constructor

```typescript
new RateLimiter(config: RateLimiterConfig)
```

**Config Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `redis` | `Redis` | Yes | ioredis client instance |
| `algorithm` | `RateLimitAlgorithm` | Yes | Algorithm to use |
| `maxRequests` | `number` | Yes | Max requests allowed |
| `windowSeconds` | `number` | Yes | Time window in seconds |
| `keyPrefix` | `string` | No | Redis key prefix (default: `'rate_limit:'`) |
| `identifierFn` | `function` | No | Custom identifier function |

#### Methods

**`check(identifier: string): Promise<RateLimitResult>`**

Check rate limit for a specific identifier.

```typescript
const result = await limiter.check('user-123');
console.log(result.allowed); // true or false
```

**`checkRequest(req: any): Promise<RateLimitResult>`**

Check rate limit using Express request object.

```typescript
const result = await limiter.checkRequest(req);
```

**`reset(identifier: string): Promise<void>`**

Manually reset rate limit for an identifier.

```typescript
await limiter.reset('user-123');
```

**`middleware(options?): ExpressMiddleware`**

Create Express middleware.

```typescript
app.use(limiter.middleware({
  onLimitReached: (req, res, result) => {
    console.log('Rate limit hit!', result);
  }
}));
```

---

### `RateLimitResult` Object

```typescript
{
  allowed: boolean;        // Whether request is allowed
  current: number;         // Current request count
  limit: number;           // Maximum requests allowed
  remaining: number;       // Requests remaining
  resetAt: number;         // Unix timestamp when limit resets
  retryAfter: number;      // Seconds until retry (if rejected)
}
```

---

## 🎨 Usage Examples

### Example 1: IP-Based Rate Limiting (Default)

```typescript
const limiter = new RateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
});

// Automatically uses IP address from request
app.use(limiter.middleware());
```

### Example 2: User-Based Rate Limiting

```typescript
const limiter = new RateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 1000,
  windowSeconds: 3600, // 1 hour
  identifierFn: (req) => {
    // Extract user ID from JWT, session, or header
    return req.user?.id || req.headers['x-user-id'] || 'anonymous';
  },
});
```

### Example 3: API Key Rate Limiting

```typescript
const limiter = new RateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.LEAKY_BUCKET,
  maxRequests: 10000,
  windowSeconds: 86400, // 24 hours
  identifierFn: (req) => {
    const apiKey = req.headers['x-api-key'];
    return `api_key:${apiKey}`;
  },
});
```

### Example 4: Tiered Rate Limiting

```typescript
// Free tier: 100 requests/hour
const freeLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 3600,
  identifierFn: (req) => req.user?.tier === 'free' ? req.user.id : null,
});

// Premium tier: 10,000 requests/hour
const premiumLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 10000,
  windowSeconds: 3600,
  identifierFn: (req) => req.user?.tier === 'premium' ? req.user.id : null,
});

// Apply based on user tier
app.use((req, res, next) => {
  const limiter = req.user?.tier === 'premium' ? premiumLimiter : freeLimiter;
  limiter.middleware()(req, res, next);
});
```

### Example 5: Multiple Rate Limits (AND logic)

```typescript
// Per-second limit
const secondLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 10,
  windowSeconds: 1,
  keyPrefix: 'per_second:',
});

// Per-minute limit
const minuteLimiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
  keyPrefix: 'per_minute:',
});

// Both limits must pass
app.get('/api/data',
  secondLimiter.middleware(),
  minuteLimiter.middleware(),
  (req, res) => {
    res.json({ data: 'success' });
  }
);
```

### Example 6: Custom Error Response

```typescript
const limiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
});

app.use(limiter.middleware({
  onLimitReached: (req, res, result) => {
    // Custom logging
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limit: result.limit,
    });
    
    // Note: Middleware still sends 429, this is just for side effects
  }
}));
```

---

## 🧪 Testing the System

### Setup Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally (macOS)
brew install redis
brew services start redis
```

### Install Dependencies

```bash
cd rate-limiter
pnpm install
```

### Run Examples

```bash
# Run basic usage examples
pnpm test

# Run Express server
pnpm example

# Then test with curl:
curl http://localhost:3000/api/fixed-window
curl http://localhost:3000/api/sliding-window
curl http://localhost:3000/api/leaky-bucket

# Stress test (will hit rate limit)
for i in {1..20}; do 
  curl http://localhost:3000/api/fixed-window
  echo ""
done
```

### Build Library

```bash
pnpm build
```

---

## 🏗️ System Design Concepts

### Why Redis?

Redis is perfect for rate limiting because:

1. **In-memory storage**: Extremely fast reads/writes
2. **Atomic operations**: INCR, ZADD prevent race conditions
3. **TTL support**: Auto-expiring keys for window management
4. **Lua scripting**: Complex atomic operations
5. **Distributed**: Works across multiple servers
6. **Persistence options**: Can survive restarts

### Architecture

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ HTTP Request
       ↓
┌──────────────────────────────┐
│   Express Server             │
│  ┌────────────────────────┐  │
│  │ Rate Limiter Middleware│  │
│  └───────┬────────────────┘  │
│          │                   │
│          ↓                   │
│  ┌────────────────────────┐  │
│  │  Algorithm             │  │
│  │  - Fixed Window        │  │
│  │  - Sliding Window      │  │
│  │  - Leaky Bucket        │  │
│  └───────┬────────────────┘  │
└──────────┼───────────────────┘
           │
           ↓
    ┌─────────────┐
    │    Redis    │
    │   Database  │
    └─────────────┘
```

### Scalability Considerations

**Horizontal Scaling:**
- ✅ Works perfectly with multiple server instances
- ✅ Redis acts as shared state
- ✅ No coordination needed between servers

**High Availability:**
- Use Redis Sentinel or Cluster for redundancy
- Implement retry logic for Redis failures
- Consider "fail open" strategy (allow requests if Redis is down)

**Performance:**
- Each check requires 1-3 Redis operations
- Typical latency: 1-5ms
- Can handle 10,000+ requests/second per Redis instance

---

## 🛡️ Production Best Practices

### 1. Error Handling

```typescript
try {
  const result = await limiter.check(identifier);
  // ... handle result
} catch (error) {
  // If Redis fails, decide: fail open or fail closed?
  // Fail open: allow request (better availability)
  // Fail closed: reject request (better security)
  console.error('Rate limiter error:', error);
  
  // Fail open example:
  return { allowed: true, ... };
}
```

### 2. Monitoring

Track these metrics:
- Rate limit hit rate
- Redis latency
- Redis connection errors
- Requests blocked per endpoint

### 3. Response Headers

The middleware automatically sets standard headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1640000000
Retry-After: 30  (only on 429 responses)
```

### 4. Gradual Rollout

```typescript
const limiter = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.FIXED_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
});

app.use((req, res, next) => {
  // Only enforce for 10% of traffic initially
  if (Math.random() < 0.1) {
    return limiter.middleware()(req, res, next);
  }
  next();
});
```

---

## 🤔 Common Questions

**Q: Which algorithm should I use?**
A: Start with Fixed Window for simplicity. Use Sliding Window if you need strict accuracy. Use Leaky Bucket if you need to smooth traffic.

**Q: What happens if Redis goes down?**
A: The middleware catches errors and allows requests by default ("fail open"). You can customize this behavior.

**Q: Can I use this with multiple servers?**
A: Yes! Redis acts as shared state, so it works perfectly across multiple server instances.

**Q: How do I rate limit by both IP and user?**
A: Create two separate limiters with different `identifierFn` and apply both as middleware.

**Q: Can I dynamically change limits?**
A: Yes, create new RateLimiter instances with different configs. Consider caching instances per user tier.

---

## 📝 License

MIT License - feel free to use in your projects!

---

## 🙏 Credits

Built as a learning project for understanding rate limiting and system design concepts.

**Further Reading:**
- [CloudFlare: Rate Limiting](https://www.cloudflare.com/learning/bots/what-is-rate-limiting/)
- [Stripe: Rate Limiting](https://stripe.com/docs/rate-limits)
- [Redis Commands](https://redis.io/commands)
- [System Design Primer](https://github.com/donnemartin/system-design-primer)

# rate-limiter
