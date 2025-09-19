import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function TestSection() {
  const [vars] = useVars();
  const nodeId = "node-1758261265711502";

  // Get properties for this specific node
  const title = vars["title"] ?? "Test Section";
  const description = vars["description"] ?? "This is a test section component that can be customized through the CMS interface.";
  const backgroundColor = vars["background-color"] ?? "#ffffff";
  const textColor = vars["text-color"] ?? "#333333";
  const padding = vars["padding"] ?? "md";
  const borderRadius = vars["border-radius"] ?? 8;
  const visible = vars["visible"] ?? true;
  const centered = vars["centered"] ?? false;
  const styles = (vars["styles"] as Record<string, any>) || {};

  // Advanced styles
  const borderColor = styles["border-color"] ?? "#e5e5e5";
  const borderWidth = styles["border-width"] ?? 1;
  const showShadow = styles["shadow"] ?? false;

  // Convert padding to actual values
  const paddingMap = {
    sm: "1rem",
    md: "2rem",
    lg: "3rem",
    xl: "4rem"
  };

  const paddingValue = paddingMap[padding as keyof typeof paddingMap] || paddingMap.md;

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  const cssVars = {
    "--test-bg-color": backgroundColor,
    "--test-text-color": textColor,
    "--test-padding": paddingValue,
    "--test-border-radius": `${borderRadius}px`,
    "--test-border-color": borderColor,
    "--test-border-width": `${borderWidth}px`,
  } as React.CSSProperties;

  return (
    <section
      id={nodeId}
      style={{
        ...cssVars,
        backgroundColor: "var(--test-bg-color)",
        color: "var(--test-text-color)",
        padding: "var(--test-padding)",
        borderRadius: "var(--test-border-radius)",
        border: `var(--test-border-width) solid var(--test-border-color)`,
        boxShadow: showShadow ? "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" : "none",
      }}
      className={`w-full ${centered ? "text-center" : ""}`}
    >
      <div className={`max-w-4xl ${centered ? "mx-auto" : ""}`}>
        <h2 className="text-2xl font-bold mb-4">
          {title}
        </h2>
        <p className="text-base leading-relaxed">
          {description}
        </p>
      </div>
    </section>
  );
}