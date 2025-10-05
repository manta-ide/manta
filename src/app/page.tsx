'use client';

import React, { useState, useCallback } from 'react';
import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import ImageDisplay from '@/components/ImageDisplay';
import FloatingChat from '@/components/FloatingChat';
import SearchOverlay from '@/components/SearchOverlay';
import TopBar from '@/components/TopBar';

export default function Home() {
  const [panels, setPanels] = useState({ graph: true, image: false });
  const [imageDisplayWidth, setImageDisplayWidth] = useState(320); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);

  const handleTogglePanel = (panel: keyof typeof panels) => {
    setPanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const newWidth = window.innerWidth - e.clientX;
    // Constrain width between 200px and 600px
    const constrainedWidth = Math.max(200, Math.min(600, newWidth));
    setImageDisplayWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners when resizing
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <TopBar
        panels={panels}
        onTogglePanel={handleTogglePanel}
        isEditMode={false}
        setIsEditMode={() => {}}
      />
      <div className="flex" style={{ height: 'calc(100vh - 2.5rem)' }}>
        <SelectedNodeSidebar />
        <div className="relative flex-1">
          <GraphView />
          <SearchOverlay />
          <FloatingChat />
        </div>
        {panels.image && (
          <>
            {/* Resize handle */}
            <div
              className="w-1 bg-zinc-700 hover:bg-zinc-600 cursor-ew-resize transition-colors relative"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-8 bg-zinc-600 rounded opacity-0 hover:opacity-100 transition-opacity">
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-zinc-400 rounded"></div>
                </div>
              </div>
            </div>
            <ImageDisplay
              isOpen={panels.image}
              onClose={() => handleTogglePanel('image')}
              width={imageDisplayWidth}
            />
          </>
        )}
      </div>
    </main>
  );
}
