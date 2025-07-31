'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import SelectionOverlay, { useSelectionHandlers } from './SelectionOverlay';
import { LoaderFive } from "@/components/ui/loader";

interface AppViewerProps {
  isEditMode: boolean;
}

export default function AppViewer({ isEditMode }: AppViewerProps) {
  const [isAppRunning, setIsAppRunning] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Use the selection handlers hook
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleClick, isSelecting } = 
    useSelectionHandlers(isEditMode, containerRef);

  // Check if the app is running on port 3001
  useEffect(() => {
    const checkAppStatus = async () => {
      try {
        const response = await fetch('http://localhost:3001', { 
          method: 'HEAD',
          mode: 'no-cors'
        });
        setIsAppRunning(true);
      } catch (error) {
        setIsAppRunning(false);
      }
    };

    checkAppStatus();
    const interval = setInterval(checkAppStatus, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Refresh iframe when needed
  const refreshIframe = () => {
    setIframeKey(prev => prev + 1);
  };

  // If app is not running, show instructions
  if (!isAppRunning) {
    return (
      <div className="flex flex-col h-full bg-background border-l">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-4">
                <LoaderFive text="Loading the app..." />
            </div>
            <p className="text-muted-foreground mb-4">
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Status indicator */}
      
      <div className="flex-1 relative min-h-0">
        <div 
          ref={containerRef}
          className={`relative w-full h-full ${isEditMode && isSelecting ? 'cursor-crosshair' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
          {/* iframe wrapper with relative positioning */}
          <div className="relative w-full h-full">
            <iframe
              key={iframeKey}
              src="http://localhost:3001"
              className="w-full h-full border-0"
              title="Demo App"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
            
            {/* Selection overlay positioned absolutely over the iframe */}
            <div className="absolute inset-0 pointer-events-none z-[9999]">
              <SelectionOverlay isEditMode={isEditMode} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 