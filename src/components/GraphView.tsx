'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnEdgesChange,
  OnNodesChange,
  Handle,
  Position,
  useViewport,
  PanOnScrollMode,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  NodeResizer,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useProjectStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore - remark-breaks doesn't have type definitions
import remarkBreaks from 'remark-breaks';
import ELK from 'elkjs';
import { GraphNode, Graph } from '@/app/api/lib/schemas';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { isEdgeUnbuilt, nodesAreDifferent } from '@/lib/graph-diff';
import { Button } from '@/components/ui/button';
import { Play, Hand, SquareDashed, Loader2, Layers as LayersIcon, Wand2, File, MessageSquare } from 'lucide-react';
import { useHelperLines } from './helper-lines/useHelperLines';
import Shape from './shapes';
import MinimapNode from './MinimapNode';
import { useCopyPaste } from '@/lib/useCopyPaste';

// Connection validation function
const isValidConnection = (connection: Connection | Edge) => {
  // Prevent self-connections
  if (connection.source === connection.target) {
    return false;
  }
  // Add more validation logic here if needed
  return true;
};

// Custom markdown components for comment nodes
const commentMarkdownComponents = {
  p: ({ children }: any) => {
    // Handle empty paragraphs (multiple blank lines) by rendering line breaks
    if (!children || (typeof children === 'string' && children.trim() === '')) {
      return <div style={{ height: '1em' }} />;
    }
    return <p className="mb-1 last:mb-0 text-gray-700 whitespace-pre-wrap">{children}</p>;
  },
  strong: ({ children }: any) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-gray-700">{children}</em>,
  code: ({ children }: any) => (
    <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: any) => <li className="text-gray-700">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-gray-900 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-gray-900 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-bold text-gray-900 mb-1">{children}</h3>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600 mb-1">{children}</blockquote>
  ),
};

// Custom node component
function CustomNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as GraphNode;
  const baseGraph = data.baseGraph;
  const updateNode = data.updateNode;
  const { zoom } = useViewport();
  const {
    searchResults,
    searchActiveIndex,
    searchQuery,
    searchCaseSensitive,
    searchOpen,
  } = useProjectStore();

  const activeResult = (Array.isArray(searchResults) && searchActiveIndex >= 0)
    ? searchResults[searchActiveIndex]
    : null;
  const isSearchHit = searchOpen && Array.isArray(searchResults) &&
    searchResults.length > 0 &&
    (searchQuery || '').trim() !== '' &&
    searchResults.some((r: any) => r.nodeId === node.id);
  const isActiveSearchHit = !!(searchOpen && activeResult && activeResult.nodeId === node.id);

  const highlightText = (text: string) => {
    const q = (searchQuery || '').trim();
    if (!q) return text;
    const source = searchCaseSensitive ? text : text.toLowerCase();
    const needle = searchCaseSensitive ? q : q.toLowerCase();
    const idx = source.indexOf(needle);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span style={{ background: 'rgba(245,158,11,0.35)', borderRadius: '3px' }}>{match}</span>
        {after}
      </>
    );
  };
  

  // Helper: get all connected neighbors (incoming + outgoing)
  const getNodeConnections = (nodeId: string) => {
    const graph = data.graph;
    if (!graph?.edges) return [];
    const neighbors = new Set<string>();
    for (const edge of graph.edges as any[]) {
      if (edge.source === nodeId) neighbors.add(edge.target);
      if (edge.target === nodeId) neighbors.add(edge.source);
    }
    return Array.from(neighbors)
      .map((id) => graph.nodes.find((n: any) => n.id === id))
      .filter(Boolean);
  };

  // Define zoom level thresholds for handle sizing only (always show detailed view now)
  const isZoomedOut = zoom < 0.8;      // Only used for handle sizing now
  // Always show detailed view with title and description at all zoom levels

  // Calculate handle size based on zoom level
  const handleSize = isZoomedOut ? (selected ? '24px' : '20px') : (selected ? '16px' : '12px');
  // Calculate indicator dot size based on zoom level
  const indicatorSize = isZoomedOut ? '16px' : '12px';

  // Derive effective visual state based on base graph comparison
  const effectiveState = (() => {
    console.log(`🎯 Computing state for node ${node.id} (${node.title})`);

    if (node.metadata?.ghosted) {
      console.log('   👻 Node is ghosted - marking as ghosted');
      return 'ghosted';
    }

    // Check if node has bugs - if so, it's always unbuilt
    const bugs = node.metadata?.bugs;
    const hasBugs = bugs && Array.isArray(bugs) && bugs.length > 0;
    if (hasBugs) {
      console.log(`   🐛 Node has ${bugs.length} bug(s) - marking as unbuilt`);
      return 'unbuilt';
    }

    if (!baseGraph) {
      console.log(`   ❌ No base graph available`);
      return 'unbuilt'; // No base graph, consider unbuilt
    }

    const baseNode = baseGraph.nodes.find((n: any) => n.id === node.id);
    if (!baseNode) {
      console.log(`   ❌ No matching base node found`);
      return 'unbuilt'; // New node, consider unbuilt
    }

    // Use the same diff logic as analyzeGraphDiff - compares title, prompt, AND properties
    const isSame = !nodesAreDifferent(baseNode, node);
    const result = isSame ? 'built' : 'unbuilt';
    console.log(`   ✅ Result: ${result} (using full diff comparison including properties)`);

    return result;
  })();

  // Determine styling based on node state (built/unbuilt)
  const getNodeStyles = () => {
    const borderWidth = isZoomedOut ? '3px' : '0px';

    switch (effectiveState) {
      case 'built':
      case 'unbuilt': // Unbuilt nodes look the same as built nodes visually
        return {
          background: selected ? '#f8fafc' : '#ffffff',
          border: selected ? `${borderWidth} solid #2563eb` : '1px solid #e5e7eb',
          boxShadow: selected
            ? '0 0 0 2px #2563eb'
            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          borderRadius: '8px',
        };

      case 'ghosted': {
        const borderColor = selected ? '#2563eb' : '#d1d5db';
        return {
          background: 'rgba(243, 244, 246, 0.85)',
          border: `1px dashed ${borderColor}`,
          boxShadow: selected ? '0 0 0 2px rgba(37, 99, 235, 0.25)' : 'none',
          borderRadius: '8px',
          opacity: selected ? 0.75 : 0.55,
          filter: 'saturate(0.3)',
        };
      }

      default: // Any other state - treat as unbuilt
        return {
          background: selected ? '#f8fafc' : '#ffffff',
          border: selected ? `${borderWidth} solid #2563eb` : '1px solid #e5e7eb',
          boxShadow: selected
            ? '0 0 0 2px #2563eb'
            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          borderRadius: '8px',
        };
    }
  };
  
  // Always show detailed view at all zoom levels
  const nodeStyles = getNodeStyles();

  // Determine visual shape
  const shape = (node as any).shape ||
    (() => {
      try {
        // Check if this is a comment node (has width and height properties)
        const hasWidthProp = Array.isArray(node.properties) && node.properties.some(p => p.id === 'width');
        const hasHeightProp = Array.isArray(node.properties) && node.properties.some(p => p.id === 'height');
        if (hasWidthProp && hasHeightProp) {
          return 'comment';
        }

        const p = Array.isArray((node as any).properties) ? (node as any).properties.find((pp: any) => (pp?.id || '').toLowerCase() === 'shape') : null;
        const v = (p && typeof p.value === 'string') ? p.value : undefined;
        return (v === 'circle' || v === 'triangle' || v === 'rectangle' || v === 'comment' || v === 'diamond' || v === 'hexagon' || v === 'arrow-rectangle' || v === 'cylinder' || v === 'parallelogram' || v === 'round-rectangle') ? v : 'round-rectangle';
      } catch {
        return 'round-rectangle';
      }
    })();
  const isSvgShape = shape !== 'comment'; // All shapes except comment use SVG
  const shapeDimensions: React.CSSProperties = (() => {
    switch (shape) {
      case 'circle':
        return { width: '200px', minHeight: '200px' };
      case 'triangle':
        return { width: '260px', minHeight: '180px' };
      case 'diamond':
        return { width: '220px', minHeight: '180px' };
      case 'hexagon':
        return { width: '240px', minHeight: '160px' };
      case 'arrow-rectangle':
        return { width: '240px', minHeight: '160px' };
      case 'cylinder':
        return { width: '200px', minHeight: '160px' };
      case 'parallelogram':
        return { width: '260px', minHeight: '160px' };
      case 'round-rectangle':
        return { width: '260px', minHeight: '160px' };
      case 'comment': {
        // Use custom dimensions from properties for comment nodes
        const widthProp = Array.isArray(node.properties) ? node.properties.find(p => p.id === 'width') : null;
        const heightProp = Array.isArray(node.properties) ? node.properties.find(p => p.id === 'height') : null;
        const width = widthProp?.value || 300;
        const height = heightProp?.value || 150;
        return { width: `${width}px`, minHeight: `${height}px` };
      }
      default:
        return { width: '260px', minHeight: '160px' };
    }
  })();
  const contentPadding: React.CSSProperties = (() => {
    switch (shape) {
      case 'circle':
        return { padding: '40px', paddingTop: '50px' }; // More padding for circular shape, extra top padding to push content lower
      case 'triangle':
        // Extra top padding so text doesn't collide with the apex, and bottom padding for base
        return { padding: '32px', paddingTop: '60px', paddingBottom: '24px' } as React.CSSProperties;
      case 'diamond':
        return { padding: '48px', paddingLeft: '56px', paddingRight: '56px' }; // Diamond needs significant padding to avoid sharp corners at edges
      case 'hexagon':
        return { padding: '32px' }; // Hexagon has angled sides at top/bottom
      case 'arrow-rectangle':
        return { padding: '32px', paddingRight: '40px' }; // Arrow shape has point at right edge
      case 'cylinder':
        return { padding: '36px', paddingTop: '44px', paddingBottom: '32px' }; // Cylinder has curved sections at top/bottom, extra top padding
      case 'parallelogram':
        return { padding: '32px', paddingLeft: '48px', paddingRight: '48px' }; // Parallelogram has angled sides
      case 'round-rectangle':
        return { padding: '32px' }; // Round rectangle has rounded corners
      case 'rectangle':
        return { padding: '32px' }; // Standard rectangle
      case 'comment':
        return { padding: '16px' };
      default:
        return { padding: '32px' };
    }
  })();
  // Parse dimensions from CSS strings to numbers for SVG
  const parseDimension = (dim: string) => parseInt(dim.replace('px', '')) || 260;
  const shapeWidth = parseDimension(shapeDimensions.width as string);
  const shapeHeight = parseDimension(shapeDimensions.minHeight as string);

  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        position: 'relative',
        width: shapeDimensions.width,
        height: shapeDimensions.minHeight,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* SVG Shape */}
      {isSvgShape && (
        <Shape
          type={shape as any}
          width={shapeWidth}
          height={shapeHeight}
          fill={selected ? '#f8fafc' : '#ffffff'}
          stroke={selected ? '#2563eb' : '#e5e7eb'}
          strokeWidth={selected ? 2 : 1}
          fillOpacity={1}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 0,
          }}
        />
      )}

      {/* Comment shape (special case) */}
      {shape === 'comment' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: shapeDimensions.width,
            height: shapeDimensions.minHeight,
            background: 'rgba(255, 255, 255, 0.8)',
            border: selected ? '2px solid #2563eb' : '1px solid #e5e7eb',
            borderRadius: '8px',
            zIndex: 0,
          }}
        />
      )}

      {node.metadata?.ghosted && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '12px',
            zIndex: 3,
            background: 'rgba(17, 24, 39, 0.55)',
            color: '#f9fafb',
            padding: '4px 8px',
            borderRadius: '9999px',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            pointerEvents: 'none',
          }}
        >
          To be deleted
        </div>
      )}
      {/* State indicators - only show for unbuilt nodes (not comments) */}
      {effectiveState === 'unbuilt' && shape !== 'comment' && (
        <div style={{
          position: 'absolute',
          top: (() => {
            switch (shape) {
              case 'circle': return '50px';
              case 'triangle': return '60px';
              case 'diamond': return '48px';
              case 'hexagon': return '32px';
              case 'cylinder': return '44px';
              case 'parallelogram': return '32px';
              case 'arrow-rectangle': return '32px';
              default: return '32px';
            }
          })(),
          right: (() => {
            switch (shape) {
              case 'circle': return '40px';
              case 'triangle': return '32px';
              case 'diamond': return '56px';
              case 'hexagon': return '32px';
              case 'cylinder': return '36px';
              case 'parallelogram': return '48px';
              case 'arrow-rectangle': return '40px';
              default: return '32px';
            }
          })(),
          width: indicatorSize,
          height: indicatorSize,
          borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          zIndex: 2,
        }} />
      )}

      {/* Resize handles - only for comment nodes */}
      {shape === 'comment' && (
        <NodeResizer
          color="#3b82f6"
          isVisible={selected}
          minWidth={200}
          minHeight={100}
          onResize={(event, params) => {
            // Update the node's width/height properties during resize for real-time visual feedback
            const newWidth = params.width;
            const newHeight = params.height;

            // Update the properties with new dimensions during resize
            const updatedProperties = [
              ...(node.properties || []).filter(p => p.id !== 'width' && p.id !== 'height'),
              { id: 'width', value: newWidth },
              { id: 'height', value: newHeight }
            ];

            // Update the node data to trigger re-render with new dimensions
            data.node = { ...node, properties: updatedProperties };
            data.properties = updatedProperties;
          }}
          onResizeEnd={(event, params) => {
            // Update the node dimensions in properties when resize ends
            const newWidth = params.width;
            const newHeight = params.height;

            // Update the properties with new dimensions
            const updatedNode = {
              ...node,
              properties: [
                ...(node.properties || []).filter(p => p.id !== 'width' && p.id !== 'height'),
                { id: 'width', value: newWidth },
                { id: 'height', value: newHeight }
              ]
            };

            // Update the node in the store
            updateNode(node.id, updatedNode);
          }}
        />
      )}

      {/* Content wrapper */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: shape === 'comment' ? 'visible' : 'hidden',
          ...contentPadding,
        }}
      >
        {/* Main content area */}
        <div style={{ flex: shape === 'comment' ? 'none' : 1 }}>
          {/* Title */}
          <div
            style={{
              fontSize: shape === 'comment' ? '36px' : '16px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '12px',
              lineHeight: '1.4',
              wordBreak: 'break-word',
            }}
          >
            {typeof node.title === 'string' ? (searchQuery && searchOpen ? highlightText(node.title) : node.title) : node.title}
          </div>
          
          {/* Prompt preview - always show at all zoom levels */}
          <div
            style={{
              fontSize: shape === 'comment' ? '24px' : '13px',
              color: '#6b7280',
              marginBottom: '16px',
              lineHeight: '1.4',
              ...(shape === 'comment' ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }),
              wordBreak: 'break-word',
              flex: shape === 'comment' ? 'none' : 1,
            }}
            title={node.prompt}
          >
            {shape === 'comment' ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={commentMarkdownComponents}
                >
                  {typeof node.prompt === 'string' ? node.prompt : String(node.prompt || '')}
                </ReactMarkdown>
              </div>
            ) : (
              typeof node.prompt === 'string' ? (searchQuery && searchOpen ? highlightText(node.prompt) : node.prompt) : node.prompt
            )}
          </div>
        </div>

      </div>

      {/* Four visual connectors (top/right/bottom/left) - hide for comment nodes */}
      {shape !== 'comment' && (
        <>
          {/* Top */}
          <Handle id="top" type="target" position={Position.Top} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: '#ffffff', width: handleSize, height: handleSize, border: '1px solid #9ca3af', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }} />
          <Handle id="top" type="source" position={Position.Top} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: 'transparent', width: handleSize, height: handleSize, border: '1px solid transparent', borderRadius: '50%' }} />
          {/* Right */}
          <Handle id="right" type="target" position={Position.Right} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ 
              background: '#ffffff', 
              width: handleSize, 
              height: handleSize, 
              border: '1px solid #9ca3af', 
              borderRadius: '50%', 
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              ...(shape === 'parallelogram' ? { top: '35%' } : {})
            }} />
          <Handle id="right" type="source" position={Position.Right} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ 
              background: 'transparent', 
              width: handleSize, 
              height: handleSize, 
              border: '1px solid transparent', 
              borderRadius: '50%',
              ...(shape === 'parallelogram' ? { top: '35%' } : {})
            }} />
          {/* Bottom */}
          <Handle id="bottom" type="target" position={Position.Bottom} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: '#ffffff', width: handleSize, height: handleSize, border: '1px solid #9ca3af', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }} />
          <Handle id="bottom" type="source" position={Position.Bottom} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: 'transparent', width: handleSize, height: handleSize, border: '1px solid transparent', borderRadius: '50%' }} />
          {/* Left */}
          <Handle id="left" type="target" position={Position.Left} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ 
              background: '#ffffff', 
              width: handleSize, 
              height: handleSize, 
              border: '1px solid #9ca3af', 
              borderRadius: '50%', 
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              ...(shape === 'parallelogram' ? { top: '65%' } : {})
            }} />
          <Handle id="left" type="source" position={Position.Left} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ 
              background: 'transparent', 
              width: handleSize, 
              height: handleSize, 
              border: '1px solid transparent', 
              borderRadius: '50%',
              ...(shape === 'parallelogram' ? { top: '65%' } : {})
            }} />
        </>
      )}
    </div>
  );
}

function GraphCanvas() {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Track nodes being dragged locally to avoid overwriting their position from incoming graph updates
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isAutoLayouting, setIsAutoLayouting] = useState(false);

  // Helper lines functionality
  const { rebuildIndex, updateHelperLines, HelperLines } = useHelperLines();

  // Copy-paste functionality
  const { cut, copy, paste, bufferedNodes, bufferedEdges } = useCopyPaste();

  // Custom onNodesChange that integrates helper lines
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nodes) => {
        const updatedChanges = updateHelperLines(changes, nodes);
        return applyNodeChanges(updatedChanges, nodes);
      });
    },
    [setNodes, updateHelperLines],
  );

  // Get optimistic operations flag from store to prevent real-time updates during local operations


  const { optimisticOperationsActive, setOptimisticOperationsActive, updateNode } = useProjectStore();
  // Multi-selection lives in the global store so sidebar can reflect it
  const {
    setSelectedNode,
    selectedNodeId,
    selectedNode,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedEdge,
    selectedEdgeIds,
    setSelectedEdgeIds,
    buildEntireGraph,
    isBuildingGraph,
    baseGraph,
    setBaseGraph,
    loadBaseGraph
  } = useProjectStore();
  // Tool modes: 'select', 'pan', 'add-node', 'comment'
  const [currentTool, setCurrentTool] = useState<'select' | 'pan' | 'add-node' | 'comment'>('select');
  // Comment creation drag state
  const [isCreatingComment, setIsCreatingComment] = useState(false);
  const [commentDragStart, setCommentDragStart] = useState<{ x: number; y: number } | null>(null);
  const [commentDragEnd, setCommentDragEnd] = useState<{ x: number; y: number } | null>(null);
  // Viewport transform for converting flow coords <-> screen coords
  const viewport = useViewport();
  // Use the store for graph data
  const {
    graph,
    graphLoading: loading,
    graphError: error,
    refreshGraph,
    refreshGraphStates,
    reconcileGraphRefresh,
    connectToGraphEvents,
    disconnectFromGraphEvents,
    deleteNode,
    loadGraphs,
    // search state
    searchResults,
    searchActiveIndex,
    searchOpen,
  } = useProjectStore();


  const { suppressSSE } = useProjectStore.getState();
  const layersSidebarOpen = useProjectStore((s) => s.layersSidebarOpen);
  const setLayersSidebarOpen = useProjectStore((s) => s.setLayersSidebarOpen);

  // Edge visual styles
  const defaultEdgeStyle = {
    stroke: '#9ca3af',
    strokeWidth: 2,
    opacity: 0.8,
  } as const;
  const selectedEdgeStyle = {
    stroke: '#3b82f6',
    strokeWidth: 4,
    opacity: 1,
  } as const;
  const unbuiltEdgeStyle = {
    stroke: '#ef4444',  // Highlight updated edges
    strokeWidth: 3,
    opacity: 0.9,
    strokeLinecap: 'round' as const,
  } as const;

  type EdgeShape = 'solid' | 'dotted';
  const DEFAULT_EDGE_SHAPE: EdgeShape = 'solid';

  const applyEdgeShapeToStyle = useCallback((style: any, shape: EdgeShape | undefined) => {
    const nextStyle = { ...style } as any;
    if (shape === 'dotted') {
      nextStyle.strokeDasharray = '8,8';
    } else if ('strokeDasharray' in nextStyle) {
      delete nextStyle.strokeDasharray;
    }
    return nextStyle;
  }, []);

  const resolveEdgeShape = useCallback((edgeLike: any): EdgeShape => {
    if (!edgeLike) return DEFAULT_EDGE_SHAPE;
    const directShape = (edgeLike as any)?.shape;
    if (directShape === 'dotted' || directShape === 'solid') return directShape;
    const dataShape = (edgeLike as any)?.data?.shape;
    if (dataShape === 'dotted' || dataShape === 'solid') return dataShape;

    const id = (edgeLike as Edge)?.id || (edgeLike as any)?.id;
    const source = (edgeLike as Edge)?.source || (edgeLike as any)?.source;
    const target = (edgeLike as Edge)?.target || (edgeLike as any)?.target;

    const matched = (graph?.edges || []).find((ge: any) => {
      if (id && ge.id === id) return true;
      return ge.source === source && ge.target === target;
    });
    const matchedShape = (matched as any)?.shape;
    return matchedShape === 'dotted' || matchedShape === 'solid' ? matchedShape : DEFAULT_EDGE_SHAPE;
  }, [graph]);

  // Helper to derive an arrow marker matching the current edge style
  // Increase marker size for better visibility
  const makeArrowForStyle = (style: any) => ({
    type: MarkerType.ArrowClosed as const,
    color: style?.stroke || '#9ca3af',
    width: 24,
    height: 24,
  });

  // Access React Flow instance for programmatic viewport control
  const reactFlow = useReactFlow();
  // Auth removed; define placeholder to avoid TS errors
  const user: any = null;

  // Compute focus rectangles in graph coordinates (no viewport dependency to avoid lag)
  const focusRects = useMemo(() => {
    if (!searchOpen) return [] as Array<{ left: number; top: number; width: number; height: number }>;
    const ids = Array.from(new Set((Array.isArray(searchResults) ? searchResults : []).map((r: any) => r.nodeId).filter(Boolean)));
    if (ids.length === 0) return [];
    const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
    for (const id of ids) {
      const rfNode = nodes.find((n) => n.id === id);
      if (!rfNode) continue;
      const nodeW = (rfNode.width ?? 260);
      const nodeH = (rfNode.height ?? 160);
      rects.push({ left: rfNode.position.x, top: rfNode.position.y, width: nodeW, height: nodeH });
    }
    return rects;
  }, [nodes, searchResults, searchOpen]);

  // Auto layout all nodes using ELK and persist positions
  const autoLayout = useCallback(async () => {
    if (!graph) return;
    setIsAutoLayouting(true);
    setOptimisticOperationsActive(true);
    try {
      const elk = new ELK();
      // Add buffer space around each node to avoid tight packing
      const nodeMarginX = 48; // horizontal padding on each side (increased)
      const nodeMarginY = 48; // vertical padding on each side (increased)
      // Build ELK nodes with measured or default sizes
      const rfNodeMap = new Map(nodes.map(n => [n.id, n]));
      const elkNodes = graph.nodes.map(n => {
        const rf = rfNodeMap.get(n.id);
        const width = (rf?.width ?? 260) + nodeMarginX * 2;
        const height = (rf?.height ?? 160) + nodeMarginY * 2;
        return { id: n.id, width, height } as any;
      });
      const seen = new Set<string>();
      const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
      if (Array.isArray((graph as any).edges)) {
        (graph as any).edges.forEach((e: any, i: number) => {
          const id = `${e.source}-${e.target}`;
          if (!seen.has(id)) {
            elkEdges.push({ id: `e-${i}-${id}`, sources: [e.source], targets: [e.target] });
            seen.add(id);
          }
        });
      }

      const elkGraph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          // Consider node sizes and reduce crossings
          'elk.layered.layering.strategy': 'LONGEST_PATH',
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.layered.thoroughness': '7',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          'elk.edgeRouting': 'ORTHOGONAL',
          // Spacing for less overlap and clearer edges (increased)
          'elk.layered.spacing.nodeNodeBetweenLayers': '120',
          'elk.layered.spacing.edgeEdgeBetweenLayers': '36',
          'elk.spacing.nodeNode': '72',
          'elk.spacing.edgeNode': '48',
          'elk.spacing.edgeEdge': '36',
          'elk.spacing.componentComponent': '96',
          'elk.spacing.portPort': '12',
          'elk.spacing.portNode': '12',
          'elk.spacing.labelNode': '12',
          'elk.layered.mergeEdges': 'true',
        },
        children: elkNodes,
        edges: elkEdges,
      } as any;

      const res = await elk.layout(elkGraph);
      const posMap = new Map<string, { x: number; y: number }>();
      (res.children || []).forEach((c: any) => {
        posMap.set(c.id, { x: Math.round(c.x || 0), y: Math.round(c.y || 0) });
      });

      // Update RF nodes immediately for feedback
      setNodes(prev => prev.map(n => {
        const p = posMap.get(n.id);
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }));

      // Persist to graph (single PUT)
      const updatedGraph: Graph = {
        ...graph,
        nodes: graph.nodes.map(n => {
          const p = posMap.get(n.id);
          return p ? { ...n, position: { x: p.x, y: p.y, z: 0 } } : n;
        }),
      } as Graph;

      await useProjectStore.getState().syncGraph(updatedGraph);

      // Also update local store explicitly to avoid races
      useProjectStore.setState({ graph: updatedGraph });
      suppressSSE?.(1000);
    } catch (e) {
      console.error('Auto layout failed:', e);
    } finally {
      setOptimisticOperationsActive(false);
      setIsAutoLayouting(false);
    }
  }, [graph, nodes, setNodes, setOptimisticOperationsActive, suppressSSE]);

  // Listen for global commands (from chat slash commands or elsewhere)
  useEffect(() => {
    const onAutoLayout = () => {
      // Avoid double-press while already running
      if (!isAutoLayouting) {
        void autoLayout();
      }
    };
    const onBuildGraph = () => {
      // Trigger the same action as the Build Graph button
      if (!isBuildingGraph && graph) {
        void buildEntireGraph();
      }
    };

    window.addEventListener('manta:auto-layout', onAutoLayout as EventListener);
    window.addEventListener('manta:build-graph', onBuildGraph as EventListener);
    return () => {
      window.removeEventListener('manta:auto-layout', onAutoLayout as EventListener);
      window.removeEventListener('manta:build-graph', onBuildGraph as EventListener);
    };
  }, [autoLayout, buildEntireGraph, isAutoLayouting, isBuildingGraph, graph]);

  // Generate unique node ID
  const generateNodeId = useCallback(() => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `node-${timestamp}${random}`;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCurrentTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Create a new empty node at the specified position
  const createNewNode = useCallback(async (position: { x: number; y: number }) => {
    if (!graph) return;

    const newNodeId = generateNodeId();
    const newNode: GraphNode = {
      id: newNodeId,
      title: 'New Node',
      prompt: '',
      comment: '',
      shape: 'round-rectangle',
      position: { x: position.x, y: position.y, z: 0 }
    };

    try {
      // Mark optimistic operation as in progress
      setOptimisticOperationsActive(true);

      // Set selection immediately before adding the node
      setSelectedNode(newNodeId, newNode);
      setSelectedNodeIds([newNodeId]);

      // Update local graph state immediately for instant feedback
      const updatedGraph = {
        ...graph,
        nodes: [...graph.nodes, newNode]
      };
      useProjectStore.setState({ graph: updatedGraph });

      // Create ReactFlow node and add to local state (already selected)
      const reactFlowNode: Node = {
        id: newNodeId,
        position,
        data: {
          label: newNode.title,
          node: newNode,
          properties: newNode.properties,
          baseGraph: baseGraph,
          graph: graph
        },
        type: 'custom',
        selected: true, // Node is already selected
      };
      setNodes((nds) => [...nds, reactFlowNode]);

      console.log('➕ Optimistically created new node:', newNodeId);

      // Persist update via API (real-time updates will sync)
      await updateNode(newNodeId, newNode);

      // Switch back to select tool after creating node
      setCurrentTool('select');

      console.log('✅ Successfully persisted new node to server:', newNodeId);

      // Suppress SSE for longer to avoid stale snapshot race, then clear optimistic flag
      suppressSSE?.(2000);
      setOptimisticOperationsActive(false);
    } catch (error) {
      console.error('❌ Failed to create new node:', error);
      // Remove the node from both local states if persistence failed
      setNodes((nds) => nds.filter(n => n.id !== newNodeId));
      if (graph) {
        const revertedGraph = {
          ...graph,
          nodes: graph.nodes.filter(n => n.id !== newNodeId)
        };
        useProjectStore.setState({ graph: revertedGraph });
      }

      // Clear optimistic operation flag on error (after rollback)
      setOptimisticOperationsActive(false);
    }
  }, [graph, generateNodeId, updateNode, setSelectedNode, setSelectedNodeIds, setNodes, setOptimisticOperationsActive]);

  // Create a new comment node at the specified position with custom dimensions
  const createCommentNode = useCallback(async (position: { x: number; y: number }, dimensions: { width: number; height: number }) => {
    if (!graph) return;

    const newNodeId = generateNodeId();
    const newNode: GraphNode = {
      id: newNodeId,
      title: 'Comment',
      prompt: 'Add your comment here...',
      comment: '',
      position: { x: position.x, y: position.y, z: 0 },
      properties: [
        { id: 'width', value: dimensions.width },
        { id: 'height', value: dimensions.height }
      ]
    };

    try {
      // Mark optimistic operation as in progress
      setOptimisticOperationsActive(true);

      // Set selection immediately before adding the node
      setSelectedNode(newNodeId, newNode);
      setSelectedNodeIds([newNodeId]);

      // Update local graph state immediately for instant feedback
      const updatedGraph = {
        ...graph,
        nodes: [...graph.nodes, newNode]
      };
      useProjectStore.setState({ graph: updatedGraph });

      // Create ReactFlow node and add to local state (already selected)
      const reactFlowNode: Node = {
        id: newNodeId,
        position,
        width: dimensions.width,
        height: dimensions.height,
        data: {
          label: newNode.title,
          node: newNode,
          properties: newNode.properties,
          baseGraph: baseGraph,
          graph: graph
        },
        type: 'custom',
        selected: true, // Node is already selected
      };
      setNodes((nds) => [...nds, reactFlowNode]);

      console.log('➕ Optimistically created new comment node:', newNodeId);

      // Persist update via API (real-time updates will sync)
      await updateNode(newNodeId, newNode);

      // Switch back to select tool after creating comment
      setCurrentTool('select');

      console.log('✅ Successfully persisted comment node to server:', newNodeId);

      // Suppress SSE for longer to avoid stale snapshot race, then clear optimistic flag
      suppressSSE?.(2000);
      setOptimisticOperationsActive(false);
    } catch (error) {
      console.error('❌ Failed to create comment node:', error);
      // Remove the node from both local states if persistence failed
      setNodes((nds) => nds.filter(n => n.id !== newNodeId));
      if (graph) {
        const revertedGraph = {
          ...graph,
          nodes: graph.nodes.filter(n => n.id !== newNodeId)
        };
        useProjectStore.setState({ graph: revertedGraph });
      }

      // Clear optimistic operation flag on error (after rollback)
      setOptimisticOperationsActive(false);
    }
  }, [graph, generateNodeId, updateNode, setSelectedNode, setSelectedNodeIds, setNodes, setOptimisticOperationsActive, setCurrentTool]);

  // Handle deletion of selected nodes and edges
  const handleDeleteSelected = useCallback(async (selectedNodes: Node[], selectedEdges: Edge[]) => {
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // Store original state for potential rollback
    const originalNodes = [...nodes];
    const originalEdges = [...edges];
    const originalSelectedNodeIds = [...(selectedNodeIds || [])];

    try {
      // Mark optimistic operation as in progress
      setOptimisticOperationsActive(true);

      const nodeIdsToDelete = selectedNodes.map(node => node.id);
      const baseNodeIdSet = new Set((baseGraph?.nodes || []).map((node: any) => node.id));
      const ghostNodeIds = nodeIdsToDelete.filter(id => baseNodeIdSet.has(id));
      const ghostNodeIdSet = new Set(ghostNodeIds);
      const removableNodeIds = nodeIdsToDelete.filter(id => !baseNodeIdSet.has(id));
      const removableNodeIdSet = new Set(removableNodeIds);

      // Normalize edge IDs to server format (source-target)
      const normalizedEdgeIdsToDelete = selectedEdges.map(edge => {
        if (edge.id?.startsWith('reactflow__edge-') && edge.source && edge.target) {
          return `${edge.source}-${edge.target}`;
        }
        return edge.id || (edge.source && edge.target ? `${edge.source}-${edge.target}` : '');
      }).filter(Boolean) as string[];
      const normalizedEdgeIdSet = new Set(normalizedEdgeIdsToDelete);
      const rawEdgeIdSet = new Set(selectedEdges.map(edge => edge.id));

      setNodes(prevNodes => prevNodes
        .map(node => {
          if (!ghostNodeIdSet.has(node.id)) return node;
          const currentGraphNode = (node.data as any)?.node as GraphNode | undefined;
          if (!currentGraphNode) {
            return { ...node, selected: false };
          }
          const updatedMetadata = { ...(currentGraphNode.metadata || {}), ghosted: true };
          return {
            ...node,
            selected: false,
            data: {
              ...node.data,
              node: { ...currentGraphNode, metadata: updatedMetadata },
            },
          } as Node;
        })
        .filter(node => !removableNodeIdSet.has(node.id))
      );

      setEdges(prevEdges => prevEdges.filter(edge => {
        const normalizedId = edge.id && edge.id.startsWith('reactflow__edge-') && edge.source && edge.target
          ? `${edge.source}-${edge.target}`
          : (edge.id || `${edge.source}-${edge.target}`);
        if (normalizedEdgeIdSet.has(normalizedId)) return false;
        if (rawEdgeIdSet.has(edge.id)) return false;
        if (removableNodeIdSet.has(edge.source) || removableNodeIdSet.has(edge.target)) return false;
        return true;
      }));

      // Clear selection
      setSelectedNode(null, null);
      setSelectedNodeIds([]);

      console.log('🗑️ Optimistically processed deletions', {
        ghosted: Array.from(ghostNodeIdSet),
        removed: Array.from(removableNodeIdSet),
        removedEdges: Array.from(normalizedEdgeIdSet),
      });

      // Now fetch current graph and persist changes
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const url = `${origin}/api/graph-api?graphType=current`;

      let data;
      try {
        console.log('🌐 Fetching graph from:', url);
        data = await fetch(url, {
          headers: {
            'Accept': 'application/xml, application/json',
            'Content-Type': 'application/json'
          }
        });
        console.log('📡 Fetch response status:', data.status, data.statusText);
      } catch (fetchError) {
        console.error('❌ Fetch failed:', fetchError);
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        throw new Error(`Failed to fetch graph data: ${errorMessage}`);
      }

      if (!data.ok) {
        console.error('❌ Fetch response not OK:', data.status, data.statusText);
        throw new Error(`Server returned ${data.status}: ${data.statusText}`);
      }

      let currentGraph;
      const contentType = (data.headers.get('content-type') || '').toLowerCase();
      console.log('📄 Response content type:', contentType);

      if (contentType.includes('xml')) {
        const xml = await data.text();
        currentGraph = xmlToGraph(xml);
      } else {
        const graphData = await data.json();
        currentGraph = graphData.graph || graphData;
      }

      // Apply removals/ghosting to server-side graph
      let updatedNodes = currentGraph.nodes || [];
      let updatedEdges = currentGraph.edges || [];

      if (removableNodeIds.length > 0) {
        updatedNodes = updatedNodes.filter((node: any) => !removableNodeIdSet.has(node.id));
        updatedEdges = updatedEdges.filter((edge: any) =>
          !removableNodeIdSet.has(edge.source) && !removableNodeIdSet.has(edge.target)
        );
      }

      if (ghostNodeIds.length > 0) {
        updatedNodes = updatedNodes.map((node: any) => {
          if (!ghostNodeIdSet.has(node.id)) return node;
          const existingMetadata = node.metadata && typeof node.metadata === 'object' ? node.metadata : {};
          return {
            ...node,
            metadata: {
              ...existingMetadata,
              ghosted: true,
            },
          };
        });
      }

      if (normalizedEdgeIdsToDelete.length > 0) {
        updatedEdges = updatedEdges.filter((edge: any) => {
          const normalizedId = edge.id || `${edge.source}-${edge.target}`;
          return !normalizedEdgeIdSet.has(normalizedId);
        });
      }

      // Create new graph object to ensure proper reactivity
      const updatedGraph = {
        ...currentGraph,
        nodes: updatedNodes,
        edges: updatedEdges.length > 0 ? updatedEdges : undefined
      };

      // Persist to API
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Accept-Charset': 'utf-8'
        },
        body: graphToXml(updatedGraph)
      });

      console.log('✅ Successfully persisted deletion to server');

      // Clear optimistic flag before updating store to allow graph rebuild
      setOptimisticOperationsActive(false);

      // Update local store graph to match server snapshot
      useProjectStore.setState({ graph: updatedGraph });

      // Suppress SSE briefly to avoid stale snapshot race
      suppressSSE?.(2000);

    } catch (error) {
      console.error('❌ Failed to delete selected elements:', error);

      // Revert local state on error
      setNodes(originalNodes);
      setEdges(originalEdges);
      setSelectedNodeIds(originalSelectedNodeIds);

      // Restore selection if there was one
      if (originalSelectedNodeIds.length > 0) {
        const firstNode = graph?.nodes?.find(n => n.id === originalSelectedNodeIds[0]);
        if (firstNode) {
          setSelectedNode(originalSelectedNodeIds[0], firstNode);
        }
      }

      // Clear optimistic operation flag on error (after rollback)
      setOptimisticOperationsActive(false);
    }
  }, [nodes, edges, selectedNodeIds, baseGraph, setNodes, setEdges, setSelectedNode, setSelectedNodeIds, graph, setOptimisticOperationsActive, suppressSSE]);

  // Listen for delete-selected events from copy-paste operations
  useEffect(() => {
    const onDeleteSelected = (event: CustomEvent) => {
      const { selectedNodes, selectedEdges } = event.detail;
      handleDeleteSelected(selectedNodes, selectedEdges);
    };

    window.addEventListener('manta:delete-selected', onDeleteSelected as EventListener);
    return () => {
      window.removeEventListener('manta:delete-selected', onDeleteSelected as EventListener);
    };
  }, [handleDeleteSelected]);

  // Connect to graph events for real-time updates
  useEffect(() => {
    connectToGraphEvents();
    return () => {
      disconnectFromGraphEvents();
    };
  }, [connectToGraphEvents, disconnectFromGraphEvents]);

  // Removed iframe selection message handling

  // No polling - rely on SSE for agent-initiated updates only

  // Track when graphs are loaded
  const [graphsLoaded, setGraphsLoaded] = useState(false);

  // Initialize graphs when component mounts
  useEffect(() => {
    console.log('🏁 GraphView component mounted, calling loadGraphs...');
    loadGraphs().then(() => {
      console.log('🏁 loadGraphs completed, setting graphsLoaded to true');
      setGraphsLoaded(true);
    }).catch(error => {
      console.error('❌ loadGraphs failed:', error);
      setGraphsLoaded(true); // Still set to true to avoid infinite loading
    });
  }, [loadGraphs]);

  // Handle keyboard shortcuts for deletion (Delete and Backspace keys)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field or textarea - if so, don't handle graph shortcuts
      const activeElement = document.activeElement as HTMLElement;
      const isInInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true' ||
        activeElement.closest('[contenteditable="true"]')
      );

      // Don't handle graph shortcuts if we're typing in a form element
      if (isInInput) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        console.log(`🎹 Key pressed: ${event.key}, selected nodes: ${nodes.filter(node => node.selected).length}, selected edges: ${edges.filter(edge => edge.selected).length}`);
        event.preventDefault();
        event.stopPropagation();

        // Get selected nodes and edges from ReactFlow
        const selectedNodes = nodes.filter(node => node.selected);
        const selectedEdges = edges.filter(edge => edge.selected);

        if (selectedNodes.length === 0 && selectedEdges.length === 0) {
          console.log('⚠️ No nodes or edges selected for deletion');
          return;
        }

        // Delete selected elements
        console.log(`🗑️ Deleting ${selectedNodes.length} nodes and ${selectedEdges.length} edges`);
        handleDeleteSelected(selectedNodes, selectedEdges);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, handleDeleteSelected]);

  // Keep a ref of latest nodes to avoid effect dependency on nodes (prevents loops)
  const latestNodesRef = useRef<Node[]>([]);
  // Keep a ref of latest edges to preserve selection state across rebuilds
  const latestEdgesRef = useRef<Edge[]>([]);
  // Track previous graph structure to detect property-only changes
  const prevGraphStructureRef = useRef<string>('');

  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    latestEdgesRef.current = edges;
  }, [edges]);

  // Fit view to center the graph when nodes first load
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !hasFittedRef.current) {
      // Defer to next tick to ensure layout/DOM size is ready
      setTimeout(() => {
        try {
          reactFlow.fitView({ padding: 0.2, duration: 500, includeHiddenNodes: true });
        } catch {}
      }, 0);
      hasFittedRef.current = true;
    }
    if (nodes.length === 0) {
      hasFittedRef.current = false;
    }
  }, [nodes, reactFlow]);

  // Select active search result node (no auto-pan or zoom)
  useEffect(() => {
    if (!Array.isArray(searchResults) || searchResults.length === 0) return;
    if (searchActiveIndex == null || searchActiveIndex < 0 || searchActiveIndex >= searchResults.length) return;
    // Only act while search UI is open
    const { searchOpen } = useProjectStore.getState();
    if (!searchOpen) return;
    const result = searchResults[searchActiveIndex];
    const id = result?.nodeId;
    if (!id) return;
    // Update selection for highlighting (do not pan/zoom)
    const graphNode = graph?.nodes?.find((n) => n.id === id);
    if (!graphNode) return;

    // Update selection to this node
    try {
      setSelectedNode(id, graphNode);
      setSelectedNodeIds([id]);
    } catch {}
  }, [searchResults, searchActiveIndex, searchOpen, nodes, graph, reactFlow, setSelectedNode, setSelectedNodeIds, viewport.zoom]);

  // Function to delete the graph (clear all nodes/edges via API)
  // const deleteGraph = useCallback(async () => {
  //   if (!confirm('Are you sure you want to delete the graph? This action cannot be undone.')) {
  //     return;
  //   }

  //   try {
  //     // Persist empty graph through the Graph API
  //     const response = await fetch('/api/graph-api', {
  //       method: 'PUT',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ graph: { nodes: [], edges: [] } })
  //     });
  //     if (response.ok) {
  //       // Update local store to reflect deletion
  //       useProjectStore.setState({
  //         graph: { nodes: [], edges: [] } as any,
  //         selectedNode: null,
  //         selectedNodeId: null,
  //         selectedNodeIds: []
  //       });
  //     } else {
  //       console.error('❌ Failed to delete graph');
  //     }
  //   } catch (backendError) {
  //     console.error('❌ Error deleting graph:', backendError);
  //   }
  // }, []);

  // Function to rebuild the full graph
  // const rebuildFullGraph = useCallback(async () => {
  //   if (!confirm('Are you sure you want to rebuild the entire graph? This will regenerate code for all nodes.')) {
  //     return;
  //   }

  //   setIsRebuilding(true);
  //   try {
  //     // Gather all node IDs and optimistically mark them as building
  //     try {
  //       const current = useProjectStore.getState();
  //       const g = current.graph;
  //       if (g && Array.isArray(g.nodes)) {
  //         const updatedNodes = g.nodes.map((n: any) => ({ ...n, state: 'building' }));
  //         const updatedGraph = { ...g, nodes: updatedNodes } as any;
  //         useProjectStore.setState({ graph: updatedGraph });
  //       }
  //     } catch {}

  //     const allIds = (useProjectStore.getState().graph?.nodes || []).map((n: any) => n.id);
  //     const response = await fetch('/api/agent-request/edit-graph', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         userMessage: {
  //           role: 'user',
  //           content: `Rebuild the entire graph and generate code for all ${allIds.length} nodes`,
  //           variables: {}
  //         },
  //         rebuildAll: true,
  //         selectedNodeIds: allIds
  //       }),
  //     });
      
  //     if (response.ok) {
  //       // Full graph rebuild started successfully
  //       // The graph will be automatically updated via SSE
  //       // Also refresh the preview iframe since code changed
  //       try {
  //         const { triggerRefresh } = useProjectStore.getState();
  //         triggerRefresh();
  //       } catch {}
  //     } else {
  //       console.error('❌ Failed to rebuild graph');
  //     }
  //   } catch (error) {
  //     console.error('❌ Error rebuilding graph:', error);
  //   } finally {
  //     setIsRebuilding(false);
  //   }
  // }, []);


  // Connection is managed by the store

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    // Always get the fresh node data from the current graph state
    const freshGraphNode = graph?.nodes?.find(n => n.id === node.id);
    const reactFlowNode = node.data?.node as GraphNode;

    if (!freshGraphNode) return;

    setSelectedEdge(null, null);
    setSelectedEdgeIds([]);

    // Check if shift or ctrl/cmd is pressed for multi-selection
    const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;

    if (isMultiSelect) {
      const prev = selectedNodeIds || [];
      const isSelected = prev.includes(node.id);
      if (isSelected) {
        // Remove from selection
        const newSelection = prev.filter(id => id !== node.id);
        // If this was the single selected node, clear the main selection
        if (selectedNodeId === node.id && newSelection.length === 0) {
          setSelectedNode(null, null);
        } else if (selectedNodeId === node.id && newSelection.length > 0) {
          // Set the first remaining node as the main selected node
          const firstNode = graph?.nodes?.find(n => n.id === newSelection[0]);
          if (firstNode) {
            setSelectedNode(newSelection[0], firstNode);
          }
        }
        setSelectedNodeIds(newSelection);
      } else {
        // Add to selection
        const newSelection = [...prev, node.id];
        // Set this as the main selected node if it's the first one
        if (prev.length === 0) {
          setSelectedNode(node.id, freshGraphNode);
        }
        setSelectedNodeIds(newSelection);
      }
    } else {
      // Single selection - clear multi-selection and select only this node
      setSelectedNodeIds([node.id]);
      setSelectedNode(node.id, freshGraphNode);

      // Removed iframe selection messaging
    }
  }, [setSelectedNode, graph, selectedNodeId, selectedNodeIds, setSelectedNodeIds, setSelectedEdge, setSelectedEdgeIds]);

  // Handle edge selection (with multi-select support)
  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
    // prevent parent handlers from interfering with selection rectangle
    event.preventDefault();
    event.stopPropagation();
    const graphEdge = (graph?.edges || []).find((e: any) => e.id === edge.id || `${e.source}-${e.target}` === edge.id);

    const clearNodeSelection = () => {
      setSelectedNode(null, null);
      setSelectedNodeIds([]);
    };

    if (!isMulti) {
      // Clear node selection when focusing an edge; let React Flow handle edge selection
      clearNodeSelection();
      setSelectedEdgeIds([edge.id]);
      setSelectedEdge(edge.id, graphEdge as any);
      return;
    }

    // Multi-select toggle behavior
    const next = new Set(selectedEdgeIds || []);
    if (next.has(edge.id)) {
      next.delete(edge.id);
    } else {
      next.add(edge.id);
    }
    const nextIds = Array.from(next);
    setSelectedEdgeIds(nextIds);

    if (nextIds.length === 1) {
      const singleId = nextIds[0];
      const singleGraphEdge = (graph?.edges || []).find((e: any) => e.id === singleId || `${e.source}-${e.target}` === singleId);
      setSelectedEdge(singleId, singleGraphEdge as any);
    } else {
      setSelectedEdge(null, null);
    }

    clearNodeSelection();
  }, [graph, selectedEdgeIds, setSelectedEdge, setSelectedEdgeIds, setSelectedNode, setSelectedNodeIds]);

  // Ensure edge selection visually updates immediately when selection state changes
  const onEdgesChangeWithStyle: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => {
      const updated = applyEdgeChanges(changes, eds);
      return updated.map((e) => {
        const shape = resolveEdgeShape(e);
        const isUnbuilt = isEdgeUnbuilt({ source: e.source, target: e.target }, baseGraph);
        const baseStyle = e.selected ? selectedEdgeStyle : (isUnbuilt ? unbuiltEdgeStyle : defaultEdgeStyle);
        const nextStyle = applyEdgeShapeToStyle(baseStyle, shape);
        return {
          ...e,
          style: nextStyle,
          markerEnd: makeArrowForStyle(nextStyle),
          data: { ...(e.data || {}), shape },
        };
      });
    });
  }, [setEdges, baseGraph, resolveEdgeShape, applyEdgeShapeToStyle]);

  // Process graph data and create ReactFlow nodes/edges (with auto tree layout for missing positions)
  useEffect(() => {
    const rebuild = async () => {
      console.log('🔄 Graph rebuild triggered:', { hasGraph: !!graph, hasBaseGraph: !!baseGraph, loading });

      // Skip rebuild if optimistic operations are in progress to prevent overriding local changes
      if (optimisticOperationsActive) {
        console.log('⏭️ Skipping graph rebuild due to active optimistic operations');
        return;
      }

      // Wait for both graphs to be loaded and not loading
      if (!graphsLoaded || !graph || !graph.nodes || loading) {
        console.log('⏳ Waiting for graphs to load...', { graphsLoaded, graph: !!graph, loading });
        setNodes([]);
        setEdges([]);
        return;
      }

      // Both graphs are loaded together synchronously
      console.log('✅ Rebuilding graph with data:', { nodes: graph.nodes.length, baseGraph: !!baseGraph });

      // Check if only properties changed (more efficient update)
      const currentStructure = JSON.stringify({
        nodes: graph.nodes.map(n => ({ id: n.id, title: n.title, prompt: n.prompt, position: n.position })),
        edges: graph.edges || []
      });

      const isPropertyOnlyChange = prevGraphStructureRef.current === currentStructure && latestNodesRef.current.length > 0;

      if (isPropertyOnlyChange) {
        // Only properties or baseGraph changed - update existing nodes/edges without full rebuild
        console.log('🔄 Updating node data and edge styles without full rebuild');

        // Update node payloads to reflect latest graph node data AND new baseGraph reference
        setNodes(currentNodes =>
          currentNodes.map(node => {
            const graphNode = graph.nodes.find(n => n.id === node.id);
            if (graphNode) {
              const shouldBeSelected = (selectedNodeIds && selectedNodeIds.length > 0)
                ? selectedNodeIds.includes(node.id)
                : selectedNodeId === node.id;

              return {
                ...node,
                selected: shouldBeSelected,
                data: {
                  ...node.data,
                  node: graphNode,
                  properties: graphNode.properties || [],
                  baseGraph: baseGraph, // ensure CustomNode computes state against latest base graph
                  graph: graph
                }
              };
            }
            return node;
          })
        );

        // Also refresh edge styling (built/unbuilt) against latest baseGraph
        setEdges(currentEdges =>
          currentEdges.map(e => {
            const graphEdge = (graph?.edges || []).find((edge: any) => edge.id === e.id || (`${edge.source}-${edge.target}` === e.id));
            const shape = resolveEdgeShape(graphEdge || e);
            const isUnbuilt = isEdgeUnbuilt({ source: e.source, target: e.target }, baseGraph);
            const baseStyle = e.selected ? selectedEdgeStyle : (isUnbuilt ? unbuiltEdgeStyle : defaultEdgeStyle);
            const nextStyle = applyEdgeShapeToStyle(baseStyle, shape);
            return {
              ...e,
              style: nextStyle,
              markerEnd: makeArrowForStyle(nextStyle),
              data: { ...(e.data || {}), shape },
            } as Edge;
          })
        );

        return;
      }

      // Full structure changed - proceed with full rebuild
      prevGraphStructureRef.current = currentStructure;

      // Collect positions from database if present
      let nodePositions = new Map<string, { x: number; y: number }>();
      const nodesMissingPos: string[] = [];

      graph.nodes.forEach(node => {
        if (node.position) {
          nodePositions.set(node.id, { x: node.position.x, y: node.position.y });
        } else {
          nodesMissingPos.push(node.id);
        }
      });

      // If some nodes are missing positions, compute a tree layout for them using ELK
      if (nodesMissingPos.length > 0) {
        try {
          const elk = new ELK();
          const elkNodes = graph.nodes.map(n => ({ id: n.id, width: 260, height: 160 }));
          const seen = new Set<string>();
          const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
          // From explicit edges
          if (Array.isArray((graph as any).edges)) {
            (graph as any).edges.forEach((e: any, i: number) => {
              const id = `${e.source}-${e.target}`;
              if (!seen.has(id)) {
                elkEdges.push({ id: `e-${i}-${id}`, sources: [e.source], targets: [e.target] });
                seen.add(id);
              }
            });
          }

          const elkGraph = {
            id: 'root',
            layoutOptions: {
              'elk.algorithm': 'layered',
              'elk.direction': 'DOWN',
              'elk.layered.spacing.nodeNodeBetweenLayers': '100',
              'elk.spacing.nodeNode': '80',
            },
            children: elkNodes,
            edges: elkEdges,
          } as any;

          const layout = await elk.layout(elkGraph);
          if (Array.isArray(layout.children)) {
            layout.children.forEach((c: any) => {
              if (typeof c.x === 'number' && typeof c.y === 'number') {
                // Only assign auto-layout positions for nodes that lacked one
                if (!nodePositions.has(c.id)) {
                  nodePositions.set(c.id, { x: Math.round(c.x), y: Math.round(c.y) });
                }
              }
            });
          }
        } catch (e) {
          console.warn('⚠️ ELK layout failed, falling back to simple grid:', e);
          // Simple fallback: place missing nodes in a grid below existing ones
          let col = 0, row = 0;
          const gapX = 320, gapY = 220;
          nodesMissingPos.forEach((id) => {
            nodePositions.set(id, { x: col * gapX, y: 400 + row * gapY });
            col++;
            if (col >= 4) { col = 0; row++; }
          });
        }
      }

      // Current positions map from latest nodes to preserve positions while dragging
      const currentPositions = new Map<string, { x: number; y: number }>();
      for (const n of latestNodesRef.current) currentPositions.set(n.id, n.position as any);

      // Sort nodes so comment nodes appear behind regular nodes (comments first in DOM)
      const sortedNodes = [...graph.nodes].sort((a, b) => {
        const aIsComment = (a as any).shape === 'comment';
        const bIsComment = (b as any).shape === 'comment';
        if (aIsComment && !bIsComment) return -1; // comments first
        if (!aIsComment && bIsComment) return 1;  // regular nodes after
        return 0; // maintain original order for same types
      });

      // Convert graph nodes to ReactFlow nodes (preserve position if dragging)
      const reactFlowNodes: Node[] = sortedNodes.map((node) => {
        const isDragging = draggingNodeIdsRef.current.has(node.id);
        const position = isDragging
          ? (currentPositions.get(node.id) || nodePositions.get(node.id) || { x: 0, y: 0 })
          : (nodePositions.get(node.id) || { x: 0, y: 0 });

        const backgroundColor = node.properties?.find(p => p.id === 'background-color')?.value;
        // Extract width and height from properties for ReactFlow node
        const widthProp = node.properties?.find(p => p.id === 'width');
        const heightProp = node.properties?.find(p => p.id === 'height');
        const nodeWidth = widthProp?.value;
        const nodeHeight = heightProp?.value;

        // Create ReactFlow node with styling
        const rfNode: any = {
          id: node.id,
          position,
          data: {
            label: node.title,
            node: node,
            properties: node.properties || [],
            baseGraph: baseGraph,
            graph: graph,
            updateNode: updateNode
          },
          type: 'custom',
          selected: (selectedNodeIds && selectedNodeIds.length > 0) ? selectedNodeIds.includes(node.id) : selectedNodeId === node.id,
        };

        // Set width and height on ReactFlow node if available (for resizable nodes)
        if (nodeWidth) rfNode.width = nodeWidth;
        if (nodeHeight) rfNode.height = nodeHeight;

        return rfNode;
      });

      // Create edges from graph data
      const reactFlowEdges: Edge[] = [];
      // Deduplicate edges regardless of direction (A-B equals B-A),
      // but keep the original orientation and handle anchors of the first occurrence.
      const addedSymmetric = new Set<string>();

      if ((graph as any).edges && (graph as any).edges.length > 0) {
        const previouslySelectedEdges = new Set(
          (latestEdgesRef.current || [])
            .filter((e) => e.selected)
            .map((e) => e.id)
        );
        // Build a quick position map for fallback handle inference
        const posMap = new Map<string, { x: number; y: number }>();
        (reactFlowNodes || []).forEach((n) => posMap.set(n.id, { x: n.position.x, y: n.position.y }));

        (graph as any).edges.forEach((edge: any) => {
          const src = String(edge.source);
          const tgt = String(edge.target);
          const symKey = [src, tgt].sort().join('~');
          if (!addedSymmetric.has(symKey)) {
            // Infer handle anchors if missing, based on node relative positions (one-time for legacy edges)
            let sourceHandle = (edge as any).sourceHandle as string | undefined;
            let targetHandle = (edge as any).targetHandle as string | undefined;
            if (!sourceHandle || !targetHandle) {
              const sp = posMap.get(src);
              const tp = posMap.get(tgt);
              if (sp && tp) {
                const dx = tp.x - sp.x;
                const dy = tp.y - sp.y;
                if (!sourceHandle) {
                  if (Math.abs(dx) >= Math.abs(dy)) {
                    sourceHandle = dx >= 0 ? 'right' : 'left';
                  } else {
                    sourceHandle = dy >= 0 ? 'bottom' : 'top';
                  }
                }
                if (!targetHandle) {
                  if (Math.abs(dx) >= Math.abs(dy)) {
                    targetHandle = dx >= 0 ? 'left' : 'right';
                  } else {
                    targetHandle = dy >= 0 ? 'top' : 'bottom';
                  }
                }
              }
            }
              
          // Check if edge is unbuilt
          const isUnbuilt = isEdgeUnbuilt({ source: edge.source, target: edge.target }, baseGraph);
          const shape = resolveEdgeShape(edge);

          // Check if either connected node is a comment to set edge z-index
          const sourceNode = sortedNodes.find(n => n.id === edge.source);
          const targetNode = sortedNodes.find(n => n.id === edge.target);
          const connectsToComment = (sourceNode as any)?.shape === 'comment' || (targetNode as any)?.shape === 'comment';

          const baseStyle = previouslySelectedEdges.has(edge.id)
            ? selectedEdgeStyle
            : (isUnbuilt ? unbuiltEdgeStyle : defaultEdgeStyle);
          const style = applyEdgeShapeToStyle(baseStyle, shape);

          reactFlowEdges.push({
            id: edge.id,
            source: src,
            target: tgt,
            sourceHandle,
            targetHandle,
            type: 'default',
            style,
            markerEnd: makeArrowForStyle(style),
            interactionWidth: 24,
            selected: previouslySelectedEdges.has(edge.id),
            zIndex: connectsToComment ? -1 : 1,
            data: { shape },
          });
          addedSymmetric.add(symKey);
          }
        });
      }

      // All edges are now handled by the graph.edges array above

      // Create visual edges from graph data

      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);

      // Select root node by default only once on initial load if nothing is selected
      // Avoid auto-selecting again after user clears the selection
      // if (!selectedNodeId && (!selectedNodeIds || selectedNodeIds.length === 0) && reactFlowNodes.length > 0 && !hasAutoSelectedRef.current) {
      //   const root = reactFlowNodes[0];
      //   setSelectedNode(root.id, graph.nodes.find(n => n.id === root.id) as any);
      //   hasAutoSelectedRef.current = true;
      // }
    };
    rebuild();
  }, [graphsLoaded, graph, baseGraph, setNodes, setEdges, selectedNodeId, selectedNodeIds, optimisticOperationsActive]);

  // Update node selection without re-rendering the whole graph
  // const hasAutoSelectedRef = useRef(false);
  // useEffect(() => {
  //   setNodes((nds) =>
  //     nds.map((node) => ({
  //       ...node,
  //       selected: (selectedNodeIds && selectedNodeIds.length > 0) ? selectedNodeIds.includes(node.id) : selectedNodeId === node.id,
  //     }))
  //   );
  // }, [selectedNodeId, selectedNodeIds, setNodes]);

  // No realtime broadcast integration; positions update via API/SSE refresh

  // Helper function to infer handle positions based on node positions
  const inferHandles = (sourceId: string, targetId: string, nodes: Node[]) => {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);
    if (!sourceNode || !targetNode) return { sourceHandle: undefined, targetHandle: undefined };

    const sp = sourceNode.position;
    const tp = targetNode.position;
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;

    let sourceHandle: string;
    let targetHandle: string;

    if (Math.abs(dx) >= Math.abs(dy)) {
      sourceHandle = dx >= 0 ? 'right' : 'left';
      targetHandle = dx >= 0 ? 'left' : 'right';
    } else {
      sourceHandle = dy >= 0 ? 'bottom' : 'top';
      targetHandle = dy >= 0 ? 'top' : 'bottom';
    }

    return { sourceHandle, targetHandle };
  };

  const onConnect = useCallback(async (params: Connection) => {
    // Infer handles based on node positions if not provided
    const { sourceHandle: inferredSourceHandle, targetHandle: inferredTargetHandle } = inferHandles(
      params.source!,
      params.target!,
      nodes
    );

    // Store the new edge for potential rollback
    const shape: EdgeShape = DEFAULT_EDGE_SHAPE;
    const styledUnbuilt = applyEdgeShapeToStyle(unbuiltEdgeStyle, shape);

    const newEdge = {
      id: `${params.source}-${params.target}`,
      source: params.source!,
      target: params.target!,
      sourceHandle: params.sourceHandle || inferredSourceHandle,
      targetHandle: params.targetHandle || inferredTargetHandle,
      type: 'default' as const,
      style: styledUnbuilt,
      markerEnd: makeArrowForStyle(styledUnbuilt),
      interactionWidth: 24,
      selected: false,
      data: { shape },
    };

    // Generate unique operation ID for tracking optimistic state
    const operationId = `connect-${Date.now()}-${Math.random()}`;

    try {
      // Mark optimistic operation as in progress
      setOptimisticOperationsActive(true);

    // Prevent duplicates (either direction)
    const existsLocally = (latestEdgesRef.current || []).some(e =>
      (e.source === newEdge.source && e.target === newEdge.target) ||
      (e.source === newEdge.target && e.target === newEdge.source)
    );
    if (existsLocally || newEdge.source === newEdge.target) {
      setOptimisticOperationsActive(false);
      return;
    }

    // First add the edge to local ReactFlow state for immediate feedback with correct styling
    const customEdge: Edge = {
      id: newEdge.id,
      source: newEdge.source,
      target: newEdge.target,
      sourceHandle: newEdge.sourceHandle,
      targetHandle: newEdge.targetHandle,
      type: 'default',
      style: newEdge.style,
      markerEnd: newEdge.markerEnd,
      interactionWidth: newEdge.interactionWidth,
      selected: false,
      data: { shape },
    };
    setEdges((eds) => {
      if (eds.some(e => (e.source === customEdge.source && e.target === customEdge.target) || (e.source === customEdge.target && e.target === customEdge.source))) {
        return eds;
      }
      return [...eds, customEdge];
    });

      console.log('🔗 Optimistically connected nodes:', params.source, '->', params.target);

      // Then persist to the graph API
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const url = `${origin}/api/graph-api?graphType=current`;

      // Get current graph data (accept both XML and JSON)
      const data = await fetch(url, {
        headers: {
          'Accept': 'application/xml, application/json',
          'Content-Type': 'application/json'
        }
      });

      let currentGraph;
      const contentType = (data.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('xml')) {
        const xml = await data.text();
        currentGraph = xmlToGraph(xml);
      } else {
        const graphData = await data.json();
        currentGraph = graphData.graph || graphData;
      }

      // Create new edge for server
      const serverEdge = {
        id: `${params.source}-${params.target}`,
        source: params.source,
        target: params.target,
        role: 'links-to',
        sourceHandle: newEdge.sourceHandle,
        targetHandle: newEdge.targetHandle,
        shape,
      };

      // Add edge to graph if not existing (either direction)
      const updatedEdges = [...(currentGraph.edges || [])];
      const existsOnServer = updatedEdges.some((e: any) =>
        (e.source === serverEdge.source && e.target === serverEdge.target) ||
        (e.source === serverEdge.target && e.target === serverEdge.source)
      );
      if (!existsOnServer) {
        updatedEdges.push(serverEdge);
      }

      // Create new graph object to ensure proper reactivity
      const updatedGraph = {
        ...currentGraph,
        edges: updatedEdges
      };

      // Persist to API
      await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Accept-Charset': 'utf-8'
        },
        body: graphToXml(updatedGraph)
      });

      console.log('✅ Successfully persisted connection to server');

      // Clear optimistic flag before updating store to allow graph rebuild
      setOptimisticOperationsActive(false);

      // Update local store graph to match server snapshot
      useProjectStore.setState({ graph: updatedGraph });

      // Suppress SSE briefly to avoid stale snapshot race
      suppressSSE?.(2000);
    } catch (error) {
      console.error('❌ Failed to create connection:', error);
      // Remove the edge from local state if persistence failed
      setEdges((eds) => eds.filter(e => !(e.source === params.source && e.target === params.target)));

      // Clear optimistic operation flag on error (after rollback)
      setOptimisticOperationsActive(false);
    }
  }, [setEdges, setOptimisticOperationsActive, nodes, suppressSSE, unbuiltEdgeStyle]);

  // Throttle position broadcasts to prevent spam
  const lastPositionBroadcast = useRef<{ [nodeId: string]: number }>({});
  const POSITION_BROADCAST_THROTTLE = 50; // Broadcast every 50ms max for smooth real-time

  // Handle continuous node position changes during drag
  const onNodeDragStart = useCallback((event: any, node: Node) => {
    const graphNode = node.data?.node as GraphNode;
    if (!graphNode) return;
    // Mark all currently selected nodes as dragging to preserve their live positions
    const selectedIds = (latestNodesRef.current || [])
      .filter((n) => n.selected)
      .map((n) => n.id);
    if (selectedIds.length > 0) {
      for (const id of selectedIds) draggingNodeIdsRef.current.add(id);
    } else {
      draggingNodeIdsRef.current.add(graphNode.id);
    }
  }, []);

  const onNodeDrag = useCallback((event: any, node: Node) => {
    // No-op for realtime broadcast; final position persisted on drag stop
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;
      const now = Date.now();
      const lastBroadcast = lastPositionBroadcast.current[graphNode.id] || 0;
      if (now - lastBroadcast >= POSITION_BROADCAST_THROTTLE) {
        lastPositionBroadcast.current[graphNode.id] = now;
      }
    } catch {}
  }, []);

  // Handle final node position changes (drag stop) - ensure final persistence
  const onNodeDragStop = useCallback(async (event: any, node: Node) => {
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;

      // Determine which nodes to persist: all currently selected, or the dragged node as a fallback
      const selectedIds = (latestNodesRef.current || [])
        .filter((n) => n.selected)
        .map((n) => n.id);
      const idsToPersist = selectedIds.length > 0 ? selectedIds : [graphNode.id];

      // Persist positions for all affected nodes based on their current ReactFlow positions
      for (const id of idsToPersist) {
        const rfNode = latestNodesRef.current.find((n) => n.id === id);
        if (!rfNode) continue;
        try {
          await updateNode(id, {
            position: { x: rfNode.position.x, y: rfNode.position.y, z: 0 },
          });
        } catch (e) {
          console.warn(`⚠️ Final position update failed for ${id}:`, e);
        }
      }
    } catch (error) {
      console.error('Error saving final node position(s):', error);
    }
    // Release drag locks for all selected nodes (or the primary as fallback)
    const selectedIds = (latestNodesRef.current || [])
      .filter((n) => n.selected)
      .map((n) => n.id);
    const idsToClear = selectedIds.length > 0 ? selectedIds : [node.id];
    for (const id of idsToClear) draggingNodeIdsRef.current.delete(id);

    // Rebuild helper lines spatial index after drag
    rebuildIndex(nodes);
  }, [updateNode, rebuildIndex, nodes]);

  // Handle background mouse down for node creation
  const onPaneMouseDown = useCallback((event: ReactMouseEvent) => {
    // Only start selection on left mouse button
    if (event.button !== 0) return;
    // Ignore clicks that originate from nodes, edges, or handles
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.react-flow__edge') || target.closest('.react-flow__handle')) return;

    if (currentTool === 'add-node') {
      // Convert screen coordinates to flow coordinates
      const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Center the node at mouse position (node size is 260x160)
      const centeredPosition = {
        x: flowPosition.x - 130, // Half of node width (260/2)
        y: flowPosition.y - 80   // Half of node height (160/2)
      };
      createNewNode(centeredPosition);
      event.preventDefault();
      return;
    }

    if (currentTool === 'comment') {
      // Start comment creation drag
      const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setCommentDragStart(flowPosition);
      setCommentDragEnd(flowPosition);
      setIsCreatingComment(true);
      event.preventDefault();
      return;
    }

    event.preventDefault();
  }, [currentTool, reactFlow, createNewNode]);

  // Handle mouse move for comment drag selection
  const onPaneMouseMove = useCallback((event: ReactMouseEvent) => {
    if (isCreatingComment && commentDragStart) {
      const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setCommentDragEnd(flowPosition);
    }
  }, [isCreatingComment, commentDragStart, reactFlow]);

  // Handle mouse up for comment creation
  const onPaneMouseUp = useCallback(async (event: ReactMouseEvent) => {
    if (isCreatingComment && commentDragStart && commentDragEnd) {
      // Calculate the bounds of the comment
      const minX = Math.min(commentDragStart.x, commentDragEnd.x);
      const maxX = Math.max(commentDragStart.x, commentDragEnd.x);
      const minY = Math.min(commentDragStart.y, commentDragEnd.y);
      const maxY = Math.max(commentDragStart.y, commentDragEnd.y);

      const width = Math.max(maxX - minX, 400); // Minimum width
      const height = Math.max(maxY - minY, 250); // Minimum height

      // Create the comment node
      await createCommentNode({ x: minX, y: minY }, { width, height });

      // Reset drag state
      setIsCreatingComment(false);
      setCommentDragStart(null);
      setCommentDragEnd(null);
    }
  }, [isCreatingComment, commentDragStart, commentDragEnd, reactFlow, createCommentNode]);

  // Node types for ReactFlow
  const nodeTypes = {
    custom: CustomNode,
  };

  if (loading) {
    return null;
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100%',
        fontSize: '16px',
        color: '#ff4d4f',
        gap: '16px'
      }}>
        <div>⚠️ {error}</div>
        <button
          onClick={refreshGraph}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }


    return (
    <div
      id="graph-view-container"
      style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', position: 'relative' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChangeWithStyle}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
        connectionMode={ConnectionMode.Loose}
        edgesFocusable={true}
        /* Miro-like trackpad behavior: two-finger pan, pinch to zoom */
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomOnPinch={true}
        /* Dynamic pan behavior based on tool mode */
        panOnDrag={currentTool === 'pan' ? [0, 2] : [2]} // Left mouse pan in pan mode, right mouse always pans
        selectionOnDrag={currentTool === 'select'}
        onMouseDown={onPaneMouseDown}
        onMouseMove={onPaneMouseMove}
        onMouseUp={onPaneMouseUp}
        colorMode="dark"
        nodesDraggable={true}
        nodesConnectable={currentTool === 'select'}
        elementsSelectable={true}
        deleteKeyCode={[]}
      >
        <MiniMap nodeComponent={MinimapNode} />
        <Controls />
        <Background color="#374151" gap={20} />
        <HelperLines />
      </ReactFlow>

      {/* Focus overlay: fade everything except all found nodes (when search is open) */}
      {focusRects.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 900 }}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <mask id="graph-focus-holes-mask">
                {/* Start fully visible (white), then punch holes (black) where found nodes are */}
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
                  {focusRects.map((r, i) => (
                    <rect
                      key={i}
                      x={r.left}
                      y={r.top}
                      width={r.width}
                      height={r.height}
                      rx={0}
                      ry={0}
                      fill="black"
                    />
                  ))}
                </g>
              </mask>
            </defs>
            {/* Overlay rectangle uses the mask so holes are transparent */}
            <rect x="0" y="0" width="100%" height="100%" fill="rgba(255,255,255,0.55)" mask="url(#graph-focus-holes-mask)" />
          </svg>
        </div>
      )}

      {/* Comment drag selection overlay */}
      {isCreatingComment && commentDragStart && commentDragEnd && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 950 }}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              <rect
                x={Math.min(commentDragStart.x, commentDragEnd.x)}
                y={Math.min(commentDragStart.y, commentDragEnd.y)}
                width={Math.abs(commentDragEnd.x - commentDragStart.x)}
                height={Math.abs(commentDragEnd.y - commentDragStart.y)}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="5,5"
                rx="4"
              />
            </g>
          </svg>
        </div>
      )}

      {/* Tool Buttons - Left Side */}
      <div style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
      }}>
        {/* Select Tool */}
        <Button
          onClick={() => setCurrentTool('select')}
          variant={currentTool === 'select' ? 'default' : 'outline'}
          size="sm"
          className={`${currentTool === 'select'
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
            : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
          }`}
          style={{ width: '32px', height: '32px', padding: '0' }}
          title="Select Tool - Click to select nodes/edges, drag to select multiple, drag from node handles to create connections, press Delete to remove selected items"
        >
          <SquareDashed className="w-4 h-4" />
        </Button>

        {/* Pan Tool */}
        <Button
          onClick={() => setCurrentTool('pan')}
          variant={currentTool === 'pan' ? 'default' : 'outline'}
          size="sm"
          className={`${currentTool === 'pan'
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
            : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
          }`}
          style={{ width: '32px', height: '32px', padding: '0' }}
          title="Pan Tool - Click and drag to pan the view, right-click always pans"
        >
          <Hand className="w-4 h-4" />
        </Button>

        {/* Add Node Tool */}
        <Button
          onClick={() => setCurrentTool('add-node')}
          variant={currentTool === 'add-node' ? 'default' : 'outline'}
          size="sm"
          className={`${currentTool === 'add-node'
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
            : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
          }`}
          style={{ width: '32px', height: '32px', padding: '0' }}
          title="Add Node Tool - Click anywhere on the canvas to create a new node"
        >
          <File className="w-4 h-4" />
        </Button>

        {/* Comment Tool */}
        <Button
          onClick={() => setCurrentTool('comment')}
          variant={currentTool === 'comment' ? 'default' : 'outline'}
          size="sm"
          className={`${currentTool === 'comment'
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
            : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
          }`}
          style={{ width: '32px', height: '32px', padding: '0' }}
          title="Comment Tool - Click and drag to create a comment box that can group nodes"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </div>

      {/* Action Buttons - Right Side */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
      }}>
        {/* Auto Layout Button */}
        <Button
          onClick={autoLayout}
          disabled={isAutoLayouting || !graph}
          variant="outline"
          size="sm"
          className={`bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 ${
            isAutoLayouting ? 'cursor-not-allowed opacity-75' : ''
          }`}
          title={isAutoLayouting ? 'Laying out graph...' : 'Auto-arrange nodes for a clean layout'}
        >
          {isAutoLayouting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Auto Layout...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Auto Layout
            </>
          )}
        </Button>
        {/* Build Entire Graph Button */}
        <Button
          onClick={buildEntireGraph}
          disabled={isBuildingGraph || !graph}
          variant="outline"
          size="sm"
          className={`bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 ${
            isBuildingGraph ? 'cursor-not-allowed opacity-75' : ''
          }`}
          title={isBuildingGraph ? "Building graph..." : "Build entire graph with current changes"}
        >
          {isBuildingGraph ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Building Graph...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Build Graph
            </>
          )}
        </Button>
        {/* Open Layers Sidebar button (shown only when sidebar is closed) */}
        {!layersSidebarOpen && (
          <Button
            onClick={() => {
              try { window.dispatchEvent(new CustomEvent('manta:open-layers')); } catch {}
              setLayersSidebarOpen(true);
            }}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title="Open Layers Sidebar"
          >
            <LayersIcon className="w-4 h-4 mr-2" />
            Layers
          </Button>
        )}
        
        {/* Rebuild Full Graph Button */}
        {/* <Button
          onClick={rebuildFullGraph}
          disabled={isRebuilding}
          variant="outline"
          size="sm"
          className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
          title={isRebuilding ? "Rebuilding graph..." : "Rebuild entire graph and generate code for all nodes"}
        >
          <RotateCcw className={`w-4 h-4 ${isRebuilding ? 'animate-spin' : ''}`} />
          {isRebuilding ? 'Rebuilding...' : 'Rebuild Full Graph'}
        </Button> */}
        
        {/* Delete Graph Button */}
        {/* <Button
          onClick={deleteGraph}
          variant="outline"
          size="sm"
          className="bg-zinc-800 text-red-400 border-0 hover:bg-red-900/20 hover:text-red-300"
          title="Delete graph"
        >
          <Trash2 className="w-4 h-4" />
          Delete Graph
        </Button> */}
      </div>
    </div>
  );
}

function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}

export default GraphView;
