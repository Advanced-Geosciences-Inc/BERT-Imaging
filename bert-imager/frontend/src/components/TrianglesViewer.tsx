import React, { useEffect, useMemo, useRef, useState } from "react";
import { csvParse } from "d3-dsv";
import { extent, median } from "d3-array";
import { scaleSequential, scaleLinear } from "d3-scale";
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateMagma,
  interpolateCividis,
} from "d3-scale-chromatic";

type Tri = {
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  rho: number;
};

type Props = {
  trianglesUrl: string;
  width?: number;   // CSS pixels
  height?: number;  // CSS pixels
};

const CMAPS = {
  viridis: interpolateViridis,
  plasma: interpolatePlasma,
  inferno: interpolateInferno,
  magma: interpolateMagma,
  cividis: interpolateCividis,
};

type CMapName = keyof typeof CMAPS;

export default function TrianglesViewer({
  trianglesUrl,
  width = 900,
  height = 500,
}: Props) {
  const [tris, setTris] = useState<Tri[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [cmap, setCmap] = useState<CMapName>("viridis");
  const [useLog, setUseLog] = useState(true);
  const [showWire, setShowWire] = useState(false);
  const [clipPct, setClipPct] = useState(0); // % to clip from left/right

  // fetch data
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const txt = await fetch(trianglesUrl).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        });
        const rows = csvParse(txt);
        const parsed: Tri[] = rows.map((r: any) => ({
          x1: +r.x1, y1: +r.y1,
          x2: +r.x2, y2: +r.y2,
          x3: +r.x3, y3: +r.y3,
          rho: +r.rho,
        })).filter(t => Number.isFinite(t.rho));
        if (alive) setTris(parsed);
      } catch (e: any) {
        if (alive) setError(`Failed to load triangles: ${e.message ?? e}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [trianglesUrl]);

  // geometry & value stats
  const bbox = useMemo(() => {
    if (tris.length === 0) return null;
    const xs = tris.flatMap(t => [t.x1, t.x2, t.x3]);
    const ys = tris.flatMap(t => [t.y1, t.y2, t.y3]);
    const [minX, maxX] = extent(xs) as [number, number];
    const [minY, maxY] = extent(ys) as [number, number];
    return { minX, maxX, minY, maxY };
  }, [tris]);

  const stats = useMemo(() => {
    if (tris.length === 0) return null;
    const vals = tris.map(t => t.rho).filter(Number.isFinite);
    const [minV, maxV] = extent(vals) as [number, number];
    const medV = median(vals);
    return { minV, maxV, medV: medV ?? (minV + maxV) / 2 };
  }, [tris]);

  // canvas + colorbar refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barRef = useRef<HTMLCanvasElement | null>(null);

  // helpers
  const deviceW = width * window.devicePixelRatio;
  const deviceH = height * window.devicePixelRatio;

  const padding = 30; // px in data space later via scales

  // draw
  useEffect(() => {
    if (!bbox || !stats) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // Size the canvas for HiDPI
    cvs.width = deviceW;
    cvs.height = deviceH;
    cvs.style.width = `${width}px`;
    cvs.style.height = `${height}px`;

    // Build scales (y increases downward on screen)
    const clipX = (bbox.maxX - bbox.minX) * (clipPct / 100);
    const dataMinX = bbox.minX + clipX;
    const dataMaxX = bbox.maxX - clipX;

    const xScale = scaleLinear()
      .domain([dataMinX, dataMaxX])
      .range([padding, deviceW - padding]);

    const yScale = scaleLinear()
      .domain([bbox.maxY, bbox.minY]) // invert so shallow is up
      .range([deviceH - padding, padding]);

    // Color scale
    let vMin = stats.minV, vMax = stats.maxV;
    // Avoid log of <= 0
    if (useLog) {
      const positive = tris.map(t => t.rho).filter(v => v > 0 && Number.isFinite(v));
      if (positive.length > 0) {
        const [lo, hi] = extent(positive) as [number, number];
        vMin = lo; vMax = hi;
      }
    }
    const toScalar = (v: number) => useLog ? Math.log10(Math.max(v, Number.EPSILON)) : v;
    const sMin = toScalar(vMin);
    const sMax = toScalar(vMax);
    const color = scaleSequential(CMAPS[cmap]).domain([sMin, sMax]);

    // Clear
    ctx.clearRect(0, 0, deviceW, deviceH);
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, deviceW, deviceH);

    // Draw triangles
    for (const t of tris) {
      // skip clipped by x
      const cx = (t.x1 + t.x2 + t.x3) / 3;
      if (cx < dataMinX || cx > dataMaxX) continue;

      const val = toScalar(t.rho);
      ctx.beginPath();
      ctx.moveTo(xScale(t.x1), yScale(t.y1));
      ctx.lineTo(xScale(t.x2), yScale(t.y2));
      ctx.lineTo(xScale(t.x3), yScale(t.y3));
      ctx.closePath();

      ctx.fillStyle = color(val);
      ctx.fill();

      if (showWire) {
        ctx.lineWidth = 1 * window.devicePixelRatio;
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.stroke();
      }
    }

    // Axes (simple ticks)
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1 * window.devicePixelRatio;
    // X axis
    ctx.beginPath();
    ctx.moveTo(padding, deviceH - padding);
    ctx.lineTo(deviceW - padding, deviceH - padding);
    ctx.stroke();
    // Y axis
    ctx.beginPath();
    ctx.moveTo(padding, deviceH - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();

    ctx.restore();

    // Draw colorbar
    const bar = barRef.current;
    if (bar) {
      const bw = 24 * window.devicePixelRatio;
      const bh = deviceH - 2 * padding;
      bar.width = bw;
      bar.height = bh;
      bar.style.width = `${24}px`;
      bar.style.height = `${(bh / window.devicePixelRatio)}px`;

      const bctx = bar.getContext("2d");
      if (bctx) {
        const steps = 256;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          const y = bh - t * bh;
          bctx.fillStyle = color(sMin + t * (sMax - sMin));
          bctx.fillRect(0, Math.floor(y), bw, Math.ceil(bh / steps) + 1);
        }
      }
    }
  }, [tris, bbox, stats, cmap, useLog, showWire, clipPct, width, height, deviceW, deviceH]);

  if (loading) return <div className="p-2 text-sm">Loading triangles…</div>;
  if (error) return <div className="p-2 text-sm text-red-600">{error}</div>;
  if (tris.length === 0) return <div className="p-2 text-sm">No triangles found.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 28px", gap: 8 }}>
      <div>
        <Toolbar
          cmap={cmap}
          setCmap={setCmap}
          useLog={useLog}
          setUseLog={setUseLog}
          showWire={showWire}
          setShowWire={setShowWire}
          clipPct={clipPct}
          setClipPct={setClipPct}
          stats={stats!}
        />
        <div style={{ position: "relative", border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", paddingTop: 28 }}>
        <canvas ref={barRef} />
        <ColorbarTicks stats={stats!} useLog={useLog} />
      </div>
    </div>
  );
}

function Toolbar(props: {
  cmap: CMapName; setCmap: (v: CMapName) => void;
  useLog: boolean; setUseLog: (v: boolean) => void;
  showWire: boolean; setShowWire: (v: boolean) => void;
  clipPct: number; setClipPct: (v: number) => void;
  stats: { minV: number; maxV: number; medV: number; };
}) {
  const { cmap, setCmap, useLog, setUseLog, showWire, setShowWire, clipPct, setClipPct, stats } = props;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        Colormap:
        <select value={cmap} onChange={e => setCmap(e.target.value as CMapName)}>
          {Object.keys(CMAPS).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={useLog} onChange={e => setUseLog(e.target.checked)} />
        log10(ρ)
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={showWire} onChange={e => setShowWire(e.target.checked)} />
        wireframe
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        clip margin (% left/right):
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          value={clipPct}
          onChange={e => setClipPct(+e.target.value)}
        />
        <span style={{ minWidth: 24, textAlign: "right" }}>{clipPct}</span>
      </label>
      <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
        ρ min {fmt(stats.minV)} • med {fmt(stats.medV)} • max {fmt(stats.maxV)}
      </span>
    </div>
  );
}

function ColorbarTicks({ stats, useLog }: { stats: { minV: number; maxV: number; medV: number }, useLog: boolean }) {
  const ticks = useMemo(() => {
    const arr = [stats.minV, stats.medV, stats.maxV];
    return arr.map(v => ({ v, label: useLog ? `10^${fmt(Math.log10(Math.max(v, Number.EPSILON)))}` : fmt(v) }));
  }, [stats, useLog]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* top (max) */}
      <div style={{ fontSize: 12 }}>{ticks[2].label}</div>
      {/* middle */}
      <div style={{ fontSize: 12, marginTop: "auto", marginBottom: "auto" }}>{ticks[1].label}</div>
      {/* bottom (min) */}
      <div style={{ fontSize: 12 }}>{ticks[0].label}</div>
    </div>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000 || (a > 0 && a < 0.01)) return v.toExponential(2);
  return v.toFixed(a < 1 ? 3 : 2);
}
