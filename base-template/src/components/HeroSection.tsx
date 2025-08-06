import type { FC, MouseEventHandler } from 'react';
import CallToActionButton from './CallToActionButton';

export interface HeroSectionProps {
  /** URL or path of the background image */
  backgroundImage: string;
  /** Main headline text to display */
  headline: string;
  /** Text to display inside the call-to-action button */
  buttonText?: string;
  /** Click handler for the call-to-action button */
  onButtonClick?: MouseEventHandler<HTMLButtonElement>;
  /** Additional Tailwind CSS classes for the hero section */
  className?: string;
}

/**
 * HeroSection
 *
 * A visually striking hero section with a large background image, a headline,
 * and a call-to-action button.
 */
const HeroSection: FC<HeroSectionProps> = ({
  backgroundImage,
  headline,
  buttonText = 'Get Started',
  onButtonClick,
  className = '',
}) => (
  <section
    className={`relative w-full min-h-screen bg-cover bg-center flex items-center justify-center ${className}`}
    style={{ backgroundImage: `url(${backgroundImage})` }}
    aria-label="Hero Section"
  >
    {/* Overlay for better text contrast */}
    <div className="absolute inset-0 bg-black bg-opacity-50" aria-hidden="true" />

    <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8">
      <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6">
        {headline}
      </h1>
      <CallToActionButton
        text={buttonText}
        onClick={onButtonClick}
        className="mx-auto"
      />
    </div>
  </section>
);

export default HeroSection;
