import React from 'react';
import { cn } from '@/lib/utils';

export interface CallToActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button label
   * @default "Get Started"
   */
  text?: string;
  /**
   * Color variant of the button
   * @default "primary"
   */
  color?: 'primary';
  /**
   * Enable hover effect
   * @default true
   */
  hoverEffect?: boolean;
}

const CallToActionButton: React.FC<CallToActionButtonProps> = ({
  text = 'Get Started',
  color = 'primary',
  hoverEffect = true,
  className,
  ...props
}) => {
  // Base styling: padding, border-radius, typography, focus ring
  const baseClasses = 'inline-block font-semibold rounded-md px-6 py-3 focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors';

  // Variant styling: currently only primary
  const colorClasses = color === 'primary'
    ? 'bg-primary text-primary-foreground focus:ring-primary'
    : '';

  // Hover effect
  const hoverClasses = hoverEffect
    ? 'hover:bg-primary/90'
    : '';

  return (
    <button
      type="button"
      aria-label={text}
      className={cn(baseClasses, colorClasses, hoverClasses, className)}
      {...props}
    >
      {text}
    </button>
  );
};

export default CallToActionButton;
