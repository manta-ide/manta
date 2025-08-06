'use client';

import HeroSection from '@/components/HeroSection';
import ProjectsShowcase from '@/components/ProjectsShowcase';
import ContactSection from '@/components/ContactSection';
import { Project } from '@/components/DynamicFilteringBehavior';
import React from 'react';

// Sample data for projects
const projects: Project[] = [
  {
    id: 1,
    title: 'Project One',
    description: 'A web application built with React and Node.js.',
    image: 'https://source.unsplash.com/400x300/?web,app',
    category: 'Web',
    technologies: ['React', 'Node.js', 'TypeScript'],
  },
  {
    id: 2,
    title: 'Project Two',
    description: 'A mobile app developed using React Native.',
    image: 'https://source.unsplash.com/400x300/?mobile,app',
    category: 'Mobile',
    technologies: ['React Native', 'Expo', 'JavaScript'],
  },
  {
    id: 3,
    title: 'Project Three',
    description: 'A data visualization dashboard using D3.js.',
    image: 'https://source.unsplash.com/400x300/?data,chart',
    category: 'Data',
    technologies: ['D3.js', 'JavaScript', 'HTML'],
  },
];

// Sample skills list
const skills: string[] = [
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Tailwind CSS',
  'Next.js',
  'D3.js',
  'GraphQL',
];

export default function Home() {
  const scrollToProjects = () => {
    const section = document.getElementById('projects-showcase');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <main className="flex flex-col bg-gray-50 text-gray-800">
      {/* Hero Section */}
      <HeroSection
        backgroundImage="https://source.unsplash.com/1600x900/?coding,programming"
        headline="Hi, I'm John Doe, a Software Engineer"
        buttonText="View My Work"
        onButtonClick={scrollToProjects}
        className="mb-16"
      />

      {/* About Me Section */}
      <section
        id="about-me"
        className="bg-white py-16"
        aria-labelledby="about-me-heading"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            id="about-me-heading"
            className="text-3xl font-semibold text-gray-900 mb-4 text-center"
          >
            About Me
          </h2>
          <p className="text-gray-700 leading-relaxed text-center">
            I'm a passionate software engineer with experience building scalable web and mobile applications. I love turning complex problems into simple, beautiful, and intuitive designs.
          </p>
        </div>
      </section>

      {/* Projects Section */}
      <ProjectsShowcase projects={projects} />

      {/* Skills Section */}
      <section
        id="skills"
        className="bg-white py-16"
        aria-labelledby="skills-heading"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            id="skills-heading"
            className="text-3xl font-semibold text-gray-900 mb-6 text-center"
          >
            Skills
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {skills.map((skill) => (
              <span
                key={skill}
                className="px-4 py-2 bg-gray-200 rounded-full text-gray-800"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <ContactSection />
    </main>
  );
}
