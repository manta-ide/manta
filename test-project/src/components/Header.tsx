import React, { useState, useEffect } from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function Header() {
  const [vars] = useVars();
  const headerStyles = (vars["header-styles"] as Record<string, any>) || {};
  const navLinks = (vars["nav-links"] as Array<{ label: string; href: string }>) || [];
  const logo = (vars["logo"] as Record<string, any>) || {};
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const cssVars = {
    "--header-background-color": headerStyles["background-color"] ?? "#1753a3",
    "--header-text-color": headerStyles["text-color"] ?? "#ffffff",
    "--header-height": headerStyles["height"] ?? "5rem",
    "--header-padding-x": headerStyles["padding-x"] ?? "2rem",
    "--logo-font-size": logo["font-size"] ?? "1.75rem",
    "--logo-font-weight": logo["font-weight"] ?? "bold",
  } as React.CSSProperties;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      id="node-1758061078838971"
      style={cssVars}
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? 'bg-white/90 backdrop-blur-md shadow-lg border-b border-white/20'
          : 'bg-transparent'
      }`}
    >
      <div
        className="container mx-auto flex items-center justify-between w-full px-[var(--header-padding-x)]"
        style={{ height: "var(--header-height)" }}
      >
        {/* Logo with modern styling */}
        <div
          className={`font-[var(--logo-font-weight)] transition-all duration-300 ${
            isScrolled ? 'text-gray-900' : 'text-[var(--header-text-color)]'
          } flex items-center space-x-2`}
          style={{
            fontSize: "var(--logo-font-size)",
            fontWeight: "var(--logo-font-weight)"
          }}
        >
          {/* Modern logo icon */}
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm`}>
            {(logo["text"] || "MyApp").charAt(0)}
          </div>
          <span className="text-gradient">{logo["text"] || "MyApp"}</span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-8">
          {navLinks.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className={`relative font-medium transition-all duration-300 hover:scale-105 ${
                isScrolled ? 'text-gray-700 hover:text-blue-600' : 'text-[var(--header-text-color)] hover:text-blue-200'
              } group`}
            >
              {link.label}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 group-hover:w-full"></span>
            </a>
          ))}

          {/* Modern CTA button */}
          <button className="modern-button px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-300">
            Get Started
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className={`md:hidden w-8 h-8 flex flex-col justify-center items-center transition-all duration-300 ${
            isScrolled ? 'text-gray-900' : 'text-[var(--header-text-color)]'
          }`}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle mobile menu"
        >
          <span className={`w-6 h-0.5 bg-current transition-all duration-300 ${isMobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
          <span className={`w-6 h-0.5 bg-current mt-1 transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}></span>
          <span className={`w-6 h-0.5 bg-current mt-1 transition-all duration-300 ${isMobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-md border-b border-gray-200/50 transition-all duration-300 ${
        isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}>
        <nav className="container mx-auto py-6 px-[var(--header-padding-x)]">
          <div className="flex flex-col space-y-4">
            {navLinks.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className="text-gray-700 hover:text-blue-600 font-medium py-2 transition-colors duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <button className="modern-button mt-4 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium w-full">
              Get Started
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}