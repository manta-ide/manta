// ElementBoundingBoxes.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { getGraphSession } from '@/app/api/lib/graphStorage';

interface GraphNode {
  id: string;
  title: string;
  prompt: string;
  kind: 'page' | 'section' | 'group' | 'component' | 'primitive' | 'behavior';
  what: string;
  how: string;
  properties: string[];
  children: Array<{
    id: string;
    title: string;
    prompt: string;
    kind: 'page' | 'section' | 'group' | 'component' | 'primitive' | 'behavior';
  }>;
}

interface ElementBoundingBoxesProps {
  isEditMode: boolean;
  document: Document | null;
  window: Window | null;
  graphNodes?: Map<string, GraphNode>;
}

interface ElementInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function ElementBoundingBoxes({ isEditMode, document: doc, window: win }: ElementBoundingBoxesProps) {
  const { selectedNodeId } = useProjectStore();
  const [selectedBox, setSelectedBox] = useState<ElementInfo | null>(null);
  const [allBoxes, setAllBoxes] = useState<Array<ElementInfo & { id: string }>>([]);
  const [builtStatus, setBuiltStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isEditMode || !doc || !win) {
      setSelectedBox(null);
      setAllBoxes([]);
      return;
    }
    
    const updateSelectedBox = () => {
      if (!doc || !win || !selectedNodeId) {
        setSelectedBox(null);
        return;
      }
      const overlayRoot = doc.getElementById('selection-overlay-root');
      const el = doc.getElementById(selectedNodeId) as HTMLElement | null;
      if (!el || (overlayRoot && overlayRoot.contains(el))) {
        setSelectedBox(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const padding = 4;
      const x = rect.left + win.scrollX - padding;
      const y = rect.top + win.scrollY - padding;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;
      setSelectedBox({ id: el.id, x, y, width, height });
    };

    const updateAllBoxes = () => {
      if (!doc || !win) { setAllBoxes([]); return; }
      const overlayRoot = doc.getElementById('selection-overlay-root');
      const byId = new Map<string, { left: number; top: number; right: number; bottom: number }>();
      doc.querySelectorAll<HTMLElement>('[id^="node-element-"]').forEach(el => {
        if (overlayRoot && overlayRoot.contains(el)) return;
        const r = el.getBoundingClientRect();
        const left = r.left + win.scrollX;
        const top = r.top + win.scrollY;
        const right = r.right + win.scrollX;
        const bottom = r.bottom + win.scrollY;
        const acc = byId.get(el.id);
        if (!acc) {
          byId.set(el.id, { left, top, right, bottom });
        } else {
          acc.left = Math.min(acc.left, left);
          acc.top = Math.min(acc.top, top);
          acc.right = Math.max(acc.right, right);
          acc.bottom = Math.max(acc.bottom, bottom);
        }
      });
      const padding = 4;
      const infos: Array<ElementInfo & { id: string }> = [];
      for (const [id, bb] of byId.entries()) {
        const x = bb.left - padding;
        const y = bb.top - padding;
        const width = (bb.right - bb.left) + padding * 2;
        const height = (bb.bottom - bb.top) + padding * 2;
        infos.push({ id, x, y, width, height });
      }
      setAllBoxes(infos);
    };

    // Initial update
    updateSelectedBox();
    updateAllBoxes();

    // Set up observers for dynamic content
    const resizeObserver = new ResizeObserver(() => { updateSelectedBox(); updateAllBoxes(); });
    const mutationObserver = new MutationObserver(() => { updateSelectedBox(); updateAllBoxes(); });

    // Observe the entire document for changes
    mutationObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id'],
    });

    // Observe window resize
    win.addEventListener('resize', () => { updateSelectedBox(); updateAllBoxes(); });
    win.addEventListener('scroll', () => { updateSelectedBox(); updateAllBoxes(); });

    // Cleanup
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      // listeners were anonymous lambdas; safe to ignore remove here
    };
  }, [isEditMode, doc, win, selectedNodeId]);

  // Fetch built flags from backend storage (via files endpoint) once per mount and on selection changes
  useEffect(() => {
    const fetchBuilt = async () => {
      try {
        const res = await fetch('/api/files?graphs=true');
        const data = await res.json();
        const graphRec = (data.graphs || []).find((g: any) => g.sessionId === 'default');
        const map: Record<string, boolean> = {};
        for (const n of graphRec?.graph?.nodes || []) map[n.id] = !!n.built;
        setBuiltStatus(map);
      } catch {}
    };
    fetchBuilt();
  }, [selectedNodeId]);

  if (!isEditMode) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998, // Just below the selection overlay
        }}
      >
        {/* Global status boxes for unbuilt */}
        {allBoxes.map((box) => {
          const isUnbuilt = builtStatus[box.id] === false;
          if (!isUnbuilt) return null;
          const label = 'Unbuilt';
          return (
            <div
              key={`status-${box.id}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                border: '2px solid #facc15', // yellow-400
                backgroundColor: 'rgba(254, 240, 138, 0.1)', // yellow-200/10
                borderRadius: 3,
                left: `${box.x}px`,
                top: `${box.y}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  left: 0,
                  fontSize: 10,
                  color: '#fff',
                  backgroundColor: '#eab308', // yellow-500
                  padding: '2px 4px',
                  borderRadius: 3,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}

        {/* Selected box overlay */}
        {selectedBox && (
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              border: '2px solid #93c5fd', // blue-300
              backgroundColor: 'rgba(219, 234, 254, 0.1)', // blue-100/10
              borderRadius: 3,
              left: `${selectedBox.x}px`,
              top: `${selectedBox.y}px`,
              width: `${selectedBox.width}px`,
              height: `${selectedBox.height}px`,
            }}
            title={`Element: ${selectedBox.id}`}
          />
        )}
      </div>
    </>
  );
} 