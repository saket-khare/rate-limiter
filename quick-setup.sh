#!/bin/bash
echo "🚀 Installing Redis with Homebrew..."
brew install redis

echo ""
echo "🎯 Starting Redis..."
brew services start redis

echo ""
echo "⏳ Waiting for Redis to start..."
sleep 3

echo ""
echo "🧪 Testing Redis connection..."
if redis-cli ping | grep -q PONG; then
    echo "✅ SUCCESS! Redis is running!"
    echo ""
    echo "📊 Redis info:"
    redis-cli INFO server | grep redis_version
    echo ""
    echo "🎯 Next steps:"
    echo "   1. Install dependencies: pnpm install"
    echo "   2. Run demo server: pnpm example"
    echo "   3. Open browser: http://localhost:3000"
    echo ""
    echo "💡 Useful commands:"
    echo "   - Stop Redis: brew services stop redis"
    echo "   - Start Redis: brew services start redis"
    echo "   - Restart Redis: brew services restart redis"
    echo "   - Redis CLI: redis-cli"
    echo "   - Test connection: redis-cli ping"
else
    echo "❌ Redis failed to start. Try: brew services restart redis"
fi
