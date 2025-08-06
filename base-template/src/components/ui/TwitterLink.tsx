import React from 'react';
import { Twitter } from 'lucide-react';

export interface TwitterLinkProps {
  /** URL to navigate to when clicked */
  url: string;
  /** Text label displayed next to the Twitter icon */
  label?: string;
  /** Additional className for styling */
  className?: string;
}

/**
 * A Twitter link component that displays a Twitter icon with an optional label.
 * Opens the provided URL in a new tab with proper accessibility attributes.
 */
const TwitterLink: React.FC<TwitterLinkProps> = ({
  url,
  label = 'Twitter',
  className = ''
}) => {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center text-blue-500 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${className}`}
    >
      <Twitter className="w-5 h-5 mr-2" aria-hidden="true" />
      <span className="font-medium">{label}</span>
    </a>
  );
};

export default TwitterLink;
