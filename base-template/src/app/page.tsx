import Link from "next/link";
import { getVar } from "@/lib/vars";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Page() {
  // Page-level variables
  const sectionPadding = getVar("portfolio-page-section-padding", 20) as number;

  // Header variables
  const headerPadding = getVar("header-section-padding", 20) as number;
  const headerFontSize = getVar("header-section-font-size", 24) as number;
  const headerTagline = getVar("header-section-tagline", "Welcome") as string;
console.log(">>>>>>>>>>>>>>>>>headerTagline", headerTagline)
  // Projects variables
  const projectsMax = getVar("projects-section-max-projects", 3) as number;
  const cardShadow = getVar(
    "projects-section-card-shadow",
    "0px 10px 30px rgba(0,0,0,0.08)"
  ) as string;

  // Contact variables
  const contactFontSize = getVar("contact-section-font-size", 16) as number;
  const contactPlaceholder = getVar(
    "contact-section-form-placeholder-text",
    "Enter your message"
  ) as string;

  // Showcase content (static, premium defaults)
  const projects = [
    {
      title: "Realtime Analytics Platform",
      description:
        "Stream processing, columnar storage, and a snappy dashboard. 10x faster insights for ops teams.",
      href: "#",
      logo: "/globe.svg",
      stats: "Rust • Next.js • ClickHouse",
    },
    {
      title: "Design System & UI Kit",
      description:
        "A cohesive component library with tokens, theming, and accessibility baked in.",
      href: "#",
      logo: "/window.svg",
      stats: "React • shadcn/ui • Storybook",
    },
    {
      title: "Edge-first E‑commerce",
      description:
        "SSR + ISR blend with smart caching and measurable Core Web Vitals improvements.",
      href: "#",
      logo: "/vercel.svg",
      stats: "Next.js • Edge • Tailwind",
    },
    {
      title: "Developer Insights CLI",
      description:
        "Beautiful terminal UX with structured logs, profiling, and local AI assistance.",
      href: "#",
      logo: "/file.svg",
      stats: "Node • TypeScript • WASM",
    },
  ].slice(0, projectsMax);


  return (
    <main
      className="min-h-screen bg-[var(--portfolio-page-background-color)] text-[var(--portfolio-page-text-color)] selection:bg-black/80 selection:text-white"
      style={{ fontFamily: getVar("portfolio-page-font-family", "Inter, sans-serif") as string }}
    >
      {/* Ambient gradient aura */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-600/20 via-fuchsia-600/10 to-sky-600/20 blur-3xl" />
      </div>

      {/* portfolio-page root wrapper */}
      <section id="portfolio-page" className="relative" style={{ paddingTop: sectionPadding, paddingBottom: sectionPadding }}>
        {/* header-section */}
        <section
          id="header-section"
          className="sticky top-0 z-50 border-b border-black/5 backdrop-blur supports-[backdrop-filter]:bg-[var(--header-section-background-color)]/80 text-[var(--header-section-text-color)]"
          style={{ paddingTop: headerPadding, paddingBottom: headerPadding, fontSize: headerFontSize }}
        >
          <div className="container mx-auto max-w-6xl px-6">
            <div className="flex items-center justify-between">
              <Link href="#portfolio-page" className="group inline-flex items-center gap-3">
                <div className="relative size-8 rounded-md bg-black/90 ring-1 ring-black/10 shadow-sm">
                  <div className="absolute inset-0 rounded-md bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.25),transparent_50%)]" />
                </div>
                <div className="leading-tight">
                  <div className="font-semibold tracking-tight">Portfolio</div>
                  <div className="text-xs opacity-70">{headerTagline}</div>
                </div>
              </Link>
              <nav className="hidden md:flex items-center gap-8">
                <Link href="#projects-section" className="opacity-80 transition-opacity hover:opacity-100">
                  Projects
                </Link>
                <Link href="#contact-section" className="opacity-80 transition-opacity hover:opacity-100">
                  Contact
                </Link>
                <Button asChild className="rounded-full bg-black text-white hover:bg-black/90">
                  <Link href="#contact-section">Get in touch</Link>
                </Button>
              </nav>
            </div>
          </div>
        </section>

        {/* Hero */}
        <div className="relative">
          <div className="container mx-auto max-w-6xl px-6">
            <div className="pt-20 pb-24 md:pt-28 md:pb-36">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs backdrop-blur">
                <span className="size-1.5 rounded-full bg-indigo-600" />
                <span className="opacity-80">Software Engineer · Product-minded</span>
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                I design and build delightful, resilient software
              </h1>
              <p className="mt-5 max-w-2xl text-base opacity-80 md:text-lg">
                From idea to production, I craft performance-focused web applications with a crisp developer experience.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="rounded-full bg-black px-6 text-white hover:bg-black/90">
                  <Link href="#projects-section">See projects</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full border-black/20 bg-white/60 backdrop-blur hover:bg-white"
                >
                  <Link href="#contact-section">Contact</Link>
                </Button>
              </div>
            </div>
          </div>
          <div className="mx-auto h-px w-full max-w-6xl bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        </div>

        {/* projects-section */}
        <section
          id="projects-section"
          className="relative bg-[var(--projects-section-background-color)] text-[var(--projects-section-text-color)] m-[var(--projects-section-margin)]"
          style={{ paddingTop: sectionPadding, paddingBottom: sectionPadding }}
        >
          <div className="container mx-auto max-w-6xl px-6">
            <div className="mb-10 flex items-end justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Selected Projects</h2>
                <p className="mt-2 max-w-2xl text-sm opacity-80 md:text-base">
                  A snapshot of recent work focused on performance, UX, and maintainability.
                </p>
              </div>
              <div className="hidden md:block">
                <Button asChild variant="ghost" className="rounded-full hover:bg-black/5">
                  <Link href="#contact-section">Work with me</Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => (
                <Card
                  key={i}
                  className="group relative overflow-hidden rounded-2xl border-black/10 backdrop-blur transition-transform will-change-transform hover:-translate-y-1"
                  style={{ boxShadow: cardShadow, backgroundColor: getVar("projects-section-card-color", "#ff0000") }}
                >
                  <CardHeader className="flex min-h-28 flex-row items-start gap-4">
                    <div className="relative">
                      <div className="grid size-10 place-content-center rounded-lg border border-black/10 bg-white shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.logo} alt="" className="size-6 opacity-80" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold tracking-tight">{p.title}</CardTitle>
                      <div className="mt-1 text-xs opacity-70">{p.stats}</div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-6">
                    <p className="text-sm leading-relaxed opacity-90">{p.description}</p>
                    <div className="mt-5">
                      <Button asChild variant="link" className="px-0 text-indigo-700 hover:text-indigo-800">
                        <Link href={p.href}>Learn more →</Link>
                      </Button>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 translate-y-12 bg-gradient-to-t from-indigo-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:translate-y-0 group-hover:opacity-100" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* contact-section */}
        <section
          id="contact-section"
          className="relative bg-[var(--contact-section-background-color)] text-[var(--contact-section-text-color)]"
          style={{ paddingTop: sectionPadding, paddingBottom: sectionPadding }}
        >
          <div className="container mx-auto max-w-6xl px-6">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Let’s build something great</h2>
              <p className="mt-2 text-sm opacity-80 md:text-base">
                Tell me about your product, timeline, and what success looks like. I’ll get back within 48 hours.
              </p>
            </div>

            <Card className="overflow-hidden rounded-2xl border-black/10 bg-white/70 backdrop-blur">
              <CardContent className="p-6 md:p-8" style={{ fontSize: contactFontSize }}>
                <form action="#" method="post" className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="you@example.com" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea id="message" placeholder={contactPlaceholder} className="min-h-32" />
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between">
                    <p className="text-xs opacity-70">
                      By sending, you agree to the processing of your data for the purpose of this inquiry.
                    </p>
                    <Button className="rounded-full bg-black px-6 text-white hover:bg-black/90">Send</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-10">
        <div className="container mx-auto max-w-6xl px-6 text-sm opacity-70">© {new Date().getFullYear()} Portfolio. Built with Next.js & Tailwind.</div>
      </footer>
    </main>
  );
}