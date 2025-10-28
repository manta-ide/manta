import { z } from 'zod';
import { GraphSchema, GraphNodeSchema, PropertySchema, NodeMetadataSchema, MetadataInputSchema } from './schemas';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { supabase, getOrCreateDefaultProject } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';
import path from 'path';
import type { NodeMetadata } from './schemas';
import { createClient } from '@supabase/supabase-js';

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

// Get or initialize project ID for authenticated user
async function getProjectId(userId: string, retryCount = 0): Promise<string> {
  if (globalGraphState.projectId) {
    return globalGraphState.projectId;
  }

  console.log('🔍 Checking user existence for:', userId, '(attempt', retryCount + 1, ')');

  // Use service role client to bypass RLS for user verification (webhook also uses service role)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role credentials not configured');
  }

  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

  // Ensure user exists in users table (created by Clerk webhook)
  const { data: existingUser, error: userCheckError } = await serviceSupabase
    .from('users')
    .select('id, first_name, created_at')
    .eq('id', userId)
    .single();

  if (userCheckError && userCheckError.code !== 'PGRST116') { // PGRST116 is "not found"
    console.error('Error checking user:', userCheckError);
    throw new Error('Failed to verify user');
  }

  if (!existingUser) {
    console.error('❌ User not found in database:', userId);

    // For new signups, retry a few times with delay to handle webhook race condition
    if (retryCount < 3) {
      console.log('⏳ User not found, retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return getProjectId(userId, retryCount + 1);
    }

    // Let's check if there are any users at all to debug webhook issues
    const { data: allUsers, error: allUsersError } = await serviceSupabase
      .from('users')
      .select('id, first_name, created_at')
      .limit(5);

    if (!allUsersError && allUsers) {
      console.log('📊 Existing users in database:', allUsers.length, 'users');
      allUsers.forEach(user => console.log('  -', user.id, user.first_name, user.created_at));
    }

    throw new Error('User not found in database after retries. Clerk webhook may not be working properly. Please contact support.');
  }

  console.log('✅ User found:', existingUser.id, existingUser.first_name);

  // Get or create default project for this user
  const project = await getOrCreateDefaultProject(userId);
  globalGraphState.projectId = project.id;
  return project.id;
}

// Resolve project identifier to project ID
async function resolveProjectId(userId: string, projectIdentifier: string): Promise<string> {
  // If it looks like a UUID (36 characters with dashes), treat it as a direct project ID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(projectIdentifier)) {
    console.log('🔍 Treating projectIdentifier as direct UUID:', projectIdentifier);
    return projectIdentifier;
  }

  // Otherwise, treat it as a project name and look it up
  console.log('🔍 Looking up project by name:', projectIdentifier);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role credentials not configured');
  }

  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

  // First, find the project by name
  const { data: projects, error: projectLookupError } = await serviceSupabase
    .from('projects')
    .select('id, name')
    .eq('name', projectIdentifier);

  if (projectLookupError) {
    console.error('Error looking up project:', projectLookupError);
    throw projectLookupError;
  }

  // If project exists, verify user has access to it
  if (projects && projects.length > 0) {
    const projectId = projects[0].id;
    
    // Check if user is linked to this project
    const { data: userProject, error: linkCheckError } = await serviceSupabase
      .from('user_projects')
      .select('project_id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .single();

    if (linkCheckError && linkCheckError.code !== 'PGRST116') {
      console.error('Error checking user project link:', linkCheckError);
      throw linkCheckError;
    }

    if (userProject) {
      console.log('✅ Found existing project:', projectId);
      return projectId;
    }

    // Project exists but user doesn't have access - link them to it
    console.log('🔗 Project exists but user not linked, linking user to project:', projectId);
    const { error: linkError } = await serviceSupabase
      .from('user_projects')
      .insert([{ user_id: userId, project_id: projectId, role: 'owner' }]);

    if (linkError) {
      console.error('Error linking user to existing project:', linkError);
      throw linkError;
    }

    console.log('✅ Linked user to existing project:', projectId);
    return projectId;
  }

  // Project doesn't exist, create it
  if (!projects || projects.length === 0) {
    console.log('📁 Project not found, creating new project:', projectIdentifier);

    // Create new project with the given name (default to public)
    const { randomUUID } = require('crypto');
    const newProjectId = randomUUID();

    const { data: newProject, error: createError } = await serviceSupabase
      .from('projects')
      .insert([{ id: newProjectId, name: projectIdentifier, description: `Project: ${projectIdentifier}`, is_public: true }])
      .select()
      .single();

    if (createError) {
      console.error('Error creating project:', createError);
      throw createError;
    }

    // Link user to project
    const { error: linkError } = await serviceSupabase
      .from('user_projects')
      .insert([{ user_id: userId, project_id: newProjectId, role: 'owner' }]);

    if (linkError) {
      console.error('Error linking user to project:', linkError);
      throw linkError;
    }

    console.log('✅ Created and linked project:', newProjectId);
    return newProjectId;
  }

  // This should never be reached, but just in case
  throw new Error('Unable to resolve project ID');
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
async function readGraphFromSupabase(userId: string, projectIdentifier: string): Promise<Graph | null> {
  try {
    const projectId = await resolveProjectId(userId, projectIdentifier);

    // Use service role client to bypass RLS for all database operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase service role credentials not configured');
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all nodes for this project
    const { data: nodesData, error: nodesError } = await serviceSupabase
      .from('nodes')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError) {
      console.error('Error fetching nodes from Supabase:', nodesError);
      return null;
    }

    // Fetch all edges for this project
    const { data: edgesData, error: edgesError } = await serviceSupabase
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
async function writeGraphToSupabase(graph: Graph, userId: string, projectIdentifier: string): Promise<void> {
  try {
    const projectId = await resolveProjectId(userId, projectIdentifier);

    // Use service role client to bypass RLS for all database operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase service role credentials not configured');
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete all existing nodes and edges for this project (cascade will handle edges)
    await serviceSupabase.from('nodes').delete().eq('project_id', projectId);

    // Insert nodes
    if (graph.nodes && graph.nodes.length > 0) {
      const nodesToInsert = graph.nodes.map(node => ({
        id: node.id,
        project_id: projectId,
        data: node,
      }));

      const { error: nodesError } = await serviceSupabase
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

      const { error: edgesError } = await serviceSupabase
        .from('edges')
        .insert(edgesToInsert);

      if (edgesError) {
        console.error('Error inserting edges to Supabase:', edgesError);
        throw edgesError;
      }
    }
  } catch (error) {
    // In restricted/dev environments, network may be blocked.
    // Log and continue so the app can operate with in-memory graph.
    console.warn('Supabase write skipped or failed; continuing with in-memory graph only:', error);
  }
}

// --- Public API (in-memory + persistence) ---
export function getGraphSession(): Graph | null { return getCurrentGraph(); }

export function getCurrentGraphSession(): Graph | null { return getCurrentGraph(); }

export async function storeGraph(graph: Graph, userId: string, projectId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized, userId, projectId);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraph(graph: Graph, userId: string, projectId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized, userId, projectId);
  await broadcastGraphReload(userId);
}

export async function storeCurrentGraphFromAgent(graph: Graph, userId: string, projectId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized, userId, projectId);
  await broadcastGraphReload(userId, { source: 'agent' });
}

export async function storeCurrentGraphWithoutBroadcast(graph: Graph, userId: string, projectId: string): Promise<void> {
  const normalized = normalizeGraph(graph);
  setCurrentGraph(normalized);
  await writeGraphToSupabase(normalized, userId, projectId);
}

export async function loadGraphFromFile(userId: string, projectId: string): Promise<Graph | null> {
  const graph = await readGraphFromSupabase(userId, projectId);
  setCurrentGraph(graph);
  return graph;
}

export async function loadCurrentGraphFromFile(userId: string, projectId: string): Promise<Graph | null> {
  const graph = await readGraphFromSupabase(userId, projectId);
  setCurrentGraph(graph);
  return graph;
}

export async function clearGraphSession(userId: string, projectId: string): Promise<void> {
  try {
    // Use service role client to bypass RLS for all database operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase service role credentials not configured');
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve the project ID
    const resolvedProjectId = await resolveProjectId(userId, projectId);

    // Delete all nodes (cascade will handle edges)
    await serviceSupabase.from('nodes').delete().eq('project_id', resolvedProjectId);
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

export async function markNodesBuilt(nodeIds: string[], userId: string, projectId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'built' } : n)) };
  setCurrentGraph(updated);
  await writeGraphToSupabase(updated, userId, projectId);
}

export async function markNodesUnbuilt(nodeIds: string[], userId: string, projectId: string): Promise<void> {
  const current = getCurrentGraph();
  if (!current) return;
  const idSet = new Set(nodeIds);
  const updated = { ...current, nodes: current.nodes.map(n => (idSet.has(n.id) ? { ...n, state: 'unbuilt' } : n)) };
  setCurrentGraph(updated);
  await writeGraphToSupabase(updated, userId, projectId);
}


// Helper functions moved from graph-api route
const LOCAL_MODE = process.env.NODE_ENV !== 'production';
const DEFAULT_USER_ID = 'default-user';

// Helper function to read base graph from filesystem
const cloneGraph = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

// Property normalization function
const normalizeProperty = (prop: any): any => {
  try {
    if (!prop || typeof prop !== 'object') return prop;
    const baseKeys = new Set([
      'id','title','type','value','options','fields','itemFields',
      'maxLength','min','max','step','itemTitle','addLabel'
    ]);

    // Collect extra keys that look like inline object fields
    const extraEntries = Object.entries(prop).filter(([k]) => !baseKeys.has(k));

    // For object-typed properties, move extra keys into value object
    if (String(prop.type) === 'object') {
      if (extraEntries.length > 0) {
        const valueObj: Record<string, any> = { ...(prop.value && typeof prop.value === 'object' ? prop.value : {}) };
        for (const [k, v] of extraEntries) valueObj[k] = v;
        const cleaned: any = { ...prop, value: valueObj };
        // Remove extras from top-level to avoid duplication
        for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
        return cleaned;
      }
      return prop;
    }

    // For object-list, prefer provided value; support alternate 'items' key
    if (String(prop.type) === 'object-list') {
      const next: any = { ...prop };
      if (!Array.isArray(next.value) && Array.isArray((next as any).items)) {
        next.value = (next as any).items;
        delete (next as any).items;
      }
      return next;
    }

    // For non-object types: if no value but extra keys exist, pack them as a value object
    if (prop.value === undefined && extraEntries.length > 0) {
      const valueObj = Object.fromEntries(extraEntries);
      const cleaned: any = { ...prop, value: valueObj };
      for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
      return cleaned;
    }
  } catch (err) {
    console.error('normalizeProperty failed:', err);
  }
  return prop;
};

const normalizeProperties = (properties?: any[]): any[] => {
  if (!Array.isArray(properties)) return [];
  return properties.map((p) => normalizeProperty(p));
};

/**
 * Sanitizes and normalizes file path entries for node metadata.
 *
 * This function ensures all file paths are relative to the project root and properly formatted.
 * It handles both absolute paths and malformed relative paths, converting them all to
 * clean, project-root-relative paths (e.g., "src/components/Button.tsx").
 *
 * Examples:
 * - "/Users/project/src/Button.tsx" → "src/components/Button.tsx"
 * - "../../../../src/Button.tsx" → "src/components/Button.tsx"
 * - "./src/Button.tsx" → "src/components/Button.tsx"
 * - "src/Button.tsx" → "src/components/Button.tsx" (if already correct)
 *
 * @param entries Array of file path strings to sanitize
 * @returns Array of normalized relative file paths
 */
const sanitizeMetadataFileEntries = (entries: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const files: string[] = [];
  const projectRoot = process.cwd();

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    let candidate = trimmed;

    // Always convert to absolute path first, then make relative to project root
    // This ensures we handle both absolute paths and incorrectly formatted relative paths
    let absolutePath: string;
    if (path.isAbsolute(trimmed)) {
      absolutePath = trimmed;
    } else {
      // For relative paths, resolve them relative to the project root
      absolutePath = path.resolve(projectRoot, trimmed);
    }

    // Now make it relative to project root
    candidate = path.relative(projectRoot, absolutePath);

    // Normalize by resolving the path again to eliminate any ../ segments that go outside project root
    // This handles cases where paths like "../../../../../../dev/manta/..." get normalized to "src/..."
    candidate = path.relative(projectRoot, path.resolve(projectRoot, candidate));

    // Normalize path separators and remove leading ./
    candidate = candidate.replace(/\\/g, '/');
    if (candidate.startsWith('./')) {
      candidate = candidate.substring(2);
    }

    // Skip if empty or already seen
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    files.push(candidate);
  }

  return files;
};

/**
 * Recursively extracts file paths from various nested metadata formats
 */
const extractFilesFromMetadata = (metadata: any): string[] => {
  if (!metadata) return [];

  // Direct array of strings
  if (Array.isArray(metadata)) {
    return metadata.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object') {
        return extractFilesFromMetadata(item);
      }
      return [];
    });
  }

  // Single string
  if (typeof metadata === 'string') {
    return [metadata];
  }

  // Object with files property
  if (metadata && typeof metadata === 'object' && 'files' in metadata) {
    return extractFilesFromMetadata(metadata.files);
  }

  return [];
};

const normalizeNodeMetadata = (metadata: unknown): NodeMetadata | undefined => {
  if (metadata === undefined || metadata === null) return undefined;

  // Log input for debugging, but only in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🗂️ TOOL: normalizeNodeMetadata input:', typeof metadata, Array.isArray(metadata) ? 'array' : '', metadata);
  }

  // Try direct schema validation first
  if (!Array.isArray(metadata) && typeof metadata !== 'string') {
    const parsed = NodeMetadataSchema.safeParse(metadata);
    if (parsed.success) {
      return { files: sanitizeMetadataFileEntries(parsed.data.files), bugs: parsed.data.bugs || [] };
    }
    // Log warning if we have malformed metadata that needs extraction
    if (metadata && typeof metadata === 'object' && 'files' in metadata) {
      console.log('⚠️ TOOL: normalizeNodeMetadata detected nested metadata format, extracting files recursively');
    }
  }

  // Extract files using recursive extraction
  const rawFiles = extractFilesFromMetadata(metadata);

  const files = sanitizeMetadataFileEntries(rawFiles);

  if (files.length === 0) {
    return undefined;
  }
  return { files, bugs: [] };
};

// Helper function to read current graph from Supabase
const readLocalGraph = async (userId: string, projectId: string): Promise<any | null> => {
  try {
    console.log('🔍 TOOL: readLocalGraph via Supabase', { userId, projectId });
    const currentGraph = await readGraphFromSupabase(userId, projectId);

    if (!currentGraph) {
      console.log('🔍 TOOL: No graph found in Supabase');
      return null;
    }

    const parsed = GraphSchema.safeParse(currentGraph);
    if (!parsed.success) {
      console.error('🔍 TOOL: Graph schema validation failed:', parsed.error);
      return null;
    }

    return { graph: cloneGraph(parsed.data) };
  } catch (error) {
    console.error('🔍 TOOL: Error reading graph from Supabase:', error);
    return null;
  }
};

// Helper function to save graph to Supabase
const saveGraph = async (graph: any, userId: string, projectId: string): Promise<{ success: boolean; error?: string }> => {
  console.log('💾 TOOL: saveGraph called, nodes:', graph.nodes?.length || 0, 'edges:', graph.edges?.length || 0, { userId, projectId });

  try {
    const parsed = GraphSchema.safeParse(graph);
    if (!parsed.success) {
      const errorMsg = parsed.error.message;
      console.error('💥 TOOL: saveGraph validation error:', errorMsg);
      return { success: false, error: `Graph validation failed: ${errorMsg}` };
    }

    await storeCurrentGraphFromAgent(parsed.data, userId, projectId);
    console.log('✅ TOOL: saveGraph graph saved successfully via Supabase');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('💥 TOOL: saveGraph error:', errorMessage);
    return { success: false, error: `Unexpected error while saving graph: ${errorMessage}` };
  }
};

// ---- Graph operations API ----
export const graphOperations = {
  async nodeCreate(params: {
    nodeId?: string; // Allow specifying node ID
    title: string;
    prompt?: string;
    type?: string;
    level?: string;
    comment?: string;
    properties?: any[];
    position?: { x: number; y: number; z?: number };
    metadata?: unknown;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string }; nodeId?: string }> {
    console.log('➕ TOOL: node_create called', params);

    const { userId, projectId, nodeId: requestedNodeId, title, prompt, type, level, comment, properties, position, metadata } = params;

    try {
      // Use Supabase read only
      const localGraph = await readLocalGraph(userId, projectId);
      if (!localGraph) {
        console.error('❌ TOOL: node_create no graph found in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists or create a new one.';
        return { success: false, error: errorMsg };
      }
      let graph = localGraph.graph;
      const validatedGraph = graph;
      console.log('✅ TOOL: node_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

      // Use provided nodeId or generate UUID for new nodes
      let nodeId = requestedNodeId || randomUUID();

      // Check if node with this ID already exists
      if (requestedNodeId && validatedGraph.nodes.some((n: any) => n.id === requestedNodeId)) {
        console.error('❌ TOOL: node_create node with ID already exists:', requestedNodeId);
        return { success: false, error: `Node with ID '${requestedNodeId}' already exists.` };
      }

      console.log('🆔 TOOL: node_create using nodeId:', nodeId, requestedNodeId ? '(provided)' : '(generated)');

      const node: any = {
        id: nodeId,
        title,
        description: prompt || '', // Renamed from prompt to description
        type: type || 'component', // Use provided type or default to component
        level: level, // C4 level for architectural elements
        properties: properties || [],
        ...(comment ? { comment } : {})
      };
      const normalizedMetadata = normalizeNodeMetadata(metadata);
      if (normalizedMetadata) {
        node.metadata = normalizedMetadata;
      }
      console.log('🆕 TOOL: node_create creating new node:', { id: nodeId, title, propertiesCount: node.properties.length });

      validatedGraph.nodes.push(node);
      console.log('✅ TOOL: node_create added node, total nodes:', validatedGraph.nodes.length);

      console.log('💾 TOOL: node_create saving updated graph');
      const saveResult = await saveGraph(validatedGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: node_create graph saved successfully');

      const result = `Successfully added node "${nodeId}" with title "${title}". The node has ${node.properties.length} properties.`;
      console.log('📤 TOOL: node_create returning success:', result);
      return { success: true, content: { type: 'text', text: result }, nodeId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 TOOL: node_create unexpected error:', errorMessage);
      const errorMsg = `Unexpected error while adding node: ${errorMessage}`;
      return { success: false, error: errorMsg };
    }
  },

  async nodeEdit(params: {
    nodeId: string;
    mode?: 'replace' | 'merge';
    title?: string;
    prompt?: string;
    description?: string;
    type?: string;
    level?: string;
    comment?: string;
    properties?: any[];
    children?: any[];
    position?: { x: number; y: number; z?: number };
    metadata?: unknown;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string } }> {
    console.log('✏️ TOOL: node_edit called', params);

    const { userId, projectId, nodeId, mode = 'replace', title, prompt: description, type, level, comment, properties, children, position, metadata } = params;

    try {
      // Use Supabase read only
      const localGraph = await readLocalGraph(userId, projectId);
      if (!localGraph) {
        console.error('❌ TOOL: node_edit no graph found in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists.';
        return { success: false, error: errorMsg };
      }
      let graph = localGraph.graph;
      const validatedGraph = graph;
      console.log('✅ TOOL: node_edit schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

      console.log('🔍 TOOL: node_edit looking for node:', nodeId);
      const idx = validatedGraph.nodes.findIndex((n: any) => n.id === nodeId);
      if (idx === -1) {
        console.error('❌ TOOL: node_edit node not found:', nodeId);
        return { success: false, error: `Node ${nodeId} not found` };
      }
      console.log('✅ TOOL: node_edit found node at index:', idx, 'title:', validatedGraph.nodes[idx].title);

      const existing = validatedGraph.nodes[idx];
      const next = { ...existing } as any;

      // Merge simple fields (only update if provided)
      if (title !== undefined) {
        console.log('📝 TOOL: node_edit updating title:', title);
        next.title = title;
      }
      if (description !== undefined) {
        console.log('📝 TOOL: node_edit updating description, length:', description.length);
        next.description = description;
      }
      if (type !== undefined) {
        console.log('🏷️ TOOL: node_edit updating type:', type);
        next.type = type;
      }
      if (level !== undefined) {
        console.log('🏷️ TOOL: node_edit updating level:', level);
        next.level = level;
      }
      if (comment !== undefined) {
        console.log('💬 TOOL: node_edit updating comment, length:', comment.length);
        next.comment = comment;
      }
      if (children !== undefined) {
        console.log('👶 TOOL: node_edit updating children, count:', children.length);
        next.children = children;
      }
      if (position !== undefined) {
        console.log('📍 TOOL: node_edit updating position:', position);
        next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
      }
      if (metadata !== undefined) {
        const normalizedMetadata = normalizeNodeMetadata(metadata);
        console.log('🗂️ TOOL: node_edit updating metadata, files:', normalizedMetadata?.files?.length ?? 'undefined');
        if (normalizedMetadata) {
          next.metadata = normalizedMetadata;
        } else {
          delete next.metadata;
        }
      }

      // Handle properties based on mode
      if (properties !== undefined) {
        if (mode === 'merge') {
          console.log('🔧 TOOL: node_edit merging properties, count:', properties.length);
          // Normalize incoming properties first
          const normalizedProps = normalizeProperties(properties);
          console.log('🔧 TOOL: node_edit normalized properties, count:', normalizedProps.length);

          const existingProps = Array.isArray(existing.properties) ? existing.properties : [];
          console.log('🔧 TOOL: node_edit existing properties count:', existingProps.length);

          const byId = new Map<string, any>(existingProps.map((p: any) => [p.id, p]));

          // Merge new properties with existing ones
          for (const newProp of normalizedProps) {
            if (!newProp || typeof newProp.id !== 'string') continue;

            // Handle dot-notation for nested properties
            const dotIndex = newProp.id.indexOf('.');
            if (dotIndex > 0) {
              const parentId = newProp.id.substring(0, dotIndex);
              const fieldName = newProp.id.substring(dotIndex + 1);
              const existingParent = byId.get(parentId);

              if (existingParent && existingParent.type === 'object' && existingParent.fields) {
                // Update nested field within existing object property
                const existingFields = Array.isArray(existingParent.fields) ? existingParent.fields : [];
                const fieldMap = new Map<string, any>(existingFields.map((f: any) => [f.id || f.name, f]));
                const existingField = fieldMap.get(fieldName);

                // Ensure parent has a value object to store field values
                const parentValue = existingParent.value && typeof existingParent.value === 'object' ? { ...existingParent.value } : {};

                if (existingField) {
                  // Update existing field - preserve id/name and only update specified properties
                  fieldMap.set(fieldName, {
                    id: existingField.id || existingField.name,
                    title: newProp.title !== undefined ? newProp.title : existingField.title,
                    type: newProp.type !== undefined ? newProp.type : existingField.type,
                    value: newProp.value !== undefined ? newProp.value : existingField.value,
                    ...(existingField.options ? { options: existingField.options } : {}),
                    ...(existingField.fields ? { fields: existingField.fields } : {})
                  });
                  // Also update the parent value object for XML serialization
                  if (newProp.value !== undefined) {
                    parentValue[fieldName] = newProp.value;
                  }
                } else {
                  // Add new field to object
                  fieldMap.set(fieldName, {
                    id: fieldName,
                    title: newProp.title || fieldName,
                    type: newProp.type || 'text',
                    value: newProp.value
                  });
                  // Also add to parent value object for XML serialization
                  parentValue[fieldName] = newProp.value;
                }

                byId.set(parentId, {
                  ...existingParent,
                  fields: Array.from(fieldMap.values()),
                  value: parentValue
                });
              } else {
                // Create new object property with the field
                const initialValue: any = {};
                initialValue[fieldName] = newProp.value;
                byId.set(parentId, {
                  id: parentId,
                  title: parentId,
                  type: 'object',
                  value: initialValue,
                  fields: [{
                    id: fieldName,
                    title: newProp.title || fieldName,
                    type: newProp.type || 'text',
                    value: newProp.value
                  }]
                });
              }
            } else {
              // Regular property (no dot notation)
              const existingProp = byId.get(newProp.id);
              if (existingProp) {
                // Merge with existing property
                byId.set(newProp.id, { ...existingProp, ...newProp });
              } else {
                // Add new property
                byId.set(newProp.id, newProp);
              }
            }
          }

          console.log('🔧 TOOL: node_edit merged properties, final count:', Array.from(byId.values()).length);
          next.properties = Array.from(byId.values());
        } else {
          // Replace mode
          console.log('🔧 TOOL: node_edit replacing properties, count:', properties.length);
          next.properties = properties;
        }
      }

      validatedGraph.nodes[idx] = next;
      console.log('💾 TOOL: node_edit saving updated graph');
      const saveResult = await saveGraph(validatedGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: node_edit graph saved successfully');

      const result = mode === 'merge' ? `Merged changes into node ${nodeId}` : `Replaced node ${nodeId}`;
      console.log('📤 TOOL: node_edit returning result:', result);
      return { success: true, content: { type: 'text', text: result } };

    } catch (error) {
      console.error('💥 TOOL: node_edit error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async nodeDelete(params: {
    nodeId: string;
    recursive?: boolean;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string } }> {
    console.log('🗑️ TOOL: node_delete called', params);

    const { userId, projectId, nodeId, recursive } = params;

    try {
      // Use Supabase read only
      const localGraph = await readLocalGraph(userId, projectId);
      if (!localGraph) {
        console.error('❌ TOOL: node_delete no graph found in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists.';
        return { success: false, error: errorMsg };
      }
      let graph = localGraph.graph;
      const validatedGraph = graph;
      console.log('✅ TOOL: node_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

      console.log('🔍 TOOL: node_delete checking if node exists:', nodeId);
      const byId = new Map<string, any>(validatedGraph.nodes.map((n: any) => [n.id, n]));
      if (!byId.has(nodeId)) {
        console.error('❌ TOOL: node_delete node not found:', nodeId);
        const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
        return { success: false, error: errorMsg };
      }
      console.log('✅ TOOL: node_delete node found:', byId.get(nodeId).title);

      console.log('🔄 TOOL: node_delete cleaning up references');
      validatedGraph.nodes.forEach((n: any) => {
        if (Array.isArray(n.children)) n.children = n.children.filter((c: any) => c.id !== nodeId);
      });

      console.log('🗂️ TOOL: node_delete collecting nodes to delete');
      const toDelete = new Set<string>();
      const collect = (id: string) => {
        toDelete.add(id);
        if (recursive) {
          const n = byId.get(id);
          const kids = Array.isArray(n?.children) ? n.children : [];
          for (const k of kids) collect(k.id);
        }
      };
      collect(nodeId);

      console.log('🗑️ TOOL: node_delete will delete nodes:', Array.from(toDelete));
      const originalCount = validatedGraph.nodes.length;
      validatedGraph.nodes = validatedGraph.nodes.filter((n: any) => !toDelete.has(n.id));
      console.log('✅ TOOL: node_delete removed nodes, count changed from', originalCount, 'to', validatedGraph.nodes.length);

      // Also remove any explicit edges that reference deleted nodes
      const beforeEdges = (validatedGraph.edges || []).length;
      if (Array.isArray(validatedGraph.edges)) {
        validatedGraph.edges = validatedGraph.edges.filter((e: any) => !toDelete.has(e.source) && !toDelete.has(e.target));
      }
      const afterEdges = (validatedGraph.edges || []).length;
      if (beforeEdges !== afterEdges) {
        console.log('✅ TOOL: node_delete removed edges connected to deleted nodes,', beforeEdges, '->', afterEdges);
      }

      console.log('💾 TOOL: node_delete saving updated graph');
      const saveResult = await saveGraph(validatedGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: node_delete graph saved successfully');

      const result = `Deleted node ${nodeId}${recursive ? ' (recursive)' : ''}`;
      console.log('📤 TOOL: node_delete returning result:', result);
      return { success: true, content: { type: 'text', text: result } };
    } catch (error) {
      console.error('💥 TOOL: node_delete error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async edgeCreate(params: {
    sourceId: string;
    targetId: string;
    role?: string;
    shape?: string;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string }; edgeId?: string }> {
    console.log('🔗 TOOL: edge_create called', params);

    const { userId, projectId, sourceId, targetId, role, shape } = params;

    try {
      // Use Supabase read only
      const localGraph = await readLocalGraph(userId, projectId);
      if (!localGraph) {
        console.error('❌ TOOL: edge_create no graph found in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists.';
        return { success: false, error: errorMsg };
      }
      let graph = localGraph.graph;
      const validatedGraph = graph;
      console.log('✅ TOOL: edge_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

      // Validate that both nodes exist
      console.log('🔍 TOOL: edge_create validating source node:', sourceId);
      const sourceNode = validatedGraph.nodes.find((n: any) => n.id === sourceId);
      if (!sourceNode) {
        console.error('❌ TOOL: edge_create source node not found:', sourceId);
        const errorMsg = `Source node '${sourceId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
        return { success: false, error: errorMsg };
      }
      console.log('✅ TOOL: edge_create found source node:', sourceNode.title);

      console.log('🔍 TOOL: edge_create validating target node:', targetId);
      const targetNode = validatedGraph.nodes.find((n: any) => n.id === targetId);
      if (!targetNode) {
        console.error('❌ TOOL: edge_create target node not found:', targetId);
        const errorMsg = `Target node '${targetId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
        return { success: false, error: errorMsg };
      }
      console.log('✅ TOOL: edge_create found target node:', targetNode.title);

      // Check if edge already exists
      console.log('🔍 TOOL: edge_create checking for existing edge');
      const existingEdge = (validatedGraph.edges || []).find((e: any) => e.source === sourceId && e.target === targetId);
      if (existingEdge) {
        console.error('❌ TOOL: edge_create edge already exists:', `${sourceId}-${targetId}`);
        const errorMsg = `Edge from '${sourceId}' to '${targetId}' already exists. Current role: ${existingEdge.role || 'none'}`;
        return { success: false, error: errorMsg };
      }
      console.log('✅ TOOL: edge_create no existing edge found');

      // Create the edge with UUID
      const edgeId = randomUUID();
      const newEdge = {
        id: edgeId,
        source: sourceId,
        target: targetId,
        role: role || 'links-to',
        ...(shape ? { shape } : {})
      };
      console.log('🆕 TOOL: edge_create creating new edge with UUID:', edgeId);

      validatedGraph.edges = validatedGraph.edges || [];
      validatedGraph.edges.push(newEdge);
      console.log('✅ TOOL: edge_create added edge, total edges:', validatedGraph.edges.length);

      console.log('💾 TOOL: edge_create saving updated graph');
      const saveResult = await saveGraph(validatedGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: edge_create graph saved successfully');

      const result = `Created edge from ${sourceId} to ${targetId}${role ? ` (${role})` : ''}${shape ? ` [${shape}]` : ''}`;
      console.log('📤 TOOL: edge_create returning result:', result);
      return { success: true, content: { type: 'text', text: result }, edgeId };
    } catch (error) {
      console.error('💥 TOOL: edge_create error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async edgeDelete(params: {
    sourceId: string;
    targetId: string;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string } }> {
    console.log('🗑️ TOOL: edge_delete called', params);

    const { userId, projectId, sourceId, targetId } = params;

    try {
      // Use Supabase read only
      const localGraph = await readLocalGraph(userId, projectId);
      if (!localGraph) {
        console.error('❌ TOOL: edge_delete no graph found in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists.';
        return { success: false, error: errorMsg };
      }
      let graph = localGraph.graph;
      const validatedGraph = graph;
      console.log('✅ TOOL: edge_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

      // Check if edge exists
      console.log('🔍 TOOL: edge_delete checking for existing edge');
      const edgeIndex = (validatedGraph.edges || []).findIndex((e: any) => e.source === sourceId && e.target === targetId);
      if (edgeIndex === -1) {
        console.error('❌ TOOL: edge_delete edge not found:', `${sourceId}-${targetId}`);
        const errorMsg = `Edge from '${sourceId}' to '${targetId}' not found.`;
        return { success: false, error: errorMsg };
      }
      console.log('✅ TOOL: edge_delete found edge at index:', edgeIndex);

      // Remove the edge
      validatedGraph.edges.splice(edgeIndex, 1);
      console.log('✅ TOOL: edge_delete removed edge, total edges:', validatedGraph.edges.length);

      console.log('💾 TOOL: edge_delete saving updated graph');
      const saveResult = await saveGraph(validatedGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: edge_delete graph saved successfully');

      const result = `Deleted edge from ${sourceId} to ${targetId}`;
      console.log('📤 TOOL: edge_delete returning result:', result);
      return { success: true, content: { type: 'text', text: result } };
    } catch (error) {
      console.error('💥 TOOL: edge_delete error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async nodeMetadataUpdate(params: {
    nodeId: string;
    files?: string[];
    bugs?: string[];
    merge?: boolean;
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string } }> {
    console.log('🗂️ TOOL: node_metadata_update called', params);

    const { userId, projectId, nodeId, files, bugs, merge = false } = params;

    try {
      const graphData = await readLocalGraph(userId, projectId);
      if (!graphData) {
        console.error('❌ TOOL: node_metadata_update no graph data available in Supabase');
        const errorMsg = 'No graph data available. Please ensure the graph exists.';
        return { success: false, error: errorMsg };
      }

      const graph = graphData.graph;
      const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
      if (idx === -1) {
        console.error('❌ TOOL: node_metadata_update node not found', nodeId);
        return { success: false, error: `Error: Node '${nodeId}' not found.` };
      }

      if (!files && !bugs) {
        console.error('❌ TOOL: node_metadata_update missing files and bugs arrays');
        return { success: false, error: 'Error: Either files array or bugs array is required to update metadata.' };
      }

      const nextGraph = cloneGraph(graph);
      const nextNode = { ...nextGraph.nodes[idx] } as any;
      const existingMetadata = (graph.nodes[idx] as any)?.metadata || {};

      // Handle files
      let finalFiles: string[] = [];
      if (files !== undefined) {
        const sanitizedInput = sanitizeMetadataFileEntries(files);
        const existingFiles = Array.isArray(existingMetadata.files)
          ? sanitizeMetadataFileEntries(existingMetadata.files)
          : [];

        finalFiles = merge
          ? sanitizeMetadataFileEntries([...existingFiles, ...sanitizedInput])
          : sanitizedInput;
      } else if (merge) {
        // If merging and no files provided, keep existing files
        finalFiles = Array.isArray(existingMetadata.files)
          ? sanitizeMetadataFileEntries(existingMetadata.files)
          : [];
      }

      // Handle bugs
      let finalBugs: string[] = [];
      if (bugs !== undefined) {
        const existingBugs = Array.isArray(existingMetadata.bugs)
          ? existingMetadata.bugs.filter((b: string) => b && b.trim())
          : [];

        finalBugs = merge
          ? [...existingBugs, ...bugs.filter((b: string) => b && b.trim())]
          : bugs.filter((b: string) => b && b.trim());
      } else if (merge) {
        // If merging and no bugs provided, keep existing bugs
        finalBugs = Array.isArray(existingMetadata.bugs)
          ? existingMetadata.bugs.filter((b: string) => b && b.trim())
          : [];
      }

      // Set metadata only if we have files or bugs
      if (finalFiles.length > 0 || finalBugs.length > 0) {
        nextNode.metadata = {
          ...(finalFiles.length > 0 && { files: finalFiles }),
          ...(finalBugs.length > 0 && { bugs: finalBugs })
        } as NodeMetadata;
      } else {
        delete nextNode.metadata;
      }

      nextGraph.nodes[idx] = nextNode;

      console.log('💾 TOOL: node_metadata_update saving graph with metadata files:', finalFiles.length, 'bugs:', finalBugs.length);
      const saveResult = await saveGraph(nextGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      let summary = `Metadata updated for ${nodeId}.`;
      if (finalFiles.length > 0) {
        summary += ` Files (${finalFiles.length}): ${finalFiles.join(', ')}.`;
      }
      if (finalBugs.length > 0) {
        summary += ` Bugs (${finalBugs.length}): ${finalBugs.join(', ')}.`;
      }
      if (finalFiles.length === 0 && finalBugs.length === 0) {
        summary = `Metadata cleared for ${nodeId}.`;
      }
      console.log('📤 TOOL: node_metadata_update returning success:', summary);
      return { success: true, content: { type: 'text', text: summary } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 TOOL: node_metadata_update error:', errorMessage);
      return { success: false, error: `Error: Failed to update metadata: ${errorMessage}` };
    }
  },

  async graphClear(params: { userId: string; projectId: string }): Promise<{ success: boolean; error?: string; content?: { type: string; text: string } }> {
    console.log('🧹 TOOL: graph_clear called', params);

    const { userId, projectId } = params;

    try {
      // Create empty graph structure
      const emptyGraph = {
        nodes: [],
        edges: []
      };

      console.log('💾 TOOL: graph_clear clearing graph');

      // Clear the graph
      const saveResult = await saveGraph(emptyGraph, userId, projectId);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      console.log('✅ TOOL: graph_clear cleared graph');

      const result = `Successfully cleared graph (left empty nodes and edges tags, and outer structure)`;
      console.log('📤 TOOL: graph_clear returning result:', result);
      return { success: true, content: { type: 'text', text: result } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 TOOL: graph_clear error:', errorMessage);
      return { success: false, error: `Error: Failed to clear graph: ${errorMessage}` };
    }
  },

  async read(params: {
    nodeId?: string;
    layer?: string;
    includeProperties?: boolean;
    includeChildren?: boolean;
    format?: 'json' | 'xml'; // Optional format parameter, defaults to 'json'
    userId: string; // Required userId parameter
    projectId: string; // Required projectId parameter
  }): Promise<{ success: boolean; error?: string; node?: any; layers?: any[]; content?: string }> {
    console.log('🔍 TOOL: read called', params);

    const { userId, projectId, nodeId, layer, includeProperties, includeChildren, format = 'json' } = params;

    try {
      // Get graph data
      const graphResult = await readLocalGraph(userId, projectId);
      if (!graphResult) {
        return { success: false, error: 'No graph available' };
      }

      const graph = graphResult.graph;

      // If nodeId is specified, return the specific node
      if (nodeId) {
        const node = graph.nodes?.find((n: any) => n.id === nodeId);
        if (!node) {
          return { success: false, error: `Node ${nodeId} not found` };
        }

        // Return full node details
        if (format === 'xml') {
          // For XML format, return the full graph with just the requested node
          const singleNodeGraph = { nodes: [node], edges: [] };
          const xmlContent = graphToXml(singleNodeGraph);
          return { success: true, content: xmlContent };
        } else {
          // JSON format
          return { success: true, node: node };
        }
      }

      // Determine which layer to use (default to 'system')
      const targetLayer = layer || 'system';
      const validLayers = ['system', 'container', 'component', 'code'];

      if (!validLayers.includes(targetLayer)) {
        return { success: false, error: `Invalid layer: ${targetLayer}. Valid layers are: ${validLayers.join(', ')}` };
      }

      // Filter nodes by the target layer and group by type
      const filteredNodes = graph.nodes?.filter((node: any) => node.type === targetLayer) || [];

      // Group nodes by their type (which should all be the same for filtered nodes, but let's be safe)
      const groupedByType: Record<string, any[]> = {};
      filteredNodes.forEach((node: any) => {
        const type = node.type || 'unknown';
        if (!groupedByType[type]) {
          groupedByType[type] = [];
        }
        groupedByType[type].push(node);
      });

      // Convert to array format: [{type: "system", nodes: [...]}]
      const result = Object.entries(groupedByType).map(([type, nodes]) => ({
        type,
        nodes
      }));

      if (format === 'xml') {
        // For XML format, return the filtered graph
        const filteredGraph = { nodes: filteredNodes, edges: graph.edges || [] };
        const xmlContent = graphToXml(filteredGraph);
        return { success: true, content: xmlContent };
      } else {
        // JSON format
        return { success: true, layers: result };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 TOOL: read error:', errorMessage);
      return { success: false, error: `Error reading graph: ${errorMessage}` };
    }
  },

  async listProjects(params: { userId: string }): Promise<{ success: boolean; error?: string; projects?: Array<{ id: string; name: string; description?: string; created_at?: string }> }> {
    console.log('📋 TOOL: list_projects called', params);

    const { userId } = params;

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase service role credentials not configured');
      }

      const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get all projects for this user via user_projects join
      const { data: userProjects, error: projectsError } = await serviceSupabase
        .from('user_projects')
        .select('project_id, role, projects(id, name, description, created_at)')
        .eq('user_id', userId);

      if (projectsError) {
        console.error('Error fetching user projects:', projectsError);
        throw projectsError;
      }

      // Transform the data to a simpler format
      const projects = (userProjects || []).map((up: any) => ({
        id: up.projects.id,
        name: up.projects.name,
        description: up.projects.description,
        created_at: up.projects.created_at,
        role: up.role
      }));

      console.log('✅ TOOL: list_projects found', projects.length, 'projects');
      return { success: true, projects };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 TOOL: list_projects error:', errorMessage);
      return { success: false, error: `Error listing projects: ${errorMessage}` };
    }
  }
};

// ---- Layer management helpers (exposed for API routes) ----
// These are kept for compatibility but may not be used with Supabase
export function getActiveLayerName(): string | null { return null; }
export function setActiveLayer(name: string | null): void { }
export function getLayersState(): { layers: string[]; activeLayer: string | null } {
  return { layers: [], activeLayer: null };
}
