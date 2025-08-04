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

// Graph session storage
const graphSessions = new Map<string, Graph>();

/**
 * Get or create a graph session
 */
export function getGraphSession(sessionId: string): Graph | null {
  return graphSessions.get(sessionId) || null;
}

/**
 * Store a graph in a session
 */
export function storeGraph(sessionId: string, graph: Graph): void {
  graphSessions.set(sessionId, graph);
}

/**
 * Clear a graph session
 */
export function clearGraphSession(sessionId: string): void {
  graphSessions.delete(sessionId);
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