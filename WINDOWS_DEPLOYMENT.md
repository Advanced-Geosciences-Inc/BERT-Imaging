# BERT 2D Imager - Windows 11 Deployment Guide

## Prerequisites ✅

You already have:
- ✅ Windows 11
- ✅ Conda installed
- ✅ VSCodium

Additional requirements:
- Git for Windows (optional, for version control)
- Node.js 18+ (for frontend building)

---

## Part 1: Download Application Package

### Option A: Download from Emergent

1. **Use the Emergent interface** to download these files:
   - `/app/backend/` folder
   - `/app/frontend/` folder
   - `/app/DEPLOYMENT.md`
   - `/app/WINDOWS_DEPLOYMENT.md` (this file)
   - `/app/QUICK_DEPLOY.md`

2. Save to: `C:\Users\YourUsername\bert-imager\`

### Option B: Manual File Transfer

Download and extract the application package that will be created.

---

## Part 2: Setup Conda Environment

### Step 1: Open Anaconda Prompt (or PowerShell with conda)

Search for "Anaconda Prompt" in Windows Start menu.

### Step 2: Create Environment

```powershell
# Create conda environment with Python 3.11
conda create -n bert python=3.11 -y

# Activate environment
conda activate bert
```

### Step 3: Install PyGimli

```powershell
# Install PyGimli from conda-forge
conda install -c conda-forge pygimli -y

# This may take 5-10 minutes - PyGimli has many dependencies
```

**Expected output:**
```
Collecting package metadata (current_repodata.json): done
Solving environment: done
...
Executing transaction: done
```

### Step 4: Verify PyGimli Installation

```powershell
python -c "import pygimli as pg; print(f'PyGimli {pg.__version__} installed successfully!')"
```

**Expected output:**
```
PyGimli 1.5.4 installed successfully!
```

✅ **If you see this, PyGimli is ready!**

---

## Part 3: Install Backend Dependencies

### Step 1: Navigate to Backend Directory

```powershell
cd C:\Users\YourUsername\bert-imager\backend
```

### Step 2: Install Python Packages

```powershell
# Ensure bert environment is active
conda activate bert

# Install requirements
pip install -r requirements.txt
```

### Step 3: Configure Environment

Create `.env` file in `backend\` directory:

```powershell
# Using notepad
notepad .env
```

Add this content:
```env
# MongoDB (optional - comment out if not using)
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=bert_imager

# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Directories (will be created automatically)
DATA_DIR=./data
RESULTS_DIR=./results
BERT_JOBS_DIR=./bert_jobs
```

Save and close.

---

## Part 4: Open Project in VSCodium

### Step 1: Launch VSCodium

Open VSCodium and select: **File → Open Folder**

Navigate to: `C:\Users\YourUsername\bert-imager`

### Step 2: Install Recommended Extensions

Install these VSCodium extensions:
- **Python** (ms-python.python)
- **Pylance** (ms-python.vscode-pylance)
- **ES7+ React/Redux/React-Native snippets**

### Step 3: Select Python Interpreter

1. Press `Ctrl+Shift+P`
2. Type: "Python: Select Interpreter"
3. Choose: `Python 3.11.x ('bert')` (your conda environment)

---

## Part 5: Test Backend

### Step 1: Open Integrated Terminal in VSCodium

**Terminal → New Terminal** (or press `` Ctrl+` ``)

### Step 2: Activate Conda Environment

```powershell
conda activate bert
```

### Step 3: Navigate to Backend

```powershell
cd backend
```

### Step 4: Start Backend Server

```powershell
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using WatchFiles
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
Using mock PyGimli for development  ← Should say "Using real PyGimli" with conda!
INFO:     Application startup complete.
```

### Step 5: Verify PyGimli Status

Open another terminal (or browser) and test:

**PowerShell/CMD:**
```powershell
curl http://127.0.0.1:8000/api/versions
```

**Or open browser:**
```
http://127.0.0.1:8000/api/versions
```

**Look for:**
```json
{
  "python": "C:\\Users\\YourUsername\\miniconda3\\envs\\bert\\python.exe",
  "pygimli": "1.5.4",
  "pygimli:available": true,  ← This should be TRUE!
  "pandas": "2.2.0"
}
```

✅ **If `"pygimli:available": true` → Real PyGimli is working!**

---

## Part 6: Setup Frontend

### Step 1: Install Node.js (if not installed)

Download from: https://nodejs.org/ (LTS version)

Verify installation:
```powershell
node --version
npm --version
```

### Step 2: Install Frontend Dependencies

Open new terminal in VSCodium:

```powershell
cd frontend
npm install
```

### Step 3: Configure Frontend Environment

Create `frontend\.env` file:

```env
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
```

### Step 4: Start Frontend Development Server

```powershell
npm start
```

**Expected output:**
```
Compiled successfully!

You can now view bert-imager in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.1.x:3000
```

### Step 5: Open Application

Browser should automatically open: `http://localhost:3000`

If not, manually navigate to: `http://localhost:3000`

---

## Part 7: Test with Real Data

### Step 1: Upload STG File

1. Click **File I/O** tab
2. Click upload area or drag STG file
3. Select your Amistad_trial1.stg or other test file

### Step 2: Run Inversion

1. Select uploaded file (it should appear in the list)
2. Click **BERT Native** tab
3. Configure parameters:
   - Spacing: 1.0 (adjust based on your survey)
   - Lambda: 20 (regularization)
   - Max Iterations: 20
4. Click **Run Inversion**

### Step 3: Verify Real Results

**With real PyGimli, you should see:**
- ✅ Different plots for different STG files
- ✅ Unique resistivity patterns based on data
- ✅ Realistic depth profiles
- ✅ Meaningful chi-squared values
- ✅ Proper mesh adaptation to electrodes

**Not like mock (all plots looked similar)!**

---

## Part 8: VSCodium Development Workflow

### Recommended VSCodium Layout

```
├── Explorer (Left Sidebar)
│   ├── backend/
│   │   ├── app/
│   │   │   ├── bert_runner.py
│   │   │   ├── bert_import.py
│   │   │   └── stg_parser.py
│   │   └── server.py
│   └── frontend/
│       └── src/
├── Terminal (Bottom Panel)
│   ├── Terminal 1: Backend (conda activate bert)
│   └── Terminal 2: Frontend (npm start)
└── Editor (Center)
```

### Running Both Services

**Terminal 1 (Backend):**
```powershell
conda activate bert
cd backend
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm start
```

**Keep both running** - they will auto-reload on file changes!

---

## Part 9: Common Windows Issues & Fixes

### Issue 1: "conda: command not found"

**Fix:**
```powershell
# Add conda to PATH or use Anaconda Prompt instead of regular PowerShell
# Or reinitialize conda:
conda init powershell
# Restart PowerShell
```

### Issue 2: PowerShell Execution Policy

**Error:** "execution of scripts is disabled on this system"

**Fix:**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue 3: Port Already in Use

**Error:** "Address already in use" (port 8000 or 3000)

**Fix:**
```powershell
# Find process using port
netstat -ano | findstr :8000

# Kill process (use PID from above)
taskkill /PID <process_id> /F

# Or use different port
uvicorn server:app --host 127.0.0.1 --port 8001 --reload
```

### Issue 4: CORS Errors

**Fix:** Update `backend\.env`:
```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000
```

Restart backend.

### Issue 5: PyGimli Import Error

**Error:** "No module named 'pygimli'"

**Fix:**
```powershell
# Verify conda environment is active
conda activate bert

# Check which python
where python
# Should show: C:\Users\...\miniconda3\envs\bert\python.exe

# Reinstall PyGimli
conda install -c conda-forge pygimli --force-reinstall
```

---

## Part 10: Development Tips

### Hot Reload

Both backend and frontend support hot reload:
- **Backend:** Changes to `.py` files auto-reload (with `--reload` flag)
- **Frontend:** Changes to React files auto-reload

### Debugging in VSCodium

Create `.vscode\launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "server:app",
        "--reload",
        "--host",
        "127.0.0.1",
        "--port",
        "8000"
      ],
      "jinja": true,
      "cwd": "${workspaceFolder}/backend",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/backend"
      }
    }
  ]
}
```

Press `F5` to start debugging!

### View Backend Logs

Logs appear in the terminal where `uvicorn` is running.

### Frontend Console

Press `F12` in browser to see React console logs and errors.

---

## Quick Reference Commands

### Backend Commands
```powershell
# Start backend
conda activate bert
cd backend
uvicorn server:app --host 127.0.0.1 --port 8000 --reload

# Test backend
curl http://127.0.0.1:8000/api/versions

# Install new package
pip install package-name
pip freeze > requirements.txt
```

### Frontend Commands
```powershell
# Start frontend
cd frontend
npm start

# Install new package
npm install package-name

# Build for production
npm run build
```

### Conda Commands
```powershell
# Activate environment
conda activate bert

# Deactivate
conda deactivate

# List environments
conda env list

# List installed packages
conda list

# Update package
conda update package-name
```

---

## Verification Checklist

Before starting development, verify:

- [ ] Conda environment created (`bert`)
- [ ] PyGimli installed and verified
- [ ] Backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Backend `.env` configured
- [ ] Backend starts successfully on port 8000
- [ ] `/api/versions` shows `"pygimli:available": true`
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Frontend `.env` configured
- [ ] Frontend starts on port 3000
- [ ] Can access application in browser
- [ ] Can upload STG file
- [ ] Can run inversion
- [ ] Plots show unique results per file (not all similar)

---

## Next Steps After Setup

1. **Test with your real survey data**
   - Amistad_trial1.stg
   - IP survey files
   - Verify inversions are scientifically accurate

2. **Customize parameters**
   - Adjust spacing based on electrode geometry
   - Tune lambda for regularization
   - Experiment with mesh quality

3. **Develop additional features** (if needed)
   - Export functionality
   - Advanced QA/QC filters
   - Custom plot options

4. **Prepare for production deployment**
   - When ready, deploy to lab server or AWS
   - Use same conda environment approach

---

## Support

**If you encounter issues:**

1. Check the terminal output for error messages
2. Verify conda environment is active (`conda activate bert`)
3. Check `/api/versions` endpoint
4. Review this guide's "Common Windows Issues" section
5. Check backend logs in uvicorn terminal

**Common success indicators:**
- Backend shows: "INFO: Application startup complete"
- `/api/versions` shows: `"pygimli:available": true`
- Frontend shows: "Compiled successfully!"
- Browser opens to working application

---

**You're ready to develop with real PyGimli on Windows! 🚀**
