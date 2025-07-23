'use client';

import { useState } from 'react';
import { XIcon, File, MousePointer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { isValidSelection, formatSelectionLabel, Selection } from '@/lib/selectionHelpers';

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
  selection: Selection | null;
  onRemoveFile: () => void;
  onRemoveSelection: () => void;
}

export default function SelectionBadges({ 
  currentFile, 
  selection, 
  onRemoveFile, 
  onRemoveSelection 
}: SelectionBadgesProps) {
  const validSelection = isValidSelection(selection);
  
  if (!currentFile && !validSelection) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {currentFile && (
        <SelectionBadge
          type="file"
          label={currentFile}
          onRemove={onRemoveFile}
        />
      )}
      {validSelection && (
        <SelectionBadge
          type="area"
          label={formatSelectionLabel(selection)}
          onRemove={onRemoveSelection}
        />
      )}
    </div>
  );
}

// New component for displaying badges in messages (read-only)
interface MessageBadgeProps {
  type: 'file' | 'area';
  label: string;
  variant?: 'light' | 'dark';
}

export function MessageBadge({ type, label, variant = 'light' }: MessageBadgeProps) {
  const badgeClass = variant === 'dark' 
    ? "bg-white/20 text-white/80 border-white/30" 
    : "bg-black/10 text-black/70 border-black/20";
    
  return (
    <Badge variant="outline" className={`gap-1 text-xs border ${badgeClass}`}>
      {type === 'file' ? (
        <File className="w-3 h-3" />
      ) : (
        <MousePointer className="w-3 h-3" />
      )}
      <span>{label}</span>
    </Badge>
  );
}

// Component for displaying badges within messages
interface MessageBadgesProps {
  currentFile?: string | null;
  selection?: Selection | null;
  variant?: 'light' | 'dark';
}

export function MessageBadges({ currentFile, selection, variant = 'light' }: MessageBadgesProps) {
  const validSelection = isValidSelection(selection);
  
  if (!currentFile && !validSelection) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {currentFile && (
        <MessageBadge
          type="file"
          label={currentFile}
          variant={variant}
        />
      )}
      {validSelection && (
        <MessageBadge
          type="area"
          label={formatSelectionLabel(selection)}
          variant={variant}
        />
      )}
    </div>
  );
} 