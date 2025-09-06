import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getInitialVars, subscribeVars, enableParentVarBridge } from "./lib/varsHmr.ts";

function AppWrapper() {
  const [vars, setVars] = useState(getInitialVars());

  useEffect(() => {
    // Enable bridge first so subscribeVars can disable polling and avoid duplicate inits
    enableParentVarBridge();
    subscribeVars((next) => setVars(next));
  }, []);

  return <App vars={vars} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
