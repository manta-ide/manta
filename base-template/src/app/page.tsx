import React from "react";
import Link from "next/link";

const PortfolioPage = () => {
  return (
    <main className="bg-gray-50 text-gray-800 min-h-screen">
      {/* Header Section */}
      <header id="node-element-header-section" className="fixed w-full bg-white shadow-md">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          {/* Logo */}
          <div id="node-element-logo" className="text-xl font-bold">SWE Portfolio</div>

          {/* Navigation Menu */}
          <nav id="node-element-nav-menu" className="flex space-x-4">
            <Link href="#node-element-introduction-section" className="hover:underline">
              Introduction
            </Link>
            <Link href="#node-element-projects-section" className="hover:underline">
              Projects
            </Link>
            <Link href="#node-element-skills-section" className="hover:underline">
              Skills
            </Link>
            <Link href="#node-element-contact-section" className="hover:underline">
              Contact
            </Link>
          </nav>
        </div>
      </header>

      {/* Introduction Section */}
      <section
        id="node-element-introduction-section"
        className="container mx-auto py-20 px-6 flex flex-col items-center text-center"
      >
        {/* Profile Picture */}
        <div
          id="node-element-profile-picture"
          className="w-32 h-32 rounded-full bg-gray-300 mb-4"
        ></div>

        {/* Introduction Text */}
        <div id="node-element-introduction-text" className="text-lg">
          <p>
            Hi, I am a software engineer passionate about building scalable and
            efficient applications. Welcome to my portfolio!
          </p>
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="node-element-projects-section"
        className="container mx-auto py-20 px-6"
      >
        <h2 className="text-2xl mb-6 text-center font-bold">Projects</h2>

        {/* Project List */}
        <div id="node-element-project-list" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Project Card */}
          <div id="node-element-project-card" className="shadow-md p-4 rounded bg-[#8f8a8a] bg-[#cccccc] hover:bg-[#cccccc]/90">
            <h3 className="text-xl font-bold">Project Title</h3>
            <p className="text-gray-600">Description of the project.</p>
            <Link href="#" className="text-blue-500 hover:underline">
              View Project
            </Link>
          </div>

          <div id="node-element-project-card" className="bg-white shadow-md p-4 rounded">
            <h3 className="text-xl font-bold">Project Title</h3>
            <p className="text-gray-600">Description of the project.</p>
            <Link href="#" className="text-blue-500 hover:underline">
              View Project
            </Link>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section
        id="node-element-skills-section"
        className="container mx-auto py-20 px-6"
      >
        <h2 className="text-2xl mb-6 text-center font-bold">Skills</h2>

        {/* Skills List */}
        <div
          id="node-element-skills-list"
          className="flex flex-wrap justify-center gap-4"
        >
          {/* Skill Item */}
          <span
            id="node-element-skill-item"
            className="bg-blue-100 text-blue-500 px-4 py-2 rounded-full"
          >
            JavaScript
          </span>
          <span
            id="node-element-skill-item"
            className="bg-blue-100 text-blue-500 px-4 py-2 rounded-full"
          >
            React
          </span>
          <span
            id="node-element-skill-item"
            className="bg-blue-100 text-blue-500 px-4 py-2 rounded-full"
          >
            Node.js
          </span>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="node-element-contact-section"
        className="container mx-auto py-20 px-6 text-center"
      >
        <h2 className="text-2xl mb-6 font-bold">Contact</h2>

        {/* Contact Form */}
        <form id="node-element-contact-form" className="space-y-4">
          <input
            type="text"
            placeholder="Your Name"
            className="w-full border border-gray-300 rounded px-4 py-2"
          />
          <input
            type="email"
            placeholder="Your Email"
            className="w-full border border-gray-300 rounded px-4 py-2"
          />
          <textarea
            placeholder="Your Message"
            className="w-full border border-gray-300 rounded px-4 py-2"
          ></textarea>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Send Message
          </button>
        </form>

        {/* Social Links */}
        <div id="node-element-social-links" className="flex justify-center space-x-4 mt-6">
          <Link href="#" className="text-blue-500 hover:underline">
            LinkedIn
          </Link>
          <Link href="#" className="text-blue-500 hover:underline">
            GitHub
          </Link>
        </div>
      </section>
    </main>
  );
};

export default PortfolioPage;