'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Folder, FolderOpen, File, ChevronRight } from 'lucide-react';
import ResizeHandle from './ResizeHandle';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import type { GraphNode, Graph } from '@/app/api/lib/schemas';

type Props = { open?: boolean };

// Tree node for displaying graph nodes recursively
interface GraphNodeTreeNode {
  node: GraphNode;
  level: number;
  isLast: boolean;
  parentPath: boolean[];
}

function buildGraphTree(graph: Graph | null): GraphNodeTreeNode[] {
  if (!graph || !graph.nodes) return [];

  const nodes = graph.nodes || [];
  
  // Create tree nodes for each graph node
  const treeNodes: GraphNodeTreeNode[] = nodes.map((node, index) => ({
    node,
    level: 0,
    isLast: index === nodes.length - 1,
    parentPath: []
  }));

  // Sort by node title
  treeNodes.sort((a, b) => a.node.title.localeCompare(b.node.title));

  // Update isLast after sorting
  treeNodes.forEach((node, index) => {
    node.isLast = index === treeNodes.length - 1;
  });

  return treeNodes;
}

export default function LayersSidebar({ open = true }: Props) {
  const { graph, rightSidebarWidth, setRightSidebarWidth, navigationPath, setNavigationPath } = useProjectStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const indent = 20;

  // Always use root graph to build the tree
  const graphTree = useMemo(() => {
    return buildGraphTree(graph);
  }, [graph]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // Check if a node is currently selected (highlighted) based on navigationPath
  const isNodeSelected = (nodeId: string, level: number): boolean => {
    // Only highlight the last node in the navigation path
    if (navigationPath.length === 0) return false;
    const lastLevel = navigationPath.length - 1;
    return level === lastLevel && navigationPath[level] === nodeId;
  };

  // Check if root is selected
  const isRootSelected = navigationPath.length === 0;

  // Auto-expand selected nodes when navigationPath changes
  useEffect(() => {
    if (navigationPath.length > 0) {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        // Expand only the currently selected node (last one in path)
        const selectedNodeId = navigationPath[navigationPath.length - 1];
        newSet.add(selectedNodeId);
        return newSet;
      });
    }
  }, [navigationPath]);

  // Auto-expand root when at root level
  useEffect(() => {
    if (navigationPath.length === 0) {
      setExpandedNodes(new Set(['__root__']));
    }
  }, [navigationPath]);

  // Render a graph node and its children recursively
  const renderNodeItem = (item: GraphNodeTreeNode): React.ReactNode => {
    const hasNestedGraph = !!(item.node.graph && item.node.graph.nodes && item.node.graph.nodes.length > 0);
    const isExpanded = expandedNodes.has(item.node.id);
    const isSelected = isNodeSelected(item.node.id, item.level);

    const getDefaultIcon = () =>
      hasNestedGraph ? (
        isExpanded ? (
          <FolderOpen className="h-4 w-4" />
        ) : (
          <Folder className="h-4 w-4" />
        )
      ) : (
        <File className="h-4 w-4" />
      );

    return (
      <div key={item.node.id} className="select-none">
        <motion.div
          className={cn(
            "flex items-center py-2 px-3 cursor-pointer transition-all duration-200 relative group rounded",
            isSelected ? "bg-blue-500/20 border border-blue-500/50" : "bg-zinc-800/40 border border-zinc-700 hover:bg-zinc-700"
          )}
          style={{ paddingLeft: item.level * indent + 12 }}
          onClick={(e) => {
            e.stopPropagation();
            // Click to navigate to this node
            setNavigationPath(navigationPath.slice(0, item.level).concat(item.node.id));
            // Collapse siblings at same level when selecting this node
            setExpandedNodes(prev => {
              const newSet = new Set(prev);
              // Only keep the root and the selected node's ancestors expanded
              // Remove any expanded siblings at the same level
              const nodesToRemove = graphTree
                .filter(n => n.node.id !== item.node.id && n.level === item.level)
                .map(n => n.node.id);
              nodesToRemove.forEach(id => newSet.delete(id));
              return newSet;
            });
          }}
          whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
        >
          {/* Tree Lines */}
          {item.level > 0 && (
            <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
              {item.parentPath.map((isLastInPath, pathIndex) => (
                <div
                  key={pathIndex}
                  className="absolute top-0 bottom-0 border-l border-zinc-600/40"
                  style={{
                    left: pathIndex * indent + 12,
                    display:
                      pathIndex === item.parentPath.length - 1 && item.isLast
                        ? "none"
                        : "block",
                  }}
                />
              ))}
              <div
                className="absolute top-1/2 border-t border-zinc-600/40"
                style={{
                  left: (item.level - 1) * indent + 12,
                  width: indent - 4,
                  transform: "translateY(-1px)",
                }}
              />
              {item.isLast && (
                <div
                  className="absolute top-0 border-l border-zinc-600/40"
                  style={{
                    left: (item.level - 1) * indent + 12,
                    height: "50%",
                  }}
                />
              )}
            </div>
          )}

          {/* Expand Icon */}
          <motion.div
            className="flex items-center justify-center w-4 h-4 mr-1"
            animate={{ rotate: hasNestedGraph && isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            onClick={(e) => {
              e.stopPropagation();
              if (hasNestedGraph) {
                toggleExpanded(item.node.id);
              }
            }}
          >
            {hasNestedGraph && (
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

          {/* Node Title */}
          <span className="text-sm truncate flex-1 text-zinc-300">
            {item.node.title}
          </span>
        </motion.div>

        {/* Children (nested graph nodes) */}
        <AnimatePresence>
          {hasNestedGraph && isExpanded && (
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
                {item.node.graph?.nodes?.map((childNode: GraphNode, childIndex: number) => {
                  const childItem: GraphNodeTreeNode = {
                    node: childNode,
                    level: item.level + 1,
                    isLast: childIndex === item.node.graph!.nodes!.length - 1,
                    parentPath: item.parentPath.concat(item.isLast)
                  };
                  return renderNodeItem(childItem);
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Render Root item with expand/collapse
  const renderRoot = () => {
    const isExpanded = expandedNodes.has('__root__');
    
    return (
      <div key="__root__" className="select-none">
        <motion.div
          className={cn(
            "flex items-center py-2 px-3 cursor-pointer transition-all duration-200 relative group rounded font-semibold",
            isRootSelected ? "bg-blue-500/20 border border-blue-500/50" : "bg-zinc-800/40 border border-zinc-700 hover:bg-zinc-700"
          )}
          onClick={(e) => {
            e.stopPropagation();
            // Click to navigate to root
            setNavigationPath([]);
          }}
          whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
        >
          {/* Expand Icon */}
          <motion.div
            className="flex items-center justify-center w-4 h-4 mr-1"
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded('__root__');
            }}
          >
            <ChevronRight className="h-3 w-3 text-zinc-400" />
          </motion.div>

          {/* Node Icon */}
          <motion.div
            className="flex items-center justify-center w-4 h-4 mr-2 text-zinc-400"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.15 }}
          >
            <Folder className="h-4 w-4" />
          </motion.div>

          {/* Node Title */}
          <span className="text-sm truncate flex-1 text-zinc-300">
            Root
          </span>
        </motion.div>

        {/* Root Children */}
        <AnimatePresence>
          {isExpanded && (
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
                {graphTree.map((item) => renderNodeItem(item))}
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
          Graph Nodes
        </div>
      </div>

      <motion.div
        className="p-2 flex-1 overflow-y-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {graphTree.length === 0 ? (
          <div className="text-xs text-zinc-400 text-center py-8">
            No nodes in graph yet
          </div>
        ) : (
          <div className="space-y-1">
            {renderRoot()}
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
