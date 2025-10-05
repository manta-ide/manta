'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Plus, Trash2, Layers as LayersIcon, RefreshCcw, X, Copy } from 'lucide-react';

type Props = { open?: boolean; onClose?: () => void };

export default function LayersSidebar({ open = true, onClose }: Props) {
  const { layers, activeLayer, loadLayers, setActiveLayer, createLayer, deleteLayer, cloneLayer, graphLoading } = useProjectStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => { loadLayers(); }, [loadLayers]);

  const nextDefaultName = useMemo(() => {
    const nums = layers
      .map((n) => Number((n.match(/(\d+)$/)?.[1]) || '0'))
      .filter((v) => !Number.isNaN(v));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `graph${max + 1}`;
  }, [layers]);

  const doCreate = async () => {
    const name = newName.trim() || nextDefaultName;
    setCreating(true);
    const created = await createLayer(name);
    setCreating(false);
    setNewName('');
    if (created) {
      await setActiveLayer(created);
    }
  };

  if (!open) return null;

  return (
    <div className="flex-none w-72 border-l border-zinc-700 bg-zinc-900 text-white flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <LayersIcon size={16} /> Layers
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            onClick={() => loadLayers()}
            title="Refresh"
          >
            <RefreshCcw size={14} />
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            onClick={() => onClose?.()}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-zinc-400">No layers yet. Create one to start.</div>
        )}
        {layers.map((name) => {
          const isActive = name === activeLayer;
          return (
            <div key={name} className={`flex items-center justify-between rounded border px-2 py-1 ${isActive ? 'bg-zinc-800 border-blue-600' : 'bg-zinc-800/40 border-zinc-700'} gap-2`}>
              <button
                className={`text-left text-xs flex-1 truncate ${isActive ? 'text-white' : 'text-zinc-300'}`}
                onClick={() => setActiveLayer(name)}
                title={isActive ? 'Active layer' : 'Set active'}
              >
                {name}
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                onClick={async () => {
                  const suggestion = `${name}-copy`;
                  const newName = window.prompt('Clone layer as:', suggestion) || undefined;
                  await cloneLayer(name, newName);
                }}
                title="Clone layer"
              >
                <Copy size={14} />
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 disabled:opacity-50"
                onClick={() => deleteLayer(name)}
                disabled={layers.length <= 1}
                title="Delete layer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-zinc-700">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 outline-none focus:border-blue-500"
            placeholder={nextDefaultName}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 flex items-center gap-1"
            onClick={doCreate}
            disabled={creating || graphLoading}
          >
            <Plus size={14} /> New
          </button>
        </div>
      </div>
    </div>
  );
}
