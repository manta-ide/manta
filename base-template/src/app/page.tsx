"use client"

import React from 'react';

export default function Home() {
  return (
    <main
      id="node-element-swe-portfolio-page"
      className="flex flex-col min-h-screen bg-background text-foreground"
    >
      {/* Header Section */}
      <header
        id="node-element-header-section"
        className="sticky top-0 z-50 flex items-center justify-between w-full px-6 py-4 bg-[#e5e7eb] border-b border-[#e5e7eb]"
      >
        {/* Logo */}
        <a
          id="node-element-logo"
          href="#node-element-swe-portfolio-page"
          className="text-lg font-semibold tracking-tight text-black font-sans"
        >
          SWE Portfolio
        </a>

        {/* Navigation Menu */}
        <nav id="node-element-nav-menu" className="hidden md:block text-black text-sm font-sans">
          <ul className="flex space-x-6">
            <li>
              <a
                id="node-element-nav-item"
                href="#node-element-projects-section"
                className="hover:underline hover:text-[#3b82f6] transition-colors text-black"
              >
                Projects
              </a>
            </li>
          </ul>
        </nav>
      </header>

      {/* Introduction Section */}
      <section
        id="node-element-introduction-section"
        className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6"
      >
        {/* Profile Image */}
        <div id="node-element-profile-image" className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary">
          <img src="/vercel.svg" alt="Profile" className="object-cover w-full h-full" />
        </div>

        {/* Introduction Text */}
        <div id="node-element-introduction-text" className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-bold">Hi, I'm John Doe</h1>
          <p className="text-muted-foreground">
            A passionate software engineer specializing in building (and occasionally designing) exceptional digital experiences.
          </p>
        </div>
      </section>

      {/* Projects Section */}
      <section id="node-element-projects-section" className="py-16 px-6 bg-muted/50">
        <h2 className="text-2xl font-semibold mb-8 text-center">Featured Projects</h2>

        <div id="node-element-project-card" className="max-w-xl mx-auto border rounded-lg p-6 shadow-sm bg-background">
          <h3 className="text-xl font-medium">Awesome Project</h3>
          <p className="mt-2 text-muted-foreground">A brief description of the awesome project showcasing its features and technologies used.</p>
          <p className="mt-4 text-sm font-mono text-primary">React · TypeScript · Next.js</p>
          <a href="https://github.com/username/awesome-project" target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-sm text-primary hover:underline">View on GitHub</a>
        </div>
      </section>

      {/* Skills Section */}
      <section id="node-element-skills-section" className="py-16 px-6">
        <h2 className="text-2xl font-semibold mb-8 text-center">Skills</h2>

        <ul id="node-element-skill-list" className="bg-[#transparent]">
          <li className="bg-muted rounded-md px-4 py-2 text-center">JavaScript</li>
          <li className="bg-muted rounded-md px-4 py-2 text-center">TypeScript</li>
          <li className="bg-muted rounded-md px-4 py-2 text-center">React</li>
          <li className="bg-muted rounded-md px-4 py-2 text-center">Next.js</li>
          <li className="bg-muted rounded-md px-4 py-2 text-center">Node.js</li>
          <li className="bg-muted rounded-md px-4 py-2 text-center">GraphQL</li>
        </ul>
      </section>

      {/* Contact Section */}
      <section id="node-element-contact-section" className="py-16 px-6 bg-muted/50">
        <h2 className="text-2xl font-semibold mb-8 text-center">Get in Touch</h2>

        <div className="max-w-xl mx-auto space-y-8">
          <div id="node-element-contact-info" className="text-center space-y-2">
            <p>Email: <a href="mailto:john.doe@example.com" className="text-primary hover:underline">john.doe@example.com</a></p>
            <p>
              <a href="https://github.com/username" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">GitHub</a>
              {" · "}
              <a href="https://linkedin.com/in/username" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </p>
          </div>

          <form id="node-element-contact-form" className="space-y-4">
            <input type="text" placeholder="Name" className="w-full px-4 py-2 border rounded-md bg-background" required />
            <input type="email" placeholder="Email" className="w-full px-4 py-2 border rounded-md bg-background" required />
            <textarea placeholder="Message" className="w-full px-4 py-2 border rounded-md bg-background h-32" required></textarea>
            <button type="submit" className="px-6 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Send Message</button>
          </form>
        </div>
      </section>
    </main>
  );
}