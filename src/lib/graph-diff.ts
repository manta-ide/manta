import { Graph } from '@/app/api/lib/schemas';

/**
 * Graph diff utilities for comparing base and current graphs
 * and automatically marking nodes as unbuilt when they differ.
 */

export interface GraphDiff {
  addedNodes: string[];
  modifiedNodes: string[];
  deletedNodes: string[];
  addedEdges: string[];
  deletedEdges: string[];
  unbuiltEdges: string[];
}

/**
 * Analyzes differences between base and current graphs (recursively handles nested graphs)
 */
export function analyzeGraphDiff(baseGraph: Graph, currentGraph: Graph): GraphDiff {
  const diff: GraphDiff = {
    addedNodes: [],
    modifiedNodes: [],
    deletedNodes: [],
    addedEdges: [],
    deletedEdges: [],
    unbuiltEdges: []
  };

  // Recursively analyze graphs
  analyzeGraphDiffRecursive(baseGraph, currentGraph, diff, '');

  return diff;
}

/**
 * Recursively analyzes differences between graphs at any nesting level
 */
function analyzeGraphDiffRecursive(baseGraph: Graph, currentGraph: Graph, diff: GraphDiff, path: string): void {
  const indent = path ? '  '.repeat(path.split('.').length) : '';
  console.log(`${indent}🔍 Analyzing level: ${path || 'root'} {baseNodes: ${baseGraph.nodes.length}, currentNodes: ${currentGraph.nodes.length}}`);

  // Compare nodes
  const currentNodeMap = new Map(currentGraph.nodes.map(n => [n.id, n]));
  const baseNodeMap = new Map(baseGraph.nodes.map(n => [n.id, n]));

  // Find added/modified nodes
  for (const [nodeId, currentNode] of Array.from(currentNodeMap.entries())) {
    const baseNode = baseNodeMap.get(nodeId);
    if (!baseNode) {
      diff.addedNodes.push(nodeId);
    } else if (nodesAreDifferent(baseNode, currentNode) || hasBugs(currentNode)) {
      diff.modifiedNodes.push(nodeId);
    } 
  }

  // Find deleted nodes
  for (const [nodeId] of Array.from(baseNodeMap.entries())) {
    if (!currentNodeMap.has(nodeId)) {
      const baseNode = baseNodeMap.get(nodeId);
      diff.deletedNodes.push(nodeId);
    }
  }

  // Compare edges
  const currentEdges = currentGraph.edges || [];
  const baseEdges = baseGraph.edges || [];
  const currentEdgeMap = new Map(currentEdges.map(e => [`${e.source}-${e.target}`, e]));
  const baseEdgeMap = new Map(baseEdges.map(e => [`${e.source}-${e.target}`, e]));

  // Find added edges
  for (const [edgeKey] of Array.from(currentEdgeMap.entries())) {
    if (!baseEdgeMap.has(edgeKey)) {
      diff.addedEdges.push(edgeKey);
      diff.unbuiltEdges.push(edgeKey);
    }
  }

  // Find deleted edges
  for (const [edgeKey] of Array.from(baseEdgeMap.entries())) {
    if (!currentEdgeMap.has(edgeKey)) {
      diff.deletedEdges.push(edgeKey);
    }
  }
}

/**
 * Checks if a node has bugs that need to be fixed
 */
export function hasBugs(node: any): boolean {
  return node.metadata?.bugs && Array.isArray(node.metadata.bugs) && node.metadata.bugs.length > 0;
}

/**
 * Compares two nodes to determine if they are different (including nested graphs)
 */
export function nodesAreDifferent(node1: any, node2: any): boolean {
  // Compare title, description, and type
  if (node1.title !== node2.title || node1.description !== node2.description || node1.type !== node2.type) {
    return true;
  }

  // Compare properties
  const props1 = Array.isArray(node1.properties) ? node1.properties : [];
  const props2 = Array.isArray(node2.properties) ? node2.properties : [];

  if (props1.length !== props2.length) {
    return true;
  }

  // Create maps for easier comparison
  const propMap1 = new Map(props1.map((p: any) => [p.id, p]));
  const propMap2 = new Map(props2.map((p: any) => [p.id, p]));

  // Check if all properties in node1 exist in node2 with same values
  for (const [id, prop1] of propMap1.entries()) {
    const prop2 = propMap2.get(id);
    if (!prop2) {
      return true; // Property missing in node2
    }

    // Compare property values (handle different types)
    if ((prop1 as any).value !== (prop2 as any).value) {
      // For objects/arrays, do a deep comparison
      if (typeof (prop1 as any).value === 'object' && (prop1 as any).value !== null &&
          typeof (prop2 as any).value === 'object' && (prop2 as any).value !== null) {
        if (JSON.stringify((prop1 as any).value) !== JSON.stringify((prop2 as any).value)) {
          return true;
        }
      } else {
        return true;
      }
    }

    // Compare other property fields that might affect behavior
    if ((prop1 as any).type !== (prop2 as any).type || (prop1 as any).title !== (prop2 as any).title) {
      return true;
    }
  }

  // Check if node2 has extra properties not in node1
  for (const id of propMap2.keys()) {
    if (!propMap1.has(id)) {
      return true;
    }
  }

  // Compare nested graphs recursively
  const graph1 = node1.graph || { nodes: [], edges: [] };
  const graph2 = node2.graph || { nodes: [], edges: [] };

  // Normalize edges arrays
  const edges1 = graph1.edges || [];
  const edges2 = graph2.edges || [];

  // Quick check: different number of nodes or edges
  if (graph1.nodes.length !== graph2.nodes.length || edges1.length !== edges2.length) {
    return true;
  }

  // If both have no nodes and no edges, they're equivalent
  if (graph1.nodes.length === 0 && graph2.nodes.length === 0 && edges1.length === 0 && edges2.length === 0) {
    return false;
  }

  // Compare nested graphs by checking if any nested nodes are different
  const nestedDiff = analyzeGraphDiff(graph1, graph2);
  if (nestedDiff.addedNodes.length > 0 || nestedDiff.modifiedNodes.length > 0 || nestedDiff.deletedNodes.length > 0 ||
      nestedDiff.addedEdges.length > 0 || nestedDiff.deletedEdges.length > 0) {
    return true;
  }

  return false; // Nodes are identical
}

/**
 * Marks nodes as unbuilt if they differ from the base graph (recursively handles nested graphs)
 */
export function markUnbuiltNodesFromDiff(graph: Graph, diff: GraphDiff): Graph {

  const updatedNodes = graph.nodes.map(node => {
    // Mark as unbuilt if added or modified
    if (diff.addedNodes.includes(node.id) || diff.modifiedNodes.includes(node.id)) {
      return { ...node, state: 'unbuilt' as const };
    }
    // Mark as built if exists in both graphs and not modified (identical to base)
    return { ...node, state: 'built' as const };
  });

  const result = {
    ...graph,
    nodes: updatedNodes
  };

  const builtCount = updatedNodes.filter(n => n.state === 'built').length;
  const unbuiltCount = updatedNodes.filter(n => n.state === 'unbuilt').length;

  return result;
}

/**
 * Determines if an edge is unbuilt by checking if it exists in the base graph (recursively searches nested graphs)
 */
export function isEdgeUnbuilt(edge: { source: string; target: string }, baseGraph: Graph | null): boolean {
  if (!baseGraph) return true; // No base graph means all edges are unbuilt

  // Check root level edges
  if (baseGraph.edges) {
    const edgeKey = `${edge.source}-${edge.target}`;
    if (baseGraph.edges.some(baseEdge => `${baseEdge.source}-${baseEdge.target}` === edgeKey)) {
      return false; // Edge exists at root level - it's built
    }
  }

  // Recursively check nested graphs
  for (const node of baseGraph.nodes) {
    if (node.graph && !isEdgeUnbuilt(edge, node.graph)) {
      return false; // Edge exists in nested graph - it's built
    }
  }

  return true; // Edge not found anywhere - it's unbuilt
}

/**
 * Automatically marks nodes as unbuilt based on differences from base graph
 */
export function autoMarkUnbuiltFromBaseGraph(currentGraph: Graph, baseGraph: Graph | null): Graph {
  console.log('🔄 autoMarkUnbuiltFromBaseGraph called');

  if (!baseGraph) {
    console.log('   ℹ️ No base graph available, preserving existing states');
    return currentGraph;
  }

  console.log(`   📊 Base graph: ${baseGraph.nodes.length} nodes, Current graph: ${currentGraph.nodes.length} nodes`);

  const diff = analyzeGraphDiff(baseGraph, currentGraph);

  console.log(`   🔍 Diff results: Added=${diff.addedNodes.length}, Modified=${diff.modifiedNodes.length}, Deleted=${diff.deletedNodes.length}, AddedEdges=${diff.addedEdges.length}, UnbuiltEdges=${diff.unbuiltEdges.length}`);

  const result = markUnbuiltNodesFromDiff(currentGraph, diff);

  console.log(`   📈 Final state summary: ${result.nodes.filter((n: any) => n.state === 'built').length} built nodes, ${result.nodes.filter((n: any) => n.state === 'unbuilt').length} unbuilt nodes, ${diff.unbuiltEdges.length} unbuilt edges`);

  return result;
}
