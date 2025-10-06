'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Plus, Trash2, X, Pencil, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizeHandle from './ResizeHandle';

type Props = { open?: boolean; onClose?: () => void };

export default function LayersSidebar({ open = true, onClose }: Props) {
  const { layers, activeLayer, loadLayers, setActiveLayer, createLayer, deleteLayer, cloneLayer, renameLayer, graphLoading, rightSidebarWidth, setRightSidebarWidth } = useProjectStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingMode, setEditingMode] = useState<'rename' | null>(null);

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
            onClick={() => onClose?.()}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title="Close"
            style={{ width: '32px', height: '32px', padding: '0' }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {layers.length === 0 && (
          <div className="text-xs text-zinc-400">No layers yet. Create one to start.</div>
        )}
        {layers.map((name) => {
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
                  onClick={() => setActiveLayer(name)}
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
                style={{ width: '32px', height: '32px', padding: '0' }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => cloneLayer(name, `${name}-copy`)}
                variant="outline"
                size="sm"
                className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
                title="Clone layer"
                style={{ width: '32px', height: '32px', padding: '0' }}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => deleteLayer(name)}
                disabled={layers.length <= 1}
                variant="outline"
                size="sm"
                className="bg-red-600/80 text-zinc-800 border-0 hover:bg-red-600 hover:text-white disabled:opacity-50"
                title="Delete layer"
                style={{ width: '32px', height: '32px', padding: '0' }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
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
          <Button
            onClick={doCreate}
            disabled={creating || graphLoading}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> New
          </Button>
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
