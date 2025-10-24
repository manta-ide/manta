import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';
import { getActiveLayer, setActiveLayer as persistActiveLayer, getLayersInfo, getMainGraphPaths } from '@/lib/layers-server';
import { analyzeGraphDiff } from '@/lib/graph-diff';

export type Graph = z.infer<typeof GraphSchema>;

type GraphServiceRuntimeState = {
  currentGraph: Graph | null;
  activeStreams: Set<ReadableStreamDefaultController<Uint8Array>>;
  broadcastTimeout: NodeJS.Timeout | null;
};

const globalGraphState = (globalThis as typeof globalThis & {
  __MANTA_GRAPH_SERVICE_STATE__?: GraphServiceRuntimeState;
}).__MANTA_GRAPH_SERVICE_STATE__ ??= {
  currentGraph: null,
  activeStreams: new Set<ReadableStreamDefaultController<Uint8Array>>(),
  broadcastTimeout: null,
};

const getCurrentGraph = () => globalGraphState.currentGraph;
const setCurrentGraph = (graph: Graph | null) => {
  globalGraphState.currentGraph = graph;
};

// Local mode toggle and helpers
const LOCAL_MODE = process.env.NODE_ENV !== 'production';
function getProjectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  try {
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'manta'))) return cwd;
    return cwd;
  } catch {
    return process.cwd();
  }
}
function getGraphDir(): string { return path.join(getProjectDir(), 'manta'); }
function getGraphPath(): string { return path.join(getGraphDir(), 'graph.xml'); }

// No longer need to ensure default layers - C4 layers are always available

function getCurrentGraphPath(): string {

  // Prefer active layer if configured
  try {
    const paths = getMainGraphPaths();
    if (paths.current && fs.existsSync(path.dirname(paths.current))) {
      return paths.current;
    }
  } catch {}
  return path.join(getGraphDir(), 'current-graph.xml');
}
// Removed getBaseGraphPath - base graphs no longer exist
function getLegacyGraphJsonPath(): string { return path.join(getGraphDir(), 'graph.json'); }
function ensureGraphDir() { try { fs.mkdirSync(getGraphDir(), { recursive: true }); } catch {} }
function readGraphFromFs(): Graph | null {
  try {
    const pXml = getGraphPath();
    const pJson = getLegacyGraphJsonPath();
    if (fs.existsSync(pXml)) {
      const raw = fs.readFileSync(pXml, 'utf8');
      const graph = xmlToGraph(raw);
      const parsed = GraphSchema.safeParse(graph);
      return parsed.success ? parsed.data : (graph as Graph);
    }
    if (fs.existsSync(pJson)) {
      const raw = fs.readFileSync(pJson, 'utf8');
      let data: any;
      try { data = JSON.parse(raw); } catch { data = null; }
      if (data) {
        const parsed = GraphSchema.safeParse(data);
        const graph = parsed.success ? parsed.data : (data as Graph);
        try { writeGraphToFs(graph); } catch {}
        return graph;
      }
    }
    return null;
  } catch {
    return null;
  }
}
function writeGraphToFs(graph: Graph) {
  ensureGraphDir();
  const xml = graphToXml(graph);
  fs.writeFileSync(getGraphPath(), xml, 'utf8');
}

function readCurrentGraphFromFs(): Graph | null {
  try {
    const currentPath = getCurrentGraphPath();
    if (fs.existsSync(currentPath)) {
      const raw = fs.readFileSync(currentPath, 'utf8');
      const graph = xmlToGraph(raw);
      const parsed = GraphSchema.safeParse(graph);
      return parsed.success ? parsed.data : (graph as Graph);
    }
    // Fallback to main graph file if current doesn't exist
    return readGraphFromFs();
  } catch {
    return null;
  }
}

function writeCurrentGraphToFs(graph: Graph) {
  ensureGraphDir();
  const xml = graphToXml(graph);
  fs.writeFileSync(getCurrentGraphPath(), xml, 'utf8');
}

// Removed readBaseGraphFromFs and writeBaseGraphToFs - base graphs no longer exist

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

// Persist graph to local filesystem
async function saveGraphToFs(graph: Graph): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeCurrentGraphToFs(normalized);
}

async function saveCurrentGraphToFs(graph: Graph): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeCurrentGraphToFs(normalized);
}

// Removed saveBaseGraphToFs - base graphs no longer exist

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return getCurrentGraph(); }

export function getCurrentGraphSession(): Graph | null { return getCurrentGraph(); }

// Removed getBaseGraphSession - base graphs no longer exist

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraphFromAgent(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId, { source: 'agent' });
}

export async function storeCurrentGraphWithoutBroadcast(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await saveCurrentGraphToFs(normalized);
}

// Removed storeBaseGraph - base graphs no longer exist

// Removed broadcastBaseGraphUpdate - base graphs no longer exist


export async function loadGraphFromFile(_userId: string): Promise<Graph | null> {
  // Prioritize current graph file, fallback to main graph file
  const graph = readCurrentGraphFromFs();
  setCurrentGraph(graph);
  return graph;
}

export async function loadCurrentGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = readCurrentGraphFromFs();
  setCurrentGraph(graph);
  return graph;
}

// Removed loadBaseGraphFromFile - base graphs no longer exist

export async function clearGraphSession(): Promise<void> { setCurrentGraph(null); }

export function getGraphStats(): { hasGraph: boolean } { return { hasGraph: getCurrentGraph() !== null }; }

export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  const current = getCurrentGraph();
  if (!current) return null;
  return current.nodes.find(node => node.id === nodeId) || null;
}

// Removed getUnbuiltNodeIds - unbuilt node concept no longer exists

export async function markNodesBuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  setCurrentGraph(updated);
  writeCurrentGraphToFs(updated);
}

export async function markNodesUnbuilt(nodeIds: string[], _userId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  setCurrentGraph(updated);
  writeCurrentGraphToFs(updated);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  // Load current graph from file
  const currentGraphFromFile = readCurrentGraphFromFs();
  if (currentGraphFromFile) {
    setCurrentGraph(currentGraphFromFile);
  }
  // Note: base graph is loaded on-demand, not pre-loaded here
}

// ---- Layer management helpers (exposed for API routes) ----
export function getActiveLayerName(): string | null { return getActiveLayer(); }
export function setActiveLayer(name: string | null): void {
  persistActiveLayer(name ?? null);
}
// Removed ensureLayersDir - no longer needed
export function getLayersState(): { layers: string[]; activeLayer: string | null } { return getLayersInfo(); }
