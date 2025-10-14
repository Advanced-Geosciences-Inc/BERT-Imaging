# Docker Deployment Checklist

## 📋 Phase 1: Local Testing (Your Windows PC)

### Setup (30 minutes)
- [ ] Download Docker Desktop for Windows
- [ ] Install Docker Desktop
- [ ] Verify: `docker --version` works
- [ ] Transfer application files from Emergent to PC
- [ ] Open project in VSCodium

### Build Frontend (15 minutes)
- [ ] Open terminal in `frontend/` folder
- [ ] Run: `npm install`
- [ ] Run: `npm run build`
- [ ] Verify: `frontend/build/` directory exists

### Build Docker Image (10 minutes)
- [ ] Open terminal in project root
- [ ] Run: `docker-compose build`
- [ ] Wait for build to complete (5-10 min first time)
- [ ] Verify: No error messages

### Start Application (5 minutes)
- [ ] Run: `docker-compose up -d`
- [ ] Run: `docker-compose ps`
- [ ] Verify: Both services show "Up" and "healthy"

### Test PyGimli (10 minutes)
- [ ] Open browser or use curl
- [ ] Navigate to: `http://localhost:8000/api/versions`
- [ ] Verify JSON response shows:
  - [ ] `"pygimli": "1.5.x"`
  - [ ] `"pygimli:available": true` ✅ CRITICAL!
- [ ] Check logs: `docker-compose logs backend | findstr pygimli`
- [ ] Verify: Shows "Using real PyGimli for production"

### Test Application (20 minutes)
- [ ] Open: `http://localhost:3000`
- [ ] Verify: Frontend loads correctly
- [ ] Upload test STG file (File I/O tab)
- [ ] Verify: File appears in uploaded list
- [ ] Go to BERT Native tab
- [ ] Configure: spacing=1.0, lambda=20, maxIter=20
- [ ] Click: "Run Inversion"
- [ ] Wait for completion (10-30 seconds)
- [ ] Verify: Plots appear
- [ ] Upload DIFFERENT STG file
- [ ] Run inversion again
- [ ] Verify: Plots look DIFFERENT (not identical) ✅

### Success Validation
- [ ] PyGimli available in container
- [ ] Different files produce different plots
- [ ] Resistivity values seem realistic
- [ ] No errors in logs
- [ ] Ready to proceed to Phase 2

---

## 📋 Phase 2: Decision Point

### Option A: Deploy to Emergent
- [ ] Contact Emergent support
- [ ] Ask: "Do you support custom Docker images?"
- [ ] Wait for response

**If YES:**
- [ ] Create Docker Hub account (free)
- [ ] Login: `docker login`
- [ ] Tag: `docker tag bert-imager_backend:latest yourusername/bert-imager:latest`
- [ ] Push: `docker push yourusername/bert-imager:latest`
- [ ] Provide image URL to Emergent
- [ ] Deploy via Emergent interface
- [ ] Test deployed application
- [ ] ✅ **DONE! Real PyGimli in production!**

**If NO:**
→ Go to Option B or C

### Option B: Deploy to Cheap VM
- [ ] Choose provider (DigitalOcean $6/mo or AWS $10/mo)
- [ ] Create VM with Docker installed
- [ ] Copy docker-compose.yml to VM
- [ ] Run: `docker-compose up -d`
- [ ] Configure firewall (port 8000)
- [ ] Test: `curl http://VM_IP:8000/api/versions`
- [ ] Point frontend to VM backend
- [ ] ✅ **DONE! Backend on VM with real PyGimli!**

### Option C: Continue on Windows PC
- [ ] Application already working with Docker
- [ ] Use for development and research
- [ ] Deploy to production later when ready
- [ ] ✅ **DONE! Local development with real PyGimli!**

---

## 📋 Phase 3: Production Testing (Any Deployment)

### Functional Testing
- [ ] Upload various STG files
- [ ] Test with different electrode configurations
- [ ] Verify inversions complete successfully
- [ ] Check plot quality and accuracy
- [ ] Test QA/QC filtering
- [ ] Test with large datasets
- [ ] Verify error handling

### Performance Testing
- [ ] Measure inversion time (should be 5-30 seconds)
- [ ] Test with multiple concurrent users (if needed)
- [ ] Check memory usage
- [ ] Monitor CPU usage

### Scientific Validation
- [ ] Compare results with standalone BERT
- [ ] Verify chi-squared values are reasonable
- [ ] Check resistivity ranges match expectations
- [ ] Validate mesh generation
- [ ] Confirm electrode positioning correct

---

## 🎯 Quick Status Check

**Where are you now?**

### Status 1: Haven't Started
- [ ] Next: Install Docker Desktop
- [ ] Read: DOCKER_README.md
- [ ] Follow: Phase 1 checklist above

### Status 2: Docker Testing Locally
- [ ] Verify: `"pygimli:available": true`
- [ ] Test: Upload different STG files
- [ ] Confirm: Plots look different
- [ ] Next: Contact Emergent (Phase 2)

### Status 3: Emergent Response Received
- [ ] If YES: Push to registry (Phase 2, Option A)
- [ ] If NO: Choose VM or PC (Phase 2, Option B/C)

### Status 4: Deployed to Production
- [ ] Complete: Phase 3 testing
- [ ] Start: Real research work!

---

## ⚡ Quick Commands Reference

### Starting Fresh
```powershell
cd C:\Users\YourUsername\bert-imager
docker-compose build
docker-compose up -d
```

### Checking Status
```powershell
docker-compose ps
curl http://localhost:8000/api/versions
```

### Viewing Logs
```powershell
docker-compose logs -f backend
```

### Stopping
```powershell
docker-compose down
```

### Rebuilding
```powershell
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 📞 Troubleshooting Quick Fixes

**Docker not starting?**
```powershell
# Open Docker Desktop app and wait for it to start
```

**Build fails?**
```powershell
docker system prune -a
docker-compose build --no-cache
```

**PyGimli not available?**
```powershell
docker-compose exec backend python -c "import pygimli; print(pygimli.__version__)"
# If this fails, rebuild without cache
```

**Frontend can't reach backend?**
```powershell
# Check if backend is running
curl http://localhost:8000/api/versions
# Check docker-compose.yml network settings
```

---

## ✅ Final Success Criteria

You've succeeded when:
- [x] Docker image builds successfully
- [x] Containers run without errors
- [x] `"pygimli:available": true` in API response
- [x] Frontend accessible and functional
- [x] Can upload STG files
- [x] Can run inversions
- [x] Different files produce different plots
- [x] Plots show realistic resistivity patterns
- [x] Ready for production use or Emergent deployment

---

## 📚 Documentation Quick Links

**Getting Started:**
- DOCKER_README.md - Quick overview
- DOCKER_DEPLOYMENT.md - Complete guide

**Building:**
- Dockerfile - Image definition
- docker-compose.yml - Services config
- docker/environment.yml - Conda packages

**Scripts:**
- docker/build.ps1 - Windows build script
- docker/build.sh - Linux/Mac build script

---

**Use this checklist to track your progress! Good luck! 🚀**
