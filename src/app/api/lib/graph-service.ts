import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import { GRAPHS_DATA, graphExists, getAvailableGraphIds } from '@/data/graphs';
import { analyzeGraphDiff } from '@/lib/graph-diff';

export type Graph = z.infer<typeof GraphSchema>;

type GraphServiceRuntimeState = {
  currentGraph: Graph | null;
  activeStreams: Set<ReadableStreamDefaultController<Uint8Array>>;
  broadcastTimeout: NodeJS.Timeout | null;
  baseGraphBroadcastTimeout: NodeJS.Timeout | null;
};

const globalGraphState = (globalThis as typeof globalThis & {
  __MANTA_GRAPH_SERVICE_STATE__?: GraphServiceRuntimeState;
}).__MANTA_GRAPH_SERVICE_STATE__ ??= {
  currentGraph: null,
  activeStreams: new Set<ReadableStreamDefaultController<Uint8Array>>(),
  broadcastTimeout: null,
  baseGraphBroadcastTimeout: null,
};

const getCurrentGraph = () => globalGraphState.currentGraph;
const setCurrentGraph = (graph: Graph | null) => {
  globalGraphState.currentGraph = graph;
};

// In-memory graph storage - replaces filesystem operations
const LOCAL_MODE = process.env.NODE_ENV !== 'production';

// Active graph ID tracking (simulates active layer)
let activeGraphId = 'main';

function getActiveGraphId(): string {
  return activeGraphId;
}

function setActiveGraphId(graphId: string): void {
  if (graphExists(graphId)) {
    activeGraphId = graphId;
  } else {
    console.warn(`Graph "${graphId}" does not exist. Keeping active graph as "${activeGraphId}".`);
  }
}

function readCurrentGraphFromMemory(graphId: string = activeGraphId): Graph | null {
  try {
    if (!graphExists(graphId)) {
      console.warn(`Graph "${graphId}" not found in memory`);
      return null;
    }
    const raw = GRAPHS_DATA[graphId].current;
    const graph = xmlToGraph(raw);
    const parsed = GraphSchema.safeParse(graph);
    return parsed.success ? parsed.data : (graph as Graph);
  } catch (error) {
    console.error(`Error reading current graph "${graphId}":`, error);
    return null;
  }
}

function writeCurrentGraphToMemory(graph: Graph, graphId: string = activeGraphId) {
  try {
    if (!graphExists(graphId)) {
      console.warn(`Graph "${graphId}" does not exist. Cannot write.`);
      return;
    }
    const xml = graphToXml(graph);
    GRAPHS_DATA[graphId].current = xml;
  } catch (error) {
    console.error(`Error writing current graph "${graphId}":`, error);
  }
}

function readBaseGraphFromMemory(graphId: string = activeGraphId): Graph | null {
  try {
    if (!graphExists(graphId)) {
      console.warn(`Graph "${graphId}" not found in memory`);
      return null;
    }
    const raw = GRAPHS_DATA[graphId].base;
    const graph = xmlToGraph(raw);
    const parsed = GraphSchema.safeParse(graph);
    return parsed.success ? parsed.data : (graph as Graph);
  } catch (error) {
    console.error(`Error reading base graph "${graphId}":`, error);
    return null;
  }
}

function writeBaseGraphToMemory(graph: Graph, graphId: string = activeGraphId) {
  try {
    if (!graphExists(graphId)) {
      console.warn(`Graph "${graphId}" does not exist. Cannot write.`);
      return;
    }
    const xml = graphToXml(graph);
    GRAPHS_DATA[graphId].base = xml;
  } catch (error) {
    console.error(`Error writing base graph "${graphId}":`, error);
  }
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
      computedEdges.push({ id: `${parent.id}-${child.id}`, source: parent.id, target: child.id });
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
    const id = e.id || `${source}-${target}`;
    nextEdges.push({ id, source, target, role: e.role });
  }

  const normalized: any = { nodes: normalizedNodes };
  if (nextEdges.length > 0) normalized.edges = nextEdges;
  return normalized as Graph;
}

// Persist graph to in-memory storage
async function saveGraphToMemory(graph: Graph, graphId: string = activeGraphId): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeCurrentGraphToMemory(normalized, graphId);
}

async function saveCurrentGraphToMemory(graph: Graph, graphId: string = activeGraphId): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeCurrentGraphToMemory(normalized, graphId);
}

async function saveBaseGraphToMemory(graph: Graph, graphId: string = activeGraphId): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeBaseGraphToMemory(normalized, graphId);
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return getCurrentGraph(); }

export function getCurrentGraphSession(): Graph | null { return getCurrentGraph(); }

export function getBaseGraphSession(): Graph | null {
  // For now, we'll store this in memory too, but we could load from file if needed
  return null; // Will be managed by frontend store
}

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToMemory(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToMemory(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraphFromAgent(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToMemory(normalized);
  await broadcastGraphReload(userId, { source: 'agent' });
}

export async function storeCurrentGraphWithoutBroadcast(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToMemory(normalized);
}

export async function storeBaseGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  await saveBaseGraphToMemory(normalized);
  // Broadcast base graph update for UI awareness
  broadcastBaseGraphUpdate(normalized);
}

function broadcastBaseGraphUpdate(graph: Graph): void {
  if (activeStreams.size === 0) return;

  try {
    const message = {
      type: 'base-graph-update',
      baseGraph: graph,
      source: 'agent', // Mark as agent-driven to bypass SSE suppression
      timestamp: new Date().toISOString()
    };
    const payload = `data: ${JSON.stringify(message)}\n\n`;

    // Also send build completion signal
    const completionMessage = {
      type: 'build-complete',
      message: 'Graph build process completed successfully',
      timestamp: new Date().toISOString()
    };
    const completionPayload = `data: ${JSON.stringify(completionMessage)}\n\n`;
    console.log('📤 Broadcasting build-complete message to all SSE clients');

    // Don't clear pending broadcasts - use separate timeout for base graph updates
    // to avoid interfering with regular graph broadcasts

    // Debounce broadcasts to avoid spam (max 10 per second)
    if (!globalGraphState.baseGraphBroadcastTimeout) {
      globalGraphState.baseGraphBroadcastTimeout = setTimeout(() => {
        for (const controller of activeStreams) {
          try {
            controller.enqueue(new TextEncoder().encode(payload));
            // Also send completion signal
            controller.enqueue(new TextEncoder().encode(completionPayload));
          } catch (error) {
            // Remove broken connections
            activeStreams.delete(controller);
          }
        }
        globalGraphState.baseGraphBroadcastTimeout = null;
      }, 100);
    }
  } catch (error) {
    console.error('Error broadcasting base graph update:', error);
  }
}


export async function loadGraphFromFile(_userId: string): Promise<Graph | null> {
  // Load from in-memory storage
  const graph = readCurrentGraphFromMemory();
  setCurrentGraph(graph);
  return graph;
}

export async function loadCurrentGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = readCurrentGraphFromMemory();
  setCurrentGraph(graph);
  return graph;
}

export async function loadBaseGraphFromFile(_userId: string): Promise<Graph | null> {
  return readBaseGraphFromMemory();
}

export async function clearGraphSession(): Promise<void> { setCurrentGraph(null); }

export function getGraphStats(): { hasGraph: boolean } { return { hasGraph: getCurrentGraph() !== null }; }

export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  const current = getCurrentGraph();
  if (!current) return null;
  return current.nodes.find(node => node.id === nodeId) || null;
}

export function getUnbuiltNodeIds(): string[] {
  const current = getCurrentGraph();
  if (!current) return [];
  const baseGraph = readBaseGraphFromMemory();
  if (!baseGraph) {
    // If no base graph exists, consider all nodes unbuilt
    return current.nodes.map(n => n.id);
  }
  const diff = analyzeGraphDiff(baseGraph as any, current as any);
  return [...diff.addedNodes, ...diff.modifiedNodes];
}

export async function markNodesBuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  setCurrentGraph(updated);
  writeCurrentGraphToMemory(updated);
}

export async function markNodesUnbuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  setCurrentGraph(updated);
  writeCurrentGraphToMemory(updated);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  // Load current graph from in-memory storage
  const currentGraphFromMemory = readCurrentGraphFromMemory();
  if (currentGraphFromMemory) {
    setCurrentGraph(currentGraphFromMemory);
  }
  // Note: base graph is loaded on-demand, not pre-loaded here
}

// ---- Layer management helpers (exposed for API routes) ----
// Now these work with graph IDs instead of filesystem layers
export function getActiveLayerName(): string | null { return getActiveGraphId(); }
export function setActiveLayer(name: string | null): void {
  if (name) {
    setActiveGraphId(name);
  }
}
export function ensureLayersDir(): void {
  // No-op for in-memory storage
}
export function getLayersState(): { layers: string[]; activeLayer: string | null } {
  return {
    layers: getAvailableGraphIds(),
    activeLayer: getActiveGraphId()
  };
}
