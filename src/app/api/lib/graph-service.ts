import { z } from 'zod';
import { GraphSchema, GraphNodeSchema, Property } from './schemas';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
function getGraphPath(): string { return path.join(getGraphDir(), 'graph.json'); }
function getVarsPath(): string { return path.join(getGraphDir(), 'vars.json'); }
function ensureGraphDir() { try { fs.mkdirSync(getGraphDir(), { recursive: true }); } catch {} }
function readGraphFromFs(): Graph | null {
  try {
    const p = getGraphPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    const parsed = GraphSchema.safeParse(data);
    if (!parsed.success) return data as Graph; // be lenient in local mode
    return parsed.data as Graph;
  } catch {
    return null;
  }
}
function writeGraphToFs(graph: Graph) {
  ensureGraphDir();
  fs.writeFileSync(getGraphPath(), JSON.stringify(graph, null, 2), 'utf8');
}
function writeVarsToFs(graph: Graph) {
  const vars = extractVariablesFromGraph(graph);
  ensureGraphDir();
  fs.writeFileSync(getVarsPath(), JSON.stringify(vars, null, 2), 'utf8');
}

// --- Supabase client helpers ---
function getSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key);
}

// --- Realtime broadcast to notify clients to reload graph ---
async function broadcastGraphReload(userId: string): Promise<void> {
  if (LOCAL_MODE) return; // SSE polling handles updates in local mode
  try {
    const client = getSupabaseServiceClient();
    // Prefer sandbox-based room to match client behavior
    let roomId = userId;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/sandbox/init`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data?.sandbox?.sandboxId) roomId = data.sandbox.sandboxId;
      }
    } catch {}
    const room = `graph-broadcast-${roomId}`;
    const channel = client.channel(room, { config: { broadcast: { self: false, ack: false } } });
    channel.subscribe();
    await channel.send({ type: 'broadcast', event: 'graph_reload', payload: {} });
    try { await client.removeChannel(channel); } catch {}
  } catch (e) {
    console.warn('Broadcast graph_reload failed:', e);
  }
}

// --- Loading from Supabase into Graph ---
async function loadGraphFromSupabase(userId: string): Promise<Graph | null> {
  const client = getSupabaseServiceClient();
  const { data: nodesData, error: nodesError } = await client
    .from('graph_nodes')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });
  if (nodesError) throw nodesError;

  const { data: propsData, error: propsError } = await client
    .from('graph_properties')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });
  if (propsError) throw propsError;

  const { data: edgesData, error: edgesError } = await client
    .from('graph_edges')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });
  if (edgesError) throw edgesError;

  const nodes = (nodesData || []).map((db: any) => ({
    id: db.id,
    title: db.title,
    prompt: db.prompt || '',
    state: db.state || 'unbuilt',
    position: { x: db.position_x || 0, y: db.position_y || 0 },
    width: db.width || undefined,
    height: db.height || undefined,
    properties: undefined as any,
    children: [] as any[],
  }));

  const byId = new Map(nodes.map(n => [n.id, n] as const));
  (propsData || []).forEach((p: any) => {
    const node = byId.get(p.node_id);
    if (!node) return;
    const prop = {
      id: p.id,
      title: p.name,
      type: p.type,
      value: p.value,
      options: p.options,
      fields: p.fields || undefined,
      itemFields: p.item_fields || undefined,
      itemTitle: p.item_title || undefined,
      addLabel: p.add_label || undefined,
    } as any;
    if (!node.properties) node.properties = [] as any;
    (node.properties as any[]).push(prop);
  });
  (edgesData || []).forEach((e: any) => {
    const source = byId.get(e.source_id);
    const target = byId.get(e.target_id);
    if (source && target) {
      source.children.push({ id: target.id, title: target.title });
    }
  });

  const graph: Graph = { nodes };
  return graph.nodes.length > 0 ? graph : null;
}

export async function getGraphFilesFromSupabase(userId: string): Promise<{ graphJson?: string; varsJson?: string }> {
  try {
    const graph = await loadGraphFromSupabase(userId);
    if (!graph) return {};
    const vars = extractVariablesFromGraph(graph);
    return {
      graphJson: JSON.stringify(graph, null, 2),
      varsJson: JSON.stringify(vars, null, 2),
    };
  } catch (e) {
    return {};
  }
}

async function updatePropertyInSupabase(userId: string, nodeId: string, propertyId: string, value: any): Promise<void> {
  const client = getSupabaseServiceClient();
  const { data: existing, error: readErr } = await client
    .from('graph_properties')
    .select('id, type, name, options, fields, item_fields, item_title, add_label')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .limit(1);
  if (readErr) throw readErr;

  if (existing && existing.length > 0) {
    const { error } = await client
      .from('graph_properties')
      .update({ value })
      .eq('id', propertyId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  // Fallback: insert a new row inferring the type from currentGraph if possible
  let inferredType: string = 'text';
  let inferredTitle: string = propertyId;
  let extra: any = {};
  if (currentGraph) {
    for (const n of currentGraph.nodes || []) {
      if (!Array.isArray(n.properties)) continue;
      for (const p of n.properties) {
        if (p?.id === propertyId) {
          inferredType = (p as any).type || 'text';
          inferredTitle = (p as any).title || propertyId;
          extra = {
            options: (p as any).options,
            fields: (p as any).fields,
            item_fields: (p as any).itemFields,
            item_title: (p as any).itemTitle,
            add_label: (p as any).addLabel,
          };
          break;
        }
      }
    }
  }
  const insertRow: any = {
    id: propertyId,
    node_id: nodeId,
    name: inferredTitle,
    type: inferredType,
    value,
    user_id: userId,
    ...extra,
  };
  const { error } = await client.from('graph_properties').upsert(insertRow);
  if (error) throw error;
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
    const id = `${source}-${target}`;
    nextEdges.push({ id, source, target });
  }

  const normalized: any = { nodes: normalizedNodes };
  if (nextEdges.length > 0) normalized.edges = nextEdges;
  return normalized as Graph;
}

async function saveGraphToSupabase(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  const client = getSupabaseServiceClient();
  const nodeRows = (normalized.nodes || []).map((n) => ({
    id: n.id,
    title: n.title,
    prompt: n.prompt || '',
    state: n.state || 'unbuilt',
    position_x: n.position?.x || 0,
    position_y: n.position?.y || 0,
    width: n.width,
    height: n.height,
    user_id: userId,
  }));
  if (nodeRows.length > 0) {
    const { error } = await client.from('graph_nodes').upsert(nodeRows);
    if (error) throw error;
  }

  const edges: any[] = (normalized as any).edges || [];
  if (Array.isArray(edges) && edges.length > 0) {
    const pairSet = new Set<string>();
    const edgeRows = edges.map((e: any) => ({
      id: e.id,
      source_id: e.source || e.source_id,
      target_id: e.target || e.target_id,
      user_id: userId,
    })).filter((row) => {
      const key = `${row.user_id}:${row.source_id}:${row.target_id}`;
      if (pairSet.has(key)) return false;
      pairSet.add(key);
      return true;
    });
    const { error } = await client.from('graph_edges').upsert(edgeRows);
    if (error) throw error;
  }

  const propRows: any[] = [];
  (normalized.nodes || []).forEach((n) => {
    if (Array.isArray(n.properties)) {
      n.properties.forEach((p: any) => {
        propRows.push({
          id: p.id,
          node_id: n.id,
          name: p.title,
          type: p.type || 'text',
          value: p.value,
          options: p.options,
          fields: p.fields,
          item_fields: p.itemFields,
          item_title: p.itemTitle,
          add_label: p.addLabel,
          user_id: userId,
        });
      });
    }
  });
  if (propRows.length > 0) {
    const seen = new Set<string>();
    const uniqueProps = propRows.filter((r) => {
      const key = String(r.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const { error } = await client.from('graph_properties').upsert(uniqueProps);
    if (error) throw error;
  }
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return currentGraph; }

export async function storeGraph(graph: Graph, userId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  currentGraph = normalized;
  if (LOCAL_MODE) {
    writeGraphToFs(normalized);
    writeVarsToFs(normalized);
    return;
  }
  await saveGraphToSupabase(normalized, userId);
  await broadcastGraphReload(userId);
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
  if (LOCAL_MODE) {
    // Only write vars.json to avoid triggering Vite full page reload from graph.json changes
    if (currentGraph) {
      writeVarsToFs(currentGraph);
    }
    return;
  }
  await updatePropertyInSupabase(userId, nodeId, propertyId, value);
}

export async function loadGraphFromFile(userId: string): Promise<Graph | null> {
  if (LOCAL_MODE) {
    const graph = readGraphFromFs();
    currentGraph = graph;
    return graph;
  }
  try {
    const graph = await loadGraphFromSupabase(userId);
    currentGraph = graph;
    return graph;
  } catch {
    return null;
  }
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

export async function markNodesBuilt(nodeIds: string[], userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  if (LOCAL_MODE) { if (currentGraph) writeGraphToFs(currentGraph); return; }
  const client = getSupabaseServiceClient();
  await client.from('graph_nodes').update({ state: 'built' }).in('id', nodeIds).eq('user_id', userId);
}

export async function markNodesUnbuilt(nodeIds: string[], userId: string): Promise<void> {
  if (!currentGraph) return;
  const idSet = new Set(nodeIds);
  currentGraph = { ...currentGraph, nodes: currentGraph.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  if (LOCAL_MODE) { if (currentGraph) writeGraphToFs(currentGraph); return; }
  const client = getSupabaseServiceClient();
  await client.from('graph_nodes').update({ state: 'unbuilt' }).in('id', nodeIds).eq('user_id', userId);
}

export async function initializeGraphsFromFiles(): Promise<void> {
  if (LOCAL_MODE) {
    // Nothing to do; graph is read lazily from _graph/graph.json
    return;
  }
  console.log('🔄 Graph initialization now uses Supabase per-user - skipping global initialization');
}

// --- Supabase-specific utilities for template sync and clearing ---
export class SupabaseGraphService {
  private static async getSupabaseServiceClient(): Promise<SupabaseClient> {
    return getSupabaseServiceClient();
  }
  static async clearUserGraphData(userId: string): Promise<void> {
    const client = await this.getSupabaseServiceClient();
    const { error: propertiesError } = await client.from('graph_properties').delete().eq('user_id', userId);
    if (propertiesError) throw new Error(`Failed to delete properties: ${propertiesError.message}`);
    const { error: edgesError } = await client.from('graph_edges').delete().eq('user_id', userId);
    if (edgesError) throw new Error(`Failed to delete edges: ${edgesError.message}`);
    const { error: nodesError } = await client.from('graph_nodes').delete().eq('user_id', userId);
    if (nodesError) throw new Error(`Failed to delete nodes: ${nodesError.message}`);
  }
  private static loadBaseTemplateGraph(): any {
    const baseTemplatePath = path.join(process.cwd(), 'vite-base-template');
    const graphPath = path.join(baseTemplatePath, '_graph', 'graph.json');
    if (!fs.existsSync(graphPath)) throw new Error(`Base template graph not found at ${graphPath}`);
    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    return this.convertTemplateGraphFormat(graphData);
  }
  private static calculateNodePosition(node: any, allNodes: any[]): { x: number; y: number } {
    if (!node.parentId || node.parentId === 'root') return { x: 400, y: 100 };
    const siblings = allNodes.filter(n => n.parentId === node.parentId);
    const siblingIndex = siblings.findIndex(n => n.id === node.id);
    const baseX = 100; const spacing = 300; const x = baseX + siblingIndex * spacing; const y = 300;
    return { x, y };
  }
  private static convertTemplateGraphFormat(templateGraph: any): Graph {
    const nodes: any[] = [];
    const edges: { id: string; source: string; target: string }[] = [];
    for (const templateNode of templateGraph.nodes || []) {
      const properties: Property[] = (templateNode.properties || []).map((prop: any) => ({
        id: prop.id,
        title: prop.title,
        type: prop.type,
        value: prop.value,
        options: prop.options,
        ...(Array.isArray(prop.fields) ? { fields: prop.fields } : {}),
        ...(Array.isArray(prop.itemFields) ? { itemFields: prop.itemFields } : {}),
        ...(prop.itemTitle ? { itemTitle: prop.itemTitle } : {}),
        ...(prop.addLabel ? { addLabel: prop.addLabel } : {}),
      }));
      const node = {
        id: templateNode.id,
        title: templateNode.title,
        prompt: templateNode.prompt || '',
        state: templateNode.state || 'unbuilt',
        position: this.calculateNodePosition(templateNode, templateGraph.nodes),
        properties: properties.length > 0 ? properties : undefined,
        children: (templateNode.children || []).map((child: any) => ({ id: child.id, title: child.title })),
      };
      nodes.push(node);
      if (templateNode.parentId && templateNode.parentId !== 'root') {
        edges.push({ id: `${templateNode.parentId}-${templateNode.id}`, source: templateNode.parentId, target: templateNode.id });
      }
      if (templateNode.children && Array.isArray(templateNode.children)) {
        for (const child of templateNode.children) {
          edges.push({ id: `${templateNode.id}-${child.id}`, source: templateNode.id, target: child.id });
        }
      }
    }
    const uniqueEdges = edges.filter((edge, index, self) => index === self.findIndex(e => e.id === edge.id));
    return { nodes, edges: uniqueEdges } as Graph;
  }
  static async syncTemplateGraphToSupabase(userId: string): Promise<void> {
    const templateGraph = this.loadBaseTemplateGraph();
    await this.clearUserGraphData(userId);
    const client = await this.getSupabaseServiceClient();
    for (const node of templateGraph.nodes) {
      const { error: nodeError } = await client.from('graph_nodes').upsert({
        id: node.id,
        title: node.title,
        prompt: node.prompt,
        state: node.state,
        position_x: node.position?.x || 0,
        position_y: node.position?.y || 0,
        width: node.width,
        height: node.height,
        user_id: userId,
      });
      if (nodeError) throw new Error(`Failed to save node ${node.id}: ${nodeError.message}`);
      if (node.properties && node.properties.length > 0) {
        const propertiesData = node.properties.map((prop: any) => ({
          id: prop.id,
          node_id: node.id,
          name: prop.title,
          type: prop.type,
          value: prop.value,
          options: prop.options,
          fields: prop.fields,
          item_fields: prop.itemFields,
          item_title: prop.itemTitle,
          add_label: prop.addLabel,
          user_id: userId,
        }));
        const { error: propertiesError } = await client.from('graph_properties').upsert(propertiesData);
        if (propertiesError) throw new Error(`Failed to save properties for node ${node.id}: ${propertiesError.message}`);
      }
    }
    if (templateGraph.edges && templateGraph.edges.length > 0) {
      const { error: edgesError } = await client.from('graph_edges').upsert(
        templateGraph.edges.map((edge: any) => ({ id: edge.id, source_id: edge.source, target_id: edge.target, user_id: userId }))
      );
      if (edgesError) throw new Error(`Failed to save edges: ${edgesError.message}`);
    }
  }
}
