# 🎉 You're All Set Up!

Redis is installed and running. Here's what you can do now:

---

## ✅ What's Installed

- **Redis 8.4.0** - Running via Homebrew
- **Rate Limiter Library** - Complete with 3 algorithms
- **Dependencies** - All installed via pnpm

---

## 🚀 Quick Start (3 Commands)

### 1. Start the Demo Server

```bash
cd /Users/saketkhare/Desktop/createxp/rate-limiter
pnpm example
```

The server will start on `http://localhost:3000`

### 2. Test an Endpoint

Open a new terminal and run:

```bash
curl http://localhost:3000/api/fixed-window
```

You should see:
```json
{
  "message": "Success! Request passed Fixed Window rate limiter",
  "algorithm": "Fixed Window",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 3. Hit the Rate Limit

Run this to make 20 requests (limit is 10):

```bash
for i in {1..20}; do 
  curl -s http://localhost:3000/api/fixed-window | jq
  echo "---"
done
```

After 10 requests, you'll see:
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

---

## 🎯 Available Endpoints

Visit `http://localhost:3000` in your browser to see all endpoints:

- `/api/fixed-window` - 10 requests per 60 seconds
- `/api/sliding-window` - 15 requests per 60 seconds  
- `/api/leaky-bucket` - 20 requests per 60 seconds
- `/api/user-limited` - 100 requests per hour (user-based)
- `/api/custom-handler` - 5 requests per 30 seconds
- `/api/sensitive-action` - 3 requests per 5 minutes (POST)
- `/api/tiered` - Multiple limiters (100/min AND 10/sec)

---

## 🧪 Run Test Examples

See all algorithms in action:

```bash
pnpm test
```

This will show:
- ✅ Basic usage of each algorithm
- ✅ Comparison between algorithms
- ✅ Manual reset functionality
- ✅ Performance metrics

---

## 📚 Learn More

- **README.md** - Complete documentation
- **ALGORITHMS.md** - Deep dive into how each algorithm works
- **DOCKER_SETUP.md** - Docker setup guide (if you want to try Docker later)
- **examples/express-server.ts** - Full server code with 7 examples
- **examples/usage-examples.ts** - Comprehensive test suite

---

## 💡 Useful Redis Commands

```bash
# Check if Redis is running
redis-cli ping
# Response: PONG

# Connect to Redis CLI
redis-cli

# Inside Redis CLI:
KEYS *                    # See all keys
GET rate_limit:fixed:*    # Get specific key
FLUSHALL                  # Clear all data (careful!)
INFO                      # Redis server info
exit                      # Exit CLI

# Manage Redis service
brew services stop redis     # Stop Redis
brew services start redis    # Start Redis
brew services restart redis  # Restart Redis
```

---

## 🐛 Troubleshooting

### Redis not responding?

```bash
# Restart Redis
brew services restart redis

# Check status
brew services list | grep redis

# View Redis logs
tail -f /opt/homebrew/var/log/redis.log
```

### Port 3000 already in use?

```bash
# Use different port
PORT=3001 pnpm example
```

### Clear all rate limit data?

```bash
redis-cli FLUSHALL
```

---

## 🎓 Understanding Rate Limiting

### What You Built

A production-ready rate limiting system with:
- ✅ 3 different algorithms (Fixed Window, Sliding Window, Leaky Bucket)
- ✅ Express middleware
- ✅ Redis for distributed state
- ✅ Proper HTTP headers (X-RateLimit-*)
- ✅ 429 error responses
- ✅ TypeScript with full types

### Why This Matters

Rate limiting is used by:
- **Stripe** - Prevents API abuse
- **GitHub** - 5,000 requests/hour for authenticated users
- **Twitter** - Different limits per endpoint
- **AWS** - Throttling on all services

You now understand how these systems work internally!

---

## 🚀 Next Steps

1. **Experiment** - Try different limits, algorithms, and endpoints
2. **Read the code** - Check out `src/algorithms/` to see implementations
3. **Integrate** - Use this in your own projects
4. **Learn** - Read ALGORITHMS.md for deep understanding

---

## 📝 Quick Reference

| Algorithm | When to Use | Pros | Cons |
|-----------|-------------|------|------|
| **Fixed Window** | General APIs | Fast, simple | Burst at boundaries |
| **Sliding Window** | Strict limits | Most accurate | More memory |
| **Leaky Bucket** | Smooth traffic | Constant rate | Complex |

---

## ✨ You're Ready!

Run this now:

```bash
pnpm example
```

Then visit: http://localhost:3000

Have fun exploring rate limiting! 🎉

