"use client";
import React from 'react';
import ContactForm, { ContactFormData } from './ContactForm';
import SocialMediaLinks from './SocialMediaLinks';

export interface ContactSectionProps {
  /** URL for LinkedIn profile */
  linkedinUrl: string;
  /** URL for GitHub profile */
  githubUrl: string;
  /** URL for Twitter profile */
  twitterUrl: string;
  /**
   * Handler called when the form is submitted with valid data.
   */
  onSubmit?: (data: ContactFormData) => Promise<void> | void;
  /** Additional className for styling the section container */
  className?: string;
}

const ContactSection: React.FC<ContactSectionProps> = ({
  linkedinUrl,
  githubUrl,
  twitterUrl,
  onSubmit,
  className = '',
}) => {
  return (
    <section
      role="region"
      aria-labelledby="contact-section-title"
      className={`py-16 bg-gray-100 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2
          id="contact-section-title"
          className="text-3xl font-bold text-gray-900 mb-8 text-center"
        >
          Contact Us
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ContactForm onSubmit={onSubmit} />

          <div className="flex flex-col items-center justify-center">
            <p className="mb-4 text-lg text-gray-700 text-center">
              You can also find us on social media:
            </p>
            <SocialMediaLinks
              linkedinUrl={linkedinUrl}
              githubUrl={githubUrl}
              twitterUrl={twitterUrl}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
