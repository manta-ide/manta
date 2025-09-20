import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function Footer() {
  const [vars] = useVars();
  const footerStyles = (vars["footer-styles"] as Record<string, any>) || {};
  const footerContent = (vars["footer-content"] as Record<string, any>) || {};
  const socialLinks = (vars["social-links"] as Array<Record<string, any>>) || [];

  const cssVars = {
    "--footer-bg-color": footerStyles["background-color"] ?? "#1f2937",
    "--footer-text-color": footerStyles["text-color"] ?? "#f9fafb",
    "--footer-border-color": footerStyles["border-color"] ?? "#374151",
    "--footer-padding-y": footerStyles["padding-y"] ?? "3rem",
    "--footer-padding-x": footerStyles["padding-x"] ?? "2rem",
    "--footer-link-color": footerStyles["link-color"] ?? "#60a5fa",
    "--footer-link-hover-color": footerStyles["link-hover-color"] ?? "#93c5fd",
  } as React.CSSProperties;

  const renderSocialIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'facebook':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'twitter':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
          </svg>
        );
      case 'instagram':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987s11.987-5.367 11.987-11.987C24.014 5.367 18.647.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.563-3.239-1.455C4.42 14.645 3.895 13.494 3.895 12.197c0-1.297.525-2.448 1.314-3.239.791-.892 1.942-1.455 3.239-1.455s2.448.563 3.239 1.455c.789.791 1.314 1.942 1.314 3.239 0 1.297-.525 2.448-1.314 3.239-.791.892-1.942 1.455-3.239 1.455zm7.072 0c-1.297 0-2.448-.563-3.239-1.455-.789-.791-1.314-1.942-1.314-3.239 0-1.297.525-2.448 1.314-3.239.791-.892 1.942-1.455 3.239-1.455s2.448.563 3.239 1.455c.789.791 1.314 1.942 1.314 3.239 0 1.297-.525 2.448-1.314 3.239-.791.892-1.942 1.455-3.239 1.455z"/>
          </svg>
        );
      case 'linkedin':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        );
      case 'github':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        );
      case 'youtube':
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.374 0 0 5.373 0 12s5.374 12 12 12 12-5.373 12-12S18.626 0 12 0zm5.568 8.16c-.169 1.858-.896 3.64-2.124 5.07a7.935 7.935 0 01-5.29 2.267 7.935 7.935 0 01-5.29-2.268c-1.228-1.43-1.955-3.212-2.124-5.07-.05-.542.375-.98.92-.98h.141c.461 0 .847.338.918.793.224 1.41.813 2.652 1.626 3.53.817.882 1.887 1.367 3.08 1.367s2.263-.485 3.08-1.368c.813-.877 1.402-2.119 1.626-3.529.071-.455.457-.793.918-.793h.141c.545 0 .97.438.92.98z"/>
          </svg>
        );
    }
  };

  return (
    <footer
      id="node-1758329851379349"
      style={cssVars}
      className="bg-[var(--footer-bg-color)] text-[var(--footer-text-color)] py-[var(--footer-padding-y)] px-[var(--footer-padding-x)] border-t border-[var(--footer-border-color)]"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company Info */}
          <div>
            <h3 className="text-lg font-semibold mb-4">
              {footerContent["company-name"] || "Your Company"}
            </h3>
            <p className="text-sm opacity-80 mb-4">
              {footerContent["company-description"] || "Building amazing experiences for our customers."}
            </p>
            <p className="text-sm opacity-60">
              {footerContent["copyright"] || `© ${new Date().getFullYear()} Your Company. All rights reserved.`}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href={footerContent["link-about-href"] || "#about"}
                  className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                >
                  {footerContent["link-about-text"] || "About"}
                </a>
              </li>
              <li>
                <a
                  href={footerContent["link-services-href"] || "#services"}
                  className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                >
                  {footerContent["link-services-text"] || "Services"}
                </a>
              </li>
              <li>
                <a
                  href={footerContent["link-contact-href"] || "#contact"}
                  className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                >
                  {footerContent["link-contact-text"] || "Contact"}
                </a>
              </li>
              <li>
                <a
                  href={footerContent["link-privacy-href"] || "#privacy"}
                  className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                >
                  {footerContent["link-privacy-text"] || "Privacy Policy"}
                </a>
              </li>
            </ul>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Follow Us</h3>
            <div className="flex space-x-4">
              {socialLinks.length > 0 ? (
                socialLinks.map((link, index) => (
                  <a
                    key={index}
                    href={link.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                    title={link.platform || "Social Link"}
                  >
                    {renderSocialIcon(link.platform || "default")}
                  </a>
                ))
              ) : (
                // Default social links
                <>
                  <a
                    href="#"
                    className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                    title="Facebook"
                  >
                    {renderSocialIcon("facebook")}
                  </a>
                  <a
                    href="#"
                    className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                    title="Twitter"
                  >
                    {renderSocialIcon("twitter")}
                  </a>
                  <a
                    href="#"
                    className="text-[var(--footer-link-color)] hover:text-[var(--footer-link-hover-color)] transition-colors duration-200"
                    title="LinkedIn"
                  >
                    {renderSocialIcon("linkedin")}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}