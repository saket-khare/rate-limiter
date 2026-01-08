# Rate Limiting Algorithms - Deep Dive

This document provides a detailed explanation of each algorithm with visual examples and use cases.

---

## 1. Fixed Window Algorithm

### Visual Representation

```
Timeline (60 seconds):
┌─────────────────────────────────────────────────────────────┐
│                      Window 1 (60s)                         │
└─────────────────────────────────────────────────────────────┘
  ↓                                                           ↓
00:00                                                      01:00
  ✅✅✅✅✅✅✅✅✅✅  ← 10 requests (limit reached)
                    ❌❌❌  ← Rejected (over limit)

┌─────────────────────────────────────────────────────────────┐
│                      Window 2 (60s)                         │
└─────────────────────────────────────────────────────────────┘
  ↓                                                           ↓
01:00                                                      02:00
  ✅✅✅✅✅✅✅✅✅✅  ← Counter resets! New window
```

### The Burst Problem

```
Window Boundary Issue:
┌──────────────┬──────────────┐
│   Window 1   │   Window 2   │
└──────────────┴──────────────┘
              ↑ Boundary at 01:00
              
00:59:50  ✅✅✅✅✅✅✅✅✅✅  (10 requests in last 10 seconds of Window 1)
01:00:05  ✅✅✅✅✅✅✅✅✅✅  (10 requests in first 5 seconds of Window 2)

Result: 20 requests in 15 seconds! 💥
```

### Redis Operations

```bash
# Request 1
> INCR rate_limit:fixed:user123
(integer) 1
> EXPIRE rate_limit:fixed:user123 60
OK

# Request 2
> INCR rate_limit:fixed:user123
(integer) 2

# Request 11 (rejected)
> INCR rate_limit:fixed:user123
(integer) 11
# Application checks: 11 > 10, return 429

# After 60 seconds
> GET rate_limit:fixed:user123
(nil)  # Key expired, counter reset
```

### Time Complexity
- **Check**: O(1) - Single INCR operation
- **Space**: O(1) - Single integer per identifier
- **Memory**: ~100 bytes per active user

### Best For
- ✅ General-purpose APIs
- ✅ High-traffic applications
- ✅ When simplicity matters
- ❌ Not for strict compliance requirements

---

## 2. Sliding Window Log Algorithm

### Visual Representation

```
Sliding 60-second Window:

At 10:00:30 - Check last 60 seconds:
┌───────────────────────────────────────────────────────┐
│     Window (60s)                                      │
└───────────────────────────────────────────────────────┘
   ↓                                                   ↓
09:59:30                                          10:00:30
   t1  t2  t3  t4  t5  t6  t7  t8  t9  t10
   ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  (10 requests)

At 10:00:45 - Window slides forward:
      ┌───────────────────────────────────────────────────────┐
      │     Window (60s)                                      │
      └───────────────────────────────────────────────────────┘
         ↓                                                   ↓
   09:59:45                                          10:00:45
         t2  t3  t4  t5  t6  t7  t8  t9  t10  t11
         ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅   ✅  (10 requests)
   ❌ t1 removed (older than 60s)
```

### No Burst Problem!

```
Continuous Sliding Window:
┌──────────────────────────────────────────────────┐
│            Any 60-second period                  │
└──────────────────────────────────────────────────┘

00:59:50  ✅✅✅✅✅✅✅✅✅✅  (10 requests)
01:00:05  ❌❌❌❌❌❌❌❌❌❌  (ALL REJECTED!)

Why? At 01:00:05, looking back 60 seconds includes 
requests from 00:00:05, which includes the 10 from 00:59:50.
Window slides continuously!
```

### Redis Operations (Sorted Set)

```bash
# Request at timestamp 1705315830500
> ZADD rate_limit:sliding:user123 1705315830500 "1705315830500:abc123"
(integer) 1

# Remove old entries (older than 60 seconds)
> ZREMRANGEBYSCORE rate_limit:sliding:user123 0 1705315770500
(integer) 3  # Removed 3 old entries

# Count current entries
> ZCARD rate_limit:sliding:user123
(integer) 7  # 7 requests in sliding window

# View all timestamps
> ZRANGE rate_limit:sliding:user123 0 -1 WITHSCORES
1) "1705315780500:xyz789"
2) "1705315780500"
3) "1705315790500:def456"
4) "1705315790500"
...
```

### Time Complexity
- **Check**: O(log N) - ZADD + ZREMRANGEBYSCORE
- **Space**: O(N) - Stores all timestamps in window
- **Memory**: ~50 bytes × number of requests in window

### Best For
- ✅ Strict rate limiting (e.g., payment APIs)
- ✅ Compliance requirements
- ✅ When accuracy > performance
- ❌ Not for extremely high-traffic (memory intensive)

---

## 3. Leaky Bucket Algorithm

### Visual Representation

```
Bucket (capacity: 100 requests):

     Requests coming in →  ↓↓↓
                          ┌────┐
                          │ 80 │ ← Current level: 80
                          │▓▓▓▓│
    Capacity: 100 →       │▓▓▓▓│
                          │▓▓▓▓│
                          │▓▓▓▓│
                          │▓▓▓▓│
                          └─┬──┘
                            ↓
                    Leaks at constant rate
                    (e.g., 1.67 req/sec)
```

### How Leaking Works

```
Example: 100 requests per 60 seconds = 1.67 req/sec leak rate

t=0s:   50 requests arrive
        Bucket: [██████████████████████████████████████████████████] 50
        
t=10s:  Leaked: 10s × 1.67 = 16.7 requests
        Bucket: [█████████████████████████████████                 ] 33.3
        
t=10s:  20 new requests arrive
        Bucket: [█████████████████████████████████████████████████ ] 53.3
        
t=20s:  Leaked: 10s × 1.67 = 16.7 requests  
        Bucket: [████████████████████████████████████              ] 36.6
```

### Smooth Traffic Example

```
Burst followed by steady state:

Requests:  50                10  0   0   0   5
Time:      0s  10s  20s  30s  40s 50s 60s 70s 80s

Bucket Level:
100│                                    
 80│ █                                  
 60│ █                                  
 40│ █    █    █    █   █   █
 20│ █    █    █    █   █   █   █   █   █
  0└────────────────────────────────────→
    0   10   20   30  40  50  60  70  80s

Notice: Level smoothly decreases even with burst at start!
```

### Redis Operations (JSON with Lua)

```lua
-- Lua script executed atomically
local bucket_data = redis.call('GET', key)
local level = 0
local last_leak_time = now

if bucket_data then
  local data = cjson.decode(bucket_data)
  level = tonumber(data.level)
  last_leak_time = tonumber(data.lastLeakTime)
end

-- Calculate leaked amount
local time_passed = (now - last_leak_time) / 1000
local leaked = time_passed * leak_rate
level = math.max(0, level - leaked)

-- Try to add new request
if level < max_requests then
  level = level + 1
  allowed = true
end

-- Save state
redis.call('SET', key, cjson.encode({
  level = level,
  lastLeakTime = now
}))
```

### Time Complexity
- **Check**: O(1) - Single Lua script execution
- **Space**: O(1) - Single JSON object per identifier
- **Memory**: ~200 bytes per active user

### Best For
- ✅ Protecting rate-sensitive backends
- ✅ Video streaming / data processing
- ✅ Smoothing bursty traffic
- ❌ Not when you need strict "N per minute" enforcement

---

## Algorithm Comparison Matrix

### Performance Characteristics

| Metric | Fixed Window | Sliding Window | Leaky Bucket |
|--------|--------------|----------------|--------------|
| **Redis Calls per Check** | 2-3 | 3-4 (with Lua) | 1 (Lua) |
| **Memory per User** | 100 bytes | 50B × requests | 200 bytes |
| **Latency** | ~1ms | ~2ms | ~1.5ms |
| **Throughput** | 50K req/s | 30K req/s | 40K req/s |

### Use Case Decision Tree

```
Need rate limiting?
    │
    ├─ Need strict accuracy? → Sliding Window
    │
    ├─ Need traffic smoothing? → Leaky Bucket
    │
    └─ General purpose? → Fixed Window
```

### Burst Behavior Comparison

```
Scenario: 10 requests allowed per minute, receive 20 requests in 5 seconds

Fixed Window:
  First 10: ✅✅✅✅✅✅✅✅✅✅
  Next 10:  ❌❌❌❌❌❌❌❌❌❌
  Result: Hard cutoff at 10, remaining 55s unusable

Sliding Window:
  First 10: ✅✅✅✅✅✅✅✅✅✅
  Next 10:  ❌❌❌❌❌❌❌❌❌❌
  Wait 60s:  All timestamps expire, can make 10 more
  Result: Strict 10 per any 60-second period

Leaky Bucket:
  First 10: ✅✅✅✅✅✅✅✅✅✅
  Next 10:  ❌❌❌❌❌❌❌❌❌❌
  After 30s: ✅✅✅✅✅ (5 leaked, space available)
  Result: Smooth recovery as bucket leaks
```

---

## Edge Cases and Gotchas

### Clock Synchronization
- **Issue**: Distributed systems might have clock skew
- **Solution**: Use Redis TIME command for consistency
- **Impact**: Sliding Window and Leaky Bucket most affected

### Race Conditions
- **Issue**: Multiple requests at exact same time
- **Solution**: Atomic operations (INCR, Lua scripts)
- **Impact**: Fixed Window most susceptible without Lua

### Memory Cleanup
- **Fixed Window**: Auto-expires with TTL ✅
- **Sliding Window**: Needs ZREMRANGEBYSCORE ⚠️
- **Leaky Bucket**: Auto-expires with TTL ✅

### Time Precision
- **Fixed Window**: Second precision (OK)
- **Sliding Window**: Millisecond precision (critical!)
- **Leaky Bucket**: Millisecond precision (critical!)

---

## Real-World Examples

### Example 1: E-commerce API

```
Requirement: 1000 requests per hour, allow checkout bursts

Best Choice: Leaky Bucket
Reason: Allows bursts (cart operations) while maintaining
        average rate, protects payment gateway
```

### Example 2: Public REST API

```
Requirement: 100 requests per minute, simple implementation

Best Choice: Fixed Window
Reason: Easy to understand for users, good enough accuracy,
        high performance
```

### Example 3: Banking API

```
Requirement: Strict 10 transactions per minute, regulatory

Best Choice: Sliding Window
Reason: Absolutely no bursts allowed, audit trail with
        exact timestamps
```

### Example 4: Content Streaming

```
Requirement: Smooth 1000 chunks per second

Best Choice: Leaky Bucket
Reason: Constant flow rate critical for smooth playback,
        handles network jitter well
```

---

## Testing Your Implementation

### Test 1: Basic Functionality
```bash
# Should allow exactly N requests
for i in {1..10}; do
  curl http://localhost:3000/api/endpoint
done
# All should succeed

curl http://localhost:3000/api/endpoint
# Should return 429
```

### Test 2: Window Boundary (Fixed Window only)
```bash
# At 59th second
sleep 59 && for i in {1..10}; do curl ...; done &
# At 60th second  
sleep 60 && for i in {1..10}; do curl ...; done &
# Should allow 20 total (burst issue)
```

### Test 3: Leak Rate (Leaky Bucket only)
```bash
# Fill bucket
for i in {1..10}; do curl ...; done
# Wait for leak
sleep 5
# Try again (should allow some based on leak rate)
curl ...
```

---

## Further Reading

- **Token Bucket vs Leaky Bucket**: Similar but different!
- **Distributed Rate Limiting**: Redis Cluster considerations
- **Rate Limiting at Scale**: Nginx, Envoy, API Gateway patterns
- **Algorithm Research Papers**: GCRA, Hierarchical Rate Limiting

---

**Pro Tip**: Start with Fixed Window, migrate to Sliding Window only 
if you observe abuse at window boundaries. Most APIs don't need the 
complexity of Sliding Window!

