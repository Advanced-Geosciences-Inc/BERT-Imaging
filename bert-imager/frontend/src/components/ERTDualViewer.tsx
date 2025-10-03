import React, { useEffect, useMemo, useRef, useState } from "react";
import { csvParse } from "d3-dsv";
import { extent, median } from "d3-array";
import { scaleLinear, scaleSequential } from "d3-scale";
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateMagma,
  interpolateCividis,
} from "d3-scale-chromatic";

type Point = {
  x: number;
  y: number;
  rho?: number;
  ip?: Record<string, number>;
};

type Props = {
  trianglesUrl: string;        // e.g. `/results/<file_id>/inversion/triangles.csv`
  width?: number;              // CSS px
  heightEach?: number;         // CSS px per panel (two panels stacked)
  defaultCmapRes?: CMapName;
  defaultCmapIP?: CMapName;
};

const CMAPS = {
  viridis: interpolateViridis,
  plasma: interpolatePlasma,
  inferno: interpolateInferno,
  magma: interpolateMagma,
  cividis: interpolateCividis,
};
type CMapName = keyof typeof CMAPS;

export default function ERTDualViewer({
  trianglesUrl,
  width = 900,
  heightEach = 420,
  defaultCmapRes = "viridis",
  defaultCmapIP = "plasma",
}: Props) {
  // ---------- data load ----------
  const [pts, setPts] = useState<Point[]>([]);
  const [bbox, setBbox] = useState<{minX: number; maxX: number; minY: number; maxY: number} | null>(null);
  const [gateNames, setGateNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const txt = await fetch(trianglesUrl).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        });
        const table = csvParse(txt);

        // find gate columns automatically: ip_gate_0..N (or any column starting with 'ip_')
        const cols = table.columns;
        const ipCols = cols.filter(c => c.toLowerCase().startsWith("ip_gate_") || c.toLowerCase().startsWith("ip_"));
        // ensure 'rho' detection (case-insensitive)
        const rhoCol = cols.find(c => c.toLowerCase() === "rho");

        // build centroid samples from triangles
        const parsed: Point[] = [];
        for (const row of table) {
          const x1 = +row["x1"], y1 = +row["y1"];
          const x2 = +row["x2"], y2 = +row["y2"];
          const x3 = +row["x3"], y3 = +row["y3"];
          if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2) || !isFinite(x3) || !isFinite(y3)) continue;
          const cx = (x1 + x2 + x3) / 3;
          const cy = (y1 + y2 + y3) / 3;

          const p: Point = { x: cx, y: cy };
          if (rhoCol) {
            const rv = +row[rhoCol];
            if (isFinite(rv)) p.rho = rv;
          }
          if (ipCols.length > 0) {
            const pack: Record<string, number> = {};
            for (const c of ipCols) {
              const v = +row[c];
              if (isFinite(v)) pack[c] = v;
            }
            if (Object.keys(pack).length > 0) p.ip = pack;
          }
          parsed.push(p);
        }

        if (!alive) return;

        setPts(parsed);

        // bbox from centroids
        if (parsed.length > 0) {
          const xs = parsed.map(p => p.x);
          const ys = parsed.map(p => p.y);
          const [minX, maxX] = extent(xs) as [number, number];
          const [minY, maxY] = extent(ys) as [number, number];
          setBbox({ minX, maxX, minY, maxY });
        } else {
          setBbox(null);
        }

        // sorted gate names by numeric suffix if present
        const sortedGates = [...ipCols].sort((a, b) => {
          const na = +a.replace(/\D+/g, ""); // pull numbers
          const nb = +b.replace(/\D+/g, "");
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.localeCompare(b);
        });

        setGateNames(sortedGates);
      } catch (e: any) {
        if (alive) setErr(`Failed to load triangles: ${e.message ?? e}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [trianglesUrl]);

  // ---------- UI state ----------
  const [cmapRes, setCmapRes] = useState<CMapName>(defaultCmapRes);
  const [cmapIP, setCmapIP] = useState<CMapName>(defaultCmapIP);
  const [useLogRho, setUseLogRho] = useState(true);
  const [stepRes, setStepRes] = useState(2);    // pixel step (bigger = faster, blockier)
  const [stepIP, setStepIP] = useState(2);
  const [kNN, setKNN] = useState(12);           // neighbors for IDW
  const [gateIdx, setGateIdx] = useState(0);    // selected IP gate
  const [clipPct, setClipPct] = useState(0);    // clip curtains (% left/right)

  // ---------- stats for legends ----------
  const rhoStats = useMemo(() => {
    const vals = pts.map(p => p.rho ?? NaN).filter(Number.isFinite) as number[];
    if (vals.length === 0) return null;
    const [minV, maxV] = extent(vals) as [number, number];
    const medV = median(vals) ?? (minV + maxV) / 2;
    return { minV, maxV, medV };
  }, [pts]);

  const gateName = gateNames[gateIdx];
  const ipStats = useMemo(() => {
    if (!gateName) return null;
    const vals = pts.map(p => p.ip?.[gateName] ?? NaN).filter(Number.isFinite) as number[];
    if (vals.length === 0) return null;
    const [minV, maxV] = extent(vals) as [number, number];
    const medV = median(vals) ?? (minV + maxV) / 2;
    return { minV, maxV, medV };
  }, [pts, gateName]);

  // ---------- canvases ----------
  const resRef = useRef<HTMLCanvasElement | null>(null);
  const ipRef  = useRef<HTMLCanvasElement | null>(null);
  const resBarRef = useRef<HTMLCanvasElement | null>(null);
  const ipBarRef  = useRef<HTMLCanvasElement | null>(null);

  // ---------- draw helper ----------
  function renderIDW(opts: {
    canvas: HTMLCanvasElement;
    barCanvas?: HTMLCanvasElement;
    pts: Point[];
    valueOf: (p: Point) => number | null;
    bbox: {minX: number; maxX: number; minY: number; maxY: number};
    width: number; height: number;
    step: number;
    useLog?: boolean;
    cmap: CMapName;
    k: number;               // neighbors
    clipPct: number;         // clip left/right
  }) {
    const {
      canvas, barCanvas, pts, valueOf, bbox, width, height, step, useLog, cmap, k, clipPct
    } = opts;

    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(width * dpr);
    const H = Math.floor(height * dpr);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // build samples (x,y,val) and bounds
    const samples: {x: number; y: number; v: number}[] = [];
    for (const p of pts) {
      const v = valueOf(p);
      if (v == null || !isFinite(v)) continue;
      samples.push({ x: p.x, y: p.y, v });
    }
    if (samples.length === 0) {
      // clear and bail
      ctx.clearRect(0, 0, W, H);
      return;
    }

    // visible bbox with left/right clip
    const clipX = (bbox.maxX - bbox.minX) * (clipPct / 100);
    const vis = {
      minX: bbox.minX + clipX,
      maxX: bbox.maxX - clipX,
      minY: bbox.minY,
      maxY: bbox.maxY,
    };

    // data -> pixel scales (y down)
    const pad = 30 * dpr;
    const xScale = scaleLinear().domain([vis.minX, vis.maxX]).range([pad, W - pad]);
    const yScale = scaleLinear().domain([vis.maxY, vis.minY]).range([H - pad, pad]);

    // color scale domain
    let domainMin = samples[0].v, domainMax = samples[0].v;
    for (const s of samples) { if (s.v < domainMin) domainMin = s.v; if (s.v > domainMax) domainMax = s.v; }

    let toScalar = (v: number) => v;
    if (useLog) {
      // avoid log of <= 0
      const pos = samples.map(s => s.v).filter(v => v > 0);
      if (pos.length > 0) {
        domainMin = Math.min(...pos);
        domainMax = Math.max(...pos);
        toScalar = (v: number) => Math.log10(Math.max(v, Number.EPSILON));
      }
    }
    const sMin = toScalar(domainMin);
    const sMax = toScalar(domainMax);
    const color = scaleSequential(CMAPS[cmap]).domain([sMin, sMax]);

    // simple spatial bins to accelerate neighbor search
    const BIN = 48; // 48x48 bins
    const gx = (x: number) => Math.floor(((x - vis.minX) / (vis.maxX - vis.minX)) * BIN);
    const gy = (y: number) => Math.floor(((y - vis.minY) / (vis.maxY - vis.minY)) * BIN);
    const bins: Point[][][] = Array.from({ length: BIN }, () => Array.from({ length: BIN }, () => []));
    for (const p of pts) {
      const v = valueOf(p);
      if (v == null || !isFinite(v)) continue;
      const ix = Math.min(BIN - 1, Math.max(0, gx(p.x)));
      const iy = Math.min(BIN - 1, Math.max(0, gy(p.y)));
      (bins[ix][iy] as any).push({ x: p.x, y: p.y, v });
    }

    const ctxStep = Math.max(1, Math.floor(step * dpr));
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    // iterate block centers
    for (let py = pad; py < H - pad; py += ctxStep) {
      for (let px = pad; px < W - pad; px += ctxStep) {
        const x = xScale.invert(px + 0.5 * ctxStep);
        const y = yScale.invert(py + 0.5 * ctxStep);

        // gather ~k nearest from bins around the pixel
        const bix = Math.min(BIN - 1, Math.max(0, gx(x)));
        const biy = Math.min(BIN - 1, Math.max(0, gy(y)));

        const neigh: {x: number; y: number; v: number; d2: number}[] = [];
        let ring = 0;
        while (neigh.length < k && ring < BIN) {
          for (let ix = bix - ring; ix <= bix + ring; ix++) {
            if (ix < 0 || ix >= BIN) continue;
            for (let iy = biy - ring; iy <= biy + ring; iy++) {
              if (iy < 0 || iy >= BIN) continue;
              const arr = bins[ix][iy] as any[];
              for (const s of arr) {
                const dx = s.x - x, dy = s.y - y;
                neigh.push({ x: s.x, y: s.y, v: s.v, d2: dx*dx + dy*dy });
              }
            }
          }
          ring++;
          if (ring > 2 && neigh.length >= k) break; // small expansion guard
        }
        if (neigh.length === 0) continue;

        // take k smallest
        neigh.sort((a,b)=>a.d2-b.d2);
        const take = neigh.slice(0, k);

        // IDW (p=2)
        let num = 0, den = 0;
        let exact: number | null = null;
        for (const n of take) {
          if (n.d2 === 0) { exact = n.v; break; }
          const w = 1.0 / (n.d2); // p=2
          num += w * n.v;
          den += w;
        }
        const v = exact != null ? exact : (num / Math.max(den, 1e-12));
        const sv = toScalar(v);
        const hex = cssToRgb(color(sv));

        // paint the block
        for (let yy = 0; yy < ctxStep; yy++) {
          const row = py + yy;
          if (row >= H) continue;
          for (let xx = 0; xx < ctxStep; xx++) {
            const col = px + xx;
            if (col >= W) continue;
            const idx = (row * W + col) * 4;
            data[idx] = hex[0];
            data[idx + 1] = hex[1];
            data[idx + 2] = hex[2];
            data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // colorbar
    if (barCanvas) {
      const bw = 24 * dpr;
      const bh = (H - 60 * dpr);
      barCanvas.width = bw; barCanvas.height = bh;
      barCanvas.style.width = `24px`;
      barCanvas.style.height = `${bh / dpr}px`;
      const bctx = barCanvas.getContext("2d");
      if (bctx) {
        const steps = 256;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          const y = Math.floor(bh - t * bh);
          bctx.fillStyle = color(sMin + t * (sMax - sMin));
          bctx.fillRect(0, y, bw, Math.ceil(bh / steps) + 1);
        }
      }
    }
  }

  // ---------- render both panels ----------
  useEffect(() => {
    if (!bbox || pts.length === 0) return;
    const c1 = resRef.current, b1 = resBarRef.current;
    const c2 = ipRef.current,  b2 = ipBarRef.current;
    if (c1) {
      renderIDW({
        canvas: c1,
        barCanvas: b1 ?? undefined,
        pts,
        valueOf: (p) => p.rho ?? null,
        bbox,
        width,
        height: heightEach,
        step: stepRes,
        useLog: useLogRho,
        cmap: cmapRes,
        k: kNN,
        clipPct,
      });
    }
    if (c2 && gateName) {
      renderIDW({
        canvas: c2,
        barCanvas: b2 ?? undefined,
        pts,
        valueOf: (p) => p.ip?.[gateName] ?? null,
        bbox,
        width,
        height: heightEach,
        step: stepIP,
        useLog: false,
        cmap: cmapIP,
        k: kNN,
        clipPct,
      });
    } else if (c2) {
      // clear bottom if no IP
      const dpr = window.devicePixelRatio || 1;
      c2.width = Math.floor(width * dpr);
      c2.height = Math.floor(heightEach * dpr);
      c2.getContext("2d")?.clearRect(0,0,c2.width,c2.height);
    }
  }, [pts, bbox, width, heightEach, stepRes, stepIP, useLogRho, cmapRes, cmapIP, kNN, gateName, clipPct]);

  if (loading) return <div>Loading triangles…</div>;
  if (err)     return <div style={{color:"#b00"}}>{err}</div>;
  if (!bbox)   return <div>No data.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Resistivity panel */}
      <PanelHeader
        title="Resistivity"
        right={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Colormap:
              <select value={cmapRes} onChange={e => setCmapRes(e.target.value as CMapName)}>
                {Object.keys(CMAPS).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={useLogRho} onChange={e => setUseLogRho(e.target.checked)} />
              log10(ρ)
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Resolution:
              <input type="range" min={1} max={6} step={1} value={stepRes} onChange={e => setStepRes(+e.target.value)} />
              <span style={{ minWidth: 16, textAlign: "right" }}>{stepRes}</span>
            </label>
          </div>
        }
        stats={rhoStats ? `ρ min ${fmt(rhoStats.minV)} • med ${fmt(rhoStats.medV)} • max ${fmt(rhoStats.maxV)}` : "—"}
      />
      <div style={{ display: "grid", gridTemplateColumns: "auto 28px", gap: 8 }}>
        <canvas ref={resRef} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", paddingTop: 28 }}>
          <canvas ref={resBarRef} />
          <div style={{ fontSize: 12, marginTop: 6, color: "#666" }}>Color</div>
        </div>
      </div>

      {/* IP panel */}
      <PanelHeader
        title="Chargeability (IP)"
        right={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {gateNames.length > 0 ? (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 12, color: "#666" }}>Gate</div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, gateNames.length - 1)}
                    step={1}
                    value={gateIdx}
                    onChange={(e) => setGateIdx(+e.target.value)}
                    style={{ width: 240 }}
                  />
                  <div style={{ fontSize: 12 }}>
                    {gateNames[gateIdx] ?? "—"}
                  </div>
                </div>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  Colormap:
                  <select value={cmapIP} onChange={e => setCmapIP(e.target.value as CMapName)}>
                    {Object.keys(CMAPS).map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  Resolution:
                  <input type="range" min={1} max={6} step={1} value={stepIP} onChange={e => setStepIP(+e.target.value)} />
                  <span style={{ minWidth: 16, textAlign: "right" }}>{stepIP}</span>
                </label>
              </>
            ) : (
              <span style={{ color: "#a00" }}>No IP gates found in triangles.csv</span>
            )}
          </div>
        }
        stats={ipStats ? `M min ${fmt(ipStats.minV)} • med ${fmt(ipStats.medV)} • max ${fmt(ipStats.maxV)}` : "—"}
      />
      <div style={{ display: "grid", gridTemplateColumns: "auto 28px", gap: 8 }}>
        <canvas ref={ipRef} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", paddingTop: 28 }}>
          <canvas ref={ipBarRef} />
          <div style={{ fontSize: 12, marginTop: 6, color: "#666" }}>Color</div>
        </div>
      </div>

      {/* global controls */}
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Clip left/right (%) to hide edge curtains:
          <input type="range" min={0} max={15} step={1} value={clipPct} onChange={e => setClipPct(+e.target.value)} />
          <span style={{ minWidth: 24, textAlign: "right" }}>{clipPct}</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          k-NN:
          <input type="range" min={3} max={24} step={1} value={kNN} onChange={e => setKNN(+e.target.value)} />
          <span style={{ minWidth: 24, textAlign: "right" }}>{kNN}</span>
        </label>
      </div>
    </div>
  );
}

function PanelHeader({ title, right, stats }: { title: string; right?: React.ReactNode; stats?: string; }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div style={{ marginLeft: "auto" }}>{right}</div>
      <div style={{ fontSize: 12, color: "#666", marginLeft: 16 }}>{stats}</div>
    </div>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 0.01)) return v.toExponential(2);
  return v.toFixed(a < 1 ? 3 : 2);
}

function cssToRgb(css: string): [number, number, number] {
  // css like "rgb(12,34,56)" or "#rrggbb"
  if (css.startsWith("#")) {
    const r = parseInt(css.slice(1,3),16);
    const g = parseInt(css.slice(3,5),16);
    const b = parseInt(css.slice(5,7),16);
    return [r,g,b];
  }
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  // fallback
  return [128,128,128];
}
