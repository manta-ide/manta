import React from 'react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'SWE Hub - Empower Your Software Engineering Journey',
  description: 'Join a community of passionate software engineers, access curated resources, and accelerate your career.',
};

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white min-h-screen flex items-center">
        <div className="container mx-auto px-6 flex flex-col items-start space-y-8">
          <h1 className="text-5xl font-bold leading-tight bg-gradient-to-r from-gray-800 to-black bg-clip-text text-transparent">
            Empower Your Software Engineering Journey
          </h1>
          <p className="text-lg text-white max-w-2xl">
            Start your journey with tailored tutorials, expert mentorship, and an active community.
          </p>
          <div className="flex space-x-4">
            {/* Primary action as black background with white text */}
            <Button className="bg-black text-white hover:bg-gray-800">
              Get Started
            </Button>
            {/* Secondary action as white background with black text */}
            <Button className="bg-white text-black border border-black hover:bg-black hover:text-white">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold text-black">Features</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Everything you need to grow as a software engineer, all in one place.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 border border-black rounded-lg hover:shadow-lg transition-shadow bg-white">
              <h3 className="text-xl font-semibold mb-2 text-black">Curated Learning Paths</h3>
              <p className="text-black">
                Follow structured tracks from frontend to backend, DevOps, and more, designed by industry experts.
              </p>
            </div>
            <div className="p-6 border border-black rounded-lg hover:shadow-lg transition-shadow bg-white">
              <h3 className="text-xl font-semibold mb-2 text-black">Expert Community</h3>
              <p className="text-black">
                Collaborate with mentors and peers, participate in code reviews, and share your knowledge.
              </p>
            </div>
            <div className="p-6 border border-black rounded-lg hover:shadow-lg transition-shadow bg-white">
              <h3 className="text-xl font-semibold mb-2 text-black">Real-world Projects</h3>
              <p className="text-black">
                Build a portfolio of practical applications that demonstrate your skills to potential employers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-indigo-50 py-20">
        <div className="container mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to Level Up?</h2>
          <p className="text-gray-700 max-w-lg mx-auto">
            Start your software engineering adventure today and unlock exclusive resources.
          </p>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
            Join Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-white">&copy; {new Date().getFullYear()} SWE Hub. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}