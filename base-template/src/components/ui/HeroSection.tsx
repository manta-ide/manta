import React from 'react';
import CallToActionButton, { CallToActionButtonProps } from './CallToActionButton';

export interface HeroSectionProps {
  /**
   * URL of the background image
   */
  backgroundImage: string;
  /**
   * Headline text for the hero section
   */
  headline: string;
  /**
   * Props for the call-to-action button
   */
  ctaButton: CallToActionButtonProps;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  backgroundImage,
  headline,
  ctaButton,
}) => {
  return (
    <section
      role="banner"
      className="relative w-full min-h-screen bg-cover bg-center flex items-center justify-center"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      {/* Dark overlay for better text contrast */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      <div className="relative z-10 text-center px-4">
        <h1 className="text-white text-4xl sm:text-5xl md:text-6xl font-bold">
          {headline}
        </h1>
        <div className="mt-6">
          <CallToActionButton {...ctaButton} />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
