// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root div #root not found in index.html");

ReactDOM.createRoot(root).render(<App />);
