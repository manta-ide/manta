import React from "react";
import { useVars } from '../../_graph/varsHmr.ts';

export default function Footer() {
  const [vars] = useVars();
  const footerStyles = (vars["footer-styles"] as Record<string, any>) || {};
  const companyInfo = (vars["company-info"] as Record<string, any>) || {};
  const socialLinks = (vars["social-links"] as Array<{ platform: string; url: string; label: string }>) || [];
  const footerLinks = (vars["footer-links"] as Array<{ label: string; href: string }>) || [];
  const layoutOptions = (vars["layout-options"] as Record<string, any>) || {};

  const cssVars = {
    "--footer-background-color": footerStyles["background-color"] ?? "#1f2937",
    "--footer-text-color": footerStyles["text-color"] ?? "#e5e7eb",
    "--footer-border-color": footerStyles["border-color"] ?? "#374151",
    "--footer-padding-y": footerStyles["padding-y"] ?? "3rem",
    "--footer-padding-x": footerStyles["padding-x"] ?? "1rem",
    "--footer-max-width": layoutOptions["max-width"] ?? "1200px",
    "--social-icon-size": layoutOptions["social-icon-size"] ?? "1.5rem",
  } as React.CSSProperties;

  // Social media platform icons (using simple SVG icons)
  const getSocialIcon = (platform: string) => {
    const iconProps = {
      width: "var(--social-icon-size)",
      height: "var(--social-icon-size)",
      fill: "currentColor",
      viewBox: "0 0 24 24"
    };

    switch (platform.toLowerCase()) {
      case 'twitter':
        return (
          <svg {...iconProps}>
            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
          </svg>
        );
      case 'facebook':
        return (
          <svg {...iconProps}>
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'instagram':
        return (
          <svg {...iconProps}>
            <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987s11.987-5.367 11.987-11.987C24.014 5.367 18.647.001 12.017.001zM8.449 12.013c0-1.97 1.594-3.564 3.564-3.564s3.564 1.594 3.564 3.564-1.594 3.564-3.564 3.564-3.564-1.594-3.564-3.564zm7.05-5.25a1.188 1.188 0 01-1.188-1.188c0-.656.532-1.188 1.188-1.188s1.188.532 1.188 1.188c0 .656-.532 1.188-1.188 1.188zm1.188 1.719h-1.969c-.281-.656-.938-1.125-1.719-1.125s-1.438.469-1.719 1.125H8.311c-.281 0-.531.25-.531.531v6.563c0 .281.25.531.531.531h7.375c.281 0 .531-.25.531-.531V8.013c0-.281-.25-.531-.531-.531z"/>
          </svg>
        );
      case 'linkedin':
        return (
          <svg {...iconProps}>
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        );
      case 'youtube':
        return (
          <svg {...iconProps}>
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'github':
        return (
          <svg {...iconProps}>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
        );
      case 'discord':
        return (
          <svg {...iconProps}>
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
          </svg>
        );
      default:
        return (
          <svg {...iconProps}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
    }
  };

  return (
    <footer
      id="node-1758263206849459"
      style={cssVars}
      className={`w-full bg-[var(--footer-background-color)] text-[var(--footer-text-color)] ${
        layoutOptions["show-border-top"] ? "border-t border-[var(--footer-border-color)]" : ""
      }`}
    >
      <div
        className={`w-full px-[var(--footer-padding-x)] py-[var(--footer-padding-y)] ${
          layoutOptions["center-content"] ? "mx-auto" : ""
        }`}
        style={{
          maxWidth: layoutOptions["center-content"] ? "var(--footer-max-width)" : "100%"
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Company Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--footer-text-color)]">
              {companyInfo["name"] || "MyCompany"}
            </h3>
            <p className="text-sm opacity-90">
              {companyInfo["description"] || "Building amazing digital experiences since 2024"}
            </p>
          </div>

          {/* Footer Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--footer-text-color)]">
              Quick Links
            </h3>
            <ul className="space-y-2">
              {footerLinks.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-sm opacity-90 hover:opacity-100 transition-opacity duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social Media Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--footer-text-color)]">
              Follow Us
            </h3>
            <div className="flex space-x-4">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-90 hover:opacity-100 transition-opacity duration-200"
                  aria-label={social.label}
                  title={social.label}
                >
                  {getSocialIcon(social.platform)}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-[var(--footer-border-color)] text-center">
          <p className="text-sm opacity-75">
            {companyInfo["copyright"] || "© 2024 MyCompany. All rights reserved."}
          </p>
        </div>
      </div>
    </footer>
  );
}