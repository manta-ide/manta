import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeMouseHandler,
  Handle,
  Position,
  useViewport,
  ColorMode,
  PanOnScrollMode,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useProjectStore } from '@/lib/store';
import ELK from 'elkjs';
import { GraphNode, Graph } from '@/app/api/lib/schemas';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw, Trash2, Folder, Settings, StickyNote, Hand, SquareDashed } from 'lucide-react';

// Helper function to check if a point is within a rectangle
function isPointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// Helper function to get rectangle from two points
function getRectFromPoints(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p1.x - p2.x);
  const height = Math.abs(p1.y - p2.y);
  return { x, y, width, height };
}

// Custom node component
function CustomNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as GraphNode;
  const { zoom } = useViewport();

  // Helper function to get children from edges
  const getNodeChildren = (nodeId: string) => {
    const graph = data.graph;
    if (!graph?.edges) return [];
    return graph.edges
      .filter((edge: any) => edge.source === nodeId)
      .map((edge: any) => graph.nodes.find((n: any) => n.id === edge.target))
      .filter(Boolean);
  };
  
  // Show simplified view when zoomed out
  const isZoomedOut = zoom < 0.8;
  
  // Derive effective visual state:
  // - If explicitly building, show building even if built flag is true
  // - Otherwise built if either state says built or built flag is true
  // - Else unbuilt
  const effectiveState =
    node.state === 'building'
      ? 'building'
      : node.state === 'built'
        ? 'built'
        : 'unbuilt';
  
  // Determine styling based on node state (built/unbuilt/building)
  const getNodeStyles = () => {
    const borderWidth = isZoomedOut ? '3px' : '0px';
    
    switch (effectiveState) {
      case 'built':
        return {
          background: selected ? '#f8fafc' : '#ffffff',
          border: selected ? `${borderWidth} solid #2563eb` : '1px solid #e5e7eb',
          boxShadow: selected 
            ? '0 0 0 4px #2563eb' 
            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          borderRadius: '8px',
        };
      
      case 'building':
        return {
          background: '#fef3c7', // Yellow background like unbuilt
          border: selected ? `${borderWidth} solid #ea580c` : '1px dashed #ea580c', // Dashed border to indicate processing
          boxShadow: selected 
            ? '0 0 0 4px #ea580c' 
            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          borderRadius: '8px',
        };
      
      default: // 'unbuilt' or any other state
        return {
          background: '#fef3c7', // Keep yellow background even when selected
          border: selected ? `${borderWidth} solid #ea580c` : '1px solid #fbbf24',
          boxShadow: selected 
            ? '0 0 0 4px #ea580c' 
            : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
          borderRadius: '8px',
        };
    }
  };
  
  if (isZoomedOut) {
    const nodeStyles = getNodeStyles();
    return (
      <div
        className={`custom-node-simple ${selected ? 'selected' : ''}`}
        style={{
          ...nodeStyles,
          borderRadius: '8px',
          padding: '20px',
          width: '260px',
          minHeight: '160px',
          transition: 'all 0.2s ease',
          position: 'relative',
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          transform: selected ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        {/* Building state indicator */}
        {effectiveState === 'building' && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2px solid #ea580c',
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
          }} />
        )}
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        
        {/* Large title text */}
        <div
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: selected ? 
              (effectiveState === 'built' ? '#2563eb' : '#ea580c') : 
              '#1f2937',
            textAlign: 'center',
            lineHeight: '1.2',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '220px',
            marginBottom: '8px',
          }}
          title={node.title}
        >
          {node.title}
        </div>
        
        {/* Simple metadata for zoomed out view */}
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          fontSize: '14px',
          color: '#6b7280',
          fontWeight: '500',
          alignItems: 'center'
        }}>
          {(() => {
            const children = getNodeChildren(node.id);
            return children.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Folder size={14} />
                <span>{children.length}</span>
              </div>
            );
          })()}
          {node.properties && node.properties.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Settings size={14} />
              <span>{node.properties.length}</span>
            </div>
          )}
        </div>
        
        {/* Handles for connections */}
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: selected ? 
              (effectiveState === 'built' ? '#2563eb' : '#ea580c') : 
              '#6b7280',
            width: selected ? '10px' : '8px',
            height: selected ? '10px' : '8px',
            border: selected ? '1px solid #ffffff' : 'none',
            boxShadow: selected ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: selected ? 
              (effectiveState === 'built' ? '#2563eb' : '#ea580c') : 
              '#6b7280',
            width: selected ? '10px' : '8px',
            height: selected ? '10px' : '8px',
            border: selected ? '1px solid #ffffff' : 'none',
            boxShadow: selected ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
          }}
        />
      </div>
    );
  }
  
  // Full detailed view when zoomed in
  const nodeStyles = getNodeStyles();
  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        ...nodeStyles,
        borderRadius: '8px',
        padding: '20px',
        width: '260px',
        minHeight: '160px',
        transition: 'all 0.2s ease',
        position: 'relative',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transform: selected ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Building state indicator */}
      {effectiveState === 'building' && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          border: '2px solid #ea580c',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
        }} />
      )}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      
      {/* Main content area */}
      <div style={{ flex: 1 }}>
        {/* Title */}
        <div
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: selected ? 
              (effectiveState === 'built' ? '#2563eb' : '#ea580c') : 
              '#1f2937',
            marginBottom: '12px',
            lineHeight: '1.4',
          }}
        >
          {node.title}
        </div>
        
        {/* Prompt preview */}
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            marginBottom: '16px',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
          title={node.prompt}
        >
          {node.prompt}
        </div>
      </div>
      
      {/* Bottom metadata section */}
      <div style={{ 
        borderTop: '1px solid #f3f4f6', 
        paddingTop: '12px',
        marginTop: '12px'
      }}>
        {/* Children count */}
        {(() => {
          const children = getNodeChildren(node.id);
          return children.length > 0 && (
            <div
              style={{
                fontSize: '12px',
                color: '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
              }}
            >
              <Folder size={12} />
              {children.length} child{children.length !== 1 ? 'ren' : ''}
            </div>
          );
        })()}
        
        {/* Properties count */}
        {node.properties && node.properties.length > 0 && (
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Settings size={12} />
            {node.properties.length} propert{node.properties.length !== 1 ? 'ies' : 'y'}
          </div>
        )}
      </div>
      
      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#3b82f6',
          width: '8px',
          height: '8px',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#3b82f6',
          width: '8px',
          height: '8px',
        }}
      />
    </div>
  );
}

function GraphCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Track nodes being dragged locally to avoid overwriting their position from incoming graph updates
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isBuildingSelected, setIsBuildingSelected] = useState(false);
  // Multi-selection lives in the global store so sidebar can reflect it
  const { setSelectedNode, selectedNodeId, selectedNode, selectedNodeIds, setSelectedNodeIds } = useProjectStore();
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  // Tool modes: 'select', 'pan', 'add-node'
  const [currentTool, setCurrentTool] = useState<'select' | 'pan' | 'add-node'>('select');
  // Viewport transform for converting flow coords <-> screen coords
  const viewport = useViewport();
  // Use the store for graph data with Supabase integration
  const { 
    graph, 
    graphLoading: loading, 
    graphError: error, 
    refreshGraph, 
    connectToGraphEvents, 
    disconnectFromGraphEvents,
    updateNodeInSupabase,
    deleteNodeFromSupabase
  } = useProjectStore();

  // Access React Flow instance for programmatic viewport control
  const reactFlow = useReactFlow();
  // Auth removed; define placeholder to avoid TS errors
  const user: any = null;

  // Generate unique node ID
  const generateNodeId = useCallback(() => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `node-${timestamp}${random}`;
  }, []);

  // Create a new empty node at the specified position
  const createNewNode = useCallback(async (position: { x: number; y: number }) => {
    if (!graph) return;

    const newNodeId = generateNodeId();
    const newNode: GraphNode = {
      id: newNodeId,
      title: 'New Node',
      prompt: '',
      state: 'unbuilt',
      position: { x: position.x, y: position.y, z: 0 }
    };

    try {
      // Update local graph state immediately for instant feedback
      const updatedGraph = {
        ...graph,
        nodes: [...graph.nodes, newNode]
      };
      useProjectStore.setState({ graph: updatedGraph });

      // Create ReactFlow node and add to local state
      const reactFlowNode: Node = {
        id: newNodeId,
        position,
        data: {
          label: newNode.title,
          node: newNode,
          state: newNode.state || "unbuilt",
          properties: newNode.properties || []
        },
        type: 'custom',
        selected: true,
      };
      setNodes((nds) => [...nds, reactFlowNode]);

      // Persist to Supabase (this will trigger real-time updates that will sync everything)
      await updateNodeInSupabase(newNodeId, newNode);

      // Select the new node
      setSelectedNode(newNodeId, newNode);
      setSelectedNodeIds([newNodeId]);

      console.log('✅ Created new node:', newNodeId);
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
    }
  }, [graph, generateNodeId, updateNodeInSupabase, setSelectedNode, setSelectedNodeIds, setNodes]);

  // Connect to graph events for real-time updates
  useEffect(() => {
    connectToGraphEvents();
    return () => {
      disconnectFromGraphEvents();
    };
  }, [connectToGraphEvents, disconnectFromGraphEvents]);

  // Keep a ref of latest nodes to avoid effect dependency on nodes (prevents loops)
  const latestNodesRef = useRef<Node[]>([]);
  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

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

  // Function to build the selected node
  const buildSelectedNode = useCallback(async () => {
    if (!selectedNode) {
      console.error('❌ No node selected');
      return;
    }

    setIsBuildingSelected(true);
    try {
      // Determine which IDs to build: all multi-selected if present, else the focused node
      const idsToBuild = (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0)
        ? selectedNodeIds
        : [selectedNode.id];

      // Optimistic UI update: mark selected nodes as building locally
      try {
        const current = useProjectStore.getState();
        const g = current.graph;
        if (g) {
          const idSet = new Set(idsToBuild);
          const updatedNodes = g.nodes.map((n: any) => idSet.has(n.id) ? { ...n, state: 'building' } : n);
          const updatedGraph = { ...g, nodes: updatedNodes } as any;
          const updatedSelected = idSet.has(selectedNode.id) ? { ...selectedNode, state: 'building' } : selectedNode;
          useProjectStore.setState({ graph: updatedGraph, selectedNode: updatedSelected as any });
        }
      } catch {}

      // Persist each selected node state to "building"
      for (const id of idsToBuild) {
        try { await updateNodeInSupabase(id, { state: 'building' }); } catch {}
      }

      const response = await fetch('/api/agent-request/edit-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: {
            role: 'user',
            content: (idsToBuild.length > 1)
              ? `Build ${idsToBuild.length} selected nodes`
              : `${selectedNode.state === 'built' ? 'Rebuild' : 'Implement'} this node: ${selectedNode.title}`,
            variables: {}
          },
          // Unified endpoint parameters
          selectedNodeId: selectedNode.id,
          selectedNodeTitle: selectedNode.title,
          selectedNodePrompt: selectedNode.prompt,
          // Pass all selected node IDs so the agent gets the full selection
          selectedNodeIds: idsToBuild,
          // Keep legacy single-node param for compatibility
          nodeId: selectedNode.id
        }),
      });

      if (response.ok) {
        // Selected node build queued successfully
        // Do not set node to built here; worker/agent will update state via MCP later.
      } else {
        console.error('❌ Failed to build selected nodes');
        // Revert node states on failure
        for (const id of (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0) ? selectedNodeIds : [selectedNode.id]) {
          try { await updateNodeInSupabase(id, { state: (selectedNode && selectedNode.id === id) ? (selectedNode.state || 'unbuilt') : 'unbuilt' }); } catch {}
        }
      }
    } catch (error) {
      console.error('❌ Error building selected nodes:', error);
      // Revert node states on error
      for (const id of (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0) ? selectedNodeIds : [selectedNode.id]) {
        try { await updateNodeInSupabase(id, { state: (selectedNode && selectedNode.id === id) ? (selectedNode.state || 'unbuilt') : 'unbuilt' }); } catch {}
      }
    } finally {
      setIsBuildingSelected(false);
    }
  }, [selectedNode, selectedNodeIds, updateNodeInSupabase]);

  // Connection is managed by the store

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    // Always get the fresh node data from the current graph state
    const freshGraphNode = graph?.nodes?.find(n => n.id === node.id);
    const reactFlowNode = node.data?.node as GraphNode;

    if (!freshGraphNode) return;

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
    }
  }, [setSelectedNode, graph, selectedNodeId, selectedNodeIds, setSelectedNodeIds]);

  // Process graph data and create ReactFlow nodes/edges (with auto tree layout for missing positions)
  useEffect(() => {
    const rebuild = async () => {
      if (!graph || !graph.nodes) {
        setNodes([]);
        setEdges([]);
        return;
      }

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

      // Convert graph nodes to ReactFlow nodes (preserve position if dragging)
      const reactFlowNodes: Node[] = graph.nodes.map((node) => {
        const isDragging = draggingNodeIdsRef.current.has(node.id);
        const position = isDragging
          ? (currentPositions.get(node.id) || nodePositions.get(node.id) || { x: 0, y: 0 })
          : (nodePositions.get(node.id) || { x: 0, y: 0 });

        const backgroundColor = node.properties?.find(p => p.id === 'background-color')?.value;
        // Create ReactFlow node with styling

        return {
          id: node.id,
          position,
          data: {
            label: node.title,
            node: node,
            state: node.state || "unbuilt",
            properties: node.properties || []
          },
          type: 'custom',
          selected: (selectedNodeIds && selectedNodeIds.length > 0) ? selectedNodeIds.includes(node.id) : selectedNodeId === node.id,
        };
      });

      // Create edges from both the edges array and children relationships
      const reactFlowEdges: Edge[] = [];
      const addedEdges = new Set<string>();

      if ((graph as any).edges && (graph as any).edges.length > 0) {
        (graph as any).edges.forEach((edge: any) => {
          const edgeId = `${edge.source}-${edge.target}`;
          if (!addedEdges.has(edgeId)) {
            reactFlowEdges.push({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              type: 'smoothstep',
              style: { stroke: '#9ca3af', strokeWidth: 2 },
              animated: false,
            });
            addedEdges.add(edgeId);
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
  }, [graph, setNodes, setEdges, selectedNodeId, selectedNodeIds]);

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

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Throttle position broadcasts to prevent spam
  const lastPositionBroadcast = useRef<{ [nodeId: string]: number }>({});
  const POSITION_BROADCAST_THROTTLE = 50; // Broadcast every 50ms max for smooth real-time

  // Handle continuous node position changes during drag
  const onNodeDragStart = useCallback((event: any, node: Node) => {
    const graphNode = node.data?.node as GraphNode;
    if (!graphNode) return;
    draggingNodeIdsRef.current.add(graphNode.id);
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

  // Handle final node position changes (drag stop) - ensure final Supabase update
  const onNodeDragStop = useCallback(async (event: any, node: Node) => {
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;

      // Persist final position via graph API
      try {
        await updateNodeInSupabase(graphNode.id, {
          position: { x: node.position.x, y: node.position.y, z: 0 }
        });
        // Node position saved
      } catch (e) {
        console.warn(`⚠️ Final position update failed for ${graphNode.id}:`, e);
      }
    } catch (error) {
      console.error('Error saving final node position:', error);
    }
    // Release drag lock after persistence
    const graphNode = node.data?.node as GraphNode;
    if (graphNode) draggingNodeIdsRef.current.delete(graphNode.id);
  }, [updateNodeInSupabase]);

  // Handle background mouse down for drag selection or node creation
  const onPaneMouseDown = useCallback((event: React.MouseEvent) => {
    // Only start selection on left mouse button
    if (event.button !== 0) return;
    // Ignore clicks that originate from nodes, edges, or handles
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.react-flow__edge') || target.closest('.react-flow__handle')) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

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

    // Only handle selection in select mode
    if (currentTool === 'select') {
      setIsDraggingSelect(true);
      setDragStart({ x, y });
      setDragEnd({ x, y });
      // If not multi-select modifier, clear current selection at drag start
      if (!(event.shiftKey || event.metaKey || event.ctrlKey)) {
        setSelectedNodeIds([]);
        setSelectedNode(null, null);
      }
    }

    event.preventDefault();
  }, [currentTool, reactFlow, createNewNode, setSelectedNode, setSelectedNodeIds]);

  const onPaneMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDraggingSelect || !dragStart) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setDragEnd({ x, y });
    event.preventDefault();
  }, [isDraggingSelect, dragStart]);

  const onPaneMouseUp = useCallback((event?: React.MouseEvent) => {
    if (!isDraggingSelect || !dragStart || !dragEnd) {
      setIsDraggingSelect(false);
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    // Calculate selection rectangle in screen coordinates
    const selectionRect = getRectFromPoints(dragStart, dragEnd);
    const width = selectionRect.width;
    const height = selectionRect.height;

    // Find nodes within the selection rectangle (convert node positions to screen coords)
    const selectedNodesInRect: string[] = [];
    const { x: viewportX, y: viewportY, zoom } = viewport;
    nodes.forEach(node => {
      const centerFlow = { x: node.position.x + 130, y: node.position.y + 80 };
      const centerScreen = { x: centerFlow.x * zoom + viewportX, y: centerFlow.y * zoom + viewportY };
      if (isPointInRect(centerScreen, selectionRect)) {
        selectedNodesInRect.push(node.id);
      }
    });

    const isMulti = Boolean(event && (event.shiftKey || event.metaKey || event.ctrlKey));
    const hasDrag = width >= 3 || height >= 3;
    if (hasDrag) {
      if (selectedNodesInRect.length > 0) {
        if (isMulti) {
          // Merge with existing selection
          const prev = selectedNodeIds || [];
          const newSelection = [...new Set([...prev, ...selectedNodesInRect])];
          const firstNode = graph?.nodes?.find(n => n.id === newSelection[0]);
          if (firstNode) setSelectedNode(newSelection[0], firstNode);
          setSelectedNodeIds(newSelection);
        } else {
          // Replace selection
          const firstNode = graph?.nodes?.find(n => n.id === selectedNodesInRect[0]);
          if (firstNode) setSelectedNode(selectedNodesInRect[0], firstNode);
          setSelectedNodeIds(selectedNodesInRect);
        }
      } else if (!isMulti) {
        // Dragged but selected nothing -> clear selection
        setSelectedNode(null, null);
        setSelectedNodeIds([]);
      }
    } else {
      // Treat as background click: clear selection if no modifier
      if (!isMulti) {
        setSelectedNode(null, null);
        setSelectedNodeIds([]);
      }
    }

    setIsDraggingSelect(false);
    setDragStart(null);
    setDragEnd(null);
    if (event) event.preventDefault();
  }, [isDraggingSelect, dragStart, dragEnd, nodes, graph, viewport, selectedNodeIds, setSelectedNode, setSelectedNodeIds]);

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

  // Show empty state when no nodes are present
  if (nodes.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100%',
        fontSize: '16px',
        color: '#6b7280',
        textAlign: 'center',
        gap: '12px'
      }}>
        <div style={{ fontWeight: '500' }}>No Graph Available</div>
        <div style={{ fontSize: '14px', maxWidth: '500px' }}>
          Generate a new app to visualize your project structure
        </div>
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
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
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
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <MiniMap 
          nodeColor={(node: any) => {
            const nd = node.data?.node;
            const nodeState = nd?.state === 'building'
              ? 'building'
              : nd?.state === 'built'
                ? 'built'
                : 'unbuilt';
            if (nodeState === 'built') return '#9ca3af';
            if (nodeState === 'building') return '#ea580c';
            return '#fbbf24'; // unbuilt
          }}
        />
        <Controls />
        <Background color="#374151" gap={20} />
      </ReactFlow>

      {/* Selection rectangle overlay */}
      {isDraggingSelect && dragStart && dragEnd && (
        (() => {
          const x = Math.min(dragStart.x, dragEnd.x);
          const y = Math.min(dragStart.y, dragEnd.y);
          const w = Math.abs(dragStart.x - dragEnd.x);
          const h = Math.abs(dragStart.y - dragEnd.y);
          return (
            <div
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: h,
                border: '2px solid #3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            />
          );
        })()
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
          title="Select Tool - Click to select nodes, drag to select multiple"
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
          title="Pan Tool - Click and drag to pan the view"
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
          <StickyNote className="w-4 h-4" />
        </Button>
      </div>

      {/* Action Buttons - Right Side */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '8px',
        zIndex: 1000,
      }}>
        {/* Build/Rebuild Selected Node Button - only show when a node is selected */}
        {selectedNode && (
          <Button
            onClick={buildSelectedNode}
            disabled={isBuildingSelected || selectedNode.state === 'building'}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title={(isBuildingSelected || selectedNode.state === 'building') ? "Building selected node..." : `${selectedNode.state === 'built' ? 'Rebuild' : 'Build'} node: ${selectedNode.title}`}
          >
            <Play className="w-4 h-4" />
            {(isBuildingSelected || selectedNode.state === 'building') ? 'Building...' : `${selectedNode.state === 'built' ? 'Rebuild' : 'Build'} Selected`}
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
