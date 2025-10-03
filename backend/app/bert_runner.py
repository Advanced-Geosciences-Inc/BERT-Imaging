from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd

import pygimli as pg
import pygimli.meshtools as mt
from pygimli.physics import ert

# ---------- helpers ----------

def build_line_sensors(n_elec: int, spacing: float = 1.0):
    # return a list[pg.Pos] — this is what DataContainerERT/ERTManager expect
    return [pg.Pos(float(i) * float(spacing), 0.0) for i in range(n_elec)]

def _read_norm_csv(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    # numeric coercion
    for c in ["A", "B", "M", "N"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["CURRENT"] = pd.to_numeric(df["CURRENT"], errors="coerce")
    df["dV"] = pd.to_numeric(df["dV"], errors="coerce")
    df = df.dropna(subset=["A", "B", "M", "N", "CURRENT", "dV"]).copy()
    df[["A", "B", "M", "N"]] = df[["A", "B", "M", "N"]].astype(int)
    return df

# ---------- core ----------
def make_scheme_from_csv(csv_path: Path, spacing: float = 1.0):
    """
    Build a DataContainerERT correctly for pyGIMLi 1.5.3:
      - attach sensor positions (pg.Pos)
      - fill a,b,m,n via createFourPointData(i, a, b, m, n) using 0-based indices
      - set i,u afterwards
    Returns (scheme, summary).
    """
    df = _read_norm_csv(csv_path)

    # 0-based indices for internal fields
    abmn1 = df[["A", "B", "M", "N"]].to_numpy(dtype=int)
    if abmn1.min() == 0:
        abmn0 = abmn1
        indexing_correction_applied = False
    else:
        abmn0 = abmn1 - 1
        indexing_correction_applied = True

    n_elec = int(abmn0.max() + 1)
    N = int(abmn0.shape[0])

    # sensors as list[pg.Pos]
    sensors = [pg.Pos(float(i) * float(spacing), 0.0) for i in range(n_elec)]

    dc = pg.DataContainerERT()
    dc.setSensorPositions(sensors)
    dc.resize(N)

    # fill ABMN one row at a time (this is what the C++ signature expects)
    for i, (a, b, m, n) in enumerate(abmn0):
        dc.createFourPointData(int(i), int(a), int(b), int(m), int(n))

    # set currents/voltages
    dc.set("i", df["CURRENT"].to_numpy(dtype=float))
    dc.set("u", df["dV"].to_numpy(dtype=float))

    summary = {
        "n_electrodes": n_elec,
        "spacing": float(spacing),
        "n_data": N,
        "indexing_correction_applied": indexing_correction_applied,
        "a_min": int(df["A"].min()), "a_max": int(df["A"].max()),
        "b_min": int(df["B"].min()), "b_max": int(df["B"].max()),
        "m_min": int(df["M"].min()), "m_max": int(df["M"].max()),
        "n_min": int(df["N"].min()), "n_max": int(df["N"].max()),
    }
    return dc, summary

def forward_simulate_from_csv(
    csv_path: Path,
    spacing: float = 1.0,
    rho: float = 100.0,
    quality: float = 34.0,
):
    # Build scheme (sensors attached; a,b,m,n are 0-based)
    scheme, summary = make_scheme_from_csv(csv_path, spacing=spacing)
    n_elec = summary["n_electrodes"]
    line_len = (n_elec - 1) * spacing

    # Mesh: rectangle + electrode nodes on the surface
    margin = max(spacing * 2.0, 0.1 * line_len)
    depth  = max(spacing * 6.0, 3.0 * line_len)
    world = mt.createWorld(start=[-margin, 0.0], end=[line_len + margin, -depth], worldMarker=True)
    for pos in scheme.sensorPositions():  # pos is pg.Pos
        world.createNode([pos.x(), 0.0])
    mesh = mt.createMesh(world, quality=quality)

    # Homogeneous model
    model = pg.Vector(mesh.cellCount(), float(rho))

    # Simulate using the scheme's sensors
    mgr = ert.ERTManager(scheme)
    data_sim = mgr.simulate(mesh=mesh, res=model, noiseLevel=0.0, noiseAbs=0.0, verbose=False)

    # Return the scheme too (to read ABMN robustly)
    return scheme, mesh, data_sim

def invert_from_csv(
    csv_path: Path,
    spacing: float = 1.0,
    lam: float = 20.0,
    quality: float = 34.0,
    maxIter: int = 20,
):
    """
    Invert using ERTManager.
    Adds geometric factor 'k', apparent resistivity 'rhoa', and a non-zero error vector 'err'.
    Returns (scheme, mesh, inv_model, chi2).
    """
    scheme, summary = make_scheme_from_csv(csv_path, spacing=spacing)
    n_elec = summary["n_electrodes"]
    line_len = (n_elec - 1) * spacing

    # ---- mesh (same as forward) ----
    margin = max(spacing * 2.0, 0.1 * line_len)
    depth  = max(spacing * 6.0, 3.0 * line_len)
    world = mt.createWorld(start=[-margin, 0.0], end=[line_len + margin, -depth], worldMarker=True)
    for p in scheme.sensorPositions():
        world.createNode([p.x(), 0.0])
    mesh = mt.createMesh(world, quality=quality)

    # ---- geometric factor & rhoa (flat surface) ----
    import numpy as np
    a = np.asarray(scheme["a"], dtype=int)
    b = np.asarray(scheme["b"], dtype=int)
    m = np.asarray(scheme["m"], dtype=int)
    n = np.asarray(scheme["n"], dtype=int)
    xs = np.array([pos.x() for pos in scheme.sensorPositions()], dtype=float)

    r_am = np.abs(xs[a] - xs[m])
    r_an = np.abs(xs[a] - xs[n])
    r_bm = np.abs(xs[b] - xs[m])
    r_bn = np.abs(xs[b] - xs[n])

    eps = 1e-12
    r_am = np.maximum(r_am, eps)
    r_an = np.maximum(r_an, eps)
    r_bm = np.maximum(r_bm, eps)
    r_bn = np.maximum(r_bn, eps)

    denom = (1.0 / r_am) - (1.0 / r_an) - (1.0 / r_bm) + (1.0 / r_bn)
    denom = np.where(np.abs(denom) < eps, np.sign(denom) * eps, denom)

    k = 2.0 * np.pi / denom
    scheme.set("k", k)

    u = np.asarray(scheme["u"], dtype=float)
    i = np.asarray(scheme["i"], dtype=float)
    rhoa = k * u / i
    scheme.set("rhoa", rhoa)

    # ---- non-zero error vector (3% relative; any >0 works) ----
    err = np.full(rhoa.shape, 0.03, dtype=float)  # 3% for every datum
    scheme.set("err", err)

    # ---- invert ----
    mgr = ert.ERTManager(scheme, verbose=False)
    inv_model = mgr.invert(
        mesh=mesh,
        lam=float(lam),
        maxIter=int(maxIter),
        verbose=False,
    )
    chi2 = float(mgr.inv.chi2()) if hasattr(mgr, "inv") else float("nan")

    return scheme, mesh, inv_model, chi2
