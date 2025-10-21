import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PropertySchema, MetadataInputSchema } from './schemas';

export const createGraphTools = (baseUrl: string) => {
  console.log('🔧 Creating graph tools (graph-service backed)', { baseUrl });

  return [
  // read (rich read)
  tool(
    'read',
    'Read from current graph or base graph, or a specific node with all its connections. Use path parameter to read nested graph levels. Example: path=["system-id"] reads nodes inside system; path=["system-id", "container-id"] reads nodes inside container. Without path, reads root level.',
    {
      graphType: z.enum(['current', 'base']).default('current').describe('Which graph to read from: "current" (working graph) or "base" (completed implementations)'),
      nodeId: z.string().optional(),
      path: z.array(z.string()).optional().describe('Array of node IDs to navigate to nested graph level (e.g., ["parent-id", "child-id"] to access grandchild level)'),
      includeProperties: z.boolean().optional(),
      includeChildren: z.boolean().optional(),
    },
    async ({ graphType = 'current', nodeId, path }) => {
      console.log('🔍 TOOL: read called via API', { graphType, nodeId, path });

      try {
        const pathParam = path && path.length > 0 ? `&path=${encodeURIComponent(JSON.stringify(path))}` : '';
        const response = await fetch(`${baseUrl}/api/graph-api?type=${graphType}${nodeId ? `&nodeId=${nodeId}` : ''}${pathParam}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ TOOL: read API error:', errorData.error);
          return { content: [{ type: 'text', text: `Error: ${errorData.error || 'Failed to read graph'}` }] };
        }

        // For individual node requests, the API returns plain text (not JSON)
        if (nodeId) {
          const text = await response.text();
          console.log('📤 TOOL: read returning node data');
          return { content: [{ type: 'text', text }] };
        }

        // For graph summary requests, the API returns JSON
        const result = await response.json();

        if (result.error) {
          console.error('❌ TOOL: read API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: read API success');

        if (result.success && result.graph) {
          console.log('📤 TOOL: read returning formatted graph summary');
          const nodes = result.graph.nodes?.map((n: any) => ({ id: n.id, title: n.title })) || [];
          const formattedResult = JSON.stringify({ nodes }, null, 2);
          return { content: [{ type: 'text', text: formattedResult }] };
        }

        // Fallback
        return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: read API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to read graph via API: ${errorMessage}` }] };
      }
    }
  ),

  // edge_create
  tool(
    'edge_create',
    'Create a connection (edge) between two nodes in the graph. Can create edges at nested graph levels using path parameter. Use syncToBase=true during indexing to immediately sync the edge to base graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      role: z.string().optional(),
      shape: z.enum(['solid', 'dotted']).optional().describe('The visual shape/style of the edge line (solid or dotted)'),
      path: z.array(z.string()).optional().describe('Array of node IDs to navigate to nested graph level where the edge should be created'),
      syncToBase: z.boolean().optional().describe('If true, immediately sync this edge to base graph (used during indexing mode)'),
    },
    async ({ sourceId, targetId, role, shape, path, syncToBase }) => {
      console.log('🔗 TOOL: edge_create called via API', { sourceId, targetId, role, shape, path });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edge_create',
            sourceId,
            targetId,
            role,
            shape,
            path,
            syncToBase
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: edge_create API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: edge_create API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: edge_create API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to create edge via API: ${errorMessage}` }] };
      }
    }
  ),

  // delete (unified for nodes and edges)
  tool(
    'delete',
    'Delete a node or edge from the graph. For nodes: provide nodeId. For edges: provide sourceId and targetId. Can delete from nested graph levels using path parameter. Use syncToBase=true during indexing to immediately sync to base graph.',
    {
      nodeId: z.string().optional().describe('ID of the node to delete'),
      sourceId: z.string().optional().describe('Source node ID for edge deletion'),
      targetId: z.string().optional().describe('Target node ID for edge deletion'),
      path: z.array(z.string()).optional().describe('Array of node IDs to navigate to nested graph level where the node/edge exists'),
      recursive: z.boolean().optional().default(true).describe('For node deletion: if true, recursively delete child nodes'),
      syncToBase: z.boolean().optional().describe('If true, immediately sync this deletion to base graph (used during indexing mode or cleanup)'),
    },
    async ({ nodeId, sourceId, targetId, path, recursive, syncToBase }) => {
      const isEdgeDeletion = sourceId && targetId;
      const isNodeDeletion = nodeId;

      if (!isEdgeDeletion && !isNodeDeletion) {
        return { content: [{ type: 'text', text: 'Error: Must provide either nodeId (for node deletion) or both sourceId and targetId (for edge deletion)' }] };
      }

      if (isEdgeDeletion && isNodeDeletion) {
        return { content: [{ type: 'text', text: 'Error: Cannot delete both node and edge in same operation. Provide either nodeId OR (sourceId + targetId)' }] };
      }

      const action = isEdgeDeletion ? 'edge_delete' : 'node_delete';
      console.log(`🗑️ TOOL: delete called via API (${action})`, isEdgeDeletion ? { sourceId, targetId, path } : { nodeId, recursive, path });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ...(isEdgeDeletion ? { sourceId, targetId } : { nodeId, recursive }),
            path,
            syncToBase
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error(`❌ TOOL: delete API error (${action}):`, result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log(`📤 TOOL: delete API success (${action})`);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`💥 TOOL: delete API call error (${action}):`, errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to delete via API: ${errorMessage}` }] };
      }
    }
  ),

  // node_create
  tool(
    'node_create',
    'Create a new node and persist it to the graph. Use path parameter to create nodes INSIDE parent nodes for C4 hierarchy. Example: path=["system-id"] creates node inside system\'s nested graph; path=["system-id", "container-id"] creates inside container. Without path, creates at root level. Use syncToBase=true during indexing to immediately sync the node to base graph.',
    {
      nodeId: z.string().min(1),
      title: z.string().min(1),
      prompt: z.string().min(1),
      properties: z.array(PropertySchema).optional(),
      children: z.array(z.object({ id: z.string(), title: z.string() })).optional().describe('Array of child node references {id, title} for nested node structures'),
      path: z.array(z.string()).optional().describe('Array of node IDs to navigate to nested graph level where the node should be created'),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      syncToBase: z.boolean().optional().describe('If true, immediately sync this node to base graph (used during indexing mode)'),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, title, prompt, properties, children, path, position, syncToBase, metadata }) => {
      console.log('➕ TOOL: node_create called via API', { nodeId, title, hasChildren: !!children, childrenCount: children?.length, path, position: !!position, metadata });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_create',
            nodeId,
            title,
            prompt,
            properties,
            children,
            path,
            position,
            syncToBase,
            metadata
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: node_create API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_create API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_create API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to create node via API: ${errorMessage}` }] };
      }
    }
  ),

  // analyze_diff
  tool(
    'analyze_diff',
    'Analyze differences between current graph and base graph to see what changes need to be made. Can analyze entire graph or focus on a specific node.',
    {
      nodeId: z.string().optional().describe('Optional node ID to analyze differences for. If not provided, analyzes the entire graph.')
    },
    async ({ nodeId }) => {
      console.log('🔍 TOOL: analyze_diff called via API', { nodeId });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'analyze_diff',
            nodeId
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: analyze_diff API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: analyze_diff API success');
        return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: analyze_diff API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to analyze diff via API: ${errorMessage}` }] };
      }
    }
  ),

  // node_edit
  tool(
    'node_edit',
    'Edit node fields including title, prompt, properties, position, children, and metadata. Two modes: replace (fully replaces node) or merge (merges with existing data). Can edit nodes at nested graph levels using path parameter. Use this for updating metadata (files, bugs) instead of node_metadata_update.',
    {
      nodeId: z.string().min(1),
      mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
      title: z.string().optional(),
      prompt: z.string().optional(),
      properties: z.array(PropertySchema).optional(),
      children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
      path: z.array(z.string()).optional().describe('Array of node IDs to navigate to nested graph level where the node exists'),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, mode = 'replace', title, prompt, properties, children, path, position, metadata }) => {
      console.log('✏️ TOOL: node_edit called via API', { nodeId, mode, title: !!title, prompt: !!prompt, propertiesCount: properties?.length, childrenCount: children?.length, path, position: !!position, hasMetadata: metadata !== undefined });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_edit',
            nodeId,
            mode,
            title,
            prompt,
            properties,
            children,
            path,
            position,
            metadata
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: node_edit API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_edit API success');
        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_edit API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to edit node via API: ${errorMessage}` }] };
    }
  }
  ),

  // sync_to_base_graph
  tool(
    'sync_to_base_graph',
    'Sync specific nodes and edges from current graph to base graph by IDs. For each ID: if it exists in current but not base → add to base; if different → update in base; if exists in base but not current → delete from base.',
    {
      nodeIds: z.array(z.string()).optional(),
      edgeIds: z.array(z.string()).optional(),
    },
    async ({ nodeIds, edgeIds }) => {
      console.log('🔄 TOOL: sync_to_base_graph called via API', {
        nodeIds: nodeIds || [],
        edgeIds: edgeIds || []
      });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sync_to_base_graph',
            nodeIds,
            edgeIds
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: sync_to_base_graph API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: sync_to_base_graph API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: sync_to_base_graph API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to sync to base graph via API: ${errorMessage}` }] };
      }
    }
  ),

  // graph_clear
  tool(
    'graph_clear',
    'Fully clear the graph, leaving only empty nodes and edges tags, and outer structure. Can clear current graph, base graph, or both.',
    {
      graphType: z.enum(['current', 'base', 'both']).default('current').describe('Which graph(s) to clear: "current" (working graph), "base" (completed implementations), or "both"')
    },
    async ({ graphType = 'current' }) => {
      console.log('🧹 TOOL: graph_clear called via API', { graphType });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'graph_clear',
            graphType
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: graph_clear API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: graph_clear API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: graph_clear API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to clear graph via API: ${errorMessage}` }] };
      }
    }
  ),

  ];
};

export const createGraphMcpServer = (baseUrl: string) => {
  console.log('🔧 Creating graph MCP server', { baseUrl });
  const tools = createGraphTools(baseUrl);
  return createSdkMcpServer({ name: 'graph-tools', version: '1.0.0', tools });
};
