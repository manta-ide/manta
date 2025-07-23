'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import SelectionOverlay, { useSelectionHandlers } from './SelectionOverlay';

interface AppViewerProps {
  isEditMode: boolean;
}

export default function AppViewer({ isEditMode }: AppViewerProps) {
  const { getFileContent } = useProjectStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Use the selection handlers hook
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleClick, isSelecting } = 
    useSelectionHandlers(isEditMode, containerRef);

  // Always show the demo project's main page.tsx file
  const pageContent = getFileContent('src/app/page.tsx');

  // Process the code to make it work with react-live
  const processCodeForLive = (code: string) => {
    if (!code) return '';
    
    // Remove all import statements since react-live uses scope instead
    let processedCode = code
      .replace(/import\s+.*?from\s+['"].*?[''];?\s*/g, '')
      .replace(/import\s+['"].*?[''];?\s*/g, '')
      .trim();

    // Remove export default and just keep the function
    processedCode = processedCode.replace(/export\s+default\s+/, '');

    return processedCode;
  };

  const processedCode = processCodeForLive(pageContent);

  // Auto-refresh when file content changes
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
  }, [pageContent]);

  // If no content available, show loading
  if (!pageContent) {
    return (
      <div className="flex flex-col h-full bg-background border-l">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading project files...</p>
          </div>
        </div>
      </div>
    );
  }

  // Create a scope that includes commonly needed libraries
  const scope = {
    React,
  };

  // Dynamically add imports that are available
  try {
    // Add lucide-react icons if available
    const lucideIcons = require('lucide-react');
    Object.assign(scope, lucideIcons);
  } catch (e) {
    // lucide-react not available, skip
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      <div className="flex-1 relative min-h-0">
        <div 
          ref={containerRef}
          className={`absolute inset-0 overflow-auto ${isEditMode && isSelecting ? 'cursor-crosshair' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
          <div className="relative">
            <LiveProvider 
              key={refreshKey} 
              code={processedCode}
              scope={scope}
            >
              <LivePreview />
              <LiveError className="m-4 p-4 bg-red-50 border border-red-200 rounded text-red-600 text-sm font-mono" />
            </LiveProvider>
            
            {/* Selection overlay component - positioned inside the content area */}
            <SelectionOverlay isEditMode={isEditMode} />
          </div>
        </div>
      </div>
    </div>
  );
} 