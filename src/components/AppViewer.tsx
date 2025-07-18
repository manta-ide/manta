'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import { Edit3, File, Code, MessageCircle } from 'lucide-react';

interface AppViewerProps {
  isEditMode: boolean;
}

export default function AppViewer({ isEditMode }: AppViewerProps) {
  const { getFileContent, selection, setSelection } = useProjectStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Selection state for edit mode
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);

  // Always show the main page.tsx file
  const pageContent = getFileContent('src/app/page.tsx');

  // Process the code to make it work with react-live
  const processCodeForLive = (code: string) => {
    if (!code) return '';
    
    // Remove import statements as react-live doesn't handle them
    let processedCode = code
      .replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '')
      .replace(/import\s+['"].*?['"];?\s*/g, '')
      .trim();

    // Remove export default and just keep the function
    processedCode = processedCode.replace(/export\s+default\s+/, '');

    return processedCode;
  };

  const processedCode = processCodeForLive(pageContent);

  // Handle mouse events for selection (only in edit mode)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    setStartPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsSelecting(true);
    setHasMoved(false);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !isSelecting || !startPoint || !containerRef.current) return;

    setHasMoved(true);
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setSelection({
      x: Math.min(startPoint.x, currentX),
      y: Math.min(startPoint.y, currentY),
      width: Math.abs(startPoint.x - currentX),
      height: Math.abs(startPoint.y - currentY),
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    
    // Clear selection if it was just a click (no movement)
    if (isSelecting && !hasMoved) {
      setSelection(null);
    }

    setStartPoint(null);
    setIsSelecting(false);
    setHasMoved(false);
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return;
    
    // Fallback: always clear selection on click
    setSelection(null);
    e.preventDefault();
  };

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

  return (
    <div className="flex flex-col h-full bg-background border-l">
      <div className="flex-1 relative min-h-0">
        <div 
          ref={containerRef}
          className="absolute inset-0 overflow-auto"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        >
          <LiveProvider 
            key={refreshKey} 
            code={processedCode}
            scope={{ 
              Edit3, 
              File, 
              Code, 
              MessageCircle,
              React,
              useState: React.useState,
              useEffect: React.useEffect,
              useRef: React.useRef,
              useCallback: React.useCallback,
              useMemo: React.useMemo,
              useReducer: React.useReducer,
              useContext: React.useContext
            }}
          >
            <LivePreview />
            <LiveError className="m-4 p-4 bg-red-50 border border-red-200 rounded text-red-600 text-sm font-mono" />
          </LiveProvider>
        </div>
        
        {/* Selection overlay (only in edit mode) */}
        {isEditMode && selection && (
          <div
            className="absolute pointer-events-none border-2 border-blue-500 bg-blue-200/20"
            style={{
              left: `${selection.x}px`,
              top: `${selection.y}px`,
              width: `${selection.width}px`,
              height: `${selection.height}px`,
            }}
          />
        )}
      </div>
    </div>
  );
} 