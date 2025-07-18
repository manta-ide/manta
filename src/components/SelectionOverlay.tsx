'use client';

import { useState, useRef, MouseEvent } from 'react';
import { useProjectStore } from '@/lib/store';

type Pt = { x: number; y: number } | null;

export default function SelectionOverlay() {
  const { selection, setSelection } = useProjectStore();

  const [startPoint, setStartPoint] = useState<Pt>(null);
  const [hasMoved, setHasMoved] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHasMoved(false);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!startPoint) return;

    setHasMoved(true);
    const rect = overlayRef.current!.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setSelection({
      x: Math.min(startPoint.x, currentX),
      y: Math.min(startPoint.y, currentY),
      width: Math.abs(startPoint.x - currentX),
      height: Math.abs(startPoint.y - currentY),
    });
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    // Always clear selection if no movement (just a click)
    if (!hasMoved) {
      setSelection(null);
    }

    setStartPoint(null);
    setHasMoved(false);
    e.preventDefault();
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Fallback: clear selection on any click
    setSelection(null);
    e.preventDefault();
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      {selection && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200/30 pointer-events-none"
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
