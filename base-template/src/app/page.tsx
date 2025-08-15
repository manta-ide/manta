'use client';
import React, { FormEvent } from 'react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: integrate with backend or email service
  };

  return (
    <div
      id="node-element-swe-portfolio-page"
      className="flex flex-col items-center justify-center scroll-smooth"
    >
      {/* Hero Section */}
      <section
        id="node-element-hero-section"
        className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 text-center px-4"
      >
        <h1
          id="node-element-hero-title"
          className="font-bold font-sans text-4xl"
        >
          Hi, I&apos;m John Doe
        </h1>
        <p
          id="node-element-hero-subtitle"
          className="mt-4 text-gray-600 max-w-2xl font-sans text-2xl"
        >
          Software Engineer specializing in full-stack development and creating
          great user experiences.
        </p>
        <Button
          id="node-element-cta-button"
          className="mt-8 bg-[#1d3a62] font-sans rounded-xl"
        >
          View My Work
        </Button>
      </section>

      {/* About Section */}
      <section
        id="node-element-about-section"
        className="w-full py-20 px-4 bg-white"
      >
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div className="flex justify-center">
            <img
              id="node-element-profile-image"
              src="/profile.jpg"
              alt="John Doe profile picture"
              className="w-48 h-48 rounded-full object-cover border-4 border-white shadow-md"
            />
          </div>
          <div
            id="node-element-about-text"
            className="text-lg leading-relaxed text-gray-700"
          >
            <p>
              I&apos;m a passionate software engineer with experience building
              scalable web applications and delightful user interfaces using
              React, Next.js, Node.js, and more. I love turning complex problems
              into simple, beautiful, and intuitive designs.
            </p>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section
        id="node-element-skills-section"
        className="w-full py-20 px-4 bg-gray-50"
      >
        <h2 className="text-3xl font-bold text-center mb-8">Skills</h2>
        <div
          id="node-element-skills-grid"
          className="full"
        >
          {[
            'JavaScript',
            'TypeScript',
            'React',
            'Next.js',
            'Node.js',
            'GraphQL',
            'Tailwind CSS',
            'PostgreSQL',
          ].map((skill) => (
            <span
              key={skill}
              className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm text-center"
            >
              {skill}
            </span>
          ))}
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="node-element-projects-section"
        className="w-full py-20 px-4 bg-white"
      >
        <h2 className="text-3xl font-bold text-center mb-8">Projects</h2>
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            id="node-element-project-card"
            className="border overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-[#f5f4f4] rounded-xl"
          >
            <img
              src="/project1.jpg"
              alt="Screenshot of Project One"
              className="w-full h-40 object-cover"
            />
            <div className="p-4">
              <h3 className="font-semibold text-lg">Project One</h3>
              <p className="mt-2 text-sm text-gray-600">
                A brief description of the first highlighted project showcasing
                my expertise.
              </p>
              <a
                href="#"
                className="inline-block mt-4 text-blue-500 hover:underline"
              >
                Learn more →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="node-element-contact-section"
        className="py-16"
      >
        <h2 className="text-3xl font-bold text-center mb-8">Contact</h2>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <form
            id="node-element-contact-form"
            className="flex flex-col gap-4"
            onSubmit={handleSubmit}
          >
            <input
              type="text"
              placeholder="Your Name"
              required
              className="border rounded-md p-3"
            />
            <input
              type="email"
              placeholder="Your Email"
              required
              className="border rounded-md p-3"
            />
            <textarea
              placeholder="Your Message"
              required
              className="border rounded-md p-3 min-h-[120px]"
            />
            <Button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-md self-start"
            >
              Send
            </Button>
          </form>
          <div
            id="node-element-contact-info"
            className="flex flex-col gap-2 text-gray-700"
          >
            <p>
              Email:{' '}
              <a
                href="mailto:hello@example.com"
                className="text-blue-500 hover:underline"
              >
                hello@example.com
              </a>
            </p>
            <p>
              LinkedIn:{' '}
              <a
                href="https://linkedin.com/in/johndoe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                linkedin.com/in/johndoe
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
