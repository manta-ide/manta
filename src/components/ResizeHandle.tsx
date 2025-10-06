'use client';

import React, { useState, useRef, useCallback } from 'react';

interface ResizeHandleProps {
  direction: 'left' | 'right';
  onResize: (newWidth: number) => void;
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}

export default function ResizeHandle({
  direction,
  onResize,
  initialWidth,
  minWidth = 200,
  maxWidth = 600,
  className = ''
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = initialWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      let newWidth;

      if (direction === 'right') {
        // For right-side handle (left sidebar), moving right increases width
        newWidth = startWidthRef.current + deltaX;
      } else {
        // For left-side handle (right sidebar), moving left increases width
        newWidth = startWidthRef.current - deltaX;
      }

      // Apply constraints
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, initialWidth, minWidth, maxWidth, onResize]);

  return (
    <div
      className={`absolute top-0 bottom-0 z-10 select-none ${className} ${
        direction === 'right'
          ? 'right-0 cursor-ew-resize'
          : 'left-0 cursor-ew-resize'
      }`}
      style={{
        width: '4px',
        [direction === 'right' ? 'right' : 'left']: '-2px',
        backgroundColor: 'transparent'
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    />
  );
}