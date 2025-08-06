'use client';
import React from 'react';
import { Github } from 'lucide-react';

export interface GitHubLinkProps {
  /** URL to navigate to when clicked */
  url: string;
  /** Text label displayed next to the GitHub icon */
  label?: string;
  /** Additional className for styling */
  className?: string;
}

/**
 * A GitHub link component that displays a GitHub icon with an optional label.
 * Opens the provided URL in a new tab with proper accessibility attributes.
 */
const GitHubLink: React.FC<GitHubLinkProps> = ({
  url,
  label = 'GitHub',
  className = ''
}) => {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center text-gray-600 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600 ${className}`}
    >
      <Github className="w-5 h-5 mr-2" aria-hidden="true" />
      <span className="font-medium">{label}</span>
    </a>
  );
};

export default GitHubLink;
