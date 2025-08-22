import Link from "next/link";
import { getVar } from "@/lib/vars";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Page() {
  // Parse dynamic lists from graph properties
  const navLabels = (getVar("nav-links", "About|Projects|Contact") || "")
    .split("|")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const badges = (getVar("badges", "TypeScript|React|Next.js|Node.js|PostgreSQL|AWS") || "")
    .split("|")
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Projects JSON
  let projects: Array<{
    title: string;
    description: string;
    tags?: string[];
    github?: string;
    demo?: string;
    image?: string;
  }> = [];
  try {
    const raw = getVar(
      "project-items",
      "[]"
    ) as string;
    projects = JSON.parse(raw || "[]");
  } catch {}

  // Available tags for toolbar (static UI; no client handlers in server component)
  const availableTags = (getVar(
    "available-tags",
    "React|Next.js|TypeScript|Node.js|Tailwind|D3|AI|Rust|Electron|CLI|PWA|Cloudflare|Workers|Images|WebSockets|Dexie"
  ) || "")
    .split("|")
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Experience & education
  let experience: Array<{
    role: string;
    company: string;
    period: string;
    summary?: string;
    highlights?: string[];
  }> = [];
  try {
    experience = JSON.parse(
      (getVar(
        "experience-items",
        "[]"
      ) as string) || "[]"
    );
  } catch {}

  let education: Array<{
    degree: string;
    school: string;
    period: string;
    details?: string;
  }> = [];
  try {
    education = JSON.parse(
      (getVar(
        "education-items",
        "[]"
      ) as string) || "[]"
    );
  } catch {}

  // Helpers
  const anchorFor = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("about")) return "#about-section";
    if (l.includes("project")) return "#projects-section";
    if (l.includes("contact")) return "#contact-footer";
    return "#";
  };

  const heroImage = (getVar("hero-image-url", "") as string) || "";

  return (
    <main
      id="portfolio-page"
      className="min-h-screen w-full bg-[var(--background-color)] text-[var(--text-color)] antialiased selection:bg-[var(--accent-color)]/20 selection:text-white scroll-smooth"
      style={{ fontFamily: "var(--font-family)" }}
    >
      {/* Background noise (subtle) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[var(--noise-opacity)] mix-blend-overlay"
        style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 160 160%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix type=%27saturate%27 values=%270%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%270.08%27/%3E%3C/svg%3E')" }}
      />

      {/* Header + Hero */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 bg-black/20 backdrop-blur supports-[backdrop-filter]:bg-black/10"
        id="hero"
      >
        <div className="mx-auto w-full max-w-[var(--container-max-width)] px-6 md:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo / Title */}
            <Link href="#portfolio-page" className="group inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded-md">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-color)] text-white font-semibold shadow-sm shadow-black/20">
                {getVar("logo-text", "YN")}
              </span>
              <span className="hidden text-sm/6 text-white/80 md:block">
                {getVar("site-title", "Your Name — Software Engineer")}
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-6 md:flex">
              {navLabels.map((label) => (
                <Link
                  key={label}
                  href={anchorFor(label)}
                  className="text-sm text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] rounded"
                >
                  {label}
                </Link>
              ))}
              <Link
                href={(getVar("resume-url", "/resume.pdf") as string) || "/resume.pdf"}
                className="hidden md:inline-flex"
              >
                <Button className="bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color)]/90">
                  Resume
                </Button>
              </Link>
            </nav>

            {/* Mobile Nav */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white/80 hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    <span className="sr-only">Open menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="bg-[var(--background-color)] text-[var(--text-color)]">
                  <SheetHeader>
                    <SheetTitle className="text-white/90">
                      {getVar("site-title", "Your Name — Software Engineer")}
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="mt-6 flex flex-col gap-3">
                    {navLabels.map((label) => (
                      <Link
                        key={label}
                        href={anchorFor(label)}
                        className="rounded px-2 py-2 text-base text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                      >
                        {label}
                      </Link>
                    ))}
                    <Link href={(getVar("resume-url", "/resume.pdf") as string) || "/resume.pdf"} className="mt-2">
                      <Button className="w-full bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color)]/90">Resume</Button>
                    </Link>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative overflow-hidden">
          {/* Animated gradient accent */}
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,theme(colors.white/10),transparent)]">
            <div className="absolute inset-0 animate-pulse rounded-full bg-[conic-gradient(from_90deg_at_50%_50%,var(--primary-color),var(--accent-color),transparent_60%)] blur-3xl opacity-30" />
          </div>

          <div className="mx-auto w-full max-w-[var(--container-max-width)] px-6 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16">
            <div className="mx-auto max-w-3xl text-center">
              <Badge className="mb-4 bg-white/10 text-white hover:bg-white/15">
                {getVar("hero-role", "Software Engineer")}
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {getVar("hero-name", "Your Name")}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-base leading-relaxed text-white/70 md:text-lg">
                {getVar("hero-pitch", "I build reliable, scalable web apps with delightful UX.")}
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href={(getVar("primary-cta-link", "#contact") as string) || "#contact-footer"}>
                  <Button className="h-10 rounded-full bg-[var(--accent-color)] px-5 text-white hover:bg-[var(--accent-color)]/90">
                    {getVar("primary-cta-text", "Get in touch")}
                  </Button>
                </Link>
                <Link href={(getVar("secondary-cta-link", "#projects") as string) || "#projects-section"}>
                  <Button variant="outline" className="h-10 rounded-full border-white/20 bg-white/5 px-5 text-white hover:bg-white/10">
                    {getVar("secondary-cta-text", "View Projects")}
                  </Button>
                </Link>
              </div>

              {/* Socials */}
              <TooltipProvider>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={(getVar("github-url", "https://github.com/username") as string) || "#"}
                        className="rounded p-2 text-white/70 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                        aria-label="GitHub"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.61-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.09 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.31.1-2.74 0 0 .84-.27 2.75 1.05A9.26 9.26 0 0 1 12 7.1c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.56 1.43.21 2.48.1 2.74.64.71 1.03 1.62 1.03 2.74 0 3.96-2.34 4.82-4.57 5.07.36.32.68.93.68 1.88 0 1.36-.01 2.45-.01 2.78 0 .26.18.58.69.48A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z" />
                        </svg>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/10 text-white backdrop-blur">
                      GitHub
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={(getVar("linkedin-url", "https://linkedin.com/in/username") as string) || "#"}
                        className="rounded p-2 text-white/70 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                        aria-label="LinkedIn"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8h4V23h-4V8zm7 0h3.8v2.05h.05c.53-1 1.83-2.05 3.77-2.05C20.42 8 23 10.03 23 14.3V23h-4v-7.35c0-1.75-.03-4-2.45-4-2.46 0-2.84 1.92-2.84 3.9V23h-4V8z" />
                        </svg>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/10 text-white backdrop-blur">
                      LinkedIn
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={(getVar("x-url", "https://x.com/username") as string) || "#"}
                        className="rounded p-2 text-white/70 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                        aria-label="X"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M17.6 2H21l-7.4 8.46L22 22h-6.8L10.6 14.9 4.9 22H1.5l7.9-9.03L2 2h6.9l4.4 6.3L17.6 2Zm-1.2 18h2.2L8.7 3.9H6.4L16.4 20Z" />
                        </svg>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/10 text-white backdrop-blur">
                      X / Twitter
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={`mailto:${(getVar("email-address", "you@example.com") as string) || "you@example.com"}`}
                        className="rounded p-2 text-white/70 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                        aria-label="Email"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M2 5c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h20c.55 0 1-.45 1-1V6c0-.55-.45-1-1-1H2Zm1.4 2h17.2L12 12.47 3.4 7Z" />
                        </svg>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/10 text-white backdrop-blur">
                      Email
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              {/* Tech badges */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {badges.map((b) => (
                  <Badge key={b} className="bg-white/5 text-white/80 hover:bg-white/10">
                    {b}
                  </Badge>
                ))}
              </div>

              {/* Optional hero image */}
              {heroImage ? (
                <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={heroImage} alt="Hero visual" className="h-auto w-full object-cover" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Projects Section */}
      <section id="projects-section" className="relative z-10 px-6 py-[var(--section-spacing)] md:px-8">
        <div className="mx-auto w-full max-w-[var(--container-max-width)]">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {getVar("section-title", "Projects")}
            </h2>
            <p className="mt-3 text-white/70">
              {getVar("section-subtitle", "Things I’ve built recently")}
            </p>
          </div>

          {/* Toolbar (static UI) */}
          <div className="mb-8 flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-center">
            <div className="flex w-full items-center gap-3 md:w-auto">
              <div className="relative w-full md:w-80">
                <Input
                  placeholder="Search projects"
                  className="w-full border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
                <span className="sr-only">Search projects</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {availableTags.slice(0, 10).map((tag) => (
                <Badge key={tag} variant="outline" className="cursor-default border-white/15 bg-transparent text-white/70">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, idx) => (
              <Card key={p.title + idx} className="group relative overflow-hidden border-white/10 bg-white/[0.04] transition will-change-transform hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
                <CardHeader>
                  <CardTitle className="text-white">
                    {p.title}
                  </CardTitle>
                  <CardDescription className="text-white/70">
                    {p.description}
                  </CardDescription>
                </CardHeader>
                {p.image ? (
                  <div className="mx-4 mb-2 overflow-hidden rounded-lg border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt="Project image" className="h-40 w-full object-cover opacity-90 transition group-hover:scale-[1.02]" />
                  </div>
                ) : null}
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(p.tags || []).map((t) => (
                      <Badge key={t} className="bg-white/5 text-white/70">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {p.github ? (
                      <Link href={p.github} className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="opacity-80"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.61-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.09 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.31.1-2.74 0 0 .84-.27 2.75 1.05A9.26 9.26 0 0 1 12 7.1c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.56 1.43.21 2.48.1 2.74.64.71 1.03 1.62 1.03 2.74 0 3.96-2.34 4.82-4.57 5.07.36.32.68.93.68 1.88 0 1.36-.01 2.45-.01 2.78 0 .26.18.58.69.48A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"/></svg>
                        <span>Code</span>
                      </Link>
                    ) : null}
                    {p.demo ? (
                      <Link href={p.demo} className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="opacity-80"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z"/></svg>
                        <span>Demo</span>
                      </Link>
                    ) : null}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about-section" className="px-6 py-[var(--section-spacing)] md:px-8">
        <div className="mx-auto grid w-full max-w-[var(--container-max-width)] grid-cols-1 items-start gap-10 md:grid-cols-5">
          {/* Image / avatar */}
          <div className="md:col-span-2">
            {((getVar("profile-image-url", "") as string) || "") ? (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(getVar("profile-image-url", "") as string) || ""}
                  alt={(getVar("profile-image-alt", "Headshot of Your Name") as string) || "Profile"}
                  className="h-auto w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-56 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 md:h-72">
                <span className="text-5xl font-semibold text-white/70">
                  {(getVar("logo-text", "YN") as string) || "YN"}
                </span>
              </div>
            )}
          </div>

          {/* Bio & skills */}
          <div className="md:col-span-3">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {getVar("section-title", "About")}
            </h2>
            <p className="mt-4 max-w-2xl text-white/70">
              {getVar(
                "bio",
                "I’m a software engineer focused on building resilient systems and great developer experiences."
              )}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {(getVar(
                "skills",
                "TypeScript|React|Next.js|Node.js|PostgreSQL|GraphQL|AWS|Docker|Kubernetes|CI/CD"
              ) as string)
                .split("|")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((skill) => (
                  <Badge key={skill} className="bg-white/5 text-white/80">
                    {skill}
                  </Badge>
                ))}
            </div>

            {/* Experience */}
            <div className="mt-10">
              <h3 className="mb-4 text-xl font-semibold text-white">Experience</h3>
              <ol className="relative space-y-6 border-l border-white/10 pl-4">
                {experience.map((item, i) => (
                  <li key={i} className="space-y-2">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-[var(--accent-color)]" aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-base font-medium text-white">{item.role}</span>
                      <span className="text-white/60">@ {item.company}</span>
                      <span className="text-white/40">• {item.period}</span>
                    </div>
                    {item.summary ? (
                      <p className="text-sm text-white/70">{item.summary}</p>
                    ) : null}
                    {Array.isArray(item.highlights) && item.highlights.length ? (
                      <ul className="ml-4 list-disc text-sm text-white/70">
                        {item.highlights.map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            {/* Education */}
            <div className="mt-10">
              <h3 className="mb-4 text-xl font-semibold text-white">Education</h3>
              <ol className="space-y-6">
                {education.map((ed, i) => (
                  <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-base font-medium text-white">{ed.degree}</span>
                      <span className="text-white/60">— {ed.school}</span>
                      <span className="text-white/40">({ed.period})</span>
                    </div>
                    {ed.details ? (
                      <p className="mt-2 text-sm text-white/70">{ed.details}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            {/* Download resume */}
            <div className="mt-10">
              <Link href={(getVar("resume-url", "/resume.pdf") as string) || "/resume.pdf"}>
                <Button className="bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color)]/90">
                  Download Resume
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact-footer" className="px-6 pb-16 pt-[var(--section-spacing)] md:px-8">
        <div className="mx-auto w-full max-w-[var(--container-max-width)]">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {getVar("section-title", "Contact")}
            </h2>
            <p className="mt-3 text-white/70">
              {getVar("section-subtitle", "Let’s build something great together.")}
            </p>
          </div>

          {/* Form (static, posts to /api) */}
          <div className="mx-auto max-w-2xl">
            <form action="/api" method="post" className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-1 block text-sm text-white/80">
                  Name
                </label>
                <Input id="name" name="name" required className="border-white/10 bg-white/5 text-white placeholder:text-white/40" placeholder="Your name" />
              </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-sm text-white/80">
                  Email
                </label>
                <Input id="email" name="email" type="email" required className="border-white/10 bg-white/5 text-white placeholder:text-white/40" placeholder="you@example.com" />
              </div>
              {(getVar("show-phone-field", "false") as string) === "true" ? (
                <div>
                  <label htmlFor="phone" className="mb-1 block text-sm text-white/80">
                    Phone
                  </label>
                  <Input id="phone" name="phone" type="tel" className="border-white/10 bg-white/5 text-white placeholder:text-white/40" placeholder="Optional" />
                </div>
              ) : null}
              <div>
                <label htmlFor="message" className="mb-1 block text-sm text-white/80">
                  Message
                </label>
                <Textarea id="message" name="message" required rows={6} className="min-h-[140px] border-white/10 bg-white/5 text-white placeholder:text-white/40" placeholder="Tell me a little about your project..." />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/50">
                  Or email me at {getVar("alt-email-label", "you@example.com")}
                </div>
                <Button type="submit" className="bg-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/90">
                  {getVar("submit-button-text", "Send Message")}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-16 border-t border-white/10 pt-8">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <div className="text-sm text-white/50">
                {getVar("footer-note", "© 2025 Your Name. All rights reserved.")}
              </div>
              <div className="flex items-center gap-4 text-sm">
                {(() => {
                  let links: Array<{ label: string; href: string }> = [];
                  try {
                    links = JSON.parse(
                      (getVar(
                        "footer-links",
                        "[]"
                      ) as string) || "[]"
                    );
                  } catch {}
                  return links.map((l) => (
                    <Link key={l.label} href={l.href} className="text-white/70 hover:text-white">
                      {l.label}
                    </Link>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Back to top FAB */}
        {(getVar("show-back-to-top", "true") as string) === "true" ? (
          <Link
            href="#portfolio-page"
            className="fixed bottom-6 right-6 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-color)] text-white shadow-lg shadow-black/30 transition hover:bg-[var(--primary-color)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            aria-label="Back to top"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </Link>
        ) : null}
      </section>
    </main>
  );
}
