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
    deletedEdges: []
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
  // Only compare title and prompt for determining if nodes are different
  return node1.title !== node2.title || node1.prompt !== node2.prompt;
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

  console.log(`   🔍 Diff results: Added=${diff.addedNodes.length}, Modified=${diff.modifiedNodes.length}, Deleted=${diff.deletedNodes.length}`);

  const result = markUnbuiltNodesFromDiff(currentGraph, diff);

  console.log('   ✅ State marking completed');

  return result;
}
