import React from 'react';
import Link from 'next/link';
import { Code, Smartphone, Activity, Twitter, Linkedin } from 'lucide-react';

export default function Home() {
  return (
    <main id="node-element-swe-landing-page" className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <section
        id="node-element-swe-landing-page-hero-section"
        className="flex-1 flex items-center justify-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-20 px-6"
      >
        <div className="text-center max-w-2xl space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold">
            Build the Future of Software
          </h1>
          <p className="text-lg md:text-xl opacity-90">
            Empowering software engineers with tools and insights to ship amazing
            products faster.
          </p>
          <Link
            id="node-element-swe-landing-page-hero-section-call-to-action-button"
            href="/signup"
            className="inline-block px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="node-element-swe-landing-page-features-section"
        className="py-20 px-6 bg-gray-50"
      >
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold">Key Features</h2>
          <p className="mt-2 text-gray-600">
            Everything you need to streamline your development workflow.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: <Code className="w-12 h-12 text-blue-600 mb-4" />,
              title: 'TypeScript Ready',
              description:
                'Full support for TypeScript with type-safe components and utilities.',
            },
            {
              icon: <Smartphone className="w-12 h-12 text-blue-600 mb-4" />,
              title: 'Responsive Design',
              description:
                'Built-in responsiveness ensures your app looks great on any device.',
            },
            {
              icon: <Activity className="w-12 h-12 text-blue-600 mb-4" />,
              title: 'Performance Monitoring',
              description:
                'Real-time metrics and insights help you optimize performance.',
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              id="node-element-swe-landing-page-features-section-feature-card"
              className="p-6 bg-white rounded-xl shadow-md hover:shadow-lg transition"
            >
              {feature.icon}
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer Section */}
      <footer
        id="node-element-swe-landing-page-footer-section"
        className="bg-gray-800 text-gray-300 py-12 px-6 mt-auto"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Navigation Links */}
          <div id="node-element-swe-landing-page-footer-section-navigation-links">
            <h4 className="text-white font-semibold mb-4">Navigate</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="hover:text-white transition">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-white transition">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white transition">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Social Media Icons */}
          <div id="node-element-swe-landing-page-footer-section-social-media-icons">
            <h4 className="text-white font-semibold mb-4">Follow Us</h4>
            <div className="flex space-x-4">
              <Link href="https://twitter.com" target="_blank" className="hover:text-white transition">
                <Twitter className="w-6 h-6" />
              </Link>
              <Link href="https://linkedin.com" target="_blank" className="hover:text-white transition">
                <Linkedin className="w-6 h-6" />
              </Link>
            </div>
          </div>

          {/* Copyright */}
          <div className="md:col-span-2 text-center md:text-right">
            <p className="opacity-75">© {new Date().getFullYear()} YourCompany. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
