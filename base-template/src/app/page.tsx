import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function Page() {
  const projects = [
    {
      title: "Project One",
      subtitle: "Full-Stack App",
      description:
        "A cutting-edge web platform built with React, Node.js, and GraphQL to deliver real-time data insights.",
      tags: ["React", "Node.js", "GraphQL"],
      link: "#",
    },
    {
      title: "Project Two",
      subtitle: "Mobile Experience",
      description:
        "A cross-platform mobile application leveraging React Native and TypeScript for a seamless user experience.",
      tags: ["React Native", "TypeScript", "Expo"],
      link: "#",
    },
    {
      title: "Project Three",
      subtitle: "Data Visualization",
      description:
        "An interactive dashboard built with D3.js and Next.js, empowering users to explore complex datasets intuitively.",
      tags: ["D3.js", "Next.js", "TailwindCSS"],
      link: "#",
    },
  ];

  const skills = [
    { name: "JavaScript", icon: "🟨" },
    { name: "TypeScript", icon: "🔷" },
    { name: "React", icon: "⚛️" },
    { name: "Next.js", icon: "⏭️" },
    { name: "Node.js", icon: "🟩" },
    { name: "GraphQL", icon: "🔺" },
    { name: "TailwindCSS", icon: "🌬️" },
    { name: "D3.js", icon: "📊" },
  ];

  return (
    <main className="bg-white text-gray-800 font-sans">
      {/* Header */}
      <header className="fixed w-full bg-white/80 backdrop-blur-md z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <img
              src="https://example.com/logo.png"
              alt="Logo"
              className="h-12 w-12 object-contain mr-3"
            />
            <span className="font-bold text-xl">MyPortfolio</span>
          </div>
          <nav>
            <ul className="flex space-x-8 text-gray-700">
              {['Home', 'Projects', 'Skills', 'Contact'].map((item) => (
                <li key={item} className="group">
                  <Link
                    href={`#${item.toLowerCase()}`}
                    className="relative transition-colors hover:text-blue-600"
                  >
                    {item}
                    <span className="absolute -bottom-1 left-0 w-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 transition-all group-hover:w-full"></span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="home"
        className="relative h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600 text-white"
      >
        <div className="text-center px-6 max-w-2xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 leading-tight">
            Welcome to My Portfolio
          </h1>
          <p className="text-lg md:text-xl opacity-90 mb-6">
            I'm a Software Engineer passionate about crafting high-performance,
            scalable web applications that delight users.
          </p>
          <Button
            size="lg"
            className="bg-white text-purple-600 hover:bg-gray-100 px-8 py-4 rounded-full shadow-lg transition-transform hover:scale-105"
          >
            Explore My Work
          </Button>
        </div>
        <div className="absolute bottom-10 animate-bounce">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-12">
            Featured <span className="text-purple-600">Projects</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map((project) => (
              <Card
                key={project.title}
                className="shadow-lg hover:shadow-purple-500/30 transition-shadow duration-300"
              >
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    {project.title}
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    {project.subtitle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">
                    {project.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Badge
                        key={tag}
                        className="bg-gray-100 text-gray-800"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-6">
                    <Link
                      href={project.link}
                      className="text-purple-600 font-medium hover:underline"
                    >
                      View Project →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section id="skills" className="py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-12">
            My <span className="text-blue-600">Skills</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
            {skills.map((skill) => (
              <div
                key={skill.name}
                className="flex flex-col items-center text-center"
              >
                <div className="p-4 bg-white rounded-full shadow-md mb-4">
                  <span className="text-4xl">{skill.icon}</span>
                </div>
                <span className="text-lg font-medium text-gray-800">
                  {skill.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-white">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-8">
            Get In <span className="text-purple-600">Touch</span>
          </h2>
          <form className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name
              </label>
              <Input id="name" placeholder="Your Name" />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Message
              </label>
              <Textarea
                id="message"
                placeholder="Enter your message here"
                className="min-h-[120px]"
              />
            </div>
            <div className="text-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-500 text-white px-8 py-3 rounded-full shadow-lg hover:scale-105 transition-transform"
              >
                Submit
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 bg-gray-100 text-center text-gray-600">
        © {new Date().getFullYear()} MyPortfolio. All rights reserved.
      </footer>
    </main>
  );
}
