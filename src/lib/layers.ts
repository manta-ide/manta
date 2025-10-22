import type { Graph } from '@/app/api/lib/schemas';

export type LayerDefinition = {
  name: string;
  nodeIds: string[]; // Which nodes to show in this layer
  positions: Record<string, { x: number; y: number; z?: number }>; // Custom positions for nodes
  createdAt: string;
  updatedAt: string;
  // Legacy field for backward compatibility - edges are now automatically determined
  edgeIds?: string[];
};

// Re-export server functions for use in API routes (only import what we need)
export type { LayerDefinition as ServerLayerDefinition } from './layers-server';

/**
 * Apply a layer definition to a graph, filtering nodes and edges and applying custom positions
 */
export function applyLayerToGraph(graph: Graph, layerDefOrName: LayerDefinition | string): Graph {
  // Handle C4 layers specially - they filter by node type
  const c4Layers = ['system', 'container', 'component', 'code'];
  if (typeof layerDefOrName === 'string' && c4Layers.includes(layerDefOrName)) {
    const c4Type = layerDefOrName as 'system' | 'container' | 'component' | 'code';

    // Filter nodes by C4 type
    const filteredNodes = graph.nodes.filter(node => (node as any).type === c4Type);

    // Create a set of filtered node IDs for efficient lookup
    const nodeIdSet = new Set(filteredNodes.map(node => node.id));

    // Automatically include edges where both source and target nodes are in the filtered set
    const filteredEdges = (graph.edges || []).filter(edge =>
      nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges
    };
  }

  // Handle regular layer definitions
  const layerDef = layerDefOrName as LayerDefinition;

  // Filter nodes to only those in the layer
  const filteredNodes = graph.nodes.filter(node => layerDef.nodeIds.includes(node.id));

  // Create a set of node IDs for efficient lookup
  const nodeIdSet = new Set(layerDef.nodeIds);

  // Include edges where both source and target nodes are in the layer
  // For backward compatibility, check if layerDef has edgeIds (old format)
  const filteredEdges = (graph.edges || []).filter(edge => {
    // If layer has explicit edgeIds (old format), use those
    if ('edgeIds' in layerDef && Array.isArray(layerDef.edgeIds)) {
      return layerDef.edgeIds.includes(edge.id) &&
             nodeIdSet.has(edge.source) &&
             nodeIdSet.has(edge.target);
    }
    // Otherwise, automatically include edges where both nodes are in the layer
    return nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target);
  });

  // Apply custom positions from the layer
  const nodesWithPositions = filteredNodes.map(node => {
    const customPosition = layerDef.positions[node.id];
    if (customPosition) {
      return {
        ...node,
        position: { ...customPosition }
      };
    }
    return node;
  });

  return {
    nodes: nodesWithPositions,
    edges: filteredEdges
  };
}