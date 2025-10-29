'use client';

import React, { useEffect, useMemo } from 'react';
import { useProjectStore } from '@/lib/store';
import { getAvailableLayers } from '@/lib/layers';
import ResizeHandle from './ResizeHandle';

type Props = { open?: boolean };

export default function LayersSidebar({ open = true }: Props) {
  const { activeLayer, loadLayers, setActiveLayer, graph, rightSidebarWidth, setRightSidebarWidth } = useProjectStore();

  useEffect(() => { loadLayers(); }, [loadLayers]);

  // Get available layers dynamically from the graph
  const availableLayers = useMemo(() => {
    if (!graph) return [];
    return getAvailableLayers(graph);
  }, [graph]);

  if (!open) return null;

  return (
    <div
      className="flex-none border-l border-zinc-700 bg-zinc-900 text-white flex flex-col relative"
      style={{ width: `${rightSidebarWidth}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          Layers
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {availableLayers.length === 0 ? (
          <div className="text-xs text-zinc-500 italic">
            No layers available. Create nodes with a layer property to see them here.
          </div>
        ) : (
          <div className="space-y-1">
            {availableLayers.map((layerName) => {
              const isActive = layerName === activeLayer;
              return (
                <div key={layerName} className={`flex items-center justify-between rounded border px-2 py-1 ${isActive ? 'bg-zinc-800 border-blue-600' : 'bg-zinc-800/40 border-zinc-700'} gap-2`}>
                  <button
                    className={`text-left text-xs flex-1 truncate ${isActive ? 'text-white' : 'text-zinc-300'}`}
                    onClick={() => {
                      // Dispatch event to save viewport before switching layers
                      window.dispatchEvent(new CustomEvent('manta:switch-layer', { detail: { layerName } }));
                    }}
                    title={isActive ? 'Active layer' : 'Set active'}
                  >
                    {layerName}
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
