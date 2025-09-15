import React from "react";

interface AppProps {
  vars: Record<string, any>;
}

export default function App({ vars }: AppProps) {
  const rootStyles = (vars["root-styles"] as Record<string, any>) || {};
  const cssVars = {
    "--background-color": rootStyles["background-color"] ?? vars["background-color"] ?? "#ffffff",
    "--text-color": rootStyles["text-color"] ?? vars["text-color"] ?? "#000000",
    "--font-family": rootStyles["font-family"] ?? vars["font-family"] ?? "Arial",
    "--base-font-size": rootStyles["base-font-size"] ?? vars["base-font-size"] ?? "1rem",
  } as React.CSSProperties;

  return (
    <main
      id="app"
      style={cssVars}
      className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] antialiased"
    >
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: "var(--font-family)" }}>
            Hello World
          </h1>
          <p className="text-lg" style={{ fontFamily: "var(--font-family)" }}>
            Welcome to your Manta template
          </p>
        </div>
      </div>
    </main>
  );
}
