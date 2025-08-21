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
 * Extract variables from graph nodes and generate vars.json
 */
function extractVariablesFromGraph(graph: Graph): Record<string, any> {
  const vars: Record<string, any> = {};
  
  // Extract variables from node properties
  graph.nodes?.forEach(node => {
    if (node.properties) {
      node.properties.forEach((property, index) => {
        // Create variable names based on node title and property title
        const nodeTitle = node.title?.toLowerCase().replace(/\s+/g, '-') || 'unknown';
        const propertyTitle = property.title?.toLowerCase().replace(/\s+/g, '-') || `property-${index}`;
        
        // Generate both formats: with node-element prefix and without
        const varNameWithPrefix = `${nodeTitle}.${propertyTitle}`;
        const varNameWithoutPrefix = `${nodeTitle}.${propertyTitle}`;
        
        // Store both formats for flexibility - just the value, no metadata
        vars[varNameWithPrefix] = property.value;
        vars[varNameWithoutPrefix] = property.value;
      });
    }
  });
  
  return vars;
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

  // Ensure .graph directory exists
  const graphDir = path.join(PROJECT_ROOT, '.graph');
  try {
    await fs.mkdir(graphDir, { recursive: true });
  } catch (error) {
    console.error('Error creating .graph directory:', error);
  }

  // Save graph to file
  try {
    const graphFilePath = path.join(graphDir, 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving graph to file:', error);
  }

  // Generate and save vars.json
  try {
    const vars = extractVariablesFromGraph(merged);
    const varsFilePath = path.join(graphDir, 'vars.json');
    await fs.writeFile(varsFilePath, JSON.stringify(vars, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving vars.json:', error);
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
  // Compare properties structure (ignore values). If structure differs, treat as changed
  const normalizeProps = (props?: any[]) => {
    if (!Array.isArray(props)) return [] as any[];
    return props.map((p) => ({
      id: p?.id ?? '',
      title: p?.title ?? '',
      type: p?.type ?? '',
      maxLength: p?.maxLength ?? undefined,
      min: p?.min ?? undefined,
      max: p?.max ?? undefined,
      step: p?.step ?? undefined,
      options: Array.isArray(p?.options) ? [...p.options] : undefined,
    }));
  };
  const aStruct = JSON.stringify(normalizeProps(a.properties));
  const bStruct = JSON.stringify(normalizeProps(b.properties));
  if (aStruct !== bStruct) return false;
  return true;
}

/**
 * Load graph from file and store in memory
 */
export async function loadGraphFromFile(): Promise<Graph | null> {
  try {
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    
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
  
  // Delete files directly
  try {
    const graphDir = path.join(PROJECT_ROOT, '.graph');
    const graphFilePath = path.join(graphDir, 'graph.json');
    const varsFilePath = path.join(graphDir, 'vars.json');
    
    await fs.unlink(graphFilePath).catch(() => {}); // Ignore if file doesn't exist
    await fs.unlink(varsFilePath).catch(() => {}); // Ignore if file doesn't exist
  } catch (error) {
    console.error('Error deleting graph files:', error);
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
  console.log("graphStorage currentGraph", currentGraph);
  if (!currentGraph) return [];
  return currentGraph.nodes.filter(n => !n.built || n.built === undefined).map(n => n.id);
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
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting built flags:', error);
  }
}

/**
 * Mark nodes as unbuilt and persist to file
 */
export async function markNodesUnbuilt(nodeIds: string[]): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  const updated: Graph = {
    ...currentGraph,
    nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, built: false } : n)),
  };
  currentGraph = updated;
  
  try {
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting unbuilt flags:', error);
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