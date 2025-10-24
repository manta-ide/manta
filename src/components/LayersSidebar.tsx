'use client';

import React, { useEffect } from 'react';
import { useProjectStore } from '@/lib/store';
import { Globe, Box, Puzzle, Code } from 'lucide-react';
import ResizeHandle from './ResizeHandle';

type Props = { open?: boolean };

// Fixed C4 layers that are always present
const C4_LAYERS = [
  { name: 'system', icon: Globe, label: 'System', color: 'text-blue-400' },
  { name: 'container', icon: Box, label: 'Container', color: 'text-green-400' },
  { name: 'component', icon: Puzzle, label: 'Component', color: 'text-yellow-400' },
  { name: 'code', icon: Code, label: 'Code', color: 'text-purple-400' },
] as const;

export default function LayersSidebar({ open = true }: Props) {
  const { activeLayer, loadLayers, setActiveLayer, graphLoading, rightSidebarWidth, setRightSidebarWidth } = useProjectStore();

  useEffect(() => { loadLayers(); }, [loadLayers]);

  if (!open) return null;

  return (
    <div
      className="flex-none border-l border-zinc-700 bg-zinc-900 text-white flex flex-col relative"
      style={{ width: `${rightSidebarWidth}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          C4 Layers
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {/* C4 Layers */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-zinc-400 mb-2">
            Architecture Layers
          </div>
          {C4_LAYERS.map((c4Layer) => {
            const isActive = c4Layer.name === activeLayer;
            const Icon = c4Layer.icon;
            return (
              <div key={c4Layer.name} className={`flex items-center justify-between rounded border px-2 py-1 ${isActive ? 'bg-zinc-800 border-blue-600' : 'bg-zinc-800/40 border-zinc-700'} gap-2`}>
                <button
                  className={`text-left text-xs flex-1 truncate flex items-center gap-2 ${isActive ? 'text-white' : 'text-zinc-300'}`}
                  onClick={() => {
                    // Dispatch event to save viewport before switching layers
                    window.dispatchEvent(new CustomEvent('manta:switch-layer', { detail: { layerName: c4Layer.name } }));
                  }}
                  title={isActive ? 'Active layer' : 'Set active'}
                >
                  <Icon className={`w-3 h-3 ${c4Layer.color}`} />
                  <span>{c4Layer.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <ResizeHandle
        direction="left"
        onResize={setRightSidebarWidth}
        initialWidth={rightSidebarWidth}
        minWidth={200}
        maxWidth={600}
      />
    </div>
  );
}
