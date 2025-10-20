'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Plus, Trash2, Pencil, Copy, Folder, FolderOpen, File, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ResizeHandle from './ResizeHandle';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import type { GraphNode, Graph } from '@/app/api/lib/schemas';

type Props = { open?: boolean };

// Tree node for displaying graph nodes
interface GraphNodeTreeNode {
  node: GraphNode;
  children: GraphNodeTreeNode[];
  level: number;
  isLast: boolean;
  parentPath: boolean[];
}

function buildGraphTree(graph: Graph | null, parentNodeId?: string): GraphNodeTreeNode[] {
  if (!graph || !graph.nodes) return [];

  // If parentNodeId is provided, get the nested graph from that node
  let sourceGraph = graph;
  if (parentNodeId) {
    const parentNode = graph.nodes.find(n => n.id === parentNodeId);
    if (parentNode?.graph) {
      sourceGraph = parentNode.graph;
    } else {
      return [];
    }
  }

  const nodes = sourceGraph.nodes || [];
  const nodeMap = new Map<string, GraphNodeTreeNode>();

  // Create tree nodes for each graph node
  nodes.forEach((node) => {
    const treeNode: GraphNodeTreeNode = {
      node,
      children: [],
      level: 0,
      isLast: false,
      parentPath: []
    };
    nodeMap.set(node.id, treeNode);
  });

  // Root level nodes are all top-level nodes in the graph
  const rootNodes = Array.from(nodeMap.values());

  // Sort by node title
  rootNodes.sort((a, b) => a.node.title.localeCompare(b.node.title));

  // Set isLast flag
  rootNodes.forEach((node: GraphNodeTreeNode, index: number) => {
    node.isLast = index === rootNodes.length - 1;
  });

  return rootNodes;
}

export default function LayersSidebar({ open = true }: Props) {
  const { graph, graphLoading, rightSidebarWidth, setRightSidebarWidth, navigationPath, setNavigationPath } = useProjectStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const indent = 20;

  // Build tree from current graph (based on navigation path)
  const currentGraph = useMemo(() => {
    if (!graph || navigationPath.length === 0) {
      return graph;
    }

    let current: Graph | undefined = graph;
    for (const nodeId of navigationPath) {
      if (!current) break;
      const node: GraphNode | undefined = current.nodes?.find(n => n.id === nodeId);
      current = node?.graph;
    }
    return current || graph;
  }, [graph, navigationPath]);

  const graphTree = useMemo(() => {
    return buildGraphTree(currentGraph);
  }, [currentGraph]);

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

  // Render a graph node with tree styling
  const renderNodeItem = (item: GraphNodeTreeNode): React.ReactNode => {
    const hasNestedGraph = !!(item.node.graph && item.node.graph.nodes && item.node.graph.nodes.length > 0);
    const isExpanded = expandedNodes.has(item.node.id);

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
            "bg-zinc-800/40 border border-zinc-700 hover:bg-zinc-700"
          )}
          style={{ paddingLeft: item.level * indent + 12 }}
          onClick={(e) => {
            if (hasNestedGraph) {
              toggleExpanded(item.node.id);
            }
            if (!e.ctrlKey && !e.metaKey) {
              // Double-click or navigate into nested graph
              if (hasNestedGraph && e.detail === 2) {
                setNavigationPath([...navigationPath, item.node.id]);
              }
            }
          }}
          onDoubleClick={() => {
            if (hasNestedGraph) {
              setNavigationPath([...navigationPath, item.node.id]);
            }
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
                {item.node.graph?.nodes?.map((childNode: GraphNode) => {
                  const childItem: GraphNodeTreeNode = {
                    node: childNode,
                    children: [],
                    level: item.level + 1,
                    isLast: childNode === item.node.graph?.nodes?.[item.node.graph.nodes.length - 1],
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

  if (!open) return null;

  return (
    <div
      className="flex-none border-l border-zinc-700 bg-zinc-900 text-white flex flex-col relative"
      style={{ width: `${rightSidebarWidth}px` }}
    >
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          Graph Nodes
          {navigationPath.length > 0 && (
            <span className="text-zinc-500">({navigationPath.length} level{navigationPath.length !== 1 ? 's' : ''})</span>
          )}
        </div>
      </div>

      {/* Navigation breadcrumb */}
      {navigationPath.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-700 text-xs text-zinc-400 space-y-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setNavigationPath([])}
              className="text-zinc-400 hover:text-white transition-colors underline"
            >
              Root
            </button>
            {navigationPath.map((nodeId, index) => {
              const node = currentGraph?.nodes?.find(n => n.id === nodeId);
              return (
                <React.Fragment key={nodeId}>
                  <span>/</span>
                  <button
                    onClick={() => setNavigationPath(navigationPath.slice(0, index + 1))}
                    className="text-zinc-400 hover:text-white transition-colors underline"
                  >
                    {node?.title || nodeId}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <motion.div
        className="p-2 flex-1 overflow-y-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {graphTree.length === 0 ? (
          <div className="text-xs text-zinc-400 text-center py-8">
            {navigationPath.length > 0 ? 'No nodes in nested graph' : 'No nodes in graph yet'}
          </div>
        ) : (
          <div className="space-y-1">
            {graphTree.map((item) => renderNodeItem(item))}
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
