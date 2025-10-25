import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PropertySchema, MetadataInputSchema, NodeTypeEnum, C4LevelEnum } from './schemas';

export const createGraphTools = (baseUrl: string) => {
  console.log('🔧 Creating graph tools (graph-service backed)', { baseUrl });

  return [
  // read (rich read)
  tool(
    'read',
    'Read from the graph, or a specific node with all its connections. Can filter by C4 architectural layer.',
    {
      nodeId: z.string().optional(),
      layer: z.enum(['system', 'container', 'component', 'code']).optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code"'),
      includeProperties: z.boolean().optional(),
      includeChildren: z.boolean().optional(),
    },
    async ({ nodeId, layer }) => {
      console.log('🔍 TOOL: read called via API', { nodeId, layer });

      try {
        const queryParams = new URLSearchParams();
        if (nodeId) queryParams.set('nodeId', nodeId);
        if (layer) queryParams.set('layer', layer);

        const response = await fetch(`${baseUrl}/api/graph-api?${queryParams.toString()}`, {
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
          const layerInfo = layer ? ` (filtered by ${layer} layer)` : '';
          const formattedResult = JSON.stringify({ nodes }, null, 2);
          return { content: [{ type: 'text', text: `Graph Summary${layerInfo}:\n${formattedResult}` }] };
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
    'Create a connection (edge) between two nodes in the graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      role: z.string().optional(),
      shape: z.enum(['refines', 'relates']).optional().describe('The semantic relationship type: "refines" for hierarchical connections, "relates" for same-level connections'),
    },
    async ({ sourceId, targetId, role, shape }) => {
      console.log('🔗 TOOL: edge_create called via API', { sourceId, targetId, role, shape });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edge_create',
            sourceId,
            targetId,
            role,
            shape
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
    'Delete a connection (edge) between two nodes in the graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
    },
    async ({ sourceId, targetId }) => {
      console.log('🗑️ TOOL: edge_delete called via API', { sourceId, targetId });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edge_delete',
            sourceId,
            targetId
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
    'Create a new node and persist it to the graph.',
    {
      nodeId: z.string().min(1),
      title: z.string().min(1),
      prompt: z.string().min(1),
      type: NodeTypeEnum.describe('The node type: system, container, component, code, or comment'),
      level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
      comment: z.string().optional(),
      properties: z.array(PropertySchema).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, title, prompt, type, level, comment, properties, position, metadata }) => {
      console.log('➕ TOOL: node_create called via API', { nodeId, title, type, comment: !!comment, position: !!position, metadata });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_create',
            nodeId,
            title,
            prompt,
            type,
            level,
            comment,
            properties,
            position,
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


  // node_edit
  tool(
    'node_edit',
    'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
    {
      nodeId: z.string().min(1),
      mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
      title: z.string().optional(),
      prompt: z.string().optional(),
      type: NodeTypeEnum.optional().describe('The node type: system, container, component, code, or comment'),
      level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
      comment: z.string().optional(),
      properties: z.array(PropertySchema).optional(),
      children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      metadata: MetadataInputSchema.optional(),
    },
    async ({ nodeId, mode = 'replace', title, prompt, type, level, comment, properties, children, position, metadata }) => {
      console.log('✏️ TOOL: node_edit called via API', { nodeId, mode, title: !!title, prompt: !!prompt, type: !!type, level: !!level, comment: !!comment, propertiesCount: properties?.length, childrenCount: children?.length, position: !!position, hasMetadata: metadata !== undefined });

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
            type,
            level,
            comment,
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


  // node_delete
  tool(
    'node_delete',
    'Delete a node by id.',
    { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
    async ({ nodeId, recursive }) => {
      console.log('🗑️ TOOL: node_delete called via API', { nodeId, recursive });

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'node_delete',
            nodeId,
            recursive
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

  // graph_clear
  tool(
    'graph_clear',
    'Fully clear the graph, leaving only empty nodes and edges tags, and outer structure.',
    {},
    async () => {
      console.log('🧹 TOOL: graph_clear called via API');

      try {
        const response = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'graph_clear'
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
