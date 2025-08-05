import { z } from 'zod';

// Graph schema based on the chat-graph route
const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  kind: z.enum(['page','section','group','component','primitive','behavior']),
  what: z.string(),
  how: z.string(),
  properties: z.array(z.string()),
  children: z.array(z.object({
    id: z.string(),
    title: z.string(),
    prompt: z.string(),
    kind: z.enum(['page','section','group','component','primitive','behavior']),
  })),
});

const GraphSchema = z.object({
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
  // Store in memory
  graphSessions.set(sessionId, graph);
  
  // Save to file
  try {
    const response = await fetch('http://localhost:3000/api/files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'graph',
        sessionId,
        graph
      })
    });
    
    if (!response.ok) {
      console.error('Failed to save graph to file');
    }
  } catch (error) {
    console.error('Error saving graph to file:', error);
  }
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