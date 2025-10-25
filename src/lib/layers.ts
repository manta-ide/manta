import type { Graph } from '@/app/api/lib/schemas';

/**
 * Apply a C4 layer to a graph, filtering nodes and edges by C4 architectural level
 */
export function applyLayerToGraph(graph: Graph, layerName: string): Graph {
  // Only support C4 layers
  const c4Layers = ['system', 'container', 'component', 'code'];
  if (!c4Layers.includes(layerName)) {
    throw new Error(`Invalid layer: ${layerName}. Only C4 layers are supported.`);
  }

  const c4Type = layerName as 'system' | 'container' | 'component' | 'code';

  // Filter nodes by C4 type, but exclude ghosted nodes (nodes marked for deletion)
  const filteredNodes = graph.nodes.filter(node =>
    (node as any).type === c4Type && (node as any).state !== 'ghosted'
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