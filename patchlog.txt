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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Page() {
  return (
    <main
      id="portfolio-page"
      className="min-h-screen"
      style={{
        background: getVar("portfolio-page-background-color", "#e2e4e2"),
        color: getVar("portfolio-page-text-color", "#201f1f"),
        fontFamily: getVar("portfolio-page-font-family", "Inter, sans-serif"),
      }}
    >
      {/* Header Section */}
      <header
        id="header-section"
        className="w-full border-b"
        style={{
          background: getVar("header-section-background-color", "#e8e8ee"),
          color: getVar("header-section-text-color", "#0a0a0a"),
          paddingTop: getVar("header-section-padding", 12),
          paddingBottom: getVar("header-section-padding", 12),
          fontSize: getVar("header-section-font-size", 20),
        }}
        aria-label="Site header"
      >
        <div className="container mx-auto max-w-6xl px-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-foreground/10 flex items-center justify-center font-bold">
              SE
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-none">Software Engineer</span>
              <span className="text-muted-foreground text-sm leading-none">
                {getVar("header-section-tagline", "Welcome")}
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-2" aria-label="Primary">
            <Button asChild variant="ghost">
              <Link href="#portfolio-page">Home</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="#projects-section">Projects</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="#contact-section">Contact</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Projects Section */}
      <section
        id="projects-section"
        style={{
          background: getVar("projects-section-background-color", "#cfd3d0"),
          color: getVar("projects-section-text-color", "#000000"),
          paddingTop: getVar("portfolio-page-section-padding", 23),
          paddingBottom: getVar("portfolio-page-section-padding", 23),
        }}
        aria-labelledby="projects-heading"
      >
        <div className="container mx-auto max-w-6xl px-6">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h2 id="projects-heading" className="text-2xl sm:text-3xl font-bold">
                Featured Projects
              </h2>
              <p className="text-muted-foreground mt-1">
                A selection of work highlighting craft, performance, and DX.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href="#contact-section">Hire me</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({
              length: Number(getVar("projects-section-max-projects", 3)),
            }).map((_, i) => (
              <Card
                key={i}
                className="h-full"
                style={{
                  boxShadow: String(
                    getVar(
                      "projects-section-card-shadow",
                      "0px 4px 6px rgba(0, 0, 0, 0.1)"
                    )
                  ),
                }}
              >
                <CardHeader>
                  <CardTitle className="text-xl">{`Project ${i + 1}`}</CardTitle>
                  <CardDescription>
                    A modern, scalable solution built with TypeScript and Next.js.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Next.js",
                      "TypeScript",
                      "Tailwind CSS",
                      i % 2 === 0 ? "shadcn/ui" : "Edge Runtime",
                    ].map((tag, idx) => (
                      <Badge key={idx} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Clean architecture, accessible UI, and robust testing.
                  </p>
                </CardContent>
                <CardFooter className="justify-between">
                  <Button asChild variant="outline" size="sm">
                    <Link href="#">View details</Link>
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href="#">Live</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="#">Source</Link>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact-section"
        style={{
          background: getVar("contact-section-background-color", "#c6cdc7"),
          color: getVar("contact-section-text-color", "#000000"),
          paddingTop: getVar("portfolio-page-section-padding", 23),
          paddingBottom: getVar("portfolio-page-section-padding", 23),
          fontSize: getVar("contact-section-font-size", 16),
        }}
        aria-labelledby="contact-heading"
      >
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-8">
            <h2 id="contact-heading" className="text-2xl sm:text-3xl font-bold">
              Let’s build something great
            </h2>
            <p className="text-muted-foreground mt-1">
              Have an idea, role, or project in mind? I’d love to hear about it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <form action="#" method="post" className="grid grid-cols-1 gap-4" aria-label="Contact form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Jane Doe" aria-required="true" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="jane@company.com" aria-required="true" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder={String(
                    getVar("contact-section-form-placeholder-text", "Enter your message")
                  )}
                  rows={6}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  I typically respond within 24–48 hours.
                </p>
                <Button type="submit">Send message</Button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}