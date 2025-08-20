import { getVar } from "@/lib/vars";
import Link from "next/link";

export default function Page() {
  return (
    <main
      id="portfolio-page"
      className="min-h-screen"
      style={{
        background: getVar("portfolio-page.background-color", "#ffffff"),
        color: getVar("portfolio-page.text-color", "#000000"),
        fontFamily: getVar("portfolio-page.font-family", "Arial"),
        fontSize: `${getVar("portfolio-page.font-size", 16)}px`,
      }}
    >
      {/* Header Section */}
      <header
        id="header"
        className="flex items-center justify-between"
        style={{
          background: getVar("header-section.background-color", "#3b82f6"),
          color: getVar("header-section.text-color", "#ffffff"),
          padding: `${getVar("header-section.padding", 20)}px`,
          fontSize: `${getVar("header-section.font-size", 18)}px`,
        }}
      >
        {/* Logo Component */}
        <div id="logo" className="flex items-center">
          <img
            src={getVar("logo-component.image-url", "")+ " "}
            alt="Logo"
            style={{
              width: `${getVar("logo-component.logo-size", 50)}px`,
              height: "auto",
            }}
          />
          <span className="ml-2 font-bold">My Portfolio</span>
        </div>
        {/* Navigation Bar Component */}
        <nav id="navbar" className="flex space-x-4">
          {[
            { id: "main-content", label: "Projects & Skills" },
            { id: "footer", label: "Contact & Socials" },
          ].map((link) => (
            <Link
              key={link.id}
              href={`#${link.id}`}
              style={{
                color: getVar("navigation-bar-component.link-text-color", "#ffffff"),
                background: getVar("navigation-bar-component.link-background-color", "#3b82f6"),
                padding: `${getVar("navigation-bar-component.link-padding", 10)}px`,
                fontSize: `${getVar("navigation-bar-component.link-font-size", 16)}px`,
                borderRadius: "4px",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Main Content Section */}
      <section
        id="main-content"
        className="py-8"
        style={{
          background: getVar("main-content-section.background-color", "#f4f4f5"),
          color: getVar("main-content-section.text-color", "#000000"),
          padding: `${getVar("main-content-section.padding", 20)}px`,
          fontSize: `${getVar("main-content-section.font-size", 16)}px`,
        }}
      >
        {/* Projects Component */}
        <div id="projects" className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              className="rounded-lg"
              style={{
                background: getVar("projects-component.card-background-color", "#ffffff"),
                boxShadow: getVar("projects-component.card-shadow", "0px 4px 6px rgba(0,0,0,0.1)"),
                padding: `${getVar("projects-component.card-padding", 20)}px`,
                fontSize: `${getVar("projects-component.font-size", 16)}px`,
              }}
            >
              <h3 className="font-semibold text-xl mb-2">Project Title</h3>
              <p className="text-gray-700">
                Brief description of the project showcasing features and technologies used.
              </p>
            </div>
          </div>
        </div>

        {/* Skills Component */}
        <div id="skills">
          <h2 className="text-2xl font-bold mb-4">Skills</h2>
          <div className="space-y-4">
            {[
              { name: "JavaScript", level: 80 },
              { name: "React", level: 75 },
              { name: "TypeScript", level: 70 },
            ].map((skill) => (
              <div key={skill.name}>
                <div className="flex justify-between mb-1">
                  <span style={{ fontSize: `${getVar("skills-component.font-size", 14)}px` }}>
                    {skill.name}
                  </span>
                  <span style={{ fontSize: `${getVar("skills-component.font-size", 14)}px` }}>
                    {skill.level}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="rounded-full h-2"
                    style={{
                      width: `${skill.level}%`,
                      background: getVar("skills-component.progress-bar-color", "#3b82f6"),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer
        id="footer"
        className="mt-8"
        style={{
          background: getVar("footer-section.background-color", "#1f2937"),
          color: getVar("footer-section.text-color", "#ffffff"),
          padding: `${getVar("footer-section.padding", 20)}px`,
          fontSize: `${getVar("footer-section.font-size", 14)}px`,
        }}
      >
        {/* Contact Information Component */}
        <div id="contact-info" className="mb-4">
          <h2 className="font-bold mb-2">Contact Information</h2>
          <p
            style={{
              fontSize: `${getVar("contact-information-component.font-size", 14)}px`,
              color: getVar("contact-information-component.text-color", "#ffffff"),
              padding: `${getVar("contact-information-component.padding", 10)}px`,
            }}
          >
            Email: example@example.com
          </p>
          <p
            style={{
              fontSize: `${getVar("contact-information-component.font-size", 14)}px`,
              color: getVar("contact-information-component.text-color", "#ffffff"),
            }}
          >
            Phone: (123) 456-7890
          </p>
          <p
            style={{
              fontSize: `${getVar("contact-information-component.font-size", 14)}px`,
              color: getVar("contact-information-component.text-color", "#ffffff"),
            }}
          >
            Location: City, Country
          </p>
        </div>

        {/* Social Media Links Component */}
        <div id="social-links" className="flex space-x-4">
          {[
            { name: "LinkedIn", url: "#" },
            { name: "GitHub", url: "#" },
            { name: "Twitter", url: "#" },
          ].map((social) => (
            <Link
              key={social.name}
              href={social.url}
              style={{
                fontSize: `${getVar("social-media-links-component.icon-size", 24)}px`,
                color: getVar("social-media-links-component.link-color", "#ffffff"),
              }}
              className="hover:opacity-80"
            >
              {social.name}
            </Link>
          ))}
        </div>
      </footer>
    </main>
  );
}