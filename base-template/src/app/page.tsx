"use client"

import React from 'react';

export default function Home() {
  return (
    <main id="node-element-portfolio-page" className="flex flex-col min-h-screen">
      {/* Header */}
      <header id="node-element-header" className="p-4 shadow">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          {/* Logo */}
          <a id="node-element-logo" href="#" className="font-bold font-mono text-4xl">
            SWE Portfolio
          </a>
          {/* Navigation */}
          <nav id="node-element-nav-menu" className="hidden md:flex gap-6">
            <a id="node-element-nav-item" href="#hero" className="hover:underline">
              Home
            </a>
            <a href="#projects" className="hover:underline">
              Projects
            </a>
            <a href="#testimonials" className="hover:underline">
              Testimonials
            </a>
            <a href="#contact" className="hover:underline">
              Contact
            </a>
          </nav>

          {/* CTA */}
          <a
            id="node-element-cta-button"
            href="#resume"
            className="px-4 py-2 text-primary-foreground text-sm bg-[#0e0e90] font-sans rounded-md"
          >
            Download Resume
          </a>
        </div>
      </header>

      {/* Hero */}
      <section
        id="node-element-hero-section"
        className="flex flex-col items-center justify-center gap-6 py-24 text-center max-w-3xl mx-auto"
      >
        <h1 id="node-element-intro-text" className="text-4xl font-extrabold tracking-tight">
</h1>
        <p className="text-muted-foreground">
          A software engineer specializing in building exceptional digital experiences.
        </p>
        <a
          id="node-element-resume-link"
          href="#resume"
          className="underline text-primary font-medium font-sans"
        >
          View Resume
        </a>
        <div id="node-element-social-links-group" className="flex gap-4 justify-center">
          <a
            id="node-element-social-link-item"
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            GitHub
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:underline">
            LinkedIn
          </a>
          <a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:underline">
            Twitter
          </a>
        </div>
      </section>

      {/* Projects */}
      <section id="node-element-projects-section" className="py-16 max-w-5xl mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8">Projects</h2>
        <div id="node-element-projects-group" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <article
            id="node-element-project-item"
            className="border border-indigo-500/30 p-6 flex flex-col from-[#0a0a23] via-[#0f0f3d] to-[#0a0a23] shadow-lg hover:shadow-indigo-500/30 transition-shadow bg-[#efebeb] rounded-lg"
          >
            {/* Thumbnail */}
            <img
              src="/window.svg"
              alt="Project thumbnail"
              className="w-full h-40 object-contain mb-4"
            />

            {/* Title */}
            <h3 className="font-semibold mb-2">Project Title</h3>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4 flex-1">
              A short description of the project showcasing key features and technologies used to build
              the solution.
            </p>

            {/* Links */}
            <div className="flex gap-3 text-sm">
              <a href="#" className="text-primary font-medium hover:underline">
                Live Demo
              </a>
              <span className="text-muted-foreground">•</span>
              <a href="#" className="text-primary font-medium hover:underline">
                Source Code
              </a>
            </div>
          </article>
        </div>
      </section>

      {/* Testimonials */}
      <section id="node-element-testimonials-section" className="py-16 bg-muted">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8">Testimonials</h2>
          <div id="node-element-testimonial-group" className="grid gap-6 md:grid-cols-2">
            <blockquote id="node-element-testimonial-item" className="p-6 bg-white rounded-lg shadow">
              <p className="mb-2 text-sm">
                "Working with this engineer was a pleasure. They delivered quality work on time."
              </p>
              <footer className="text-xs font-medium text-muted-foreground">— Happy Client</footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="node-element-contact-section" className="py-16 max-w-5xl mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8">Get in Touch</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div id="node-element-contact-info" className="space-y-2">
            <p>Email: <a href="mailto:you@example.com" className="text-primary hover:underline">you@example.com</a></p>
            <p>Phone: <a href="tel:+1234567890" className="text-primary hover:underline">+1 (234) 567-890</a></p>
          </div>
          <form id="node-element-contact-form" className="space-y-4">
            <input
              id="node-element-form-field-name"
              type="text"
              placeholder="Your Name"
              className="border w-full p-2 rounded-md text-sm"
            />
            <input
              id="node-element-form-field-email"
              type="email"
              placeholder="you@example.com"
              className="border w-full p-2 rounded-md text-sm"
            />
            <textarea
              id="node-element-form-field-message"
              placeholder="Your Message"
              rows={4}
              className="border w-full p-2 rounded-md text-sm"
            />
            <button
              id="node-element-submit-button"
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Send Message
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer id="node-element-footer" className="border-t py-6 mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p id="node-element-copyright-text" className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Your Name. All rights reserved.
          </p>
          <nav id="node-element-footer-links" className="flex gap-4 text-sm">
            <a id="node-element-footer-link-item" href="#projects" className="hover:underline">
              Projects
            </a>
            <a id="node-element-footer-link-item" href="#contact" className="hover:underline">
              Contact
            </a>
          </nav>
          <div id="node-element-footer-social-icons" className="flex gap-4">
            <a id="node-element-footer-social-icon-item" href="https://github.com" className="hover:underline" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a id="node-element-footer-social-icon-item" href="https://linkedin.com" className="hover:underline" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
