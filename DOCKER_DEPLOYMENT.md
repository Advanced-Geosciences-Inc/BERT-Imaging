# BERT 2D Imager - Docker Deployment with Real PyGimli

## 🎯 Overview

This deployment uses a **custom Docker image** with micromamba to provide real PyGimli without requiring conda on the host system.

**What this solves:**
- ✅ PyGimli runs inside the container
- ✅ No conda needed on host/cluster
- ✅ Kubernetes-compatible
- ✅ Works on Emergent, AWS, or local

---

## Prerequisites

### On Windows 11 (Your PC)
- **Docker Desktop** - Download from: https://www.docker.com/products/docker-desktop/
- **Git** (optional) - For version control
- **VS Code/VSCodium** - For editing

### On Emergent/Kubernetes
- Support for custom Docker images
- Container registry access (Docker Hub, ECR, etc.)

---

## Part 1: Test Locally on Windows (First!)

### Step 1.1: Install Docker Desktop

1. Download Docker Desktop for Windows
2. Install and restart
3. Open Docker Desktop
4. Ensure it's running (whale icon in system tray)

**Verify installation:**
```powershell
docker --version
docker-compose --version
```

Expected output:
```
Docker version 24.x.x
Docker Compose version v2.x.x
```

### Step 1.2: Prepare Application Files

Transfer the application from Emergent to your PC:
```
C:\Users\YourUsername\bert-imager\
├── backend\
├── frontend\
├── docker\
├── Dockerfile
├── docker-compose.yml
└── .dockerignore
```

**Essential files:**
- `Dockerfile` - Main container definition
- `docker/environment.yml` - Conda packages (includes PyGimli)
- `docker-compose.yml` - Multi-container setup
- `docker/nginx.conf` - Frontend server config

### Step 1.3: Build Frontend (First Time Only)

```powershell
cd C:\Users\YourUsername\bert-imager\frontend

# Install dependencies
npm install

# Build production frontend
npm run build
```

This creates `frontend/build/` directory needed for Docker.

### Step 1.4: Build Docker Image

```powershell
cd C:\Users\YourUsername\bert-imager

# Build the image (takes 5-10 minutes first time)
docker-compose build
```

**What happens:**
- Downloads micromamba base image
- Installs PyGimli via conda-forge
- Installs all dependencies
- Copies your application code

**Expected output (last lines):**
```
Successfully built abc123def456
Successfully tagged bert-imager_backend:latest
```

### Step 1.5: Start the Application

```powershell
# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

**Expected output:**
```
NAME                IMAGE                      STATUS
bert-backend        bert-imager_backend        Up 30 seconds (healthy)
bert-frontend       nginx:alpine               Up 30 seconds
```

### Step 1.6: Verify PyGimli is Working

**Option A: Check API endpoint**
```powershell
curl http://localhost:8000/api/versions
```

**Look for:**
```json
{
  "python": "/opt/conda/bin/python",
  "pygimli": "1.5.4",
  "pygimli:available": true,  ← THIS SHOULD BE TRUE!
  "pandas": "2.2.0"
}
```

**Option B: Check container logs**
```powershell
docker-compose logs backend | findstr pygimli
```

**Should show:**
```
Using real PyGimli for production
```

✅ **If you see `"pygimli:available": true` → SUCCESS! Real PyGimli is working!**

### Step 1.7: Test the Application

**Open browser:** http://localhost:3000

**Test workflow:**
1. Upload an STG file
2. Go to BERT Native tab
3. Run inversion
4. Check plots

**Expected:**
- Different plots for different files (not all similar!)
- Realistic resistivity patterns
- Proper mesh based on electrodes

---

## Part 2: Troubleshooting Local Docker

### Issue: "docker: command not found"

**Fix:** Docker Desktop not running
1. Open Docker Desktop application
2. Wait for it to start (whale icon appears)
3. Try command again

### Issue: "Cannot connect to Docker daemon"

**Fix:** 
```powershell
# Restart Docker Desktop
# Or in PowerShell (as Administrator):
Restart-Service docker
```

### Issue: Build fails with "no space left"

**Fix:** Clean up Docker
```powershell
docker system prune -a
docker volume prune
```

### Issue: "pygimli:available": false in container

**Fix:** Rebuild without cache
```powershell
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Frontend can't reach backend

**Fix:** Check docker-compose.yml network settings
```powershell
docker-compose logs backend
docker-compose logs frontend
```

---

## Part 3: Push to Container Registry

Once verified locally, push to registry for Emergent deployment.

### Option A: Docker Hub (Free, Public)

**Step 1: Create Docker Hub account**
- Sign up at: https://hub.docker.com/

**Step 2: Login**
```powershell
docker login
# Enter username and password
```

**Step 3: Tag image**
```powershell
docker tag bert-imager_backend:latest yourusername/bert-imager:latest
```

**Step 4: Push**
```powershell
docker push yourusername/bert-imager:latest
```

**Result:** Image available at `docker.io/yourusername/bert-imager:latest`

### Option B: AWS ECR (Private)

**Step 1: Create ECR repository**
```powershell
aws ecr create-repository --repository-name bert-imager
```

**Step 2: Login to ECR**
```powershell
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
```

**Step 3: Tag and push**
```powershell
docker tag bert-imager_backend:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/bert-imager:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/bert-imager:latest
```

### Option C: GitHub Container Registry (Free, Private)

**Step 1: Create Personal Access Token**
- GitHub → Settings → Developer settings → Personal access tokens
- Create token with `write:packages` permission

**Step 2: Login**
```powershell
echo YOUR_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

**Step 3: Tag and push**
```powershell
docker tag bert-imager_backend:latest ghcr.io/yourusername/bert-imager:latest
docker push ghcr.io/yourusername/bert-imager:latest
```

---

## Part 4: Deploy to Emergent

### Step 4.1: Contact Emergent Support

Ask Emergent if they support custom Docker images:

```
Subject: Custom Docker Image Deployment

Hi Emergent Team,

I've built a custom Docker image for my application that requires
PyGimli (a scientific computing library installed via conda).

The image is based on mambaorg/micromamba and includes all dependencies.

Can I deploy this custom image to Emergent? If yes:

1. Do you support Docker Hub images?
2. Do you support private registries (ECR, GHCR)?
3. What's the deployment process for custom images?

Image details:
- Base: mambaorg/micromamba:1.5.8
- Size: ~2GB
- Port: 8000 (backend)

Thank you!
```

### Step 4.2: Deployment Options

**If Emergent supports custom images:**

Provide them with:
- Image URL: `yourusername/bert-imager:latest`
- Port: 8000
- Environment variables (if needed)
- Health check endpoint: `/api/versions`

**If Emergent doesn't support custom images:**

**Plan B: Deploy to Cheap VM**
- AWS EC2 t2.small (~$10/month)
- DigitalOcean Droplet ($6/month)
- Run docker-compose on VM
- Keep frontend in Emergent, point to VM backend

---

## Part 5: Production Docker Compose (for VM)

If deploying to your own VM:

```yaml
version: '3.8'

services:
  backend:
    image: yourusername/bert-imager:latest
    container_name: bert-backend
    ports:
      - "8000:8000"
    environment:
      - CORS_ORIGINS=https://your-frontend-domain.com
    volumes:
      - bert-data:/app/backend/data
      - bert-results:/app/backend/results
      - bert-jobs:/app/backend/bert_jobs
    restart: always

  nginx:
    image: nginx:alpine
    container_name: bert-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - backend
    restart: always

volumes:
  bert-data:
  bert-results:
  bert-jobs:
```

---

## Part 6: Updating the Application

### Update Code and Rebuild

```powershell
# Pull latest code
cd C:\Users\YourUsername\bert-imager
git pull origin main

# Rebuild frontend (if changed)
cd frontend
npm run build

# Rebuild Docker image
cd ..
docker-compose down
docker-compose build
docker-compose up -d

# Push new version
docker tag bert-imager_backend:latest yourusername/bert-imager:v2.0
docker push yourusername/bert-imager:v2.0
```

---

## Part 7: Docker Commands Reference

### Basic Operations

```powershell
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Check status
docker-compose ps

# Restart service
docker-compose restart backend

# Execute command in container
docker-compose exec backend python -c "import pygimli; print(pygimli.__version__)"

# Access backend shell
docker-compose exec backend bash
```

### Debugging

```powershell
# Check if PyGimli is installed
docker-compose exec backend python -c "import pygimli as pg; print(pg.__version__)"

# Check Python environment
docker-compose exec backend which python
docker-compose exec backend pip list

# View backend API logs
docker-compose logs backend | grep -i error

# Check container health
docker inspect bert-backend | findstr Health
```

### Cleanup

```powershell
# Remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Clean up Docker system
docker system prune -a

# Remove specific image
docker rmi bert-imager_backend
```

---

## Part 8: Testing Real PyGimli in Docker

### Test Script

Create `test_pygimli.py`:
```python
import pygimli as pg
print(f"PyGimli version: {pg.__version__}")
print(f"PyGimli available: True")
print(f"Python path: {pg.__file__}")
```

**Run in container:**
```powershell
docker-compose exec backend python test_pygimli.py
```

**Expected output:**
```
PyGimli version: 1.5.4
PyGimli available: True
Python path: /opt/conda/lib/python3.11/site-packages/pygimli/__init__.py
```

---

## Quick Start Summary

```powershell
# 1. Install Docker Desktop for Windows

# 2. Build frontend
cd frontend
npm install && npm run build

# 3. Build Docker image
cd ..
docker-compose build

# 4. Start application
docker-compose up -d

# 5. Test PyGimli
curl http://localhost:8000/api/versions

# 6. Open application
# Browser: http://localhost:3000

# 7. Upload STG file and test inversion
```

---

## Success Checklist

- [ ] Docker Desktop installed and running
- [ ] Frontend built (`frontend/build/` exists)
- [ ] Docker image built successfully
- [ ] Containers running (`docker-compose ps`)
- [ ] Backend healthy (health check passes)
- [ ] `/api/versions` shows `"pygimli:available": true`
- [ ] Frontend accessible at `http://localhost:3000`
- [ ] Can upload STG files
- [ ] Can run inversions
- [ ] Plots show unique results (not all similar)
- [ ] Ready to push to registry
- [ ] Ready to deploy to Emergent/VM

---

## Next Steps

1. ✅ **Test locally first** - Verify Docker works on your PC
2. ✅ **Validate PyGimli** - Upload real STG files, check results
3. ✅ **Push to registry** - Docker Hub or ECR
4. ✅ **Contact Emergent** - Ask about custom image support
5. ✅ **Deploy** - Either to Emergent or your own VM

---

**You now have a production-ready Docker image with real PyGimli! 🚀**
