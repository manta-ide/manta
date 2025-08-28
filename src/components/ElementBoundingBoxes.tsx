// ElementBoundingBoxes.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { GraphNode } from '@/app/api/lib/schemas';

// Configuration variables for customization
const CONFIG = {
  // Border/outline settings
  borderWidth: '3px',
  edgeIndicatorWidth: '3.5px',
  
  // Colors
  selectedBoxColor: '#93c5fd', // blue-300
  selectedBoxBackground: 'rgba(147, 196, 253, 0.37)', // blue-300 with opacity
  unbuiltBoxColor: '#facc15', // yellow-400
  unbuiltBoxBackground: 'rgba(254, 240, 138, 0.1)', // yellow-200/10
  unbuiltLabelBackground: '#eab308', // yellow-500
  
  // Glow/shadow effects
  boxShadow: '0 0 4px rgba(42, 114, 196, 0.5)',
  unbuiltBoxShadow: '0 0 4px rgba(250, 204, 21, 0.5)',
  
  // Border radius
  borderRadius: '3px',
  
  // Padding for bounding box calculations
  padding: 4,
  
  // Z-index layering
  zIndex: {
    container: 9998,
    statusBoxes: 9999,
    selectedBox: 10000,
    edgeIndicators: 10001,
  },
} as const;

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
  const [, setBuiltStatus] = useState<Record<string, boolean>>({});

  // Get graph data and check if the selected node is the root node
  const { graph } = useProjectStore();
  const isRootNodeSelected = selectedNodeId && graph?.nodes && graph.nodes.length > 0 && selectedNodeId === graph.nodes[0].id;

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
      const padding = CONFIG.padding;
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
      doc.querySelectorAll<HTMLElement>('[id]').forEach(el => {
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
      const padding = CONFIG.padding;
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

  // Get built status from store  
  useEffect(() => {
    if (graph) {
      const map: Record<string, boolean> = {};
      for (const n of graph.nodes || []) {
        map[n.id] = n.state === 'built';
      }
      setBuiltStatus(map);
    }
  }, [graph, selectedNodeId]);

  if (!isEditMode) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: CONFIG.zIndex.container, // Just below the selection overlay
          // Ensure this overlay doesn't affect the document flow
          contain: 'layout style paint',
          // Ensure it's rendered above the iframe content
          isolation: 'isolate',
        }}
      >
        {/* Global status boxes for unbuilt */}
        {allBoxes.map((box) => {
          // const isUnbuilt = builtStatus[box.id] === false;
          if (true) return null;
          const label = 'Unbuilt';
          return (
            <div
              key={`status-${box.id}`}
              style={{
                position: 'fixed',
                pointerEvents: 'none',
                border: `${CONFIG.borderWidth} solid ${CONFIG.unbuiltBoxColor}`,
                backgroundColor: CONFIG.unbuiltBoxBackground,
                borderRadius: CONFIG.borderRadius,
                left: `${box.x}px`,
                top: `${box.y}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
                zIndex: CONFIG.zIndex.statusBoxes,
                // Ensure the box is completely isolated
                contain: 'layout style paint',
                // Prevent any layout impact on the document
                transform: 'translateZ(0)',
                // Ensure it's rendered above everything
                isolation: 'isolate',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  left: 0,
                  fontSize: 10,
                  color: '#fff',
                  backgroundColor: CONFIG.unbuiltLabelBackground,
                  padding: '2px 4px',
                  borderRadius: CONFIG.borderRadius,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}

        {/* Selected box overlay - don't show for root node */}
        {selectedBox && !isRootNodeSelected && (
          <>
            <div
              style={{
                position: 'fixed',
                pointerEvents: 'none',
                border: `${CONFIG.borderWidth} solid ${CONFIG.selectedBoxColor}`,
                borderRadius: CONFIG.borderRadius,
                left: `${selectedBox.x}px`,
                top: `${selectedBox.y}px`,
                width: `${selectedBox.width}px`,
                height: `${selectedBox.height}px`,
                zIndex: CONFIG.zIndex.selectedBox,
                // Ensure the box is completely isolated
                contain: 'layout style paint',
                // Prevent any layout impact on the document
                transform: 'translateZ(0)',
                // Ensure it's rendered above everything
                isolation: 'isolate',
              }}
              title={`Element: ${selectedBox.id}`}
            />
            
            {/* Edge indicators for when selected box extends beyond viewport - don't show for root node */}
            {!isRootNodeSelected && selectedBox.x < 0 && (
              <div
                style={{
                  position: 'fixed',
                  left: '-1px',
                  top: `${Math.max(0, selectedBox.y)}px`,
                  width: CONFIG.edgeIndicatorWidth,
                  height: `${Math.max(1, selectedBox.height)}px`,
                  backgroundColor: CONFIG.selectedBoxColor,
                  zIndex: CONFIG.zIndex.edgeIndicators,
                  pointerEvents: 'none',
                  boxShadow: CONFIG.boxShadow,
                }}
              />
            )}
            
            {!isRootNodeSelected && selectedBox.y < 0 && (
              <div
                style={{
                  position: 'fixed',
                  left: `${Math.max(0, selectedBox.x)}px`,
                  top: '0px',
                  width: `${Math.max(1, selectedBox.width)}px`,
                  height: CONFIG.edgeIndicatorWidth,
                  backgroundColor: CONFIG.selectedBoxColor,
                  zIndex: CONFIG.zIndex.edgeIndicators,
                  pointerEvents: 'none',
                  boxShadow: CONFIG.boxShadow,
                }}
              />
            )}
            
            {!isRootNodeSelected && selectedBox.x + selectedBox.width > (win?.innerWidth || 0) && (
              <div
                style={{
                  position: 'fixed',
                  right: '0px',
                  top: `${Math.max(0, selectedBox.y)}px`,
                  width: CONFIG.edgeIndicatorWidth,
                  height: `${Math.max(1, selectedBox.height)}px`,
                  backgroundColor: CONFIG.selectedBoxColor,
                  zIndex: CONFIG.zIndex.edgeIndicators,
                  pointerEvents: 'none',
                  boxShadow: CONFIG.boxShadow,
                }}
              />
            )}
            
            {!isRootNodeSelected && selectedBox.y + selectedBox.height > (win?.innerHeight || 0) && (
              <div
                style={{
                  position: 'fixed',
                  left: `${Math.max(1, selectedBox.x)}px`,
                  bottom: '0px',
                  width: `${Math.max(1, selectedBox.width)}px`,
                  height: CONFIG.edgeIndicatorWidth,
                  backgroundColor: CONFIG.selectedBoxColor,
                  zIndex: CONFIG.zIndex.edgeIndicators,
                  pointerEvents: 'none',
                  boxShadow: CONFIG.boxShadow,
                }}
              />
            )}
          </>
        )}
      </div>
    </>
  );
} 