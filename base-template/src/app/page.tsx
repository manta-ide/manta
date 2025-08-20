// src/app/page.tsx
import { getVar, resolvePlaceholders } from "@/lib/vars";
import Link from "next/link";

export default function Page() {
  // Header - Navigation
  const navTextColor = getVar<string>("nav-links-component.text-color", "#000000");
  const navHoverColor = getVar<string>("nav-links-component.hover-color", "#3b82f6");
  const navFontSize = getVar<number>("nav-links-component.font-size", 16);
  const logoSrc = getVar<string>("logo-element.image-src", "public/logo.svg");
  const logoAlt = getVar<string>("logo-element.alt-text", "Portfolio Logo");
  const logoWidth = getVar<number>("logo-element.width", 50);
  const logoHeight = getVar<number>("logo-element.height", 50);

  // About Me
  const aboutTitle = getVar<string>("about-me-section.section-title", "About Me");
  const aboutBg = getVar<string>("about-me-section.background-color", "#f3f4f6");
  const profileSrc = getVar<string>("profile-image-element.src", "public/profile.jpg");
  const profileAlt = getVar<string>("profile-image-element.alt-text", "Profile Image");
  const profileWidth = getVar<number>("profile-image-element.width", 150);
  const profileHeight = getVar<number>("profile-image-element.height", 150);
  const profileRadius = getVar<number>("profile-image-element.border-radius", 50);
  const bioContent = getVar<string>("bio-text-element.content", "Software Engineer with a passion for building impactful applications and exploring innovative technologies.");
  const bioFontSize = getVar<number>("bio-text-element.font-size", 16);
  const bioLineHeight = getVar<number>("bio-text-element.line-height", 1.5);
  const bioTextColor = getVar<string>("bio-text-element.text-color", "#333333");

  // Projects
  const projectsTitle = getVar<string>("projects-section.section-title", "Projects");
  const projectsBg = getVar<string>("projects-section.background-color", "#ffffff");
  const projectImg = getVar<string>("project-card-component.image-src", "public/project.jpg");
  const projectTitle = getVar<string>("project-card-component.project-title", "Project Title");
  const projectDesc = getVar<string>("project-card-component.description", "A brief description of the project.");
  const projectUrl = getVar<string>("project-card-component.link-url", "https://github.com");
  const projectBgColor = getVar<string>("project-card-component.card-background-color", "#ffffff");
  const projectRadius = getVar<number>("project-card-component.card-border-radius", 10);
  const projectShadow = getVar<string>("project-card-component.card-shadow", "0px 4px 6px rgba(0,0,0,0.1)");

  // Skills
  const skillsTitle = getVar<string>("skills-section.section-title", "Skills");
  const skillsBg = getVar<string>("skills-section.background-color", "#f9fafb");
  const badgeColor = getVar<string>("skills-badge-component.badge-color", "#3b82f6");
  const badgeTextColor = getVar<string>("skills-badge-component.text-color", "#ffffff");
  const badgeFontSize = getVar<number>("skills-badge-component.font-size", 14);

  // Contact
  const contactTitle = getVar<string>("contact-section.section-title", "Contact");
  const contactBg = getVar<string>("contact-section.background-color", "#ffffff");
  const formBg = getVar<string>("contact-form-component.background-color", "#ffffff");
  const formRadius = getVar<number>("contact-form-component.border-radius", 10);
  const formFieldColor = getVar<string>("contact-form-component.field-text-color", "#000000");
  const submitColor = getVar<string>("contact-form-component.submit-button-color", "#3b82f6");
  const socialText = getVar<string>("social-links-component.link-text", "LinkedIn");
  const socialUrl = getVar<string>("social-links-component.link-url", "https://linkedin.com");
  const socialIconColor = getVar<string>("social-links-component.icon-color", "#0a66c2");
  const socialHover = getVar<string>("social-links-component.hover-color", "#3b82f6");

  return (
    <main className="min-h-screen bg-white">
      {/* Header Section */}
      <header id="header-section" className="sticky top-0 bg-white shadow-sm z-50">
        <div id="navigation-container" className="max-w-6xl mx-auto flex items-center justify-between p-4">
          <div id="logo-element">
            <img src={logoSrc} alt={logoAlt} width={logoWidth} height={logoHeight} />
          </div>
          <nav id="nav-links-component">
            <ul className="flex space-x-6">
              {["Home", "About", "Projects", "Skills", "Contact"].map((item) => (
                <li key={item}>
                  <Link
                    href={item === "Home" ? "/" : `#${item.toLowerCase()}`}
                    style={{ color: navTextColor, fontSize: `${navFontSize}px` }}
                    className="hover:underline"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* About Me Section */}
      <section id="about-me-section" style={{ background: aboutBg }} className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6">{aboutTitle}</h2>
        <div id="about-me-container" className="flex flex-col md:flex-row items-center gap-8">
          <div id="profile-image-element">
            <img
              src={profileSrc}
              alt={profileAlt}
              width={profileWidth}
              height={profileHeight}
              style={{ borderRadius: `${profileRadius}%` }}
            />
          </div>
          <div id="bio-text-element">
            <p
              style={{
                fontSize: `${bioFontSize}px`,
                lineHeight: bioLineHeight,
                color: bioTextColor,
              }}
            >
              {resolvePlaceholders(bioContent)}
            </p>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects-section" style={{ background: projectsBg }} className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6">{projectsTitle}</h2>
        <div id="projects-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            id="project-card-component"
            className="p-4"
            style={{
              backgroundColor: projectBgColor,
              borderRadius: `${projectRadius}px`,
              boxShadow: projectShadow,
            }}
          >
            <img src={projectImg} alt={projectTitle} className="mb-4 rounded" />
            <h3 className="text-xl font-semibold mb-2">{projectTitle}</h3>
            <p className="text-gray-700 mb-4">{projectDesc}</p>
            <Link href={projectUrl} className="text-blue-600 hover:underline">
              View Project
            </Link>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section id="skills-section" style={{ background: skillsBg }} className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6">{skillsTitle}</h2>
        <div id="skills-container" className="flex flex-wrap gap-4">
          {["JavaScript", "React", "Node.js", "TypeScript", "GraphQL"].map((skill) => (
            <span
              key={skill}
              id="skills-badge-component"
              className="px-3 py-1 rounded-full"
              style={{ backgroundColor: badgeColor, color: badgeTextColor, fontSize: `${badgeFontSize}px` }}
            >
              {skill}
            </span>
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact-section" style={{ background: contactBg }} className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6">{contactTitle}</h2>
        <div id="contact-container" className="flex flex-col md:flex-row gap-8">
          <form
            id="contact-form-component"
            className="flex-1 p-6"
            style={{ backgroundColor: formBg, borderRadius: `${formRadius}px` }}
          >
            <div className="mb-4">
              <label className="block mb-1 text-gray-600">Name</label>
              <input type="text" className="w-full border p-2 rounded" style={{ color: formFieldColor }} />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-gray-600">Email</label>
              <input type="email" className="w-full border p-2 rounded" style={{ color: formFieldColor }} />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-gray-600">Message</label>
              <textarea className="w-full border p-2 rounded" rows={5} style={{ color: formFieldColor }} />
            </div>
            <button
              type="submit"
              className="px-5 py-2 rounded"
              style={{ backgroundColor: submitColor, color: "#fff" }}
            >
              Send Message
            </button>
          </form>
          <div id="social-links-component" className="flex-1 flex flex-col justify-center">
            <h3 className="text-xl font-semibold mb-4">{socialText}</h3>
            <Link href={socialUrl} style={{ color: socialIconColor }} className="hover:underline">
              {socialText}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
