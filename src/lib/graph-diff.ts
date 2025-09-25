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
 * Analyzes differences between base and current graphs
 */
export function analyzeGraphDiff(baseGraph: Graph, currentGraph: Graph): GraphDiff {
  console.log(`🔍 Analyzing graph diff: {baseNodes: ${baseGraph.nodes.length}, currentNodes: ${currentGraph.nodes.length}}`);

  const diff: GraphDiff = {
    addedNodes: [],
    modifiedNodes: [],
    deletedNodes: [],
    addedEdges: [],
    deletedEdges: [],
    unbuiltEdges: []
  };

  // Compare nodes
  const currentNodeMap = new Map(currentGraph.nodes.map(n => [n.id, n]));
  const baseNodeMap = new Map(baseGraph.nodes.map(n => [n.id, n]));

  // Find added/modified nodes
  for (const [nodeId, currentNode] of Array.from(currentNodeMap.entries())) {
    const baseNode = baseNodeMap.get(nodeId);
    if (!baseNode) {
      console.log(`   ➕ Added node: ${nodeId} (${currentNode.title})`);
      diff.addedNodes.push(nodeId);
    } else if (nodesAreDifferent(baseNode, currentNode)) {
      console.log(`   ✏️ Modified node: ${nodeId} (${currentNode.title})`);
      diff.modifiedNodes.push(nodeId);
    } else {
      console.log(`   ✅ Unchanged node: ${nodeId} (${currentNode.title})`);
    }
  }

  // Find deleted nodes
  for (const [nodeId] of Array.from(baseNodeMap.entries())) {
    if (!currentNodeMap.has(nodeId)) {
      const baseNode = baseNodeMap.get(nodeId);
      console.log(`   ➖ Deleted node: ${nodeId} (${baseNode?.title})`);
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

  return diff;
}

/**
 * Compares two nodes to determine if they are different
 */
export function nodesAreDifferent(node1: any, node2: any): boolean {
  // Compare title and prompt
  if (node1.title !== node2.title || node1.prompt !== node2.prompt) {
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
    if (prop1.value !== prop2.value) {
      // For objects/arrays, do a deep comparison
      if (typeof prop1.value === 'object' && prop1.value !== null &&
          typeof prop2.value === 'object' && prop2.value !== null) {
        if (JSON.stringify(prop1.value) !== JSON.stringify(prop2.value)) {
          return true;
        }
      } else {
        return true;
      }
    }

    // Compare other property fields that might affect behavior
    if (prop1.type !== prop2.type || prop1.title !== prop2.title) {
      return true;
    }
  }

  // Check if node2 has extra properties not in node1
  for (const id of propMap2.keys()) {
    if (!propMap1.has(id)) {
      return true;
    }
  }

  return false; // Nodes are identical
}

/**
 * Marks nodes as unbuilt if they differ from the base graph
 */
export function markUnbuiltNodesFromDiff(graph: Graph, diff: GraphDiff): Graph {
  console.log('🏷️ Marking node states based on diff...');

  const updatedNodes = graph.nodes.map(node => {
    // Mark as unbuilt if added or modified
    if (diff.addedNodes.includes(node.id) || diff.modifiedNodes.includes(node.id)) {
      console.log(`   🔴 ${node.id} (${node.title}): unbuilt (${diff.addedNodes.includes(node.id) ? 'added' : 'modified'})`);
      return { ...node, state: 'unbuilt' as const };
    }
    // Mark as built if exists in both graphs and not modified (identical to base)
    console.log(`   🟢 ${node.id} (${node.title}): built (unchanged)`);
    return { ...node, state: 'built' as const };
  });

  const result = {
    ...graph,
    nodes: updatedNodes
  };

  const builtCount = updatedNodes.filter(n => n.state === 'built').length;
  const unbuiltCount = updatedNodes.filter(n => n.state === 'unbuilt').length;
  console.log(`📊 Final state summary: ${builtCount} built, ${unbuiltCount} unbuilt`);

  return result;
}

/**
 * Determines if an edge is unbuilt by checking if it exists in the base graph
 */
export function isEdgeUnbuilt(edge: { source: string; target: string }, baseGraph: Graph | null): boolean {
  if (!baseGraph || !baseGraph.edges) return true; // No base graph means all edges are unbuilt

  const edgeKey = `${edge.source}-${edge.target}`;
  return !baseGraph.edges.some(baseEdge => `${baseEdge.source}-${baseEdge.target}` === edgeKey);
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
