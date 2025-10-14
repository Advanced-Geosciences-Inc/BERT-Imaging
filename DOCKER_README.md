# BERT 2D Imager - Docker Deployment (Option 1)

## 🎯 Quick Overview

This Docker implementation solves the PyGimli installation problem by:
- Using **micromamba** (lightweight conda) inside the container
- Pre-installing **PyGimli** via conda-forge
- Creating a **self-contained image** that works anywhere
- **No conda needed** on host machine or Kubernetes cluster

---

## ⚡ Quick Start (Your Windows PC)

### Prerequisites
1. **Docker Desktop** - https://www.docker.com/products/docker-desktop/
2. **Application files** - Transfer from Emergent to your PC

### 3-Step Setup

**Step 1: Build Frontend**
```powershell
cd frontend
npm install
npm run build
```

**Step 2: Build & Start Docker**
```powershell
cd ..
docker-compose build
docker-compose up -d
```

**Step 3: Verify PyGimli**
```powershell
curl http://localhost:8000/api/versions
```

Look for: `"pygimli:available": true` ✅

**Open App:** http://localhost:3000

---

## 📁 Project Structure

```
bert-imager/
├── Dockerfile                  ← Main container definition
├── docker-compose.yml          ← Multi-container orchestration
├── .dockerignore              ← Build optimization
├── docker/
│   ├── environment.yml        ← Conda packages (PyGimli!)
│   ├── nginx.conf            ← Frontend server config
│   ├── build.sh              ← Linux/Mac build script
│   └── build.ps1             ← Windows build script
├── backend/
│   ├── app/                  ← Your PyGimli integration code
│   └── server.py             ← FastAPI application
└── frontend/
    └── build/                ← Production React build
```

---

## 🔧 What's in the Docker Image

**Base Image:** `mambaorg/micromamba:1.5.8`
- Lightweight conda alternative
- ~200MB base (vs 4GB for full conda)

**Installed via Conda:**
- Python 3.11
- **PyGimli 1.5.3+** (the key component!)
- NumPy, Pandas, Matplotlib, SciPy
- FastAPI, Uvicorn

**Result:**
- Total image size: ~2GB
- Includes all dependencies
- Ready to run anywhere

---

## ✅ Testing Locally (Before Emergent)

### Test 1: Verify PyGimli Installation

```powershell
# Check API response
curl http://localhost:8000/api/versions

# Or open in browser
http://localhost:8000/api/versions
```

**Expected response:**
```json
{
  "python": "/opt/conda/bin/python",
  "pygimli": "1.5.4",
  "pygimli:available": true,  ← CRITICAL!
  "pandas": "2.2.0",
  "numpy": "1.26.0"
}
```

### Test 2: Check Container Logs

```powershell
docker-compose logs backend | findstr pygimli
```

**Expected output:**
```
Using real PyGimli for production
```

### Test 3: Upload Real STG File

1. Open: http://localhost:3000
2. Upload your Amistad_trial1.stg
3. Go to BERT Native tab
4. Run inversion
5. **Check: Plots should look different for different files!**

### Test 4: Direct PyGimli Test

```powershell
# Execute Python in container
docker-compose exec backend python -c "import pygimli as pg; print(f'PyGimli {pg.__version__} ready!')"
```

**Expected:**
```
PyGimli 1.5.4 ready!
```

---

## 🚀 Deployment Paths

### Path A: Deploy to Emergent (If Supported)

**Step 1: Contact Emergent Support**
```
"Can I deploy a custom Docker image based on mambaorg/micromamba?
Image includes PyGimli via conda-forge.
Size: ~2GB, Port: 8000"
```

**Step 2: If YES → Push to Registry**
```powershell
# Login to Docker Hub
docker login

# Tag image
docker tag bert-imager_backend:latest yourusername/bert-imager:latest

# Push
docker push yourusername/bert-imager:latest
```

**Step 3: Deploy to Emergent**
- Provide image URL: `yourusername/bert-imager:latest`
- Configure port: 8000
- Done! Real PyGimli in Emergent!

---

### Path B: Deploy to Cheap VM (If Emergent Doesn't Support)

**Option 1: DigitalOcean Droplet ($6/month)**
```bash
# On VM
docker-compose up -d
# Access via VM's public IP
```

**Option 2: AWS EC2 t2.small (~$10/month)**
```bash
# On EC2
docker-compose up -d
# Configure security group (port 8000)
```

**Frontend:** Keep in Emergent, point to VM backend
**Backend:** Runs on VM with real PyGimli

---

## 📊 Performance Comparison

### Mock PyGimli (Current Emergent)
- ❌ Random synthetic data
- ❌ All plots look similar
- ❌ Not scientifically accurate
- ✅ Fast (no real computation)

### Real PyGimli (Docker)
- ✅ Physics-based inversion
- ✅ Unique results per dataset
- ✅ Scientifically accurate
- ⚠️ Slower (real computation: 5-30 seconds per inversion)

---

## 🛠️ Docker Commands

### Daily Operations
```powershell
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart backend only
docker-compose restart backend

# View logs (live)
docker-compose logs -f backend

# Check status
docker-compose ps
```

### Debugging
```powershell
# Access backend shell
docker-compose exec backend bash

# Test PyGimli directly
docker-compose exec backend python -c "import pygimli; print(pygimli.__version__)"

# Check Python packages
docker-compose exec backend pip list | findstr pygimli
```

### Updating
```powershell
# Pull new code
git pull

# Rebuild
docker-compose down
docker-compose build
docker-compose up -d
```

---

## 📋 Troubleshooting

### Issue: "pygimli:available": false

**Diagnosis:**
```powershell
docker-compose exec backend python -c "import pygimli"
```

**If error appears:**
```powershell
# Rebuild without cache
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Frontend can't reach backend

**Check docker-compose.yml:**
- Ensure services are in same network
- Check backend service name in nginx.conf

**Test backend directly:**
```powershell
curl http://localhost:8000/api/versions
```

### Issue: Build takes too long

**First build:** 5-10 minutes (downloads ~1.5GB)
**Subsequent builds:** 1-2 minutes (uses cache)

**Speed up:**
- Ensure good internet connection
- Use `docker-compose build --parallel`

---

## 💰 Cost Comparison

### Option: Keep Everything in Emergent
- **Cost:** $0 (if they support custom images)
- **Setup:** 1 hour (push image)
- **Maintenance:** Easy (Emergent manages)

### Option: VM for Backend
- **Cost:** $6-10/month (DigitalOcean/AWS)
- **Setup:** 2 hours (VM + Docker)
- **Maintenance:** Moderate (you manage VM)

### Option: Full Windows PC Development
- **Cost:** $0 (your PC + conda)
- **Setup:** 2 hours (conda + PyGimli)
- **Maintenance:** Easy (local control)

---

## 🎯 Decision Matrix

| Factor | Docker (Emergent) | Docker (VM) | Windows PC |
|--------|-------------------|-------------|------------|
| PyGimli | ✅ Real | ✅ Real | ✅ Real |
| Cost | Free | $6-10/mo | Free |
| Setup Time | 1 hr | 2 hrs | 2 hrs |
| Deployment | Emergent | Manual | Local |
| Scalability | ✅ High | ⚠️ Medium | ❌ Low |
| Maintenance | ✅ Easy | ⚠️ Moderate | ✅ Easy |

**Recommendation:**
1. **Test Docker locally** on your PC first (verify it works)
2. **Ask Emergent** if they support custom images
3. **If yes** → Deploy to Emergent (best option)
4. **If no** → Use Windows PC with conda (easiest)

---

## ✅ Success Criteria

After local Docker testing, you should have:

- [ ] Docker Desktop installed and running
- [ ] Image built successfully (~2GB)
- [ ] Containers running (healthy status)
- [ ] Backend API responding at port 8000
- [ ] Frontend accessible at port 3000
- [ ] `/api/versions` shows `"pygimli:available": true`
- [ ] Uploaded test STG file successfully
- [ ] Ran inversion and got unique plots
- [ ] Verified plots differ between files
- [ ] Ready to push to registry or use on PC

---

## 📚 Documentation

- **DOCKER_DEPLOYMENT.md** - Complete step-by-step guide
- **DOCKER_README.md** - This file (quick reference)
- **docker-compose.yml** - Service configuration
- **Dockerfile** - Image definition

---

## 🚀 Next Steps

1. **Today:** Test Docker on your Windows PC
2. **Verify:** Real PyGimli working with your data
3. **Decide:** Emergent vs VM vs PC deployment
4. **Deploy:** Based on Emergent's response

**You're now ready to test Option 1! 🎉**

---

## 📞 Quick Help

**Docker not starting?**
→ Open Docker Desktop application

**Build failing?**
→ Check `docker-compose logs backend`

**PyGimli not available?**
→ Rebuild: `docker-compose build --no-cache`

**Need more help?**
→ See DOCKER_DEPLOYMENT.md (complete guide)
