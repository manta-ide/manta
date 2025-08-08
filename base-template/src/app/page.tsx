"use client"
"use client"

import React from "react"
import Image from "next/image"
import Link from "next/link"

// shadcn components
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from "@/components/ui/navigation-menu"

import {
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react"

export default function Home() {
  /* -------------------------------------------------------------------------- */
  /*                            Leaf-level Components                           */
  /* -------------------------------------------------------------------------- */

  // 1. Logo Component
  const Logo = () => (
    <Link
      id="node-element-logo"
      href="/"
      className="inline-flex items-center gap-2 font-semibold text-lg"
    >
      <Image src="/vercel.svg" alt="Startup Logo" width={28} height={28} /> Startup
    </Link>
  )

  // 2. FeatureCard Component
  interface FeatureCardProps {
    icon: React.ReactNode
    title: string
    description: string
    highlightId?: boolean
  }

  const FeatureCard = ({ icon, title, description, highlightId }: FeatureCardProps) => (
    <Card
      id={highlightId ? "node-element-feature-card" : undefined}
      className="group hover:shadow-lg transition-shadow h-full"
    >
      <CardHeader className="flex-row items-center gap-4 border-b">
        <span className="size-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </span>
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  )

  // 3. TestimonialCard Component
  interface TestimonialCardProps {
    name: string
    text: string
    imageSrc: string
    highlightId?: boolean
  }

  const TestimonialCard = ({ name, text, imageSrc, highlightId }: TestimonialCardProps) => (
    <Card id={highlightId ? "node-element-testimonial-card" : undefined} className="mx-auto max-w-sm">
      <CardHeader className="flex items-center gap-4 text-center">
        <Image
          src={imageSrc}
          width={48}
          height={48}
          alt={`${name} avatar`}
          className="rounded-full object-cover"
        />
        <div>
          <CardTitle className="text-sm font-medium">{name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-6">
        <p className="text-sm leading-relaxed italic text-muted-foreground">“{text}”</p>
      </CardContent>
    </Card>
  )

  // 4. FooterLinks Component
  const FooterLinks = () => (
    <nav id="node-element-footer-links" className="flex flex-wrap gap-6 text-sm">
      <Link href="#features" className="hover:underline">
        Features
      </Link>
      <Link href="#testimonials" className="hover:underline">
        Testimonials
      </Link>
      <Link href="/contact" className="hover:underline">
        Contact
      </Link>
      <Link href="/privacy" className="hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="hover:underline">
        Terms
      </Link>
    </nav>
  )

  // 5. SocialLinks Component
  const SocialLinks = () => (
    <div id="node-element-social-links" className="flex items-center gap-4">
      <Link href="https://twitter.com" aria-label="Twitter" className="hover:text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-5"
        >
          <path d="M24 4.557a9.83 9.83 0 01-2.828.775 4.932 4.932 0 002.165-2.724 9.864 9.864 0 01-3.127 1.195 4.916 4.916 0 00-8.384 4.482A13.954 13.954 0 011.671 3.149 4.916 4.916 0 003.195 9.86 4.9 4.9 0 01.96 9.095v.062a4.916 4.916 0 003.946 4.813 4.902 4.902 0 01-2.212.084 4.918 4.918 0 004.59 3.417A9.867 9.867 0 010 19.54a13.94 13.94 0 007.548 2.212c9.142 0 14.307-7.721 13.995-14.646A9.935 9.935 0 0024 4.557z" />
        </svg>
      </Link>
      <Link href="https://github.com" aria-label="GitHub" className="hover:text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-5"
        >
          <path
            fillRule="evenodd"
            d="M12 .5a12 12 0 00-3.79 23.4c.6.11.82-.26.82-.58 0-.29-.01-1.23-.02-2.23-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.09-.75.08-.74.08-.74 1.21.08 1.85 1.25 1.85 1.25 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.66-.3-5.47-1.33-5.47-5.92 0-1.31.47-2.38 1.24-3.22-.13-.31-.54-1.54.12-3.2 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.89.12 3.2.77.84 1.24 1.9 1.24 3.22 0 4.6-2.81 5.61-5.48 5.91.43.37.81 1.1.81 2.23 0 1.61-.02 2.9-.02 3.29 0 .32.21.69.82.58A12 12 0 0012 .5z"
            clipRule="evenodd"
          />
        </svg>
      </Link>
      <Link href="https://linkedin.com" aria-label="LinkedIn" className="hover:text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-5"
        >
          <path d="M20.447 20.452H17.21v-5.569c0-1.328-.026-3.036-1.852-3.036-1.853 0-2.136 1.447-2.136 2.941v5.664H9.079V9h3.105v1.561h.043c.433-.82 1.49-1.685 3.065-1.685 3.276 0 3.88 2.157 3.88 4.965v6.611zM5.337 7.433a1.8 1.8 0 110-3.6 1.8 1.8 0 010 3.6zm1.581 13.019H3.756V9h3.162v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.728v20.543C0 23.226.792 24 1.771 24h20.451C23.207 24 24 23.226 24 22.271V1.728C24 .774 23.207 0 22.225 0z" />
        </svg>
      </Link>
    </div>
  )

  /* -------------------------------------------------------------------------- */
  /*                                Page Layout                                 */
  /* -------------------------------------------------------------------------- */

  return (
    <div
      className="flex flex-col min-h-dvh bg-background text-foreground selection:bg-primary/80 selection:text-primary-foreground scroll-smooth"
    >
      {/* Header */}
      <header
        id="node-element-header"
        className="fixed inset-x-0 top-0 z-50 backdrop-blur border-b bg-background/80"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Logo />

          {/* Navigation menu */}
          <NavigationMenu
            id="node-element-navigation-menu"
            className="hidden md:flex"
            viewport={false}
          >
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    id="node-element-nav-item"
                    href="#features"
                    className="text-sm font-medium transition-colors hover:text-primary"
                  >
                    Features
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    href="#testimonials"
                    className="text-sm font-medium transition-colors hover:text-primary"
                  >
                    Testimonials
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    href="/contact"
                    className="text-sm font-medium transition-colors hover:text-primary"
                  >
                    Contact
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {/* Mobile menu placeholder (optional) */}
        </div>
      </header>

      {/* Page Content */}
      <main className="flex flex-1 flex-col pt-20">
        {/* Hero Section */}
        <section
          id="node-element-hero"
          className="relative mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-24 text-center"
        >
          <h1
            id="node-element-headline"
            className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent animate-in fade-in duration-700"
          >
            Build Better, Faster, Smarter
          </h1>
          <p
            id="node-element-subheading"
            className="max-w-xl text-muted-foreground sm:text-lg"
          >
            Our platform gives your team superpowers by automating routine tasks and providing real-time insights so you can focus on what truly matters.
          </p>
          <Button
            id="node-element-call-to-action-button"
            size="lg"
            className="mt-4 animate-in zoom-in-95 duration-700"
          >
            Get Started
          </Button>
        </section>

        {/* Features Section */}
        <section
          id="node-element-features"
          className="mx-auto w-full max-w-7xl px-6 py-24"
        >
          <h2 className="text-center text-3xl font-semibold mb-12">Features</h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              highlightId
              icon={<Rocket className="size-6" />}
              title="Blazing Speed"
              description="Experience unparalleled performance with our optimized architecture."
            />
            <FeatureCard
              icon={<ShieldCheck className="size-6" />}
              title="Secure by Design"
              description="Security is baked in at every layer, keeping your data safe and sound."
            />
            <FeatureCard
              icon={<TrendingUp className="size-6" />}
              title="Scalable Insights"
              description="Get real-time analytics that grow with your business."
            />
            <FeatureCard
              icon={<Users className="size-6" />}
              title="Collaborative"
              description="Empower your whole team with intuitive, role-based access."
            />
          </div>
        </section>

        {/* Testimonials Section */}
        <section
          id="node-element-testimonials"
          className="bg-muted/40 py-24 px-6"
        >
          <div className="mx-auto max-w-7xl text-center">
            <h2 className="text-3xl font-semibold mb-12">What our customers say</h2>

            <div className="relative">
              <Carousel opts={{ loop: true }} className="max-w-2xl mx-auto">
                <CarouselContent>
                  {[
                    {
                      name: "Alex Johnson",
                      text: "This product transformed our workflow and boosted productivity by 40%!",
                      img: "https://randomuser.me/api/portraits/men/32.jpg",
                    },
                    {
                      name: "Maria Garcia",
                      text: "The intuitive design made onboarding a breeze for our entire team.",
                      img: "https://randomuser.me/api/portraits/women/44.jpg",
                    },
                    {
                      name: "Liam Wong",
                      text: "Exceptional support and continuous improvements. Highly recommended!",
                      img: "https://randomuser.me/api/portraits/men/65.jpg",
                    },
                  ].map((t, i) => (
                    <CarouselItem key={i} className="px-4">
                      <TestimonialCard
                        highlightId={i === 0}
                        name={t.name}
                        text={t.text}
                        imageSrc={t.img}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="node-element-footer" className="border-t py-10 px-6 bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Footer links */}
          <FooterLinks />

          {/* Social links */}
          <SocialLinks />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Startup Inc. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
