// src/app/page.tsx
import Link from "next/link";
import { getVar, resolvePlaceholders } from "@/lib/vars";

export default function Page() {
  // Header Section Variables
  const headerBg = getVar<string>("header-section.background-color", "#ffffff");
  const logoSrc = getVar<string>("logo-component.logo-src", "/logo.svg");
  const logoAlt = getVar<string>("logo-component.alt-text", "Portfolio Logo");
  const navLinks = getVar<string>("navigation-menu.links", "Home, About, Work, Contact").split(", ");

  // Hero Section Variables
  const heroBg = getVar<string>("hero-section.background-color", "#f9fafb");
  const heroTitle = getVar<string>("hero-section.section-title", "Hi, I'm Jane Doe");
  const heroSubtitle = getVar<string>("hero-section.subtitle", "Software Engineer");
  const heroCta = getVar<string>("hero-section.cta-text", "View My Work");

  // About Section Variables
  const aboutBg = getVar<string>("about-section.background-color", "#ffffff");
  const aboutTitle = getVar<string>("about-section.section-title", "About Me");
  const aboutText = getVar<string>("about-section.text", "Passionate software engineer specializing in full-stack development. Experienced in React, Node.js, and AWS.");

  // Work Section Variables
  const workBg = getVar<string>("work-section.background-color", "#f9fafb");
  const workTitle = getVar<string>("work-section.section-title", "My Work");
  const workIntro = getVar<string>("work-section.text", "Here are a few projects I've worked on recently.");

  // Contact Section Variables
  const contactBg = getVar<string>("contact-section.background-color", "#ffffff");
  const contactTitle = getVar<string>("contact-section.section-title", "Contact Me");

  // Footer Section Variables
  const footerBg = getVar<string>("footer-section.background-color", "#000000");
  const footerText = getVar<string>("footer-section.text", "© 2024 Jane Doe. All rights reserved.");

  return (
    <main className="min-h-screen">
      <header
        id="header-section"
        style={{ background: headerBg }}
        className="py-4 px-8 flex items-center justify-between"
      >
        <div id="logo-component">
          <img src={resolvePlaceholders(logoSrc)} alt={resolvePlaceholders(logoAlt)} className="h-8 w-auto" />
        </div>
        <nav id="navigation-menu" className="space-x-6">
          {navLinks.map((link) => (
            <Link key={link} href={`#${link.toLowerCase()}`}>
              {resolvePlaceholders(link)}
            </Link>
          ))}
        </nav>
      </header>

      <section
        id="hero-section"
        style={{ background: heroBg }}
        className="flex flex-col items-center justify-center text-center py-20 px-4"
      >
        <h1 className="text-5xl font-bold mb-4">{resolvePlaceholders(heroTitle)}</h1>
        <p className="text-xl text-gray-600 mb-6">{resolvePlaceholders(heroSubtitle)}</p>
        <Link
          href="#work-section"
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {resolvePlaceholders(heroCta)}
        </Link>
      </section>

      <section
        id="about-section"
        style={{ background: aboutBg }}
        className="py-16 px-8"
      >
        <h2 className="text-3xl font-bold mb-4">{resolvePlaceholders(aboutTitle)}</h2>
        <p className="text-lg text-gray-700">{resolvePlaceholders(aboutText)}</p>
      </section>

      <section
        id="work-section"
        style={{ background: workBg }}
        className="py-16 px-8"
      >
        <h2 className="text-3xl font-bold mb-4">{resolvePlaceholders(workTitle)}</h2>
        <p className="text-lg text-gray-700 mb-8">{resolvePlaceholders(workIntro)}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Project cards will go here */}
        </div>
      </section>

      <section
        id="contact-section"
        style={{ background: contactBg }}
        className="py-16 px-8"
      >
        <h2 className="text-3xl font-bold mb-4">{resolvePlaceholders(contactTitle)}</h2>
        <form action="#" className="max-w-md space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
              placeholder="Your Name"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
              placeholder="Your message"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Send Message
          </button>
        </form>
      </section>

      <footer
        id="footer-section"
        style={{ background: footerBg }}
        className="py-4 px-8"
      >
        <p className="text-center text-sm text-gray-400">
          {resolvePlaceholders(footerText)}
        </p>
      </footer>
    </main>
  );
}