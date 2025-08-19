import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useProjectStore } from '@/lib/store';
import { GraphNode, Graph } from '@/app/api/lib/schemas';

// Custom node component
function CustomNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as GraphNode;
  const { zoom } = useViewport();
  
  // Show simplified view when zoomed out
  const isZoomedOut = zoom < 0.8;
  
  // Determine background color based on built status
  const getBackgroundColor = () => {
    return node.built ? '#EEF3FB' : '#FFF7BD'; // Light green for built, light yellow for unbuilt
  };
  
  if (isZoomedOut) {
    return (
      <div
        className={`custom-node-simple ${selected ? 'selected' : ''}`}
        style={{
          background: getBackgroundColor(),
          border: selected ? '10px solid #2563eb' : '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          width: '260px',
          minHeight: '160px',
          boxShadow: selected 
            ? '0 0 0 4px rgba(37, 99, 235, 0.2), 0 20px 40px rgba(37, 99, 235, 0.3)' 
            : '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.3s ease',
          position: 'relative',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          transform: selected ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        {/* Large title text */}
        <div
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#1f2937',
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
          fontWeight: '500'
        }}>
          {node.children && node.children.length > 0 && (
            <span>📁 {node.children.length}</span>
          )}
          {node.properties && node.properties.length > 0 && (
            <span>⚙️ {node.properties.length}</span>
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
  
  // Full detailed view when zoomed in
  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        background: getBackgroundColor(),
        border: selected ? '4px solid #2563eb' : '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
        width: '260px',
        minHeight: '160px',
        boxShadow: selected 
          ? '0 0 0 4px rgba(37, 99, 235, 0.2), 0 20px 40px rgba(37, 99, 235, 0.3)' 
          : '0 4px 6px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.3s ease',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Main content area */}
      <div style={{ flex: 1 }}>
        {/* Title */}
        <div
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#1f2937',
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
            <span>📁</span>
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
            <span>⚙️</span>
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
  const { setSelectedNode, selectedNodeId } = useProjectStore();
  
  // Use the store for graph data
  const { graph, graphLoading: loading, graphError: error, refreshGraph, connectToGraphEvents, disconnectFromGraphEvents } = useProjectStore();

  // Function to delete the graph
  const deleteGraph = useCallback(async () => {
    if (!confirm('Are you sure you want to delete the graph? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/backend/graph-api', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        console.log('✅ Graph deleted successfully');
        // The graph will be automatically updated via SSE
      } else {
        console.error('❌ Failed to delete graph');
      }
    } catch (error) {
      console.error('❌ Error deleting graph:', error);
    }
  }, []);

  // Connect to graph events on mount
  useEffect(() => {
    connectToGraphEvents();
    return () => {
      disconnectFromGraphEvents();
    };
  }, [connectToGraphEvents, disconnectFromGraphEvents]);

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

    // Create a tree layout for the nodes
    const nodePositions = new Map<string, { x: number; y: number }>();
    const nodeDepths = new Map<string, number>();
    const nodeWidths = new Map<string, number>();
    
    // Calculate depths and widths for each node
    const calculateNodeLayout = (nodeId: string, depth: number = 0): number => {
      if (nodeDepths.has(nodeId)) {
        return nodeWidths.get(nodeId) || 0;
      }
      
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return 0;
      
      nodeDepths.set(nodeId, depth);
      
      if (!node.children || node.children.length === 0) {
        nodeWidths.set(nodeId, 1);
        return 1;
      }
      
      let totalWidth = 0;
      node.children.forEach(child => {
        totalWidth += calculateNodeLayout(child.id, depth + 1);
      });
      
      nodeWidths.set(nodeId, totalWidth);
      return totalWidth;
    };
    
    // Calculate layout starting from root (first node)
    const rootId = graph.nodes.length > 0 ? graph.nodes[0].id : null;
    if (!rootId) return;
    
    const totalTreeWidth = calculateNodeLayout(rootId);
    
    // Position nodes based on the calculated layout with better tree structure
    const positionNodes = (nodeId: string, startX: number, depth: number): number => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return 0;
      
      const width = nodeWidths.get(nodeId) || 1;
      
      // For better tree structure, use tighter spacing for children
      const horizontalSpacing = 320; // Increased for more vertical layout
      const verticalSpacing = 420; // Reduced for tighter vertical spacing
      
      // Calculate x position to center the node over its children
      const x = startX + (width - 1) * horizontalSpacing / 2;
      const y = depth * verticalSpacing + 60;
      
      nodePositions.set(nodeId, { x, y });
      
      if (!node.children || node.children.length === 0) {
        return 1;
      }
      
      // Position children with tighter spacing and better distribution
      let currentX = startX;
      node.children.forEach(child => {
        const childWidth = nodeWidths.get(child.id) || 1;
        currentX += positionNodes(child.id, currentX, depth + 1) * horizontalSpacing;
      });
      
      return width;
    };
    
    // Center the tree by calculating the starting position
    const treeWidth = totalTreeWidth * 320; // Use the same spacing as in positioning
    const startX = (1200 - treeWidth) / 2; // Use a fixed width instead of window.innerWidth
    
    // Start positioning from root (first node)
    positionNodes(rootId, startX, 0);
    
    // Convert graph nodes to ReactFlow nodes
    const reactFlowNodes: Node[] = graph.nodes.map((node) => {
      const position = nodePositions.get(node.id) || { x: 0, y: 0 };
      return {
        id: node.id,
        position,
        data: { 
          label: node.title,
          node: node,
          built: node.built || false,
          properties: node.properties || []
        },
        type: 'custom',
        selected: selectedNodeId === node.id, // Set initial selection state
      };
    });

    // Create edges based on children relationships
    const reactFlowEdges: Edge[] = [];
    graph.nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          reactFlowEdges.push({
            id: `${node.id}-${child.id}`,
            source: node.id,
            target: child.id,
            type: 'smoothstep',
            style: { 
              stroke: '#3b82f6', 
              strokeWidth: 3,
              strokeDasharray: '5,5',
            },
            animated: false,
          });
        });
      }
    });

    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);
  }, [graph, selectedNodeId, setNodes, setEdges]);

  // Update node selection without re-rendering the whole graph
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: selectedNodeId === node.id,
      }))
    );
  }, [selectedNodeId, setNodes]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

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
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        minZoom={0.1}
        maxZoom={2}
      >
        <MiniMap 
          style={{ background: '#f8f9fa' }}
          nodeColor={(node) => {
            return node.data?.built ? '#10b981' : '#6b7280';
          }}
        />
        <Controls />
        <Background color="#f8f9fa" gap={20} />
      </ReactFlow>
      
      {/* Delete Graph Button */}
      <button
        onClick={deleteGraph}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: '1px solid #ef4444',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          color: '#ef4444',
          fontWeight: '500',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          e.currentTarget.style.color = '#dc2626';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
          e.currentTarget.style.color = '#ef4444';
        }}
        title="Delete graph"
      >
        🗑️ Delete Graph
      </button>
    </div>
  );
}

export default GraphView;