import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import { publishVarsUpdate } from './vars-bus';
import fs from 'fs';
import path from 'path';

export type Graph = z.infer<typeof GraphSchema>;

// In-memory cache of the current graph for this process
let currentGraph: Graph | null = null;

// Local mode toggle and helpers
const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
function getProjectDir(): string {
  const envDir = process.env.MANTA_PROJECT_DIR;
  if (envDir && fs.existsSync(envDir)) return envDir;
  // Fallback: try current working directory if it contains _graph
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
function getLegacyGraphJsonPath(): string { return path.join(getGraphDir(), 'graph.json'); }
function getVarsPath(): string { return path.join(getGraphDir(), 'vars.json'); }
function ensureGraphDir() { try { fs.mkdirSync(getGraphDir(), { recursive: true }); } catch {} }
function readGraphFromFs(): Graph | null {
  try {
    const pXml = getGraphPath();
    const pJson = getLegacyGraphJsonPath();
    console.log('pXml', pXml);
    console.log('pJson', pJson);
    if (fs.existsSync(pXml)) {
      const raw = fs.readFileSync(pXml, 'utf8');
      console.log('raw', raw);
      const graph = xmlToGraph(raw);
      console.log('xmlgraph', graph);
      const parsed = GraphSchema.safeParse(graph);
      console.log('parsed', parsed);
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
        console.log('graph', graph);
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
function writeVarsToFs(graph: Graph) {
  const vars = extractVariablesFromGraph(graph);
  ensureGraphDir();
  fs.writeFileSync(getVarsPath(), JSON.stringify(vars, null, 2), 'utf8');
}

// No-op broadcast function retained for compatibility
async function broadcastGraphReload(_userId: string): Promise<void> { return; }

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
    const id = `${source}-${target}`;
    nextEdges.push({ id, source, target });
  }

  const normalized: any = { nodes: normalizedNodes };
  if (nextEdges.length > 0) normalized.edges = nextEdges;
  return normalized as Graph;
}

// Persist graph to local filesystem
async function saveGraphToFs(graph: Graph): Promise<void> {
  const normalized = normalizeGraph(graph);
  writeGraphToFs(normalized);
  writeVarsToFs(normalized);
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return currentGraph; }

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  console.log(`💾 GraphService: storeGraph called for user ${userId}, nodes: ${graph.nodes?.length || 0}`);
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  console.log(`💾 GraphService: currentGraph updated with ${currentGraph?.nodes?.length || 0} nodes`);
  await saveGraphToFs(normalized);
  await broadcastGraphReload(userId);
  console.log(`💾 GraphService: storeGraph completed`);
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
  // Always publish a realtime vars update for subscribers (iframe bridge)
  try { publishVarsUpdate({ [propertyId]: value }); } catch {}
  // Only write vars.json to avoid triggering full reload from graph.json changes
  if (currentGraph) writeVarsToFs(currentGraph);
}

export async function loadGraphFromFile(_userId: string): Promise<Graph | null> {
  const graph = readGraphFromFs();
  currentGraph = graph;
  return graph;
}

export async function clearGraphSession(): Promise<void> { currentGraph = null; }

export function getGraphStats(): { hasGraph: boolean } { return { hasGraph: currentGraph !== null }; }

export function getGraphNode(nodeId: string): z.infer<typeof GraphNodeSchema> | null {
  if (!currentGraph) return null;
  return currentGraph.nodes.find(node => node.id === nodeId) || null;
}

export function getUnbuiltNodeIds(): string[] {
  if (!currentGraph) return [];
  return currentGraph.nodes.filter(n => (n.state || 'unbuilt') !== 'built').map(n => n.id);
}

export async function markNodesBuilt(nodeIds: string[], _userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  if (currentGraph) writeGraphToFs(currentGraph);
}

export async function markNodesUnbuilt(nodeIds: string[], _userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  if (currentGraph) writeGraphToFs(currentGraph);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  // Nothing to do; graph is read lazily from _graph/graph.json
  return;
}
