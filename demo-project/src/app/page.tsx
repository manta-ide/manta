import { Mail, Github, Linkedin, Car } from 'lucide-react';

export default function PortfolioPage() {
  return (
    <div className="min-h-screen px-8">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-24 bg-white text-black rounded-xl px-8 mb-12 shadow-lg">
        <div className="w-32 h-32 rounded-full bg-secondary mb-6 flex items-center justify-center">
          <Car className="w-16 h-16 text-primary" />
        </div>
        <h1 className="text-6xl font-bold mb-4">
          John Doe
        </h1>
        <p className="text-xl mb-6">
          Full-stack developer passionate about automotive and gaming industries
        </p>
      <div className="flex gap-6">
        <a
          href="https://github.com/artem-m"
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
          href="mailto:artem@example.com"
          className="text-primary hover:text-primary/80"
        >
          <Mail className="w-8 h-8" />
          </a>
        </div>
      </section>
      {/* Education section removed */}
      {/* Skills Section */}
      <section id="skills" className="py-24">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
          Skills
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 max-w-4xl mx-auto">
          {[
            'JavaScript',
            'TypeScript',
            'React',
            'Next.js',
            'Node.js',
            'Microservices',
            'Docker',
            'Kubernetes',
            'Game Development',
            'Automotive Software',
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
      <section id="projects" className="py-24">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">
          Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="p-8 bg-card rounded-lg border shadow-md hover:shadow-lg transition-shadow">
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
          <div className="p-8 bg-card rounded-lg border shadow-md hover:shadow-lg transition-shadow">
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
            <h3 className="flex items-center text-2xl font-semibold">
              <Car className="w-6 h-6 text-primary mr-2" />
              Software Developer @ Porsche
            </h3>
            <span className="text-sm text-muted-foreground">
              Jan 2022 - Present
            </span>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>Architected in-car telematics microservices with Node.js.</li>
              <li>Integrated real-time analytics for vehicle performance.</li>
            </ul>
          </div>
          <div>
            <h3 className="flex items-center text-2xl font-semibold">
              <Car className="w-6 h-6 text-primary mr-2" />
              Developer @ HH Development
            </h3>
            <span className="text-sm text-muted-foreground">
              Jun 2020 - Dec 2021
            </span>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>Built scalable web apps and internal tools with React.</li>
              <li>Led migration to TypeScript and Next.js for new projects.</li>
            </ul>
          </div>
          <div>
            <h3 className="flex items-center text-2xl font-semibold">
              <Car className="w-6 h-6 text-primary mr-2" />
              Senior Developer @ Playtika
            </h3>
            <span className="text-sm text-muted-foreground">
              May 2018 - May 2020
            </span>
            <ul className="list-disc list-inside mt-2 text-muted-foreground">
              <li>Developed micro front-ends for online gaming dashboards.</li>
              <li>Optimized CI/CD pipelines, reducing release times by 40%.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24">
        <h2 className="text-4xl font-bold text-center mb-8 text-foreground">
          Get In Touch
        </h2>
        <p className="text-center text-xl text-muted-foreground mb-6">
          Feel free to reach out for collaborations or just a friendly hello.
        </p>
        <div className="text-center">
          <a
            href="mailto:artem@example.com"
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