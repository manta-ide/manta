'use client';






import React from "react"
import Image from "next/image"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

// Dummy data – in a real application this could come from a CMS or an API
const skills = [
  "TypeScript",
  "React & Next.js",
  "Node.js",
  "GraphQL",
  "PostgreSQL",
  "AWS",
  "Docker",
  "CI/CD",
] as const

const projects = [
  {
    title: "Realtime Collaboration Tool",
description: "A web-based collaborative editor enabling teams to edit documents concurrently with operational-transforms and WebSockets.",
    href: "https://github.com/example/realtime-editor",
    tech: ["Next.js", "tRPC", "WebSockets"],
    executionTime: "6 months",
  },
  {
    title: "E-commerce Platform",
    description: "Scalable multi-tenant e-commerce solution supporting thousands of stores, built with a micro-services architecture.",
    href: "https://github.com/example/commerce",
tech: ["NestJS", "PostgreSQL", "Redis"],
    executionTime: "1 year",
  },
  {
    title: "Automated Trading Bot",
    description: "High-frequency crypto trading bot executing strategies with sub-second latency, written in Rust and TypeScript.",
    href: "https://github.com/example/trading-bot",
    tech: ["Rust", "TypeScript", "gRPC"],
    executionTime: "3 months",
  },
] as const

const ProjectCard = () => (
  <div
id="node-element-project-card"
className="group relative flex flex-col rounded-lg border border-gray-300 bg-white p-4 shadow hover:shadow-lg"
  >
    <h2 className="text-xl font-semibold">Project Title</h2>
    <p className="mt-2 text-gray-500">This is a project description.</p>
    <a
      href="#"
      className="mt-4 inline-block rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
    >
      Check on GitHub
    </a>
  </div>
);

export default function Home() {
  return (
    <main
      id="node-element-swe-portfolio-page"
      className="flex flex-col items-center gap-24 px-4 pt-20 md:px-8 lg:px-24"
    >
      {/* Hero Section */}
      <section
        id="node-element-hero-section"
        className="flex w-full max-w-5xl flex-col items-center gap-6 text-center"
      >
        {/* Profile Image */}
        {/* Removed node-element-profile-image as requested */}

        {/* Title */}
        <h1
          id="node-element-hero-title"
          className="text-4xl font-extrabold tracking-tight text-red-600 sm:text-5xl md:text-6xl"
        >
          John Doe
        </h1>

        {/* Subtitle */}
        <p
          id="node-element-hero-subtitle"
          className="max-w-2xl text-lg text-muted-foreground sm:text-xl"
        >
          Building delightful developer experiences and scalable infrastructure.
        </p>
      </section>

      {/* Skills Section */}
      <section
        id="node-element-skills-section"
        className="flex w-full max-w-5xl flex-col gap-8"
      >
        <h2 className="text-2xl font-semibold">Skills</h2>
        <ul className="flex flex-wrap gap-3">
          {skills.map((skill) => (
            <li key={skill} id="node-element-skill-badge">
              <Badge variant="secondary" className="text-sm">
                {skill}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* Projects Section */}
      <section
        id="node-element-projects-section"
        className="flex w-full max-w-5xl flex-col gap-8"
      >
        <h2 className="text-2xl font-semibold">Projects</h2>
<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.title}
              id="node-element-project-card"
              className="group h-full transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <CardHeader>
                <CardTitle>{project.title}</CardTitle>
                <CardDescription className="flex flex-wrap gap-1 pt-2">
                  {project.tech.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 pb-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>

                <Button
                  asChild
                  size="sm"
                  className="mt-2 self-start bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
                >
                  <Link href={project.href} target="_blank" rel="noopener noreferrer">
                    View on GitHub
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="node-element-contact-section"
        className="flex w-full max-w-3xl flex-col gap-8"
      >
        <h2 className="text-2xl font-semibold">Get in touch</h2>

        {/* Contact Form */}
        <form
          id="node-element-contact-form"
          className="flex flex-col gap-4 rounded-xl border p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            // In a real product this would post to an API route.
            alert("Thanks for reaching out! I'll get back to you soon.")
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Name</span>
              <Input name="name" placeholder="Your name" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Email</span>
              <Input
                type="email"
                name="email"
                placeholder="you@example.com"
                required
                aria-describedby="email-help"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Message</span>
            <Textarea name="message" rows={5} placeholder="Let's build something great together..." required />
          </label>
          <div className="flex justify-end">
            <Button type="submit">Send message</Button>
          </div>
        </form>

        {/* Social Links Group */}
        <div id="node-element-social-links-group" className="flex items-center gap-4">
          {[
            { href: "https://github.com/example", label: "GitHub" },
            { href: "https://linkedin.com/in/example", label: "LinkedIn" },
            { href: "https://twitter.com/example", label: "Twitter" },
          ].map((link) => (
            <Link
              id="node-element-social-link"
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}