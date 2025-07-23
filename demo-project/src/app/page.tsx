import { Mail, Github, Linkedin } from 'lucide-react';

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-background px-8">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-24">
        <div className="w-32 h-32 rounded-full bg-muted/30 mb-6 flex items-center justify-center text-4xl font-bold text-primary">
          JD
        </div>
        <h1 className="text-6xl font-bold mb-4 text-foreground">John Doe</h1>
        <p className="text-xl text-muted-foreground mb-6">
          Software Engineer specializing in web and distributed systems.
        </p>
        <div className="flex gap-6">
          <a
            href="https://github.com/johndoe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
          >
            <Github className="w-8 h-8" />
          </a>
          <a
            href="https://linkedin.com/in/johndoe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
          >
            <Linkedin className="w-8 h-8" />
          </a>
          <a
            href="mailto:johndoe@example.com"
            className="text-primary hover:text-primary/80"
          >
            <Mail className="w-8 h-8" />
          </a>
        </div>
      </section>

      {/* Skills Section */}
      <section id="skills" className="py-24">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
          Skills
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          {[
            'JavaScript',
            'TypeScript',
            'React',
            'Next.js',
            'Node.js',
            'GraphQL',
            'Docker',
            'Kubernetes',
          ].map((skill) => (
            <div
              key={skill}
              className="p-6 bg-card rounded-lg border shadow-sm hover:shadow-md transition-shadow text-center"
            >
              <h3 className="text-xl font-semibold mb-2">{skill}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="py-24 bg-muted/20">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
          Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="p-8 bg-card rounded-lg border shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-2xl font-semibold mb-2">Project One</h3>
            <p className="text-muted-foreground mb-4">
              A web application for collaborating in real-time.
            </p>
            <a
              href="#"
              className="text-primary font-semibold hover:underline"
            >
              View on GitHub &rarr;
            </a>
          </div>
          <div className="p-8 bg-card rounded-lg border shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-2xl font-semibold mb-2">Project Two</h3>
            <p className="text-muted-foreground mb-4">
              An open-source CLI tool to streamline workflows.
            </p>
            <a
              href="#"
              className="text-primary font-semibold hover:underline"
            >
              View on GitHub &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section id="experience" className="py-24">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
          Experience
        </h2>
        <div className="space-y-8 max-w-4xl mx-auto">
          <div>
            <h3 className="text-2xl font-semibold">
              Software Engineer @ Company A
            </h3>
            <span className="text-sm text-muted-foreground">
              June 2021 - Present
            </span>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>Developed scalable microservices using Node.js and Docker.</li>
              <li>Implemented real-time features with WebSockets.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-2xl font-semibold">
              Frontend Developer @ Company B
            </h3>
            <span className="text-sm text-muted-foreground">
              Jan 2019 - May 2021
            </span>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>Built responsive UIs with React and Tailwind CSS.</li>
              <li>Optimized performance resulting in 30% faster load times.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-muted/20">
        <h2 className="text-4xl font-bold text-center mb-8 text-foreground">
          Get In Touch
        </h2>
        <p className="text-center text-xl text-muted-foreground mb-6">
          Feel free to reach out for collaborations or just a friendly hello.
        </p>
        <div className="text-center">
          <a
            href="mailto:johndoe@example.com"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            Email Me
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} John Doe. Built with Next.js & Tailwind CSS.
        </p>
      </footer>
    </div>
  );
}