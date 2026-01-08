# Quick Start Guide

Get your rate limiter running in 5 minutes!

## Step 1: Start Redis

```bash
# Using Docker (recommended)
docker run -d -p 6379:6379 redis:alpine

# Or if you have Redis installed locally
redis-server
```

## Step 2: Install Dependencies

```bash
cd rate-limiter
pnpm install
```

## Step 3: Run the Demo Server

```bash
pnpm example
```

The server will start on `http://localhost:3000`

## Step 4: Test the Endpoints

### Test Fixed Window Algorithm

```bash
# Make a single request
curl http://localhost:3000/api/fixed-window

# Stress test (will hit the limit)
for i in {1..15}; do 
  curl -s http://localhost:3000/api/fixed-window | jq
  echo "---"
done
```

### Test Sliding Window Algorithm

```bash
for i in {1..20}; do 
  curl -s http://localhost:3000/api/sliding-window | jq
  echo "---"
done
```

### Test Leaky Bucket Algorithm

```bash
for i in {1..25}; do 
  curl -s http://localhost:3000/api/leaky-bucket | jq
  sleep 0.2  # Small delay to see leak effect
done
```

### Test User-Based Rate Limiting

```bash
# As user123 (100 requests per hour)
curl -H "X-User-Id: user123" http://localhost:3000/api/user-limited

# As different user
curl -H "X-User-Id: user456" http://localhost:3000/api/user-limited
```

## Step 5: Run Basic Examples

```bash
pnpm test
```

This will run comprehensive examples showing:
- Basic usage of each algorithm
- Comparison between algorithms
- Manual reset functionality
- Performance metrics

## Understanding the Output

### Successful Request (200 OK)

```json
{
  "message": "Success! Request passed Fixed Window rate limiter",
  "algorithm": "Fixed Window",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 5
X-RateLimit-Reset: 1705315860
```

### Rate Limited Request (429 Too Many Requests)

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "limit": 10,
  "current": 11,
  "resetAt": 1705315860,
  "retryAfter": 45
}
```

**Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705315860
Retry-After: 45
```

## Next Steps

1. **Read the full README.md** for detailed algorithm explanations
2. **Check out examples/express-server.ts** for more advanced use cases
3. **Integrate into your project** using the patterns shown

## Quick Integration Example

```typescript
import express from 'express';
import Redis from 'ioredis';
import { createRateLimiter, RateLimitAlgorithm } from './src';

const app = express();
const redis = new Redis();

// Create rate limiter
const { middleware } = createRateLimiter({
  redis,
  algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  maxRequests: 100,
  windowSeconds: 60,
});

// Apply globally
app.use(middleware());

// Or per-route
app.get('/api/users', middleware(), (req, res) => {
  res.json({ users: [] });
});

app.listen(3000);
```

## Troubleshooting

### Redis Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**: Make sure Redis is running
```bash
docker run -d -p 6379:6379 redis:alpine
```

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution**: Change the port
```bash
PORT=3001 pnpm example
```

### TypeScript Errors

```bash
pnpm build
```

## Need Help?

- Check the [README.md](README.md) for full documentation
- Review [examples/](examples/) directory for more examples
- Look at algorithm implementations in [src/algorithms/](src/algorithms/)

Happy rate limiting! 🚀

