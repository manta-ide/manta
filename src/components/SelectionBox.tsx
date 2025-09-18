// SelectionBox.tsx
'use client';

import React, { useRef, useEffect, MouseEvent } from 'react';
import { useProjectStore } from '@/lib/store';

interface SelectionBoxProps {
  isEditMode: boolean;
  document: Document | null;
  window: Window | null;
  sessionId?: string;
}

export default function SelectionBox({ isEditMode, document: doc, window: win }: SelectionBoxProps) {
  const { selection, setSelection, setSelectedNode } = useProjectStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Listen for graph selection messages from parent
  useEffect(() => {
    const handleGraphSelection = (event: MessageEvent) => {
      if (event.data?.source === 'graph') {
        if (event.data?.type === 'manta:graph:selection') {
          const { nodeId, nodeData } = event.data;
          console.log('SelectionBox received graph selection:', nodeId);
          setSelectedNode(nodeId, nodeData);
        } else if (event.data?.type === 'manta:graph:deselection') {
          console.log('SelectionBox received graph deselection');
          setSelectedNode(null, null);
        }
      }
    };

    window.addEventListener('message', handleGraphSelection);
    return () => window.removeEventListener('message', handleGraphSelection);
  }, [setSelectedNode]);

  // Selection state
  const [startPt, setStartPt] = React.useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [hasMoved, setHasMoved] = React.useState(false);
  const suppressClick = useRef(false);

  const MIN = 4; // px

  const handleMouseDown = (e: MouseEvent) => {
    if (!isEditMode || e.button !== 0) return;

    setStartPt({ x: e.pageX, y: e.pageY });
    setIsSelecting(true);
    setHasMoved(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isEditMode || !isSelecting || !startPt) return;

    const width = Math.abs(startPt.x - e.pageX);
    const height = Math.abs(startPt.y - e.pageY);
    setHasMoved(width >= MIN || height >= MIN);

    setSelection({
      x: Math.min(startPt.x, e.pageX),
      y: Math.min(startPt.y, e.pageY),
      width,
      height,
      selectedElements: 'elements',
    });

    e.preventDefault();
  };

  const handleMouseUp = async (e: MouseEvent) => {
    if (!isEditMode || !doc || !win) return;

    if (hasMoved && startPt) {
      const selLeft = Math.min(startPt.x, e.pageX);
      const selTop = Math.min(startPt.y, e.pageY);
      const selRight = Math.max(startPt.x, e.pageX);
      const selBottom = Math.max(startPt.y, e.pageY);

      const overlayRoot = doc.getElementById('selection-overlay-root');

      const intersects = (rLeft: number, rTop: number, rRight: number, rBottom: number) =>
        selLeft < rRight && selRight > rLeft &&
        selTop < rBottom && selBottom > rTop;

      interface SelectedDescriptor {
        tag: string;
        text: string;
        coverage: number;
      }

      const buildDescriptor = (el: HTMLElement, coverage: number): SelectedDescriptor => {
        const txt = el.innerText ? el.innerText.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
        return {
          tag: el.tagName.toLowerCase(),
          text: txt,
          coverage: Number(coverage.toFixed(1)),
        };
      };

      const selected: SelectedDescriptor[] = [];
      doc.body.querySelectorAll<HTMLElement>('*').forEach(el => {
        if (overlayRoot && overlayRoot.contains(el)) return;

        const rect = el.getBoundingClientRect();
        const rLeft = rect.left + win.scrollX;
        const rTop = rect.top + win.scrollY;
        const rRight = rect.right + win.scrollX;
        const rBottom = rect.bottom + win.scrollY;

        if (!intersects(rLeft, rTop, rRight, rBottom)) return;

        const interLeft = Math.max(selLeft, rLeft);
        const interTop = Math.max(selTop, rTop);
        const interRight = Math.min(selRight, rRight);
        const interBottom = Math.min(selBottom, rBottom);
        const interArea =
          Math.max(0, interRight - interLeft) *
          Math.max(0, interBottom - interTop);
        const elArea = rect.width * rect.height || 1;

        const pct = (interArea / elArea) * 100;

        if (pct >= 30) selected.push(buildDescriptor(el, pct));
      });

      console.log("selected", JSON.stringify(selected));

      setSelection({
        x: selLeft,
        y: selTop,
        width: selRight - selLeft,
        height: selBottom - selTop,
        selectedElements: JSON.stringify(selected),
      });

      suppressClick.current = true;
      e.preventDefault();
    } else {
      // No drag selection: interpret as click selection of a single node element
      try {
        const overlayRoot = doc.getElementById('selection-overlay-root');
        const elementsAtPoint = doc.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
        const target = elementsAtPoint.find(el => {
          if (!el || (overlayRoot && overlayRoot.contains(el))) return false;
          return (el as HTMLElement).id;
        }) as HTMLElement | undefined;

        if (target) {
          const nodeId = target.id;
          // Find node data from store
          const { graph } = useProjectStore.getState();
          const nodeData = graph?.nodes.find(n => n.id === nodeId) || null;
          setSelectedNode(nodeId, nodeData);

          // Communicate selection to parent window
          if (window.parent && window.parent !== window) {
            try {
              window.parent.postMessage({
                type: 'manta:iframe:selection',
                nodeId: nodeId,
                nodeData: nodeData,
                source: 'iframe'
              }, '*');
            } catch (error) {
              console.warn('Failed to communicate selection to parent:', error);
            }
          }
        } else {
          setSelectedNode(null, null);

          // Communicate deselection to parent window
          if (window.parent && window.parent !== window) {
            try {
              window.parent.postMessage({
                type: 'manta:iframe:deselection',
                source: 'iframe'
              }, '*');
            } catch (error) {
              console.warn('Failed to communicate deselection to parent:', error);
            }
          }
        }
      } finally {
        setSelection(null);
      }
    }

    setStartPt(null);
    setIsSelecting(false);
    setHasMoved(false);
  };

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selection) setSelection(null);
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: isEditMode ? 'auto' : 'none',
        cursor: isEditMode && isSelecting ? 'crosshair' : 'default',
        // Ensure this overlay doesn't affect the document flow
        zIndex: 10000,
        // Prevent any layout impact
        contain: 'layout style paint',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      {/* Visual selection box */}
      {isEditMode && selection && (
        <div
          style={{
            position: 'fixed',
            zIndex: 10001,
            pointerEvents: 'none',
            border: '2px solid #3b82f6',
            backgroundColor: 'rgba(191, 219, 254, 0.2)',
            left: `${selection.x}px`,
            top: `${selection.y}px`,
            width: `${selection.width}px`,
            height: `${selection.height}px`,
            // Ensure the selection box is completely isolated
            contain: 'layout style paint',
            // Prevent any layout impact on the document
            transform: 'translateZ(0)',
            // Ensure it's rendered above everything
            isolation: 'isolate',
          }}
        />
      )}
    </div>
  );
} 