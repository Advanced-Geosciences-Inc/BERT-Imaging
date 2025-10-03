from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import re, io
import pandas as pd
import numpy as np

# ------------------------------
# Common split and line iterator
# ------------------------------
_SPLIT_RE = re.compile(r"[,\s;]+")

def _split(s: str) -> List[str]:
    return _SPLIT_RE.split(s.strip())

def _iter_data_lines(path: Path):
    """Yield only lines that look like data records (start with a number)."""
    with path.open("r", errors="ignore") as f:
        for ln in f:
            if ln.strip() and re.match(r"^\s*\d+", ln):
                yield ln

# ---------------------------------------------------------
# AGI STG (coordinates-table variant with A/B/M/N XYZ cols)
# ---------------------------------------------------------
def parse_agi_stg_coordinates_table(path: Path) -> Optional[pd.DataFrame]:
    """
    Parse AGI .stg where each reading line contains:
      ... <rhoa> ... <k> <label> Ax Ay Az Bx By Bz Mx My Mz Nx Ny Nz [IP...][IPSUM=...][telemetry...]
    We:
      - read rhoa from token[4]
      - read k    from token[7]
      - read A/B/M/N coords from tokens [9:12], [12:15], [15:18], [18:21]
      - derive 1-based A/B/M/N indices by sorting unique sensors by (x,y,z)
    Returns a DataFrame with columns: A,B,M,N,rhoa,k or None if pattern not matched.
    """
    rows: List[tuple] = []
    sensors: set = set()

    for ln in _iter_data_lines(path):
        parts = _split(ln)
        # need up to N.z => index 20 present
        if len(parts) < 21:
            continue
        try:
            rhoa = float(parts[4])
            k = float(parts[7])
            Ax, Ay, Az = map(float, parts[9:12])
            Bx, By, Bz = map(float, parts[12:15])
            Mx, My, Mz = map(float, parts[15:18])
            Nx, Ny, Nz = map(float, parts[18:21])
        except Exception:
            # not this variant; skip line
            continue

        rows.append((rhoa, k, (Ax, Ay, Az), (Bx, By, Bz), (Mx, My, Mz), (Nx, Ny, Nz)))
        sensors.update([(Ax, Ay, Az), (Bx, By, Bz), (Mx, My, Mz), (Nx, Ny, Nz)])

    if not rows:
        return None

    # Map sensor coordinates -> 1-based indices
    uniq = sorted(list(sensors), key=lambda t: (t[0], t[1], t[2]))
    idx_map = {coord: i + 1 for i, coord in enumerate(uniq)}

    data: List[Dict[str, Any]] = []
    for rhoa, k, A, B, M, N in rows:
        data.append({
            "A": idx_map[A],
            "B": idx_map[B],
            "M": idx_map[M],
            "N": idx_map[N],
            "rhoa": float(rhoa),
            "k": float(k),
        })

    return pd.DataFrame(data)

# ----------------------------------------------------------------
# Public entry: tolerant reader for SRT/STG (used by import route)
# ----------------------------------------------------------------
def read_srt_or_stg_normalized(path: Path):
    """
    Tolerant SRT/STG reader.
    - For .stg with A/B/M/N XYZ + trailing IP/telemetry, prefer the coordinates parser.
    - Otherwise try flexible tabular parsing (CSV/TSV/whitespace).
    Returns (df, meta) where df has at least A,B,M,N and ideally rhoa/k.
    """
    suffix = path.suffix.lower()

    # 1) Prefer AGI coordinates-table parsing for .stg
    if suffix == ".stg":
        df1 = parse_agi_stg_coordinates_table(path)
        if df1 is not None and len(df1):
            if "err" not in df1.columns:
                df1["err"] = 0.03  # default 3% error; adjust later as needed
            meta1 = {
                "importer": "agi-stg-coords",
                "source": "stg",
                "n_readings": int(len(df1)),
                "has_k": "k" in df1.columns,
                "has_rhoa": "rhoa" in df1.columns,
                "has_err": "err" in df1.columns,
            }
            return df1, meta1
        # else fall through

    # 2) Generic flexible-table fallback (older SRT/CSV-like)
    df2 = _read_table_flex(path)
    df2 = _normalize_columns(df2)

    need = {"A", "B", "M", "N"}
    if not need.issubset(df2.columns):
        missing = need - set(df2.columns)
        raise ValueError(f"Generic fallback parsed but missing required columns: {missing}")

    if "err" not in df2.columns:
        df2["err"] = 0.03

    meta2 = {
        "importer": "fallback-table",
        "source": suffix.lstrip(".") or "stg",
        "n_readings": int(len(df2)),
        "has_k": "k" in df2.columns,
        "has_rhoa": "rhoa" in df2.columns,
        "has_err": "err" in df2.columns,
    }
    return df2, meta2

# --------------------------------------------------------------------
# Compatibility helpers expected by urf_parser.py
# --------------------------------------------------------------------
def _read_table_flex(path: Path) -> pd.DataFrame:
    """
    Try ',', ';', '\\t', then whitespace. Return a DataFrame or raise ValueError.
    """
    last_err: Optional[Exception] = None
    for sep in [",", ";", "\t"]:
        try:
            df = pd.read_csv(path, sep=sep, engine="c")
            if len(df):
                return df
        except Exception as e:
            last_err = e
    try:
        # pandas recommends sep='\\s+' instead of delim_whitespace
        df = pd.read_csv(path, sep=r"\s+", engine="python")
        return df
    except Exception as e:
        raise ValueError(
            "Could not parse table with ',', ';', '\\t', or whitespace. "
            f"Attempts: [\"sep=',' -> {repr(last_err)}\", \"sep=';'\", \"sep='\\t'\"]"
        )

# Common header aliases seen in SuperSting/various exports
# app/stg_parser.py

def _norm(s: str) -> str:
    return re.sub(r"[\s\.\-_/()\[\]#]+", "", str(s)).upper()

# Broad alias maps (AGI exports vary a lot)
ABMN_SYNONYMS: Dict[str, set] = {
    "A": {"A","ELECA","ELECTRODEA","TX1","C1","I1","SA","S_A","A(1)","A1","E1","ELEC A"},
    "B": {"B","ELECB","ELECTRODEB","TX2","C2","I2","SB","S_B","B(1)","B1","E2","ELEC B"},
    "M": {"M","ELECM","ELECTRODEM","RX1","P1","V1","PA","M1","E3","ELEC M"},
    "N": {"N","ELECN","ELECTRODEN","RX2","P2","V2","PB","N1","E4","ELEC N"},
}
VALUE_SYNONYMS: Dict[str, set] = {
    "K": {"K","GEOM","GEOMFAC","GEOMETRICFACTOR","GFACTOR"},
    "RHOA": {"RHOA","APPRES","RESAPP","APPARENTRES","APPARENTRESISTIVITY","RES","RESISTIVITY"},
    "ERR": {"ERR","ERROR","STD","STDEV","STDDEV","PERROR","RELERR"},
    "DV": {"DV","DVOLT","U","V","VOLT","VOLTS"},
    "CURRENT": {"I","CUR","CURRENT","AMP","AMPS","MA"},
}

def _split(line: str) -> List[str]:
    return [t for t in re.split(r"[,\t; ]+", line.strip()) if t]

def _detect_sep(line: str) -> str:
    if line.count(",") >= 3: return ","
    if line.count(";") >= 3: return ";"
    if "\t" in line:         return "\t"
    return r"\s+"

def _looks_numeric_row(toks: List[str], min_numeric: int = 4) -> bool:
    hits = 0
    for t in toks:
        tt = t.replace("+","").replace("-","").replace(".","").replace("e","").replace("E","").replace("+","")
        if tt.isdigit():
            hits += 1
        else:
            try:
                float(t)
                hits += 1
            except:
                pass
    return hits >= min_numeric

def _find_header_row(lines: List[str]) -> Tuple[Optional[int], Dict[str,str]]:
    """Find line index that defines columns and build a map tgt->original header string."""
    for i, line in enumerate(lines[:400]):
        toks = _split(line)
        if len(toks) < 4:
            continue
        norms = [_norm(t) for t in toks]
        orig_by_norm = {_norm(t): t for t in toks}

        # If next 1–2 lines are numeric-ish, this line is likely header:
        if i+1 < len(lines):
            nxt = _split(lines[i+1])
            nxt2 = _split(lines[i+2]) if i+2 < len(lines) else []
            if (_looks_numeric_row(nxt) and (not nxt2 or _looks_numeric_row(nxt2))):
                # try to map A/B/M/N by direct name or alias
                colmap: Dict[str,str] = {}
                for tgt in ("A","B","M","N"):
                    if tgt in norms:
                        colmap[tgt] = toks[norms.index(tgt)]
                        continue
                    for a in ABMN_SYNONYMS[tgt]:
                        if a in norms:
                            colmap[tgt] = orig_by_norm[a]
                            break
                if len(colmap) >= 3:  # good enough; we can try to recover the 4th later
                    return i, colmap

        # Or if row itself contains A/B/M/N aliases clearly:
        have = 0
        colmap2: Dict[str,str] = {}
        for tgt in ("A","B","M","N"):
            for a in {tgt} | ABMN_SYNONYMS[tgt]:
                if a in norms:
                    colmap2[tgt] = orig_by_norm[a]
                    have += 1
                    break
        if have >= 3:
            return i, colmap2

    return None, {}

def _rename_using_aliases(df: pd.DataFrame) -> pd.DataFrame:
    name_map = { _norm(c): c for c in df.columns }
    # First pass: A/B/M/N
    for tgt in ("A","B","M","N"):
        if tgt not in df.columns:
            for a in {tgt} | ABMN_SYNONYMS[tgt]:
                if a in name_map:
                    df = df.rename(columns={name_map[a]: tgt})
                    break
        # Very permissive regex: columns named like "A(...)" or "A-#", etc.
        if tgt not in df.columns:
            for c in list(df.columns):
                if re.fullmatch(rf"{tgt}\W.*", str(c), re.IGNORECASE):
                    df = df.rename(columns={c: tgt})
                    break

    # Values
    for tgt, aliases in VALUE_SYNONYMS.items():
        if tgt not in df.columns:
            for a in {tgt} | aliases:
                if a in name_map:
                    df = df.rename(columns={name_map[a]: tgt})
                    break
    return df

def _coerce_int_columns(df: pd.DataFrame, cols: List[str]) -> None:
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
            # If everything is NaN, leave as-is (we'll error later)
            if df[c].notna().any():
                # round only very close to integers
                as_int = df[c].round().astype("Int64")
                # if >95% entries are integer-like, keep Int64
                frac = (df[c].notna() & (np.isclose(df[c], as_int.astype(float)))).mean()
                if frac >= 0.90:
                    df[c] = as_int

def robust_read_stg_table(path: Path) -> pd.DataFrame:
    txt = Path(path).read_text(encoding="latin-1", errors="ignore")
    txt = txt.replace("\ufeff","").replace("\x00","")
    lines = [ln for ln in txt.splitlines() if ln.strip()]

    # 1) Try to detect a header line
    hdr_i, colmap = _find_header_row(lines)
    if hdr_i is not None:
        sep = _detect_sep(lines[hdr_i])
        df = pd.read_csv(io.StringIO("\n".join(lines[hdr_i:])), sep=sep, engine="python")
        df = _rename_using_aliases(df)
        _coerce_int_columns(df, ["A","B","M","N"])
        return df

    # 2) Headerless numeric block: find first place where 2–3 consecutive lines look numeric
    start = None
    for i in range(len(lines)-2):
        if _looks_numeric_row(_split(lines[i])) and _looks_numeric_row(_split(lines[i+1])):
            start = i
            break
    if start is None:
        raise ValueError("Could not locate a numeric data block in STG.")

    sep = _detect_sep(lines[start])
    df = pd.read_csv(io.StringIO("\n".join(lines[start:])), sep=sep, engine="python", header=None)

    # Infer A/B/M/N: pick the first four columns with >=90% integer-like values
    int_like = []
    for c in df.columns:
        s = pd.to_numeric(df[c], errors="coerce")
        if s.notna().any():
            as_int = s.round()
            frac = np.isclose(s, as_int).mean()
            if frac >= 0.90:
                int_like.append(c)
    if len(int_like) < 4:
        raise ValueError("Generic fallback parsed but cannot infer A/B/M/N (not enough integer-like columns).")

    order = int_like[:4]
    df = df.rename(columns={order[0]:"A", order[1]:"B", order[2]:"M", order[3]:"N"})
    _coerce_int_columns(df, ["A","B","M","N"])
    return df

def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Light normalization: strip spaces, unify common token names.
    Returns a new DataFrame; original is not mutated.
    """
    out = df.copy()
    out.columns = [str(c).strip() for c in out.columns]

    # Case-insensitive alias map
    aliases = {
        "a": "A", "b": "B", "m": "M", "n": "N",
        "i": "CURRENT", "current": "CURRENT",
        "u": "dV", "dv": "dV", "deltav": "dV", "v": "dV",
        "k": "k",
        "rhoa": "rhoa", "appres": "rhoa", "r": "rhoa",
        "err": "err", "error": "err",
    }
    rename = {}
    for c in out.columns:
        key = c.strip().lower()
        if key in aliases:
            rename[c] = aliases[key]
    if rename:
        out = out.rename(columns=rename)

    # Coerce numerics
    for c in ["A", "B", "M", "N", "CURRENT", "dV", "k", "rhoa", "err"]:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")

    # Ensure positive error if present
    if "err" in out.columns:
        out["err"] = np.maximum(out["err"].astype(float), 1e-6)

    return out

