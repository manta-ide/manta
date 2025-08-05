'use client';
import React from 'react';
import Link from 'next/link';

export default function Home() {
  const projects = [
    {
      image: '/project1.png',
      title: 'Project One',
      description: 'A modern web application built with React and Node.js.',
      link: '#'
    },
    {
      image: '/project2.png',
      title: 'Project Two',
      description: 'An e-commerce platform with real-time inventory management.',
      link: '#'
    },
    {
      image: '/project3.png',
      title: 'Project Three',
      description: 'A mobile-first responsive design using Tailwind CSS.',
      link: '#'
    }
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: Implement form submission (e.g., send to API or email service)
    alert('Thank you for reaching out! I will get back to you soon.');
  }

  return (
    <main id="node-element-swe-portfolio-landing-page" className="flex flex-col space-y-24 px-8 py-16 max-w-screen-lg mx-auto">
      {/* Hero Section */}
      <section id="node-element-swe-portfolio-landing-page-hero-section" className="text-center space-y-4">
        <h1 className="text-5xl font-bold">Hi, I&apos;m Your Name</h1>
        <p className="text-xl text-gray-600">I build scalable web applications and modern interfaces.</p>
        <Link href="#node-element-swe-portfolio-landing-page-contact-form">
        Get in Touch
        </Link>
      </section>

      {/* Project Highlights Section */}
      <section id="node-element-swe-portfolio-landing-page-project-highlights">
        <h2 className="text-3xl font-semibold mb-8">Featured Projects</h2>
        <div id="node-element-swe-portfolio-landing-page-project-highlights-grid-layout" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project, idx) => (
            <div key={idx} id="node-element-swe-portfolio-landing-page-project-highlights-project-card" className="bg-white rounded-lg shadow-lg overflow-hidden">
              <img src={project.image} alt={project.title} className="w-full h-48 object-cover" />
              <div className="p-4">
                <h3 className="text-xl font-bold mb-2">{project.title}</h3>
                <p className="text-gray-600">{project.description}</p>
                <Link href={project.link}>
                  View Project
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="node-element-swe-portfolio-landing-page-contact-form" className="bg-gray-100 p-8 rounded-lg">
        <h2 className="text-3xl font-semibold mb-6">Contact Me</h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input type="text" name="name" placeholder="Name" required className="w-full px-4 py-2 border rounded-lg" />
          <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 border rounded-lg" />
          <textarea name="message" rows={4} placeholder="Your message" required className="w-full px-4 py-2 border rounded-lg"></textarea>
          <button id="node-element-swe-portfolio-landing-page-contact-form-submit-button" type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
            Send Message
          </button>
        </form>
      </section>

      
    </main>
  );
}
