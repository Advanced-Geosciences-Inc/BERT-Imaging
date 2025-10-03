// frontend/src/components/MeshSection.tsx
import React, { useEffect, useRef, useState } from "react";
import { csvParse } from "d3-dsv";

type Node = { x: number; z: number };
type Cell = [number, number, number];
type CellVal = { x: number; z: number; rho: number };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// quick grayscale, swap with your color map later
function gray(v: number) {
  const g = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${g},${g},${g})`;
}

export default function MeshSection({
  nodesUrl, cellsUrl, modelUrl, log10 = true, width = 900, height = 400
}: {
  nodesUrl: string; cellsUrl: string; modelUrl: string;
  log10?: boolean; width?: number; height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [vals, setVals] = useState<number[]>([]);
  const [bb, setBB] = useState<{xmin:number; xmax:number; zmin:number; zmax:number}>();

  // load CSVs
  useEffect(() => {
    (async () => {
      const [nTxt, cTxt, mTxt] = await Promise.all([
        fetch(nodesUrl).then(r => r.text()),
        fetch(cellsUrl).then(r => r.text()),
        fetch(modelUrl).then(r => r.text()),
      ]);

      const nRows = csvParse(nTxt);
      const nods = nRows.map(r => ({ x: +r.get("x")!, z: +r.get("z")! }));
      setNodes(nods);

      const cRows = csvParse(cTxt);
      const cls: Cell[] = cRows.map(r => [ +r.get("n0")!, +r.get("n1")!, +r.get("n2")! ]);
      setCells(cls);

      const mRows = csvParse(mTxt);
      // model_cells.csv: x,z,rho – value is per cell in file order
      const rhos = mRows.map(r => +r.get("rho")!);
      setVals(rhos);

      const xs = nods.map(n => n.x), zs = nods.map(n => n.z);
      setBB({ xmin: Math.min(...xs), xmax: Math.max(...xs),
              zmin: Math.min(...zs), zmax: Math.max(...zs) });
    })();
  }, [nodesUrl, cellsUrl, modelUrl]);

  // draw
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0 || cells.length === 0 || vals.length === 0 || !bb) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);

    // compute value range (log or linear)
    const rawVals = vals.slice();
    const vArr = rawVals.map(v => (log10 ? Math.log10(Math.max(v, 1e-12)) : v));
    const vmin = Math.min(...vArr), vmax = Math.max(...vArr);

    // world -> screen transform
    const pad = 20;
    const sx = (width - 2*pad) / (bb.xmax - bb.xmin || 1);
    const sz = (height - 2*pad) / ((bb.zmax - bb.zmin) || 1);
    function toScreen(n: Node) {
      const x = pad + (n.x - bb.xmin) * sx;
      // z increases downward in canvas
      const y = pad + (n.z - bb.zmin) * sz;
      return { x, y };
    }

    // draw each cell: fill with avg of its nodes’ surrounding cell value (use cell value directly)
    for (let i = 0; i < cells.length && i < vArr.length; i++) {
      const [a,b,c] = cells[i];
      const va = nodes[a], vb = nodes[b], vc = nodes[c];
      const pa = toScreen(va), pb = toScreen(vb), pc = toScreen(vc);

      // normalize value 0..1
      const t = (vArr[i] - vmin) / (vmax - vmin || 1);
      ctx.fillStyle = gray(t);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.lineTo(pc.x, pc.y);
      ctx.closePath();
      ctx.fill();
    }

    // axis baseline
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width-1, height-1);
  }, [nodes, cells, vals, bb, width, height, log10]);

  return <canvas ref={canvasRef} width={width} height={height} style={{width, height, border:"1px solid #ddd"}} />;
}
