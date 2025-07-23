'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, MessageCircle, Edit3, Eye, Monitor } from 'lucide-react';
import { useProjectStore } from '@/lib/store';

interface TopBarProps {
  panels: {
    files: boolean;
    editor: boolean;
    viewer: boolean;
    chat: boolean;
  };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar({ panels, onTogglePanel, isEditMode, setIsEditMode }: TopBarProps) {
  const switchId = useId();
  
  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-3">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          {/* Edit/Preview Switch */}
          <div className="flex items-center gap-2">
            <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium bg-zinc-800 rounded-lg p-1">
              <Switch
                id={switchId}
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                className="peer data-[state=checked]:bg-zinc-600 data-[state=unchecked]:bg-zinc-700 absolute inset-0 h-[inherit] w-auto [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
              />
              <span className="peer-data-[state=checked]:text-white pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center">
                <Eye size={16} aria-hidden="true" />
              </span>
              <span className="peer-data-[state=unchecked]:text-zinc-400 pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center">
                <Edit3 size={16} aria-hidden="true" />
              </span>
            </div>
            <Label htmlFor={switchId} className="sr-only">
              Edit/Preview mode toggle
            </Label>
          </div>

          {/* Panel Toggle Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={panels.files ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('files')}
              className={panels.files 
                ? "bg-zinc-700 text-white border-0" 
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Folder className="w-4 h-4" />
            </Button>
            
            <Button
              variant={panels.editor ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('editor')}
              className={panels.editor 
                ? "bg-zinc-700 text-white border-0" 
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Code className="w-4 h-4" />
            </Button>
            
            <Button
              variant={panels.viewer ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('viewer')}
              className={panels.viewer 
                ? "bg-zinc-700 text-white border-0" 
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Monitor className="w-4 h-4" />
            </Button>

            <Button
              variant={panels.chat ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('chat')}
              className={panels.chat 
                ? "bg-zinc-700 text-white border-0" 
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
} 