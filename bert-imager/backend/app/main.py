# backend/app/main.py
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict, Optional, List

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Optional imports from local helpers (if present in this repo)
try:
    from .bert_import import import_with_pybert_to_df  # type: ignore
except Exception:  # pragma: no cover
    import_with_pybert_to_df = None  # type: ignore

try:
    from .stg_parser import read_srt_or_stg_normalized  # type: ignore
except Exception:  # pragma: no cover
    read_srt_or_stg_normalized = None  # type: ignore

# External geophysics libs
try:
    import pygimli as pg
    from pygimli.physics import ert
except Exception:
    pg = None  # type: ignore
    ert = None  # type: ignore

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR.parent / "data"
RESULTS_DIR = APP_DIR.parent / "results"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()

def _stg_file_id(raw_bytes: bytes) -> str:
    return f"stg-{_sha1(raw_bytes)}"

def _results_dir_for(file_id: str) -> Path:
    return RESULTS_DIR / file_id / "inversion"

def _public(path: Path) -> str:
    # Convert an absolute path into the /results/... URL that FastAPI serves
    try:
        rel = path.relative_to(RESULTS_DIR)
    except ValueError:
        return str(path)
    return "/" + str(Path("results") / rel).replace("\\\\", "/").replace("\\", "/")

# ---------- Pydantic models ----------
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


# ---------- FastAPI app ----------
app = FastAPI(title="BERT Imager Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Serve /results/* as static files
app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")


@app.get("/versions")
def versions() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    import sys

    out["python"] = sys.executable
    try:
        import pygimli as _pg

        out["pygimli"] = _pg.__version__
        out["pygimli:path"] = str(Path(_pg.__file__).resolve())
        from pygimli.physics import ert as _ert_mod  # noqa

        out["pygimli.physics.ert"] = "ok"
        out["pygimli.physics.ert:path"] = str(Path(_ert_mod.__file__).resolve())
    except Exception:
        out["pygimli"] = "not available"
    try:
        import pybert as _pb

        out["pybert"] = _pb.__version__
        out["pybert:path"] = str(Path(_pb.__file__).resolve())
        from pybert import importer as _imp  # noqa

        out["pybert.importer"] = "ok"
        out["pybert.importer:path"] = str(Path(_imp.__file__).resolve())
    except Exception:
        out["pybert"] = "not available"
    try:
        import fastapi as _fa

        out["fastapi"] = _fa.__version__
        out["fastapi:path"] = str(Path(_fa.__file__).resolve())
    except Exception:
        pass
    try:
        import pandas as _pd

        out["pandas"] = _pd.__version__
        out["pandas:path"] = str(Path(_pd.__file__).resolve())
    except Exception:
        pass
    return out


# ---------- Import STG/SRT ----------
@app.post("/api/import/stg", response_model=UploadResponse)
def import_stg(file: UploadFile = File(...)) -> UploadResponse:
    raw = file.file.read()
    file_id = _stg_file_id(raw)
    raw_path = DATA_DIR / f"{file_id}.upload"
    raw_path.write_bytes(raw)

    df: Optional[pd.DataFrame] = None
    meta: Dict[str, Any] = {}
    errors: List[str] = []

    # 1) pyBERT importer
    if import_with_pybert_to_df is not None:
        try:
            df = import_with_pybert_to_df(raw_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    # 2) Fallback STG/SRT text parser
    if df is None and read_srt_or_stg_normalized is not None:
        try:
            df, meta2 = read_srt_or_stg_normalized(raw_path)
            meta.update(meta2 or {})
            meta.setdefault("importer", "agi-stg-coords")
        except Exception as e:
            errors.append(f"fallback parse failed: {e!r}")

    if df is None:
        raise HTTPException(
            status_code=400,
            detail="pyBERT import failed and fallback parse failed: " + " | ".join(errors) or "unknown",
        )

    # --- BEGIN tolerant ABMN normalization ---
    # normalize header cases/spaces/punctuation
    def _norm(s: str) -> str:
        return (
            s.strip()
             .upper()
             .replace(" ", "")
             .replace(".", "")
             .replace("-", "")
             .replace("_", "")
        )

    # Map many common vendor aliases onto A/B/M/N
    ABMN_SYNONYMS = {
        "A": {"A", "ELECA", "ELECTRODEA", "TX1", "C1", "I1", "SA", "SANDA", "S_A"},
        "B": {"B", "ELECB", "ELECTRODEB", "TX2", "C2", "I2", "SB", "SANDB", "S_B"},
        "M": {"M", "ELECM", "ELECTRODEM", "RX1", "P1", "V1", "PA"},
        "N": {"N", "ELECN", "ELECTRODEN", "RX2", "P2", "V2", "PB"},
    }

    # Build a normalized view of columns once
    norm_by_original = {_norm(c): c for c in df.columns}

    # If A/B/M/N missing, try to find them by synonyms
    rename_map = {}
    for target, aliases in ABMN_SYNONYMS.items():
        found = None
        for alias in aliases:
            if alias in norm_by_original:
                found = norm_by_original[alias]
                break
        if found is None:
            # also accept single-letter lowercase names like 'a','b','m','n'
            if target in norm_by_original:
                found = norm_by_original[target]
        if found is not None:
            rename_map[found] = target
    if rename_map:
        df = df.rename(columns=rename_map)

    # last chance: promote lower-case single letters
    if not {"A", "B", "M", "N"}.issubset(df.columns):
        lower_map = {}
        for k in ("a", "b", "m", "n"):
            if k in df.columns:
                lower_map[k] = k.upper()
        if lower_map:
            df = df.rename(columns=lower_map)
    # --- END tolerant ABMN normalization ---

    # Expect A,B,M,N,k,rhoa,err
    for col in ["A", "B", "M", "N"]:
        if col not in df.columns:
            raise HTTPException(400, f"missing column {col}")
    if "k" not in df.columns:
        df["k"] = np.nan
    if "rhoa" not in df.columns:
        if {"dV", "I"}.issubset(df.columns):
            df["rhoa"] = (df["dV"] / df["I"]) * df["k"]
        else:
            raise HTTPException(400, "missing rhoa (and no dV/I to compute it)")
    if "err" not in df.columns:
        df["err"] = 0.03  # default 3%

    n_readings = int(df.shape[0])
    norm_csv = DATA_DIR / f"{file_id}.normalized.csv"
    df.to_csv(norm_csv, index=False)

    meta.update(
        {
            "source": "stg",
            "n_readings": n_readings,
            "has_k": bool(pd.notna(df["k"]).any()),
            "has_rhoa": True,
            "has_err": True,
            "has_ip": bool(any(c.startswith("ip") for c in df.columns)),
            "ip_mode": "TD" if any(c.startswith("ip") for c in df.columns) else None,
            "ip_n_readings": n_readings if any(c.startswith("ip") for c in df.columns) else 0,
            "ip_n_gates_max": max([int(c.split("_")[1]) for c in df.columns if c.startswith("ip")] + [0]),
            "ip_gate_ms": meta.get("ip_gate_ms", 0),
        }
    )

    return UploadResponse(
        file_id=file_id,
        kind="stg",
        n_readings=n_readings,
        metadata=meta,
        normalized_csv=str(norm_csv),
    )


# ---------- Inspect ----------
@app.get("/api/inspect/{file_id}", response_model=InspectResponse)
def inspect(file_id: str) -> InspectResponse:
    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"normalized CSV not found for {file_id}")
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


# ---------- ERT scheme ----------
@app.get("/api/ert/scheme/{file_id}", response_model=SchemeSummary)
def ert_scheme(file_id: str, spacing: float = 1.0) -> SchemeSummary:
    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"normalized CSV not found for {file_id}")
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
        a_min=a_min,
        a_max=a_max,
        b_min=b_min,
        b_max=b_max,
        m_min=m_min,
        m_max=m_max,
        n_min=n_min,
        n_max=n_max,
    )


# ---------- Inversion ----------
@app.get("/api/ert/invert/{file_id}", response_model=InvertSummary)
def ert_invert(
    file_id: str, spacing: float = 1.0, lam: float = 20.0, quality: int = 34, maxIter: int = 20
) -> InvertSummary:
    if pg is None or ert is None:
        raise HTTPException(500, "pyGIMLi/ERT not available in this environment")

    csv = DATA_DIR / f"{file_id}.normalized.csv"
    if not csv.exists():
        raise HTTPException(404, f"normalized CSV not found for {file_id}")
    df = pd.read_csv(csv)

    # Build ERT data container (1-based -> 0-based)
    n_elec = int(max(df[["A", "B", "M", "N"]].values.max(), 0))
    sensors = [pg.Pos(i * spacing, 0.0) for i in range(n_elec)]

    dc = pg.DataContainerERT()  # correct location
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

    # Prepare output folder
    out_dir = _results_dir_for(file_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Export mesh nodes
    mesh = mgr.paraDomain
    nodes_rows = [{"id": i, "x": float(n.pos()[0]), "y": float(n.pos()[1])} for i, n in enumerate(mesh.nodes())]
    mesh_nodes_csv = out_dir / "mesh_nodes.csv"
    pd.DataFrame(nodes_rows).to_csv(mesh_nodes_csv, index=False)

    # Export mesh cell connectivity + triangles with rho
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
            tri_rows.append(
                {
                    "cell": cid,
                    "x1": float(p1[0]),
                    "y1": float(p1[1]),
                    "x2": float(p2[0]),
                    "y2": float(p2[1]),
                    "x3": float(p3[0]),
                    "y3": float(p3[1]),
                    "rho": float(rho[cid]),
                    "log10rho": float(log10rho[cid]),
                }
            )

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


@app.get("/api/ert/results/{file_id}")
def ert_results(file_id: str) -> Dict[str, Any]:
    out_dir = _results_dir_for(file_id)
    files = {
        "model_cells": _public(out_dir / "model_cells.csv"),
        "mesh_nodes": _public(out_dir / "mesh_nodes.csv"),
        "mesh_cells": _public(out_dir / "mesh_cells_connectivity.csv"),
        "triangles": _public(out_dir / "triangles.csv"),
    }
    return {"file_id": file_id, "files": files}

@app.get("/api/debug/stg-head/{file_id}")
def debug_stg_head(file_id: str, n: int = 60):
    raw = (DATA_DIR / f"{file_id}.stg")
    if not raw.exists():
        raw = (DATA_DIR / f"{file_id}.srt")
    if not raw.exists():
        raise HTTPException(404, "raw file not found")
    txt = raw.read_text(encoding="latin-1", errors="ignore").replace("\x00","")
    head = "\n".join(txt.splitlines()[:n])
    return {"file": str(raw), "preview": head}
