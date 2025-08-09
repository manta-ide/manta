// IframeOverlay.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import SelectionBox from '@/components/SelectionBox';
import ElementBoundingBoxes from '@/components/ElementBoundingBoxes';

interface IframeOverlayProps {
  isEditMode: boolean;
  sessionId?: string;
}

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

export default function IframeOverlay({ isEditMode, sessionId }: IframeOverlayProps) {
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

  // Fetch graph node data for elements
  useEffect(() => {
    if (!isEditMode || !sessionId || !document) return;

    const fetchGraphNodes = async () => {
      const nodeElements = document.querySelectorAll<HTMLElement>('[id^="node-element-"]');
      const nodesMap = new Map<string, GraphNode>();

      for (const element of nodeElements) {
        const nodeId = element.id;//.replace('node-element-', '');
        try {
          const response = await fetch(`/api/storage/${sessionId}/${nodeId}`);
          if (response.ok) {
            const data = await response.json();
            nodesMap.set(element.id, data.node);
          }
        } catch (error) {
          console.error(`Error fetching node data for ${nodeId}:`, error);
        }
      }

      setGraphNodes(nodesMap);
    };

    fetchGraphNodes();
  }, [isEditMode, sessionId, document]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
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
        sessionId={sessionId}
      />
    </div>
  );
} 