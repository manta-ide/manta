'use client';

import { XIcon, File, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Helper function to get just the filename from a full path
function getFilenameFromPath(fullPath: string): string {
  return fullPath.split('/').pop() || fullPath;
}

interface SelectionBadgeProps {
  type: 'file' | 'node';
  label: string;
  onRemove: () => void;
}

export function SelectionBadge({ type, label, onRemove }: SelectionBadgeProps) {
  return (
    <Badge variant="outline" className="gap-1 pr-1 border-zinc-600 text-white bg-transparent">
      {type === 'file' ? (
        <File className="w-3 h-3" />
      ) : (
        <GitBranch className="w-3 h-3" />
      )}
      <span className="text-xs">{label}</span>
      <button
        className="text-zinc-400 hover:text-white -my-px -ms-px -me-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[inherit] p-0 transition-colors outline-none"
        onClick={onRemove}
      >
        <XIcon size={10} aria-hidden="true" />
      </button>
    </Badge>
  );
}

interface SelectionBadgesProps {
  currentFile: string | null;
  selectedNodeIds: string[];
  selectedNodes?: any[];
  onRemoveFile: () => void;
  onRemoveNodes: () => void;
}

export default function SelectionBadges({
  currentFile,
  selectedNodeIds,
  selectedNodes,
  onRemoveFile,
  onRemoveNodes
}: SelectionBadgesProps) {
  if (!currentFile && selectedNodeIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {currentFile && (
        <SelectionBadge
          type="file"
          label={getFilenameFromPath(currentFile)}
          onRemove={onRemoveFile}
        />
      )}
      {selectedNodeIds.length > 0 && (
        <SelectionBadge
          type="node"
          label={
            selectedNodeIds.length === 1
              ? (selectedNodes?.[0]?.title || 'Selected Node')
              : `Multiple Nodes (${selectedNodeIds.length})`
          }
          onRemove={onRemoveNodes}
        />
      )}
    </div>
  );
}

// New component for displaying badges in messages (read-only)
interface MessageBadgeProps {
  type: 'file' | 'node';
  label: string;
  variant?: 'light' | 'dark';
}

export function MessageBadge({ type, label, variant = 'light' }: MessageBadgeProps) {
  const badgeClass = variant === 'dark'
    ? "border-zinc-600 text-white bg-transparent"
    : "border-zinc-600 text-white bg-transparent";

  return (
    <Badge variant="outline" className={`gap-1 text-xs border ${badgeClass}`}>
      {type === 'file' ? (
        <File className="w-3 h-3" />
      ) : (
        <GitBranch className="w-3 h-3" />
      )}
      <span>{label}</span>
    </Badge>
  );
}

// Component for displaying badges within messages
interface MessageBadgesProps {
  currentFile?: string | null;
  selectedNodeId?: string | null;
  selectedNode?: any | null;
  variant?: 'light' | 'dark';
}

export function MessageBadges({ currentFile, selectedNodeId, selectedNode, variant = 'light' }: MessageBadgesProps) {
  if (!currentFile && !selectedNodeId) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {currentFile && (
        <MessageBadge
          type="file"
          label={getFilenameFromPath(currentFile)}
          variant={variant}
        />
      )}
      {selectedNodeId && selectedNode && (
        <MessageBadge
          type="node"
          label={selectedNode.title || selectedNodeId}
          variant={variant}
        />
      )}
    </div>
  );
} 