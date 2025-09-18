'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Edit3, Eye, Monitor, Network } from 'lucide-react';
import { useProjectStore } from '@/lib/store';

interface TopBarProps {
  panels: {
    viewer: boolean;
    graph: boolean;
  };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar({ panels, onTogglePanel, isEditMode, setIsEditMode}: TopBarProps) {
  const switchId = useId();
  const { setGraphLoading } = useProjectStore();


  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-1.5">
      <div className="flex items-center justify-between">
        {/* Left side - App title */}
        <div className="flex items-center">
        </div>

        {/* Right side - Controls and Auth */}
        <div className="flex items-center gap-3">
          {/* Edit/Preview Switch */}
          <div className="flex items-center gap-2">
            <div className="relative inline-grid h-7 grid-cols-[1fr_1fr] items-center text-xs font-medium">
              <Switch
                id={switchId}
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                className="peer data-[state=checked]:bg-transparent data-[state=unchecked]:bg-transparent absolute inset-0 h-[inherit] w-auto border border-zinc-600 [&_span]:h-full [&_span]:w-1/2 [&_span]:rounded-full [&_span]:bg-zinc-700 [&_span]:shadow-none [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
              />
              <span className="peer-data-[state=checked]:text-zinc-400 pointer-events-none relative ms-0.5 flex min-w-6 items-center justify-center text-center text-white">
                <Eye size={14} aria-hidden="true" />
              </span>
              <span className="peer-data-[state=unchecked]:text-zinc-400 pointer-events-none relative me-0.5 flex min-w-6 items-center justify-center text-center text-zinc-400 peer-data-[state=checked]:text-white">
                <Edit3 size={14} aria-hidden="true" />
              </span>
            </div>
            <Label htmlFor={switchId} className="sr-only">
              Edit/Preview mode toggle
            </Label>


          </div>

          {/* Panel Toggle Buttons */}
          <div className="flex items-center gap-1">
             <Button
               variant={panels.viewer ? "default" : "outline"}
               size="sm"
               onClick={() => onTogglePanel('viewer')}
               className={panels.viewer
                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
               }
             >
               <Monitor className="w-3.5 h-3.5" />
             </Button>

             <Button
               variant={panels.graph ? "default" : "outline"}
               size="sm"
               onClick={() => onTogglePanel('graph')}
               className={panels.graph
                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
               }
             >
               <Network className="w-3.5 h-3.5" />
            </Button>
          </div>

        </div>
      </div>


    </header>
  );
} 
