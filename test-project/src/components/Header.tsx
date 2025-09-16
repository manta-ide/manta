import React from "react";

interface HeaderProps {
  vars: Record<string, any>;
}

export default function Header({ vars }: HeaderProps) {
  // Header properties
  const headerStyles = (vars["header-styles"] as Record<string, any>) || {};
  const navigation = (vars["navigation"] as any[]) || [];
  const logo = (vars["logo"] as Record<string, any>) || {};

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: headerStyles["background-color"] || "rgba(255, 255, 255, 0.1)",
        borderColor: headerStyles["border-color"] || "rgba(255, 255, 255, 0.2)",
        background: headerStyles["gradient"] || "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))"
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <span
              className="text-xl font-bold"
              style={{
                color: logo["text-color"] || "#ffffff",
                fontSize: logo["font-size"] || "1.25rem"
              }}
            >
              {logo["text"] || "Portfolio"}
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navigation.map((item, index) => (
                <a
                  key={index}
                  href={item.url || "#"}
                  className="px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 hover:bg-white/10"
                  style={{
                    color: item["text-color"] || "#ffffff",
                    fontSize: item["font-size"] || "0.875rem"
                  }}
                >
                  {item.label || `Nav ${index + 1}`}
                </a>
              ))}
            </div>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              className="p-2 rounded-md text-white hover:bg-white/10"
              style={{ color: headerStyles["text-color"] || "#ffffff" }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}