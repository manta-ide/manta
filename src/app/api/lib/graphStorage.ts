import { z } from 'zod';
import { GraphSchema, GraphNodeSchema } from './schemas';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type Graph = z.infer<typeof GraphSchema>;

// Single graph storage (in-memory cache)
let currentGraph: Graph | null = null;

// Supabase service client for server-side operations (no sockets required)
function getSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key);
}

async function broadcastGraphReload(userId: string): Promise<void> {
  try {
    const client = getSupabaseServiceClient();
    // Try sandbox-based room first to match client behavior
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
    // Fire-and-forget broadcast; if the channel isn't ready yet, Realtime will still try to deliver
    await channel.send({ type: 'broadcast', event: 'graph_reload', payload: {} });
    // Best-effort cleanup
    try { await client.removeChannel(channel); } catch {}
  } catch (e) {
    console.warn('Broadcast graph_reload failed:', e);
  }
}

async function loadGraphFromSupabase(userId: string): Promise<Graph | null> {
  const client = getSupabaseServiceClient();
  // Load nodes, edges, and properties via HTTP requests (no realtime)
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
    built: !!db.built,
    properties: undefined as any,
    children: [] as any[],
  }));

  const byId = new Map(nodes.map(n => [n.id, n] as const));
  // Attach properties
  (propsData || []).forEach((p: any) => {
    const node = byId.get(p.node_id);
    if (!node) return;
    const prop = {
      id: p.id,
      title: p.name,
      type: p.type,
      value: p.value,
      options: p.options,
      // Complex schema support
      fields: p.fields || undefined,
      itemFields: p.item_fields || undefined,
      itemTitle: p.item_title || undefined,
      addLabel: p.add_label || undefined,
    } as any;
    if (!node.properties) node.properties = [] as any;
    (node.properties as any[]).push(prop);
  });
  // Attach children from edges (source -> target)
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

/**
 * Build `_graph` files (graph.json and vars.json) from Supabase for a given user.
 * Returns pretty-printed JSON strings when available.
 */
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
  // Prefer updating existing row to preserve type/metadata
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

async function writeVarsJsonToBlaxel(userId: string, graph: Graph): Promise<void> {
  const vars = extractVariablesFromGraph(graph);
  const content = JSON.stringify(vars, null, 2);
  const baseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/blaxel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'writeFile',
      userId,
      path: 'blaxel/app/_graph/vars.json',
      content
    })
  });
  if (!res.ok) {
    throw new Error('Failed to write vars.json to Blaxel');
  }
}

function normalizeGraphForSupabase(original: Graph): Graph {
  const seenNodeIds = new Set<string>();
  const normalizedNodes = [] as any[];
  // Track which node first claimed a property id
  const globalPropOwner: Record<string, string> = {};

  for (const node of original.nodes || []) {
    if (!node?.id) continue;
    if (seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);

    // Dedupe properties per node and enforce global uniqueness of property IDs
    const seenPropIds = new Set<string>();
    let properties = Array.isArray(node.properties) ? [...node.properties] : [];
    const nextProps: any[] = [];
    for (const p of properties) {
      if (!p || !p.id) continue;
      if (seenPropIds.has(p.id)) continue; // remove duplicates within same node
      let newId = String(p.id);
      // If another node already claimed this id, rename to ensure global uniqueness
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

  // Build edges from children relationships
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

  // Deduplicate edges by (source,target) pair regardless of id, and generate deterministic IDs
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
  // Normalize to avoid duplicate upsert conflicts
  const normalized = normalizeGraphForSupabase(graph);
  const client = getSupabaseServiceClient();
  // Upsert nodes
  const nodeRows = (normalized.nodes || []).map((n) => ({
    id: n.id,
    title: n.title,
    prompt: n.prompt || '',
    state: n.state || 'unbuilt',
    position_x: n.position?.x || 0,
    position_y: n.position?.y || 0,
    width: n.width,
    height: n.height,
    built: !!n.built,
    user_id: userId,
  }));
  if (nodeRows.length > 0) {
    const { error } = await client.from('graph_nodes').upsert(nodeRows);
    if (error) throw error;
  }

  // Upsert edges if present on graph (optional)
  const edges: any[] = (normalized as any).edges || [];
  if (Array.isArray(edges) && edges.length > 0) {
    // Dedupe by (user_id, source_id, target_id) to avoid ON CONFLICT multi-hit
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

  // Upsert properties
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
          // Persist complex schemas when present
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
    // Dedupe properties by unique id to avoid multiple hits in single upsert
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

/**
 * Get the current graph
 */
export function getGraphSession(): Graph | null {
  return currentGraph;
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

  // Store in memory (normalized to keep IDs consistent with DB)
  const normalized = normalizeGraphForSupabase(merged);
  currentGraph = normalized;

  // Persist to Supabase (no sockets)
  await saveGraphToSupabase(normalized, userId);
  // Update vars.json used by Vite/Blaxel runtime so UI reflects property value changes
  try {
    await writeVarsJsonToBlaxel(userId, normalized);
  } catch (e) {
    console.warn('Failed to write vars.json after save; UI may lag until next PATCH update', e);
  }
  // Notify connected clients to reload via Realtime broadcast
  await broadcastGraphReload(userId);
}

export async function updatePropertyAndWriteVars(nodeId: string, propertyId: string, value: any, userId: string): Promise<void> {
  // Update in-memory graph if loaded
  if (currentGraph) {
    const idx = currentGraph.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      const node = currentGraph.nodes[idx] as any;
      if (Array.isArray(node.properties)) {
        const pIdx = node.properties.findIndex((p: any) => p.id === propertyId);
        if (pIdx !== -1) {
          node.properties[pIdx] = { ...node.properties[pIdx], value };
        }
      }
    }
  }
  // Persist property value
  await updatePropertyInSupabase(userId, nodeId, propertyId, value);
  // Write only vars.json to Blaxel to avoid full dev env reload
  const graph = currentGraph || { nodes: [] } as Graph;
  await writeVarsJsonToBlaxel(userId, graph);
}

function nodesEqual(a: Graph['nodes'][number], b: Graph['nodes'][number]): boolean {
  // Compare core fields; ignore built flag and children array changes
  if (a.title !== b.title) return false;
  if (a.prompt !== b.prompt) return false;
  // Don't compare children arrays - changes to children shouldn't mark parent as unbuilt

  // Deeply compare properties structure, ignoring value fields and order of options/fields
  const sortOptions = (opts?: string[]) => Array.isArray(opts) ? [...opts].sort() : undefined;

  const normalizeProperty = (p: any): any => {
    const base: any = {
      id: p?.id ?? '',
      title: p?.title ?? '',
      type: p?.type ?? '',
      maxLength: p?.maxLength ?? undefined,
      min: p?.min ?? undefined,
      max: p?.max ?? undefined,
      step: p?.step ?? undefined,
      options: sortOptions(p?.options),
      itemTitle: p?.itemTitle ?? undefined,
      addLabel: p?.addLabel ?? undefined,
    };
    if (Array.isArray(p?.fields)) {
      const byId: Record<string, any> = {};
      for (const child of p.fields) {
        byId[String(child?.id ?? '')] = normalizeProperty(child);
      }
      base.fields = byId;
    }
    if (Array.isArray(p?.itemFields)) {
      const byId: Record<string, any> = {};
      for (const child of p.itemFields) {
        byId[String(child?.id ?? '')] = normalizeProperty(child);
      }
      base.itemFields = byId;
    }
    return base;
  };

  const normalizeProps = (props?: any[]) => {
    if (!Array.isArray(props)) return {} as Record<string, any>;
    const map: Record<string, any> = {};
    for (const p of props) {
      const id = String(p?.id ?? '');
      map[id] = normalizeProperty(p);
    }
    return map;
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
    const graph = await loadGraphFromSupabase(userId);
    currentGraph = graph;
    return graph;
  } catch {
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
  // Persist flags
  const client = getSupabaseServiceClient();
  await client.from('graph_nodes').update({ built: true }).in('id', nodeIds).eq('user_id', userId);
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
  const client = getSupabaseServiceClient();
  await client.from('graph_nodes').update({ built: false }).in('id', nodeIds).eq('user_id', userId);
}

/**
 * Initialize graph from files on startup
 * Note: This function is now deprecated as it requires a userId parameter
 */
export async function initializeGraphsFromFiles(): Promise<void> {
  try {
    console.log('🔄 Initializing graphs from files...');
    console.log('ℹ️ Graph initialization now uses Supabase per-user - skipping global initialization');
  } catch (error) {
    console.error('Error initializing graph from files:', error);
  }
}
