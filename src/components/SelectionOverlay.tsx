// SelectionOverlay.tsx
'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { useProjectStore } from '@/lib/store';

/* ------------------------------------------------------------------ */
/*                            Overlay box                             */
/* ------------------------------------------------------------------ */

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
        left:   `${selection.x}px`,
        top:    `${selection.y}px`,
        width:  `${selection.width}px`,
        height: `${selection.height}px`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*                       Drag-selection handlers                      */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number } | null;

export function useSelectionHandlers(
  isEditMode: boolean,
  layerRef: React.RefObject<HTMLDivElement | null>,
) {
  const { selection, setSelection } = useProjectStore();

  const [startPt,     setStartPt]     = useState<Pt>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasMoved,    setHasMoved]    = useState(false);
  const suppressClick = useRef(false);

  const MIN = 4; // px

  /* ------------------------------- mousedown ------------------------------ */
  const handleMouseDown = (e: MouseEvent) => {
    if (!isEditMode || e.button !== 0) return;

    setStartPt({ x: e.pageX, y: e.pageY });
    setIsSelecting(true);
    setHasMoved(false);
  };

  /* ------------------------------- mousemove ------------------------------ */
  const handleMouseMove = (e: MouseEvent) => {
    if (!isEditMode || !isSelecting || !startPt) return;

    const width  = Math.abs(startPt.x - e.pageX);
    const height = Math.abs(startPt.y - e.pageY);
    setHasMoved(width >= MIN || height >= MIN);

    setSelection({
      x: Math.min(startPt.x, e.pageX),
      y: Math.min(startPt.y, e.pageY),
      width,
      height,
      selectedElements: 'elements',
    });

    e.preventDefault(); // block text selection
  };

  /* ------------------------------- mouseup -------------------------------- */
/**
 * Utility: pick only the style properties we care about.
 * Extend this list to capture more.
 */
/* ----------------------------------------------------------- */
/* Helper constants / types – keep these near the component   */
/* ----------------------------------------------------------- */
const STYLE_KEYS = [
  'display',
  'position',
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
] as const;

type PickedStyle = { [K in (typeof STYLE_KEYS)[number]]: string };

interface SelectedDescriptor {
  tag: string;
  text: string;
  style: PickedStyle;
  coverage: number;
}

/* ----------------------------------------------------------- */
/* handleMouseUp – now uses *intersection* instead of coverage */
/* ----------------------------------------------------------- */
const handleMouseUp = (e: MouseEvent) => {
  if (!isEditMode) return;

  if (hasMoved && startPt) {
    const doc = layerRef.current?.ownerDocument;
    if (!doc) return;

    /* selection rectangle in page coordinates (inside iframe) */
    const selLeft   = Math.min(startPt.x, e.pageX);
    const selTop    = Math.min(startPt.y, e.pageY);
    const selRight  = Math.max(startPt.x, e.pageX);
    const selBottom = Math.max(startPt.y, e.pageY);

    const view = doc.defaultView!;
    const overlayRoot = doc.getElementById('selection-overlay-root');

    /* quick overlap test */
    const intersects = (rLeft: number, rTop: number, rRight: number, rBottom: number) =>
      selLeft   < rRight  && selRight  > rLeft &&
      selTop    < rBottom && selBottom > rTop;

    /* build descriptor */
    const buildDescriptor = (el: HTMLElement, coverage: number): SelectedDescriptor => {
      const cs = view.getComputedStyle(el);
      const picked: PickedStyle = {} as PickedStyle;
      STYLE_KEYS.forEach(k => (picked[k] = cs[k as any] || ''));

      const txt = el.innerText.trim().replace(/\s+/g, ' ').slice(0, 80);
      return {
        tag: el.tagName.toLowerCase(),
        text: txt,
        style: picked,
        coverage: Number(coverage.toFixed(1)),
      };
    };

    const selected: SelectedDescriptor[] = [];
    doc.body.querySelectorAll<HTMLElement>('*').forEach(el => {
      if (overlayRoot && overlayRoot.contains(el)) return; // skip overlay

      const rect = el.getBoundingClientRect();
      const rLeft   = rect.left   + view.scrollX;
      const rTop    = rect.top    + view.scrollY;
      const rRight  = rect.right  + view.scrollX;
      const rBottom = rect.bottom + view.scrollY;

      if (!intersects(rLeft, rTop, rRight, rBottom)) return;

      /* intersection area */
      const interLeft   = Math.max(selLeft,  rLeft);
      const interTop    = Math.max(selTop,   rTop);
      const interRight  = Math.min(selRight, rRight);
      const interBottom = Math.min(selBottom,rBottom);
      const interArea   =
        Math.max(0, interRight - interLeft) *
        Math.max(0, interBottom - interTop);
      const elArea = rect.width * rect.height || 1;

      const pct = (interArea / elArea) * 100;

      if (pct >= 30) selected.push(buildDescriptor(el, pct)); // keep only ≥80 %
    });

    console.log("selected", JSON.stringify(selected));

    setSelection({
      x: selLeft,
      y: selTop,
      width:  selRight  - selLeft,
      height: selBottom - selTop,
      selectedElements: JSON.stringify(selected),
    });

    suppressClick.current = true;
    e.preventDefault();
  } else {
    setSelection(null);
  }

  setStartPt(null);
  setIsSelecting(false);
  setHasMoved(false);
};


  
  

  /* -------------------------------- click -------------------------------- */
  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selection) setSelection(null);
  };

  /* ---------------------------------------------------------------------- */

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    isSelecting,
  };
}
