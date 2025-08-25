import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getVar } from "@/lib/vars";

export default function Page() {
  const cssVars = {
    "--background-color": getVar("background-color", "#0b090a"),
    "--text-color": getVar("text-color", "#f5f3f4"),
    "--accent-color": getVar("accent-color", "#e5383b"),
    "--muted-color": getVar("muted-color", "#b1a7a6"),
    "--border-color": getVar("border-color", "#161a1d"),
    "--font-family": getVar("font-family", "Poppins"),
    "--base-font-size": getVar("base-font-size", "1rem"),
    "--max-content-width": getVar("max-content-width", "256px"),
    "--section-padding-y": getVar("section-padding-y", "48px"),
    "--section-padding-x": getVar("section-padding-x", "24px"),
    "--border-radius-global": getVar("border-radius-global", "12px"),
  } as React.CSSProperties;

  const navLinks = getVar("nav-links", "Home, Projects, About, Contact")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const social = [
    { name: "GitHub", url: getVar("social-github", "#") },
    { name: "LinkedIn", url: getVar("social-linkedin", "#") },
    { name: "Twitter", url: getVar("social-twitter", "#") },
  ];

  const projects = [
    {
      title: getVar("project-1-title", "Realtime Dashboard"),
      description: getVar(
        "project-1-description",
        "Operational analytics dashboard with live data and custom charts."
      ),
      image: getVar(
        "project-1-image",
        "https://placehold.co/512x400/white/black?text=Realtime+Dashboard&font=Poppins"
      ),
      tech: getVar("project-1-tech", "Next.js, TypeScript, WebSocket, Tailwind"),
      github: getVar("project-1-github", "#"),
      live: getVar("project-1-live", "#"),
    },
    {
      title: getVar("project-2-title", "API Platform"),
      description: getVar(
        "project-2-description",
        "Scalable REST and GraphQL APIs with robust observability."
      ),
      image: getVar(
        "project-2-image",
        "https://placehold.co/512x400/white/black?text=API+Platform&font=Poppins"
      ),
      tech: getVar("project-2-tech", "Node.js, TypeScript, PostgreSQL, Docker, AWS"),
      github: getVar("project-2-github", "#"),
      live: getVar("project-2-live", "#"),
    },
    {
      title: getVar("project-3-title", "Design System"),
      description: getVar(
        "project-3-description",
        "Reusable UI kit and tokens built with Radix and Tailwind."
      ),
      image: getVar(
        "project-3-image",
        "https://placehold.co/512x400/white/black?text=Design+System&font=Poppins"
      ),
      tech: getVar("project-3-tech", "React, TypeScript, Radix UI, Tailwind"),
      github: getVar("project-3-github", "#"),
      live: getVar("project-3-live", "#"),
    },
  ];

  const skills = getVar(
    "skills-list",
    "TypeScript, React, Next.js, Node.js, PostgreSQL, AWS, Docker, CI/CD, Testing, Design Systems"
  )
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const tags = getVar(
    "tags",
    "Next.js, TypeScript, Node.js, React, Tailwind, AWS, Docker, PostgreSQL"
  )
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  return (
    <main
      id="portfolio-page"
      style={cssVars}
      className={
        "min-h-screen bg-[var(--background-color)] text-[var(--text-color)] antialiased selection:bg-[var(--accent-color)]/30 selection:text-white" 
      }
    >
      {/* Header / Navigation */}
      <header
        id="header"
        className={
          "w-full top-0 z-30 backdrop-blur-sm/10" +
          " bg-[color:var(--background-color)]/60 border-b border-[var(--border-color)]"
        }
        style={{ padding: `${getVar("header-padding-y", "16px")} ${getVar("header-padding-x", "24px")}` }}
      >
        <nav className="mx-auto flex max-w-[var(--max-content-width)] items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col leading-tight">
              <span style={{ fontSize: getVar("brand-font-size", "1.5rem"), fontWeight: 700 }}>
                {getVar("brand-name", "Alex Johnson")}
              </span>
              <small className="text-[var(--muted-color)]">{getVar("brand-subtitle", "Software Engineer")}</small>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-[var(--link-gap,16px)]">
            {navLinks.map((label) => (
              <Link
                key={label}
                href={`#${label.toLowerCase()}`}
                className={
                  `text-sm text-[var(--text-color)] hover:text-[var(--accent-color)] transition ${
                    getVar("hover-underline", true) ? "hover:underline" : ""
                  }`
                }
              >
                {label}
              </Link>
            ))}

            <Link
              href={getVar("resume-link-url", "/resume.pdf")}
              className={
                `ml-4 inline-flex items-center px-3 py-1 text-sm font-medium bg-[var(--background-color)] border border-[var(--border-color)] text-[var(--text-color)] rounded-[var(--resume-border-radius,12px)] hover:bg-[var(--accent-color)] hover:text-white transition`
              }
            >
              {getVar("resume-link-text", "Download Resume")}
            </Link>
          </div>

          <div className="md:hidden">
            <Link href="#" className="text-sm text-[var(--muted-color)]">
              Menu
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section
        id="hero"
        className="relative flex w-full items-center"
        style={{ padding: `${getVar("hero-padding-y", "80px")} var(--section-padding-x)` }}
      >
        <div className="mx-auto w-full max-w-[var(--max-content-width)] grid gap-[var(--hero-gap,24px)] md:grid-cols-2 items-center">
          <div>
            <h1
              className="font-extrabold leading-tight"
              style={{ fontSize: getVar("headline-size", "3rem") }}
            >
              <span className={getVar("is-highlighted", true) ? "bg-gradient-to-r from-[var(--accent-color)] to-rose-500 bg-clip-text text-transparent" : ""}>
                {getVar("headline", "Building reliable, delightful software.")}
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[var(--muted-color)]" style={{ fontSize: getVar("subheadline-size", "1.25rem") }}>
              {getVar(
                "subheadline",
                "Full-stack engineer specializing in TypeScript, Next.js, and cloud-native systems."
              )}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-[var(--cta-gap,16px)]">
              <Link href={getVar("primary-cta-href", "#projects")}> 
                <Button variant="default">{getVar("primary-cta-text", "View Projects")}</Button>
              </Link>
              <Link href={getVar("secondary-cta-href", "#contact")}>
                <Button variant="ghost">{getVar("secondary-cta-text", "Get in Touch")}</Button>
              </Link>

              <div className="ml-4 flex items-center gap-3">
                {social.map((s) => (
                  <a key={s.name} href={s.url} className="text-[var(--muted-color)] text-sm">
                    {s.name}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div
              className="overflow-hidden"
              style={{ borderRadius: getVar("image-radius", "16px") }}
            >
              <img
                src={getVar("profile-image-src", "https://placehold.co/512x400/white/black?text=Alex+Johnson&font=Poppins")}
                alt={getVar("brand-name", "Alex Johnson")}
                className="w-[320px] h-auto object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section
        id="projects-section"
        className="w-full"
        style={{ padding: `${getVar("section-padding-y", "48px")} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)]">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">{getVar("section-title", "Featured Projects")}</h2>
            <p className="text-sm text-[var(--muted-color)]">{getVar("section-subtitle", "A selection of work spanning web apps, APIs, and infrastructure.")}</p>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <input
              aria-label="Search projects"
              placeholder={getVar("search-placeholder", "Search projects...")}
              className="flex-1 bg-transparent border border-[var(--border-color)] rounded-[var(--input-radius,12px)] px-3 py-2 text-sm text-[var(--text-color)] placeholder:text-[var(--muted-color)]"
            />
            <div className="hidden md:flex flex-wrap gap-2">
              {tags.map((t) => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-[var(--grid-gap,24px)] sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <article
                key={p.title}
                className="bg-[rgba(255,255,255,0.02)] border border-[var(--border-color)] p-[var(--card-padding,16px)] rounded-[var(--card-radius,16px)]"
              >
                <div className="overflow-hidden rounded-[var(--image-radius,12px)]">
                  <img src={p.image} alt={p.title} className="w-full h-40 object-cover" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-[var(--muted-color)]">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.tech.split(",").map((t: string) => (
                    <span key={t} className="text-xs text-[var(--muted-color)] bg-[rgba(255,255,255,0.02)] px-2 py-1 rounded">{t.trim()}</span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <a href={p.github} className="text-sm text-[var(--muted-color)]">Code</a>
                  <a href={p.live} className="text-sm text-[var(--accent-color)]">Live</a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section
        id="about-section"
        className="w-full"
        style={{ padding: `${getVar("section-padding-y", "48px")} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)] grid gap-[var(--section-gap,24px)] md:grid-cols-3 items-start">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold">{getVar("about-title", "About Me")}</h2>
            <p className="mt-2 text-sm text-[var(--muted-color)]">{getVar("about-subtitle", "Engineer focused on quality, delivery, and impact.")}</p>
            <p className="mt-4 text-base leading-relaxed">{getVar("bio-text", "I craft maintainable systems and delightful experiences. I enjoy shipping fast while keeping quality high through tests, automation, and clean design.")}</p>

            <div className="mt-6 grid grid-cols-2 gap-[var(--facts-grid-gap,16px)]">
              <div className="py-3 px-4 bg-[rgba(255,255,255,0.02)] rounded-[var(--border-radius-global)]">
                <div className="text-sm text-[var(--muted-color)]">Experience</div>
                <div className="mt-1 font-semibold">{getVar("years-experience", "5+ years experience")}</div>
              </div>
              <div className="py-3 px-4 bg-[rgba(255,255,255,0.02)] rounded-[var(--border-radius-global)]">
                <div className="text-sm text-[var(--muted-color)]">Location</div>
                <div className="mt-1 font-semibold">{getVar("location-text", "Based in San Francisco, CA")}</div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium">Skills</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <Link href={getVar("resume-url", "/resume.pdf")} className="text-sm text-[var(--accent-color)]">
                Download full resume
              </Link>
            </div>
          </div>

          <aside className="hidden md:flex md:flex-col items-center">
            <div style={{ borderRadius: getVar("avatar-radius", "16px"), overflow: "hidden" }}>
              <img src={getVar("avatar-src", "https://placehold.co/512x400/white/black?text=Alex&font=Poppins")} alt="avatar" className="w-48 h-48 object-cover" />
            </div>
          </aside>
        </div>
      </section>

      {/* Contact & Footer */}
      <section
        id="contact-footer"
        className="w-full"
        style={{ padding: `${getVar("footer-padding-y", "24px")} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)]">
          <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--border-color)] rounded-[var(--border-radius-global)] p-6">
            <h2 className="text-xl font-semibold">{getVar("contact-title", "Get in Touch")}</h2>
            <p className="text-sm text-[var(--muted-color)]">{getVar("contact-subtitle", "Have a project in mind or just want to say hello?")}</p>

            <form method="post" action="/api" className="mt-4 grid gap-[var(--form-gap,16px)]">
              <div className="grid md:grid-cols-2 gap-3">
                <input name="name" placeholder="Name" className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />
                <input name="email" placeholder="Email" className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />
              </div>
              <textarea name="message" placeholder="Message" rows={4} className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />

              <div className="flex items-center gap-3">
                <Button type="submit" style={{ borderRadius: getVar("button-radius", "12px") }} className={getVar("is-accent-submit", true) ? "bg-[var(--accent-color)] text-white" : ""}>
                  Send Message
                </Button>

                <div className="text-sm text-[var(--muted-color)]">Or email <a href={`mailto:${getVar("contact-email", "hello@example.com")}`} className="text-[var(--accent-color)]">{getVar("contact-email", "hello@example.com")}</a></div>
              </div>
            </form>
          </div>

          <footer className="mt-6 flex items-center justify-between text-sm text-[var(--muted-color)]">
            <div>{getVar("footer-text", "© 2025 Alex Johnson. All rights reserved.")}</div>
            <div className="flex items-center gap-3">
              <a href={getVar("contact-linkedin", "#")} className="underline">LinkedIn</a>
              <a href={getVar("contact-twitter", "#")} className="underline">Twitter</a>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
