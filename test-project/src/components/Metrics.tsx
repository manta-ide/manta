import React from "react";

interface MetricsProps {
  vars: Record<string, any>;
}

export default function Metrics({ vars }: MetricsProps) {
  // Metrics properties
  const metricsStyles = (vars["metrics-styles"] as Record<string, any>) || {};
  const metrics = (vars["metrics-data"] as any[]) || [];
  const content = (vars["metrics-content"] as Record<string, any>) || {};

  // Default metrics if none provided
  const defaultMetrics = [
    {
      number: "100+",
      label: "Projects Completed",
      description: "Successfully delivered projects across various technologies",
      icon: "📊"
    },
    {
      number: "5+",
      label: "Years Experience",
      description: "Building scalable applications and leading development teams",
      icon: "💼"
    },
    {
      number: "50+",
      label: "Happy Clients",
      description: "Satisfied clients from startups to enterprise companies",
      icon: "⭐"
    },
    {
      number: "$2M+",
      label: "Value Delivered",
      description: "Contributed to products generating significant revenue",
      icon: "💰"
    }
  ];

  const displayMetrics = metrics.length > 0 ? metrics : defaultMetrics;

  return (
    <section
      className="py-16 lg:py-24"
      style={{
        backgroundColor: metricsStyles["background-color"] || "#1f2937",
        background: metricsStyles["background-gradient"] || "linear-gradient(135deg, #1f2937 0%, #111827 100%)"
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4"
            style={{
              color: content["title-color"] || "#ffffff",
              fontSize: content["title-font-size"] || "3rem"
            }}
          >
            {content["title"] || "Impact & Achievements"}
          </h2>
          <p
            className="text-lg sm:text-xl max-w-3xl mx-auto"
            style={{
              color: content["subtitle-color"] || "#9ca3af",
              fontSize: content["subtitle-font-size"] || "1.125rem"
            }}
          >
            {content["subtitle"] || "Numbers that reflect my commitment to excellence and continuous growth in software engineering."}
          </p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {displayMetrics.map((metric, index) => (
            <div
              key={index}
              className="text-center p-6 rounded-xl backdrop-blur-sm border transition-all duration-300 hover:transform hover:scale-105"
              style={{
                backgroundColor: metricsStyles["card-bg-color"] || "rgba(255, 255, 255, 0.05)",
                borderColor: metricsStyles["card-border-color"] || "rgba(255, 255, 255, 0.1)",
                boxShadow: metricsStyles["card-shadow"] || "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
              }}
            >
              {/* Icon */}
              <div
                className="text-4xl mb-4"
                style={{ fontSize: metricsStyles["icon-size"] || "2.5rem" }}
              >
                {metric.icon || "📈"}
              </div>

              {/* Number */}
              <div
                className="text-3xl sm:text-4xl font-bold mb-2"
                style={{
                  color: metricsStyles["number-color"] || "#8b5cf6",
                  fontSize: metricsStyles["number-font-size"] || "2.25rem",
                  background: metricsStyles["number-gradient"] && `linear-gradient(135deg, ${metricsStyles["number-gradient"]})`,
                  backgroundClip: metricsStyles["number-gradient"] && "text",
                  WebkitBackgroundClip: metricsStyles["number-gradient"] && "text",
                  WebkitTextFillColor: metricsStyles["number-gradient"] && "transparent"
                }}
              >
                {metric.number}
              </div>

              {/* Label */}
              <div
                className="text-lg font-semibold mb-2"
                style={{
                  color: metricsStyles["label-color"] || "#ffffff",
                  fontSize: metricsStyles["label-font-size"] || "1.125rem"
                }}
              >
                {metric.label}
              </div>

              {/* Description */}
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: metricsStyles["description-color"] || "#9ca3af",
                  fontSize: metricsStyles["description-font-size"] || "0.875rem"
                }}
              >
                {metric.description}
              </p>
            </div>
          ))}
        </div>

        {/* Additional CTA or info */}
        {content["show-cta"] && (
          <div className="text-center mt-16">
            <button
              className="px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-300 hover:transform hover:scale-105"
              style={{
                backgroundColor: content["cta-bg-color"] || "#8b5cf6",
                color: content["cta-text-color"] || "#ffffff",
                border: content["cta-border"] || "none"
              }}
            >
              {content["cta-text"] || "Let's Work Together"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}