import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { graphToXml } from '@/lib/graph-xml';
import { supabase, getOrCreateDefaultUser, getOrCreateDefaultProject } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export type Graph = z.infer<typeof GraphSchema>;

type GraphServiceRuntimeState = {
  currentGraph: Graph | null;
  activeStreams: Set<ReadableStreamDefaultController<Uint8Array>>;
  broadcastTimeout: NodeJS.Timeout | null;
  projectId: string | null;
};

const globalGraphState = (globalThis as typeof globalThis & {
  __MANTA_GRAPH_SERVICE_STATE__?: GraphServiceRuntimeState;
}).__MANTA_GRAPH_SERVICE_STATE__ ??= {
  currentGraph: null,
  activeStreams: new Set<ReadableStreamDefaultController<Uint8Array>>(),
  broadcastTimeout: null,
  projectId: null,
};

const getCurrentGraph = () => globalGraphState.currentGraph;
const setCurrentGraph = (graph: Graph | null) => {
  globalGraphState.currentGraph = graph;
};

// Get or initialize project ID
async function getProjectId(): Promise<string> {
  if (globalGraphState.projectId) {
    return globalGraphState.projectId;
  }

  // Initialize default user and project
  const user = await getOrCreateDefaultUser();
  const project = await getOrCreateDefaultProject(user.id);
  globalGraphState.projectId = project.id;
  return project.id;
}

// SSE broadcast system
const activeStreams = globalGraphState.activeStreams;

function broadcastGraphUpdate(graph: Graph, metadata?: { source?: string }) {
  if (activeStreams.size === 0) return;

  try {
    const xml = graphToXml(graph);
    // Base64 encode the XML using UTF-8 bytes
    const encodedXml = Buffer.from(xml, 'utf8').toString('base64');

    let payload;
    if (metadata?.source) {
      // Include metadata for special handling
      const message = { type: 'graph-update', xml: encodedXml, metadata };
      payload = `data: ${JSON.stringify(message)}\n\n`;
    } else {
      payload = `data: ${encodedXml}\n\n`;
    }

    // Clear any pending broadcast
    if (globalGraphState.broadcastTimeout) {
      clearTimeout(globalGraphState.broadcastTimeout);
      globalGraphState.broadcastTimeout = null;
    }

    // Debounce broadcasts to avoid spam (max 10 per second)
    globalGraphState.broadcastTimeout = setTimeout(() => {
      const data = new TextEncoder().encode(payload);
      for (const controller of activeStreams) {
        try {
          controller.enqueue(data);
        } catch (error) {
          // Remove broken connections
          activeStreams.delete(controller);
        }
      }
      globalGraphState.broadcastTimeout = null;
    }, 100);
  } catch (error) {
    console.error('Error broadcasting graph update:', error);
  }
}

// Broadcast arbitrary JSON payloads to graph SSE subscribers
export function broadcastGraphJson(payload: any) {
  if (activeStreams.size === 0) return;
  try {
    const data = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
    for (const controller of activeStreams) {
      try {
        controller.enqueue(data);
      } catch {
        activeStreams.delete(controller);
      }
    }
  } catch (error) {
    console.error('Error broadcasting JSON graph event:', error);
  }
}

export function registerStreamController(controller: ReadableStreamDefaultController<Uint8Array>) {
  activeStreams.add(controller);
}

export function unregisterStreamController(controller: ReadableStreamDefaultController<Uint8Array>) {
  activeStreams.delete(controller);
}

// Broadcast function for graph updates
async function broadcastGraphReload(_userId: string, metadata?: { source?: string }): Promise<void> {
  const snapshot = getCurrentGraph();
  if (snapshot) {
    broadcastGraphUpdate(snapshot, metadata);
  }
}

function normalizeGraph(original: Graph): Graph {
  const seenNodeIds = new Set<string>();
  const normalizedNodes = [] as any[];
  const globalPropOwner: Record<string, string> = {};

  for (const node of original.nodes || []) {
    if (!node?.id) continue;
    if (seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);

    const seenPropIds = new Set<string>();
    let properties = Array.isArray(node.properties) ? [...node.properties] : [];
    const nextProps: any[] = [];
    for (const p of properties) {
      if (!p || !p.id) continue;
      if (seenPropIds.has(p.id)) continue;
      let newId = String(p.id);
      const owner = globalPropOwner[newId];
      if (owner && owner !== node.id) {
        const prefixed = `${node.id}-${newId}`;
        console.warn(`Duplicate property id "${newId}" detected in multiple nodes; renaming to "${prefixed}" on node ${node.id}`);
        newId = prefixed;
      }
      seenPropIds.add(newId);
      globalPropOwner[newId] = node.id;
      nextProps.push({ ...p, id: newId });
    }

    normalizedNodes.push({ ...node, properties: nextProps });
  }

  const computedEdges: any[] = [];
  const existingNodeIds = new Set(normalizedNodes.map(n => n.id));
  for (const parent of normalizedNodes) {
    const children = Array.isArray(parent.children) ? parent.children : [];
    for (const child of children) {
      if (!child?.id) continue;
      if (!existingNodeIds.has(child.id)) continue;
      // Generate UUID for computed edges
      computedEdges.push({ id: randomUUID(), source: parent.id, target: child.id });
    }
  }

  const edges: any[] = ([...(original as any).edges || [], ...computedEdges]);
  const byPair = new Set<string>();
  const nextEdges: any[] = [];
  for (const e of edges) {
    const source = e?.source || e?.source_id;
    const target = e?.target || e?.target_id;
    if (!source || !target) continue;
    const pair = `${source}→${target}`;
    if (byPair.has(pair)) continue;
    byPair.add(pair);
    // Generate UUID if edge doesn't have an ID
    const id = e.id || randomUUID();
    nextEdges.push({ id, source, target, role: e.role });
  }

  const normalized: any = { nodes: normalizedNodes };
  if (nextEdges.length > 0) normalized.edges = nextEdges;
  return normalized as Graph;
}

// Read graph from Supabase
async function readGraphFromSupabase(): Promise<Graph | null> {
  try {
    const projectId = await getProjectId();

    // Fetch all nodes for this project
    const { data: nodesData, error: nodesError } = await supabase
      .from('nodes')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError) {
      console.error('Error fetching nodes from Supabase:', nodesError);
      return null;
    }

    // Fetch all edges for this project
    const { data: edgesData, error: edgesError } = await supabase
      .from('edges')
      .select('*')
      .eq('project_id', projectId);

    if (edgesError) {
      console.error('Error fetching edges from Supabase:', edgesError);
      return null;
    }

    // Convert to graph format
    const nodes = (nodesData || []).map(node => ({
      ...node.data,
      id: node.id,
    }));

    const edges = (edgesData || []).map(edge => ({
      ...edge.data,
      id: edge.id,
      source: edge.source_id,
      target: edge.target_id,
    }));

    const graph: Graph = {
      nodes,
      ...(edges.length > 0 ? { edges } : {}),
    };

    const parsed = GraphSchema.safeParse(graph);
    return parsed.success ? parsed.data : (graph as Graph);
  } catch (error) {
    console.error('Error reading graph from Supabase:', error);
    return null;
  }
}

// Write graph to Supabase
async function writeGraphToSupabase(graph: Graph): Promise<void> {
  try {
    const projectId = await getProjectId();

    // Delete all existing nodes and edges for this project (cascade will handle edges)
    await supabase.from('nodes').delete().eq('project_id', projectId);

    // Insert nodes
    if (graph.nodes && graph.nodes.length > 0) {
      const nodesToInsert = graph.nodes.map(node => ({
        id: node.id,
        project_id: projectId,
        data: node,
      }));

      const { error: nodesError } = await supabase
        .from('nodes')
        .insert(nodesToInsert);

      if (nodesError) {
        console.error('Error inserting nodes to Supabase:', nodesError);
        throw nodesError;
      }
    }

    // Insert edges
    if (graph.edges && graph.edges.length > 0) {
      const edgesToInsert = graph.edges.map(edge => ({
        id: edge.id,
        project_id: projectId,
        source_id: edge.source,
        target_id: edge.target,
        data: edge,
      }));

      const { error: edgesError } = await supabase
        .from('edges')
        .insert(edgesToInsert);

      if (edgesError) {
        console.error('Error inserting edges to Supabase:', edgesError);
        throw edgesError;
      }
    }
  } catch (error) {
    console.error('Error writing graph to Supabase:', error);
    throw error;
  }
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return getCurrentGraph(); }

export function getCurrentGraphSession(): Graph | null { return getCurrentGraph(); }

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraphFromAgent(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized);
  await broadcastGraphReload(userId, { source: 'agent' });
}

export async function storeCurrentGraphWithoutBroadcast(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized);
}

export async function loadGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = await readGraphFromSupabase();
  setCurrentGraph(graph);
  return graph;
}

export async function loadCurrentGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = await readGraphFromSupabase();
  setCurrentGraph(graph);
  return graph;
}

export async function clearGraphSession(): Promise<void> {
  try {
    const projectId = await getProjectId();
    // Delete all nodes (cascade will handle edges)
    await supabase.from('nodes').delete().eq('project_id', projectId);
    setCurrentGraph(null);
  } catch (error) {
    console.error('Error clearing graph session:', error);
  }
}

export function getGraphStats(): { hasGraph: boolean } { return { hasGraph: getCurrentGraph() !== null }; }

export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  const current = getCurrentGraph();
  if (!current) return null;
  return current.nodes.find(node => node.id === nodeId) || null;
}

export async function markNodesBuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  setCurrentGraph(updated);
  await writeGraphToSupabase(updated);
}

export async function markNodesUnbuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  setCurrentGraph(updated);
  await writeGraphToSupabase(updated);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  // Load current graph from Supabase
  const currentGraphFromSupabase = await readGraphFromSupabase();
  if (currentGraphFromSupabase) {
    setCurrentGraph(currentGraphFromSupabase);
  }
}

// ---- Layer management helpers (exposed for API routes) ----
// These are kept for compatibility but may not be used with Supabase
export function getActiveLayerName(): string | null { return null; }
export function setActiveLayer(name: string | null): void { }
export function getLayersState(): { layers: string[]; activeLayer: string | null } {
  return { layers: [], activeLayer: null };
}
