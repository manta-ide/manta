'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopBarProps {
  panels: { graph: boolean; image: boolean };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar({ panels, onTogglePanel }: TopBarProps) {
  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center" />
        <div className="flex items-center gap-2">
          <Button
            onClick={() => onTogglePanel('image')}
            variant={panels.image ? 'default' : 'outline'}
            size="sm"
            className={`${panels.image
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
            title={panels.image ? 'Hide image display' : 'Show generated image'}
          >
            <Eye className="w-4 h-4 mr-1" />
            Image Display
          </Button>
        </div>
      </div>
    </header>
  );
}
