import React from 'react';
import { Linkedin } from 'lucide-react';

export interface LinkedInLinkProps {
  /** URL to navigate to when clicked */
  url: string;
  /** Text label displayed next to the LinkedIn icon */
  label?: string;
  /** Additional className for styling */
  className?: string;
}

/**
 * A LinkedIn link component that displays a LinkedIn icon with an optional label.
 * Opens the provided URL in a new tab with proper accessibility attributes.
 */
const LinkedInLink: React.FC<LinkedInLinkProps> = ({ url, label = 'LinkedIn', className = '' }) => {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 ${className}`}
    >
      <Linkedin className="w-5 h-5 mr-2" aria-hidden="true" />
      <span className="font-medium">{label}</span>
    </a>
  );
};

export default LinkedInLink;
