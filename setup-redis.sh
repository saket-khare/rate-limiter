#!/bin/bash

echo "🚀 Redis Setup for Rate Limiter"
echo "================================"
echo ""

# Check if Docker is installed
if command -v docker &> /dev/null; then
    echo "✅ Docker found!"
    
    # Check if Docker is running
    if docker ps &> /dev/null; then
        echo "✅ Docker is running"
        
        # Stop and remove existing container if it exists
        if docker ps -a | grep -q redis-rate-limiter; then
            echo "🔄 Removing existing Redis container..."
            docker stop redis-rate-limiter 2>/dev/null
            docker rm redis-rate-limiter 2>/dev/null
        fi
        
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
            echo ""
            echo "✅ SUCCESS! Redis is running!"
            echo ""
            echo "📊 Container info:"
            docker ps | grep redis-rate-limiter
            echo ""
            echo "🎯 Next steps:"
            echo "   1. Install dependencies: pnpm install"
            echo "   2. Run demo server: pnpm example"
            echo "   3. Test endpoint: curl http://localhost:3000/api/fixed-window"
            echo ""
            echo "💡 Useful commands:"
            echo "   - Stop Redis: docker stop redis-rate-limiter"
            echo "   - Start Redis: docker start redis-rate-limiter"
            echo "   - View logs: docker logs redis-rate-limiter"
            echo "   - Redis CLI: docker exec -it redis-rate-limiter redis-cli"
        else
            echo "❌ Redis failed to start"
            exit 1
        fi
    else
        echo "❌ Docker is installed but not running"
        echo "   Please start Docker Desktop and try again"
        echo "   (Look for Docker icon in menu bar)"
        exit 1
    fi
else
    echo "❌ Docker not found"
    echo ""
    echo "Choose an option:"
    echo ""
    echo "Option 1: Install Docker Desktop (Recommended)"
    echo "  1. Visit: https://www.docker.com/products/docker-desktop/"
    echo "  2. Download for Mac"
    echo "  3. Install and start Docker Desktop"
    echo "  4. Run this script again"
    echo ""
    echo "Option 2: Install Redis directly with Homebrew"
    read -p "Would you like to install Redis with Homebrew? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Check if Homebrew is installed
        if command -v brew &> /dev/null; then
            echo "📦 Installing Redis..."
            brew install redis
            
            echo "🚀 Starting Redis..."
            brew services start redis
            
            # Wait for Redis to start
            sleep 3
            
            # Test connection
            if redis-cli ping | grep -q PONG; then
                echo ""
                echo "✅ SUCCESS! Redis is running!"
                echo ""
                echo "🎯 Next steps:"
                echo "   1. Install dependencies: pnpm install"
                echo "   2. Run demo server: pnpm example"
                echo "   3. Test endpoint: curl http://localhost:3000/api/fixed-window"
                echo ""
                echo "💡 Useful commands:"
                echo "   - Stop Redis: brew services stop redis"
                echo "   - Start Redis: brew services start redis"
                echo "   - Redis CLI: redis-cli"
            else
                echo "❌ Redis failed to start"
                exit 1
            fi
        else
            echo "❌ Homebrew not found"
            echo "   Install Homebrew from: https://brew.sh"
            echo "   Then run this script again"
            exit 1
        fi
    else
        echo ""
        echo "Please install Docker Desktop or Redis manually"
        echo "See DOCKER_SETUP.md for detailed instructions"
        exit 1
    fi
fi

