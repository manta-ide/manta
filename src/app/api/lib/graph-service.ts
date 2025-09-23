import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';
import { analyzeGraphDiff } from '@/lib/graph-diff';

export type Graph = z.infer<typeof GraphSchema>;

// In-memory cache of the current graph for this process
let currentGraph: Graph | null = null;

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
    if (fs.existsSync(path.join(cwd, '_graph'))) return cwd;
    return cwd;
  } catch {
    return process.cwd();
  }
}
function getGraphDir(): string { return path.join(getProjectDir(), '_graph'); }
function getGraphPath(): string { return path.join(getGraphDir(), 'graph.xml'); }
function getCurrentGraphPath(): string { return path.join(getGraphDir(), 'current-graph.xml'); }
function getBaseGraphPath(): string { return path.join(getGraphDir(), 'base-graph.xml'); }
function getLegacyGraphJsonPath(): string { return path.join(getGraphDir(), 'graph.json'); }
function getVarsPath(): string { return path.join(getGraphDir(), 'vars.json'); }
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

function readBaseGraphFromFs(): Graph | null {
  try {
    const basePath = getBaseGraphPath();
    if (fs.existsSync(basePath)) {
      const raw = fs.readFileSync(basePath, 'utf8');
      const graph = xmlToGraph(raw);
      const parsed = GraphSchema.safeParse(graph);
      return parsed.success ? parsed.data : (graph as Graph);
    }
    return null;
  } catch {
    return null;
  }
}

function writeBaseGraphToFs(graph: Graph) {
  ensureGraphDir();
  const xml = graphToXml(graph);
  fs.writeFileSync(getBaseGraphPath(), xml, 'utf8');
}
function writeVarsToFs(graph: Graph) {
  const vars = extractVariablesFromGraph(graph);
  ensureGraphDir();
  fs.writeFileSync(getVarsPath(), JSON.stringify(vars, null, 2), 'utf8');
}

// SSE broadcast system
const activeStreams = new Set<ReadableStreamDefaultController<Uint8Array>>();
let broadcastTimeout: NodeJS.Timeout | null = null;

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
    if (broadcastTimeout) {
      clearTimeout(broadcastTimeout);
      broadcastTimeout = null;
    }

    // Debounce broadcasts to avoid spam (max 10 per second)
    broadcastTimeout = setTimeout(() => {
      const data = new TextEncoder().encode(payload);
      for (const controller of activeStreams) {
        try {
          controller.enqueue(data);
        } catch (error) {
          // Remove broken connections
          activeStreams.delete(controller);
        }
      }
      broadcastTimeout = null;
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
  if (currentGraph) {
    broadcastGraphUpdate(currentGraph, metadata);
  }
}

function extractVariablesFromGraph(graph: Graph): Record<string, any> {
  const vars: Record<string, any> = {};
  (graph.nodes || []).forEach(node => {
    if (Array.isArray(node.properties)) {
      node.properties.forEach((p: any, index: number) => {
        const propertyId = (p.id || `property-${index}`).toString().toLowerCase().replace(/\s+/g, '-');
        vars[propertyId] = p.value;
      });
    }
  });
  return vars;
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
  writeVarsToFs(normalized);
}

async function saveCurrentGraphToFs(graph: Graph): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeCurrentGraphToFs(normalized);
  writeVarsToFs(normalized);
}

async function saveBaseGraphToFs(graph: Graph): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeBaseGraphToFs(normalized);
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return currentGraph; }

export function getCurrentGraphSession(): Graph | null { return currentGraph; }

export function getBaseGraphSession(): Graph | null {
  // For now, we'll store this in memory too, but we could load from file if needed
  return null; // Will be managed by frontend store
}

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId);
  // Also update the vars file to ensure consistency
  writeVarsToFs(normalized);
}

export async function storeCurrentGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId);
  writeVarsToFs(normalized);
}

export async function storeCurrentGraphFromAgent(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  await saveCurrentGraphToFs(normalized);
  await broadcastGraphReload(userId, { source: 'agent' });
  writeVarsToFs(normalized);
}

export async function storeCurrentGraphWithoutBroadcast(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  await saveCurrentGraphToFs(normalized);
  writeVarsToFs(normalized);
}

export async function storeBaseGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  await saveBaseGraphToFs(normalized);
  // Broadcast base graph update for UI awareness
  broadcastBaseGraphUpdate(normalized);
}

function broadcastBaseGraphUpdate(graph: Graph): void {
  if (activeStreams.size === 0) return;

  try {
    const message = {
      type: 'base-graph-update',
      baseGraph: graph,
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

    // Clear any pending broadcast
    if (broadcastTimeout) {
      clearTimeout(broadcastTimeout);
      broadcastTimeout = null;
    }

    // Debounce broadcasts to avoid spam (max 10 per second)
    broadcastTimeout = setTimeout(() => {
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
      broadcastTimeout = null;
    }, 100);
  } catch (error) {
    console.error('Error broadcasting base graph update:', error);
  }
}

export async function updatePropertyAndWriteVars(nodeId: string, propertyId: string, value: any, userId: string): Promise<void> {
  if (currentGraph) {
    const idx = currentGraph.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      const node = currentGraph.nodes[idx] as any;
      if (Array.isArray(node.properties)) {
        const pIdx = node.properties.findIndex((p: any) => p.id === propertyId);
        if (pIdx !== -1) node.properties[pIdx] = { ...node.properties[pIdx], value };
      }
    }
  }
  // Save the updated graph to current-graph.xml as the primary persistence
  if (currentGraph) writeCurrentGraphToFs(currentGraph);
  // Update the vars file for the child project to consume
  if (currentGraph) writeVarsToFs(currentGraph);
}

export async function loadGraphFromFile(_userId: string): Promise<Graph | null> {
  // Prioritize current graph file, fallback to main graph file
  const graph = readCurrentGraphFromFs();
  currentGraph = graph;
  return graph;
}

export async function loadCurrentGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = readCurrentGraphFromFs();
  currentGraph = graph;
  return graph;
}

export async function loadBaseGraphFromFile(_userId: string): Promise<Graph | null> {
  return readBaseGraphFromFs();
}

export async function clearGraphSession(): Promise<void> { currentGraph = null; }

export function getGraphStats(): { hasGraph: boolean } { return { hasGraph: currentGraph !== null }; }

export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  if (!currentGraph) return null;
  return currentGraph.nodes.find(node => node.id === nodeId) || null;
}

export function getUnbuiltNodeIds(): string[] {
  if (!currentGraph) return [];
  const baseGraph = readBaseGraphFromFs();
  if (!baseGraph) {
    // If no base graph exists, consider all nodes unbuilt
    return currentGraph.nodes.map(n => n.id);
  }
  const diff = analyzeGraphDiff(baseGraph as any, currentGraph as any);
  return [...diff.addedNodes, ...diff.modifiedNodes];
}

export async function markNodesBuilt(nodeIds: string[], _userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  if (currentGraph) writeCurrentGraphToFs(currentGraph);
}

export async function markNodesUnbuilt(nodeIds: string[], _userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  if (currentGraph) writeCurrentGraphToFs(currentGraph);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  // Load current graph from file
  const currentGraphFromFile = readCurrentGraphFromFs();
  if (currentGraphFromFile) {
    currentGraph = currentGraphFromFile;
  }
  // Note: base graph is loaded on-demand, not pre-loaded here
}
