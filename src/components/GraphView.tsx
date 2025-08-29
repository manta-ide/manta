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
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useProjectStore } from '@/lib/store';
import { GraphNode, Graph } from '@/app/api/lib/schemas';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw, Trash2, Folder, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabaseRealtimeService } from '@/lib/supabase-realtime';

// Custom node component
function CustomNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as GraphNode;
  const { zoom } = useViewport();
  
  // Show simplified view when zoomed out
  const isZoomedOut = zoom < 0.8;
  
  // Determine styling based on node state (built/unbuilt/building)
  const getNodeStyles = () => {
    const borderWidth = isZoomedOut ? '3px' : '0px';
    
    switch (node.state) {
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
        {node.state === 'building' && (
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
              (node.state === 'built' ? '#2563eb' : '#ea580c') : 
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
          {node.children && node.children.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Folder size={14} />
              <span>{node.children.length}</span>
            </div>
          )}
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
              (node.state === 'built' ? '#2563eb' : '#ea580c') : 
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
              (node.state === 'built' ? '#2563eb' : '#ea580c') : 
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
      {node.state === 'building' && (
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
      
      {/* Main content area */}
      <div style={{ flex: 1 }}>
        {/* Title */}
        <div
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: selected ? 
              (node.state === 'built' ? '#2563eb' : '#ea580c') : 
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
        {node.children && node.children.length > 0 && (
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
            {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
          </div>
        )}
        
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

function GraphView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // Track nodes being dragged locally to avoid overwriting their position from incoming graph updates
  const draggingNodeIdsRef = useRef<Set<string>>(new Set());
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isBuildingSelected, setIsBuildingSelected] = useState(false);
  const { setSelectedNode, selectedNodeId, selectedNode } = useProjectStore();
  const { user } = useAuth();
  
  // Use the store for graph data with Supabase integration
  const { 
    graph, 
    graphLoading: loading, 
    graphError: error, 
    refreshGraph, 
    connectToGraphEvents, 
    disconnectFromGraphEvents,
    supabaseConnected,
    updateNodeInSupabase,
    deleteNodeFromSupabase
  } = useProjectStore();

  // Monitor Supabase connection status
  useEffect(() => {
    console.log('📊 GraphView: Connection status check:', {
      user: user ? { id: user.id, email: user.email } : null,
      supabaseConnected,
      hasUserId: !!user?.id
    });
    
    if (!user?.id) {
      console.log('⚠️ GraphView: No user ID available');
    } else if (supabaseConnected) {
      console.log('✅ GraphView: Supabase connected');
    } else {
      console.log('🔄 GraphView: Waiting for Supabase connection (handled by AuthProvider)');
    }
  }, [user?.id, supabaseConnected]);

  // Keep a ref of latest nodes to avoid effect dependency on nodes (prevents loops)
  const latestNodesRef = useRef<Node[]>([]);
  useEffect(() => {
    latestNodesRef.current = nodes;
  }, [nodes]);

  // Function to delete the graph
  const deleteGraph = useCallback(async () => {
    if (!confirm('Are you sure you want to delete the graph? This action cannot be undone.')) {
      return;
    }

    try {
      // Try Supabase first if connected
      if (supabaseConnected && graph?.nodes) {
        console.log('🗑️ Deleting graph via Supabase...');
        
        // Delete all nodes (this will cascade delete properties and edges)
        for (const node of graph.nodes) {
          try {
            await deleteNodeFromSupabase(node.id);
            console.log(`✅ Node ${node.id} deleted from Supabase`);
          } catch (nodeError) {
            console.warn(`⚠️ Failed to delete node ${node.id} from Supabase:`, nodeError);
          }
        }
        
        console.log('✅ Graph deleted successfully via Supabase');
      } else {
        throw new Error('Supabase not connected, using backend API');
      }
    } catch (supabaseError) {
      console.warn('⚠️ Supabase delete failed, using backend API:', supabaseError);
      
      // Fallback to backend API
      try {
        const response = await fetch('/api/backend/graph-api', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          console.log('✅ Graph deleted successfully via backend API');
        } else {
          console.error('❌ Failed to delete graph via backend API');
        }
      } catch (backendError) {
        console.error('❌ Error deleting graph via backend API:', backendError);
      }
    }
  }, [supabaseConnected, graph, deleteNodeFromSupabase]);

  // Function to rebuild the full graph
  const rebuildFullGraph = useCallback(async () => {
    if (!confirm('Are you sure you want to rebuild the entire graph? This will regenerate code for all nodes.')) {
      return;
    }

    setIsRebuilding(true);
    try {
      const response = await fetch('/api/backend/agent-request/build-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: {
            role: 'user',
            content: 'Rebuild the entire graph and generate code for all nodes',
            variables: {}
          },
          rebuildAll: true
        }),
      });

      if (response.ok) {
        console.log('✅ Full graph rebuild started successfully');
        // The graph will be automatically updated via SSE
      } else {
        console.error('❌ Failed to rebuild graph');
      }
    } catch (error) {
      console.error('❌ Error rebuilding graph:', error);
    } finally {
      setIsRebuilding(false);
    }
  }, []);

  // Function to build the selected node
  const buildSelectedNode = useCallback(async () => {
    if (!selectedNode) {
      console.error('❌ No node selected');
      return;
    }

    setIsBuildingSelected(true);
    try {
      // Update node state to "building" - try Supabase first
      try {
        if (supabaseConnected) {
          await updateNodeInSupabase(selectedNode.id, { state: 'building' });
          console.log('✅ Node state updated to building via Supabase');
        } else {
          throw new Error('Supabase not connected');
        }
      } catch (supabaseError) {
        console.warn('⚠️ Supabase update failed, using backend API:', supabaseError);
        
        // Fallback to backend API for state update
        const updateStateRes = await fetch('/api/backend/graph-api', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            nodeId: selectedNode.id, 
            state: 'building' 
          })
        });
        
        if (!updateStateRes.ok) {
          console.error('Failed to update node state to building');
        }
      }

      const response = await fetch('/api/backend/agent-request/build-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: {
            role: 'user',
            content: `Build and generate code for the node: ${selectedNode.title}`,
            variables: {}
          },
          nodeId: selectedNode.id
        }),
      });

      if (response.ok) {
        console.log('✅ Selected node build started successfully');
        
        // Update node state to "built" on success - try Supabase first
        try {
          if (supabaseConnected) {
            await updateNodeInSupabase(selectedNode.id, { state: 'built' });
            console.log('✅ Node state updated to built via Supabase');
          } else {
            throw new Error('Supabase not connected');
          }
        } catch (supabaseError) {
          console.warn('⚠️ Supabase final update failed, using backend API:', supabaseError);
          
          const finalUpdateRes = await fetch('/api/backend/graph-api', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              nodeId: selectedNode.id, 
              state: 'built' 
            })
          });
          
          if (!finalUpdateRes.ok) {
            console.error('Failed to update node state to built');
          }
        }
      } else {
        console.error('❌ Failed to build selected node');
        
        // Revert node state on failure
        try {
          if (supabaseConnected) {
            await updateNodeInSupabase(selectedNode.id, { state: selectedNode.state || 'unbuilt' });
          }
        } catch (revertError) {
          console.warn('Failed to revert node state:', revertError);
        }
      }
    } catch (error) {
      console.error('❌ Error building selected node:', error);
      
      // Revert node state on error
      try {
        if (supabaseConnected) {
          await updateNodeInSupabase(selectedNode.id, { state: selectedNode.state || 'unbuilt' });
        }
      } catch (revertError) {
        console.warn('Failed to revert node state:', revertError);
      }
    } finally {
      setIsBuildingSelected(false);
    }
  }, [selectedNode, supabaseConnected, updateNodeInSupabase]);

  // Connection is managed centrally by AuthProvider; avoid duplicate connections here

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    // Find the corresponding graph node data
    const graphNode = node.data?.node as GraphNode;
    if (graphNode) {
      setSelectedNode(node.id, graphNode);
    }
  }, [setSelectedNode]);

  // Process graph data and create ReactFlow nodes/edges
  useEffect(() => {
    if (!graph || !graph.nodes) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Always use positions from database (position_x, position_y from Supabase)
    console.log('📊 GraphView: Using stored positions from database');
    let nodePositions = new Map<string, { x: number; y: number }>();
    
    graph.nodes.forEach(node => {
      if (node.position) {
        nodePositions.set(node.id, { x: node.position.x, y: node.position.y });
      } else {
        // Fallback to default position if no position stored
        console.warn(`⚠️ Node ${node.id} has no stored position, using default`);
        nodePositions.set(node.id, { x: 100, y: 100 });
      }
    });
    
    // Current positions map from latest nodes to preserve positions without re-triggering this effect
    const currentPositions = new Map<string, { x: number; y: number }>();
    for (const n of latestNodesRef.current) currentPositions.set(n.id, n.position as any);

    // Convert graph nodes to ReactFlow nodes (preserve position if dragging)
    const reactFlowNodes: Node[] = graph.nodes.map((node) => {
      const isDragging = draggingNodeIdsRef.current.has(node.id);
      const position = isDragging
        ? (currentPositions.get(node.id) || nodePositions.get(node.id) || { x: 0, y: 0 })
        : (nodePositions.get(node.id) || { x: 0, y: 0 });
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
        selected: selectedNodeId === node.id, // Set initial selection state
      };
    });

    // Create edges from both the edges array and children relationships
    const reactFlowEdges: Edge[] = [];
    const addedEdges = new Set<string>();

    // First, add edges from the graph.edges array (from Supabase)
    if (graph.edges && graph.edges.length > 0) {
      graph.edges.forEach(edge => {
        const edgeId = `${edge.source}-${edge.target}`;
        if (!addedEdges.has(edgeId)) {
          reactFlowEdges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            style: { 
              stroke: '#9ca3af', 
              strokeWidth: 2,
            },
            animated: false,
          });
          addedEdges.add(edgeId);
        }
      });
    }

    // Then, add edges from children relationships (fallback or additional)
    graph.nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          const edgeId = `${node.id}-${child.id}`;
          if (!addedEdges.has(edgeId)) {
            reactFlowEdges.push({
              id: `${node.id}-${child.id}`,
              source: node.id,
              target: child.id,
              type: 'smoothstep',
              style: { 
                stroke: '#9ca3af', 
                strokeWidth: 2,
              },
              animated: false,
            });
            addedEdges.add(edgeId);
          }
        });
      }
    });

    console.log(`📊 GraphView: Created ${reactFlowEdges.length} visual edges from graph data`);
    if (graph.edges) {
      console.log(`📊 GraphView: Graph has ${graph.edges.length} edges in data`);
    }

    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);

    // Select root node by default if nothing is selected
    if (!selectedNodeId && reactFlowNodes.length > 0) {
      const root = reactFlowNodes[0];
      setSelectedNode(root.id, graph.nodes.find(n => n.id === root.id) as any);
    }
  }, [graph, setNodes, setEdges]);

  // Update node selection without re-rendering the whole graph
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: selectedNodeId === node.id,
      }))
    );
  }, [selectedNodeId, setNodes]);

  // Apply incoming broadcasted position updates directly to ReactFlow nodes
  useEffect(() => {
    const unsubscribe = supabaseRealtimeService.onGraphChange((event) => {
      if (event.type === 'node_position_updated' && event.fromBroadcast && event.position) {
        setNodes((existing) => existing.map((n) => (
          n.id === event.nodeId ? { ...n, position: event.position } : n
        )));
      }
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [setNodes]);

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
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;

      // Throttle broadcasts to prevent spam but keep UI smooth
      const now = Date.now();
      const lastBroadcast = lastPositionBroadcast.current[graphNode.id] || 0;
      
      if (now - lastBroadcast >= POSITION_BROADCAST_THROTTLE && supabaseConnected) {
        lastPositionBroadcast.current[graphNode.id] = now;
        
        // Use broadcast for real-time position updates (non-blocking)
        supabaseRealtimeService.broadcastPosition(graphNode.id, {
          x: node.position.x,
          y: node.position.y
        });
      }
    } catch (error) {
      console.debug('Error during position broadcast:', error);
    }
  }, [supabaseConnected]);

  // Handle final node position changes (drag stop) - ensure final Supabase update
  const onNodeDragStop = useCallback(async (event: any, node: Node) => {
    try {
      const graphNode = node.data?.node as GraphNode;
      if (!graphNode) return;

      console.log(`📍 Node ${graphNode.id} final position:`, node.position);

      // Ensure final position is saved to Supabase (bypass throttle)
      if (supabaseConnected) {
        try {
          await updateNodeInSupabase(graphNode.id, { 
            position: { x: node.position.x, y: node.position.y }
          });
          console.log(`✅ Node ${graphNode.id} final position updated in Supabase`);
        } catch (supabaseError) {
          console.warn(`⚠️ Final Supabase position update failed for ${graphNode.id}:`, supabaseError);
        }
      }
    } catch (error) {
      console.error('Error saving final node position:', error);
    }
    // Release drag lock after persistence
    const graphNode = node.data?.node as GraphNode;
    if (graphNode) draggingNodeIdsRef.current.delete(graphNode.id);
  }, [supabaseConnected, updateNodeInSupabase]);

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
    <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', position: 'relative' }}>
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
        colorMode="dark"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <MiniMap 
          nodeColor={(node: any) => {
            const nodeState = node.data?.node?.state;
            if (nodeState === 'built') return '#9ca3af';
            if (nodeState === 'building') return '#ea580c';
            return '#fbbf24'; // unbuilt
          }}
        />
        <Controls />
        <Background color="#374151" gap={20} />
      </ReactFlow>
      
      {/* Action Buttons */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '8px',
        zIndex: 1000,
      }}>
        {/* Build Selected Node Button - only show when a node is selected */}
        {selectedNode && (
          <Button
            onClick={buildSelectedNode}
            disabled={isBuildingSelected}
            variant="outline"
            size="sm"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title={isBuildingSelected ? "Building selected node..." : `Build node: ${selectedNode.title}`}
          >
            <Play className="w-4 h-4" />
            {isBuildingSelected ? 'Building...' : 'Build Selected'}
          </Button>
        )}
        
        {/* Rebuild Full Graph Button */}
        <Button
          onClick={rebuildFullGraph}
          disabled={isRebuilding}
          variant="outline"
          size="sm"
          className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
          title={isRebuilding ? "Rebuilding graph..." : "Rebuild entire graph and generate code for all nodes"}
        >
          <RotateCcw className={`w-4 h-4 ${isRebuilding ? 'animate-spin' : ''}`} />
          {isRebuilding ? 'Rebuilding...' : 'Rebuild Full Graph'}
        </Button>
        
        {/* Delete Graph Button */}
        <Button
          onClick={deleteGraph}
          variant="outline"
          size="sm"
          className="bg-zinc-800 text-red-400 border-0 hover:bg-red-900/20 hover:text-red-300"
          title="Delete graph"
        >
          <Trash2 className="w-4 h-4" />
          Delete Graph
        </Button>
      </div>
    </div>
  );
}

export default GraphView;