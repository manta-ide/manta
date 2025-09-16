import React from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Metrics from "./components/Metrics";
import Footer from "./components/Footer";

interface AppProps {
  vars: Record<string, any>;
}

export default function App({ vars }: AppProps) {
  // Portfolio Page properties
  const rootStyles = (vars["root-styles"] as Record<string, any>) || {};

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: rootStyles["background-color"] || "#000000",
        background: rootStyles["background-gradient"] || "linear-gradient(135deg, #000000 0%, #1f2937 100%)"
      }}
    >
      <Header vars={vars} />
      <Hero vars={vars} />
      <Metrics vars={vars} />
      <Footer vars={vars} />
    </div>
  );
}
