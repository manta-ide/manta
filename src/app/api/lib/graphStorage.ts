import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import fs from 'fs/promises';
import path from 'path';

export type Graph = z.infer<typeof GraphSchema>;

// Single graph storage (in-memory cache)
let currentGraph: Graph | null = null;

// Define the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(process.cwd(), 'base-template');

// Blaxel integration utility functions
async function callBlaxelApi(action: string, additionalData: any = {}) {
  try {
    const response = await fetch('http://localhost:3000/api/blaxel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...additionalData }),
    });
    
    if (!response.ok) {
      throw new Error(`Blaxel API failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Blaxel API call failed:', error);
    throw error;
  }
}

async function loadGraphFromBlaxel(): Promise<Graph | null> {
  try {
    console.log('🔄 Loading graph from Blaxel sandbox...');
    const result = await callBlaxelApi('readFile', { path: 'blaxel/app/_graph/graph.json' });
    
    if (!result.success) {
      console.log('ℹ️ No graph found in Blaxel sandbox');
      return null;
    }
    
    const graph = JSON.parse(result.content) as Graph;
    console.log(`✅ Loaded graph from Blaxel with ${graph.nodes?.length || 0} nodes`);
    return graph;
  } catch (error) {
    console.log('ℹ️ Failed to load graph from Blaxel, falling back to local file system');
    return null;
  }
}

async function saveGraphToBlaxel(graph: Graph): Promise<void> {
  try {
    console.log('💾 Saving graph to Blaxel sandbox...');
    
    // Save graph.json to Blaxel
    const graphContent = JSON.stringify(graph, null, 2);
    await callBlaxelApi('writeFile', { 
      path: 'blaxel/app/_graph/graph.json', 
      content: graphContent 
    });
    
    // Generate and save vars.json to Blaxel
    const vars = extractVariablesFromGraph(graph);
    const varsContent = JSON.stringify(vars, null, 2);
    await callBlaxelApi('writeFile', { 
      path: 'blaxel/app/_graph/vars.json', 
      content: varsContent 
    });
    
    console.log('✅ Graph saved to Blaxel sandbox successfully');
  } catch (error) {
    console.error('❌ Failed to save graph to Blaxel:', error);
    throw error;
  }
}

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
        const varNameWithPrefix = `${nodeTitle}-${propertyTitle}`;
        const varNameWithoutPrefix = `${nodeTitle}-${propertyTitle}`;
        
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
 * Saves to both Blaxel sandbox and local file system
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

  // Try to save to Blaxel first
  try {
    await saveGraphToBlaxel(merged);
  } catch (error) {
    console.warn('Failed to save to Blaxel, continuing with local save:', error);
  }

  // Ensure .graph directory exists
  const graphDir = path.join(PROJECT_ROOT, '.graph');
  try {
    await fs.mkdir(graphDir, { recursive: true });
  } catch (error) {
    console.error('Error creating .graph directory:', error);
  }

  // Save graph to local file
  try {
    const graphFilePath = path.join(graphDir, 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving graph to local file:', error);
  }

  // Generate and save vars.json locally
  try {
    const vars = extractVariablesFromGraph(merged);
    const varsFilePath = path.join(graphDir, 'vars.json');
    await fs.writeFile(varsFilePath, JSON.stringify(vars, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving vars.json to local file:', error);
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
 * First tries to load from Blaxel sandbox, then falls back to local file system
 */
export async function loadGraphFromFile(): Promise<Graph | null> {
  try {
    // First try to load from Blaxel sandbox
    const blaxelGraph = await loadGraphFromBlaxel();
    if (blaxelGraph) {
      currentGraph = blaxelGraph;
      return blaxelGraph;
    }
    
    // Fall back to local file system
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    
    const content = await fs.readFile(graphFilePath, 'utf-8');
    const graph = JSON.parse(content) as Graph;
    
    // Store in memory
    currentGraph = graph;
    console.log(`✅ Loaded graph with ${graph.nodes?.length || 0} nodes from local file system`);
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
  
  // Try to save to Blaxel first
  try {
    await saveGraphToBlaxel(updated);
  } catch (error) {
    console.warn('Failed to save built flags to Blaxel:', error);
  }
  
  try {
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting built flags to local file:', error);
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
  
  // Try to save to Blaxel first
  try {
    await saveGraphToBlaxel(updated);
  } catch (error) {
    console.warn('Failed to save unbuilt flags to Blaxel:', error);
  }
  
  try {
    const graphFilePath = path.join(PROJECT_ROOT, '.graph', 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error persisting unbuilt flags to local file:', error);
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