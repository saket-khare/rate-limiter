# Docker & Redis Setup Guide

Complete guide to install Docker and run Redis for the rate limiter project.

---

## What is Docker?

**Docker** is a platform that runs applications in isolated containers. Think of it as a lightweight virtual machine.

**Why use Docker for Redis?**
- ✅ No system-wide Redis installation
- ✅ Easy to start/stop/remove
- ✅ No version conflicts
- ✅ Works the same on any machine

---

## Installing Docker

### Option 1: Docker Desktop (Recommended for macOS)

**Step 1: Download Docker Desktop**

Visit: https://www.docker.com/products/docker-desktop/

Or use this direct link:
- **Mac with Intel chip**: https://desktop.docker.com/mac/main/amd64/Docker.dmg
- **Mac with Apple Silicon (M1/M2/M3)**: https://desktop.docker.com/mac/main/arm64/Docker.dmg

**Step 2: Install**

1. Open the downloaded `.dmg` file
2. Drag Docker icon to Applications folder
3. Open Docker from Applications
4. Follow the setup wizard
5. Docker will ask for permissions - grant them

**Step 3: Verify Installation**

Open Terminal and run:
```bash
docker --version
```

You should see something like:
```
Docker version 24.0.6, build ed223bc
```

**Step 4: Check Docker is Running**

```bash
docker ps
```

Should show:
```
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

---

### Option 2: Homebrew (Alternative for macOS)

If you have Homebrew installed:

```bash
# Install Docker
brew install --cask docker

# Start Docker Desktop
open /Applications/Docker.app
```

---

### Option 3: Install Redis Directly (No Docker)

If you prefer not to use Docker, install Redis directly:

**Using Homebrew:**
```bash
# Install Redis
brew install redis

# Start Redis as a service (runs in background)
brew services start redis

# Or start Redis manually (runs in foreground)
redis-server
```

**Verify Redis is running:**
```bash
redis-cli ping
```

Should respond with: `PONG`

---

## Running Redis with Docker

### Quick Start (One Command)

```bash
docker run -d -p 6379:6379 --name redis-rate-limiter redis:alpine
```

**What this does:**
- `docker run` - Create and start a container
- `-d` - Run in background (detached mode)
- `-p 6379:6379` - Map port 6379 (container) to 6379 (your machine)
- `--name redis-rate-limiter` - Give it a friendly name
- `redis:alpine` - Use lightweight Redis image

### Verify Redis is Running

```bash
# Check running containers
docker ps

# Should show:
# CONTAINER ID   IMAGE          COMMAND                  PORTS
# abc123def456   redis:alpine   "docker-entrypoint.s…"   0.0.0.0:6379->6379/tcp
```

### Test Redis Connection

```bash
# Connect to Redis CLI
docker exec -it redis-rate-limiter redis-cli

# Inside Redis CLI, type:
ping
# Should respond: PONG

# Try setting a value:
SET test "Hello Redis"
GET test
# Should respond: "Hello Redis"

# Exit Redis CLI:
exit
```

---

## Docker Commands Cheat Sheet

### Container Management

```bash
# Start Redis container
docker start redis-rate-limiter

# Stop Redis container
docker stop redis-rate-limiter

# Restart Redis container
docker restart redis-rate-limiter

# Remove Redis container (must be stopped first)
docker rm redis-rate-limiter

# View container logs
docker logs redis-rate-limiter

# View real-time logs
docker logs -f redis-rate-limiter
```

### Checking Status

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container details
docker inspect redis-rate-limiter

# Check resource usage
docker stats redis-rate-limiter
```

### Redis-Specific Commands

```bash
# Execute Redis CLI commands directly
docker exec redis-rate-limiter redis-cli PING
docker exec redis-rate-limiter redis-cli KEYS "*"
docker exec redis-rate-limiter redis-cli FLUSHALL  # Clear all data

# Interactive Redis CLI session
docker exec -it redis-rate-limiter redis-cli
```

---

## Troubleshooting

### Problem: "Cannot connect to Docker daemon"

**Solution:**
```bash
# Make sure Docker Desktop is running
open /Applications/Docker.app

# Wait 30 seconds for Docker to start, then try again
docker ps
```

### Problem: "Port 6379 already in use"

**Solution:**
```bash
# Check what's using port 6379
lsof -i :6379

# If it's Redis, stop it:
brew services stop redis

# Or kill the process:
kill -9 <PID>

# Then start Docker Redis again
docker start redis-rate-limiter
```

### Problem: "No such container: redis-rate-limiter"

**Solution:**
```bash
# Container doesn't exist, create it:
docker run -d -p 6379:6379 --name redis-rate-limiter redis:alpine
```

### Problem: Docker Desktop uses too much memory

**Solution:**
1. Open Docker Desktop
2. Go to Settings (gear icon)
3. Resources tab
4. Adjust Memory limit (2GB is enough for Redis)
5. Click "Apply & Restart"

---

## Redis Data Persistence

By default, Docker containers lose data when removed. To persist data:

```bash
# Create a volume for Redis data
docker volume create redis-data

# Run Redis with persistent storage
docker run -d \
  -p 6379:6379 \
  --name redis-rate-limiter \
  -v redis-data:/data \
  redis:alpine redis-server --appendonly yes
```

Now your data survives container restarts!

---

## Docker Compose (Advanced)

For easier management, create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:alpine
    container_name: redis-rate-limiter
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

**Usage:**
```bash
# Start Redis
docker-compose up -d

# Stop Redis
docker-compose down

# View logs
docker-compose logs -f
```

---

## Quick Setup Script

Save this as `setup-redis.sh`:

```bash
#!/bin/bash

echo "🚀 Setting up Redis for Rate Limiter..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop first."
    echo "   Visit: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Stop and remove existing container if it exists
docker stop redis-rate-limiter 2>/dev/null
docker rm redis-rate-limiter 2>/dev/null

# Start Redis
echo "📦 Starting Redis container..."
docker run -d \
  -p 6379:6379 \
  --name redis-rate-limiter \
  redis:alpine

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to start..."
sleep 3

# Test connection
if docker exec redis-rate-limiter redis-cli PING | grep -q PONG; then
    echo "✅ Redis is running!"
    echo ""
    echo "📊 Container info:"
    docker ps | grep redis-rate-limiter
    echo ""
    echo "🎯 You can now run: pnpm example"
else
    echo "❌ Redis failed to start"
    exit 1
fi
```

Make it executable and run:
```bash
chmod +x setup-redis.sh
./setup-redis.sh
```

---

## Alternative: Redis Without Docker

If you decide not to use Docker:

### macOS (Homebrew)
```bash
brew install redis
brew services start redis
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

### Verify
```bash
redis-cli ping
# Should respond: PONG
```

---

## Next Steps

1. **Install Docker** (or Redis directly)
2. **Start Redis** using one of the methods above
3. **Test connection**: `docker exec redis-rate-limiter redis-cli PING`
4. **Run the demo**: `cd rate-limiter && pnpm example`

---

## Need Help?

- Docker Documentation: https://docs.docker.com/
- Redis Documentation: https://redis.io/docs/
- Docker Desktop Issues: https://github.com/docker/for-mac/issues

---

## Summary

**Easiest Path:**
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Run: `docker run -d -p 6379:6379 --name redis-rate-limiter redis:alpine`
3. Test: `docker exec redis-rate-limiter redis-cli PING`
4. Done! ✅

**Alternative (No Docker):**
1. Run: `brew install redis`
2. Run: `brew services start redis`
3. Test: `redis-cli ping`
4. Done! ✅

