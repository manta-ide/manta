import Link from "next/link";
import { getVar } from "@/lib/vars";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export default function Page() {
  type Project = {
    title: string;
    description: string;
    tags: string[];
    imageText: string;
    repo?: string;
    demo?: string;
  };

  const projects: Project[] = [
    {
      title: "Realtime Analytics Dashboard",
      description:
        "A high-performance dashboard powered by Next.js App Router, streaming server components, and edge functions.",
      tags: ["Next.js", "Tailwind", "Edge", "Postgres"],
      imageText: "Analytics+Dashboard",
      repo: "#",
      demo: "#",
    },
    {
      title: "AI Code Review Bot",
      description:
        "A GitHub bot that reviews pull requests using LLMs with structured feedback and inline suggestions.",
      tags: ["TypeScript", "OpenAI", "GitHub Apps"],
      imageText: "AI+Code+Review",
      repo: "#",
      demo: "#",
    },
    {
      title: "E-commerce Platform",
      description:
        "Modular commerce stack with payments, inventory, and CMS integrations. Fully typed end-to-end.",
      tags: ["tRPC", "Prisma", "Stripe", "NextAuth"],
      imageText: "E-commerce",
      repo: "#",
      demo: "#",
    },
    {
      title: "Open Source UI Kit",
      description:
        "A composable UI kit built on top of shadcn/ui with extensive documentation and examples.",
      tags: ["UI", "Radix", "shadcn/ui"],
      imageText: "UI+Kit",
      repo: "#",
      demo: "#",
    },
  ];

  return (
    <main
      id="portfolio-page"
      className="min-h-screen antialiased bg-[var(--portfolio-page-background-color)] text-[var(--portfolio-page-text-color)]"
      style={{
        // Portfolio Page Vars
        ["--portfolio-page-background-color" as any]: getVar(
          "portfolio-page-background-color",
          "#fefefe"
        ),
        ["--portfolio-page-text-color" as any]: getVar(
          "portfolio-page-text-color",
          "#080808"
        ),
        ["--portfolio-page-section-padding" as any]: `${getVar(
          "portfolio-page-section-padding",
          "23"
        )}px`,
        fontFamily: getVar("portfolio-page-font-family", "Inter, sans-serif"),
      }}
    >
      {/* Header Section */}
      <section
        id="header-section"
        className="sticky top-0 z-40 w-full border-b bg-[var(--header-section-background-color)] text-[var(--header-section-text-color)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--header-section-background-color)_80%,transparent)]"
        style={{
          ["--header-section-background-color" as any]: getVar(
            "header-section-background-color",
            "#ffffff"
          ),
          ["--header-section-text-color" as any]: getVar(
            "header-section-text-color",
            "#0a0a0a"
          ),
          ["--header-section-padding" as any]: `${getVar(
            "header-section-padding",
            "12"
          )}px`,
          ["--header-section-font-size" as any]: `${getVar(
            "header-section-font-size",
            "20"
          )}px`,
        }}
        aria-label="Header and navigation"
      >
        <div className="mx-auto max-w-7xl px-6 py-[var(--header-section-padding)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="size-9 rounded-md bg-gradient-to-br from-black/10 to-black/5 flex items-center justify-center shadow-sm"
                aria-hidden="true"
              >
                <span className="sr-only">Logo</span>
                <span className="text-base font-bold">SE</span>
              </div>
              <div className="flex flex-col">
                <span
                  className="text-[length:var(--header-section-font-size)] leading-none font-semibold"
                  aria-label="Site name"
                >
                  Software Engineer
                </span>
                <span className="text-sm text-black/60 dark:text-black/70">
                  {getVar("header-section-tagline", "Welcome")}
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
              <Link href="#projects-section">Projects</Link>
              <Link href="#contact-section">Contact</Link>
            </nav>

            <div className="md:hidden">
              <Link href="#contact-section" className="">
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[
              "TypeScript",
              "React",
              "Next.js",
              "Node.js",
              "Tailwind CSS",
              "GraphQL",
            ].map((s) => (
              <Badge key={s} variant="secondary" className="px-3 py-1">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="projects-section"
        className="relative py-[var(--portfolio-page-section-padding)] bg-[var(--projects-section-background-color)] text-[var(--projects-section-text-color)]"
        style={{
          ["--projects-section-background-color" as any]: getVar(
            "projects-section-background-color",
            "#ffffff"
          ),
          ["--projects-section-text-color" as any]: getVar(
            "projects-section-text-color",
            "#000000"
          ),
          ["--projects-section-card-shadow" as any]: getVar(
            "projects-section-card-shadow",
            "0px 4px 6px rgba(0, 0, 0, 0.1)"
          ),
          ["--projects-section-card-color" as any]: getVar(
            "projects-section-card-color",
            "#e0e0e0"
          ),
        }}
        aria-labelledby="projects-heading"
      >
        <div className="mx-auto max-w-7xl px-6">
          <header className="mb-8">
            <h2 id="projects-heading" className="text-3xl font-bold tracking-tight">
              Project Showcase
            </h2>
            <p className="mt-2 text-muted-foreground/80">
              Selected work that highlights product thinking, DX, and elegant systems.
            </p>
          </header>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects
              .slice(0, Number(getVar("projects-section-max-projects", "3")) || 3)
              .map((p) => (
                <Card
                  key={p.title}
                  className="overflow-hidden border-0 bg-[var(--projects-section-card-color)]"
                  style={{ boxShadow: "var(--projects-section-card-shadow)" }}
                >
                  <div className="aspect-[16/10] w-full overflow-hidden">
                    <img
                      src={`https://placehold.co/1024x640/0f172a/ffffff?text=${encodeURIComponent(
                        p.imageText
                      )}&font=Inter`}
                      alt={`${p.title} preview`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      width={1024}
                      height={640}
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-xl">{p.title}</CardTitle>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {p.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between gap-3">
                    <Link href={p.repo ?? "#"}>View Repo</Link>
                    <Separator orientation="vertical" className="h-5" />
                    <Link href={p.demo ?? "#"}>Live Demo</Link>
                  </CardFooter>
                </Card>
              ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact-section"
        className="py-[var(--portfolio-page-section-padding)] m-[var(--contact-section-margin)]"
        style={{
          ["--contact-section-margin" as any]: `${getVar("contact-section-margin", "10")}px`,
        }}
        aria-labelledby="contact-heading"
      >
        <div className="mx-auto max-w-3xl px-6">
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle id="contact-heading" className="text-2xl">
                Get in touch
              </CardTitle>
              <CardDescription>
                I’m open to new opportunities, collaborations, and interesting problems.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-6" noValidate>
                <div className="grid gap-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input id="name" name="name" placeholder="Ada Lovelace" aria-required="true" />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input id="email" name="email" type="email" placeholder="ada@example.com" aria-required="true" />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="message" className="text-sm font-medium">
                    Message
                  </label>
                  <Textarea id="message" name="message" placeholder="Tell me about your project..." rows={5} aria-required="true" />
                </div>
                <div className="flex items-center justify-end">
                  <Button type="submit" aria-disabled={true} disabled>
                    Send Message
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
