import React from "react";

interface HeroProps {
  vars: Record<string, any>;
}

export default function Hero({ vars }: HeroProps) {
  // Hero properties
  const heroStyles = (vars["hero-styles"] as Record<string, any>) || {};
  const content = (vars["hero-content"] as Record<string, any>) || {};
  const cta = (vars["call-to-action"] as Record<string, any>) || {};

  return (
    <section
      className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: heroStyles["background-color"] || "#000000",
        background: heroStyles["background-gradient"] || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      }}
    >
      <div className="max-w-4xl mx-auto text-center">
        {/* Main heading with gradient text */}
        <h1
          className="text-4xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-clip-text text-transparent leading-tight"
          style={{
            backgroundImage: content["title-gradient"] || "linear-gradient(135deg, #ffffff 0%, #a78bfa 50%, #ec4899 100%)",
            fontSize: content["title-font-size"] || "4rem",
            lineHeight: content["title-line-height"] || "1.1"
          }}
        >
          {content["title"] || "Software Engineer & Innovator"}
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg sm:text-xl lg:text-2xl mb-8 leading-relaxed"
          style={{
            color: content["subtitle-color"] || "#e5e7eb",
            fontSize: content["subtitle-font-size"] || "1.25rem",
            maxWidth: content["subtitle-max-width"] || "42rem"
          }}
        >
          {content["subtitle"] || "Building the future with cutting-edge technology and creative solutions. Passionate about innovation and delivering exceptional user experiences."}
        </p>

        {/* Call to action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            className="px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-300 hover:transform hover:scale-105 hover:shadow-lg"
            style={{
              backgroundColor: cta["primary-bg-color"] || "#8b5cf6",
              color: cta["primary-text-color"] || "#ffffff",
              border: cta["primary-border"] || "none"
            }}
          >
            {cta["primary-text"] || "View My Work"}
          </button>
          <button
            className="px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-300 hover:transform hover:scale-105 border-2"
            style={{
              backgroundColor: cta["secondary-bg-color"] || "transparent",
              color: cta["secondary-text-color"] || "#ffffff",
              borderColor: cta["secondary-border-color"] || "#8b5cf6"
            }}
          >
            {cta["secondary-text"] || "Get In Touch"}
          </button>
        </div>

        {/* Stats or additional info */}
        {content["show-stats"] && (
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: heroStyles["accent-color"] || "#8b5cf6" }}
              >
                {content["stat1-number"] || "50+"}
              </div>
              <div
                className="text-sm"
                style={{ color: content["stat-label-color"] || "#9ca3af" }}
              >
                {content["stat1-label"] || "Projects"}
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl font-bold"
                style={{ color: heroStyles["accent-color"] || "#8b5cf6" }}
              >
                {content["stat2-number"] || "3+"}
              </div>
              <div
                className="text-sm"
                style={{ color: content["stat-label-color"] || "#9ca3af" }}
              >
                {content["stat2-label"] || "Years Exp"}
              </div>
            </div>
            <div className="text-center col-span-2 sm:col-span-1">
              <div
                className="text-3xl font-bold"
                style={{ color: heroStyles["accent-color"] || "#8b5cf6" }}
              >
                {content["stat3-number"] || "100%"}
              </div>
              <div
                className="text-sm"
                style={{ color: content["stat-label-color"] || "#9ca3af" }}
              >
                {content["stat3-label"] || "Satisfaction"}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}