import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import varsJson from "../_graph/vars.json";

function AppWrapper() {
  const [vars, setVars] = useState(varsJson);

  // Keep state in sync with file edits (optional — Vite already re-renders imports)
  if (import.meta.hot) {
    import.meta.hot.accept("../.graph/vars.json", (mod) =>
      setVars(mod!.default)
    );
  }

  return <App vars={vars} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
