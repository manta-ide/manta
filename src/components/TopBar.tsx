'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, MessageCircle, Edit3, Eye } from 'lucide-react';
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
    <header className="border-b bg-background px-4 py-2">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          {/* Edit/Preview Switch */}
          <div className="flex items-center gap-2">
            <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
              <Switch
                id={switchId}
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                className="peer data-[state=checked]:bg-input/50 data-[state=unchecked]:bg-input/50 absolute inset-0 h-[inherit] w-auto [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
              />
              <span className="peer-data-[state=checked]:text-muted-foreground/70 pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center">
                <Eye size={16} aria-hidden="true" />
              </span>
              <span className="peer-data-[state=unchecked]:text-muted-foreground/70 pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center">
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
            >
              <Folder className="w-4 h-4" />
            </Button>
            
            <Button
              variant={panels.editor ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('editor')}
            >
              <Code className="w-4 h-4" />
            </Button>
            
            <Button
              variant={panels.chat ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('chat')}
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
} 