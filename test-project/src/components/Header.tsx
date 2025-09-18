import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function Header() {
  const [vars] = useVars();
  const headerStyles = (vars["header-styles"] as Record<string, any>) || {};
  const navLinks = (vars["nav-links"] as Array<{ label: string; href: string }>) || [];
  const logo = (vars["logo"] as Record<string, any>) || {};

  const cssVars = {
    "--header-background-color": headerStyles["background-color"] ?? "#000000",
    "--header-text-color": headerStyles["text-color"] ?? "#ffffff",
    "--header-height": headerStyles["height"] ?? "4rem",
    "--header-padding-x": headerStyles["padding-x"] ?? "1rem",
    "--logo-font-size": logo["font-size"] ?? "1.5rem",
    "--logo-font-weight": logo["font-weight"] ?? "bold",
  } as React.CSSProperties;

  return (
    <header
      id="node-1758061078838971"
      style={cssVars}
      className="w-full bg-[var(--header-background-color)] text-[var(--header-text-color)] shadow-sm"
    >
      <div
        className="flex items-center justify-between w-full px-[var(--header-padding-x)]"
        style={{ height: "var(--header-height)" }}
      >
        {/* Logo */}
        <div
          className="font-[var(--logo-font-weight)]"
          style={{
            fontSize: "var(--logo-font-size)",
            fontWeight: "var(--logo-font-weight)"
          }}
        >
          {logo["text"] || "MyApp"}
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center space-x-6">
          {navLinks.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className="hover:opacity-80 transition-opacity duration-200 text-[var(--header-text-color)]"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}