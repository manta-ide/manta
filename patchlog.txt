import { getVar } from "@/lib/vars";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function Page() {
  const projectsCount = Number(getVar("projects-section-max-projects", 3) as number);

  return (
    <main
      id="portfolio-page"
      className="min-h-screen"
      style={{
        background: String(getVar("portfolio-page-background-color", "#f5ebeb")),
        color: String(getVar("portfolio-page-text-color", "#080808")),
        fontFamily: String(getVar("portfolio-page-font-family", "Inter, sans-serif")),
      }}
    >
      {/* Header Section */}
      <section
        id="header-section"
        className="sticky top-0 z-40 border-b/50 border-b backdrop-blur supports-[backdrop-filter]:bg-white/70"
        style={{
          background: String(getVar("header-section-background-color", "#ffffff")),
          color: String(getVar("header-section-text-color", "#0a0a0a")),
          paddingTop: Number(getVar("header-section-padding", 12) as number),
          paddingBottom: Number(getVar("header-section-padding", 12) as number),
        }}
        aria-label="Site header with navigation"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow"
              aria-label="Logo"
            >
              SE
            </div>
            <div className="flex flex-col">
              <span
                className="font-semibold leading-tight"
                style={{ fontSize: Number(getVar("header-section-font-size", 20) as number) }}
              >
                Software Engineer
              </span>
              <span className="text-sm text-muted-foreground/80">
                {String(getVar("header-section-tagline", "Welcome"))}
              </span>
            </div>
          </div>
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 font-medium"
              style={{ fontSize: Number(getVar("header-section-font-size", 20) as number) }}
            >
              <li>
                <Link href="#header-section" className="hover:underline underline-offset-4">
                  Home
                </Link>
              </li>
              <li>
                <Link href="#projects-section" className="hover:underline underline-offset-4">
                  Projects
                </Link>
              </li>
              <li>
                <Link href="#contact-section" className="hover:underline underline-offset-4">
                  Contact
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="projects-section"
        className="w-full"
        style={{
          background: String(getVar("projects-section-background-color", "#ffffff")),
          color: String(getVar("projects-section-text-color", "#000000")),
          paddingTop: Number(getVar("portfolio-page-section-padding", 24) as number),
          paddingBottom: Number(getVar("portfolio-page-section-padding", 24) as number),
        }}
        aria-labelledby="projects-heading"
      >
        <div className="mx-auto max-w-7xl px-6">
          <header className="mb-10 flex items-end justify-between gap-4">
            <div>
              <h2 id="projects-heading" className="text-3xl font-bold tracking-tight">
                Selected Projects
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A curated collection of work showcasing product thinking and execution.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="secondary">Next.js</Badge>
              <Badge variant="secondary">TypeScript</Badge>
              <Badge variant="secondary">Tailwind</Badge>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: projectsCount }).map((_, i) => (
              <Card
                key={i}
                className="overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                style={{
                  background: String(getVar("projects-section-card-color", "#e0e0e0")),
                  boxShadow: String(
                    getVar(
                      "projects-section-card-shadow",
                      "0px 4px 6px rgba(0, 0, 0, 0.1)"
                    )
                  ),
                }}
              >
                <CardHeader>
                  <CardTitle className="text-xl">Project #{i + 1}</CardTitle>
                  <CardDescription>
                    A modern web application focused on performance and DX.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm/6">
                    Built with Next.js, TypeScript, and Tailwind CSS. Implements best practices for accessibility, security, and developer productivity.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge>Next.js</Badge>
                    <Badge variant="outline">TypeScript</Badge>
                    <Badge variant="secondary">Tailwind</Badge>
                  </div>
                </CardContent>
                <CardFooter className="justify-between">
                  <Button asChild variant="outline" size="sm">
                    <Link href="#">View details</Link>
                  </Button>
                  <Button size="sm">Live demo</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact-section"
        className="w-full"
        style={{
          paddingTop: Number(getVar("portfolio-page-section-padding", 24) as number),
          paddingBottom: Number(getVar("portfolio-page-section-padding", 24) as number),
          marginTop: Number(getVar("contact-section-margin", 10) as number),
          marginBottom: Number(getVar("contact-section-margin", 10) as number),
        }}
        aria-labelledby="contact-heading"
      >
        <div className="mx-auto max-w-3xl px-6">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle id="contact-heading" className="text-2xl">
                Get in touch
              </CardTitle>
              <CardDescription>
                Have a question or want to collaborate? Fill out the form and I'll get back to you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                aria-label="Contact form"
                className="grid grid-cols-1 gap-4"
                action="#"
                method="post"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="name" className="text-sm font-medium">
                      Name
                    </label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Jane Doe"
                      required
                      aria-required="true"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      placeholder="jane@example.com"
                      required
                      aria-required="true"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="message" className="text-sm font-medium">
                    Message
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="Tell me a bit about your project, timeline, and goals."
                    required
                    aria-required={true}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    By submitting this form, you agree to be contacted back regarding your inquiry.
                  </p>
                  <Button type="submit" className="min-w-32">
                    Send message
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}