'use client';

import { useState, useRef, MouseEvent } from 'react';
import { useProjectStore } from '@/lib/store';

type Pt = { x: number; y: number } | null;

interface SelectionOverlayProps {
  isEditMode: boolean;
}

export default function SelectionOverlay({ isEditMode }: SelectionOverlayProps) {
  const { selection } = useProjectStore();

  // Don't render anything if not in edit mode or no selection
  if (!isEditMode || !selection) return null;

  // Minimum selection threshold (in pixels)
  const MIN_SELECTION_SIZE = 10;

  return (
    <>
      {/* Selection rectangle positioned within the content */}
      {selection.width >= MIN_SELECTION_SIZE && selection.height >= MIN_SELECTION_SIZE && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200/20 pointer-events-none z-[9999]"
          style={{
            left: `${selection.x}px`,
            top: `${selection.y}px`,
            width: `${selection.width}px`,
            height: `${selection.height}px`,
          }}
        />
      )}
    </>
  );
}

// Export the selection logic as custom hooks that can be used by the container
export function useSelectionHandlers(isEditMode: boolean, containerRef: React.RefObject<HTMLDivElement | null>) {
  const { selection, setSelection } = useProjectStore();
  const [startPoint, setStartPoint] = useState<Pt>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  // Minimum selection threshold (in pixels)
  const MIN_SELECTION_SIZE = 10;

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !containerRef.current) return;
    
    // Only start selection on left mouse button
    if (e.button !== 0) return;
    
    // Get the scroll position to make selection relative to content
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    
    // Calculate position relative to the scrollable content
    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;
    
    setStartPoint({ x, y });
    setIsSelecting(true);
    setHasMoved(false);
    
    // Only prevent default if we're starting a selection
    // Don't prevent other interactions like scrolling yet
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !isSelecting || !startPoint || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    
    // Calculate current position relative to the scrollable content
    const currentX = e.clientX - rect.left + scrollLeft;
    const currentY = e.clientY - rect.top + scrollTop;

    const width = Math.abs(startPoint.x - currentX);
    const height = Math.abs(startPoint.y - currentY);

    // Only set hasMoved if we've moved beyond minimum threshold
    if (width >= MIN_SELECTION_SIZE || height >= MIN_SELECTION_SIZE) {
      setHasMoved(true);
      
      setSelection({
        x: Math.min(startPoint.x, currentX),
        y: Math.min(startPoint.y, currentY),
        width,
        height,
      });
      
      // Now prevent default since we're actively selecting
      e.preventDefault();
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !isSelecting) return;
    
    // Clear selection only if it was just a click (no movement) or if the final selection is too small
    if (!hasMoved || (selection && (selection.width < MIN_SELECTION_SIZE || selection.height < MIN_SELECTION_SIZE))) {
      setSelection(null);
    }
    // Otherwise, keep the selection visible

    setStartPoint(null);
    setIsSelecting(false);
    setHasMoved(false);
    
    if (hasMoved) {
      e.preventDefault();
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    
    // Clear existing selection on clicks that weren't part of a drag
    if (!isSelecting && selection) {
      setSelection(null);
      e.preventDefault();
    }
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    isSelecting
  };
}
