'use client';

import { useState, useRef, MouseEvent } from 'react';
import { useCodeStore } from '@/lib/store';

export default function SelectionOverlay() {
  const { selection, setSelection } = useCodeStore();
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPoint({ x, y });
    setSelection(null);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!startPoint || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const newSelection = {
      x: Math.min(startPoint.x, currentX),
      y: Math.min(startPoint.y, currentY),
      width: Math.abs(startPoint.x - currentX),
      height: Math.abs(startPoint.y - currentY),
    };
    setSelection(newSelection);
  };

  const handleMouseUp = () => {
    setStartPoint(null);
  };

  const handleDeselect = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
        setSelection(null);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="absolute top-0 left-0 w-full h-full cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleDeselect}
    >
      {selection && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-30"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        />
      )}
    </div>
  );
} 