// frontend/src/App.tsx
import React from "react";
import ResIP from "./pages/ResIP";

export default function App() {
  const fileUrls = {
    model_cells: "/results/stg-3fdf0be11ffbd7bc351400cfbf9b37b2a9523da8/inversion/model_cells.csv",
    mesh_nodes:  "/results/stg-3fdf0be11ffbd7bc351400cfbf9b37b2a9523da8/inversion/mesh_nodes.csv",
    mesh_cells:  "/results/stg-3fdf0be11ffbd7bc351400cfbf9b37b2a9523da8/inversion/mesh_cells_connectivity.csv",
    triangles:   "/results/stg-3fdf0be11ffbd7bc351400cfbf9b37b2a9523da8/inversion/triangles.csv",
  };

  return (
    <div style={{ padding: 12, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>BERT Imager</h1>
      <ResIP fileUrls={fileUrls} />
    </div>
  );
}
