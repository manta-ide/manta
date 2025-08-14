'use client';

import React, { FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function Home() {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = data.get('name');
    const email = data.get('email');
    const message = data.get('message');
    // For demo purposes just log – replace with your favourite email service.
    // eslint-disable-next-line no-console
    console.log({ name, email, message });
    alert('Thank you for reaching out!');
    e.currentTarget.reset();
  };

  const projects = [
    {
      title: 'Realtime Chat App',
      description: 'Socket.io powered chat application with rooms and live typing indicators.',
      href: 'https://github.com/yourname/realtime-chat',
      image: '/window.svg',
    },
    {
      title: 'AI Code Assistant',
      description: 'VSCode extension that suggests code completions using GPT-4.',
      href: 'https://github.com/yourname/ai-code-assistant',
      image: '/file.svg',
    },
    {
      title: 'Travel Planner',
      description: 'Full-stack Next.js app that helps travelers plan and visualize their trips.',
      href: 'https://github.com/yourname/travel-planner',
      image: '/globe.svg',
    },
  ];

  return (
    <main id="node-element-swe-portfolio-page" className="flex flex-col scroll-smooth">
      {/* Hero Section */}
      <section
        id="node-element-hero-section"
        className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-6 text-center dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
      >
        <h1
          id="node-element-hero-title"
          className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl md:text-6xl"
        >
          John Doe
        </h1>
        <p
          id="node-element-hero-subtitle"
          className="mt-4 max-w-xl text-lg text-slate-700 dark:text-slate-300 sm:text-xl"
        >
          Full-Stack Software Engineer crafting delightful web experiences.
        </p>
        <Button
          asChild
          className="mt-8 bg-[#c770c0] hover:bg-[#c770c0]/90 text-[#ffffff] font-sans rounded-md"
          id="node-element-cta-button"
          size="lg"
        >
          <Link href="#projects">See My Work</Link>
        </Button>
      </section>

      {/* About Section */}
      <section
        id="node-element-about-section"
        className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-24 md:flex-row"
      >
        {/* Profile Image */}
        <div className="relative h-48 w-48 flex-shrink-0 md:h-60 md:w-60">
          <Image
            id="node-element-profile-image"
            src="/vercel.svg"
            alt="John Doe avatar"
            fill
            className="rounded-full object-cover shadow-lg"
          />
        </div>
        {/* About Text */}
        <div id="node-element-about-text" className="prose dark:prose-invert max-w-none md:ml-10">
          <h2 className="mb-4 text-3xl font-bold">About Me</h2>
          <p>
            I’m a passionate software engineer with 5+ years of experience building scalable web
            applications. My expertise lies in React, Next.js, TypeScript, and cloud-native
            architectures.
          </p>
          <p>
            I enjoy turning complex problems into simple, beautiful, and intuitive solutions. When
            I’m not coding, you’ll find me hiking, reading sci-fi novels, or experimenting with new
            coffee brewing techniques.
          </p>
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="projects" // anchor target for smooth scroll
        className="w-full bg-slate-50 py-24 dark:bg-slate-800"
      >
        <div
          id="node-element-projects-section"
          className="mx-auto w-full max-w-6xl px-6"
        >
          <h2 className="text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
            My Projects
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.title}
                href={project.href}
                className="group"
                target="_blank"
                rel="noopener noreferrer"
              >
                <article
                  id="node-element-project-card"
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg dark:border-slate-700"
                >
                  <div className="relative h-44 w-full bg-slate-100 dark:bg-slate-700">
                    <Image
                      src={project.image}
                      alt={project.title}
                      fill
                      className="object-contain p-6 transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {project.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {project.description}
                    </p>
                    <span className="mt-auto text-primary">View project →</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="node-element-contact-section" className="mx-auto w-full max-w-4xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
          Get In Touch
        </h2>
        <div className="mt-12 flex flex-col gap-16 md:flex-row">
          {/* Contact Form */}
          <form
            id="node-element-contact-form"
            onSubmit={handleSubmit}
            className="flex w-full flex-col gap-4 md:w-2/3"
          >
            <Input name="name" placeholder="Name" required />
            <Input name="email" type="email" placeholder="Email" required />
            <Textarea name="message" placeholder="Your message" rows={5} required />
            <Button type="submit" className="self-start">
              Send Message
            </Button>
          </form>

          {/* Contact Info */}
          <div
            id="node-element-contact-info"
            className="flex flex-col gap-4 text-base text-slate-700 dark:text-slate-300 md:w-1/3"
          >
            <p className="font-semibold">Email</p>
            <Link href="mailto:john.doe@example.com" className="hover:underline">
              john.doe@example.com
            </Link>
            <p className="font-semibold mt-6">Social</p>
            <Link href="https://github.com/yourname" target="_blank" className="hover:underline">
              GitHub
            </Link>
            <Link href="https://linkedin.com/in/yourname" target="_blank" className="hover:underline">
              LinkedIn
            </Link>
            <Link href="https://twitter.com/yourname" target="_blank" className="hover:underline">
              Twitter
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
