import { z } from 'zod';

// Graph schema based on the build-prompt-graph route
export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  children: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })),
  // Tracks whether code for this node has been generated
  built: z.boolean().optional(),
});

export const GraphSchema = z.object({
  rootId: z.string(),
  nodes: z.array(GraphNodeSchema),
});

export type Graph = z.infer<typeof GraphSchema>;

// Graph session storage (in-memory cache)
const graphSessions = new Map<string, Graph>();

/**
 * Get or create a graph session
 */
export function getGraphSession(sessionId: string): Graph | null {
  return graphSessions.get(sessionId) || null;
}

/**
 * Store a graph in a session and save to file
 */
export async function storeGraph(sessionId: string, graph: Graph): Promise<void> {
  // Merge with existing graph to preserve built flags when nodes are unchanged
  const prev = graphSessions.get(sessionId) || null;
  let merged: Graph = graph;

  if (prev) {
    const prevById = new Map(prev.nodes.map(n => [n.id, n]));
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
  graphSessions.set(sessionId, merged);

  // Save to file
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'graph', sessionId, graph: merged })
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
 * Load graph from file and store in session
 */
export async function loadGraphFromFile(sessionId: string): Promise<Graph | null> {
  try {
    const response = await fetch(`http://localhost:3000/api/files?graphs=true`);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const graphs = data.graphs || [];
    const graphData = graphs.find((g: any) => g.sessionId === sessionId);
    
    if (graphData) {
      const graph = graphData.graph;
      // Store in memory
      graphSessions.set(sessionId, graph);
      return graph;
    }
    
    return null;
  } catch (error) {
    console.error('Error loading graph from file:', error);
    return null;
  }
}

/**
 * Clear a graph session and delete file
 */
export async function clearGraphSession(sessionId: string): Promise<void> {
  // Remove from memory
  graphSessions.delete(sessionId);
  
  // Delete file
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'graph',
        sessionId
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
export function getGraphStats(): { sessionCount: number; totalGraphs: number } {
  return {
    sessionCount: graphSessions.size,
    totalGraphs: graphSessions.size
  };
}

/**
 * Get a specific graph node by ID from a session
 */
export function getGraphNode(sessionId: string, nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  const graph = getGraphSession(sessionId);
  if (!graph) {
    return null;
  }
  
  return graph.nodes.find(node => node.id === nodeId) || null;
}

/**
 * Get ids of nodes that are not yet built
 */
export function getUnbuiltNodeIds(sessionId: string): string[] {
  const graph = getGraphSession(sessionId);
  if (!graph) return [];
  return graph.nodes.filter(n => !n.built).map(n => n.id);
}

/**
 * Mark nodes as built and persist to file
 */
export async function markNodesBuilt(sessionId: string, nodeIds: string[]): Promise<void> {
  const graph = getGraphSession(sessionId);
  if (!graph) return;
  const idSet = new Set(nodeIds);
  const updated: Graph = {
    ...graph,
    nodes: graph.nodes.map(n => (idSet.has(n.id) ? { ...n, built: true } : n)),
  };
  graphSessions.set(sessionId, updated);
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'graph', sessionId, graph: updated })
    });
    if (!response.ok) {
      console.error('Failed to persist built flags to file');
    }
  } catch (error) {
    console.error('Error persisting built flags:', error);
  }
}

/**
 * Initialize graphs from files on startup
 */
export async function initializeGraphsFromFiles(): Promise<void> {
  try {
    const response = await fetch('http://localhost:3000/api/files?graphs=true');
    if (!response.ok) {
      return;
    }
    
    const data = await response.json();
    const graphs = data.graphs || [];
    
    for (const graphData of graphs) {
      graphSessions.set(graphData.sessionId, graphData.graph);
    }
    
    console.log(`Loaded ${graphs.length} graphs from files`);
  } catch (error) {
    console.error('Error initializing graphs from files:', error);
  }
}