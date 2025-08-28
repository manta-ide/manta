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
  ColorMode,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { useProjectStore } from '@/lib/store';
import { GraphNode, Graph } from '@/app/api/lib/schemas';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw, Trash2, Folder, Settings } from 'lucide-react';

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
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [isBuildingSelected, setIsBuildingSelected] = useState(false);
  const { setSelectedNode, selectedNodeId, selectedNode } = useProjectStore();
  
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
        // The graph will be automatically updated via SSE
      } else {
        console.error('❌ Failed to build selected node');
      }
    } catch (error) {
      console.error('❌ Error building selected node:', error);
    } finally {
      setIsBuildingSelected(false);
    }
  }, [selectedNode]);

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
          state: node.state || "unbuilt",
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
              stroke: '#9ca3af', 
              strokeWidth: 2,
            },
            animated: false,
          });
        });
      }
    });

    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);

    // Select root node by default if nothing is selected
    if (!selectedNodeId && reactFlowNodes.length > 0) {
      const root = reactFlowNodes[0];
      setSelectedNode(root.id, graph.nodes.find(n => n.id === root.id) as any);
    }
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
        colorMode="dark"
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