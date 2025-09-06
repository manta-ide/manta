import React from "react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";

interface AppProps {
  vars: Record<string, any>;
}

export default function App({ vars }: AppProps) {
  const rootStyles = (vars["root-styles"] as Record<string, any>) || {};
  const cssVars = {
    "--background-color": rootStyles["background-color"] ?? vars["background-color"] ?? "#0b090a",
    "--text-color": rootStyles["text-color"] ?? vars["text-color"] ?? "#f5f3f4",
    "--accent-color": rootStyles["accent-color"] ?? vars["accent-color"] ?? "#e5383b",
    "--muted-color": rootStyles["muted-color"] ?? vars["muted-color"] ?? "#b1a7a6",
    "--border-color": rootStyles["border-color"] ?? vars["border-color"] ?? "#161a1d",
    "--font-family": rootStyles["font-family"] ?? vars["font-family"] ?? "Poppins",
    "--base-font-size": rootStyles["base-font-size"] ?? vars["base-font-size"] ?? "1rem",
    "--max-content-width": rootStyles["max-content-width"] ?? vars["max-content-width"] ?? "256px",
    "--section-padding-y": rootStyles["section-padding-y"] ?? vars["section-padding-y"] ?? "48px", 
    "--section-padding-x": rootStyles["section-padding-x"] ?? vars["section-padding-x"] ?? "24px",
    "--border-radius-global": rootStyles["border-radius-global"] ?? vars["border-radius-global"] ?? "12px",
  } as React.CSSProperties;

  const navLinks = (vars["nav-links"] as string || "Home, Projects, About, Contact")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const social = Array.isArray(vars["social-links"]) && (vars["social-links"] as any[]).length
    ? (vars["social-links"] as any[]).map((it) => ({ name: it?.name || 'Link', url: it?.url || '#' }))
    : [
        { name: "GitHub", url: (vars["social-github"] as string) || "#" },
        { name: "LinkedIn", url: (vars["social-linkedin"] as string) || "#" },
        { name: "Twitter", url: (vars["social-twitter"] as string) || "#" },
      ];

  const projects = Array.isArray(vars["projects"]) && (vars["projects"] as any[]).length
    ? (vars["projects"] as any[]).map((p) => ({
        title: p?.title || "Untitled Project",
        description: p?.description || "",
        image: p?.image || "https://placehold.co/512x400/white/black?text=Project&font=Poppins",
        tech: p?.tech || "",
        github: p?.github || "#",
        live: p?.live || "#",
      }))
    : [
        {
          title: (vars["project-1-title"] as string) || "Realtime Dashboard",
          description: (vars["project-1-description"] as string) || "Operational analytics dashboard with live data and custom charts.",
          image: (vars["project-1-image"] as string) || "https://placehold.co/512x400/white/black?text=Realtime+Dashboard&font=Poppins",
          tech: (vars["project-1-tech"] as string) || "Next.js, TypeScript, WebSocket, Tailwind",
          github: (vars["project-1-github"] as string) || "#",
          live: (vars["project-1-live"] as string) || "#",
        },
        {
          title: (vars["project-2-title"] as string) || "API Platform",
          description: (vars["project-2-description"] as string) || "Scalable REST and GraphQL APIs with robust observability.",
          image: (vars["project-2-image"] as string) || "https://placehold.co/512x400/white/black?text=API+Platform&font=Poppins",
          tech: (vars["project-2-tech"] as string) || "Node.js, TypeScript, PostgreSQL, Docker, AWS",
          github: (vars["project-2-github"] as string) || "#",
          live: (vars["project-2-live"] as string) || "#",
        },
        {
          title: (vars["project-3-title"] as string) || "Design System",
          description: (vars["project-3-description"] as string) || "Reusable UI kit and tokens built with Radix and Tailwind.",
          image: (vars["project-3-image"] as string) || "https://placehold.co/512x400/white/black?text=Design+System&font=Poppins",
          tech: (vars["project-3-tech"] as string) || "React, TypeScript, Radix UI, Tailwind",
          github: (vars["project-3-github"] as string) || "#",
          live: (vars["project-3-live"] as string) || "#",
        },
      ];

  const skills = (vars["skills-list"] as string || "TypeScript, React, Next.js, Node.js, PostgreSQL, AWS, Docker, CI/CD, Testing, Design Systems")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const tags = (vars["tags"] as string || "Next.js, TypeScript, Node.js, React, Tailwind, AWS, Docker, PostgreSQL")
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
        style={{ padding: `${vars["header-padding-y"] || "16px"} ${vars["header-padding-x"] || "24px"}` }}
      >
        <nav className="mx-auto flex max-w-[var(--max-content-width)] items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col leading-tight">
              <span style={{ fontSize: vars["brand-font-size"] || "1.5rem", fontWeight: 700 }}>
                {vars["brand-name"] || "Alex Johnson"}
              </span>
              <small className="text-[var(--muted-color)]">{vars["brand-subtitle"] || "Software Engineer"}</small>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-[var(--link-gap,16px)]">
            {navLinks.map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                className={
                  `text-sm text-[var(--text-color)] hover:text-[var(--accent-color)] transition ${
                    vars["hover-underline"] ? "hover:underline" : ""
                  }`
                }
              >
                {label}
              </a>
            ))}

            <a
              href={vars["resume-link-url"] as string || "/resume.pdf"}
              className={
                `ml-4 inline-flex items-center px-3 py-1 text-sm font-medium bg-[var(--background-color)] border border-[var(--border-color)] text-[var(--text-color)] rounded-[var(--resume-border-radius,12px)] hover:bg-[var(--accent-color)] hover:text-white transition`
              }
            >
              {vars["resume-link-text"] || "Download Resume"}
            </a>
          </div>

          <div className="md:hidden">
            <a href="#" className="text-sm text-[var(--muted-color)]">
              Menu
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section
        id="hero"
        className="relative flex w-full items-center"
        style={{ padding: `${vars["hero-padding-y"] || "80px"} var(--section-padding-x)` }}
      >
        <div className="mx-auto w-full max-w-[var(--max-content-width)] grid gap-[var(--hero-gap,24px)] md:grid-cols-2 items-center">
          <div>
            <h1
              className="font-extrabold leading-tight"
              style={{ fontSize: vars["headline-size"] || "3rem" }}
            >
              <span className={vars["is-highlighted"] ? "bg-gradient-to-r from-[var(--accent-color)] to-rose-500 bg-clip-text text-transparent" : ""}>
                {vars["headline"] || "Building reliable, delightful software."}
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[var(--muted-color)]" style={{ fontSize: vars["subheadline-size"] || "1.25rem" }}>
              {vars["subheadline"] || "Full-stack engineer specializing in TypeScript, Next.js, and cloud-native systems."}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-[var(--cta-gap,16px)]">
              <a href={vars["primary-cta-href"] as string || "#projects"}> 
                <Button variant="default">{vars["primary-cta-text"] || "View Projects"}</Button>
              </a>
              <a href={vars["secondary-cta-href"] as string || "#contact"}>
                <Button variant="ghost">{vars["secondary-cta-text"] || "Get in Touch"}</Button>
              </a>

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
              style={{ borderRadius: vars["image-radius"] || "16px" }}
            >
              <img
                src={vars["profile-image-src"] as string || "https://placehold.co/512x400/white/black?text=Alex+Johnson&font=Poppins"}
                alt={vars["brand-name"] as string || "Alex Johnson"}
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
        style={{ padding: `${vars["section-padding-y"] || "48px"} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)]">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">{vars["section-title"] || "Featured Projects"}</h2>
            <p className="text-sm text-[var(--muted-color)]">{vars["section-subtitle"] || "A selection of work spanning web apps, APIs, and infrastructure."}</p>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <input
              aria-label="Search projects"
              placeholder={vars["search-placeholder"] as string || "Search projects..."}
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
        style={{ padding: `${vars["section-padding-y"] || "48px"} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)] grid gap-[var(--section-gap,24px)] md:grid-cols-3 items-start">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-semibold">{vars["about-title"] || "About Me"}</h2>
            <p className="mt-2 text-sm text-[var(--muted-color)]">{vars["about-subtitle"] || "Engineer focused on quality, delivery, and impact."}</p>
            <p className="mt-4 text-base leading-relaxed">{vars["bio-text"] || "I craft maintainable systems and delightful experiences. I enjoy shipping fast while keeping quality high through tests, automation, and clean design."}</p>

            <div className="mt-6 grid grid-cols-2 gap-[var(--facts-grid-gap,16px)]">
              <div className="py-3 px-4 bg-[rgba(255,255,255,0.02)] rounded-[var(--border-radius-global)]">
                <div className="text-sm text-[var(--muted-color)]">Experience</div>
                <div className="mt-1 font-semibold">{vars["years-experience"] || "5+ years experience"}</div>
              </div>
              <div className="py-3 px-4 bg-[rgba(255,255,255,0.02)] rounded-[var(--border-radius-global)]">
                <div className="text-sm text-[var(--muted-color)]">Location</div>
                <div className="mt-1 font-semibold">{vars["location-text"] || "Based in San Francisco, CA"}</div>
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
              <a href={vars["resume-url"] as string || "/resume.pdf"} className="text-sm text-[var(--accent-color)]">
                Download full resume
              </a>
            </div>
          </div>

          <aside className="hidden md:flex md:flex-col items-center">
            <div style={{ borderRadius: vars["avatar-radius"] || "16px", overflow: "hidden" }}>
              <img src={vars["avatar-src"] as string || "https://placehold.co/512x400/white/black?text=Alex&font=Poppins"} alt="avatar" className="w-48 h-48 object-cover" />
            </div>
          </aside>
        </div>
      </section>

      {/* Contact & Footer */}
      <section
        id="contact-footer"
        className="w-full"
        style={{ padding: `${vars["footer-padding-y"] || "24px"} var(--section-padding-x)` }}
      >
        <div className="mx-auto max-w-[var(--max-content-width)]">
          <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--border-color)] rounded-[var(--border-radius-global)] p-6">
            <h2 className="text-xl font-semibold">{vars["contact-title"] || "Get in Touch"}</h2>
            <p className="text-sm text-[var(--muted-color)]">{vars["contact-subtitle"] || "Have a project in mind or just want to say hello?"}</p>

            <form method="post" action="/api" className="mt-4 grid gap-[var(--form-gap,16px)]">
              <div className="grid md:grid-cols-2 gap-3">
                <input name="name" placeholder="Name" className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />
                <input name="email" placeholder="Email" className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />
              </div>
              <textarea name="message" placeholder="Message" rows={4} className="w-full px-3 py-2 rounded-[var(--input-radius,12px)] bg-transparent border border-[var(--border-color)] text-[var(--text-color)]" />

              <div className="flex items-center gap-3">
                <Button type="submit" style={{ borderRadius: vars["button-radius"] || "12px" }} className={vars["is-accent-submit"] ? "bg-[var(--accent-color)] text-white" : ""}>
                  Send Message
                </Button>

                <div className="text-sm text-[var(--muted-color)]">Or email <a href={`mailto:${vars["contact-email"] || "hello@example.com"}`} className="text-[var(--accent-color)]">{vars["contact-email"] || "hello@example.com"}</a></div>
              </div>
            </form>
          </div>

          <footer className="mt-6 flex items-center justify-between text-sm text-[var(--muted-color)]">
            <div>{vars["footer-text"] || "© 2025 Alex Johnson. All rights reserved."}</div>
            <div className="flex items-center gap-3">
              <a href={vars["contact-linkedin"] as string || "#"} className="underline">LinkedIn</a>
              <a href={vars["contact-twitter"] as string || "#"} className="underline">Twitter</a>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}

