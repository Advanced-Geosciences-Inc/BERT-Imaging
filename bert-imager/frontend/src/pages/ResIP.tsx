// src/pages/ResIP.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { csvParse } from "d3-dsv";
import { scaleSequential } from "d3-scale";
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateMagma,
  interpolateTurbo,
  interpolateCividis,
  interpolateSpectral,
  interpolateGreys,
} from "d3-scale-chromatic";

type TriangleRow = {
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  rho?: number;
  log10rho?: number;
};

type ResIPProps = {
  /** Optional direct URL to triangles.csv. If absent, we try `?fileId=...` via /api/ert/results/<fileId>. */
  trianglesUrl?: string;
  /** Hide the big title when embedding in another view */
  showTitle?: boolean;
};

const CMAPS: Record<string, (t: number) => string> = {
  Viridis: interpolateViridis,
  Plasma: interpolatePlasma,
  Inferno: interpolateInferno,
  Magma: interpolateMagma,
  Turbo: interpolateTurbo,
  Cividis: interpolateCividis,
  Spectral: interpolateSpectral,
  Greys: interpolateGreys,
  // Keep an alias for "Rainbow" -> Turbo
  Rainbow: interpolateTurbo,
};

function quantile(arr: number[], q: number) {
  if (!arr.length) return NaN;
  const a = [...arr].sort((aa, bb) => aa - bb);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < a.length) return a[base] + (a[base + 1] - a[base]) * rest;
  return a[base];
}

function trimmedDomain(values: number[], p = 0.02) {
  const lo = quantile(values, p);
  const hi = quantile(values, 1 - p);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
    // fallback to raw min/max
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    return [vmin, vmax] as const;
  }
  return [lo, hi] as const;
}

export default function ResIP({ trianglesUrl, showTitle = true }: ResIPProps) {
  const [rows, setRows] = useState<TriangleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [useLog, setUseLog] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [cmapName, setCmapName] = useState<keyof typeof CMAPS>("Rainbow");

  // Resolve triangles URL:
  useEffect(() => {
    let cancelled = false;

    async function resolveAndLoad() {
      setError(null);

      let url = trianglesUrl ?? "";
      if (!url) {
        const sp = new URLSearchParams(window.location.search);
        const fileId = sp.get("fileId");
        if (fileId) {
          // Ask backend for the results file map and pick "triangles"
          const r = await fetch(`/api/ert/results/${fileId}`);
          if (!r.ok) {
            setError(`Unable to fetch /api/ert/results/${fileId} (${r.status})`);
            return;
          }
          const j = await r.json();
          url = j?.files?.triangles;
        }
      }
      if (!url) {
        setError("No triangles URL. Pass trianglesUrl prop or use ?fileId=...");
        return;
      }

      const res = await fetch(url);
      if (!res.ok) {
        setError(`Fetch failed: ${url} (${res.status})`);
        return;
      }
      const text = await res.text();
      const parsed = csvParse(text);
      // Basic column sanity
      const required = ["x1", "y1", "x2", "y2", "x3", "y3"];
      for (const k of required) {
        if (!(k in parsed.columns.reduce((acc, c) => ({ ...acc, [c]: true }), {} as any))) {
          setError(`triangles.csv missing '${k}' column`);
          return;
        }
      }

      const recs: TriangleRow[] = parsed.map((d: any) => ({
        x1: +d.x1, y1: +d.y1,
        x2: +d.x2, y2: +d.y2,
        x3: +d.x3, y3: +d.y3,
        rho: d.rho !== undefined ? +d.rho : undefined,
        log10rho: d.log10rho !== undefined ? +d.log10rho : undefined,
      }));

      if (!cancelled) setRows(recs);
    }

    resolveAndLoad().catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, [trianglesUrl]);

  const values = useMemo(() => {
    if (!rows) return [];
    // prefer log10rho if toggle is ON and values exist
    const hasLog = rows.some(r => Number.isFinite(r.log10rho));
    const arr = rows.map(r => {
      if (useLog && hasLog && Number.isFinite(r.log10rho)) return r.log10rho as number;
      if (Number.isFinite(r.rho)) {
        return useLog ? Math.log10(r.rho as number) : (r.rho as number);
      }
      return NaN;
    }).filter(Number.isFinite) as number[];
    return arr;
  }, [rows, useLog]);

  const [vmin, vmax] = useMemo(() => {
    if (!values.length) return [0, 1] as const;
    return trimmedDomain(values, 0.02);
  }, [values]);

  const colorScale = useMemo(() => {
    const fn = CMAPS[cmapName] ?? interpolateTurbo;
    return scaleSequential(fn).domain([vmin, vmax]);
  }, [cmapName, vmin, vmax]);

  // Canvas rendering
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!rows || !rows.length) return;
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Layout & sizing
    const W = wrap.clientWidth - 16; // some padding
    const H = Math.max(320, Math.floor(W * 0.32));
    canvas.width = W;
    canvas.height = H;

    // Compute model bounds
    const xs: number[] = [];
    const ys: number[] = [];
    rows.forEach(r => { xs.push(r.x1, r.x2, r.x3); ys.push(r.y1, r.y2, r.y3); });
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const pad = 8;
    const sx = (x: number) => pad + (x - minX) / (maxX - minX || 1) * (W - 2 * pad);
    // flip Y so depth increases downward
    const sy = (y: number) => pad + (maxY - y) / (maxY - minY || 1) * (H - 2 * pad);

    ctx.clearRect(0, 0, W, H);

    // draw triangles
    const hasLogColumn = rows.some(r => Number.isFinite(r.log10rho));
    for (const t of rows) {
      let val: number | undefined;
      if (useLog && hasLogColumn && Number.isFinite(t.log10rho)) val = t.log10rho!;
      else if (Number.isFinite(t.rho)) val = useLog ? Math.log10(t.rho!) : t.rho!;
      if (!Number.isFinite(val)) continue;

      ctx.beginPath();
      ctx.moveTo(sx(t.x1), sy(t.y1));
      ctx.lineTo(sx(t.x2), sy(t.y2));
      ctx.lineTo(sx(t.x3), sy(t.y3));
      ctx.closePath();
      ctx.fillStyle = colorScale(val!) as string;
      ctx.fill();

      if (showEdges) {
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.stroke();
      }
    }

    // legend
    const L = legendRef.current!;
    const Lw = Math.min(W, 520);
    const Lh = 20;
    L.width = Lw;
    L.height = Lh;

    const lctx = L.getContext("2d")!;
    const grad = lctx.createLinearGradient(0, 0, Lw, 0);
    const stops = 64;
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      const v = vmin + (vmax - vmin) * t;
      grad.addColorStop(t, colorScale(v) as string);
    }
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, Lw, Lh);

  }, [rows, useLog, showEdges, colorScale, vmin, vmax]);

  return (
    <div style={{ padding: 16 }}>
      {showTitle && <h1>BERT Imager</h1>}

      {error && <div style={{ color: "crimson", fontWeight: 600 }}>Error: {error}</div>}

      {!rows && !error && <div>Loading triangles…</div>}

      {rows && (
        <>
          <h2 style={{ marginTop: 0 }}>BERT Imager</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div><strong>Triangles:</strong> {rows.length}</div>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={useLog} onChange={e => setUseLog(e.target.checked)} />
              <span>log<sub>10</sub>(ρ)</span>
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showEdges} onChange={e => setShowEdges(e.target.checked)} />
              <span>show mesh edges</span>
            </label>

            <div>
              colormap{" "}
              <select value={cmapName} onChange={e => setCmapName(e.target.value as keyof typeof CMAPS)}>
                {Object.keys(CMAPS).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div style={{ opacity: 0.8 }}>
              domain: {useLog ? "log10(ρ)" : "ρ"} ∈ [{(vmin).toFixed(3)} … {(vmax).toFixed(3)}]
            </div>
          </div>

          <div ref={wrapRef}
               style={{
                 border: "1px solid #ddd",
                 borderRadius: 8,
                 padding: 8,
                 marginTop: 8,
                 background: "#fff"
               }}>
            <canvas ref={canvasRef} />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>
              Legend ({useLog ? "log10(ρ)" : "ρ"})
            </div>
            <canvas ref={legendRef} style={{ display: "block" }} />
            <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
              <span>{vmin.toFixed(2)}</span>
              <span>{vmax.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
