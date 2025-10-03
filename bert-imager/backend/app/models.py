from pydantic import BaseModel
from typing import Literal, Dict, Any, Optional, List

class UploadResponse(BaseModel):
    file_id: str
    kind: Literal["stg", "urf"]
    n_readings: int
    metadata: Dict[str, Any]
    normalized_csv: str

class InspectResponse(BaseModel):
    file_id: str
    n_readings: int
    n_electrodes: int
    indexing: Literal["0-based", "1-based"]
    a_min: int; a_max: int
    b_min: int; b_max: int
    m_min: int; m_max: int
    n_min: int; n_max: int
    current_min: Optional[float] = None
    current_max: Optional[float] = None
    dv_min: Optional[float] = None
    dv_max: Optional[float] = None

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

# at top
class ForwardSummary(BaseModel):
    file_id: str
    rho: float
    spacing: float
    mesh_cells: int
    mesh_nodes: int
    data_count: int
    rhoa_min: Optional[float] = None
    rhoa_max: Optional[float] = None
    files: Dict[str, Optional[str]]   # <— allow None for mesh

class InvertSummary(BaseModel):
    file_id: str
    spacing: float
    lam: float
    chi2: float
    mesh_cells: int
    mesh_nodes: int
    files: Dict[str, str]

# app/models.py
class IPInspect(BaseModel):
    file_id: str
    mode: str | None
    n_readings: int
    n_gates_max: int
    gate_ms: float | None
    tau: float | None
    gate_stats: list[dict]
    has_total: bool

class IPExportSummary(BaseModel):
    file_id: str
    mode: str
    gate: str           # "total" or gate index as string
    n_rows: int
    files: Dict[str, str]
