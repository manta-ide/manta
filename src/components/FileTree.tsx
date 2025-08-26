'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { useProjectStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
}

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
}

function FileTreeNode({ node, level }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0 || node.path.startsWith('src'));
  const { currentFile, setCurrentFile } = useProjectStore();

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      setCurrentFile(node.path);
    }
  };

  const isSelected = currentFile === node.path;

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className={`w-full justify-start h-8 px-2 font-normal text-sm transition-all duration-150 ${
          isSelected 
            ? 'bg-zinc-700 text-white hover:text-white' 
            : 'hover:bg-zinc-700/50 text-white hover:text-white'
        } ${isSelected ? 'hover:bg-zinc-700' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2 flex-1">
          {node.type === 'directory' && (
            <div className="flex items-center">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 transition-transform duration-200" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 transition-transform duration-200" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-zinc-400 ml-1" />
              ) : (
                <Folder className="w-4 h-4 text-zinc-400 ml-1" />
              )}
            </div>
          )}
          {node.type === 'file' && (
            <File className="w-4 h-4 text-zinc-400 ml-5" />
          )}
          <span className="text-sm truncate">{node.name}</span>
        </div>
      </Button>
      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree() {
  const { fileTree, setCurrentFile } = useProjectStore();

  const handleEmptySpaceClick = (e: React.MouseEvent) => {
    // Only deselect if clicking on the container itself (empty space)
    if (e.target === e.currentTarget) {
      setCurrentFile(null);
    }
  };

  return (
    <div 
      className="w-64 h-full bg-zinc-900 border-r border-zinc-700 overflow-y-auto custom-scrollbar"
      onClick={handleEmptySpaceClick}
    >
      <div className="p-3">
        <div className="mb-3">
          <FileTreeNode 
            node={{ 
              name: 'project', 
              path: '', 
              type: 'directory', 
              children: fileTree 
            }} 
            level={0} 
          />
        </div>
      </div>
    </div>
  );
} 