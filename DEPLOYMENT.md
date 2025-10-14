# BERT 2D Imager - Production Deployment Guide

## Option 1: Conda Environment (AWS EC2 / Local Server)

This guide covers deploying the BERT 2D Imager application with **real PyGimli** for scientifically accurate ERT inversions.

---

## Prerequisites

### System Requirements
- **OS**: Linux (Ubuntu 20.04+ recommended), macOS, or Windows with WSL2
- **RAM**: 4GB minimum, 8GB+ recommended for large datasets
- **Disk**: 5GB free space (including dependencies)
- **Python**: 3.10 or 3.11 (via Conda)

### Required Software
- **Conda/Miniconda**: Package manager for PyGimli
- **Git**: For cloning the repository (optional)
- **Node.js 18+**: For frontend build (if needed)

---

## Part 1: Environment Setup

### Step 1.1: Install Miniconda (if not installed)

**Linux/macOS:**
```bash
# Download and install Miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3

# Initialize conda
$HOME/miniconda3/bin/conda init bash
source ~/.bashrc
```

**AWS EC2 (Amazon Linux 2 / Ubuntu):**
```bash
# Update system
sudo yum update -y  # Amazon Linux
# OR
sudo apt-get update && sudo apt-get upgrade -y  # Ubuntu

# Install Miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b
echo 'export PATH="$HOME/miniconda3/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Step 1.2: Create Conda Environment

```bash
# Create environment with Python 3.11
conda create -n bert python=3.11 -y
conda activate bert
```

### Step 1.3: Install PyGimli and Dependencies

```bash
# Install PyGimli from conda-forge (includes pgcore, Triangle, Tetgen)
conda install -c conda-forge pygimli -y

# Optional: Install pyBERT for enhanced file parsing
conda install -c conda-forge pybert -y

# Verify PyGimli installation
python -c "import pygimli as pg; print(f'PyGimli {pg.__version__} installed successfully')"
```

**Expected output:**
```
PyGimli 1.5.x installed successfully
```

---

## Part 2: Application Deployment

### Step 2.1: Transfer Application Files

**Option A: From Current Container/Environment**
```bash
# On your development machine, package the application
cd /app
tar -czf bert-imager.tar.gz backend frontend

# Transfer to deployment server
scp bert-imager.tar.gz user@your-server:/home/user/
```

**Option B: Clone from GitHub (if you've pushed to GitHub)**
```bash
# On deployment server
git clone https://github.com/your-username/bert-imager.git
cd bert-imager
```

**Option C: Manual Copy**
Copy these directories to your deployment server:
- `/app/backend/` - Backend application
- `/app/frontend/build/` - Frontend build (or source for building)

### Step 2.2: Install Backend Dependencies

```bash
cd bert-imager/backend

# Install Python dependencies
pip install -r requirements.txt

# Verify critical packages
pip list | grep -E "fastapi|uvicorn|pandas|numpy|matplotlib"
```

### Step 2.3: Configure Environment Variables

Create `.env` file in `backend/` directory:

```bash
cat > backend/.env << 'EOF'
# MongoDB Connection (optional - for user data storage)
MONGO_URL=mongodb://localhost:27017
DB_NAME=bert_imager

# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Application Settings
DATA_DIR=/path/to/bert-imager/backend/data
RESULTS_DIR=/path/to/bert-imager/backend/results
BERT_JOBS_DIR=/path/to/bert-imager/backend/bert_jobs
EOF
```

**For AWS EC2 (with domain):**
```bash
# Update CORS_ORIGINS with your domain
CORS_ORIGINS=https://your-domain.com,http://your-ec2-ip
```

---

## Part 3: Verify PyGimli Integration

### Step 3.1: Test PyGimli Import

```bash
# Activate conda environment
conda activate bert

# Test PyGimli
python << 'PYEOF'
import pygimli as pg
from pygimli.physics import ert

print(f"✓ PyGimli version: {pg.__version__}")
print(f"✓ PyGimli path: {pg.__file__}")
print("✓ ERT module: Available")

# Test basic ERT functionality
data = pg.DataContainerERT()
print(f"✓ DataContainerERT: {type(data)}")
print("\nPyGimli is ready for production use!")
PYEOF
```

**Expected Output:**
```
✓ PyGimli version: 1.5.4
✓ PyGimli path: /home/user/miniconda3/envs/bert/lib/python3.11/site-packages/pygimli/__init__.py
✓ ERT module: Available
✓ DataContainerERT: <class 'pygimli.core._pygimli_.DataContainerERT'>

PyGimli is ready for production use!
```

### Step 3.2: Test Backend Server

```bash
# Start backend server
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

**In another terminal, test the versions endpoint:**
```bash
curl http://localhost:8000/api/versions | jq
```

**Look for:**
```json
{
  "python": "/home/user/miniconda3/envs/bert/bin/python",
  "pygimli": "1.5.4",
  "pygimli:available": true,
  "pandas": "2.2.0"
}
```

✅ **If `"pygimli:available": true`** - Real PyGimli is active!  
❌ **If `"pygimli:available": false`** - Still using mock (check conda env)

---

## Part 4: Frontend Deployment

### Option A: Serve Pre-built Frontend (Recommended)

If you have a `frontend/build/` directory:

```bash
# Install serve globally
npm install -g serve

# Serve frontend
cd frontend/build
serve -s . -p 3000
```

### Option B: Build Frontend from Source

```bash
cd frontend

# Install dependencies
npm install
# OR
yarn install

# Build for production
npm run build
# OR
yarn build

# Serve
serve -s build -p 3000
```

### Option C: Use Nginx (Production)

**Install Nginx:**
```bash
# Ubuntu/Debian
sudo apt-get install nginx -y

# Amazon Linux
sudo yum install nginx -y
```

**Configure Nginx:**
```bash
sudo nano /etc/nginx/sites-available/bert-imager
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or EC2 IP

    # Frontend
    location / {
        root /path/to/bert-imager/frontend/build;
        try_files $uri /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend results
    location /results {
        proxy_pass http://localhost:8000;
    }
}
```

**Enable and start:**
```bash
sudo ln -s /etc/nginx/sites-available/bert-imager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Part 5: Production Deployment with PM2 (Recommended)

### Step 5.1: Install PM2

```bash
npm install -g pm2
```

### Step 5.2: Create PM2 Ecosystem File

```bash
cd /path/to/bert-imager
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'bert-backend',
      cwd: './backend',
      script: '/home/user/miniconda3/envs/bert/bin/uvicorn',
      args: 'server:app --host 0.0.0.0 --port 8000',
      interpreter: '/home/user/miniconda3/envs/bert/bin/python',
      env: {
        CONDA_DEFAULT_ENV: 'bert',
        PATH: '/home/user/miniconda3/envs/bert/bin:' + process.env.PATH
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
EOF
```

**Update paths** to match your system.

### Step 5.3: Start with PM2

```bash
# Start backend
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs bert-backend

# Save PM2 process list
pm2 save

# Enable PM2 startup on boot
pm2 startup
# Follow the instructions printed
```

---

## Part 6: Testing with Real Data

### Step 6.1: Upload Test STG File

Using your browser or curl:

```bash
# Upload a real STG file
curl -X POST http://localhost:8000/api/import/stg \
  -F "file=@/path/to/your/data.stg"
```

**Response:**
```json
{
  "file_id": "stg-abc123...",
  "kind": "stg",
  "n_readings": 424,
  "metadata": {
    "importer": "agi-stg-coords",
    "has_k": true,
    "has_rhoa": true
  }
}
```

### Step 6.2: Run Real BERT Inversion

```bash
# Get file_id from upload response
FILE_ID="stg-abc123..."

# Run inversion
curl "http://localhost:8000/api/ert/invert/${FILE_ID}?spacing=1.0&lam=20&maxIter=20"
```

**With real PyGimli, you should see:**
- Different chi-squared values per dataset
- Unique mesh geometries based on electrode positions
- Geologically plausible resistivity distributions

### Step 6.3: Verify Plots

```bash
# Access via browser
http://localhost:3000

# Or check BERT plots directly
curl "http://localhost:8000/api/bert/plots/{job_id}/resistivity_model"
```

**Key Differences with Real PyGimli:**
- ✅ Plots reflect actual data characteristics
- ✅ Resistivity values vary realistically
- ✅ Mesh adapts to electrode spacing
- ✅ Convergence metrics are meaningful

---

## Part 7: AWS EC2 Specific Setup

### Step 7.1: Security Group Configuration

In AWS Console, configure Security Group:
- **Inbound Rules:**
  - Port 22 (SSH) - Your IP only
  - Port 80 (HTTP) - 0.0.0.0/0
  - Port 443 (HTTPS) - 0.0.0.0/0 (if using SSL)
  - Port 8000 (Backend) - Only if testing directly

### Step 7.2: Elastic IP (Optional)

Assign an Elastic IP to your EC2 instance for a static IP address.

### Step 7.3: Domain Setup (Optional)

1. Point your domain DNS to EC2 Elastic IP
2. Install SSL certificate:

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

---

## Part 8: Monitoring & Maintenance

### Check Application Health

```bash
# Backend status
curl http://localhost:8000/api/versions

# PM2 status
pm2 status

# View logs
pm2 logs bert-backend --lines 50

# Monitor resources
pm2 monit
```

### Update Application

```bash
# Pull latest changes
cd /path/to/bert-imager
git pull origin main

# Restart backend
pm2 restart bert-backend

# Rebuild frontend if needed
cd frontend
npm run build
```

---

## Troubleshooting

### PyGimli Not Found

```bash
# Verify conda environment
conda activate bert
which python
python -c "import pygimli; print(pygimli.__file__)"

# If still issues, reinstall
conda install -c conda-forge pygimli --force-reinstall
```

### Backend Not Starting

```bash
# Check logs
pm2 logs bert-backend

# Check Python path in ecosystem.config.js
which python  # Should be conda env python
```

### CORS Errors

Update `backend/.env`:
```bash
CORS_ORIGINS=http://your-frontend-domain,http://your-ec2-ip
```

Restart backend:
```bash
pm2 restart bert-backend
```

---

## Quick Start Summary

```bash
# 1. Install Conda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b
source ~/.bashrc

# 2. Create environment & install PyGimli
conda create -n bert python=3.11 -y
conda activate bert
conda install -c conda-forge pygimli -y

# 3. Deploy application
cd bert-imager/backend
pip install -r requirements.txt

# 4. Start backend
uvicorn server:app --host 0.0.0.0 --port 8000

# 5. Access application
# http://localhost:3000 (frontend)
# http://localhost:8000/api/versions (backend)
```

---

## Production Checklist

- [ ] Conda environment created with Python 3.11
- [ ] PyGimli installed and verified
- [ ] Backend dependencies installed
- [ ] Environment variables configured
- [ ] Backend server starts successfully
- [ ] `/api/versions` shows `"pygimli:available": true`
- [ ] Frontend built and served
- [ ] Test upload with real STG file
- [ ] Run inversion and verify unique plots
- [ ] PM2 or systemd service configured
- [ ] Nginx configured (if using)
- [ ] SSL certificate installed (if production)
- [ ] Security group configured (if AWS)
- [ ] Monitoring setup (PM2/CloudWatch)

---

## Support

If you encounter issues:
1. Check logs: `pm2 logs bert-backend`
2. Verify PyGimli: `python -c "import pygimli; print(pygimli.__version__)"`
3. Test backend: `curl http://localhost:8000/api/versions`
4. Review this guide's Troubleshooting section

---

**Your application is now ready for production use with real PyGimli!** 🚀
