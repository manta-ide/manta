import type { FC } from 'react'
import ContactForm from './ContactForm'
import { Github, Twitter, Linkedin } from 'lucide-react'

export interface SocialLink {
  label: string
  href: string
  icon: React.ReactNode
}

export const socialLinks: SocialLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com/your-username',
    icon: <Github className="w-6 h-6" />,
  },
  {
    label: 'Twitter',
    href: 'https://twitter.com/your-username',
    icon: <Twitter className="w-6 h-6" />,
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/in/your-username',
    icon: <Linkedin className="w-6 h-6" />,
  },
]

/**
 * ContactSection
 *
 * A responsive contact section that includes a contact form and social media links.
 */
const ContactSection: FC = () => (
  <section id="contact" aria-label="Contact Section" className="bg-gray-50 py-16">
    <div className="container mx-auto px-4">
      <h2 className="text-3xl font-semibold text-center mb-8">Contact Me</h2>

      <div className="flex flex-col lg:flex-row lg:space-x-12">
        {/* Contact Form */}
        <div className="w-full lg:w-1/2 mb-8 lg:mb-0">
          <ContactForm />
        </div>

        {/* Social Media Links */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center">
          <p className="mb-6 text-lg text-center">
            You can also find me on social media:
          </p>
          <div className="flex space-x-6">
            {socialLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Link to ${link.label}`}
                className="text-gray-600 hover:text-primary transition-colors"
              >
                {link.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
)

export default ContactSection
