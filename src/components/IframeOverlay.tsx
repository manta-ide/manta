
// IframeOverlay.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import SelectionBox from '@/components/SelectionBox';
import ElementBoundingBoxes from '@/components/ElementBoundingBoxes';

interface IframeOverlayProps {
  isEditMode: boolean;
  sessionId?: string;
}

import { GraphNode } from '@/app/api/lib/schemas';
import { useProjectStore } from '@/lib/store';

export default function IframeOverlay({ isEditMode }: IframeOverlayProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [window, setWindow] = useState<Window | null>(null);
  const [graphNodes, setGraphNodes] = useState<Map<string, GraphNode>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateDocumentReference = () => {
      const doc = containerRef.current?.ownerDocument;
      const win = doc?.defaultView || null;
      
      setDocument(doc || null);
      setWindow(win);
    };

    // Initial update
    updateDocumentReference();

    // Set up a small delay to ensure the iframe is loaded
    const timer = setTimeout(updateDocumentReference, 100);

    return () => clearTimeout(timer);
  }, []);

  // Get graph nodes from store
  const { graph } = useProjectStore();
  
  useEffect(() => {
    if (!isEditMode || !document) return;

    const nodeElements = document.querySelectorAll<HTMLElement>('[id]');
    const nodesMap = new Map<string, GraphNode>();

    for (const element of nodeElements) {
      const nodeId = element.id;
      const nodeData = graph?.nodes.find(n => n.id === nodeId);
      if (nodeData) {
        nodesMap.set(element.id, nodeData);
      }
    }

    setGraphNodes(nodesMap);
  }, [isEditMode, document, graph]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        // Ensure this overlay doesn't affect the document flow
        zIndex: 9999,
        // Prevent any layout impact
        contain: 'layout style paint',
        // Ensure it's rendered above the iframe content
        isolation: 'isolate',
      }}
    >
      <ElementBoundingBoxes 
        isEditMode={isEditMode} 
        document={document}
        window={window}
        graphNodes={graphNodes}
      />
      <SelectionBox 
        isEditMode={isEditMode} 
        document={document}
        window={window}
      />
    </div>
  );
} 