"use client"
import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MenuIcon } from "lucide-react"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function Home() {
  // Dummy project data – in a real setup this could be fetched from a CMS
  const projects = [
    {
      title: "Real-time Chat App",
      description:
        "A scalable chat application with WebSocket real-time messaging, built with Next.js, Socket.IO, and Redis.",
      tech: ["Next.js", "Socket.IO", "Redis", "Tailwind"],
      href: "https://github.com/yourname/chat-app",
      image: "/window.svg",
    },
    {
      title: "AI-powered Blog",
      description:
        "Markdown blog platform that generates cover images & summaries using OpenAI. Deployed to Vercel edge runtime.",
      tech: ["Next.js", "OpenAI", "Prisma", "PostgreSQL"],
      href: "https://github.com/yourname/ai-blog",
      image: "/globe.svg",
    },
    {
      title: "E-commerce Storefront",
      description:
        "Headless commerce storefront integrating Stripe checkout and Shopify product catalogue.",
      tech: ["Next.js", "Stripe", "Shopify", "Typescript"],
      href: "https://github.com/yourname/commerce-storefront",
      image: "/window.svg",
    },
  ]

  const [form, setForm] = useState({ name: "", email: "", message: "" })
  const [status, setStatus] = useState<null | "success" | "error" | "loading">(
    null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setStatus("success")
        setForm({ name: "", email: "", message: "" })
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <div
      id="node-element-portfolio-page"
      className="flex flex-col min-h-dvh bg-background text-foreground selection:bg-primary/80 selection:text-primary-foreground scroll-smooth"
    >
      {/* Header */}
      <header
        id="node-element-header-section"
        className="fixed inset-x-0 top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border"
      >
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo / Name */}
          <Link
            href="#node-element-hero-section"
            className="text-lg font-semibold tracking-tight"
          >
            John Doe
          </Link>

          {/* Desktop nav */}
          <div className="hidden gap-6 md:flex">
            <Link
              href="#node-element-hero-section"
              className="font-medium hover:text-primary transition-colors"
            >
              About
            </Link>
            <Link
              href="#node-element-projects-section"
              className="font-medium hover:text-primary transition-colors"
            >
              Projects
            </Link>
            <Link
              href="#node-element-contact-footer-section"
              className="font-medium hover:text-primary transition-colors"
            >
              Contact
            </Link>
          </div>

          {/* Mobile nav */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between border-b border-border px-4 h-16">
                  <span className="font-semibold">Navigate</span>
                </div>
                <div className="flex flex-col gap-4 p-6 text-lg font-medium">
                  <Link href="#node-element-hero-section">About</Link>
                  <Link href="#node-element-projects-section">Projects</Link>
                  <Link href="#node-element-contact-footer-section">Contact</Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </header>

      <main className="flex flex-col flex-grow">
        {/* Hero Section */}
        <section
          id="node-element-hero-section"
          className="container mx-auto grid md:grid-cols-2 gap-8 items-center pt-32 pb-24 px-4"
        >
          {/* Text */}
          <div className="space-y-6 animate-in slide-in-from-left-6 fade-in duration-700">
            <h1 className="text-4xl/tight md:text-5xl/tight font-bold">
              Hi, I’m John — a software engineer crafting delightful web
              experiences.
            </h1>
            <p className="text-muted-foreground text-lg max-w-prose">
              I specialise in building full-stack applications with React,
              Next.js, and TypeScript, focusing on performance, accessibility,
              and great developer experience.
            </p>
            <div>
              <Button asChild size="lg">
                <Link href="#node-element-projects-section">View my work</Link>
              </Button>
            </div>
          </div>

          {/* Illustration */}
          <div className="relative justify-self-center animate-in slide-in-from-right-6 fade-in duration-700 delay-200">
            <Image
              src="/globe.svg"
              alt="3D globe illustration"
              width={400}
              height={400}
              className="dark:invert select-none"
              priority
            />
          </div>
        </section>

        {/* Projects Section */}
        <section
          id="node-element-projects-section"
          className="container mx-auto pb-24 px-4"
        >
          <h2 className="text-3xl font-bold mb-8 text-center">Projects</h2>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.title}
                className="flex flex-col overflow-hidden group"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-contain p-6 transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-col gap-4 p-6 flex-grow">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">{project.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {project.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {project.tech.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <Button asChild className="mt-auto w-full">
                    <Link href={project.href} target="_blank" rel="noreferrer">
                      View on GitHub
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Contact & Footer Section */}
        <section
          id="node-element-contact-footer-section"
          className="bg-muted/50 dark:bg-muted/10 py-24 px-4"
        >
          <div className="container mx-auto grid md:grid-cols-2 gap-16 items-start">
            {/* Contact Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-6 md:pr-8"
              aria-labelledby="contact-heading"
            >
              <h2
                id="contact-heading"
                className="text-3xl font-bold mb-2 tracking-tight"
              >
                Get in touch
              </h2>
              <Input
                required
                type="text"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Textarea
                required
                rows={5}
                placeholder="Message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Sending…" : "Send message"}
              </Button>
              {status === "success" && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Thanks! I’ll get back to you soon.
                </p>
              )}
              {status === "error" && (
                <p className="text-sm text-destructive">Something went wrong.</p>
              )}
            </form>

            {/* Footer & Social */}
            <div className="flex flex-col items-center justify-between h-full gap-8 text-center">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Find me online</h3>
                <div className="flex gap-4 justify-center">
                  <Button asChild variant="ghost" size="icon" aria-label="GitHub">
                    <Link
                      href="https://github.com/yourname"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="size-5 fill-current"
                      >
                        <path d="M12 0a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.41-1.35-1.79-1.35-1.79-1.11-.76.09-.74.09-.74 1.23.09 1.88 1.26 1.88 1.26 1.09 1.87 2.86 1.33 3.56 1.02.11-.79.43-1.33.78-1.63-2.67-.3-5.49-1.34-5.49-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0C17.95 5.4 18.96 5.72 18.96 5.72c.66 1.65.25 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.62-2.83 5.64-5.52 5.93.44.38.83 1.13.83 2.28 0 1.64-.02 2.96-.02 3.36 0 .32.22.7.83.58A12 12 0 0 0 12 0Z" />
                      </svg>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="icon" aria-label="LinkedIn">
                    <Link
                      href="https://linkedin.com/in/yourname"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="size-5 fill-current"
                      >
                        <path d="M4.98 3.5C4.98 5 3.87 6 2.5 6S0 5 0 3.5 1.12 1 2.5 1s2.48 1 2.48 2.5zM0 8h5V24H0V8zm7.5 0h4.77v2.63h.07c.66-1.18 2.28-2.42 4.7-2.42 5.03 0 5.96 3.31 5.96 7.61V24H18V16.15c0-1.88-.03-4.3-2.62-4.3-2.62 0-3.02 2.05-3.02 4.17V24H7.5V8z" />
                      </svg>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="icon" aria-label="Twitter">
                    <Link
                      href="https://twitter.com/yourname"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="size-5 fill-current"
                      >
                        <path d="M24 4.56c-.88.39-1.83.65-2.83.77a4.92 4.92 0 0 0 2.16-2.72 10.01 10.01 0 0 1-3.13 1.2 4.91 4.91 0 0 0-8.38 4.48 13.94 13.94 0 0 1-10.12-5.13 4.91 4.91 0 0 0 1.52 6.56 4.88 4.88 0 0 1-2.23-.61v.06a4.92 4.92 0 0 0 3.94 4.82 4.96 4.96 0 0 1-2.22.08 4.92 4.92 0 0 0 4.6 3.42A9.86 9.86 0 0 1 0 19.54a13.9 13.9 0 0 0 7.55 2.21c9.05 0 14-7.5 14-14a13.14 13.14 0 0 0-.01-.64A9.9 9.9 0 0 0 24 4.56z" />
                      </svg>
                    </Link>
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} John Doe. All rights reserved.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
