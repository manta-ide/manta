import type { Graph } from '@/app/api/lib/schemas';

/**
 * Apply a layer filter to a graph, filtering nodes and edges by layer name
 */
export function applyLayerToGraph(graph: Graph, layerName: string): Graph {
  // Filter nodes by layer, but exclude ghosted nodes (nodes marked for deletion)
  const filteredNodes = graph.nodes.filter(node =>
    (node as any).layer === layerName && (node as any).state !== 'ghosted'
  );

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
  
  graph.nodes.forEach(node => {
    const layer = (node as any).layer;
    if (layer && typeof layer === 'string' && (node as any).state !== 'ghosted') {
      layerSet.add(layer);
    }
  });
  
  return Array.from(layerSet).sort();
}