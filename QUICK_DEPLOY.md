# BERT 2D Imager - Quick Deployment Guide

**For AWS EC2 or Local Server with Conda**

---

## 🚀 5-Minute Setup

### 1. Install Miniconda (if needed)
```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b
echo 'export PATH="$HOME/miniconda3/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2. Create Environment & Install PyGimli
```bash
conda create -n bert python=3.11 -y
conda activate bert
conda install -c conda-forge pygimli -y
```

### 3. Verify PyGimli
```bash
python -c "import pygimli as pg; print(f'PyGimli {pg.__version__} ✓')"
```

### 4. Deploy Backend
```bash
# Copy/clone your application files
cd /path/to/bert-imager/backend

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 5. Test Backend
```bash
# In another terminal
curl http://localhost:8000/api/versions | grep pygimli
```

**Look for:** `"pygimli:available": true` ✅

---

## 📋 Deployment Verification

### Backend Check
```bash
curl http://localhost:8000/api/versions
```
**Expected:** `"pygimli": "1.5.x"` and `"pygimli:available": true`

### Upload Test File
```bash
curl -X POST http://localhost:8000/api/import/stg \
  -F "file=@your_data.stg"
```

### Run Inversion
```bash
# Use file_id from upload
curl "http://localhost:8000/api/ert/invert/{file_id}?spacing=1.0&lam=20"
```

---

## 🔧 Production Setup (Optional)

### Install PM2
```bash
npm install -g pm2
```

### Start Backend with PM2
```bash
cd /path/to/bert-imager/backend
pm2 start "uvicorn server:app --host 0.0.0.0 --port 8000" \
  --name bert-backend \
  --interpreter /home/user/miniconda3/envs/bert/bin/python

pm2 save
pm2 startup  # Follow instructions
```

### Serve Frontend
```bash
cd /path/to/bert-imager/frontend
npm install -g serve
serve -s build -p 3000
```

---

## ✅ Success Indicators

**With Real PyGimli:**
- ✅ Different plots for different STG files
- ✅ Unique resistivity patterns per dataset
- ✅ Mesh adapts to electrode geometry
- ✅ Chi-squared values vary realistically
- ✅ Convergence is data-dependent

**With Mock PyGimli (development):**
- ⚠️ All plots look similar
- ⚠️ Random synthetic patterns
- ⚠️ Not scientifically accurate

---

## 🆘 Quick Troubleshooting

**PyGimli not found?**
```bash
conda activate bert
conda install -c conda-forge pygimli --force-reinstall
```

**Backend won't start?**
```bash
# Check conda environment
which python  # Should show conda env path
pm2 logs bert-backend
```

**CORS errors?**
Update `backend/.env`:
```
CORS_ORIGINS=http://your-domain.com
```

---

## 📚 Full Documentation

See `DEPLOYMENT.md` for:
- Complete step-by-step instructions
- AWS EC2 specific setup
- Nginx configuration
- SSL certificate setup
- Detailed troubleshooting

---

## 🎯 Next Steps

1. ✅ Deploy with conda + PyGimli
2. ✅ Upload your real STG files (Amistad, IP surveys)
3. ✅ Run inversions and verify results
4. ✅ Set up PM2 for production
5. ✅ Configure Nginx if needed

**Your BERT 2D Imager is ready for production! 🚀**
