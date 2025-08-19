import { tool } from 'ai';
import { z } from 'zod';
import { GraphSchema } from './schemas';

// Helper function to fetch graph from API
async function fetchGraphFromAPI(): Promise<any> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/backend/graph-api`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No graph exists
      }
      throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.success ? data.graph : null;
  } catch (error) {
    console.error('Error fetching graph from API:', error);
    return null;
  }
}

// Helper function to save graph through API
async function saveGraphThroughAPI(graph: any): Promise<boolean> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/backend/graph-api`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ graph }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save graph: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error saving graph through API:', error);
    return false;
  }
}

// In-memory storage for pending changes
let pendingGraph: any = null;
let originalGraph: any = null;

export async function setCurrentGraph(graph?: any) {
  // If no graph is provided, try to fetch it from the API
  if (!graph) {
    graph = await fetchGraphFromAPI();
    if (!graph) {
      throw new Error('No graph available and could not fetch from API');
    }
  }
  
  if (!originalGraph) originalGraph = JSON.parse(JSON.stringify(graph));
  pendingGraph = pendingGraph || JSON.parse(JSON.stringify(graph));
}

// Replace your current PropertyTypeSchema with this:

const PropertyTypeSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('color'),
      value: z.string(),            // required
    }).strict(),
  
    z.object({
      type: z.literal('text'),
      value: z.string(),            // required
    }).strict(),
  
    z.object({
      type: z.literal('number'),
      value: z.string(),            // keep as string if your pipeline expects strings
    }).strict(),
  
    z.object({
      type: z.literal('select'),
      value: z.string(),            // current selection (required)
      options: z.array(z.string()), // required for select
    }).strict(),
  ]);
  
  const CodeBindingSchema = z.object({
    file: z.string(),
    start: z.number().int(),
    end: z.number().int(),
  }).strict();
  
  const PropertySchema = z.object({
    id: z.string(),
    title: z.string(),
    propertyType: PropertyTypeSchema,
    codeBinding: CodeBindingSchema, // ok: optional at parent level
  }).strict();
  
  const ChildLinkSchema = z.object({
    id: z.string(),
    title: z.string(),
  }).strict();
  

/** ---------- Tool Parameter Schemas (STRICT) ---------- */
const AddNodeParamsSchema = z.object({
  parentId: z.string().describe('ID of the parent node to add the new node as a child'),
  nodeId: z.string().describe('Unique ID for the new node (should follow pattern node-element-*)'),
  title: z.string().describe('Display title for the new node'),
  prompt: z.string().describe('Description/prompt for the new node'),
  properties: z.array(PropertySchema).describe('Array of property objects'),
}).strict();

const DeleteNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to delete'),
  recursive: z.boolean().describe('If true, delete all children and descendants recursively. If false or not provided, only delete the node itself'),
}).strict();

const EditNodeParamsSchema = z.object({
  nodeId: z.string().describe('ID of the node to edit'),
  title: z.string().describe('New title for the node'),
  prompt: z.string().describe('New prompt/description for the node'),
  properties: z.array(PropertySchema).describe('Array of property objects'),
  children: z.array(ChildLinkSchema),
}).strict();

const ReadGraphParamsSchema = z.object({
  // No parameters needed for reading the graph
}).strict();

/** ---------- Tools ---------- */
export const graphEditorTools = {
  add_node: tool({
    description: 'Add a new node to the graph with specified properties',
    parameters: AddNodeParamsSchema,
    execute: async ({ parentId, nodeId, title, prompt, properties = [] }) => {
      try {
        if (!pendingGraph) {
          await setCurrentGraph();
        }
        const modifiedGraph = JSON.parse(JSON.stringify(pendingGraph));

        const parentNode = modifiedGraph.nodes.find((node: any) => node.id === parentId);
        if (!parentNode) {
          return { success: false, message: `Parent node with ID ${parentId} not found`, operation: { type: 'add_node', nodeId, title } };
        }

        const existingNode = modifiedGraph.nodes.find((node: any) => node.id === nodeId);
        if (existingNode) {
          return { success: false, message: `Node with ID ${nodeId} already exists`, operation: { type: 'add_node', nodeId, title } };
        }

        const newNode = { id: nodeId, title, prompt, children: [], built: false, properties };
        modifiedGraph.nodes.push(newNode);
        parentNode.children.push({ id: nodeId, title });

        // Auto-apply changes
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

        return { success: true, message: `Successfully added node "${title}" (${nodeId}) as child of "${parentNode.title}"`, operation: { type: 'add_node', nodeId, title, parentId } };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'add_node', nodeId, title } };
      }
    },
  }),

  delete_node: tool({
    description: 'Remove a node from the graph and update parent references. Optionally delete all children recursively.',
    parameters: DeleteNodeParamsSchema,
    execute: async ({ nodeId, recursive = false }) => {
      try {
        if (!pendingGraph) {
          await setCurrentGraph();
        }

        const modifiedGraph = JSON.parse(JSON.stringify(pendingGraph));
        const nodeToDelete = modifiedGraph.nodes.find((node: any) => node.id === nodeId);
        if (!nodeToDelete) {
          return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'delete_node', nodeId } };
        }
        if (modifiedGraph.rootId === nodeId) {
          return { success: false, message: 'Cannot delete the root node', operation: { type: 'delete_node', nodeId } };
        }

        // Helper function to collect all descendant IDs recursively
        const collectDescendantIds = (nodeId: string, nodes: any[]): string[] => {
          const descendants: string[] = [];
          const node = nodes.find((n: any) => n.id === nodeId);
          if (node && node.children) {
            node.children.forEach((child: any) => {
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

        // Remove all nodes to be deleted
        modifiedGraph.nodes = modifiedGraph.nodes.filter((node: any) => !nodesToDelete.includes(node.id));
        
        // Remove all references to deleted nodes from children arrays
        modifiedGraph.nodes.forEach((node: any) => {
          node.children = node.children.filter((child: any) => !nodesToDelete.includes(child.id));
        });

        // Auto-apply changes
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
          operation: { 
            type: 'delete_node', 
            nodeId, 
            deletedTitle: nodeToDelete.title, 
            recursive, 
            deletedCount 
          } 
        };
      } catch (error: any) {
        return { success: false, message: error.message, operation: { type: 'delete_node', nodeId } };
      }
    },
  }),

  edit_node: tool({
    description: "Edit an existing node's properties",
    parameters: EditNodeParamsSchema,
    execute: async ({ nodeId, title, prompt, properties, children }) => {
      try {
        if (!pendingGraph) {
          await setCurrentGraph();
        }

        const modifiedGraph = JSON.parse(JSON.stringify(pendingGraph));
        const nodeToEdit = modifiedGraph.nodes.find((node: any) => node.id === nodeId);
        if (!nodeToEdit) {
          return { success: false, message: `Node with ID ${nodeId} not found`, operation: { type: 'edit_node', nodeId } };
        }

        if (title !== undefined) {
          nodeToEdit.title = title;
          modifiedGraph.nodes.forEach((node: any) => {
            node.children.forEach((child: any) => {
              if (child.id === nodeId) child.title = title;
            });
          });
        }
        if (prompt !== undefined) nodeToEdit.prompt = prompt;
        if (properties !== undefined) nodeToEdit.properties = properties;
        if (children !== undefined) nodeToEdit.children = children;

        // Auto-apply changes
        const validationResult = GraphSchema.safeParse(modifiedGraph);
        if (!validationResult.success) {
          return { success: false, message: `Invalid graph structure: ${validationResult.error.message}`, operation: { type: 'edit_node', nodeId } };
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
    },
  }),
};

export function getCurrentGraphState() {
  return { pendingGraph, originalGraph, hasPendingChanges: pendingGraph !== null };
}

export function resetPendingChanges() {
  pendingGraph = null;
  originalGraph = null;
}
