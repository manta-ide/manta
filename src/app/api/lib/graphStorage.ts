import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';



export type Graph = z.infer<typeof GraphSchema>;

// Single graph storage (in-memory cache)
let currentGraph: Graph | null = null;

/**
 * Get the current graph
 */
export function getGraphSession(): Graph | null {
  return currentGraph;
}

/**
 * Store a graph and save to file
 */
export async function storeGraph(graph: Graph): Promise<void> {
  // Merge with existing graph to preserve built flags when nodes are unchanged
  let merged: Graph = graph;

  if (currentGraph) {
    const prevById = new Map(currentGraph.nodes.map(n => [n.id, n]));
    const nodes = graph.nodes.map(n => {
      const before = prevById.get(n.id);
      if (!before) {
        return { ...n, built: false };
      }
      const isSame = nodesEqual(before, n);
      const built = isSame ? !!before.built : false;
      return { ...n, built };
    });
    merged = { ...graph, nodes };
  } else {
    merged = { ...graph, nodes: graph.nodes.map(n => ({ ...n, built: false })) };
  }

  // Store in memory
  currentGraph = merged;

  // Save to file
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'graph', graph: merged })
    });
    if (!response.ok) {
      console.error('Failed to save graph to file');
    }
  } catch (error) {
    console.error('Error saving graph to file:', error);
  }
}

function nodesEqual(a: Graph['nodes'][number], b: Graph['nodes'][number]): boolean {
  // Compare core fields; ignore built flag
  if (a.title !== b.title) return false;
  if (a.prompt !== b.prompt) return false;
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    const ca = a.children[i];
    const cb = b.children[i];
    if (ca.id !== cb.id || ca.title !== cb.title) return false;
  }
  return true;
}

/**
 * Load graph from file and store in memory
 */
export async function loadGraphFromFile(): Promise<Graph | null> {
  try {
    const response = await fetch(`http://localhost:3000/api/files?graphs=true`);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const graphs = data.graphs || [];
    const graphData = graphs.find((g: any) => g.sessionId === 'default');
    
    if (graphData) {
      const graph = graphData.graph;
      // Store in memory
      currentGraph = graph;
      return graph;
    }
    
    return null;
  } catch (error) {
    console.error('Error loading graph from file:', error);
    return null;
  }
}

/**
 * Clear the current graph and delete file
 */
export async function clearGraphSession(): Promise<void> {
  // Remove from memory
  currentGraph = null;
  
  // Delete file
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'graph'
      })
    });
    
    if (!response.ok) {
      console.error('Failed to delete graph file');
    }
  } catch (error) {
    console.error('Error deleting graph file:', error);
  }
}

/**
 * Get graph statistics
 */
export function getGraphStats(): { hasGraph: boolean } {
  return {
    hasGraph: currentGraph !== null
  };
}

/**
 * Get a specific graph node by ID
 */
export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  if (!currentGraph) {
    return null;
  }
  
  return currentGraph.nodes.find(node => node.id === nodeId) || null;
}

/**
 * Get ids of nodes that are not yet built
 */
export function getUnbuiltNodeIds(): string[] {
  if (!currentGraph) return [];
  return currentGraph.nodes.filter(n => !n.built).map(n => n.id);
}

/**
 * Mark nodes as built and persist to file
 */
export async function markNodesBuilt(nodeIds: string[]): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  const updated: Graph = {
    ...currentGraph,
    nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, built: true } : n)),
  };
  currentGraph = updated;
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'graph', graph: updated })
    });
    if (!response.ok) {
      console.error('Failed to persist built flags to file');
    }
  } catch (error) {
    console.error('Error persisting built flags:', error);
  }
}

/**
 * Initialize graph from files on startup
 */
export async function initializeGraphsFromFiles(): Promise<void> {
  try {
    const response = await fetch('http://localhost:3000/api/files?graphs=true');
    if (!response.ok) {
      return;
    }
    
    const data = await response.json();
    const graphs = data.graphs || [];
    
    // Load the default graph
    const defaultGraph = graphs.find((g: any) => g.sessionId === 'default');
    if (defaultGraph) {
      currentGraph = defaultGraph.graph;
      console.log('Loaded default graph from files');
    }
  } catch (error) {
    console.error('Error initializing graph from files:', error);
  }
}