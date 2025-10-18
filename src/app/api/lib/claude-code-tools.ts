import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PropertySchema, NodeMetadataSchema } from './schemas';

const MetadataInputSchema = z.union([
  NodeMetadataSchema,
  z.array(z.string().min(1).trim()),
  z.string().min(1).trim(),
  // Allow more flexible nested structures that will be normalized
  z.object({
    files: z.union([
      z.array(z.string().min(1).trim()),
      z.object({ files: z.array(z.string().min(1).trim()) }),
      z.array(z.object({ files: z.array(z.string().min(1).trim()) }))
    ])
  })
]);

export const createGraphTools = (baseUrl: string) => {
  console.log('🔧 Creating graph tools (graph-service backed)', { baseUrl });

  return [
  // read (rich read)
  tool(
    'read',
    'Read from current graph or base graph, or a specific node with all its connections.',
    {
      graphType: z.enum(['current', 'base']).default('current').describe('Which graph to read from: "current" (working graph) or "base" (completed implementations)'),
      nodeId: z.string().optional(),
      includeProperties: z.boolean().optional(),
      includeChildren: z.boolean().optional(),
    },
    async ({ graphType = 'current', nodeId }) => {
      console.log('🔍 TOOL: read called via API', { graphType, nodeId });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api?type=${graphType}${nodeId ? `&nodeId=${nodeId}` : ''}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ TOOL: read API error:', errorData.error);
          return { content: [{ type: 'text', text: `Error: ${errorData.error || 'Failed to read graph'}` }] };
        }

        const result = await response.json();

        if (result.error) {
          console.error('❌ TOOL: read API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: read API success');

        // For individual node requests, the API returns formatted text directly
        if (nodeId) {
          console.log('📤 TOOL: read returning node data');
          return { content: [{ type: 'text', text: result }] };
        }

        // For graph summary requests, the API returns JSON
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
    'Create a connection (edge) between two nodes in the graph. Use alreadyImplemented=true during indexing to immediately sync the edge to base graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      role: z.string().optional(),
      alreadyImplemented: z.boolean().optional().describe('If true, immediately sync this edge to base graph (used during indexing mode)'),
    },
    async ({ sourceId, targetId, role, alreadyImplemented }) => {
      console.log('🔗 TOOL: edge_create called via API', { sourceId, targetId, role });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edge_create',
            sourceId,
            targetId,
            role,
            alreadyImplemented
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

  // edge_delete
  tool(
    'edge_delete',
    'Delete a connection (edge) between two nodes in the graph. Use alreadyImplemented=true during indexing to immediately sync the deletion to base graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      alreadyImplemented: z.boolean().optional().describe('If true, immediately sync this deletion to base graph (used during indexing mode or cleanup)'),
    },
    async ({ sourceId, targetId, alreadyImplemented }) => {
      console.log('🗑️ TOOL: edge_delete called via API', { sourceId, targetId });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edge_delete',
            sourceId,
            targetId,
            alreadyImplemented
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: edge_delete API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: edge_delete API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: edge_delete API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to delete edge via API: ${errorMessage}` }] };
      }
    }
  ),

  // node_create
  tool(
    'node_create',
    'Create a new node and persist it to the graph. Use alreadyImplemented=true during indexing to immediately sync the node to base graph.',
    {
      nodeId: z.string().min(1),
      title: z.string().min(1),
      prompt: z.string().min(1),
      properties: z.array(PropertySchema).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      alreadyImplemented: z.boolean().optional().describe('If true, immediately sync this node to base graph (used during indexing mode)'),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, title, prompt, properties, position, alreadyImplemented, metadata }) => {
      console.log('➕ TOOL: node_create called via API', { nodeId, title, position: !!position, metadata });

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
            position,
            alreadyImplemented,
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
    'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
    {
      nodeId: z.string().min(1),
      mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
      title: z.string().optional(),
      prompt: z.string().optional(),
      properties: z.array(PropertySchema).optional(),
      children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, mode = 'replace', title, prompt, properties, children, position, metadata }) => {
      console.log('✏️ TOOL: node_edit called via API', { nodeId, mode, title: !!title, prompt: !!prompt, propertiesCount: properties?.length, childrenCount: children?.length, position: !!position, hasMetadata: metadata !== undefined });

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

  // node_metadata_update
  tool(
    'node_metadata_update',
    'Update metadata for a node, including implementation file references and bug tracking.',
    {
      nodeId: z.string().min(1),
      files: z.array(z.string().min(1)).optional().describe('Project-relative file paths to associate with this node.'),
      bugs: z.array(z.string().min(1)).optional().describe('List of bugs that need to be fixed for this node.'),
      merge: z.boolean().optional().describe('If true, merge with existing metadata instead of replacing it.'),
    },
    async ({ nodeId, files, bugs, merge = false }) => {
      console.log('🗂️ TOOL: node_metadata_update called via API', { nodeId, filesCount: files?.length ?? 'undefined', bugsCount: bugs?.length ?? 'undefined', merge });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_metadata_update',
            nodeId,
            files,
            bugs,
            merge
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: node_metadata_update API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_metadata_update API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_metadata_update API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to update metadata via API: ${errorMessage}` }] };
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

  // node_delete
  tool(
    'node_delete',
    'Delete a node by id. Use alreadyImplemented=true during indexing to immediately sync the deletion to base graph.',
    { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true), alreadyImplemented: z.boolean().optional().describe('If true, immediately sync this deletion to base graph (used during indexing mode or cleanup)') },
    async ({ nodeId, recursive, alreadyImplemented }) => {
      console.log('🗑️ TOOL: node_delete called via API', { nodeId, recursive });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_delete',
            nodeId,
            recursive,
            alreadyImplemented
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          console.error('❌ TOOL: node_delete API error:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_delete API success');
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_delete API call error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to delete node via API: ${errorMessage}` }] };
      }
    }
  ),

  ];
};
