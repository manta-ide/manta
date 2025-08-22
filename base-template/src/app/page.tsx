import Link from "next/link";
import { getVar } from "@/lib/vars";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Page() {
  const headerLinks = String(getVar("header-links", "Home, About, Projects, Contact"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function sectionHref(label: string): string {
    const key = label.toLowerCase();
    if (key === "home") return "#portfolio-page";
    if (key === "about") return "#about-section";
    if (key === "projects") return "#projects-section";
    if (key === "contact") return "#contact-section";
    return "#portfolio-page";
  }

  const skills = String(
    getVar("about-section-skills-list", "JavaScript, TypeScript, React, Node.js, GraphQL")
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const projectTitle = String(getVar("projects-section-project-card-title", "Title Placeholder"));
  const projectDesc = String(
    getVar("projects-section-project-card-description", "Description Placeholder")
  );
  const projectLink = String(getVar("projects-section-project-card-link", "https://example.com"));

  const socialLinks = String(getVar("footer-social-media-links", "LinkedIn, GitHub, Twitter"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function socialHref(name: string): string {
    const key = name.toLowerCase();
    if (key.includes("github")) return "https://github.com";
    if (key.includes("linkedin")) return "https://www.linkedin.com";
    if (key.includes("twitter") || key.includes("x")) return "https://twitter.com";
    return "#";
  }

  return (
    <main
      id="portfolio-page"
      className="min-h-screen bg-[var(--portfolio-page-background-color)] text-[var(--portfolio-page-text-color)] p-[var(--portfolio-page-padding)]"
      style={{
        ["--portfolio-page-background-color" as any]: String(
          getVar("portfolio-page-background-color", "#ffffff")
        ),
        ["--portfolio-page-text-color" as any]: String(
          getVar("portfolio-page-text-color", "#000000")
        ),
        ["--portfolio-page-padding" as any]: String(getVar("portfolio-page-padding", "20px")),
      }}
    >
      <header
        id="header"
        className="sticky top-0 z-40 border-b border-black/5 bg-[var(--header-background-color)] text-[var(--header-text-color)]"
        style={{
          ["--header-background-color" as any]: String(
            getVar("header-background-color", "#e2e8f0")
          ),
          ["--header-text-color" as any]: String(getVar("header-text-color", "#1a202c")),
          ["--header-padding" as any]: String(getVar("header-padding", "15px")),
        }}
        aria-label="Site header"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-[var(--header-padding)]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-black/10" aria-hidden="true" />
            <span className="text-base font-semibold tracking-tight">
              {String(getVar("header-logo", "SWE Portfolio"))}
            </span>
          </div>
          <nav className="hidden gap-6 md:flex" aria-label="Primary">
            {headerLinks.map((label) => (
              <Link
                key={label}
                href={sectionHref(label)}
                className="text-sm font-medium text-[var(--header-text-color)]/80 transition-colors hover:text-[var(--header-text-color)]"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="md:hidden" aria-hidden="true">
            <span className="text-sm text-[var(--header-text-color)]/70">Menu</span>
          </div>
        </div>
      </header>

      <section
        id="about-section"
        className="relative bg-[var(--about-section-background-color)] text-[var(--about-section-text-color)]"
        style={{
          ["--about-section-background-color" as any]: String(
            getVar("about-section-background-color", "#f9fafb")
          ),
          ["--about-section-text-color" as any]: String(
            getVar("about-section-text-color", "#1a202c")
          ),
          ["--about-section-padding" as any]: String(getVar("about-section-padding", "20px")),
        }}
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-[var(--about-section-padding)] md:grid-cols-2">
          <div className="order-2 md:order-1">
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              {String(getVar("header-logo", "SWE Portfolio"))}
            </h1>
            <p className="mt-4 max-w-prose text-base/7 text-black/70">
              {String(
                getVar(
                  "about-section-biography-text",
                  "A software engineer passionate about building scalable and maintainable applications."
                )
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2" aria-label="Skills">
              {skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
          <div className="order-1 md:order-2">
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={String(
                  getVar(
                    "about-section-image-url",
                    "https://placehold.co/800x800/f3f4f6/0f172a?text=Your+Photo&font=Poppins"
                  )
                )}
                alt={String(getVar("header-logo", "SWE Portfolio")) + " portrait"}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="projects-section"
        className="relative bg-[var(--projects-section-background-color)] text-[var(--projects-section-text-color)]"
        style={{
          ["--projects-section-background-color" as any]: String(
            getVar("projects-section-background-color", "#ffffff")
          ),
          ["--projects-section-text-color" as any]: String(
            getVar("projects-section-text-color", "#333333")
          ),
          ["--projects-section-padding" as any]: String(getVar("projects-section-padding", "15px")),
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-[var(--projects-section-padding)]">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Projects</h2>
            <Link
              href="#contact-section"
              className="inline-flex items-center rounded-md bg-black px-3 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-black/10 transition hover:bg-black/90"
            >
              Work with me
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">{projectTitle}</CardTitle>
                <CardDescription>{projectDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://placehold.co/600x360/e2e8f0/0f172a?text=Project+Preview&font=Poppins"
                  alt={projectTitle + " preview"}
                  className="h-40 w-full rounded-md object-cover"
                />
              </CardContent>
              <CardFooter className="mt-auto">
                <Link
                  href={projectLink}
                  className="text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700"
                >
                  Visit project
                </Link>
              </CardFooter>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Modern Dashboard</CardTitle>
                <CardDescription>Analytics dashboard with Next.js and Tailwind.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://placehold.co/600x360/d9f99d/0f172a?text=Analytics+App&font=Poppins"
                  alt="Modern Dashboard preview"
                  className="h-40 w-full rounded-md object-cover"
                />
              </CardContent>
              <CardFooter className="mt-auto">
                <Link
                  href="#"
                  className="text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700"
                >
                  View details
                </Link>
              </CardFooter>
            </Card>

            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Realtime Chat</CardTitle>
                <CardDescription>Websocket-powered chat with robust UX.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://placehold.co/600x360/bfd3f8/0f172a?text=Chat+App&font=Poppins"
                  alt="Realtime Chat preview"
                  className="h-40 w-full rounded-md object-cover"
                />
              </CardContent>
              <CardFooter className="mt-auto">
                <Link
                  href="#"
                  className="text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700"
                >
                  View details
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      <section
        id="contact-section"
        className="relative bg-[var(--contact-section-background-color)] text-[var(--contact-section-text-color)]"
        style={{
          ["--contact-section-background-color" as any]: String(
            getVar("contact-section-background-color", "#f1f5f9")
          ),
          ["--contact-section-text-color" as any]: String(
            getVar("contact-section-text-color", "#1a202c")
          ),
          ["--contact-section-padding" as any]: String(getVar("contact-section-padding", "20px")),
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-[var(--contact-section-padding)]">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Contact</h2>
          <p className="mt-2 text-sm text-black/60">
            I’d love to hear about your project. Fill the form and I’ll get back to you.
          </p>
          <form action="#" method="post" className="mt-8 grid grid-cols-1 gap-6" aria-label="Contact form">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder={String(getVar("contact-section-form-name-placeholder", "Your name"))}
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={String(getVar("contact-section-form-email-placeholder", "Your email"))}
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                name="message"
                placeholder={String(getVar("contact-section-form-message-placeholder", "Your message"))}
                className="min-h-[140px]"
              />
            </div>
            <div>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-black/10 transition hover:bg-black/90"
              >
                {String(getVar("contact-section-form-submit-text", "Send"))}
              </button>
            </div>
          </form>
        </div>
      </section>

      <footer
        id="footer"
        className="bg-[var(--footer-background-color)] text-[var(--footer-text-color)]"
        style={{
          ["--footer-background-color" as any]: String(getVar("footer-background-color", "#1a202c")),
          ["--footer-text-color" as any]: String(getVar("footer-text-color", "#f9fafb")),
          ["--footer-padding" as any]: String(getVar("footer-padding", "10px")),
        }}
        aria-label="Site footer"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-[var(--footer-padding)] sm:flex-row">
          <p className="text-xs/6 opacity-80">
            {String(getVar("footer-copyright-text", "© 2023 SWE Portfolio"))}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {socialLinks.map((name) => (
              <Link
                key={name}
                href={socialHref(name)}
                className="text-xs font-medium opacity-80 transition hover:opacity-100"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
