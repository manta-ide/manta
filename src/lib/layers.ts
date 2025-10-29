import type { Graph } from '@/app/api/lib/schemas';

/**
 * Apply a layer filter to a graph, filtering nodes and edges by layer name
 */
export function applyLayerToGraph(graph: Graph, layerName: string): Graph {
  // Filter nodes by layer, but exclude ghosted nodes (nodes marked for deletion)
  // Also include nodes without a layer if filtering for a special "(No Layer)" category
  const filteredNodes = graph.nodes.filter(node => {
    if ((node as any).state === 'ghosted') return false;
    
    const nodeLayer = (node as any).layer;
    if (layerName === '(No Layer)') {
      // Show nodes without a layer property
      return !nodeLayer;
    }
    return nodeLayer === layerName;
  });

  console.log(`🔍 Filtered ${filteredNodes.length} nodes for layer "${layerName}"`);

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

/**
 * Get all unique layers that exist in the graph
 */
export function getAvailableLayers(graph: Graph): string[] {
  const layerSet = new Set<string>();
  let hasNodesWithoutLayer = false;
  
  graph.nodes.forEach(node => {
    if ((node as any).state === 'ghosted') return;
    
    const layer = (node as any).layer;
    if (layer && typeof layer === 'string') {
      layerSet.add(layer);
    } else {
      hasNodesWithoutLayer = true;
    }
  });
  
  const layers = Array.from(layerSet).sort();
  
  // Add a special "(No Layer)" entry if there are nodes without a layer
  if (hasNodesWithoutLayer) {
    layers.push('(No Layer)');
  }
  
  console.log(`📊 Available layers:`, layers);
  return layers;
}