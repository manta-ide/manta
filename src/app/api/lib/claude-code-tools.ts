import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PropertySchema, MetadataInputSchema, NodeTypeEnum, C4LevelEnum } from './schemas';
import { graphOperations } from './graph-service';

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
    async ({ nodeId, layer, includeProperties, includeChildren }) => {
      console.log('🔍 TOOL: read called directly', { nodeId, layer, includeProperties, includeChildren });

      try {
        const result = await graphOperations.read({
          nodeId,
          layer,
          includeProperties,
          includeChildren
        });

        if (!result.success) {
          console.error('❌ TOOL: read operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: read success');

        if (nodeId && result.node) {
          // Format individual node data
          let text = `**Node: ${result.node.title} (${nodeId})**\n\n`;
          text += `**Description:** ${result.node.description || 'No description'}\n\n`;

          // Add properties if they exist and are requested
          if (includeProperties && result.node.properties && result.node.properties.length > 0) {
            text += `**Properties:**\n`;
            result.node.properties.forEach((prop: any) => {
              const hasMinMax = (typeof prop.min === 'number') || (typeof prop.max === 'number');
              const rangeText = hasMinMax ? ` [${prop.min ?? ''}..${prop.max ?? ''}${typeof prop.step === 'number' ? `, step ${prop.step}` : ''}]` : '';
              text += `- ${prop.id}: ${JSON.stringify(prop.value)} (${prop.type}${rangeText})\n`;
            });
            text += '\n';
          }

          // Add connections if they exist
          // Note: This would need to be enhanced to get actual connections
          text += `**Connections:** Available through graph query\n`;

          return { content: [{ type: 'text', text }] };
        }

        if (result.layers) {
          // Format layer data
          const layerInfo = layer ? ` (filtered by ${layer} layer)` : '';
          const formattedResult = JSON.stringify({ layers: result.layers }, null, 2);
          return { content: [{ type: 'text', text: `Graph Layers${layerInfo}:\n${formattedResult}` }] };
        }

        // Fallback
        return { content: [{ type: 'text', text: 'Graph read successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: read operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to read graph: ${errorMessage}` }] };
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
      console.log('🔗 TOOL: edge_create called directly', { sourceId, targetId, role, shape });

      try {
        const result = await graphOperations.edgeCreate({
          sourceId,
          targetId,
          role,
          shape
        });

        if (!result.success) {
          console.error('❌ TOOL: edge_create operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: edge_create success');
        return { content: [{ type: 'text', text: result.content?.text || 'Edge created successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: edge_create operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to create edge: ${errorMessage}` }] };
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
      console.log('🗑️ TOOL: edge_delete called directly', { sourceId, targetId });

      try {
        const result = await graphOperations.edgeDelete({
          sourceId,
          targetId
        });

        if (!result.success) {
          console.error('❌ TOOL: edge_delete operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: edge_delete success');
        return { content: [{ type: 'text', text: result.content?.text || 'Edge deleted successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: edge_delete operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to delete edge: ${errorMessage}` }] };
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
      console.log('➕ TOOL: node_create called directly', { nodeId, title, type, comment: !!comment, position: !!position, metadata });

      try {
        const result = await graphOperations.nodeCreate({
          title,
          prompt,
          type,
          level,
          comment,
          properties,
          position,
          metadata
        });

        if (!result.success) {
          console.error('❌ TOOL: node_create operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_create success');
        return { content: [{ type: 'text', text: result.content?.text || 'Node created successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_create operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to create node: ${errorMessage}` }] };
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
      console.log('✏️ TOOL: node_edit called directly', { nodeId, mode, title: !!title, prompt: !!prompt, type: !!type, level: !!level, comment: !!comment, propertiesCount: properties?.length, childrenCount: children?.length, position: !!position, hasMetadata: metadata !== undefined });

      try {
        const result = await graphOperations.nodeEdit({
          nodeId,
          mode,
          title,
          prompt,
          description: prompt, // Map prompt to description
          type,
          level,
          comment,
          properties,
          children,
          position,
          metadata
        });

        if (!result.success) {
          console.error('❌ TOOL: node_edit operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_edit success');
        return { content: [{ type: 'text', text: result.content?.text || 'Node edited successfully' }] };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_edit operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to edit node: ${errorMessage}` }] };
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
      console.log('🗂️ TOOL: node_metadata_update called directly', { nodeId, filesCount: files?.length ?? 'undefined', bugsCount: bugs?.length ?? 'undefined', merge });

      try {
        const result = await graphOperations.nodeMetadataUpdate({
          nodeId,
          files,
          bugs,
          merge
        });

        if (!result.success) {
          console.error('❌ TOOL: node_metadata_update operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_metadata_update success');
        return { content: [{ type: 'text', text: result.content?.text || 'Metadata updated successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_metadata_update operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to update metadata: ${errorMessage}` }] };
      }
    }
  ),


  // node_delete
  tool(
    'node_delete',
    'Delete a node by id.',
    { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
    async ({ nodeId, recursive }) => {
      console.log('🗑️ TOOL: node_delete called directly', { nodeId, recursive });

      try {
        const result = await graphOperations.nodeDelete({
          nodeId,
          recursive
        });

        if (!result.success) {
          console.error('❌ TOOL: node_delete operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: node_delete success');
        return { content: [{ type: 'text', text: result.content?.text || 'Node deleted successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_delete operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to delete node: ${errorMessage}` }] };
      }
    }
  ),

  // graph_clear
  tool(
    'graph_clear',
    'Fully clear the graph, leaving only empty nodes and edges tags, and outer structure.',
    {},
    async () => {
      console.log('🧹 TOOL: graph_clear called directly');

      try {
        const result = await graphOperations.graphClear({});

        if (!result.success) {
          console.error('❌ TOOL: graph_clear operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: graph_clear success');
        return { content: [{ type: 'text', text: result.content?.text || 'Graph cleared successfully' }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: graph_clear operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to clear graph: ${errorMessage}` }] };
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
