import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const metadata = {
  title: 'John Doe - Software Engineer Portfolio',
  description:
    'Showcase of projects, skills, and expertise of John Doe, a passionate Software Engineer.',
};

export default function Home() {
  const skills = ['TypeScript', 'React', 'Next.js', 'Node.js', 'GraphQL', 'Tailwind CSS'];
  const projects = [
    {
      title: 'Portfolio Website',
      description: 'A static portfolio built with Next.js and Tailwind CSS showcasing my work and blog.',
      link: 'https://github.com/johndoe/portfolio',
    },
    {
      title: 'Real-time Chat App',
      description: 'A full-stack chat application using Socket.io, Express, and React.',
      link: 'https://github.com/johndoe/chat-app',
    },
    {
      title: 'E-commerce Platform',
      description: 'A headless e-commerce store built with Next.js, GraphQL, and Stripe integration.',
      link: 'https://github.com/johndoe/e-commerce',
    },
  ];

  const handleScrollToContact = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="py-20 px-4 text-center">
        <h1 className="text-5xl font-extrabold mb-4">Hey, I'm John Doe</h1>
        <p className="max-w-2xl mx-auto mb-6 text-lg text-muted-foreground">
          I build performant and scalable web applications using modern technologies. Let's build something great together.
        </p>
        <Button size="lg" onClick={handleScrollToContact}>
          Get in Touch
        </Button>
      </section>

      {/* Skills Section */}
      <section className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6 text-center">Skills &amp; Technologies</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {skills.map((skill) => (
            <Badge key={skill} variant="secondary" className="text-sm">
              {skill}
            </Badge>
          ))}
        </div>
      </section>

      {/* Projects Section */}
      <section className="py-16 px-4 bg-gray-50">
        <h2 className="text-3xl font-bold mb-8 text-center">Featured Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(({ title, description, link }) => (
            <Card key={title} className="flex flex-col p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-semibold mb-3">{title}</h3>
              <p className="text-sm text-muted-foreground flex-grow">{description}</p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-4 self-start"
              >
                <a href={link} target="_blank" rel="noopener noreferrer">
                  View Repo
                </a>
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 px-4">
        <h2 className="text-3xl font-bold mb-6 text-center">Contact Me</h2>
        <form className="max-w-xl mx-auto space-y-4">
          <Input type="text" placeholder="Your Name" />
          <Input type="email" placeholder="Your Email" />
          <Textarea placeholder="Your Message" rows={4} />
          <Button type="submit" className="w-full justify-center">
            Send Message
          </Button>
        </form>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} John Doe. All rights reserved.
      </footer>
    </main>
  );
}
