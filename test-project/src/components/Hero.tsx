import React, { useEffect, useState } from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function Hero() {
  const [vars] = useVars();
  const heroStyles = (vars["hero-styles"] as Record<string, any>) || {};
  const heroContent = (vars["hero-content"] as Record<string, any>) || {};
  const heroTypography = (vars["hero-typography"] as Record<string, any>) || {};
  const [isVisible, setIsVisible] = useState(false);

  const cssVars = {
    "--hero-gradient-start": heroStyles["background-gradient-start"] ?? "#667eea",
    "--hero-gradient-end": heroStyles["background-gradient-end"] ?? "#764ba2",
    "--hero-text-color": heroStyles["text-color"] ?? "#ffffff",
    "--hero-padding-y": heroStyles["padding-y"] ?? "8rem",
    "--hero-padding-x": heroStyles["padding-x"] ?? "2rem",
    "--hero-headline-size": heroTypography["headline-size"] ?? "4rem",
    "--hero-subheadline-size": heroTypography["subheadline-size"] ?? "1.375rem",
    "--hero-headline-weight": heroTypography["headline-weight"] ?? "800",
    "--hero-text-align": heroTypography["text-align"] ?? "center",
  } as React.CSSProperties;

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section
      id="node-1758061687539528"
      className="relative w-full overflow-hidden"
      style={{
        marginTop: "5rem", // Account for fixed header
        minHeight: "calc(100vh - 5rem)",
      }}
    >
      {/* Modern gradient background with mesh overlay */}
      <div
        className="absolute inset-0 gradient-mesh"
        style={{
          background: `
            linear-gradient(135deg, var(--hero-gradient-start), var(--hero-gradient-end)),
            radial-gradient(ellipse at top left, rgba(120, 119, 198, 0.3), transparent 50%),
            radial-gradient(ellipse at top right, rgba(255, 154, 158, 0.3), transparent 50%),
            radial-gradient(ellipse at center right, rgba(255, 206, 84, 0.3), transparent 50%),
            radial-gradient(ellipse at center left, rgba(148, 187, 233, 0.3), transparent 50%)
          `
        }}
      />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0s', animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s', animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s', animationDuration: '5s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-full py-[var(--hero-padding-y)] px-[var(--hero-padding-x)]">
        <div className="max-w-6xl mx-auto">
          <div
            className={`text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            style={{
              textAlign: heroTypography["text-align"] as React.CSSProperties['textAlign'] || 'center'
            }}
          >
            {/* Badge */}
            <div className={`inline-flex items-center px-4 py-2 mb-8 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 text-white/90 text-sm font-medium transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transitionDelay: '0.2s' }}>
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
              Now Available
            </div>

            {/* Main Headline */}
            <h1
              className={`mb-8 font-[var(--hero-headline-weight)] leading-tight transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
              style={{
                fontSize: "var(--hero-headline-size)",
                fontWeight: "var(--hero-headline-weight)",
                color: "var(--hero-text-color)",
                transitionDelay: '0.4s',
                textShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
              }}
            >
              <span className="block">
                {heroContent["headline"] || "Welcome to Our Platform"}
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className={`mb-12 text-white/90 max-w-3xl mx-auto leading-relaxed transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
              style={{
                fontSize: "var(--hero-subheadline-size)",
                transitionDelay: '0.6s'
              }}
            >
              {heroContent["subheadline"] || "Build amazing experiences with our powerful tools"}
            </p>

            {/* CTA Buttons */}
            <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transitionDelay: '0.8s' }}>
              <a
                href={heroContent["cta-href"] || "#start"}
                className="modern-button group px-8 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-50 transition-all duration-300 shadow-2xl hover:shadow-3xl inline-flex items-center space-x-2"
              >
                <span>{heroContent["cta-text"] || "Get Started"}</span>
                <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>

              <button className="group px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 transition-all duration-300 backdrop-blur-sm inline-flex items-center space-x-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Watch Demo</span>
              </button>
            </div>

            {/* Features highlight */}
            <div className={`mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ transitionDelay: '1s' }}>
              {[
                { icon: "⚡", title: "Lightning Fast", description: "Optimized for speed" },
                { icon: "🔒", title: "Secure", description: "Enterprise-grade security" },
                { icon: "🎨", title: "Customizable", description: "Fully customizable design" }
              ].map((feature, index) => (
                <div key={index} className={`text-center transition-all duration-500 stagger-${index + 1}`}>
                  <div className="text-4xl mb-3 float-animation" style={{ animationDelay: `${index * 0.5}s` }}>
                    {feature.icon}
                  </div>
                  <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
                  <p className="text-white/80 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave decoration */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
          <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="currentColor" className="text-white"/>
        </svg>
      </div>
    </section>
  );
}