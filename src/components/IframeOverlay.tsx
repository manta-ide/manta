// IframeOverlay.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import SelectionBox from '@/components/SelectionBox';
import ElementBoundingBoxes from '@/components/ElementBoundingBoxes';

interface IframeOverlayProps {
  isEditMode: boolean;
}

export default function IframeOverlay({ isEditMode }: IframeOverlayProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [window, setWindow] = useState<Window | null>(null);
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
      />
      <SelectionBox 
        isEditMode={isEditMode} 
        document={document}
        window={window}
      />
    </div>
  );
} 