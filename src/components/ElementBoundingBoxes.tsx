// ElementBoundingBoxes.tsx
'use client';

import React, { useEffect, useState } from 'react';

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

export default function ElementBoundingBoxes({ isEditMode, document: doc, window: win, graphNodes }: ElementBoundingBoxesProps) {
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);

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
      console.log('doc.querySelectorAll', doc.querySelectorAll('[id^="node-element-"]'));
      
      
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

  const handleInfoClick = (elementId: string) => {
    console.log('handleInfoClick', elementId);
    setSelectedElement(selectedElement === elementId ? null : elementId);
  };

  if (!isEditMode || elements.length === 0) return null;

  console.log('graphNodes', graphNodes);
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
        {elements.map((element) => {
          const nodeData = graphNodes?.get(element.id);
          return (
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
            >
              {/* Info button in top right corner */}
              <button
                onClick={() => handleInfoClick(element.id)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 text-white rounded-full text-xs font-bold pointer-events-auto hover:bg-blue-600 transition-colors"
                style={{ pointerEvents: 'auto' }}
                title="Show node info"
              >
                i
              </button>
            </div>
          );
        })}
      </div>

      {/* Node data panel */}
      {selectedElement && graphNodes?.has(selectedElement) && (
        <div
          className="fixed top-4 right-4 w-80 max-h-96 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden z-[10000]"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="flex justify-between items-center p-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800">Node Information</h3>
            <button
              onClick={() => setSelectedElement(null)}
              className="text-gray-500 hover:text-gray-700 text-lg"
            >
              ×
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-80">
            {(() => {
              const node = graphNodes.get(selectedElement);
              if (!node) return null;
              
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="font-medium text-gray-700">Title:</label>
                    <p className="text-gray-900">{node.title}</p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700">Kind:</label>
                    <p className="text-gray-900 capitalize">{node.kind}</p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700">What:</label>
                    <p className="text-gray-900">{node.what}</p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700">How:</label>
                    <p className="text-gray-900">{node.how}</p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700">Prompt:</label>
                    <p className="text-gray-900 text-xs bg-gray-50 p-2 rounded">{node.prompt}</p>
                  </div>
                  {node.properties.length > 0 && (
                    <div>
                      <label className="font-medium text-gray-700">Properties:</label>
                      <ul className="text-gray-900 list-disc list-inside">
                        {node.properties.map((prop, index) => (
                          <li key={index}>{prop}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {node.children.length > 0 && (
                    <div>
                      <label className="font-medium text-gray-700">Children ({node.children.length}):</label>
                      <ul className="text-gray-900 list-disc list-inside">
                        {node.children.map((child) => (
                          <li key={child.id}>{child.title} ({child.kind})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
} 