from pathlib import Path
from typing import Dict, Any, Tuple, Iterable, Optional, List
import re, json
import numpy as np
import pandas as pd
from .stg_parser import read_srt_or_stg_normalized, robust_read_stg_table

# --- add near your imports if not present ---
import re

def _coalesce_col(df, candidates, new_name):
    """Find the first existing column (case-insensitive) and rename to new_name."""
    name_map = {c: c for c in df.columns}
    lower_to_real = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand in df.columns:
            return df.rename(columns={cand: new_name})
        lc = cand.lower()
        if lc in lower_to_real:
            real = lower_to_real[lc]
            return df.rename(columns={real: new_name})
    return df  # unchanged if none found

# ensure we have canonical names used by the backend
# df = _coalesce_col(df, ["rhoa", "rho_a", "appres", "app_res", "apparentresistivity", "res", "resistivity"], "rhoa")
df = _coalesce_col(df, ["err", "error", "std", "sigma_rel", "unc"], "err")
# keep your existing A,B,M,N,k,dV,I etc. as you have them today

def _pick(dc, candidates: Iterable[str], dtype=float):
    """Try several token names on a DataContainerERT and return a NumPy array."""
    last = None
    for c in candidates:
        for name in (c, c.lower(), c.upper()):
            try:
                return np.asarray(dc[name], dtype=dtype)
            except Exception as e:
                last = e
    # Try to show what tokens are available
    names = []
    try:
        names = list(getattr(dc, "tokenNames", lambda: [])())
    except Exception:
        pass
    raise RuntimeError(
        f"Missing token {tuple(candidates)} in DataContainer; available: {names!r}; "
        f"last error: {repr(last)}"
    )

def _pick(dc, candidates: Iterable[str], dtype=float):
    last = None
    for c in candidates:
        for name in (c, c.lower(), c.upper()):
            try:
                return np.asarray(dc[name], dtype=dtype)
            except Exception as e:
                last = e
    names = []
    try:
        names = list(getattr(dc, "tokenNames", lambda: [])())
    except Exception:
        pass
    raise RuntimeError(
        f"Missing token {tuple(candidates)} in DataContainer; available: {names!r}; "
        f"last error: {repr(last)}"
    )

def _dc_to_df(dc) -> pd.DataFrame:
    A0 = _pick(dc, ("a","A"), int)
    B0 = _pick(dc, ("b","B"), int)
    M0 = _pick(dc, ("m","M"), int)
    N0 = _pick(dc, ("n","N"), int)
    I  = _pick(dc, ("i","I"), float)
    U  = _pick(dc, ("u","U"), float)
    df = pd.DataFrame({
        "A": A0 + 1,
        "B": B0 + 1,
        "M": M0 + 1,
        "N": N0 + 1,
        "CURRENT": I,
        "dV": U,
    })
    # optional
    for name in (("k","K"), ("rhoa","appres","r","RHOA","APPRES","R"), ("err","ERR")):
        try:
            arr = _pick(dc, name, float)
            col = "k" if "k" in name else ("rhoa" if "rhoa" in name or "appres" in name or "r" in name else "err")
            if col == "err":
                arr = np.maximum(arr, 1e-6)
            df[col] = arr
        except Exception:
            pass
    return df

from .stg_parser import read_srt_or_stg_normalized

import traceback

def import_with_pybert_to_df(raw_path: Path) -> pd.DataFrame:
    df = None
    pybert_err = None

    # 1) Try pyBERT first (keep whatever you had; just wrap for message)
    try:
        # ... your existing pyBERT import logic that yields a DataFrame in df ...
        pass
    except Exception as e:
        pybert_err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

    # 2) If pyBERT gave nothing useful, try robust fallback
    if df is None or df.empty or not set(str(c).upper() for c in df.columns).intersection({"A","B","M","N"}):
        try:
            df = robust_read_stg_table(raw_path)
        except Exception as e:
            # <-- IMPORTANT: include both pyBERT error and fallback error
            fb_err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            msg = "pyBERT import failed and fallback parse failed:"
            if pybert_err:
                msg += f"\n--- pyBERT ---\n{pybert_err}"
            msg += f"\n--- fallback ---\n{fb_err}"
            # Let the route convert to HTTPException(400, detail=msg)
            raise ValueError(msg)

    return df

def import_with_pybert_to_df(stg_path: Path):
    errs = []
    df = None
    source = None

    # 1) pyBERT
    try:
        from pybert.importer import importData
        dc = importData(str(stg_path))
        source = "pybert.importer"
        df = _dc_to_df(dc)  # your existing helper
    except Exception as e:
        errs.append(f"pybert.importer: {repr(e)}")
        df = None

    # 2) pygimli.ert.load
    if df is None or len(df) == 0:
        try:
            from pygimli.physics import ert
            dc2 = ert.load(str(stg_path))
            df = _dc_to_df(dc2)
            source = "pygimli.physics.ert.load"
        except Exception as e:
            errs.append(f"ert.load: {repr(e)}")
            df = None

    # 3) tolerant AGI/STG fallback
    if df is None or len(df) == 0:
        try:
            df, meta2 = read_srt_or_stg_normalized(stg_path)
            meta = {"importer": "fallback", **meta2}
            return df, meta
        except Exception as e:
            errs.append(f"fallback: {repr(e)}")
            raise RuntimeError(" / ".join(errs) or "No importer succeeded")

    meta = {
        "importer": source or "unknown",
        "source": "stg",
        "n_readings": int(len(df)),
        "has_k": "k" in df.columns,
        "has_rhoa": "rhoa" in df.columns,
        "has_err": "err" in df.columns,
    }
    return df, meta

# backend/app/bert_import.py
_NUM = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
def _isnum(t: str) -> bool: return bool(_NUM.match(t))

def extract_ip_from_stg_text(raw_path: Path) -> Optional[Dict[str, Any]]:
    """
    Parse TD-IP from AGI .stg lines that contain:
      ... IP: <gate_ms> <tau> <g1> <g2> ... <gN> [IPSUM=<total>] [telemetry...]
    Works for both your “original” (6 gates + IPSUM + telemetry) and “processed”
    (e.g., 7 gates, no IPSUM) variants. Returns None if no IP block found.
    """
    gates: List[List[float]] = []
    totals: List[Optional[float]] = []
    gate_ms: Optional[float] = None
    tau: Optional[float] = None
    saw_ip = False

    with raw_path.open("r", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            parts = re.split(r"[,\s;]+", s)

            # find IP token (accepts 'IP', 'IP:', 'ip:', etc.)
            ip_idx = next((i for i, t in enumerate(parts) if t.upper().startswith("IP")), -1)
            if ip_idx < 0:
                continue

            saw_ip = True
            rest = parts[ip_idx + 1:]

            # optional gate_ms and tau
            gms = float(rest[0]) if len(rest) > 0 and _isnum(rest[0]) else None
            tc  = float(rest[1]) if len(rest) > 1 and _isnum(rest[1]) else None

            # collect gate values until IPSUM or non-numeric/telemetry token
            vals: List[float] = []
            for t in rest[2:]:
                ut = t.upper()
                if ut.startswith("IPSUM"):
                    break
                # stop on telemetry (contains '=') or non-numeric
                if ("=" in t and not _isnum(t)) or (not _isnum(t)):
                    break
                vals.append(float(t))

            # optional total after IPSUM
            isum: Optional[float] = None
            isum_idx = next((i for i, t in enumerate(rest) if t.upper().startswith("IPSUM")), -1)
            if isum_idx >= 0:
                tok = rest[isum_idx]
                if "=" in tok:
                    try:
                        isum = float(tok.split("=", 1)[1])
                    except Exception:
                        isum = None
                elif isum_idx + 1 < len(rest) and _isnum(rest[isum_idx + 1]):
                    isum = float(rest[isum_idx + 1])

            if vals:
                gates.append(vals)
                totals.append(isum)
                if gate_ms is None:
                    gate_ms = gms
                if tau is None:
                    tau = tc

    if not saw_ip or not gates:
        return None

    # normalize cosmetic zeros -> None
    if gate_ms == 0:
        gate_ms = None
    if tau == 0:
        tau = None

    return {
        "mode": "TD",
        "gate_ms": gate_ms,
        "tau": tau,
        "n_readings": len(gates),
        "n_gates_max": max(len(g) for g in gates),
        "gates": gates,     # list of per-reading gate arrays
        "total": totals,    # may be all None if no IPSUM present
    }
