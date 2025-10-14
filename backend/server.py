# Combined server.py - merging BERT backend with existing FastAPI setup
from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
import hashlib
import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import BERT modules
try:
    from app.stg_parser import read_srt_or_stg_normalized
    from app.bert_import import import_with_pybert_to_df
except Exception as e:
    print(f"Warning: Could not import BERT modules: {e}")
    read_srt_or_stg_normalized = None
    import_with_pybert_to_df = None

# External geophysics libs
try:
    import pygimli as pg
    from pygimli.physics import ert
except Exception:
    try:
        import sys
        sys.path.append('/app/backend')
        import mock_pygimli as pg
        ert = pg.physics.ert
        print("Using mock PyGimli for development")
    except Exception:
        pg = None
        ert = None

# Setup directories
DATA_DIR = ROOT_DIR / "data"
RESULTS_DIR = ROOT_DIR / "results"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB connection (keeping existing)
mongo_url = os.environ.get('MONGO_URL')
client = None
db = None

if mongo_url:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'bert_imager')]

# Create the main app
app = FastAPI(title="BERT Imager Backend")

# Create API router
api_router = APIRouter(prefix="/api")

# Serve static files for results
app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

# Helper functions
def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()

def _stg_file_id(raw_bytes: bytes) -> str:
    return f"stg-{_sha1(raw_bytes)}"

def _results_dir_for(file_id: str) -> Path:
    return RESULTS_DIR / file_id / "inversion"

def _public(path: Path) -> str:
    try:
        rel = path.relative_to(RESULTS_DIR)
    except ValueError:
        return str(path)
    return "/" + str(Path("results") / rel).replace("\\", "/")

# Pydantic models (BERT models)
class UploadResponse(BaseModel):
    file_id: str
    kind: str
    n_readings: int
    metadata: Dict[str, Any]
    normalized_csv: str

class InspectResponse(BaseModel):
    file_id: str
    n_readings: int
    n_electrodes: int
    indexing: str
    a_min: Optional[int]
    a_max: Optional[int]
    b_min: Optional[int]
    b_max: Optional[int]
    m_min: Optional[int]
    m_max: Optional[int]
    n_min: Optional[int]
    n_max: Optional[int]
    current_min: Optional[float]
    current_max: Optional[float]
    dv_min: Optional[float]
    dv_max: Optional[float]

class SchemeSummary(BaseModel):
    file_id: str
    n_electrodes: int
    spacing: float
    n_data: int
    indexing_correction_applied: bool
    a_min: int
    a_max: int
    b_min: int
    b_max: int
    m_min: int
    m_max: int
    n_min: int
    n_max: int

class InvertSummary(BaseModel):
    file_id: str
    spacing: float
    lam: float
    chi2: float
    mesh_cells: int
    mesh_nodes: int
    files: Dict[str, str]

# Original models (keeping for compatibility)
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# BERT API endpoints
@api_router.get("/versions")
def versions() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    import sys
    out["python"] = sys.executable
    
    if pg is not None:
        out["pygimli"] = getattr(pg, '__version__', 'mock-version')
        out["pygimli:available"] = True
    else:
        out["pygimli"] = "not available"
        out["pygimli:available"] = False
    
    try:
        import pandas as _pd
        out["pandas"] = _pd.__version__
    except Exception:
        pass
    
    return out

@api_router.post("/import/stg", response_model=UploadResponse)
def import_stg(file: UploadFile = File(...)) -> UploadResponse:
    raw = file.file.read()
    file_id = _stg_file_id(raw)
    
    # Preserve the original extension so the parser knows it's an STG file
    original_ext = Path(file.filename).suffix.lower() if file.filename else ".stg"
    if original_ext not in [".stg", ".srt"]:
        original_ext = ".stg"  # Default to .stg
        
    raw_path = DATA_DIR / f"{file_id}{original_ext}"
    raw_path.write_bytes(raw)

    df: Optional[pd.DataFrame] = None
    meta: Dict[str, Any] = {}
    errors: List[str] = []

    # Try pyBERT importer first
    if import_with_pybert_to_df is not None:
        try:
            df = import_with_pybert_to_df(raw_path)
        except Exception as e:
            errors.append(f"pyBERT failed: {str(e)}")

    # Fallback to STG parser
    if df is None and read_srt_or_stg_normalized is not None:
        try:
            df, meta2 = read_srt_or_stg_normalized(raw_path)
            meta.update(meta2 or {})
            meta.setdefault("importer", "agi-stg-coords")
        except Exception as e:
            errors.append(f"STG parser failed: {str(e)}")

    if df is None:
        raise HTTPException(
            status_code=400,
            detail="All import methods failed: " + " | ".join(errors)
        )

    # Normalize ABMN columns
    def _norm(s: str) -> str:
        return s.strip().upper().replace(" ", "").replace(".", "").replace("-", "").replace("_", "")

    ABMN_SYNONYMS = {
        "A": {"A", "ELECA", "ELECTRODEA", "TX1", "C1", "I1", "SA", "SANDA", "S_A"},
        "B": {"B", "ELECB", "ELECTRODEB", "TX2", "C2", "I2", "SB", "SANDB", "S_B"},
        "M": {"M", "ELECM", "ELECTRODEM", "RX1", "P1", "V1", "PA"},
        "N": {"N", "ELECN", "ELECTRODEN", "RX2", "P2", "V2", "PB"},
    }

    norm_by_original = {_norm(c): c for c in df.columns}
    rename_map = {}
    
    for target, aliases in ABMN_SYNONYMS.items():
        found = None
        for alias in aliases:
            if alias in norm_by_original:
                found = norm_by_original[alias]
                break
        if found is None and target in norm_by_original:
            found = norm_by_original[target]
        if found is not None:
            rename_map[found] = target
    
    if rename_map:
        df = df.rename(columns=rename_map)

    # Ensure required columns
    for col in ["A", "B", "M", "N"]:
        if col not in df.columns:
            raise HTTPException(400, f"Missing column {col}")

    if "k" not in df.columns:
        df["k"] = np.nan
    
    # Handle different voltage column formats
    if "dV" not in df.columns:
        if {"VM", "VN"}.issubset(df.columns):
            df["dV"] = df["VM"] - df["VN"]
        elif "V" in df.columns:
            df["dV"] = df["V"]
        elif "VOLTAGE" in df.columns:
            df["dV"] = df["VOLTAGE"]
    
    # Handle different current column formats
    if "I" not in df.columns:
        if "CURRENT" in df.columns:
            df["I"] = df["CURRENT"]
        elif "CURR" in df.columns:
            df["I"] = df["CURR"]
    
    if "rhoa" not in df.columns:
        if {"dV", "I"}.issubset(df.columns):
            # Compute geometric factor k if not provided
            if df["k"].isna().all():
                # Simple approximation for uniform electrode spacing
                # This is a basic k-factor approximation - in real use you'd compute proper geometric factors
                df["k"] = 2.0 * np.pi  # Default approximation
            df["rhoa"] = (df["dV"] / df["I"]) * df["k"]
        else:
            missing_cols = []
            if "dV" not in df.columns:
                missing_cols.append("dV (or VM/VN)")
            if "I" not in df.columns:
                missing_cols.append("I (or CURRENT)")
            raise HTTPException(400, f"Missing rhoa and cannot compute it. Missing: {missing_cols}")
    
    if "err" not in df.columns:
        df["err"] = 0.03

    n_readings = int(df.shape[0])
    norm_csv = DATA_DIR / f"{file_id}.normalized.csv"
    df.to_csv(norm_csv, index=False)

    meta.update({
        "source": "stg",
        "n_readings": n_readings,
        "has_k": bool(pd.notna(df["k"]).any()),
        "has_rhoa": True,
        "has_err": True,
    })

    return UploadResponse(
        file_id=file_id,
        kind="stg",
        n_readings=n_readings,
        metadata=meta,
        normalized_csv=str(norm_csv),
    )

@api_router.get("/inspect/{file_id}", response_model=InspectResponse)
def inspect(file_id: str) -> InspectResponse:
    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"Normalized CSV not found for {file_id}")
    
    df = pd.read_csv(csv)
    
    def _opt(v):
        try:
            return float(v)
        except Exception:
            return None

    n_electrodes = int(max(df[["A", "B", "M", "N"]].values.max(), 0))
    
    return InspectResponse(
        file_id=file_id,
        n_readings=int(df.shape[0]),
        n_electrodes=n_electrodes,
        indexing="1-based",
        a_min=int(df["A"].min()) if len(df) else None,
        a_max=int(df["A"].max()) if len(df) else None,
        b_min=int(df["B"].min()) if len(df) else None,
        b_max=int(df["B"].max()) if len(df) else None,
        m_min=int(df["M"].min()) if len(df) else None,
        m_max=int(df["M"].max()) if len(df) else None,
        n_min=int(df["N"].min()) if len(df) else None,
        n_max=int(df["N"].max()) if len(df) else None,
        current_min=_opt(df["I"].min()) if "I" in df else None,
        current_max=_opt(df["I"].max()) if "I" in df else None,
        dv_min=_opt(df["dV"].min()) if "dV" in df else None,
        dv_max=_opt(df["dV"].max()) if "dV" in df else None,
    )

@api_router.get("/ert/scheme/{file_id}", response_model=SchemeSummary)
def ert_scheme(file_id: str, spacing: float = 1.0) -> SchemeSummary:
    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"Normalized CSV not found for {file_id}")
    
    df = pd.read_csv(csv)
    
    a_min, a_max = int(df["A"].min()), int(df["A"].max())
    b_min, b_max = int(df["B"].min()), int(df["B"].max())
    m_min, m_max = int(df["M"].min()), int(df["M"].max())
    n_min, n_max = int(df["N"].min()), int(df["N"].max())
    n_elec = int(max(a_max, b_max, m_max, n_max))

    return SchemeSummary(
        file_id=file_id,
        n_electrodes=n_elec,
        spacing=float(spacing),
        n_data=int(df.shape[0]),
        indexing_correction_applied=True,
        a_min=a_min, a_max=a_max,
        b_min=b_min, b_max=b_max,
        m_min=m_min, m_max=m_max,
        n_min=n_min, n_max=n_max,
    )

@api_router.get("/ert/invert/{file_id}", response_model=InvertSummary)
def ert_invert(
    file_id: str, 
    spacing: float = 1.0, 
    lam: float = 20.0, 
    quality: int = 34, 
    maxIter: int = 20
) -> InvertSummary:
    if pg is None or ert is None:
        raise HTTPException(500, "PyGIMli/ERT not available in this environment")

    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"Normalized CSV not found for {file_id}")
    
    df = pd.read_csv(csv)

    # Build ERT data container
    n_elec = int(max(df[["A", "B", "M", "N"]].values.max(), 0))
    sensors = [pg.Pos(i * spacing, 0.0) for i in range(n_elec)]

    dc = pg.DataContainerERT()
    dc.createSensors(sensors)
    dc.resize(df.shape[0])
    
    for key in ["a", "b", "m", "n"]:
        dc.set(key, df[key.upper()].to_numpy(dtype=int) - 1)  # 0-based
    
    if "k" in df:
        dc.set("k", df["k"].to_numpy(float))
    if "rhoa" in df:
        dc.set("rhoa", df["rhoa"].to_numpy(float))
    
    err = df["err"].to_numpy(float) if "err" in df else np.full(df.shape[0], 0.03, dtype=float)
    err = np.clip(err, 1e-6, None)
    dc.set("err", err)

    # Run inversion
    mgr = ert.ERTManager(verbose=True)
    res = mgr.invert(data=dc, lam=lam, quality=quality, maxIter=maxIter, verbose=True)

    try:
        chi2 = float(mgr.inv.chi2())
    except Exception:
        chi2 = float(getattr(mgr, "chi2", np.nan))

    # Prepare output
    out_dir = _results_dir_for(file_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Export mesh nodes
    mesh = mgr.paraDomain
    nodes_rows = [{"id": i, "x": float(n.pos()[0]), "y": float(n.pos()[1])} for i, n in enumerate(mesh.nodes())]
    mesh_nodes_csv = out_dir / "mesh_nodes.csv"
    pd.DataFrame(nodes_rows).to_csv(mesh_nodes_csv, index=False)

    # Export triangles with resistivity values
    cell_rows: List[Dict[str, Any]] = []
    tri_rows: List[Dict[str, Any]] = []
    rho = np.asarray(res, dtype=float).copy()
    log10rho = np.log10(np.clip(rho, 1e-12, None))

    for cid, cell in enumerate(mesh.cells()):
        nids = [int(n.id()) for n in cell.nodes()]
        row = {"cell": cid}
        for j, nid in enumerate(nids):
            row[f"n{j+1}"] = nid
        cell_rows.append(row)

        if len(nids) == 3:
            p1, p2, p3 = [mesh.node(nid).pos() for nid in nids]
            tri_rows.append({
                "cell": cid,
                "x1": float(p1[0]), "y1": float(p1[1]),
                "x2": float(p2[0]), "y2": float(p2[1]), 
                "x3": float(p3[0]), "y3": float(p3[1]),
                "rho": float(rho[cid]),
                "log10rho": float(log10rho[cid]),
            })

    mesh_cells_csv = out_dir / "mesh_cells_connectivity.csv"
    pd.DataFrame(cell_rows).to_csv(mesh_cells_csv, index=False)

    triangles_csv = out_dir / "triangles.csv"
    pd.DataFrame(tri_rows).to_csv(triangles_csv, index=False)

    model_cells_csv = out_dir / "model_cells.csv"
    pd.DataFrame({"cell": np.arange(len(rho)), "rho": rho, "log10rho": log10rho}).to_csv(model_cells_csv, index=False)

    files = {
        "model_cells": _public(model_cells_csv),
        "mesh_nodes": _public(mesh_nodes_csv),
        "mesh_cells": _public(mesh_cells_csv),
        "triangles": _public(triangles_csv),
    }
    
    return InvertSummary(
        file_id=file_id,
        spacing=float(spacing),
        lam=float(lam),
        chi2=float(chi2),
        mesh_cells=int(mesh.cellCount()),
        mesh_nodes=int(mesh.nodeCount()),
        files=files,
    )

@api_router.get("/ert/results/{file_id}")
def ert_results(file_id: str) -> Dict[str, Any]:
    out_dir = _results_dir_for(file_id)
    files = {
        "model_cells": _public(out_dir / "model_cells.csv"),
        "mesh_nodes": _public(out_dir / "mesh_nodes.csv"),
        "mesh_cells": _public(out_dir / "mesh_cells_connectivity.csv"),
        "triangles": _public(out_dir / "triangles.csv"),
    }
    return {"file_id": file_id, "files": files}

@api_router.get("/data/{filename}")
def serve_data_file(filename: str):
    """Serve normalized CSV and other data files"""
    from fastapi import Response
    from fastapi.responses import FileResponse
    
    file_path = DATA_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {filename}")
    
    return FileResponse(
        path=str(file_path),
        media_type="text/csv" if filename.endswith('.csv') else "application/octet-stream",
        filename=filename
    )

# BERT Native Integration Endpoints
from app.bert_native import BertWorkflowManager, BertConfig, detect_survey_type, get_default_config

# Setup BERT work directory
BERT_DIR = ROOT_DIR / "bert_jobs"
BERT_DIR.mkdir(parents=True, exist_ok=True)
bert_manager = BertWorkflowManager(BERT_DIR)

class BertConfigRequest(BaseModel):
    file_id: str
    dimension: int = 2
    topography: bool = False
    paradx: float = 0.2
    para2dquality: float = 33.0
    lambda_reg: float = 20.0
    zweight: float = 0.3
    constraint: int = 1
    blocky_model: bool = False
    robust_data: bool = False

class BertInversionResult(BaseModel):
    success: bool
    job_id: str
    job_dir: str
    plots: Dict[str, str]
    output: str
    error: Optional[str]
    config: Dict[str, Any]

@api_router.get("/bert/survey-info/{file_id}")
def get_bert_survey_info(file_id: str):
    """Analyze STG file and suggest BERT configuration"""
    
    # Find the original STG file
    stg_files = list(DATA_DIR.glob(f"{file_id}.*"))
    stg_file = None
    
    for f in stg_files:
        if f.suffix.lower() in ['.stg', '.srt']:
            stg_file = f
            break
    
    if not stg_file:
        raise HTTPException(404, f"STG file not found for {file_id}")
    
    survey_info = detect_survey_type(stg_file)
    default_config = get_default_config(survey_info)
    
    return {
        "file_id": file_id,
        "survey_info": survey_info,
        "recommended_config": default_config.__dict__
    }

@api_router.post("/bert/run-inversion", response_model=BertInversionResult)
def run_bert_inversion(config_request: BertConfigRequest):
    """Run BERT inversion with specified configuration"""
    
    # Find the STG file
    file_id = config_request.file_id
    stg_files = list(DATA_DIR.glob(f"{file_id}.*"))
    stg_file = None
    
    for f in stg_files:
        if f.suffix.lower() in ['.stg', '.srt']:
            stg_file = f
            break
    
    if not stg_file:
        raise HTTPException(404, f"STG file not found for {file_id}")
    
    # Create BERT configuration
    bert_config = BertConfig(
        datafile=stg_file.name,
        dimension=config_request.dimension,
        topography=config_request.topography,
        paradx=config_request.paradx,
        para2dquality=config_request.para2dquality,
        lambda_reg=config_request.lambda_reg,
        zweight=config_request.zweight,
        constraint=config_request.constraint,
        blocky_model=config_request.blocky_model,
        robust_data=config_request.robust_data
    )
    
    try:
        # Run BERT inversion
        result = bert_manager.run_bert_inversion(stg_file, bert_config, file_id)
        
        job_id = Path(result["job_dir"]).name
        
        return BertInversionResult(
            success=result["success"],
            job_id=job_id,
            job_dir=result["job_dir"],
            plots=result["plots"],
            output=result["output"],
            error=result.get("error"),
            config=result["config"]
        )
        
    except Exception as e:
        return BertInversionResult(
            success=False,
            job_id="",
            job_dir="",
            plots={},
            output="",
            error=str(e),
            config=bert_config.__dict__
        )

@api_router.get("/bert/plots/{job_id}/{plot_type}")
def serve_bert_plot(job_id: str, plot_type: str):
    """Serve BERT-generated plot images"""
    from fastapi.responses import FileResponse
    
    job_dir = BERT_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(404, f"Job directory not found: {job_id}")
    
    # Look for plot files
    plot_patterns = {
        "resistivity": ["*resistivity*.png", "*result*.png", "*model*.png"],
        "resistivity_model": ["*resistivity*.png", "*result*.png", "*model*.png"],  # Add this mapping
        "pseudosection": ["*pseudosection*.png", "*data*.png", "*apparent*.png"],
        "misfit": ["*misfit*.png", "*fit*.png", "*error*.png"],
        "mesh": ["*mesh*.png", "*grid*.png"]
    }
    
    if plot_type not in plot_patterns:
        raise HTTPException(400, f"Invalid plot type: {plot_type}")
    
    plot_file = None
    for pattern in plot_patterns[plot_type]:
        matches = list(job_dir.glob(pattern))
        if matches:
            plot_file = matches[0]
            break
    
    if not plot_file:
        raise HTTPException(404, f"Plot not found: {plot_type}")
    
    return FileResponse(
        path=str(plot_file),
        media_type="image/png",
        filename=f"{job_id}_{plot_type}.png"
    )

# Original endpoints (keeping for compatibility)
@api_router.get("/")
async def root():
    return {"message": "BERT Imager Backend API"}

if db is not None:
    @api_router.post("/status", response_model=StatusCheck)
    async def create_status_check(input: StatusCheckCreate):
        status_dict = input.dict()
        status_obj = StatusCheck(**status_dict)
        _ = await db.status_checks.insert_one(status_obj.dict())
        return status_obj

    @api_router.get("/status", response_model=List[StatusCheck])
    async def get_status_checks():
        status_checks = await db.status_checks.find().to_list(1000)
        return [StatusCheck(**status_check) for status_check in status_checks]

# Include router
app.include_router(api_router)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()