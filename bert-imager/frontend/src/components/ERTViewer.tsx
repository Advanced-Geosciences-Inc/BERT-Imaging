import React, { useEffect, useMemo, useState } from "react";

// Simple CSV parser (no quotes handling needed for our numeric CSVs)
function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => line.split(","));
}

type Node = { x: number; z: number };
type Tri = { n0: number; n1: number; n2: number; rho: number };

function toNumber(s: string): number {
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`Non-finite number: ${s}`);
  return v;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
// Tiny 5-color palette (viridis-like-ish). Feel free to swap for your brand palette.
const PALETTE = ["#440154","#3b528b","#21918c","#5ec962","#fde725"];

function colorFor(value: number, vmin: number, vmax: number): string {
  if (vmax <= vmin) return PALETTE[0];
  let t = (value - vmin) / (vmax - vmin);
  t = Math.max(0, Math.min(1, t));
  const idx = Math.min(PALETTE.length - 2, Math.floor(t * (PALETTE.length - 1)));
  const localT = t * (PALETTE.length - 1) - idx;
  // simple step; no interpolation between hex for brevity
  return localT < 0.5 ? PALETTE[idx] : PALETTE[idx+1];
}

export default function ERTViewer({
  baseUrl,   // e.g. "http://localhost:8000"
  fileId,    // e.g. "stg-...."
  width = 900,
  height = 500,
}: { baseUrl: string; fileId: string; width?: number; height?: number; }) {

  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [tris, setTris] = useState<Tri[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setErr(null);
        // Hit results listing to get URLs
        const res = await fetch(`${baseUrl}/api/ert/results/${fileId}`);
        if (!res.ok) throw new Error(`results ${res.status}`);
        const listing = await res.json();
        const nodesUrl = listing.files?.mesh_nodes;
        const trisUrl = listing.files?.triangles || listing.files?.mesh_cells;
        if (!nodesUrl) throw new Error("Missing mesh_nodes URL");
        if (!trisUrl) throw new Error("Missing triangles URL (run newest backend)");

        const [nodesCsv, triCsv] = await Promise.all([
          fetch(`${baseUrl}${nodesUrl}`).then(r => r.text()),
          fetch(`${baseUrl}${trisUrl}`).then(r => r.text()),
        ]);

        // nodes
        const nRows = parseCSV(nodesCsv);
        const nHeader = nRows.shift()!;
        const xi = nHeader.indexOf("x"), zi = nHeader.indexOf("z");
        if (xi < 0 || zi < 0) throw new Error("mesh_nodes.csv missing x/z");
        const parsedNodes = nRows.map(r => ({ x: toNumber(r[xi]), z: toNumber(r[zi]) }));

        // triangles
        const tRows = parseCSV(triCsv);
        const tHeader = tRows.shift()!;
        const n0i = tHeader.indexOf("n0"), n1i = tHeader.indexOf("n1"), n2i = tHeader.indexOf("n2");
        const rhoi = tHeader.indexOf("rho");
        if (n0i < 0 || n1i < 0 || n2i < 0) throw new Error("triangles missing n0/n1/n2");
        if (rhoi < 0) throw new Error("triangles missing rho (update backend for triangles.csv)");
        const parsedTris = tRows.map(r => ({
          n0: toNumber(r[n0i]), n1: toNumber(r[n1i]), n2: toNumber(r[n2i]),
          rho: toNumber(r[rhoi]),
        }));

        if (!cancelled) {
          setNodes(parsedNodes);
          setTris(parsedTris);
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e.message || e));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [baseUrl, fileId]);

  const bbox = useMemo(() => {
    if (!nodes) return null;
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (const n of nodes) {
      if (n.x < xmin) xmin = n.x;
      if (n.x > xmax) xmax = n.x;
      if (n.z < zmin) zmin = n.z;
      if (n.z > zmax) zmax = n.z;
    }
    // pad a bit
    const dx = xmax - xmin || 1, dz = zmax - zmin || 1;
    return { xmin: xmin - 0.05*dx, xmax: xmax + 0.05*dx, zmin: zmin - 0.05*dz, zmax: zmax + 0.05*dz };
  }, [nodes]);

  const valueRange = useMemo(() => {
    if (!tris) return null;
    let vmin = Infinity, vmax = -Infinity;
    for (const t of tris) {
      if (t.rho < vmin) vmin = t.rho;
      if (t.rho > vmax) vmax = t.rho;
    }
    return { vmin, vmax };
  }, [tris]);

  if (err) return <div className="text-red-600">Error: {err}</div>;
  if (!nodes || !tris || !bbox || !valueRange) return <div>Loading…</div>;

  // map world→SVG
  const sx = (x: number) => {
    const { xmin, xmax } = bbox;
    return ((x - xmin) / (xmax - xmin)) * width;
  };
  // flip Z so positive depth is downward
  const sy = (z: number) => {
    const { zmin, zmax } = bbox;
    return height - ((z - zmin) / (zmax - zmin)) * height;
  };

  return (
    <div className="w-full">
      <div className="mb-2 text-sm text-gray-600">
        file: <code>{fileId}</code> &nbsp; | &nbsp;
        range: {valueRange.vmin.toFixed(2)} – {valueRange.vmax.toFixed(2)} Ω·m
      </div>
      <svg width={width} height={height} className="bg-white rounded-xl shadow">
        {tris.map((t, i) => {
          const a = nodes[t.n0], b = nodes[t.n1], c = nodes[t.n2];
          const fill = colorFor(t.rho, valueRange.vmin, valueRange.vmax);
          const pts = `${sx(a.x)},${sy(a.z)} ${sx(b.x)},${sy(b.z)} ${sx(c.x)},${sy(c.z)}`;
          return <polygon key={i} points={pts} fill={fill} stroke="none" />;
        })}
        {/* simple legend */}
        {PALETTE.map((c, i) => {
          const x0 = 20 + i * 22;
          return <rect key={i} x={x0} y={height - 20} width={22} height={12} fill={c} />;
        })}
        <text x={20} y={height - 24} fontSize={10} fill="#333">
          {valueRange.vmin.toFixed(1)}
        </text>
        <text x={20 + (PALETTE.length-1)*22} y={height - 24} fontSize={10} fill="#333" textAnchor="end">
          {valueRange.vmax.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}
