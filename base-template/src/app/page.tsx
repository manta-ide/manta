import { getVar, resolvePlaceholders } from "@/lib/vars";
import Link from "next/link";

export default function Page() {
  // Navbar variables
  const navLinkColor = getVar<string>("navbar.link-color", "#4f46e5");
  const navBgColor = getVar<string>("navbar.background-color", "#ffffff");

  // About Section variables
  const aboutTitle = getVar<string>("about-section.section-title", "About");
  const aboutBgColor = getVar<string>("about-section.background-color", "#f9fafb");
  const summaryText = getVar<string>("professional-summary.summary-text", "Experienced Software Engineer with a passion for creating scalable and efficient solutions.");

  // Projects Section variables
  const projectsTitle = getVar<string>("projects-section.section-title", "Projects");
  const projectsBgColor = getVar<string>("projects-section.background-color", "#ffffff");
  const projectTitleDefault = getVar<string>("project-entry.project-title", "Project Title");
  const projectDescDefault = getVar<string>("project-entry.project-description", "A brief description of the project.");
  const projectRepoDefault = getVar<string>("project-entry.repository-link", "https://github.com/example");

  // Skills Section variables
  const skillsTitle = getVar<string>("skills-section.section-title", "Skills");
  const skillsBgColor = getVar<string>("skills-section.background-color", "#ffffff");
  const skillsBarColor = getVar<string>("skills-list.proficiency-bar-color", "#34d399");

  // Contact Section variables
  const contactTitle = getVar<string>("contact-section.section-title", "Contact");
  const contactBgColor = getVar<string>("contact-section.background-color", "#f3f4f6");

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        id="node-element-header"
        style={{ backgroundColor: navBgColor }}
        className="fixed w-full top-0 left-0 shadow z-10"
      >
        <div
          id="node-element-navbar"
          className="container mx-auto flex items-center justify-between py-4 px-6"
        >
          <h1 className="text-xl font-bold">Software Engineer</h1>
          <nav aria-label="Main Navigation" className="space-x-6">
            <Link href="#node-element-about-section">
              <span
                className="text-lg font-medium"
                style={{ color: navLinkColor }}
              >
                {aboutTitle}
              </span>
            </Link>
            <Link href="#node-element-projects-section">
              <span
                className="text-lg font-medium"
                style={{ color: navLinkColor }}
              >
                {projectsTitle}
              </span>
            </Link>
            <Link href="#node-element-skills-section">
              <span
                className="text-lg font-medium"
                style={{ color: navLinkColor }}
              >
                {skillsTitle}
              </span>
            </Link>
            <Link href="#node-element-contact-section">
              <span
                className="text-lg font-medium"
                style={{ color: navLinkColor }}
              >
                {contactTitle}
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* About Section */}
      <section
        id="node-element-about-section"
        style={{ backgroundColor: aboutBgColor }}
        className="pt-24 pb-16 px-6"
      >
        <h2 className="text-3xl font-bold mb-4">{aboutTitle}</h2>
        <p className="text-lg text-gray-700">{summaryText}</p>
      </section>

      {/* Projects Section */}
      <section
        id="node-element-projects-section"
        style={{ backgroundColor: projectsBgColor }}
        className="py-16 px-6"
      >
        <h2 className="text-3xl font-bold mb-8">{projectsTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            id="node-element-project-entry"
            className="bg-white shadow rounded-lg overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-2">
                {projectTitleDefault}
              </h3>
              <p className="text-gray-600 mb-4">{projectDescDefault}</p>
              <Link href={projectRepoDefault}>
                <span className="text-indigo-600 hover:underline">
                  {resolvePlaceholders("View Code")}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section
        id="node-element-skills-section"
        style={{ backgroundColor: skillsBgColor }}
        className="py-16 px-6"
      >
        <h2 className="text-3xl font-bold mb-8">{skillsTitle}</h2>
        <div id="node-element-skills-list" className="space-y-4">
          {[
            "JavaScript",
            "React",
            "Node.js",
            "TypeScript",
            "Tailwind CSS",
          ].map((skill) => (
            <div key={skill} className="flex flex-col">
              <div className="flex justify-between mb-1">
                <span className="font-medium text-gray-700">{skill}</span>
                <span className="text-sm text-gray-600">90%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{ width: "90%", backgroundColor: skillsBarColor }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="node-element-contact-section"
        style={{ backgroundColor: contactBgColor }}
        className="py-16 px-6"
      >
        <h2 className="text-3xl font-bold mb-8">{contactTitle}</h2>
        <form
          id="node-element-contact-form"
          className="max-w-md mx-auto space-y-4"
        >
          <div className="flex flex-col">
            <label
              htmlFor="name"
              className="mb-1 font-medium text-gray-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div className="flex flex-col">
            <label
              htmlFor="email"
              className="mb-1 font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div className="flex flex-col">
            <label
              htmlFor="message"
              className="mb-1 font-medium text-gray-700"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition"
          >
            {resolvePlaceholders("Send Message")}
          </button>
        </form>
      </section>
    </main>
  );
}
