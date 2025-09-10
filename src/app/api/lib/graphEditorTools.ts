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

// Derive the child link type from your GraphNode
type ChildLink = GraphNode['children'][number];

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

function ensureChildrenArray(n: Partial<GraphNode> | undefined): ChildLink[] {
  if (!n || !Array.isArray(n.children)) return [];
  return n.children.filter((c): c is ChildLink => !!c && typeof c.id === 'string' && typeof c.title === 'string');
}

function normalizeNode(raw: unknown): GraphNode {
  // Trust Zod to coerce here if you want; otherwise do minimal normalization:
  const parsed = GraphNodeSchema.safeParse(raw);
  if (parsed.success) {
    // Ensure children exists as array (schema already guarantees), just return
    return { ...parsed.data, children: [...parsed.data.children] };
  }
  const r = raw as any;
  return {
    id: String(r?.id ?? ''),
    title: String(r?.title ?? ''),
    prompt: typeof r?.prompt === 'string' ? r.prompt : '',
    children: ensureChildrenArray(r),
    parentId: typeof r?.parentId === 'string' ? r.parentId : undefined,
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

function calculatePositionForNewNode(graph: Graph, opts: { parentId?: string; newNodeId: string }): { x: number; y: number } {
  const { parentId, newNodeId } = opts;

  // If we have a parent, place the new node below it and to the right of existing siblings
  if (parentId) {
    const parent = graph.nodes.find(n => n.id === parentId);
    const parentPos = getNodePositionOrDefault(parent);
    // Count existing siblings (exclude the new node if already inserted)
    const siblings = graph.nodes.filter(n => n.parentId === parentId && n.id !== newNodeId);
    const index = siblings.length; // place after last sibling

    // Optionally center siblings around parent: startX = parentX - (index * H_SPACING)/2
    // Simpler: place to the right of parent by index * spacing
    const x = parentPos.x - Math.floor(Math.max(index - 1, 0) * H_SPACING / 2) + index * H_SPACING;
    const y = parentPos.y + V_SPACING;
    return { x, y };
  }

  // No parent: place to the right of existing top-level nodes
  const roots = graph.nodes.filter(n => !n.parentId);
  if (roots.length === 0) {
    return { x: DEFAULT_ROOT_X, y: DEFAULT_ROOT_Y };
  }
  // Use the maximum X among root nodes that have positions
  let maxX = -Infinity;
  let baseY = DEFAULT_ROOT_Y;
  for (const r of roots) {
    const pos = getNodePositionOrDefault(r);
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

function findFirstFreeSpot(graph: Graph, desired: { x: number; y: number }, context?: { parentId?: string; newNodeId?: string }): { x: number; y: number } {
  // If nothing is occupied, use desired directly
  if (!isOccupied(graph, desired, context?.newNodeId)) return desired;

  // Try stepping to the right until free; if too many tries, go to next row
  const parent = context?.parentId ? graph.nodes.find(n => n.id === context.parentId) : undefined;
  const parentPos = getNodePositionOrDefault(parent);
  let x = desired.x;
  let y = desired.y;
  let tries = 0;
  const MAX_TRIES = 500;
  while (tries < MAX_TRIES) {
    x += H_SPACING;
    if (!isOccupied(graph, { x, y }, context?.newNodeId)) return { x, y };
    tries++;
    // Every 10 collisions, drop to next row and reset near parent X
    if (tries % 10 === 0) {
      y += V_SPACING;
      x = parent ? parentPos.x : (x - 10 * H_SPACING); // reset towards parent or earlier column
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

  const byId = buildIndex(graph);

  // Normalize children arrays
  graph.nodes.forEach((n) => {
    n.children = ensureChildrenArray(n);
  });

  // Pass 1: parent -> child sync (do NOT remove unknown children)
  graph.nodes.forEach((parent) => {
    const next: ChildLink[] = [];
    const seen = new Set<string>();

    parent.children.forEach((childRef) => {
      if (!childRef?.id) return;
      if (seen.has(childRef.id)) return;
      seen.add(childRef.id);

      const childNode = byId.get(childRef.id);

      if (childNode) {
        // keep ref title in sync with real child title
        if (childNode.title && childRef.title !== childNode.title) {
          childRef.title = childNode.title;
        }

        // If the child has no parent, adopt this parent
        if (!childNode.parentId) {
          childNode.parentId = parent.id;
          next.push(childRef);
        } else if (childNode.parentId === parent.id) {
          // Already consistent
          next.push(childRef);
        } else {
          // Conflict: child's parentId points elsewhere. Prefer child's parentId → drop stray ref.
        }
      } else {
        // Child not created yet — keep the placeholder reference
        next.push(childRef);
      }
    });

    parent.children = next;
  });

  // Pass 2: child -> parent sync (for any child with parentId, ensure parent contains the ref)
  graph.nodes.forEach((child) => {
    if (!child.parentId) return;
    const parent = byId.get(child.parentId);
    if (!parent) return; // parent not created yet

    const hasRef = parent.children.some((c) => c.id === child.id);
    if (!hasRef) {
      parent.children.push({ id: child.id, title: child.title });
    }
  });

  // Pass 3: global dedupe of children arrays
  graph.nodes.forEach((n) => {
    const seen = new Set<string>();
    n.children = n.children.filter((c) => {
      if (!c?.id) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  });

  return graph;
}

/**
 * When a new node is added, this:
 *  - adopts a parent if some existing node already lists it as a child (and it has no parent yet)
 *  - removes stray refs to this child from other parents (enforce single parent)
 *  - sets parentId for any existing children of this new node
 */
function syncDeferredRelationsForNewNode(newNode: GraphNode, graph: Graph): void {
  const byId = buildIndex(graph);

  // 1) If any parent already references this node, adopt the first as parent if not set
  if (!newNode.parentId) {
    const candidate = graph.nodes.find(
      (p) => p.children.some((c) => c.id === newNode.id)
    );
    if (candidate) {
      newNode.parentId = candidate.id;
    }
  }

  // 2) Enforce single parent: remove this child from other parents
  graph.nodes.forEach((p) => {
    if (p.id !== newNode.parentId) {
      p.children = p.children.filter((c) => c.id !== newNode.id);
    }
  });

  // 3) If the new node already lists children, set their parentId (when they exist)
  newNode.children.forEach((c) => {
    const cn = byId.get(c.id);
    if (cn && !cn.parentId) {
      cn.parentId = newNode.id;
    }
  });
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
  parentId: z.string().describe('ID of the parent node to add the new node as a child'),
  nodeId: z.string().describe('Unique ID for the new node'),
  title: z.string().describe('Display title for the new node'),
  prompt: z.string().describe('Description/prompt for the new node'),
  properties: z.array(PropertyInputSchema).optional().describe('Array of property objects'),
  children: z.array(ChildLinkSchema).optional().describe('Array of child node references'),
  state: z.enum(["built", "unbuilt", "building"]).optional().describe('The build state of the node'),
}).strict();

const DeleteNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to delete'),
  recursive: z.boolean().optional().describe('If true, delete all children and descendants recursively. If false or not provided, only delete the node itself'),
}).strict();

const EditNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to edit'),
  title: z.string().optional().describe('New title for the node'),
  prompt: z.string().optional().describe('New prompt/description for the node'),
  properties: z.array(PropertyInputSchema).describe('Array of property objects (required to set/delete properties)'),
  children: z.array(ChildLinkSchema).optional(),
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
  recursive: z.boolean().optional().describe('If true and nodeId is provided, includes all descendants recursively. If false or not provided, only returns the specified node'),
  includeProperties: z.boolean().optional().describe('Whether to include node properties in the response. Defaults to true'),
  includeChildren: z.boolean().optional().describe('Whether to include child references in the response. Defaults to true'),
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
    execute: async ({ parentId, nodeId, title, prompt, properties = [], children = []}) =>  withGraphLock(async () => {
      try {
        if (!pendingGraph) await setCurrentGraph();

        // Deep clone with type
        const modifiedGraph: Graph = JSON.parse(JSON.stringify(pendingGraph)) as Graph;

        const byId = buildIndex(modifiedGraph);
        const parentNode = byId.get(parentId);
        const existingNode = byId.get(nodeId);

        if (existingNode) {
          // Update existing node metadata
          existingNode.title = title ?? existingNode.title;
          existingNode.prompt = prompt ?? existingNode.prompt;
          if (properties?.length) existingNode.properties = properties;
          if (children?.length) {
            const merged = [...existingNode.children, ...children];
            const seen = new Set<string>();
            existingNode.children = merged.filter((c) => {
              if (!c?.id) return false;
              if (seen.has(c.id)) return false;
              seen.add(c.id);
              return true;
            });
          }

          if (parentId) existingNode.parentId = parentId;

          if (parentNode) {
            const childExists = parentNode.children.some((c) => c.id === nodeId);
            if (!childExists) parentNode.children.push({ id: nodeId, title: existingNode.title });
          }

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

          const parentInfo = parentNode
            ? ` and synced as child of "${parentNode.title}"`
            : ' (parent not found yet; will link automatically when created)';
          return {
            success: true,
            message: `Successfully updated existing node "${existingNode.title}" (${nodeId})${parentInfo}`,
            operation: { type: 'add_node', nodeId, title: existingNode.title, parentId, synced: !!parentNode }
          };
        }

        // Create new node
        const newNode: GraphNode = {
          id: nodeId,
          title,
          prompt,
          children: children ?? [],
          parentId: parentId || undefined,
          state: "unbuilt",
          properties,
        };
        modifiedGraph.nodes.push(newNode);

        if (parentNode) {
          const childExists = parentNode.children.some((c) => c.id === nodeId);
          if (!childExists) parentNode.children.push({ id: nodeId, title });
        }

        // Snap this node into any already-declared relationships
        syncDeferredRelationsForNewNode(newNode, modifiedGraph);

        // Calculate and set a sensible initial position based on parent/siblings
        try {
          const finalParentId = newNode.parentId || parentId;
          const desired = calculatePositionForNewNode(modifiedGraph, { parentId: finalParentId, newNodeId: newNode.id });
          const pos = findFirstFreeSpot(modifiedGraph, desired, { parentId: finalParentId, newNodeId: newNode.id });
          newNode.position = pos;
        } catch (e) {
          // Fallback silently if positioning fails; backend will default to 0,0
        }

        // Ensure consistency
        ensureGraphConsistency(modifiedGraph);

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

        const parentInfo = parentNode ? ` as child of "${parentNode.title}"` : ' (parent not found, will be linked when parent is created)';
        return { success: true, message: `Successfully added node "${title}" (${nodeId})${parentInfo}`, operation: { type: 'add_node', nodeId, title, parentId } };
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

        // Collect descendant IDs
        const collectDescendantIds = (id: string, nodes: GraphNode[]): string[] => {
          const descendants: string[] = [];
          const node = nodes.find((n) => n.id === id);
          if (node) {
            node.children.forEach((child) => {
              descendants.push(child.id);
              descendants.push(...collectDescendantIds(child.id, nodes));
            });
          }
          return descendants;
        };

        let nodesToDelete = [nodeId];
        if (recursive) {
          const descendantIds = collectDescendantIds(nodeId, modifiedGraph.nodes);
          nodesToDelete = [...nodesToDelete, ...descendantIds];
        }

        // Remove nodes
        modifiedGraph.nodes = modifiedGraph.nodes.filter((n) => !nodesToDelete.includes(n.id));

        // Remove references
        modifiedGraph.nodes.forEach((n) => {
          n.children = n.children.filter((c) => !nodesToDelete.includes(c.id));
          if (n.parentId && nodesToDelete.includes(n.parentId)) {
            n.parentId = undefined;
          }
        });

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
    execute: async ({ nodeId, title, prompt, properties, children }) => withGraphLock(async () => {
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
          modifiedGraph.nodes.forEach((n) => {
            n.children.forEach((c) => {
              if (c.id === nodeId) c.title = title;
            });
          });
        }
        if (prompt !== undefined) nodeToEdit.prompt = prompt;
        if (properties !== undefined) nodeToEdit.properties = properties;

        if (children !== undefined) {
          nodeToEdit.children = Array.isArray(children) ? children : [];

          // Sync parent-child for children that exist now
          const byId = buildIndex(modifiedGraph);
          nodeToEdit.children.forEach((c) => {
            const childNode = byId.get(c.id);
            if (childNode && (!childNode.parentId || childNode.parentId === nodeId)) {
              childNode.parentId = nodeId;
            }
          });

          // Clear parentId for nodes no longer children
          const currentChildIds = new Set(nodeToEdit.children.map((c) => c.id));
          modifiedGraph.nodes.forEach((n) => {
            if (n.parentId === nodeId && !currentChildIds.has(n.id)) {
              n.parentId = undefined;
            }
          });
        }

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
          modifiedGraph.nodes.forEach((n) => {
            n.children.forEach((c) => {
              if (c.id === nodeId) c.title = title;
            });
          });
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

        // Helper: collect descendant nodes recursively
        const collectDescendants = (id: string, nodes: GraphNode[]): GraphNode[] => {
          const descendants: GraphNode[] = [];
          const node = nodes.find((n) => n.id === id);
          if (node) {
            node.children.forEach((c) => {
              const childNode = nodes.find((n) => n.id === c.id);
              if (childNode) {
                descendants.push(childNode);
                descendants.push(...collectDescendants(childNode.id, nodes));
              }
            });
          }
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
          if (includeChildren) out.children = node.children;
          return out;
        };

        let result: any;

        if (nodeId) {
          const targetNode = graph.nodes.find((n) => n.id === nodeId);
          if (!targetNode) {
            return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'read_graph', nodeId } };
          }

          if (recursive) {
            const descendants = collectDescendants(nodeId, graph.nodes);
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
