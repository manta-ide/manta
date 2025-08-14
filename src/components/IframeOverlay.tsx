// IframeOverlay.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import ElementBoundingBoxes from './ElementBoundingBoxes';
import SelectionBox from './SelectionBox';

interface IframeOverlayProps {
  isEditMode: boolean;
}

export default function IframeOverlay({ isEditMode }: IframeOverlayProps) {
  const { selectedNodeId, setSelectedNode } = useProjectStore();
  const [document, setDocument] = useState<Document | null>(null);
  const [window, setWindow] = useState<Window | null>(null);

  useEffect(() => {
    const checkIframe = () => {
      // Use the global document, not the local state
      const iframe = globalThis.document.querySelector('iframe');
      console.log('iframe', iframe);
      if (!iframe) return;

      const iframeDoc = iframe.contentDocument;
      const iframeWin = iframe.contentWindow;
      
      console.log('iframeDoc', iframeDoc);
      console.log('iframeWin', iframeWin);
      
      if (iframeDoc && iframeWin) {
        setDocument(iframeDoc);
        setWindow(iframeWin);
        console.log('Successfully set iframe document and window');
      }
    };

    // Check immediately
    checkIframe();

    // Also check periodically in case iframe loads after component mounts
    const interval = setInterval(checkIframe, 20000);
    
    return () => clearInterval(interval);
  }, []); // Remove document dependency to avoid circular dependency

  useEffect(() => {
    if (!isEditMode || !document) return;

    // Handle clicks on node elements
    const handleClick = async (e: Event) => {

      const target = e.target as HTMLElement;
      console.log('handleClick', target.id);
      if (!target.id?.startsWith('node-element-')) return;

      const nodeId = target.id.replace('node-element-', '');
      
      // Fetch node data from backend storage
      const res = await fetch(`/api/backend/storage?nodeId=${nodeId}`);
      if (res.ok) {
        const data = await res.json();
        // Update selected node in store
        setSelectedNode(nodeId, data.node);
        console.log('Selected node:', data.node);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isEditMode, document, setSelectedNode]);

  return (
    <div id="selection-overlay-root" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      <ElementBoundingBoxes 
        isEditMode={isEditMode} 
        document={document} 
        window={window}
      />
      <SelectionBox 
        isEditMode={isEditMode} 
        document={document} 
        window={window}
      />
    </div>
  );
} 