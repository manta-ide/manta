'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Plus, Trash2, Pencil, Copy, Folder, FolderOpen, File, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizeHandle from './ResizeHandle';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { getParentLayerPath, getLayerName, buildLayerTree, type LayerNode } from '@/lib/layer-utils';

type Props = { open?: boolean };

export default function LayersSidebar({ open = true }: Props) {
  const { layers, activeLayer, loadLayers, setActiveLayer, createLayer, deleteLayer, cloneLayer, renameLayer, graphLoading, rightSidebarWidth, setRightSidebarWidth } = useProjectStore();
  const [parentForNewLayer, setParentForNewLayer] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingMode, setEditingMode] = useState<'rename' | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(['graph1']));
  const indent = 20;

  useEffect(() => { loadLayers(); }, [loadLayers]);

  // Organize layers into a tree structure based on filesystem hierarchy
  const layerTree = useMemo(() => {
    return buildLayerTree(layers);
  }, [layers]);

  const nextDefaultName = useMemo(() => {
    const nums = layers
      .map((n) => Number((n.match(/(\d+)$/)?.[1]) || '0'))
      .filter((v) => !Number.isNaN(v));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `graph${max + 1}`;
  }, [layers]);

  const doCreate = async (parentPath?: string) => {
    const name = nextDefaultName;
    setCreating(true);
    const created = await createLayer(name, parentPath);
    setCreating(false);
    if (created) {
      await setActiveLayer(created);
      // Start editing the newly created layer to allow renaming
      startEditing(created);
    }
    setParentForNewLayer(null); // Reset parent selection
  };

  const startEditing = (layerName: string) => {
    setEditingLayer(layerName);
    setEditingMode('rename');
    setEditingValue(getLayerName(layerName));
  };

  const cancelEditing = () => {
    setEditingLayer(null);
    setEditingValue('');
    setEditingMode(null);
  };

  const saveEditing = async () => {
    if (!editingLayer || !editingValue.trim()) return;

    const newLayerName = editingValue.trim();
    const currentLayerName = getLayerName(editingLayer);

    if (newLayerName === currentLayerName) {
      cancelEditing();
      return;
    }

    // Construct the full new path by replacing the last part of the old path
    const parentPath = getParentLayerPath(editingLayer);
    const newFullPath = parentPath ? `${parentPath}/${newLayerName}` : newLayerName;

    const renamed = await renameLayer(editingLayer, newFullPath);
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

  const toggleExpanded = (layerName: string) => {
    setExpandedLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerName)) {
        newSet.delete(layerName);
      } else {
        newSet.add(layerName);
      }
      return newSet;
    });
  };

  // Render a layer node with tree styling like tree.tsx
  const renderLayerNode = (node: LayerNode): React.ReactNode => {
    const isActive = node.name === activeLayer;
    const isEditing = editingLayer === node.name;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedLayers.has(node.name);

    const getDefaultIcon = () =>
      hasChildren ? (
        isExpanded ? (
          <FolderOpen className="h-4 w-4" />
        ) : (
          <Folder className="h-4 w-4" />
        )
      ) : (
        <File className="h-4 w-4" />
      );

    return (
      <div key={node.name} className="select-none">
        <motion.div
          className={cn(
            "flex items-center py-2 px-3 cursor-pointer transition-all duration-200 relative group rounded",
            isActive
              ? "bg-zinc-800 border border-blue-600"
              : "bg-zinc-800/40 border border-zinc-700 hover:bg-zinc-700"
          )}
          style={{ paddingLeft: node.level * indent + 12 }}
          onClick={(e) => {
            if (hasChildren) toggleExpanded(node.name);
            if (!e.ctrlKey && !e.metaKey && node.name !== activeLayer) {
              setActiveLayer(node.name);
            }
          }}
          whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
        >
          {/* Tree Lines */}
          {node.level > 0 && (
            <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
              {node.parentPath.map((isLastInPath, pathIndex) => (
                <div
                  key={pathIndex}
                  className="absolute top-0 bottom-0 border-l border-zinc-600/40"
                  style={{
                    left: pathIndex * indent + 12,
                    display:
                      pathIndex === node.parentPath.length - 1 && node.isLast
                        ? "none"
                        : "block",
                  }}
                />
              ))}
              <div
                className="absolute top-1/2 border-t border-zinc-600/40"
                style={{
                  left: (node.level - 1) * indent + 12,
                  width: indent - 4,
                  transform: "translateY(-1px)",
                }}
              />
              {node.isLast && (
                <div
                  className="absolute top-0 border-l border-zinc-600/40"
                  style={{
                    left: (node.level - 1) * indent + 12,
                    height: "50%",
                  }}
                />
              )}
            </div>
          )}

          {/* Expand Icon */}
          <motion.div
            className="flex items-center justify-center w-4 h-4 mr-1"
            animate={{ rotate: hasChildren && isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {hasChildren && (
              <ChevronRight className="h-3 w-3 text-zinc-400" />
            )}
          </motion.div>

          {/* Node Icon */}
          <motion.div
            className="flex items-center justify-center w-4 h-4 mr-2 text-zinc-400"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.15 }}
          >
            {getDefaultIcon()}
          </motion.div>

          {/* Label */}
          <span className="text-sm truncate flex-1">
            {isEditing ? (
              <input
                className="text-left text-xs flex-1 bg-zinc-700 border border-blue-500 rounded px-1 outline-none w-full"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={saveEditing}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={cn(isActive ? "text-white" : "text-zinc-300")} title={node.name}>
                {getLayerName(node.name)}
              </span>
            )}
          </span>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                doCreate(node.name);
              }}
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 hover:bg-zinc-700 text-zinc-400"
              title="Create child layer"
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                startEditing(node.name);
              }}
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 hover:bg-zinc-700 text-zinc-400"
              title="Rename layer"
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                const parentPath = getParentLayerPath(node.name) || undefined;
                cloneLayer(node.name, `${getLayerName(node.name)}-copy`, parentPath);
              }}
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 hover:bg-zinc-700 text-zinc-400"
              title="Clone layer"
            >
              <Copy className="w-3 h-3" />
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                deleteLayer(node.name);
              }}
              disabled={layers.length <= 1}
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 hover:bg-red-600/80 text-zinc-400 hover:text-white disabled:opacity-50"
              title="Delete layer"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </motion.div>

        {/* Children */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: -10 }}
                animate={{ y: 0 }}
                exit={{ y: -10 }}
                transition={{
                  duration: 0.2,
                  delay: 0.1,
                }}
              >
                {node.children.map(child => renderLayerNode(child))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
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
            onClick={() => doCreate()}
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

      <motion.div
        className="p-2 flex-1 overflow-y-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {layerTree.length === 0 ? (
          <div className="text-xs text-zinc-400 text-center py-8">
            No layers yet. Create one to start.
          </div>
        ) : (
          <div className="space-y-1">
            {layerTree.map((rootNode) => renderLayerNode(rootNode))}
          </div>
        )}
      </motion.div>

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
