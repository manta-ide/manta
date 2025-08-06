import React from 'react';
import LinkedInLink from './LinkedInLink';
import GitHubLink from './GitHubLink';
import TwitterLink from './TwitterLink';

export interface SocialMediaLinksProps {
  /** URL for LinkedIn profile */
  linkedinUrl: string;
  /** URL for GitHub profile */
  githubUrl: string;
  /** URL for Twitter profile */
  twitterUrl: string;
  /** Additional className for styling */
  className?: string;
}

/**
 * A wrapper component that groups social media link components.
 * Displays LinkedIn, GitHub, and Twitter links in a horizontal layout.
 */
const SocialMediaLinks: React.FC<SocialMediaLinksProps> = ({
  linkedinUrl,
  githubUrl,
  twitterUrl,
  className = ''
}) => {
  return (
    <nav
      aria-label="Social media links"
      className={`flex items-center justify-center space-x-4 ${className}`}
    >
      <LinkedInLink url={linkedinUrl} />
      <GitHubLink url={githubUrl} />
      <TwitterLink url={twitterUrl} />
    </nav>
  );
};

export default SocialMediaLinks;
