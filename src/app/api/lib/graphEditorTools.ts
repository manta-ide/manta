import { tool } from 'ai';
import { z } from 'zod';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import {
  GraphSchema,
  GraphNodeSchema,
  PropertySchema,
  // Types from your schemas
  Graph,
  GraphNode,
  Property,
} from './schemas';

/* =========
   Local types
   ========= */

// Child link type for backward compatibility (now using edges)
type ChildLink = { id: string; title: string };

// ---- simple async mutex
let graphOp = Promise.resolve();

async function withGraphLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = graphOp;
  let release!: () => void;
  graphOp = new Promise<void>(r => (release = r));
  await prev;             // wait turn
  try { return await fn(); }
  finally { release(); }  // release next
}

/* =========================
   API Fetch/Save (typed)
   ========================= */
let defaultAuthHeaders: Record<string, string> | undefined;
let overrideBaseUrl: string | undefined;
let overrideSaveGraphFn: ((graph: Graph) => Promise<boolean>) | undefined;

export function setGraphEditorAuthHeaders(headers?: Record<string, string>) {
  defaultAuthHeaders = headers;
}

function getBaseUrl(): string {
  const envUrl = overrideBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return envUrl || vercelUrl || 'http://localhost:3000';
}

export function setGraphEditorBaseUrl(url?: string) {
  overrideBaseUrl = url;
}

export function setGraphEditorSaveFn(fn?: (graph: Graph) => Promise<boolean>) {
  overrideSaveGraphFn = fn;
}

async function fetchGraphFromAPI(): Promise<Graph | null> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/graph-api`, {
      method: 'GET',
      headers: { Accept: 'application/xml', ...(defaultAuthHeaders || {}) },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const graph = xmlToGraph(xml);
    const parsed = GraphSchema.safeParse(graph);
    return parsed.success ? normalizeGraph(parsed.data) : normalizeGraph(graph as any);
  } catch (error) {
    console.error('Error fetching graph from API:', error);
    return null;
  }
}

async function saveGraphThroughAPI(graph: Graph): Promise<boolean> {
  try {
    if (overrideSaveGraphFn) {
      return await overrideSaveGraphFn(graph);
    }
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/graph-api`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml', ...(defaultAuthHeaders || {}) },
      body: graphToXml(graph),
    });

    if (!response.ok) {
      throw new Error(`Failed to save graph: ${response.status} ${response.statusText}`);
    }

    // No JSON body required; treat 2xx as success
    return true;
  } catch (error) {
    console.error('Error saving graph through API:', error);
    return false;
  }
}

/* =========================
   In-memory state (typed)
   ========================= */

let pendingGraph: Graph | null = null;
let originalGraph: Graph | null = null;

/* =========================
   Normalization helpers
   ========================= */

function ensureChildrenArray(n: Partial<GraphNode> | undefined, graph?: Graph): ChildLink[] {
  if (!n || !graph?.edges) return [];

  // Get children from edges instead of children property
  return graph.edges
    .filter(edge => edge.source === n.id)
    .map(edge => {
      const childNode = graph.nodes.find(node => node.id === edge.target);
      return childNode ? { id: childNode.id, title: childNode.title } : null;
    })
    .filter((c): c is ChildLink => !!c && typeof c.id === 'string' && typeof c.title === 'string');
}

function normalizeNode(raw: unknown): GraphNode {
  // Trust Zod to coerce here if you want; otherwise do minimal normalization:
  const parsed = GraphNodeSchema.safeParse(raw);
  if (parsed.success) {
    // Return parsed data as-is (children property no longer exists)
    return parsed.data;
  }
  const r = raw as any;
  return {
    id: String(r?.id ?? ''),
    title: String(r?.title ?? ''),
    prompt: typeof r?.prompt === 'string' ? r.prompt : '',
    state: r?.state || "unbuilt",
    properties: Array.isArray(r?.properties) ? (r.properties as GraphNode['properties']) : undefined,
  };
}

function normalizeGraph(raw: unknown): Graph {
  const r = raw as any;
  const nodes = Array.isArray(r?.nodes) ? r.nodes.map(normalizeNode) : [];
  return { nodes };
}

/* =========================
   Positioning helpers
   ========================= */

// Basic layout constants (tweak as needed)
const H_SPACING = 320; // horizontal distance between siblings
const V_SPACING = 220; // vertical distance from parent to child row
const NODE_WIDTH_DEFAULT = 260;
const NODE_HEIGHT_DEFAULT = 160;
const NODE_MARGIN = 40; // extra padding to avoid visual overlaps
const DEFAULT_ROOT_X = 400;
const DEFAULT_ROOT_Y = 100;

function getNodePositionOrDefault(n?: GraphNode): { x: number; y: number } {
  if (!n) return { x: DEFAULT_ROOT_X, y: DEFAULT_ROOT_Y };
  const x = typeof n.position?.x === 'number' ? n.position.x : DEFAULT_ROOT_X;
  const y = typeof n.position?.y === 'number' ? n.position.y : DEFAULT_ROOT_Y;
  return { x, y };
}

function calculatePositionForNewNode(graph: Graph, opts: { newNodeId: string }): { x: number; y: number } {
  const { newNodeId } = opts;

  // Place to the right of existing nodes
  if (graph.nodes.length === 0) {
    return { x: DEFAULT_ROOT_X, y: DEFAULT_ROOT_Y };
  }

  // Use the maximum X among all nodes that have positions
  let maxX = -Infinity;
  let baseY = DEFAULT_ROOT_Y;
  for (const node of graph.nodes) {
    const pos = getNodePositionOrDefault(node);
    if (pos.x > maxX) maxX = pos.x;
    // try to keep the same row as the majority; default to first seen
    baseY = pos.y || baseY;
  }
  if (!isFinite(maxX)) maxX = DEFAULT_ROOT_X;
  return { x: maxX + H_SPACING, y: baseY };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function isOccupied(graph: Graph, candidate: { x: number; y: number }, excludeId?: string): boolean {
  const a = { x: candidate.x - NODE_MARGIN / 2, y: candidate.y - NODE_MARGIN / 2, w: NODE_WIDTH_DEFAULT + NODE_MARGIN, h: NODE_HEIGHT_DEFAULT + NODE_MARGIN };
  for (const n of graph.nodes) {
    if (n.id === excludeId) continue;
    if (!n.position) continue;
    const w = typeof n.width === 'number' ? n.width : NODE_WIDTH_DEFAULT;
    const h = typeof n.height === 'number' ? n.height : NODE_HEIGHT_DEFAULT;
    const b = { x: n.position.x - NODE_MARGIN / 2, y: n.position.y - NODE_MARGIN / 2, w: w + NODE_MARGIN, h: h + NODE_MARGIN };
    if (rectsOverlap(a, b)) return true;
  }
  return false;
}

function findFirstFreeSpot(graph: Graph, desired: { x: number; y: number }, context?: { newNodeId?: string }): { x: number; y: number } {
  // If nothing is occupied, use desired directly
  if (!isOccupied(graph, desired, context?.newNodeId)) return desired;

  // Try stepping to the right until free; if too many tries, go to next row
  let x = desired.x;
  let y = desired.y;
  let tries = 0;
  const MAX_TRIES = 500;
  while (tries < MAX_TRIES) {
    x += H_SPACING;
    if (!isOccupied(graph, { x, y }, context?.newNodeId)) return { x, y };
    tries++;
    // Every 10 collisions, drop to next row and reset to left
    if (tries % 10 === 0) {
      y += V_SPACING;
      x = desired.x; // reset to original x position
      if (!isOccupied(graph, { x, y }, context?.newNodeId)) return { x, y };
    }
  }
  // As last resort, return desired even if occupied
  return desired;
}

/* =========================
   Graph Sync / Consistency
   ========================= */

// Deeply compare property structures ignoring value fields and order
function arePropertyStructuresEqual(a?: GraphNode['properties'], b?: GraphNode['properties']): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;

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
    // Normalize nested fields recursively, ignoring values
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

  const mapA = new Map<string, any>();
  for (const p of arrA) {
    const key = String(p?.id ?? '');
    mapA.set(key, normalizeProperty(p));
  }
  const mapB = new Map<string, any>();
  for (const p of arrB) {
    const key = String(p?.id ?? '');
    mapB.set(key, normalizeProperty(p));
  }

  if (mapA.size !== mapB.size) return false;
  for (const [id, normA] of mapA.entries()) {
    const normB = mapB.get(id);
    if (!normB || JSON.stringify(normA) !== JSON.stringify(normB)) return false;
  }
  return true;
}

function buildIndex(graph: Graph): Map<string, GraphNode> {
  return new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n] as const));
}

/**
 * Keeps forward references (children pointing to not-yet-created nodes),
 * resolves links whenever both ends exist, dedupes, and syncs titles.
 * Single-parent invariant: child's parentId wins.
 */
function ensureGraphConsistency(graph: Graph): Graph {
  if (!Array.isArray(graph.nodes)) graph.nodes = [];
  if (!Array.isArray(graph.edges)) graph.edges = [];

  // In edges-only architecture, we don't need to maintain children arrays
  // All relationships are handled through edges
  return graph;
}

/**
 * When a new node is added, this function is now a no-op since
 * we use edges for relationships instead of children/parentId.
 */
function syncDeferredRelationsForNewNode(newNode: GraphNode, graph: Graph): void {
  // No-op: relationships are now handled by edges
}

/* =========================
   Graph state bootstrap
   ========================= */

export async function setCurrentGraph(graph?: Graph) {
  // If no graph is provided, try to fetch it from the API
  if (!graph) {
    const fetched = await fetchGraphFromAPI();
    graph = fetched ?? { nodes: [] };

    if (!fetched) {
      // Save the empty graph to the API
      const saveSuccess = await saveGraphThroughAPI(graph);
      if (!saveSuccess) throw new Error('Failed to create and save initial graph');
    }
  }

  if (!originalGraph) originalGraph = JSON.parse(JSON.stringify(graph)) as Graph;
  pendingGraph = pendingGraph ?? (JSON.parse(JSON.stringify(graph)) as Graph);
}

/* ---------- Tool Parameter Schemas (STRICT) ---------- */
const ChildLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
}).strict();

// Non-recursive property schema for tool parameters to avoid JSON Schema recursion
const PropertyInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  value: z.any().optional(),
  options: z.array(z.string()).optional().nullable(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  // Avoid recursive references by treating nested schemas as any
  fields: z.any().optional(),
  itemFields: z.any().optional(),
  itemTitle: z.string().optional(),
  addLabel: z.string().optional(),
}).strict();

const AddNodeParamsSchema = z.object({
  nodeId: z.string().describe('Unique ID for the new node'),
  title: z.string().describe('Display title for the new node'),
  prompt: z.string().describe('Description/prompt for the new node'),
  properties: z.array(PropertyInputSchema).optional().describe('Array of property objects'),
  state: z.enum(["built", "unbuilt", "building"]).optional().describe('The build state of the node'),
}).strict();

const DeleteNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to delete'),
  recursive: z.boolean().optional().describe('If true, delete all descendants recursively using edges. If false or not provided, only delete the node itself'),
}).strict();

const EditNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to edit'),
  title: z.string().optional().describe('New title for the node'),
  prompt: z.string().optional().describe('New prompt/description for the node'),
  properties: z.array(PropertyInputSchema).describe('Array of property objects (required to set/delete properties)'),
  state: z.enum(["built", "unbuilt", "building"]).optional().describe('The build state of the node'),
}).strict();

const UpdatePropertiesParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to update properties for'),
  properties: z.array(PropertyInputSchema).describe('Array of property objects to update/add (merges with existing properties)'),
  title: z.string().optional().describe('New title for the node (optional)'),
  prompt: z.string().optional().describe('New prompt/description for the node (optional)'),
}).strict();

const ReadGraphParamsSchema = z.object({
  nodeId: z.string().optional().describe('Specific node ID to read. If not provided, reads the entire graph'),
  recursive: z.boolean().optional().describe('If true and nodeId is provided, includes all descendants recursively using edges. If false or not provided, only returns the specified node'),
  includeProperties: z.boolean().optional().describe('Whether to include node properties in the response. Defaults to true'),
  includeChildren: z.boolean().optional().describe('Whether to include descendant relationships in the response. Defaults to true'),
}).strict();

/* =========================
  Tools (typed)
  ========================= */

// Update a property's value by id. If the id belongs to a nested field under an object/object-list
// property, update the container's value payload rather than the field schema.
function updatePropertyValueById(props: Property[], newProp: Property): boolean {
  const targetId = (newProp as any).id as string;
  for (const p of props) {
    const type = (p as any).type as string | undefined;
    // Direct top-level match
    if (p.id === targetId) {
      (p as any).value = (newProp as any).value;
      return true;
    }

    // Object: if fields contain the target, set it on the object's value map
    if (type === 'object' && Array.isArray((p as any).fields)) {
      const hasField = ((p as any).fields as any[]).some(f => (f?.id as string) === targetId);
      if (hasField) {
        if (!(p as any).value || typeof (p as any).value !== 'object') {
          (p as any).value = {};
        }
        const objVal = (p as any).value as Record<string, any>;
        objVal[targetId] = (newProp as any).value;
        return true;
      }
      // Also handle nested objects within fields schemas by checking their types
      for (const f of (p as any).fields as any[]) {
        if (f?.type === 'object' || f?.type === 'object-list') {
          // Delegate by treating container p as current and recursing into a synthetic props list
          const nestedContainer: Property = {
            id: p.id,
            title: p.title,
            type: p.type as any,
            value: (p as any).value,
            fields: (p as any).fields,
            itemFields: (p as any).itemFields,
          } as any;
          if (updatePropertyValueById([nestedContainer], newProp)) return true;
        }
      }
    }

    // Object-list: update each item's map when schema has the field
    if (type === 'object-list' && Array.isArray((p as any).itemFields)) {
      const hasItemField = ((p as any).itemFields as any[]).some(f => (f?.id as string) === targetId);
      if (hasItemField) {
        if (!Array.isArray((p as any).value)) {
          // If there is no list yet, nothing to update. Do not create items implicitly.
          return true; // Consider handled structurally
        }
        for (const item of ((p as any).value as any[])) {
          if (item && typeof item === 'object') {
            item[targetId] = (newProp as any).value;
          }
        }
        return true;
      }
    }
  }
  return false;
}

export const graphEditorTools = {
  add_node: tool({
    description: 'Add a new node to the graph with specified properties',
    parameters: AddNodeParamsSchema,
    execute: async ({ nodeId, title, prompt, properties = []}) =>  withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        // Deep clone with type
        const modifiedGraph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        const byId = buildIndex(modifiedGraph);
        const existingNode = byId.get(nodeId);

        if (existingNode) {
          // Update existing node metadata
          existingNode.title = title ?? existingNode.title;
          existingNode.prompt = prompt ?? existingNode.prompt;
          if (properties?.length) existingNode.properties = properties;

          ensureGraphConsistency(modifiedGraph);

          const validationResult = GraphSchema.safeParse(modifiedGraph);
          if (!validationResult.success) {
            return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'add_node', nodeId, title } };
          }

          const saveSuccess = await saveGraphThroughAPI(modifiedGraph);
          if (!saveSuccess) {
            return { success: false, message: 'Failed to save graph through API', operation: { type: 'add_node', nodeId, title } };
          }

          pendingGraph = null;
          originalGraph = null;

          return {
            success: true,
            message: `Successfully updated existing node "${existingNode.title}" (${nodeId})`,
            operation: { type: 'add_node', nodeId, title: existingNode.title }
          };
        }

        // Create new node
        const newNode: GraphNode = {
          id: nodeId,
          title,
          prompt,
          state: "unbuilt",
          properties,
        };
        modifiedGraph.nodes.push(newNode);

        // Calculate and set a sensible initial position
        try {
          const desired = calculatePositionForNewNode(modifiedGraph, { newNodeId: newNode.id });
          const pos = findFirstFreeSpot(modifiedGraph, desired, { newNodeId: newNode.id });
          newNode.position = pos;
        } catch (e) {
          // Fallback silently if positioning fails; backend will default to 0,0
        }

        // Validate & save
        const validationResult = GraphSchema.safeParse(modifiedGraph);
        if (!validationResult.success) {
          return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'add_node', nodeId, title } };
        }

        const saveSuccess = await saveGraphThroughAPI(modifiedGraph);
        if (!saveSuccess) {
          return { success: false, message: 'Failed to save graph through API', operation: { type: 'add_node', nodeId, title } };
        }

        pendingGraph = null;
        originalGraph = null;

        return { success: true, message: `Successfully added node "${title}" (${nodeId})`, operation: { type: 'add_node', nodeId, title } };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'add_node', nodeId, title } };
      }
    }),
  }),

  delete_node: tool({
    description: 'Remove a node from the graph and update parent references. Optionally delete all children recursively.',
    parameters: DeleteNodeParamsSchema,
    execute: async ({ nodeId, recursive = false }) => withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        const modifiedGraph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        const nodeToDelete = modifiedGraph.nodes.find((n) => n.id === nodeId);
        if (!nodeToDelete) {
          return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'delete_node', nodeId } };
        }
        if (modifiedGraph.nodes.length > 0 && modifiedGraph.nodes[0].id === nodeId) {
          return { success: false, message: 'Cannot delete the root node (first node)', operation: { type: 'delete_node', nodeId } };
        }

        // Collect descendant IDs using edges
        const collectDescendantIds = (id: string, nodes: GraphNode[], edges: Array<{ source: string; target: string }>): string[] => {
          const descendants: string[] = [];
          const childIds = edges.filter(edge => edge.source === id).map(edge => edge.target);

          childIds.forEach((childId) => {
            descendants.push(childId);
            descendants.push(...collectDescendantIds(childId, nodes, edges));
          });

          return descendants;
        };

        let nodesToDelete = [nodeId];
        if (recursive) {
          const descendantIds = collectDescendantIds(nodeId, modifiedGraph.nodes, modifiedGraph.edges || []);
          nodesToDelete = [...nodesToDelete, ...descendantIds];
        }

        // Remove nodes
        modifiedGraph.nodes = modifiedGraph.nodes.filter((n) => !nodesToDelete.includes(n.id));

        // Remove edges that reference deleted nodes
        if (modifiedGraph.edges) {
          modifiedGraph.edges = modifiedGraph.edges.filter(edge =>
            !nodesToDelete.includes(edge.source) && !nodesToDelete.includes(edge.target)
          );
        }

        ensureGraphConsistency(modifiedGraph);

        const validationResult = GraphSchema.safeParse(modifiedGraph);
        if (!validationResult.success) {
          return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'delete_node', nodeId } };
        }

        const saveSuccess = await saveGraphThroughAPI(modifiedGraph);
        if (!saveSuccess) {
          return { success: false, message: 'Failed to save graph through API', operation: { type: 'delete_node', nodeId } };
        }

        pendingGraph = null;
        originalGraph = null;

        const deletedCount = nodesToDelete.length;
        const message = recursive
          ? `Successfully deleted node "${nodeToDelete.title}" (${nodeId}) and ${deletedCount - 1} descendants recursively`
          : `Successfully deleted node "${nodeToDelete.title}" (${nodeId})`;

        return {
          success: true,
          message,
          operation: { type: 'delete_node', nodeId, deletedTitle: nodeToDelete.title, recursive, deletedCount }
        };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'delete_node', nodeId } };
      }
    }),
  }),

  edit_node: tool({
    description: "Edit an existing node's properties",
    parameters: EditNodeParamsSchema,
    execute: async ({ nodeId, title, prompt, properties }) => withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        const modifiedGraph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        const nodeToEdit = modifiedGraph.nodes.find((n) => n.id === nodeId);
        if (!nodeToEdit) {
          return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'edit_node', nodeId } };
        }

        // Keep originals for change detection
        const originalPrompt = nodeToEdit.prompt;
        const originalProperties = Array.isArray(nodeToEdit.properties) ? [...nodeToEdit.properties] : undefined;

        if (title !== undefined) {
          nodeToEdit.title = title;
        }
        if (prompt !== undefined) nodeToEdit.prompt = prompt;
        if (properties !== undefined) nodeToEdit.properties = properties;

        // Children management is now handled by edges, not direct children property

        ensureGraphConsistency(modifiedGraph);

        const validationResult = GraphSchema.safeParse(modifiedGraph);
        if (!validationResult.success) {
          return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'edit_node', nodeId } };
        }

        // Auto mark node as unbuilt if prompt or properties structure changed (ignore pure value updates)
        const didPromptChange = typeof prompt === 'string' && prompt !== originalPrompt;
        const didPropertyStructureChange = properties === undefined
          ? false
          : !arePropertyStructuresEqual(originalProperties, properties);

        if (didPromptChange || didPropertyStructureChange) {
          nodeToEdit.state = "unbuilt";
        }

        const saveSuccess = await saveGraphThroughAPI(modifiedGraph);
        if (!saveSuccess) {
          return { success: false, message: 'Failed to save graph through API', operation: { type: 'edit_node', nodeId } };
        }

        pendingGraph = null;
        originalGraph = null;

        return { success: true, message: `Successfully edited node "${nodeToEdit.title}" (${nodeId})`, operation: { type: 'edit_node', nodeId, title: nodeToEdit.title } };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'edit_node', nodeId } };
      }
    }),
  }),

  update_properties: tool({
    description: 'Update/add properties of an existing node (merges with existing properties, other fields optional)',
    parameters: UpdatePropertiesParamsSchema,
    execute: async ({ nodeId, properties, title, prompt }) => withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        const modifiedGraph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        const nodeToEdit = modifiedGraph.nodes.find((n) => n.id === nodeId);
        if (!nodeToEdit) {
          return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'update_properties', nodeId } };
        }

        // Keep originals for change detection
        const originalPrompt = nodeToEdit.prompt;
        const originalProperties = Array.isArray(nodeToEdit.properties) ? [...nodeToEdit.properties] : undefined;

        // Merge properties with recursive update of nested fields by ID to avoid structural duplication
        const existingProperties = Array.isArray(nodeToEdit.properties) ? nodeToEdit.properties : [];
        const updatedProperties: Property[] = JSON.parse(JSON.stringify(existingProperties));

        for (const newProp of properties as unknown as Property[]) {
          const updatedNested = updatePropertyValueById(updatedProperties, newProp);
          if (!updatedNested) {
            // Fallback: update or add at top-level if not found nested
            const idx = updatedProperties.findIndex(p => p.id === (newProp as any).id);
            if (idx >= 0) {
              // Only update value to avoid structural changes unless the caller truly changes schema
              if ('value' in (newProp as any)) (updatedProperties[idx] as any).value = (newProp as any).value;
            } else {
              // If no existing property anywhere, add new one at top-level
              updatedProperties.push(newProp as any);
            }
          }
        }

        nodeToEdit.properties = updatedProperties;

        // Update optional fields
        if (title !== undefined) {
          nodeToEdit.title = title;
        }
        if (prompt !== undefined) nodeToEdit.prompt = prompt;
        // Graph editor is not allowed to set nodes to built; building is handled by a separate agent.

        ensureGraphConsistency(modifiedGraph);

        const validationResult = GraphSchema.safeParse(modifiedGraph);
        if (!validationResult.success) {
          return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'update_properties', nodeId } };
        }

        // Auto mark node as unbuilt if prompt or properties structure changed (ignore pure value updates)
        const didPromptChange = typeof prompt === 'string' && prompt !== originalPrompt;
        const didPropertyStructureChange = !arePropertyStructuresEqual(originalProperties, nodeToEdit.properties);

        if (didPromptChange || didPropertyStructureChange) {
          nodeToEdit.state = "unbuilt";
        }

        const saveSuccess = await saveGraphThroughAPI(modifiedGraph);
        if (!saveSuccess) {
          return { success: false, message: 'Failed to save graph through API', operation: { type: 'update_properties', nodeId } };
        }

        pendingGraph = null;
        originalGraph = null;

        return { success: true, message: `Successfully updated properties for node "${nodeToEdit.title}" (${nodeId})`, operation: { type: 'update_properties', nodeId, title: nodeToEdit.title } };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'update_properties', nodeId } };
      }
    }),
  }),

  read_graph: tool({
    description: 'Read the current graph or specific nodes with various options',
    parameters: ReadGraphParamsSchema,
    execute: async ({ nodeId, recursive = false, includeProperties = true, includeChildren = true }) => withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        const graph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        // Helper: collect descendant nodes recursively using edges
        const collectDescendants = (id: string, nodes: GraphNode[], edges: Array<{ source: string; target: string }>): GraphNode[] => {
          const descendants: GraphNode[] = [];
          const childIds = edges.filter(edge => edge.source === id).map(edge => edge.target);

          childIds.forEach((childId) => {
            const childNode = nodes.find((n) => n.id === childId);
            if (childNode) {
              descendants.push(childNode);
              descendants.push(...collectDescendants(childNode.id, nodes, edges));
            }
          });

          return descendants;
        };

        // Helper: filter node data based on options
        const filterNodeData = (node: GraphNode) => {
          const out: Partial<GraphNode> = {
            id: node.id,
            title: node.title,
            prompt: node.prompt,
            state: node.state,
          };
          if (includeProperties) out.properties = node.properties;
          // Note: children are now represented by edges, so we don't include them in the node data
          return out;
        };

        let result: any;

        if (nodeId) {
          const targetNode = graph.nodes.find((n) => n.id === nodeId);
          if (!targetNode) {
            return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'read_graph', nodeId } };
          }

          if (recursive) {
            const descendants = collectDescendants(nodeId, graph.nodes, graph.edges || []);
            result = {
              targetNode: filterNodeData(targetNode),
              descendants: descendants.map(filterNodeData),
            };
          } else {
            result = { targetNode: filterNodeData(targetNode) };
          }
        } else {
          result = { nodes: graph.nodes.map(filterNodeData) };
        }

        return {
          success: true,
          message: 'Successfully read graph data',
          operation: { type: 'read_graph', nodeId, recursive, includeProperties, includeChildren },
          data: result,
        };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'read_graph', nodeId } };
      }
    }),
  }),
};

export function getCurrentGraphState() {
  return { pendingGraph, originalGraph, hasPendingChanges: pendingGraph !== null };
}

export function resetPendingChanges() {
  pendingGraph = null;
  originalGraph = null;
}
