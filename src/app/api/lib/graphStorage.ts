import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import fs from 'fs/promises';
import path from 'path';

export type Graph = z.infer<typeof GraphSchema>;

// Single graph storage (in-memory cache)
let currentGraph: Graph | null = null;

// Define the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(process.cwd(), 'base-template');

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

  // Save to file directly
  try {
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(merged, null, 2), 'utf-8');
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
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    
    const content = await fs.readFile(graphFilePath, 'utf-8');
    const graph = JSON.parse(content) as Graph;
    
    // Store in memory
    currentGraph = graph;
    console.log(`✅ Loaded graph with ${graph.nodes?.length || 0} nodes`);
    return graph;
  } catch (error: any) {
    // Silently return null for any error (including file not found)
    // This is expected behavior when no graph exists
    return null;
  }
}

/**
 * Clear the current graph and delete file
 */
export async function clearGraphSession(): Promise<void> {
  // Remove from memory
  currentGraph = null;
  
  // Delete file directly
  try {
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    await fs.unlink(graphFilePath);
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
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting built flags:', error);
  }
}

/**
 * Initialize graph from files on startup
 */
export async function initializeGraphsFromFiles(): Promise<void> {
  try {
    console.log('🔄 Initializing graphs from files...');
    const graph = await loadGraphFromFile();
    if (graph) {
      console.log('✅ Loaded default graph from files');
    } else {
      console.log('ℹ️ No graph file found, will be created when first graph is generated');
    }
  } catch (error) {
    console.error('Error initializing graph from files:', error);
  }
}