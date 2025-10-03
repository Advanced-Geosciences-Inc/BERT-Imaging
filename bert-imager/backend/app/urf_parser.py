from __future__ import annotations
from pathlib import Path
from typing import Dict, Tuple
import pandas as pd

from .stg_parser import _read_table_flex, _normalize_columns  # reuse helpers

def read_urf_normalized(path: Path) -> tuple[pd.DataFrame, dict]:
    df = _read_table_flex(path, expected_cols=("A","B","M","N"))
    out = _normalize_columns(df)
    meta = {"source": "urf", "n_readings": int(len(out))}
    return out, meta
