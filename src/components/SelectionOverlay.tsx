'use client';

import { useState, useRef, MouseEvent } from 'react';
import { useProjectStore } from '@/lib/store';

type Pt = { x: number; y: number } | null;

interface SelectionOverlayProps {
  isEditMode: boolean;
}

export default function SelectionOverlay({ isEditMode }: SelectionOverlayProps) {
  const { selection } = useProjectStore();

  if (!isEditMode || !selection) return null;

  return (
    <div
      className="absolute z-[9999] border-2 border-blue-500 bg-blue-200/20 pointer-events-none"
      style={{
        left: `${selection.x}px`,
        top: `${selection.y}px`,
        width: `${selection.width}px`,
        height: `${selection.height}px`,
      }}
    />
  );
}

export function useSelectionHandlers(
  isEditMode: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const { selection, setSelection } = useProjectStore();

  const [startPoint, setStartPoint] = useState<Pt>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  /** Ignore the synthetic click fired immediately after a drag-selection. */
  const suppressClickRef = useRef(false);

  /** Small threshold so the rectangle appears almost immediately. */
  const MIN_SELECTION_SIZE = 4;

  /* ------------------------------ handlers ------------------------------ */

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !containerRef.current || e.button !== 0) return;

    const { left, top } = containerRef.current.getBoundingClientRect();
    setStartPoint({
      x: e.clientX - left + containerRef.current.scrollLeft,
      y: e.clientY - top + containerRef.current.scrollTop,
    });

    setIsSelecting(true);
    setHasMoved(false);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !isSelecting || !startPoint || !containerRef.current) return;

    const { left, top } = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - left + containerRef.current.scrollLeft;
    const currentY = e.clientY - top + containerRef.current.scrollTop;

    const width = Math.abs(startPoint.x - currentX);
    const height = Math.abs(startPoint.y - currentY);

    setHasMoved(width >= MIN_SELECTION_SIZE || height >= MIN_SELECTION_SIZE);

    // Always update so the user sees the live outline.
    setSelection({
      x: Math.min(startPoint.x, currentX),
      y: Math.min(startPoint.y, currentY),
      width,
      height,
    });

    e.preventDefault(); // prevent unwanted text selection / scrolling
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !isSelecting) return;

    if (hasMoved) {
      // We dragged → keep the rectangle and ignore the imminent click event.
      suppressClickRef.current = true;
      e.preventDefault();
    } else {
      // No drag → treat as a plain click, so clear any previous selection.
      setSelection(null);
    }

    setStartPoint(null);
    setIsSelecting(false);
    setHasMoved(false);
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;

    // Ignore the click that immediately follows a drag.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    // A genuine click without dragging clears the existing selection.
    if (selection) {
      setSelection(null);
    }
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    isSelecting,
  };
}
