#!/bin/bash
# BERT 2D Imager - Docker Build Script (Linux/Mac)

set -e

echo "=================================="
echo "BERT 2D Imager - Docker Build"
echo "=================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop."
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
echo ""

# Check if frontend build exists
if [ ! -d "frontend/build" ]; then
    echo "⚠️  Frontend build not found. Building frontend..."
    cd frontend
    npm install
    npm run build
    cd ..
    echo "✓ Frontend built successfully"
else
    echo "✓ Frontend build exists"
fi
echo ""

# Build Docker image
echo "📦 Building Docker image..."
echo "This may take 5-10 minutes on first build..."
echo ""

docker-compose build

echo ""
echo "✓ Docker image built successfully!"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo ""
echo "🔍 Checking service status..."
docker-compose ps

echo ""
echo "=================================="
echo "✅ Build Complete!"
echo "=================================="
echo ""
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Test PyGimli status:"
echo "  curl http://localhost:8000/api/versions | jq '.pygimli'"
echo ""
echo "View logs:"
echo "  docker-compose logs -f backend"
echo ""
echo "Stop services:"
echo "  docker-compose down"
echo ""
