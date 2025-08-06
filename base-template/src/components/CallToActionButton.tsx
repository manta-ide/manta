import type { MouseEventHandler, FC } from 'react';

export interface CallToActionButtonProps {
  /** Text to display inside the button */
  text?: string;
  /** Click handler for the button */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Additional Tailwind CSS classes for customization */
  className?: string;
}

/**
 * CallToActionButton
 *
 * A bold, vibrant button designed to encourage user interaction.
 * Uses Tailwind CSS for styling and a subtle hover color change effect.
 */
export const CallToActionButton: FC<CallToActionButtonProps> = ({
  text = 'Get Started',
  onClick,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-block bg-primary text-primary-foreground font-bold py-3 px-6 rounded-lg transition-colors duration-200 ease-in-out hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${className}`}
  >
    {text}
  </button>
);

export default CallToActionButton;
