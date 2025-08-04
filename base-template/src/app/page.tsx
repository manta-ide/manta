import React from 'react';
import Link from 'next/link';
import { Code, Zap, Lock, BarChart2, Twitter, Github, Linkedin } from 'lucide-react';

export default function Home() {
  const features = [
    {
      icon: Code,
      title: 'Modular Code',
      description: 'Build scalable and maintainable codebases with modular architecture.',
    },
    {
      icon: Zap,
      title: 'High Performance',
      description: 'Optimize applications for speed and responsiveness.',
    },
    {
      icon: Lock,
      title: 'Secure',
      description: 'Implement robust security practices to protect your data.',
    },
    {
      icon: BarChart2,
      title: 'Analytics',
      description: 'Gain insights through integrated analytics and monitoring.',
    },
  ];

  return (
    <main id="node-element-swe-landing-page" className="flex flex-col space-y-24">
      {/* Hero Section */}
      <section
        id="node-element-swe-landing-page-hero-section"
        className="min-h-screen flex flex-col justify-center items-center text-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-6"
      >
        <h1 className="text-5xl font-bold mb-4">
          Empower Your Software Engineering Journey
        </h1>
        <p className="text-xl mb-6 max-w-2xl">
          Build, scale, and innovate with our powerful suite of tools designed for modern developers.
        </p>
        <Link href="#node-element-swe-landing-page-features-section">
            Explore Features
        </Link>
      </section>

      {/* Features Section */}
      <section
        id="node-element-swe-landing-page-features-section"
        className="max-w-6xl mx-auto px-6"
      >
        <h2 className="text-4xl font-semibold text-center mb-12">Features</h2>
        <div
          id="node-element-swe-landing-page-features-section-feature-card-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {features.map((item) => (
            <div
              key={item.title}
              className="p-6 bg-white rounded-lg shadow hover:shadow-md transition group"
            >
              <item.icon className="w-12 h-12 text-blue-600 mb-4 group-hover:text-indigo-600" />
              <h3 className="text-2xl font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Section */}
      <footer
        id="node-element-swe-landing-page-footer"
        className="bg-gray-800 text-gray-200 py-12"
      >
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h4 className="font-semibold mb-4">Navigation</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/">
                  Home
                </Link>
              </li>
              <li>
                <Link href="#node-element-swe-landing-page-features-section">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/about">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <p>
              123 Developer Lane
              <br /> Code City, 45678
            </p>
            <p className="mt-2">
              Email:{' '}
              <a
                href="mailto:hello@swe.com"
                className="hover:text-white"
              >
                hello@swe.com
              </a>
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Follow Us</h4>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-white">
                <Twitter className="w-6 h-6" />
              </a>
              <a href="#" className="hover:text-white">
                <Github className="w-6 h-6" />
              </a>
              <a href="#" className="hover:text-white">
                <Linkedin className="w-6 h-6" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
