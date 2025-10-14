# BERT 2D Imager - Docker Build Script (Windows PowerShell)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "BERT 2D Imager - Docker Build" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check if frontend build exists
if (-not (Test-Path "frontend/build")) {
    Write-Host "⚠️  Frontend build not found. Building frontend..." -ForegroundColor Yellow
    Push-Location frontend
    npm install
    npm run build
    Pop-Location
    Write-Host "✓ Frontend built successfully" -ForegroundColor Green
} else {
    Write-Host "✓ Frontend build exists" -ForegroundColor Green
}
Write-Host ""

# Build Docker image
Write-Host "📦 Building Docker image..." -ForegroundColor Cyan
Write-Host "This may take 5-10 minutes on first build..." -ForegroundColor Yellow
Write-Host ""

docker-compose build

Write-Host ""
Write-Host "✓ Docker image built successfully!" -ForegroundColor Green
Write-Host ""

# Start services
Write-Host "🚀 Starting services..." -ForegroundColor Cyan
docker-compose up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check health
Write-Host ""
Write-Host "🔍 Checking service status..." -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ Build Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend: http://localhost:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Test PyGimli status:" -ForegroundColor Yellow
Write-Host "  curl http://localhost:8000/api/versions" -ForegroundColor White
Write-Host ""
Write-Host "View logs:" -ForegroundColor Yellow
Write-Host "  docker-compose logs -f backend" -ForegroundColor White
Write-Host ""
Write-Host "Stop services:" -ForegroundColor Yellow
Write-Host "  docker-compose down" -ForegroundColor White
Write-Host ""
