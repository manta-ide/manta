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
import { Button } from '@/components/ui/button';
import { Hand, SquareDashed, Layers as LayersIcon } from 'lucide-react';
import { useHelperLines } from './helper-lines/useHelperLines';
import Shape from './shapes';
import { getShapeConfig } from './shapes/types';
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
  const updateNode = data.updateNode;
  const { zoom } = useViewport();
  const {
    searchResults,
    searchActiveIndex,
    searchQuery,
    searchCaseSensitive,
    searchOpen,
  } = useProjectStore();

  // Special handling for outline nodes (upper level boundaries)
  if (data.isOutline) {
    console.log('🎨 Rendering outline node:', { id: node.id, title: node.title, outlineType: data.outlineType });

    // Map outline type to color matching the layer icons
    const getOutlineColor = (outlineType: string) => {
      switch (outlineType) {
        case 'system':
          return { border: 'rgba(59, 130, 246, 0.8)', background: 'rgba(59, 130, 246, 0.1)', titleBg: 'rgba(59, 130, 246, 0.95)' };
        case 'container':
          return { border: 'rgba(34, 197, 94, 0.8)', background: 'rgba(34, 197, 94, 0.1)', titleBg: 'rgba(34, 197, 94, 0.95)' };
        case 'component':
          return { border: 'rgba(251, 191, 36, 0.8)', background: 'rgba(251, 191, 36, 0.1)', titleBg: 'rgba(251, 191, 36, 0.95)' };
        case 'code':
          return { border: 'rgba(147, 51, 234, 0.8)', background: 'rgba(147, 51, 234, 0.1)', titleBg: 'rgba(147, 51, 234, 0.95)' };
        default:
          return { border: 'rgba(59, 130, 246, 0.8)', background: 'rgba(59, 130, 246, 0.1)', titleBg: 'rgba(59, 130, 246, 0.95)' };
      }
    };

    const colors = getOutlineColor(data.outlineType);

    return (
      <div
        className="outline-node"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: 'none', // Don't interfere with child node interactions
        }}
      >
        {/* Dotted outline border */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: `4px dotted ${colors.border}`,
            borderRadius: '8px',
            background: colors.background,
            zIndex: -1, // Behind child nodes
          }}
        />

        {/* Title label */}
        <div
          style={{
            position: 'absolute',
            top: '-32px',
            left: '8px',
            background: colors.titleBg,
            color: 'white',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          {node.title}
        </div>
      </div>
    );
  }

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


  // All nodes are considered built since we removed the base/current graph distinction
  const effectiveState = 'built';

  // Determine styling based on node state
  const getNodeStyles = () => {
    const borderWidth = isZoomedOut ? '3px' : '0px';

    return {
      background: selected ? '#f8fafc' : '#ffffff',
      border: selected ? `${borderWidth} solid #2563eb` : '1px solid #e5e7eb',
      boxShadow: selected
        ? '0 0 0 2px #2563eb'
        : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      borderRadius: '8px',
    };
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
        return (v === 'circle' || v === 'rectangle' || v === 'comment' || v === 'diamond' || v === 'hexagon' || v === 'arrow-rectangle' || v === 'cylinder' || v === 'parallelogram' || v === 'round-rectangle') ? v : 'round-rectangle';
      } catch {
        return 'round-rectangle';
      }
    })();
  // Get shape configuration (dimensions, padding, indicator positions, etc.)
  const shapeConfig = getShapeConfig(shape as any);
  
  // Compute actual dimensions (support resizable shapes with property overrides)
  const { width: shapeWidth, height: shapeHeight } = (() => {
    if (shapeConfig?.resizable) {
      const widthProp = Array.isArray(node.properties) ? node.properties.find(p => p.id === 'width') : null;
      const heightProp = Array.isArray(node.properties) ? node.properties.find(p => p.id === 'height') : null;
      return {
        width: widthProp?.value || shapeConfig.dimensions.width,
        height: heightProp?.value || shapeConfig.dimensions.height,
      };
    }
    return shapeConfig.dimensions;
  })();
  
  const contentPadding: React.CSSProperties = shapeConfig.contentPadding;

  // Get fill colors from config or use defaults
  const fillDefault = shapeConfig.fill?.default || '#ffffff';
  const fillSelected = shapeConfig.fill?.selected || '#f8fafc';
  const fillColor = selected ? fillSelected : fillDefault;

  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        position: 'relative',
        width: `${shapeWidth}px`,
        height: `${shapeHeight}px`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Shape rendering (SVG for all shapes) */}
      <Shape
        type={shape as any}
        width={shapeWidth}
        height={shapeHeight}
        fill={fillColor}
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



      {/* Resize handles - only for resizable nodes (e.g., comments) */}
      {shapeConfig?.resizable && (
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
          overflow: shapeConfig.contentLayout?.clipOverflow ? 'hidden' : 'visible',
          ...contentPadding,
        }}
      >
        {/* Main content area */}
        <div style={{ flex: shapeConfig.contentLayout?.flexContent ? 1 : 'none' }}>
          {/* Title */}
          <div
            style={{
              fontSize: `${shapeConfig.fontSize?.title || 16}px`,
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '12px',
              lineHeight: '1.4',
              wordBreak: 'break-word',
            }}
          >
            {typeof node.title === 'string' ? (searchQuery && searchOpen ? highlightText(node.title) : node.title) : node.title}
          </div>
          
          {/* Description preview - always show at all zoom levels */}
          <div
            style={{
              fontSize: `${shapeConfig.fontSize?.content || 13}px`,
              color: '#6b7280',
              marginBottom: '16px',
              lineHeight: '1.4',
              ...(shapeConfig.contentLayout?.maxDescriptionLines ? {
                display: '-webkit-box',
                WebkitLineClamp: shapeConfig.contentLayout.maxDescriptionLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              } : {}),
              wordBreak: 'break-word',
              flex: shapeConfig.contentLayout?.flexContent ? 1 : 'none',
            }}
            title={node.description}
          >
            {shapeConfig.supportsMarkdown ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={commentMarkdownComponents}
                >
                  {typeof node.description === 'string' ? node.description : String(node.description || '')}
                </ReactMarkdown>
              </div>
            ) : (
              typeof node.description === 'string' ? (searchQuery && searchOpen ? highlightText(node.description) : node.description) : node.description
            )}
          </div>
        </div>

      </div>

      {/* Four visual connectors (top/right/bottom/left) - only show for shapes that support handles */}
      {shapeConfig.showHandles && (
        <>
          {/* Top */}
          <Handle id="top" type="target" position={Position.Top} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: '#ffffff', width: handleSize, height: handleSize, border: '1px solid #9ca3af', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', ...(shapeConfig?.handlePositions?.top || {}) }} />
          <Handle id="top" type="source" position={Position.Top} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: 'transparent', width: handleSize, height: handleSize, border: '1px solid transparent', borderRadius: '50%', ...(shapeConfig?.handlePositions?.top || {}) }} />
          {/* Right */}
          <Handle id="right" type="target" position={Position.Right} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{
              background: '#ffffff',
              width: handleSize,
              height: handleSize,
              border: '1px solid #9ca3af',
              borderRadius: '50%',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              ...(shapeConfig?.handlePositions?.right || {})
            }} />
          <Handle id="right" type="source" position={Position.Right} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{
              background: 'transparent',
              width: handleSize,
              height: handleSize,
              border: '1px solid transparent',
              borderRadius: '50%',
              ...(shapeConfig?.handlePositions?.right || {})
            }} />
          {/* Bottom */}
          <Handle id="bottom" type="target" position={Position.Bottom} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: '#ffffff', width: handleSize, height: handleSize, border: '1px solid #9ca3af', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', ...(shapeConfig?.handlePositions?.bottom || {}) }} />
          <Handle id="bottom" type="source" position={Position.Bottom} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{ background: 'transparent', width: handleSize, height: handleSize, border: '1px solid transparent', borderRadius: '50%', ...(shapeConfig?.handlePositions?.bottom || {}) }} />
          {/* Left */}
          <Handle id="left" type="target" position={Position.Left} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{
              background: '#ffffff',
              width: handleSize,
              height: handleSize,
              border: '1px solid #9ca3af',
              borderRadius: '50%',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              ...(shapeConfig?.handlePositions?.left || {})
            }} />
          <Handle id="left" type="source" position={Position.Left} isValidConnection={isValidConnection} isConnectableStart={true} isConnectableEnd={true}
            style={{
              background: 'transparent',
              width: handleSize,
              height: handleSize,
              border: '1px solid transparent',
              borderRadius: '50%',
              ...(shapeConfig?.handlePositions?.left || {})
            }} />
        </>
      )}
    </div>
  );
}

interface GraphCanvasProps {
  projectId: string;
}

function GraphCanvas({ projectId }: GraphCanvasProps) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Track nodes being dragged locally to avoid overwriting their position from incoming graph updates
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  const [isRebuilding, setIsRebuilding] = useState(false);
  // Track viewport state for layer switching
  const [currentViewport, setCurrentViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [pendingLayerSwitch, setPendingLayerSwitch] = useState<string | null>(null);

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
    isBuildingGraph
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
    fullGraph,
    graphLoading: loading,
    graphError: error,
    refreshGraph,
    refreshGraphStates,
    reconcileGraphRefresh,
    connectToGraphEvents,
    disconnectFromGraphEvents,
    deleteNode,
    loadGraphs,
    activeLayer,
    // search state
    searchResults,
    searchActiveIndex,
    searchOpen,
  } = useProjectStore();


  const { suppressSSE } = useProjectStore.getState();
  const layersSidebarOpen = useProjectStore((s) => s.layersSidebarOpen);
  const setLayersSidebarOpen = useProjectStore((s) => s.setLayersSidebarOpen);

  // Edge visual styles
  const defaultEdgeStyle = useMemo(() => ({
    stroke: '#9ca3af',
    strokeWidth: 2,
    opacity: 0.8,
  } as const), []);
  const selectedEdgeStyle = useMemo(() => ({
    stroke: '#3b82f6',
    strokeWidth: 4,
    opacity: 1,
  } as const), []);

  type EdgeShape = 'refines' | 'relates';
  const DEFAULT_EDGE_SHAPE: EdgeShape = 'relates';

  const applyEdgeShapeToStyle = useCallback((style: any, shape: EdgeShape | undefined) => {
    const nextStyle = { ...style } as any;
    if (shape === 'relates') {
      nextStyle.strokeDasharray = '8,8';
    } else if ('strokeDasharray' in nextStyle) {
      delete nextStyle.strokeDasharray;
    }
    return nextStyle;
  }, []);

  const resolveEdgeShape = useCallback((edgeLike: any): EdgeShape => {
    if (!edgeLike) return DEFAULT_EDGE_SHAPE;
    const directShape = (edgeLike as any)?.shape;
    if (directShape === 'refines' || directShape === 'relates') return directShape;
    const dataShape = (edgeLike as any)?.data?.shape;
    if (dataShape === 'refines' || dataShape === 'relates') return dataShape;

    const id = (edgeLike as Edge)?.id || (edgeLike as any)?.id;
    const source = (edgeLike as Edge)?.source || (edgeLike as any)?.source;
    const target = (edgeLike as Edge)?.target || (edgeLike as any)?.target;

    const matched = (graph?.edges || []).find((ge: any) => {
      if (id && ge.id === id) return true;
      return ge.source === source && ge.target === target;
    });
    const matchedShape = (matched as any)?.shape;
    return matchedShape === 'refines' || matchedShape === 'relates' ? matchedShape : DEFAULT_EDGE_SHAPE;
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


  // Listen for global commands (from chat slash commands or elsewhere)
  useEffect(() => {
    const onBuildGraph = () => {
      // Trigger the same action as the Build Graph button
      if (!isBuildingGraph && graph) {
        void buildEntireGraph();
      }
    };
    const onSwitchLayer = (event: CustomEvent) => {
      const { layerName } = event.detail;
      // Save current viewport locally and mark layer switch as pending
      setCurrentViewport(viewport);
      setPendingLayerSwitch(layerName);
      void useProjectStore.getState().setActiveLayer(layerName);
    };

    window.addEventListener('manta:build-graph', onBuildGraph as EventListener);
    window.addEventListener('manta:switch-layer', onSwitchLayer as EventListener);
    return () => {
      window.removeEventListener('manta:build-graph', onBuildGraph as EventListener);
      window.removeEventListener('manta:switch-layer', onSwitchLayer as EventListener);
    };
  }, [buildEntireGraph, isBuildingGraph, graph, viewport]);


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
    // Use the active layer's C4 type, defaulting to 'component' if not a valid C4 layer
    const nodeType = (activeLayer === 'system' || activeLayer === 'container' || activeLayer === 'component' || activeLayer === 'code')
      ? activeLayer as 'system' | 'container' | 'component' | 'code'
      : 'component';
    const nodeLevel = (activeLayer === 'system' || activeLayer === 'container' || activeLayer === 'component' || activeLayer === 'code')
      ? activeLayer as 'system' | 'container' | 'component' | 'code'
      : 'component';

    const newNode: GraphNode = {
      id: newNodeId,
      title: 'New Node',
      description: '',
      comment: '',
      type: nodeType,
      level: nodeLevel,
      shape: 'round-rectangle'
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
  }, [graph, generateNodeId, updateNode, setSelectedNode, setSelectedNodeIds, setNodes, setOptimisticOperationsActive, suppressSSE]);

  // Create a new comment node at the specified position with custom dimensions
  const createCommentNode = useCallback(async (position: { x: number; y: number }, dimensions: { width: number; height: number }) => {
    if (!graph) return;

    const newNodeId = generateNodeId();
    const newNode: GraphNode = {
      id: newNodeId,
      title: 'Comment',
      description: 'Add your comment here...',
      comment: '',
      type: 'comment',
      shape: 'comment',
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
  }, [graph, generateNodeId, updateNode, setSelectedNode, setSelectedNodeIds, setNodes, setOptimisticOperationsActive, setCurrentTool, suppressSSE]);

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
      const removableNodeIdSet = new Set(nodeIdsToDelete);

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
        .filter(node => !removableNodeIdSet.has(node.id))
        .map(node => ({ ...node, selected: false }))
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
        removed: Array.from(removableNodeIdSet),
        removedEdges: Array.from(normalizedEdgeIdSet),
      });

      // Now fetch current graph and persist changes
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const url = `${origin}/api/graph-api?graphType=current&projectId=${projectId}`;

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

      // Apply removals to server-side graph
      let updatedNodes = currentGraph.nodes || [];
      let updatedEdges = currentGraph.edges || [];

      if (nodeIdsToDelete.length > 0) {
        updatedNodes = updatedNodes.filter((node: any) => !removableNodeIdSet.has(node.id));
        updatedEdges = updatedEdges.filter((edge: any) =>
          !removableNodeIdSet.has(edge.source) && !removableNodeIdSet.has(edge.target)
        );
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
  }, [nodes, edges, selectedNodeIds, setNodes, setEdges, setSelectedNode, setSelectedNodeIds, graph, setOptimisticOperationsActive, suppressSSE]);

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

  // Initialize layers and graphs when component mounts
  useEffect(() => {
    console.log('🏁 GraphView component mounted or projectId changed, loading layers and graphs...', { projectId });

    // Reset loading state when project changes
    setGraphsLoaded(false);

    // Load layers first to ensure activeLayer is set before graph loading
    const { loadLayers } = useProjectStore.getState();
    loadLayers().then(() => {
      console.log('✅ Layers loaded, now loading graphs...');
      // Now load graphs after layers are loaded
      loadGraphs().then(() => {
        console.log('✅ Graphs loaded, setting graphsLoaded to true');
        setGraphsLoaded(true);
      }).catch(error => {
        console.error('❌ loadGraphs failed:', error);
        setGraphsLoaded(true); // Still set to true to avoid infinite loading
      });
    }).catch(error => {
      console.error('❌ loadLayers failed:', error);
      // Still try to load graphs even if layers fail
      loadGraphs().then(() => {
        setGraphsLoaded(true);
      }).catch(graphError => {
        console.error('❌ loadGraphs also failed:', graphError);
        setGraphsLoaded(true);
      });
    });
  }, [loadGraphs, projectId]);

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

  // Fit view to center the graph on initial application load only
  const hasInitiallyFittedRef = useRef(false);

  useEffect(() => {
    // Only fit view on the very first time nodes are loaded in the application
    // This preserves viewport position when switching between layers and during editing
    if (nodes.length > 0 && !hasInitiallyFittedRef.current && graphsLoaded && !optimisticOperationsActive) {
      // Defer to next tick to ensure layout/DOM size is ready
      setTimeout(() => {
        try {
          reactFlow.fitView({ padding: 0.2, duration: 500, includeHiddenNodes: true });
          hasInitiallyFittedRef.current = true;
        } catch {}
      }, 0);
    }
  }, [nodes, reactFlow, graphsLoaded, optimisticOperationsActive]);

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
        const baseStyle = e.selected ? selectedEdgeStyle : defaultEdgeStyle;
        const nextStyle = applyEdgeShapeToStyle(baseStyle, shape);
        return {
          ...e,
          style: nextStyle,
          markerEnd: makeArrowForStyle(nextStyle),
          data: { ...(e.data || {}), shape },
        };
      });
    });
  }, [setEdges, resolveEdgeShape, applyEdgeShapeToStyle, defaultEdgeStyle, selectedEdgeStyle]);

  // Process graph data and create ReactFlow nodes/edges (with auto tree layout for missing positions)
  useEffect(() => {
    const rebuild = async () => {
      console.log('🔄 Graph rebuild triggered:', { hasGraph: !!graph, loading });

      // Skip rebuild if optimistic operations are in progress to prevent overriding local changes
      if (optimisticOperationsActive) {
        console.log('⏭️ Skipping graph rebuild due to active optimistic operations');
        return;
      }

      // Wait for both graphs and layers to be loaded and not loading
      if (!graphsLoaded || !graph || !graph.nodes || loading || activeLayer === null) {
        console.log('⏳ Waiting for graphs and layers to load...', { graphsLoaded, graph: !!graph, loading, activeLayer });
        setNodes([]);
        setEdges([]);
        return;
      }

      // Both graphs are loaded together synchronously
      console.log('✅ Rebuilding graph with data:', { nodes: graph.nodes.length, activeLayer });

      // Check if only properties changed (more efficient update)
      const currentStructure = JSON.stringify({
        nodes: graph.nodes.map(n => ({ id: n.id, title: n.title, description: n.description })),
        edges: graph.edges || []
      });

      const isPropertyOnlyChange = prevGraphStructureRef.current === currentStructure && latestNodesRef.current.length > 0;

      if (isPropertyOnlyChange) {
        // Only properties changed - update existing nodes/edges without full rebuild
        console.log('🔄 Updating node data and edge styles without full rebuild');

        // Update node payloads to reflect latest graph node data
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
 // ensure CustomNode computes state against latest base graph
                  graph: graph
                }
              };
            }
            return node;
          })
        );

        // Also refresh edge styling
        setEdges(currentEdges =>
          currentEdges.map(e => {
            const graphEdge = (graph?.edges || []).find((edge: any) => edge.id === e.id || (`${edge.source}-${edge.target}` === e.id));
            const shape = resolveEdgeShape(graphEdge || e);
            const baseStyle = e.selected ? selectedEdgeStyle : defaultEdgeStyle;
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

      // All nodes need positions calculated (positions are no longer stored in DB)
      let nodePositions = new Map<string, { x: number; y: number }>();
      const nodesMissingPos: string[] = graph.nodes.map(n => n.id);

      // If some nodes are missing positions, compute layout for them using layered algorithm
      if (nodesMissingPos.length > 0) {
        try {
          // Use ELK layered layout for missing positions
          const elk = new ELK();
          const missingElkNodes = nodesMissingPos.map(id => ({
            id: id,
            width: 260,
            height: 160,
          }));

          const missingElkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
          const seen = new Set<string>();
          if (Array.isArray((graph as any).edges)) {
            (graph as any).edges.forEach((e: any, i: number) => {
              if (nodesMissingPos.includes(e.source) || nodesMissingPos.includes(e.target)) {
                const id = `${e.source}-${e.target}`;
                if (!seen.has(id)) {
                  missingElkEdges.push({
                    id: `e-${i}-${id}`,
                    sources: [e.source],
                    targets: [e.target]
                  });
                  seen.add(id);
                }
              }
            });
          }

          const missingElkGraph = {
            id: 'missing-nodes',
            layoutOptions: {
              'elk.algorithm': 'org.eclipse.elk.layered',
              'elk.direction': 'DOWN',
              'elk.layered.spacing.nodeNodeBetweenLayers': '100',
              'elk.spacing.nodeNode': '60',
              'elk.spacing.edgeNode': '20',
            },
            children: missingElkNodes,
            edges: missingElkEdges,
          } as any;

          const missingLayoutResult = await elk.layout(missingElkGraph);

          if (Array.isArray(missingLayoutResult.children)) {
            missingLayoutResult.children.forEach((child: any) => {
              if (!nodePositions.has(child.id) && typeof child.x === 'number' && typeof child.y === 'number') {
                nodePositions.set(child.id, {
                  x: Math.round(child.x),
                  y: Math.round(child.y)
                });
              }
            });
          }
        } catch (e) {
          console.warn('⚠️ ELK layered layout failed, falling back to simple grid:', e);
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

      // Only use nodes from the current graph
      const currentNodeIds = new Set(graph.nodes.map(n => n.id));
      const isLayerView = activeLayer && ['system', 'container', 'component', 'code'].includes(activeLayer);

      // Add upper level node outlines for C4 layers
      let outlineNodes: any[] = [];
      const c4Layers = ['system', 'container', 'component', 'code'];
      const layerHierarchy = { system: 0, container: 1, component: 2, code: 3 };

      console.log('🔍 Outline debug:', {
        activeLayer,
        hasFullGraph: !!fullGraph,
        hasGraph: !!graph,
        fullGraphNodes: fullGraph?.nodes?.length || 0,
        graphNodes: graph?.nodes?.length || 0,
        isC4Layer: c4Layers.includes(activeLayer || '')
      });

      if (c4Layers.includes(activeLayer || '') && fullGraph && graph) {
        const currentLevelIndex = layerHierarchy[activeLayer as keyof typeof layerHierarchy];

        // Get all upper level nodes that should be shown as outlines
        const upperLevelNodes = fullGraph.nodes.filter(node =>
          c4Layers.includes((node as any).type) &&
          layerHierarchy[(node as any).type as keyof typeof layerHierarchy] < currentLevelIndex
        );

        console.log('📊 Upper level nodes found:', upperLevelNodes.map(n => ({ id: n.id, title: n.title, type: (n as any).type })));

        // Create a map of current level nodes for quick lookup
        const currentLevelNodeMap = new Map(graph.nodes.map(node => [node.id, node]));

        // Find connections between upper level nodes and current level nodes
        const upperLevelConnections = new Map<string, string[]>(); // upperLevelNodeId -> [currentLevelNodeIds]

        console.log('🔗 Processing edges:', fullGraph.edges?.length || 0);
        if (fullGraph.edges) {
          fullGraph.edges.forEach(edge => {
            const currentNode = currentLevelNodeMap.get(edge.source);
            const upperNode = upperLevelNodes.find(n => n.id === edge.target);

            if (upperNode && currentNode) {
              if (!upperLevelConnections.has(upperNode.id)) {
                upperLevelConnections.set(upperNode.id, []);
              }
              upperLevelConnections.get(upperNode.id)!.push(currentNode.id);
              console.log('🔗 Found connection:', { upper: upperNode.title, current: currentNode.title });
            }
          });
        }

        console.log('📦 Upper level connections:', Array.from(upperLevelConnections.entries()).map(([upperId, childIds]) => ({
          upperId,
          childCount: childIds.length,
          childIds
        })));

        // Create outline nodes for upper level nodes that have connections
        upperLevelConnections.forEach((childNodeIds, upperNodeId) => {
          const upperNode = upperLevelNodes.find(n => n.id === upperNodeId);
          if (!upperNode) return;

          // Create a mock node for the outline
          const outlineNode = {
            id: `outline-${upperNodeId}`,
            title: upperNode.title,
            type: 'outline',
            shape: 'round-rectangle',
            position: { x: 0, y: 0, z: 0 }, // Will be calculated later
            properties: [],
            outlineType: (upperNode as any).type,
            childNodeIds,
          };

          console.log('🎨 Created outline node:', { id: outlineNode.id, title: outlineNode.title, childCount: childNodeIds.length });
          outlineNodes.push(outlineNode);
        });
      }

      console.log('📋 Node counts:', {
        graphNodes: graph.nodes.length,
        outlineNodes: outlineNodes.length,
        totalAllNodes: graph.nodes.length + outlineNodes.length
      });

      const allNodes = [...graph.nodes, ...outlineNodes];

      // Sort nodes by z-index (lower z-index renders first/behind)
      // Put outline nodes first so they render behind regular nodes
      const sortedNodes = allNodes.sort((a, b) => {
        const aIsOutline = (a as any).type === 'outline';
        const bIsOutline = (b as any).type === 'outline';

        // Outline nodes go first (behind)
        if (aIsOutline && !bIsOutline) return -1;
        if (!aIsOutline && bIsOutline) return 1;

        // Then sort by shape z-index
        const aShape = (a as any).shape || 'round-rectangle';
        const bShape = (b as any).shape || 'round-rectangle';
        const aConfig = getShapeConfig(aShape);
        const bConfig = getShapeConfig(bShape);
        const aZ = aConfig.zIndex ?? 0;
        const bZ = bConfig.zIndex ?? 0;
        return aZ - bZ; // Lower z-index first
      });

      console.log('🎯 Final sorted nodes:', sortedNodes.map(n => ({
        id: n.id,
        title: n.title,
        type: (n as any).type,
        isOutline: (n as any).type === 'outline'
      })));

      // Convert graph nodes to ReactFlow nodes (preserve position if dragging)
      const reactFlowNodes: Node[] = [];

      for (const node of sortedNodes) {
        const isDragging = draggingNodeIdsRef.current.has(node.id);
        let position = isDragging
          ? (currentPositions.get(node.id) || nodePositions.get(node.id) || { x: 0, y: 0 })
          : (nodePositions.get(node.id) || { x: 0, y: 0 });

        // For base-only nodes (ghosted), we still want to preserve any position data
        // Don't add offset to prevent jumping - let them use their stored position

        // Special handling for outline nodes
        if ((node as any).type === 'outline') {
          console.log('🎨 Processing outline node:', { id: node.id, title: node.title, childNodeIds: (node as any).childNodeIds });
          // Find all child nodes for this outline from the sorted nodes
          const childNodeIds = (node as any).childNodeIds || [];
          const childNodes = sortedNodes.filter(n =>
            childNodeIds.includes(n.id) && (n as any).type !== 'outline'
          );

          console.log('👶 Found child nodes for outline:', childNodes.map(c => ({ id: c.id, title: c.title, type: (c as any).type })));

          if (childNodes.length > 0) {
            // Create outline node with temporary position - will be repositioned after layout
            const outlineNode: Node = {
              id: node.id,
              position: { x: 0, y: 0 }, // Temporary position
              width: 400, // Temporary dimensions
              height: 300,
              data: {
                label: node.title,
                node: node,
                properties: node.properties || [],
                graph: graph,
                fullGraph: fullGraph,
                updateNode: updateNode,
                isOutline: true,
                outlineType: (node as any).outlineType,
                childNodeIds: childNodeIds, // Store for repositioning after layout
              },
              type: 'custom',
              selected: false,
              draggable: false,
            };

            console.log('✅ Created outline ReactFlow node (temp position):', { id: outlineNode.id });
            reactFlowNodes.push(outlineNode);
            continue;
          } else {
            console.log('❌ No child nodes found for outline, skipping');
          }
        }

        const backgroundColor = node.properties?.find((p: any) => p.id === 'background-color')?.value;
        // Extract width and height from properties for ReactFlow node
        const widthProp = node.properties?.find((p: any) => p.id === 'width');
        const heightProp = node.properties?.find((p: any) => p.id === 'height');
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
            graph: graph,
            updateNode: updateNode
          },
          type: 'custom',
          selected: (selectedNodeIds && selectedNodeIds.length > 0) ? selectedNodeIds.includes(node.id) : selectedNodeId === node.id,
        };

        // Set width and height on ReactFlow node if available (for resizable nodes)
        if (nodeWidth) rfNode.width = nodeWidth;
        if (nodeHeight) rfNode.height = nodeHeight;

        reactFlowNodes.push(rfNode);
      }

      // Create edges from both base and current graphs
      const reactFlowEdges: Edge[] = [];
      // Deduplicate edges regardless of direction (A-B equals B-A),
      // but keep the original orientation and handle anchors of the first occurrence.
      const addedSymmetric = new Set<string>();

      // Collect edges from the current graph
      const allEdges = [
        ...(graph as any).edges || []
      ];

      if (allEdges.length > 0) {
        const previouslySelectedEdges = new Set(
          (latestEdgesRef.current || [])
            .filter((e) => e.selected)
            .map((e) => e.id)
        );
        // Build a quick position map for fallback handle inference
        const posMap = new Map<string, { x: number; y: number }>();
        (reactFlowNodes || []).forEach((n) => posMap.set(n.id, { x: n.position.x, y: n.position.y }));

        allEdges.forEach((edge: any) => {
          const src = String(edge.source);
          const tgt = String(edge.target);
          const symKey = [src, tgt].sort().join('~');
          if (!addedSymmetric.has(symKey)) {
            // Create edge without handles first - will be calculated after layout
            const shape = resolveEdgeShape(edge);

          // Check if either connected node has negative z-index (like comments)
          const sourceNode = sortedNodes.find(n => n.id === edge.source);
          const targetNode = sortedNodes.find(n => n.id === edge.target);
          const sourceShape = (sourceNode as any)?.shape || 'round-rectangle';
          const targetShape = (targetNode as any)?.shape || 'round-rectangle';
          const sourceConfig = getShapeConfig(sourceShape);
          const targetConfig = getShapeConfig(targetShape);
          const connectsToComment = (sourceConfig.zIndex ?? 0) < 0 || (targetConfig.zIndex ?? 0) < 0;

          const baseStyle = previouslySelectedEdges.has(edge.id)
            ? selectedEdgeStyle
            : defaultEdgeStyle;
          const style = applyEdgeShapeToStyle(baseStyle, shape);

          reactFlowEdges.push({
            id: edge.id,
            source: src,
            target: tgt,
            sourceHandle: undefined, // Will be calculated after layout
            targetHandle: undefined, // Will be calculated after layout
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

      // Apply automatic layered layout to all nodes
      try {
        console.log('🔄 Applying automatic layered layout...');

        const elk = new ELK();

        // Prepare nodes for ELK layout (exclude outline nodes as they position themselves based on children)
        const elkNodes = reactFlowNodes
          .filter(rfNode => !rfNode.data?.isOutline)
          .map(rfNode => ({
            id: rfNode.id,
            width: rfNode.width ?? 260,
            height: rfNode.height ?? 160,
          }));

        // Prepare edges for ELK layout
        const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
        const seen = new Set<string>();
        if (Array.isArray(reactFlowEdges)) {
          reactFlowEdges.forEach((edge: any, i: number) => {
            const id = `${edge.source}-${edge.target}`;
            if (!seen.has(id)) {
              elkEdges.push({
                id: `e-${i}-${id}`,
                sources: [edge.source],
                targets: [edge.target]
              });
              seen.add(id);
            }
          });
        }

        const elkGraph = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'org.eclipse.elk.layered',
            'elk.direction': 'DOWN',
            'elk.layered.spacing.nodeNodeBetweenLayers': '120',
            'elk.spacing.nodeNode': '80',
            'elk.spacing.edgeNode': '20',
            'elk.spacing.edgeEdge': '20',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.layered.thoroughness': '7',
            'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
          },
          children: elkNodes,
          edges: elkEdges,
        } as any;

        const layoutResult = await elk.layout(elkGraph);

        // Update ReactFlow node positions from ELK layout results (only for non-outline nodes)
        if (Array.isArray(layoutResult.children)) {
          layoutResult.children.forEach((child: any) => {
            const rfNode = reactFlowNodes.find(n => n.id === child.id);
            if (rfNode && !rfNode.data?.isOutline && typeof child.x === 'number' && typeof child.y === 'number') {
              rfNode.position = {
                x: Math.round(child.x),
                y: Math.round(child.y)
              };
            }
          });
        }

        console.log('✅ Automatic layered layout applied');
      } catch (e) {
        console.warn('⚠️ Automatic layered layout failed, using existing positions:', e);
      }

      // Reposition outline nodes based on their child node positions after layout
      try {
        console.log('🔄 Repositioning outline nodes based on child positions...');

        reactFlowNodes.forEach(rfNode => {
          if (rfNode.data?.isOutline && rfNode.data?.childNodeIds && Array.isArray(rfNode.data.childNodeIds)) {
            const childNodeIds: string[] = rfNode.data.childNodeIds;
            const childRfNodes = reactFlowNodes.filter(n =>
              childNodeIds.includes(n.id) && !n.data?.isOutline
            );

            if (childRfNodes.length > 0) {
              // Calculate bounding box using the new positions after layout
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              childRfNodes.forEach(childNode => {
                const width = childNode.width ?? 260;
                const height = childNode.height ?? 160;
                minX = Math.min(minX, childNode.position.x);
                minY = Math.min(minY, childNode.position.y);
                maxX = Math.max(maxX, childNode.position.x + width);
                maxY = Math.max(maxY, childNode.position.y + height);
              });

              // Add padding around the bounding box
              const padding = 40;
              const outlineWidth = maxX - minX + (padding * 2);
              const outlineHeight = maxY - minY + (padding * 2);
              const newPosition = { x: minX - padding, y: minY - padding };

              // Update the outline node position and dimensions
              rfNode.position = newPosition;
              rfNode.width = outlineWidth;
              rfNode.height = outlineHeight;

              console.log('📐 Repositioned outline:', {
                id: rfNode.id,
                position: newPosition,
                width: outlineWidth,
                height: outlineHeight,
                childCount: childRfNodes.length
              });
            }
          }
        });

        // Resolve outline overlaps by rearranging child nodes using a more robust algorithm
        try {
          console.log('🔄 Resolving outline overlaps by rearranging child nodes...');

          // Group outlines by their layer type
          const outlinesByType: Record<string, typeof reactFlowNodes> = {};
          reactFlowNodes.forEach(rfNode => {
            if (rfNode.data?.isOutline) {
              const outlineType = String(rfNode.data.outlineType || 'unknown');
              if (!outlinesByType[outlineType]) {
                outlinesByType[outlineType] = [];
              }
              outlinesByType[outlineType].push(rfNode);
            }
          });

          // Helper function to recalculate a single outline's bounds
          const recalculateOutline = (outline: any) => {
            const childNodeIds = outline.data?.childNodeIds as string[] || [];
            const childNodes = reactFlowNodes.filter(n =>
              childNodeIds.includes(n.id) && !n.data?.isOutline
            );

            if (childNodes.length > 0) {
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              childNodes.forEach(childNode => {
                const width = childNode.width ?? 260;
                const height = childNode.height ?? 160;
                minX = Math.min(minX, childNode.position.x);
                minY = Math.min(minY, childNode.position.y);
                maxX = Math.max(maxX, childNode.position.x + width);
                maxY = Math.max(maxY, childNode.position.y + height);
              });

              const padding = 40;
              outline.position = { x: minX - padding, y: minY - padding };
              outline.width = maxX - minX + (padding * 2);
              outline.height = maxY - minY + (padding * 2);
            }
          };

          // Helper function to check if two outlines overlap
          const checkOverlap = (a: any, b: any) => {
            const aLeft = a.position.x;
            const aRight = a.position.x + (a.width || 400);
            const aTop = a.position.y;
            const aBottom = a.position.y + (a.height || 300);

            const bLeft = b.position.x;
            const bRight = b.position.x + (b.width || 400);
            const bTop = b.position.y;
            const bBottom = b.position.y + (b.height || 300);

            return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
          };

          // Process each layer type separately
          Object.entries(outlinesByType).forEach(([outlineType, outlines]) => {
            if (outlines.length <= 1) return; // No overlaps possible with single outline

            console.log(`🔧 Resolving overlaps for ${outlines.length} ${outlineType} outlines by rearranging children`);

            const minSpacing = 40; // Minimum space between outline edges
            let iterations = 0;
            const maxIterations = 20; // Allow more iterations for convergence

            // Use a force-based approach: repeatedly push overlapping outlines apart
            while (iterations < maxIterations) {
              iterations++;
              let anyOverlaps = false;

              // For each outline, calculate forces from all overlapping outlines
              const forces = new Map<string, { x: number; y: number }>();
              outlines.forEach(outline => forces.set(outline.id, { x: 0, y: 0 }));

              // Calculate repulsion forces between all overlapping pairs
              for (let i = 0; i < outlines.length; i++) {
                for (let j = i + 1; j < outlines.length; j++) {
                  const outlineA = outlines[i];
                  const outlineB = outlines[j];

                  if (checkOverlap(outlineA, outlineB)) {
                    anyOverlaps = true;

                    // Calculate centers
                    const aCenterX = outlineA.position.x + (outlineA.width || 400) / 2;
                    const aCenterY = outlineA.position.y + (outlineA.height || 300) / 2;
                    const bCenterX = outlineB.position.x + (outlineB.width || 400) / 2;
                    const bCenterY = outlineB.position.y + (outlineB.height || 300) / 2;

                    // Calculate direction vector from A to B
                    const dx = bCenterX - aCenterX;
                    const dy = bCenterY - aCenterY;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    // Calculate overlap amounts
                    const overlapX = Math.min(
                      outlineA.position.x + (outlineA.width || 400) - outlineB.position.x,
                      outlineB.position.x + (outlineB.width || 400) - outlineA.position.x
                    );
                    const overlapY = Math.min(
                      outlineA.position.y + (outlineA.height || 300) - outlineB.position.y,
                      outlineB.position.y + (outlineB.height || 300) - outlineA.position.y
                    );

                    // Force strength based on overlap
                    const forceStrength = Math.max(overlapX, overlapY) + minSpacing;

                    // Normalize direction and apply force
                    const fx = (dx / distance) * forceStrength;
                    const fy = (dy / distance) * forceStrength;

                    // Apply repulsion force (A pushes left/up, B pushes right/down)
                    // Use a smaller multiplier for more subtle spacing adjustments
                    const forceA = forces.get(outlineA.id)!;
                    const forceB = forces.get(outlineB.id)!;
                    forceA.x -= fx * 0.3;
                    forceA.y -= fy * 0.3;
                    forceB.x += fx * 0.3;
                    forceB.y += fy * 0.3;
                  }
                }
              }

              if (!anyOverlaps) {
                console.log(`✅ No overlaps found after ${iterations} iterations`);
                break;
              }

              // Apply forces by moving child nodes
              outlines.forEach(outline => {
                const force = forces.get(outline.id)!;
                if (force.x !== 0 || force.y !== 0) {
                  const childNodeIds = outline.data?.childNodeIds as string[] || [];
                  const childNodes = reactFlowNodes.filter(n =>
                    childNodeIds.includes(n.id) && !n.data?.isOutline
                  );

                  childNodes.forEach(childNode => {
                    childNode.position.x += force.x;
                    childNode.position.y += force.y;
                  });

                  // Recalculate outline bounds after moving children
                  recalculateOutline(outline);
                }
              });

              if (iterations % 5 === 0) {
                console.log(`📐 Iteration ${iterations}: Continuing to resolve overlaps...`);
              }
            }

            if (iterations >= maxIterations) {
              console.warn(`⚠️ Reached maximum iterations (${maxIterations}) for ${outlineType} outlines`);
            }
          });

        console.log('✅ Outline overlaps resolved by rearranging children');
      } catch (e) {
        console.warn('⚠️ Outline overlap resolution failed:', e);
      }

      console.log('✅ Outline nodes repositioned');
    } catch (e) {
      console.warn('⚠️ Outline repositioning failed:', e);
    }

      // Calculate optimal edge handles AFTER all layout adjustments are complete
      try {
        console.log('🔄 Calculating optimal edge connection points...');
        reactFlowEdges.forEach((edge: any) => {
          const sourceNode = reactFlowNodes.find(n => n.id === edge.source);
          const targetNode = reactFlowNodes.find(n => n.id === edge.target);
          
          if (sourceNode && targetNode) {
            const sp = sourceNode.position;
            const tp = targetNode.position;
            const sourceWidth = sourceNode.width ?? 260;
            const sourceHeight = sourceNode.height ?? 160;
            const targetWidth = targetNode.width ?? 260;
            const targetHeight = targetNode.height ?? 160;

            // Calculate center points
            const sourceCenterX = sp.x + sourceWidth / 2;
            const sourceCenterY = sp.y + sourceHeight / 2;
            const targetCenterX = tp.x + targetWidth / 2;
            const targetCenterY = tp.y + targetHeight / 2;

            // Calculate handle positions for all four sides of each node
            const sourceHandles = {
              top: { x: sourceCenterX, y: sp.y },
              right: { x: sp.x + sourceWidth, y: sourceCenterY },
              bottom: { x: sourceCenterX, y: sp.y + sourceHeight },
              left: { x: sp.x, y: sourceCenterY }
            };
            const targetHandles = {
              top: { x: targetCenterX, y: tp.y },
              right: { x: tp.x + targetWidth, y: targetCenterY },
              bottom: { x: targetCenterX, y: tp.y + targetHeight },
              left: { x: tp.x, y: targetCenterY }
            };

            // Find the best pair of handles based on distance and directional alignment
            let minScore = Infinity;
            let sourceHandle = 'right';
            let targetHandle = 'left';
            let bestDistance = Infinity;

            for (const [sHandle, sPos] of Object.entries(sourceHandles)) {
              for (const [tHandle, tPos] of Object.entries(targetHandles)) {
                const dx = tPos.x - sPos.x;
                const dy = tPos.y - sPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate directional penalty for non-sensible connections
                let penalty = 0;
                
                // Massive penalty for handles pointing away from the target direction
                if (sHandle === 'right' && dx < 0) penalty += 5000; // Source points right but target is left
                if (sHandle === 'left' && dx > 0) penalty += 5000;  // Source points left but target is right
                if (sHandle === 'bottom' && dy < 0) penalty += 5000; // Source points down but target is up
                if (sHandle === 'top' && dy > 0) penalty += 5000;    // Source points up but target is down
                
                if (tHandle === 'right' && dx > 0) penalty += 5000; // Target points right but source is right
                if (tHandle === 'left' && dx < 0) penalty += 5000;  // Target points left but source is left
                if (tHandle === 'bottom' && dy > 0) penalty += 5000; // Target points down but source is down
                if (tHandle === 'top' && dy < 0) penalty += 5000;    // Target points up but source is up
                
                // Strong preference for handles that face each other directly
                const facingEachOther = 
                  (sHandle === 'right' && tHandle === 'left' && dx > 0) ||
                  (sHandle === 'left' && tHandle === 'right' && dx < 0) ||
                  (sHandle === 'bottom' && tHandle === 'top' && dy > 0) ||
                  (sHandle === 'top' && tHandle === 'bottom' && dy < 0);
                
                if (facingEachOther) {
                  penalty -= 2000; // Large bonus for facing each other
                }
                
                const score = distance + penalty;
                if (score < minScore) {
                  minScore = score;
                  sourceHandle = sHandle;
                  targetHandle = tHandle;
                  bestDistance = distance;
                }
              }
            }

            edge.sourceHandle = sourceHandle;
            edge.targetHandle = targetHandle;
            
            // Log problematic connections for debugging
            if (bestDistance > 200) {
              console.log(`📏 Edge ${edge.source} -> ${edge.target}: ${sourceHandle} -> ${targetHandle} (distance: ${Math.round(bestDistance)}px)`);
            }
          }
        });
        console.log('✅ Edge connection points calculated');
      } catch (e) {
        console.warn('⚠️ Edge handle calculation failed:', e);
      }

      // Create visual edges from graph data

      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);

      // Restore saved viewport after layer switch to prevent flickering
      if (currentViewport) {
        // Use multiple strategies to ensure viewport is restored after rendering
        const restoreViewport = () => {
          try {
            reactFlow.setViewport(currentViewport, { duration: 0 });
            // Clear the preserved viewport after successful restoration
            setCurrentViewport(null);
            setPendingLayerSwitch(null);
          } catch (error) {
            console.warn('Failed to restore viewport:', error);
          }
        };

        // Try multiple timing strategies to ensure DOM is ready
        requestAnimationFrame(() => {
          // First attempt immediately after DOM update
          restoreViewport();
          // Backup attempt after a short delay
          setTimeout(restoreViewport, 50);
        });
      }

      // Select root node by default only once on initial load if nothing is selected
      // Avoid auto-selecting again after user clears the selection
      // if (!selectedNodeId && (!selectedNodeIds || selectedNodeIds.length === 0) && reactFlowNodes.length > 0 && !hasAutoSelectedRef.current) {
      //   const root = reactFlowNodes[0];
      //   setSelectedNode(root.id, graph.nodes.find(n => n.id === root.id) as any);
      //   hasAutoSelectedRef.current = true;
      // }
    };
    rebuild();
  }, [graphsLoaded, graph, fullGraph, activeLayer, setNodes, setEdges, optimisticOperationsActive, reactFlow]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Helper function to calculate optimal handle positions based on closest connection points
  const inferHandles = (sourceId: string, targetId: string, nodes: Node[]) => {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);
    if (!sourceNode || !targetNode) return { sourceHandle: undefined, targetHandle: undefined };

    const sp = sourceNode.position;
    const tp = targetNode.position;
    const sourceWidth = sourceNode.width ?? 260;
    const sourceHeight = sourceNode.height ?? 160;
    const targetWidth = targetNode.width ?? 260;
    const targetHeight = targetNode.height ?? 160;

    // Calculate center points
    const sourceCenterX = sp.x + sourceWidth / 2;
    const sourceCenterY = sp.y + sourceHeight / 2;
    const targetCenterX = tp.x + targetWidth / 2;
    const targetCenterY = tp.y + targetHeight / 2;

    // Calculate handle positions for all four sides of each node
    const sourceHandles = {
      top: { x: sourceCenterX, y: sp.y },
      right: { x: sp.x + sourceWidth, y: sourceCenterY },
      bottom: { x: sourceCenterX, y: sp.y + sourceHeight },
      left: { x: sp.x, y: sourceCenterY }
    };
    const targetHandles = {
      top: { x: targetCenterX, y: tp.y },
      right: { x: tp.x + targetWidth, y: targetCenterY },
      bottom: { x: targetCenterX, y: tp.y + targetHeight },
      left: { x: tp.x, y: targetCenterY }
    };

    // Find the best pair of handles based on distance and directional alignment
    let minScore = Infinity;
    let sourceHandle = 'right';
    let targetHandle = 'left';

    for (const [sHandle, sPos] of Object.entries(sourceHandles)) {
      for (const [tHandle, tPos] of Object.entries(targetHandles)) {
        const dx = tPos.x - sPos.x;
        const dy = tPos.y - sPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate directional penalty for non-sensible connections
        let penalty = 0;
        
        // Massive penalty for handles pointing away from the target direction
        if (sHandle === 'right' && dx < 0) penalty += 5000; // Source points right but target is left
        if (sHandle === 'left' && dx > 0) penalty += 5000;  // Source points left but target is right
        if (sHandle === 'bottom' && dy < 0) penalty += 5000; // Source points down but target is up
        if (sHandle === 'top' && dy > 0) penalty += 5000;    // Source points up but target is down
        
        if (tHandle === 'right' && dx > 0) penalty += 5000; // Target points right but source is right
        if (tHandle === 'left' && dx < 0) penalty += 5000;  // Target points left but source is left
        if (tHandle === 'bottom' && dy > 0) penalty += 5000; // Target points down but source is down
        if (tHandle === 'top' && dy < 0) penalty += 5000;    // Target points up but source is up
        
        // Strong preference for handles that face each other directly
        const facingEachOther = 
          (sHandle === 'right' && tHandle === 'left' && dx > 0) ||
          (sHandle === 'left' && tHandle === 'right' && dx < 0) ||
          (sHandle === 'bottom' && tHandle === 'top' && dy > 0) ||
          (sHandle === 'top' && tHandle === 'bottom' && dy < 0);
        
        if (facingEachOther) {
          penalty -= 2000; // Large bonus for facing each other
        }
        
        const score = distance + penalty;
        if (score < minScore) {
          minScore = score;
          sourceHandle = sHandle;
          targetHandle = tHandle;
        }
      }
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
    const styledEdge = applyEdgeShapeToStyle(defaultEdgeStyle, shape);

    const newEdge = {
      id: `${params.source}-${params.target}`,
      source: params.source!,
      target: params.target!,
      sourceHandle: params.sourceHandle || inferredSourceHandle,
      targetHandle: params.targetHandle || inferredTargetHandle,
      type: 'default' as const,
      style: styledEdge,
      markerEnd: makeArrowForStyle(styledEdge),
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
      const url = `${origin}/api/graph-api?graphType=current&projectId=${projectId}`;

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
  }, [setEdges, setOptimisticOperationsActive, nodes, suppressSSE, applyEdgeShapeToStyle, defaultEdgeStyle]);

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

  // Handle final node position changes (drag stop) - positions are local only, no DB persistence
  const onNodeDragStop = useCallback(async (event: any, node: Node) => {
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;

      // Release drag locks for all selected nodes (or the primary as fallback)
      const selectedIds = (latestNodesRef.current || [])
        .filter((n) => n.selected)
        .map((n) => n.id);
      const idsToClear = selectedIds.length > 0 ? selectedIds : [node.id];
      for (const id of idsToClear) draggingNodeIdsRef.current.delete(id);

      // Rebuild helper lines spatial index after drag
      rebuildIndex(nodes);
    } catch (error) {
      console.error('Error finalizing node drag:', error);
    }
  }, [rebuildIndex, nodes]);

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
        zoomOnScroll={true}
        zoomOnPinch={true}
        /* Dynamic pan behavior based on tool mode */
        panOnDrag={currentTool === 'pan' ? [0, 2] : [2]} // Left mouse pan in pan mode, right mouse always pans
        selectionOnDrag={currentTool === 'select'}
        onMouseDown={onPaneMouseDown}
        onMouseMove={onPaneMouseMove}
        onMouseUp={onPaneMouseUp}
        colorMode="dark"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        deleteKeyCode={[]}
        onViewportChange={(viewport) => {
          // Only update currentViewport during layer switches when preserving viewport state
          // Don't update currentViewport during normal editing to prevent zoom resets
          if (pendingLayerSwitch && !currentViewport) {
            setCurrentViewport(viewport);
          }
        }}
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
          title="Select Tool - Click to select nodes/edges, drag to select multiple"
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

interface GraphViewProps {
  projectId: string;
}

function GraphView({ projectId }: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas projectId={projectId} />
    </ReactFlowProvider>
  );
}

export default GraphView;
