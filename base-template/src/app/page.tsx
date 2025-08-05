import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="flex flex-col items-center bg-gray-50">
      {/* Hero Section */}
      <section className="w-full bg-white py-20 px-6 md:px-20 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Hi, I&rsquo;m Jane Doe
        </h1>
        <p className="text-lg md:text-2xl text-gray-700 mb-8 max-w-2xl">
          I&rsquo;m a Software Engineer specializing in building exceptional digital experiences. Welcome to my portfolio.
        </p>
        <Button asChild>
          <Link href="#projects">View My Work</Link>
        </Button>
      </section>

      {/* Projects Section */}
      <section id="projects" className="w-full max-w-6xl py-20 px-6 md:px-0">
        <h2 className="text-3xl font-semibold text-center mb-12">
          Featured Projects
        </h2>
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <Link href="https://github.com/janedoe/project-alpha" target="_blank">
              <div className="h-40 bg-gray-200 rounded-t-lg"></div>
              <div className="p-4">
                <h3 className="text-xl font-medium mb-2">Project Alpha</h3>
                <p className="text-gray-600 text-sm">
                  A web application that leverages AI to optimize workflows and increase productivity.
                </p>
              </div>
            </Link>
          </Card>
          <Card>
            <Link href="https://github.com/janedoe/project-beta" target="_blank">
              <div className="h-40 bg-gray-200 rounded-t-lg"></div>
              <div className="p-4">
                <h3 className="text-xl font-medium mb-2">Project Beta</h3>
                <p className="text-gray-600 text-sm">
                  A mobile-first social platform built with React Native and Firebase.
                </p>
              </div>
            </Link>
          </Card>
          <Card>
            <Link href="https://github.com/janedoe/project-gamma" target="_blank">
              <div className="h-40 bg-gray-200 rounded-t-lg"></div>
              <div className="p-4">
                <h3 className="text-xl font-medium mb-2">Project Gamma</h3>
                <p className="text-gray-600 text-sm">
                  A real-time data visualization dashboard using D3.js and Next.js.
                </p>
              </div>
            </Link>
          </Card>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="w-full max-w-3xl py-20 px-6 md:px-0">
        <h2 className="text-3xl font-semibold text-center mb-8">
          Get In Touch
        </h2>
        <form className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <Input id="name" type="text" placeholder="Your Name" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <Textarea id="message" placeholder="Say hello or describe your project..." rows={5} />
          </div>
          <Button type="submit" className="w-full justify-center">
            Send Message
          </Button>
        </form>
      </section>
    </main>
  );
}