// SelectionBox.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store';

interface SelectionBoxProps {
  isEditMode: boolean;
  document: Document | null;
  window: Window | null;
}

export default function SelectionBox({ isEditMode, document: doc, window: win }: SelectionBoxProps) {
  const { setSelectedNode } = useProjectStore();
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isEditMode || !doc || !win) {
      setSelectionBox(null);
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#selection-overlay-root')) return;

      const startX = e.clientX + win.scrollX;
      const startY = e.clientY + win.scrollY;
      
      const handleMouseMove = (e: MouseEvent) => {
        const currentX = e.clientX + win.scrollX;
        const currentY = e.clientY + win.scrollY;
        
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        
        setSelectionBox({ x, y, width, height });
      };
      
      const handleMouseUp = async () => {
        doc.removeEventListener('mousemove', handleMouseMove);
        doc.removeEventListener('mouseup', handleMouseUp);
        
        if (selectionBox && selectionBox.width > 10 && selectionBox.height > 10) {
          // Find elements within the selection box
          const elements = doc.querySelectorAll<HTMLElement>('[id^="node-element-"]');
          const selectedElements: string[] = [];
          
          elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const elX = rect.left + win.scrollX;
            const elY = rect.top + win.scrollY;
            const elWidth = rect.width;
            const elHeight = rect.height;
            
            // Check if element intersects with selection box
            if (
              elX < selectionBox.x + selectionBox.width &&
              elX + elWidth > selectionBox.x &&
              elY < selectionBox.y + selectionBox.height &&
              elY + elHeight > selectionBox.y
            ) {
              selectedElements.push(el.id);
            }
          });
          
          if (selectedElements.length > 0) {
            // Select the first element found
            const nodeId = selectedElements[0].replace('node-element-', '');
            
            // Fetch node data from backend storage
            const res = await fetch(`/api/backend/storage?nodeId=${nodeId}`);
            if (res.ok) {
              const data = await res.json();
              setSelectedNode(nodeId, data.node);
            }
          }
        }
        
        setSelectionBox(null);
      };
      
      doc.addEventListener('mousemove', handleMouseMove);
      doc.addEventListener('mouseup', handleMouseUp);
    };
    
    doc.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      doc.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isEditMode, doc, win, selectionBox, setSelectedNode]);

  if (!isEditMode || !selectionBox) return null;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: `${selectionBox.x}px`,
        top: `${selectionBox.y}px`,
        width: `${selectionBox.width}px`,
        height: `${selectionBox.height}px`,
        border: '2px dashed #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
} 