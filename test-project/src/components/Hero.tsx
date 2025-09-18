import React from "react";
import { useVars } from '../lib/varsHmr';

export default function Hero() {
  const [vars] = useVars();
  const heroStyles = (vars["hero-styles"] as Record<string, any>) || {};
  const heroContent = (vars["hero-content"] as Record<string, any>) || {};
  const heroTypography = (vars["hero-typography"] as Record<string, any>) || {};

  const cssVars = {
    "--hero-gradient-start": heroStyles["background-gradient-start"] ?? "#667eea",
    "--hero-gradient-end": heroStyles["background-gradient-end"] ?? "#764ba2",
    "--hero-text-color": heroStyles["text-color"] ?? "#ffffff",
    "--hero-padding-y": heroStyles["padding-y"] ?? "5rem",
    "--hero-padding-x": heroStyles["padding-x"] ?? "2rem",
    "--hero-headline-size": heroTypography["headline-size"] ?? "3.5rem",
    "--hero-subheadline-size": heroTypography["subheadline-size"] ?? "1.25rem",
    "--hero-headline-weight": heroTypography["headline-weight"] ?? "bold",
    "--hero-text-align": heroTypography["text-align"] ?? "center",
  } as React.CSSProperties;

  return (
    <section
      id="node-1758061687539528"
      style={{
        ...cssVars,
        background: `linear-gradient(135deg, var(--hero-gradient-start), var(--hero-gradient-end))`,
      }}
      className="relative w-full text-[var(--hero-text-color)] py-[var(--hero-padding-y)] px-[var(--hero-padding-x)]"
    >
      <div className="max-w-4xl mx-auto">
        <div
          className="text-center"
          style={{
            textAlign: heroTypography["text-align"] as React.CSSProperties['textAlign'] || 'center'
          }}
        >
          <h1
            className="mb-6 font-[var(--hero-headline-weight)]"
            style={{
              fontSize: "var(--hero-headline-size)",
              fontWeight: "var(--hero-headline-weight)",
            }}
          >
            {heroContent["headline"] || "Welcome to Our Platform"}
          </h1>
          <p
            className="mb-8 opacity-90"
            style={{
              fontSize: "var(--hero-subheadline-size)",
            }}
          >
            {heroContent["subheadline"] || "Build amazing experiences with our powerful tools"}
          </p>
          <a
            href={heroContent["cta-href"] || "#start"}
            className="inline-block bg-white text-gray-900 font-semibold py-3 px-8 rounded-lg hover:bg-gray-100 transition-colors duration-200 shadow-lg"
          >
            {heroContent["cta-text"] || "Get Started"}
          </a>
        </div>
      </div>
    </section>
  );
}