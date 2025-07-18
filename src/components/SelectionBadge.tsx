'use client';

import { useState } from 'react';
import { XIcon, File, MousePointer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SelectionBadgeProps {
  type: 'file' | 'area';
  label: string;
  onRemove: () => void;
}

export function SelectionBadge({ type, label, onRemove }: SelectionBadgeProps) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {type === 'file' ? (
        <File className="w-3 h-3" />
      ) : (
        <MousePointer className="w-3 h-3" />
      )}
      <span className="text-xs">{label}</span>
      <button
        className="focus-visible:border-ring focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground -my-px -ms-px -me-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[inherit] p-0 transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
        onClick={onRemove}
      >
        <XIcon size={10} aria-hidden="true" />
      </button>
    </Badge>
  );
}

interface SelectionBadgesProps {
  currentFile: string | null;
  selection: { x: number; y: number; width: number; height: number } | null;
  onRemoveFile: () => void;
  onRemoveSelection: () => void;
}

export default function SelectionBadges({ 
  currentFile, 
  selection, 
  onRemoveFile, 
  onRemoveSelection 
}: SelectionBadgesProps) {
  if (!currentFile && !selection) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 border-b">
      {currentFile && (
        <SelectionBadge
          type="file"
          label={currentFile}
          onRemove={onRemoveFile}
        />
      )}
      {selection && (
        <SelectionBadge
          type="area"
          label={`${Math.round(selection.width)}×${Math.round(selection.height)}`}
          onRemove={onRemoveSelection}
        />
      )}
    </div>
  );
} 