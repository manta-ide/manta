// ElementBoundingBoxes.tsx
'use client';

import React, { useEffect, useState } from 'react';

interface ElementBoundingBoxesProps {
  isEditMode: boolean;
  document: Document | null;
  window: Window | null;
}

interface ElementInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function ElementBoundingBoxes({ isEditMode, document: doc, window: win }: ElementBoundingBoxesProps) {
  const [elements, setElements] = useState<ElementInfo[]>([]);

  useEffect(() => {
    console.log('ElementBoundingBoxes');
    if (!isEditMode || !doc || !win) {
      setElements([]);
      return;
    }
    console.log('ElementBoundingBoxes1');
    
    const updateElementPositions = () => {
      console.log('doc', doc);
      if (!doc || !win) return;
      console.log('doc1');
      
      const overlayRoot = doc.getElementById('selection-overlay-root');
      
      const elementInfos: ElementInfo[] = [];
      
      
      
      // Find all elements with IDs starting with "node-element-"
      doc.querySelectorAll<HTMLElement>('[id^="node-element-"]').forEach(el => {
        // Skip if element is inside the overlay
        if (overlayRoot && overlayRoot.contains(el)) return;

        const rect = el.getBoundingClientRect();
        
        // Convert to page coordinates (accounting for scroll)
                 // Add some padding around the element
         const padding = 4; // 4px padding on all sides
         const x = rect.left + win.scrollX - padding;
         const y = rect.top + win.scrollY - padding;
         const width = rect.width + (padding * 2);
         const height = rect.height + (padding * 2);

        elementInfos.push({
          id: el.id,
          x,
          y,
          width,
          height,
        });
      });

      setElements(elementInfos);
    };

    // Initial update
    updateElementPositions();

    // Set up observers for dynamic content
    const resizeObserver = new ResizeObserver(updateElementPositions);
    const mutationObserver = new MutationObserver(updateElementPositions);

    // Observe the entire document for changes
    mutationObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id'],
    });

    // Observe window resize
    win.addEventListener('resize', updateElementPositions);
    win.addEventListener('scroll', updateElementPositions);

    // Cleanup
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      win.removeEventListener('resize', updateElementPositions);
      win.removeEventListener('scroll', updateElementPositions);
    };
  }, [isEditMode, doc, win]);

  if (!isEditMode || elements.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998, // Just below the selection overlay
      }}
    >
      {elements.map((element) => (
                 <div
           key={element.id}
           className="absolute border-2 border-blue-300 bg-blue-100/10 pointer-events-none rounded-[3px]"
           style={{
             left: `${element.x}px`,
             top: `${element.y}px`,
             width: `${element.width}px`,
             height: `${element.height}px`,
           }}
           title={`Element: ${element.id}`}
         />
      ))}
    </div>
  );
} 