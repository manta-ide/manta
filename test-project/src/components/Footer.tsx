import React from "react";

interface FooterProps {
  vars: Record<string, any>;
}

export default function Footer({ vars }: FooterProps) {
  // Footer properties
  const footerStyles = (vars["footer-styles"] as Record<string, any>) || {};
  const socialLinks = (vars["social-links"] as any[]) || [];
  const content = (vars["footer-content"] as Record<string, any>) || {};
  const contact = (vars["contact-info"] as Record<string, any>) || {};

  // Default social links if none provided
  const defaultSocialLinks = [
    {
      name: "GitHub",
      url: "https://github.com",
      icon: "💻",
      color: "#333333"
    },
    {
      name: "LinkedIn",
      url: "https://linkedin.com",
      icon: "💼",
      color: "#0077b5"
    },
    {
      name: "Twitter",
      url: "https://twitter.com",
      icon: "🐦",
      color: "#1da1f2"
    },
    {
      name: "Email",
      url: "mailto:hello@example.com",
      icon: "📧",
      color: "#ea4335"
    }
  ];

  const displaySocialLinks = socialLinks.length > 0 ? socialLinks : defaultSocialLinks;

  return (
    <footer
      className="py-12 lg:py-16"
      style={{
        backgroundColor: footerStyles["background-color"] || "#111827",
        background: footerStyles["background-gradient"] || "linear-gradient(135deg, #111827 0%, #0f172a 100%)"
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Brand/Logo Section */}
          <div className="lg:col-span-1">
            <h3
              className="text-2xl font-bold mb-4"
              style={{
                color: content["brand-color"] || "#ffffff",
                fontSize: content["brand-font-size"] || "1.5rem"
              }}
            >
              {content["brand-text"] || "Portfolio"}
            </h3>
            <p
              className="text-base leading-relaxed mb-6"
              style={{
                color: content["description-color"] || "#9ca3af",
                fontSize: content["description-font-size"] || "1rem"
              }}
            >
              {content["description"] || "Passionate software engineer building innovative solutions for the future. Always learning, always growing."}
            </p>
          </div>

          {/* Contact Information */}
          <div className="lg:col-span-1">
            <h4
              className="text-lg font-semibold mb-4"
              style={{
                color: content["section-title-color"] || "#ffffff",
                fontSize: content["section-title-font-size"] || "1.125rem"
              }}
            >
              {content["contact-title"] || "Get In Touch"}
            </h4>
            <div className="space-y-2">
              <p
                className="text-sm"
                style={{ color: contact["text-color"] || "#9ca3af" }}
              >
                📧 {contact["email"] || "hello@example.com"}
              </p>
              <p
                className="text-sm"
                style={{ color: contact["text-color"] || "#9ca3af" }}
              >
                📍 {contact["location"] || "San Francisco, CA"}
              </p>
              <p
                className="text-sm"
                style={{ color: contact["text-color"] || "#9ca3af" }}
              >
                📱 {contact["phone"] || "Available on request"}
              </p>
            </div>
          </div>

          {/* Social Links */}
          <div className="lg:col-span-1">
            <h4
              className="text-lg font-semibold mb-4"
              style={{
                color: content["section-title-color"] || "#ffffff",
                fontSize: content["section-title-font-size"] || "1.125rem"
              }}
            >
              {content["social-title"] || "Connect With Me"}
            </h4>
            <div className="flex flex-wrap gap-4">
              {displaySocialLinks.map((link, index) => (
                <a
                  key={index}
                  href={link.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:transform hover:scale-105 border"
                  style={{
                    backgroundColor: footerStyles["social-bg-color"] || "rgba(255, 255, 255, 0.05)",
                    borderColor: footerStyles["social-border-color"] || "rgba(255, 255, 255, 0.1)",
                    color: link.color || footerStyles["social-text-color"] || "#ffffff"
                  }}
                >
                  <span style={{ fontSize: footerStyles["social-icon-size"] || "1.2rem" }}>
                    {link.icon || "🔗"}
                  </span>
                  <span style={{ fontSize: footerStyles["social-label-size"] || "0.875rem" }}>
                    {link.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom section */}
        <div
          className="mt-12 pt-8 border-t text-center"
          style={{ borderColor: footerStyles["divider-color"] || "rgba(255, 255, 255, 0.1)" }}
        >
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p
              className="text-sm"
              style={{ color: content["copyright-color"] || "#6b7280" }}
            >
              {content["copyright-text"] || `© ${new Date().getFullYear()} Portfolio. All rights reserved.`}
            </p>

            {/* Additional links */}
            <div className="flex gap-6">
              <a
                href="#"
                className="text-sm transition-colors duration-200"
                style={{
                  color: content["link-color"] || "#9ca3af",
                  fontSize: content["link-font-size"] || "0.875rem"
                }}
              >
                {content["privacy-text"] || "Privacy Policy"}
              </a>
              <a
                href="#"
                className="text-sm transition-colors duration-200"
                style={{
                  color: content["link-color"] || "#9ca3af",
                  fontSize: content["link-font-size"] || "0.875rem"
                }}
              >
                {content["terms-text"] || "Terms of Service"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}