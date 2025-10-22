'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Plus, Trash2, Pencil, Copy, Globe, Box, Puzzle, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const { layers, activeLayer, loadLayers, setActiveLayer, createLayer, deleteLayer, cloneLayer, renameLayer, graphLoading, rightSidebarWidth, setRightSidebarWidth } = useProjectStore();
  const [creating, setCreating] = useState(false);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingMode, setEditingMode] = useState<'rename' | null>(null);

  useEffect(() => { loadLayers(); }, [loadLayers]);

  // Filter out C4 layer names from user layers to avoid conflicts
  const userLayers = useMemo(() => {
    const c4LayerNames = C4_LAYERS.map(layer => layer.name);
    return layers.filter(layer => !c4LayerNames.includes(layer as any));
  }, [layers]);

  const nextDefaultName = useMemo(() => {
    const nums = userLayers
      .map((n) => Number((n.match(/(\d+)$/)?.[1]) || '0'))
      .filter((v) => !Number.isNaN(v));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `graph${max + 1}`;
  }, [userLayers]);

  const doCreate = async () => {
    const name = nextDefaultName;
    setCreating(true);
    const created = await createLayer(name);
    setCreating(false);
    if (created) {
      await setActiveLayer(created);
      // Start editing the newly created layer to allow renaming
      startEditing(created);
    }
  };

  const startEditing = (layerName: string) => {
    setEditingLayer(layerName);
    setEditingMode('rename');
    setEditingValue(layerName);
  };

  const cancelEditing = () => {
    setEditingLayer(null);
    setEditingValue('');
    setEditingMode(null);
  };

  const saveEditing = async () => {
    if (!editingLayer || !editingValue.trim()) return;

    const newName = editingValue.trim();
    if (newName === editingLayer) {
      cancelEditing();
      return;
    }

    const renamed = await renameLayer(editingLayer, newName);
    if (renamed) {
      cancelEditing();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  if (!open) return null;

  return (
    <div
      className="flex-none border-l border-zinc-700 bg-zinc-900 text-white flex flex-col relative"
      style={{ width: `${rightSidebarWidth}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          Layers
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={doCreate}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title="Create new layer"
            style={{ width: '32px', height: '32px', padding: '0' }}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {/* Fixed C4 Layers */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1">
            <span>C4 Architecture</span>
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

        {/* Separator */}
        <div className="border-t border-zinc-700 my-3"></div>

        {/* User Layers */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-zinc-400 mb-2 flex items-center justify-between">
            <span>User Layers</span>
            <Button
              onClick={doCreate}
              variant="outline"
              size="sm"
              className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-5 w-5 p-0"
              title="Create new layer"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          {userLayers.length === 0 && (
            <div className="text-xs text-zinc-400">No user layers yet. Create one to start.</div>
          )}
          {userLayers.map((name) => {
            const isActive = name === activeLayer;
            const isEditing = editingLayer === name;
            return (
              <div key={name} className={`flex items-center justify-between rounded border px-2 py-1 ${isActive ? 'bg-zinc-800 border-blue-600' : 'bg-zinc-800/40 border-zinc-700'} gap-2`}>
                {isEditing ? (
                  <input
                    className="text-left text-xs flex-1 bg-zinc-700 border border-blue-500 rounded px-1 outline-none"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={saveEditing}
                    autoFocus
                  />
                ) : (
                  <button
                    className={`text-left text-xs flex-1 truncate ${isActive ? 'text-white' : 'text-zinc-300'}`}
                    onClick={() => {
                      // Dispatch event to save viewport before switching layers
                      window.dispatchEvent(new CustomEvent('manta:switch-layer', { detail: { layerName: name } }));
                    }}
                    title={isActive ? 'Active layer' : 'Set active'}
                  >
                    {name}
                  </button>
                )}
                <Button
                  onClick={() => startEditing(name)}
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
                  title="Rename layer"
                  style={{ width: '24px', height: '24px', padding: '0' }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  onClick={() => cloneLayer(name, `${name}-copy`)}
                  variant="outline"
                  size="sm"
                  className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
                  title="Clone layer"
                  style={{ width: '24px', height: '24px', padding: '0' }}
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  onClick={() => deleteLayer(name)}
                  disabled={userLayers.length <= 1}
                  variant="outline"
                  size="sm"
                  className="bg-red-600/80 text-zinc-800 border-0 hover:bg-red-600 hover:text-white disabled:opacity-50"
                  title="Delete layer"
                  style={{ width: '24px', height: '24px', padding: '0' }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
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
