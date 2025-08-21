import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function Page() {
  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-violet-500 selection:text-white">
      {/* Subtle background aesthetics: grid + soft gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_0%,rgba(124,58,237,0.25),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_100%_20%,rgba(79,70,229,0.18),transparent_60%)]" />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      {/* Portfolio wrapper section for graph mapping */}
      <section id="portfolio-page" className="relative">
        {/* Header / Navigation */}
        <section id="header-section" className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="#portfolio-page" className="group inline-flex items-center gap-3">
              <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/20">
                <span className="absolute inset-0 rounded-md bg-white/10 opacity-0 transition-opacity group-hover:opacity-10" />
                <span className="text-sm font-bold">AC</span>
              </span>
              <div className="leading-tight">
                <div className="text-sm uppercase tracking-widest text-slate-400">Welcome to My Portfolio</div>
                <div className="text-lg font-semibold text-white">Avery Chen</div>
              </div>
            </Link>

            <nav className="hidden gap-6 md:flex">
              <Link href="#projects-section" className="text-sm text-slate-300 transition-colors hover:text-white">
                Projects
              </Link>
              <Link href="#skills-section" className="text-sm text-slate-300 transition-colors hover:text-white">
                Skills
              </Link>
              <Link href="#contact-section" className="text-sm text-slate-300 transition-colors hover:text-white">
                Contact
              </Link>
            </nav>

            <div className="hidden md:block">
              <Button asChild size="sm" className="bg-white text-slate-900 hover:bg-slate-200">
                <Link href="/file.svg">Resume</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Hero inside the portfolio page wrapper */}
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-10">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-violet-600/20 text-violet-300 ring-1 ring-inset ring-violet-500/30">
              Software Engineer • Product-minded • Systems at scale
            </Badge>
            <h1 className="bg-gradient-to-br from-white via-slate-200 to-violet-200 bg-clip-text text-5xl font-bold leading-tight text-transparent md:text-7xl">
              Engineering elegant, resilient systems
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-400">
              I design and build fast, reliable products—balancing delightful user experiences with rigorous, well-tested infrastructure.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button asChild size="lg" className="bg-white text-slate-900 transition-transform hover:scale-[1.02] hover:bg-slate-200">
                <Link href="#projects-section">Explore my work</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-slate-700 bg-transparent text-white hover:bg-slate-900">
                <Link href="#contact-section">Get in touch</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Projects */}
        <section id="projects-section" className="relative py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Selected Work</h2>
              <p className="mt-4 text-slate-400">
                A snapshot of recent projects that blend thoughtful design with robust engineering.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Project 1 */}
              <Card className="group relative overflow-hidden border-slate-800 bg-slate-900/60 backdrop-blur transition-transform hover:-translate-y-1">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader>
                  <CardTitle className="text-xl text-white">Realtime Collaboration Dashboard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-slate-400">
                  <p>
                    Low-latency multiplayer workspace with CRDT sync, presence, and optimistic UI across web and mobile.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-slate-800 text-slate-300">Next.js</Badge>
                    <Badge className="bg-slate-800 text-slate-300">WebSockets</Badge>
                    <Badge className="bg-slate-800 text-slate-300">Edge</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Project 2 */}
              <Card className="group relative overflow-hidden border-slate-800 bg-slate-900/60 backdrop-blur transition-transform hover:-translate-y-1">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader>
                  <CardTitle className="text-xl text-white">AI Documentation Summarizer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-slate-400">
                  <p>
                    Semantic chunking, embeddings, and RAG with streaming responses to turn sprawling docs into precise answers.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-slate-800 text-slate-300">TypeScript</Badge>
                    <Badge className="bg-slate-800 text-slate-300">Vercel AI</Badge>
                    <Badge className="bg-slate-800 text-slate-300">Postgres</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Project 3 */}
              <Card className="group relative overflow-hidden border-slate-800 bg-slate-900/60 backdrop-blur transition-transform hover:-translate-y-1">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-fuchsia-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CardHeader>
                  <CardTitle className="text-xl text-white">Design System & Component Library</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-slate-400">
                  <p>
                    A cohesive design system built on Radix and Tailwind, with accessibility-first components and theming.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-slate-800 text-slate-300">Radix</Badge>
                    <Badge className="bg-slate-800 text-slate-300">Tailwind</Badge>
                    <Badge className="bg-slate-800 text-slate-300">shadcn/ui</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Skills */}
        <section id="skills-section" className="relative border-t border-white/10 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Skills & Tools</h2>
              <p className="mt-4 text-slate-400">
                From product discovery to systems design, I bring a full-stack toolkit to ship with quality and speed.
              </p>
            </div>

            <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
              {[
                { label: "TypeScript" },
                { label: "React" },
                { label: "Next.js" },
                { label: "Node.js" },
                { label: "Postgres" },
                { label: "Tailwind" },
              ].map((s, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center transition-colors hover:border-violet-600/40"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="mx-auto mb-2 h-8 w-8 rounded-md bg-gradient-to-br from-violet-500/30 to-indigo-500/30" />
                  <div className="text-sm text-slate-300">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-8 max-w-3xl text-center text-sm text-slate-500">
              I care deeply about code quality, accessibility, and performance. Great teams ship great products—together.
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact-section" className="relative border-t border-white/10 py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Let’s build something great</h2>
              <p className="mt-4 text-slate-400">
                Tell me about your product, challenges, and timelines. I’ll reply with ideas and pragmatic next steps.
              </p>
            </div>

            <div className="mx-auto max-w-2xl">
              <Card className="border-white/10 bg-slate-900/60 backdrop-blur">
                <CardContent className="p-8">
                  <form action="#" method="post" className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-300">Your name</Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Ada Lovelace"
                          className="border-slate-800 bg-slate-950/50 text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-300">Email</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="you@company.com"
                          className="border-slate-800 bg-slate-950/50 text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-slate-300">Message</Label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Enter your message"
                        className="min-h-[140px] resize-y border-slate-800 bg-slate-950/50 text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">
                        By clicking send, you consent to be contacted about your inquiry.
                      </p>
                      <Button type="submit" className="bg-white text-slate-900 hover:bg-slate-200">Send message</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 py-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-slate-500">
            <div>© {new Date().getFullYear()} Avery Chen. All rights reserved.</div>
            <div className="flex gap-4">
              <Link href="#portfolio-page" className="hover:text-slate-300">Back to top</Link>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
