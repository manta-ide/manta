import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';

export type Graph = z.infer<typeof GraphSchema>;

// Single graph storage (in-memory cache)
let currentGraph: Graph | null = null;

// Blaxel integration utility functions
async function callBlaxelApi(action: string, userId: string, additionalData: any = {}) {
  try {
    const response = await fetch(`${process.env.BACKEND_URL}/api/blaxel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId, ...additionalData }),
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

async function loadGraphFromBlaxel(userId: string): Promise<Graph | null> {
  try {
    console.log('🔄 Loading graph from Blaxel sandbox...');
    const result = await callBlaxelApi('readFile', userId, { path: 'blaxel/app/_graph/graph.json' });
    
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

async function saveGraphToBlaxel(graph: Graph, userId: string): Promise<void> {
  try {
    console.log('💾 Saving graph to Blaxel sandbox...');
    
    // Save graph.json to Blaxel
    const graphContent = JSON.stringify(graph, null, 2);
    await callBlaxelApi('writeFile', userId, { 
      path: 'blaxel/app/_graph/graph.json', 
      content: graphContent 
    });
    
    // Generate and save vars.json to Blaxel
    const vars = extractVariablesFromGraph(graph);
    const varsContent = JSON.stringify(vars, null, 2);
    await callBlaxelApi('writeFile', userId, { 
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
        const propertyId = property.id?.toLowerCase().replace(/\s+/g, '-') || `property-${index}`;
        
        // Generate both formats: with node-element prefix and without
        const varNameWithPrefix = `${propertyId}`;
        const varNameWithoutPrefix = `${propertyId}`;
        
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
export async function storeGraph(graph: Graph, userId: string): Promise<void> {
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

  // Save to Blaxel only
  try {
    await saveGraphToBlaxel(merged, userId);
  } catch (error) {
    console.error('Failed to save to Blaxel:', error);
    throw error;
  }
}

function nodesEqual(a: Graph['nodes'][number], b: Graph['nodes'][number]): boolean {
  // Compare core fields; ignore built flag and children array changes
  if (a.title !== b.title) return false;
  if (a.prompt !== b.prompt) return false;
  // Don't compare children arrays - changes to children shouldn't mark parent as unbuilt
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
 * Load graph from Blaxel sandbox and store in memory
 */
export async function loadGraphFromFile(userId: string): Promise<Graph | null> {
  try {
    // Load from Blaxel sandbox only
    const blaxelGraph = await loadGraphFromBlaxel(userId);
    if (blaxelGraph) {
      currentGraph = blaxelGraph;
      return blaxelGraph;
    }
    
    // No graph found
    return null;
  } catch (error: any) {
    // Silently return null for any error (including file not found)
    // This is expected behavior when no graph exists
    return null;
  }
}

/**
 * Clear the current graph from memory
 */
export async function clearGraphSession(): Promise<void> {
  // Remove from memory only
  currentGraph = null;
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
export async function markNodesBuilt(nodeIds: string[], userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  const updated: Graph = {
    ...currentGraph,
    nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, built: true } : n)),
  };
  currentGraph = updated;
  
  // Save to Blaxel only
  try {
    await saveGraphToBlaxel(updated, userId);
  } catch (error) {
    console.error('Failed to save built flags to Blaxel:', error);
    throw error;
  }
}

/**
 * Mark nodes as unbuilt and persist to file
 */
export async function markNodesUnbuilt(nodeIds: string[], userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  const updated: Graph = {
    ...currentGraph,
    nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, built: false } : n)),
  };
  currentGraph = updated;
  
  // Save to Blaxel only
  try {
    await saveGraphToBlaxel(updated, userId);
  } catch (error) {
    console.error('Failed to save unbuilt flags to Blaxel:', error);
    throw error;
  }
}

/**
 * Initialize graph from files on startup
 * Note: This function is now deprecated as it requires a userId parameter
 */
export async function initializeGraphsFromFiles(): Promise<void> {
  try {
    console.log('🔄 Initializing graphs from files...');
    console.log('ℹ️ Graph initialization now requires user context - skipping global initialization');
  } catch (error) {
    console.error('Error initializing graph from files:', error);
  }
}