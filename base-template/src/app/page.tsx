'use client';
import React from 'react';
import HeroSection from '@/components/ui/HeroSection';
import ProjectsShowcase, { Project } from '@/components/ui/ProjectsShowcase';
import ContactSection from '@/components/ui/ContactSection';

const projectsData: Project[] = [
  {
    id: '1',
    category: 'Web Development',
    date: '2023-07-01',
    image: 'https://via.placeholder.com/400x300',
    title: 'Portfolio Website',
    description: 'A responsive personal portfolio built with Next.js and Tailwind CSS.',
  },
  {
    id: '2',
    category: 'Open Source',
    date: '2023-05-15',
    image: 'https://via.placeholder.com/400x300',
    title: 'UI Component Library',
    description: 'A reusable React UI library with customizable components.',
  },
  {
    id: '3',
    category: 'Fullstack',
    date: '2022-11-20',
    image: 'https://via.placeholder.com/400x300',
    title: 'E-commerce Platform',
    description: 'An e-commerce app with Node.js backend and React frontend.',
  },
];

const skills = [
  'JavaScript',
  'TypeScript',
  'React',
  'Next.js',
  'Tailwind CSS',
  'Node.js',
  'Express',
  'GraphQL',
  'Git',
];

export default function Home() {
  const handleContactSubmit = async (data: any) => {
    // Placeholder submit handler
    console.log('Contact form data:', data);
    alert('Thank you for reaching out!');
  };

  return (
    <main className="flex flex-col bg-gray-50 text-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 bg-white shadow-md z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <span className="text-xl font-bold">My Portfolio</span>
          <ul className="flex space-x-6">
            <li><a href="#about" className="hover:text-primary">About</a></li>
            <li><a href="#projects" className="hover:text-primary">Projects</a></li>
            <li><a href="#skills" className="hover:text-primary">Skills</a></li>
            <li><a href="#contact" className="hover:text-primary">Contact</a></li>
          </ul>
        </div>
      </nav>

      {/* Hero Section */}
      <div id="hero">
        <HeroSection
          backgroundImage="https://via.placeholder.com/1600x900"
          headline="Software Engineer & Problem Solver"
          ctaButton={{ text: 'Get in Touch', onClick: () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }) }}
        />
      </div>

      {/* About Me Section */}
      <section id="about" className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">About Me</h2>
          <p className="text-lg leading-relaxed">
            Hi! I'm Jane Doe, a passionate software engineer with over 5 years of experience building scalable web applications. I love crafting intuitive user experiences and writing clean, maintainable code.
          </p>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="py-16 bg-gray-50">
        <ProjectsShowcase projects={projectsData} />
      </section>

      {/* Skills Section */}
      <section id="skills" className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8">Skills</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {skills.map((skill) => (
              <span key={skill} className="px-4 py-2 bg-gray-100 rounded-full text-center text-sm font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact">
        <ContactSection
          linkedinUrl="https://linkedin.com/in/your-profile"
          githubUrl="https://github.com/your-username"
          twitterUrl="https://twitter.com/your-handle"
          onSubmit={handleContactSubmit}
        />
      </section>

      {/* Footer */}
      <footer className="py-8 bg-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-600">
          &copy; {new Date().getFullYear()} Jane Doe. All rights reserved.
        </div>
      </footer>
    </main>
  );
}