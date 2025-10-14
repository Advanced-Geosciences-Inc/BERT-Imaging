# Transfer BERT 2D Imager to Your Windows PC

## 🎯 Goal
Get the application from Emergent to your Windows 11 PC for deployment with real PyGimli.

---

## Method 1: Download from Emergent (Recommended)

### Step 1: Use Emergent's Download Feature

If Emergent provides a download/export option:
1. Navigate to the file browser
2. Select the `/app` folder
3. Download as ZIP or use their export feature

### Step 2: Extract on Windows

1. Save downloaded file to: `C:\Users\YourUsername\Downloads\`
2. Right-click → Extract All
3. Move extracted folder to: `C:\Users\YourUsername\bert-imager\`

---

## Method 2: Manual File Collection

### Files/Folders You Need

Copy these from the Emergent environment:

```
📁 backend/
├── 📁 app/
│   ├── __init__.py
│   ├── bert_import.py          ← Real PyGimli parser
│   ├── bert_native.py          ← BERT integration
│   ├── bert_runner.py          ← Real PyGimli inversion
│   ├── config.py
│   ├── models.py
│   ├── stg_parser.py           ← STG file parser
│   ├── storage.py
│   └── urf_parser.py
├── server.py                   ← Main FastAPI app
├── requirements.txt            ← Python dependencies
├── mock_pygimli.py            ← Mock (not needed for Windows)
└── .env.example               ← Environment template

📁 frontend/
├── 📁 public/
├── 📁 src/
│   ├── 📁 components/
│   │   ├── BertInterface.jsx
│   │   ├── FileManager.jsx
│   │   ├── InversionInterface.jsx
│   │   ├── QAQCInterface.jsx
│   │   └── 📁 ui/
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── package.json               ← Node dependencies
├── tailwind.config.js
├── postcss.config.js
└── .env.example              ← Environment template

📄 Documentation/
├── WINDOWS_DEPLOYMENT.md      ← Your deployment guide
├── DEPLOYMENT.md              ← General deployment guide
├── QUICK_DEPLOY.md           ← Quick reference
└── README.md                 ← Project overview
```

### Essential Files Only (Minimum Transfer)

If transferring files individually:

**Backend (Must Have):**
- `backend/app/*.py` (all files)
- `backend/server.py`
- `backend/requirements.txt`

**Frontend (Must Have):**
- `frontend/src/` (entire folder)
- `frontend/public/` (entire folder)
- `frontend/package.json`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`

**Documentation:**
- `WINDOWS_DEPLOYMENT.md`
- `DEPLOYMENT.md`

---

## Method 3: Create Package Archive

### Using Emergent's Terminal

If you have terminal access in Emergent:

```bash
# Navigate to app directory
cd /app

# Create package (excluding unnecessary files)
tar -czf bert-imager-package.tar.gz \
  --exclude='node_modules' \
  --exclude='build' \
  --exclude='dist' \
  --exclude='*.pyc' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='data/*' \
  --exclude='results/*' \
  --exclude='bert_jobs/*' \
  backend/ frontend/ *.md

# Download bert-imager-package.tar.gz to your PC
```

**On Windows, extract using:**
- 7-Zip (https://www.7-zip.org/)
- WinRAR
- Built-in Windows extraction (may not support .tar.gz)

---

## Method 4: Git Repository (If Available)

If this project is in a Git repository:

### Step 1: Push to GitHub (from Emergent)

```bash
cd /app
git init
git add .
git commit -m "BERT 2D Imager - Production Ready"
git remote add origin https://github.com/yourusername/bert-imager.git
git push -u origin main
```

### Step 2: Clone on Windows

```powershell
# Open Git Bash or PowerShell
cd C:\Users\YourUsername\
git clone https://github.com/yourusername/bert-imager.git
```

---

## Verify Transfer

After transferring files to Windows, verify structure:

```
C:\Users\YourUsername\bert-imager\
├── backend\
│   ├── app\
│   │   ├── bert_import.py
│   │   ├── bert_native.py
│   │   ├── bert_runner.py
│   │   └── ... (other Python files)
│   ├── server.py
│   └── requirements.txt
├── frontend\
│   ├── src\
│   ├── public\
│   └── package.json
└── WINDOWS_DEPLOYMENT.md
```

**Quick Check:**
```powershell
cd C:\Users\YourUsername\bert-imager
dir backend
dir frontend
type WINDOWS_DEPLOYMENT.md
```

---

## What NOT to Transfer (Optional Files)

These files are specific to Emergent and not needed on Windows:

- ❌ `node_modules/` (will be regenerated)
- ❌ `backend/data/*` (test data, regenerate)
- ❌ `backend/results/*` (regenerate)
- ❌ `backend/bert_jobs/*` (regenerate)
- ❌ `.git/` (unless using Git)
- ❌ `__pycache__/` (Python cache)
- ❌ `.pytest_cache/` (test cache)
- ❌ `build/` or `dist/` (build artifacts)

---

## After Transfer: Next Steps

1. ✅ Verify all files transferred correctly
2. ✅ Open `WINDOWS_DEPLOYMENT.md`
3. ✅ Follow deployment guide from Part 2 onwards
4. ✅ Create conda environment
5. ✅ Install PyGimli
6. ✅ Start development!

---

## Troubleshooting Transfer

### Issue: File permissions

**Windows may block files downloaded from internet**

**Fix:**
1. Right-click the folder
2. Properties → Security
3. Ensure your user has Full Control

### Issue: Line endings (LF vs CRLF)

**Python/JavaScript files may have Unix line endings**

**Fix:**
VSCodium will automatically detect and handle this.

Or configure Git:
```powershell
git config --global core.autocrlf true
```

### Issue: Missing files

**Check for hidden files**

**Fix:**
In File Explorer:
1. View tab
2. Check "Hidden items"

---

## Quick Start After Transfer

Once files are on your Windows PC:

```powershell
# 1. Open Anaconda Prompt
conda create -n bert python=3.11 -y
conda activate bert
conda install -c conda-forge pygimli -y

# 2. Navigate to project
cd C:\Users\YourUsername\bert-imager\backend

# 3. Install dependencies
pip install -r requirements.txt

# 4. Test PyGimli
python -c "import pygimli as pg; print(f'PyGimli {pg.__version__} ready!')"

# 5. Start backend
uvicorn server:app --host 127.0.0.1 --port 8000 --reload

# 6. Open new terminal for frontend
cd ..\frontend
npm install
npm start
```

Browser opens to: `http://localhost:3000`

**Upload your real STG files and see accurate results!** 🚀

---

## Need Help?

Refer to:
1. **WINDOWS_DEPLOYMENT.md** - Complete Windows setup guide
2. **DEPLOYMENT.md** - General deployment guide
3. **QUICK_DEPLOY.md** - Quick reference commands

**You're ready to continue development on Windows with real PyGimli!**
