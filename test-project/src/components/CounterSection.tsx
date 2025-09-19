import React, { useState, useEffect } from 'react';
import { useVars } from '../../_graph/varsHmr.ts';

export default function CounterSection() {
  const [vars] = useVars();
  // Extract properties from vars
  const initialCount = vars['initial-count'] ?? 0;
  const incrementStep = vars['increment-step'] ?? 1;

  // Extract style objects
  const counterStyles = vars['counter-styles'] || {};
  const buttonStyles = vars['button-styles'] || {};
  const labels = vars['labels'] || {};
  const features = vars['features'] || {};

  // State
  const [count, setCount] = useState(initialCount);

  // Feature flags
  const showReset = features['show-reset'] ?? true;
  const showTitle = features['show-title'] ?? true;
  const enableKeyboard = features['enable-keyboard'] ?? true;
  const minValue = features['min-value'] ?? -100;
  const maxValue = features['max-value'] ?? 100;

  // Keyboard controls
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === '+') {
        handleIncrement();
      } else if (e.key === 'ArrowDown' || e.key === '-') {
        handleDecrement();
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [count, enableKeyboard]);

  // Handlers
  const handleIncrement = () => {
    setCount((prev: number) => {
      const newValue = prev + incrementStep;
      return newValue <= maxValue ? newValue : prev;
    });
  };

  const handleDecrement = () => {
    setCount((prev: number) => {
      const newValue = prev - incrementStep;
      return newValue >= minValue ? newValue : prev;
    });
  };

  const handleReset = () => {
    setCount(initialCount);
  };

  // Button size mapping
  type ButtonSize = 'small' | 'medium' | 'large';
  const buttonSizeMap = {
    small: 'h-8 px-3 text-sm',
    medium: 'h-10 px-4 text-base',
    large: 'h-12 px-6 text-lg'
  };
  const buttonSizeClass = buttonSizeMap[(buttonStyles['button-size'] as ButtonSize) || 'medium'];

  // Dynamic styles
  const sectionStyle = {
    backgroundColor: counterStyles['background-color'] || '#f3f4f6',
    padding: `${counterStyles['padding'] || 32}px`,
    borderRadius: `${counterStyles['border-radius'] || 12}px`,
  };

  const numberStyle = {
    color: counterStyles['number-color'] || '#1f2937',
    fontSize: `${counterStyles['number-size'] || 48}px`,
    fontWeight: 'bold',
    lineHeight: 1.2,
  };

  const buttonStyle = {
    backgroundColor: buttonStyles['button-color'] || '#3b82f6',
    color: buttonStyles['button-text-color'] || '#ffffff',
    '--hover-bg': buttonStyles['button-hover-color'] || '#2563eb',
  } as React.CSSProperties;

  const buttonSpacing = buttonStyles['button-spacing'] || 16;

  return (
    <section
      id="counter-section"
      className="py-12 px-4"
    >
      <div className="max-w-2xl mx-auto">
        <div
          style={sectionStyle}
          className="text-center shadow-lg"
        >
          {showTitle && (
            <h2 className="text-2xl font-semibold mb-6">
              {labels['section-title'] || 'Counter'}
            </h2>
          )}

          <div className="mb-8">
            <div style={numberStyle} className="tabular-nums">
              {count}
            </div>
            {(count === minValue || count === maxValue) && (
              <p className="text-sm text-gray-500 mt-2">
                {count === minValue ? 'Minimum value reached' : 'Maximum value reached'}
              </p>
            )}
          </div>

          <div
            className="flex justify-center items-center flex-wrap"
            style={{ gap: `${buttonSpacing}px` }}
          >
            <button
              onClick={handleDecrement}
              disabled={count <= minValue}
              className={`${buttonSizeClass} font-medium rounded-md transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                ...buttonStyle,
                backgroundColor: count <= minValue ? '#9ca3af' : buttonStyle.backgroundColor,
              }}
              onMouseEnter={(e) => {
                if (count > minValue) {
                  e.currentTarget.style.backgroundColor = buttonStyles['button-hover-color'] || '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (count > minValue) {
                  e.currentTarget.style.backgroundColor = buttonStyles['button-color'] || '#3b82f6';
                }
              }}
            >
              {labels['decrement-label'] || '-'}
            </button>

            <button
              onClick={handleIncrement}
              disabled={count >= maxValue}
              className={`${buttonSizeClass} font-medium rounded-md transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                ...buttonStyle,
                backgroundColor: count >= maxValue ? '#9ca3af' : buttonStyle.backgroundColor,
              }}
              onMouseEnter={(e) => {
                if (count < maxValue) {
                  e.currentTarget.style.backgroundColor = buttonStyles['button-hover-color'] || '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (count < maxValue) {
                  e.currentTarget.style.backgroundColor = buttonStyles['button-color'] || '#3b82f6';
                }
              }}
            >
              {labels['increment-label'] || '+'}
            </button>

            {showReset && (
              <button
                onClick={handleReset}
                className={`${buttonSizeClass} font-medium rounded-md transition-colors hover:opacity-90`}
                style={{
                  backgroundColor: '#6b7280',
                  color: buttonStyles['button-text-color'] || '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b7280';
                }}
              >
                {labels['reset-label'] || 'Reset'}
              </button>
            )}
          </div>

          {enableKeyboard && (
            <p className="text-xs text-gray-500 mt-6">
              Tip: Use arrow keys or +/- to change the count, R to reset
            </p>
          )}
        </div>
      </div>
    </section>
  );
}