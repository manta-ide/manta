import { tool } from 'ai';
import { z } from 'zod';
import {
  GraphSchema,
  GraphNodeSchema,
  PropertySchema,
  // Types from your schemas
  Graph,
  GraphNode,
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
    const response = await fetch(`${baseUrl}/api/backend/graph-api`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(defaultAuthHeaders || {}) },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate for both runtime safety + strong typing
    if (data?.success) {
      const parsed = GraphSchema.safeParse(data.graph);
      if (parsed.success) return normalizeGraph(parsed.data);
      console.warn('Graph validation failed, attempting to normalize server payload:', parsed.error);
      return normalizeGraph(data.graph);
    }
    return null;
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
    const response = await fetch(`${baseUrl}/api/backend/graph-api`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(defaultAuthHeaders || {}) },
      body: JSON.stringify({ graph }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save graph: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return !!data.success;
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
   Graph Sync / Consistency
   ========================= */

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

const AddNodeParamsSchema = z.object({
  parentId: z.string().describe('ID of the parent node to add the new node as a child'),
  nodeId: z.string().describe('Unique ID for the new node'),
  title: z.string().describe('Display title for the new node'),
  prompt: z.string().describe('Description/prompt for the new node'),
  properties: z.array(PropertySchema).optional().describe('Array of property objects'),
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
  properties: z.array(PropertySchema).describe('Array of property objects (required to set/delete properties)'),
  children: z.array(ChildLinkSchema).optional(),
  state: z.enum(["built", "unbuilt", "building"]).optional().describe('The build state of the node'),
}).strict();

const UpdatePropertiesParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to update properties for'),
  properties: z.array(PropertySchema).describe('Array of property objects to update/add (merges with existing properties)'),
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

        // Auto mark node as unbuilt if prompt or properties structure changed
        const didPromptChange = typeof prompt === 'string' && prompt !== originalPrompt;
        const didPropertyStructureChange = (() => {
          if (properties === undefined) return false;
          const before = originalProperties || [];
          const after = Array.isArray(properties) ? properties : [];
          if (before.length !== after.length) return true;
          // Compare structural fields only (id, title, type, options, constraints), ignore value changes
          const normalize = (p: any) => ({
            id: p?.id ?? '',
            title: p?.title ?? '',
            type: p?.type ?? '',
            maxLength: p?.maxLength ?? undefined,
            min: p?.min ?? undefined,
            max: p?.max ?? undefined,
            step: p?.step ?? undefined,
            options: Array.isArray(p?.options) ? [...p.options] : undefined,
          });
          for (let i = 0; i < before.length; i++) {
            const a = normalize(before[i]);
            const b = normalize(after[i]);
            const aKey = JSON.stringify(a);
            const bKey = JSON.stringify(b);
            if (aKey !== bKey) return true;
          }
          return false;
        })();

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

        // Merge properties (update existing ones, add new ones, preserve others)
        const existingProperties = Array.isArray(nodeToEdit.properties) ? nodeToEdit.properties : [];
        const updatedProperties = [...existingProperties];
        
        // Create a map of existing properties by ID for quick lookup
        const existingPropsMap = new Map(existingProperties.map(p => [p.id, p]));
        
        // Update/add properties from the provided array
        properties.forEach(newProp => {
          const existingIndex = updatedProperties.findIndex(p => p.id === newProp.id);
          if (existingIndex >= 0) {
            // Update existing property
            updatedProperties[existingIndex] = { ...updatedProperties[existingIndex], ...newProp };
          } else {
            // Add new property
            updatedProperties.push(newProp);
          }
        });
        
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

        // Auto mark node as unbuilt if prompt or properties structure changed
        const didPromptChange = typeof prompt === 'string' && prompt !== originalPrompt;
        const didPropertyStructureChange = (() => {
          const before = originalProperties || [];
          const after = Array.isArray(properties) ? properties : [];
          if (before.length !== after.length) return true;
          // Compare structural fields only (id, title, type, options, constraints), ignore value changes
          const normalize = (p: any) => ({
            id: p?.id ?? '',
            title: p?.title ?? '',
            type: p?.type ?? '',
            maxLength: p?.maxLength ?? undefined,
            min: p?.min ?? undefined,
            max: p?.max ?? undefined,
            step: p?.step ?? undefined,
            options: Array.isArray(p?.options) ? [...p.options] : undefined,
          });
          for (let i = 0; i < before.length; i++) {
            const a = normalize(before[i]);
            const b = normalize(after[i]);
            const aKey = JSON.stringify(a);
            const bKey = JSON.stringify(b);
            if (aKey !== bKey) return true;
          }
          return false;
        })();

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
