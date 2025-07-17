'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { useCodeStore } from '@/lib/store';

type Pt = { x: number; y: number } | null;

export default function SelectionOverlay({
  allowMeta = true, // set false if you want ONLY Ctrl
}: { allowMeta?: boolean }) {
  const { selection, setSelection } = useCodeStore();

  const [startPoint, setStartPoint] = useState<Pt>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modifierDown, setModifierDown] = useState(false); // Ctrl (and optionally Meta) held?
  const [activeSelecting, setActiveSelecting] = useState(false); // currently drawing box

  const overlayRef = useRef<HTMLDivElement>(null);

  /* Track modifier globally so we can arm the overlay & change cursor. */
  useEffect(() => {
    const isMod = (e: KeyboardEvent) =>
      e.key === 'Control' || (allowMeta && e.metaKey && e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt')
        ? true
        : e.key === 'Meta'; // handle direct Meta keyup/down events

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || (allowMeta && e.metaKey) || isMod(e)) setModifierDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // When *both* ctrl & meta are up, disarm.
      if (!e.ctrlKey && !(allowMeta && e.metaKey)) setModifierDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [allowMeta]);

  const beginSelection = (e: MouseEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || (allowMeta && e.metaKey);
    if (!mod) return; // must hold modifier to start

    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDragging(false);
    setActiveSelecting(true);
    e.preventDefault();
  };

  const updateSelection = (e: MouseEvent<HTMLDivElement>) => {
    if (!activeSelecting || !startPoint) return;

    setIsDragging(true);
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

  const finishSelection = (e: MouseEvent<HTMLDivElement>) => {
    if (!activeSelecting) return;

    // Modifier+click w/out drag clears selection
    if (!isDragging) setSelection(null);

    setStartPoint(null);
    setIsDragging(false);
    setActiveSelecting(false);
    e.preventDefault();
  };

  /* Allow overlay to receive events when armed (modifierDown) or actively selecting. */
  const overlayPointerEvents = activeSelecting || modifierDown ? 'auto' : 'none';
  const overlayCursor = modifierDown ? 'crosshair' : 'default';

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: overlayPointerEvents, cursor: overlayCursor }}
      onMouseDown={beginSelection}
      onMouseMove={updateSelection}
      onMouseUp={finishSelection}
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
