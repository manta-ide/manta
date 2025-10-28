import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { PropertySchema, MetadataInputSchema, NodeTypeEnum, C4LevelEnum } from './schemas';
import { graphOperations } from './graph-service';

export const createGraphTools = (baseUrl: string, userId: string) => {
  console.log('🔧 Creating graph tools (API backed)', { baseUrl, userId });

  return [
  // list_projects
  tool(
    'list_projects',
    'List all projects available to the user. Returns project ID, name, description, and creation date.',
    {},
    async () => {
      console.log('📋 TOOL: list_projects called', { userId });

      try {
        const result = await graphOperations.listProjects({ userId });

        if (!result.success) {
          console.error('❌ TOOL: list_projects operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: list_projects success, found', result.projects?.length || 0, 'projects');

        if (result.projects && result.projects.length > 0) {
          let text = `**Available Projects (${result.projects.length})**\n\n`;
          result.projects.forEach((project: any) => {
            text += `**${project.name}** (ID: \`${project.id}\`)\n`;
            if (project.description) {
              text += `  Description: ${project.description}\n`;
            }
            if (project.role) {
              text += `  Role: ${project.role}\n`;
            }
            if (project.created_at) {
              text += `  Created: ${new Date(project.created_at).toLocaleDateString()}\n`;
            }
            text += '\n';
          });
          return { content: [{ type: 'text', text }] };
        } else {
          return { content: [{ type: 'text', text: 'No projects found. You may need to create a new project first.' }] };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: list_projects operation error:', errorMessage);
        return { content: [{ type: 'text', text: `Error: Failed to list projects: ${errorMessage}` }] };
      }
    }
  ),

  // read (rich read)
  tool(
    'read',
    'Read from the graph, or a specific node with all its connections. Can filter by C4 architectural layer.',
    {
      projectId: z.string().describe('The project ID to read from'),
      nodeId: z.string().optional(),
      layer: z.enum(['system', 'container', 'component', 'code']).optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code"'),
      includeProperties: z.boolean().optional(),
      includeChildren: z.boolean().optional(),
      format: z.enum(['json', 'xml']).optional().describe('Output format: "json" or "xml" (defaults to "json")'),
    },
    async ({ projectId, nodeId, layer, includeProperties, includeChildren, format = 'json' }) => {
      console.log('🔍 TOOL: read called', { projectId, nodeId, layer, includeProperties, includeChildren, format });

      try {
        const result = await graphOperations.read({
          userId,
          projectId,
          nodeId,
          layer,
          includeProperties,
          includeChildren,
          format
        });

        if (!result.success) {
          console.error('❌ TOOL: read operation failed:', result.error);
          return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
        }

        console.log('📤 TOOL: read success');

        if (result.content) {
          // XML format
          return { content: [{ type: 'text', text: result.content }] };
        } else if (result.node) {
          // JSON format - individual node
          const node = result.node;
          let text = `**Node: ${node.title} (${nodeId})**\n\n`;
          text += `**Description:** ${node.description || 'No description'}\n\n`;

          // Add properties if they exist and are requested
          if (includeProperties && node.properties && node.properties.length > 0) {
            text += `**Properties:**\n`;
            node.properties.forEach((prop: any) => {
              const hasMinMax = (typeof prop.min === 'number') || (typeof prop.max === 'number');
              const rangeText = hasMinMax ? ` [${prop.min ?? ''}..${prop.max ?? ''}${typeof prop.step === 'number' ? `, step ${prop.step}` : ''}]` : '';
              text += `- ${prop.id}: ${JSON.stringify(prop.value)} (${prop.type}${rangeText})\n`;
            });
            text += '\n';
          }

          // Add connections if they exist
          text += `**Connections:** Available through graph query\n`;

          return { content: [{ type: 'text', text }] };
        } else if (result.layers) {
          // JSON format - layers
          const formattedResult = JSON.stringify({ layers: result.layers }, null, 2);
          return { content: [{ type: 'text', text: `Graph Layers:\n${formattedResult}` }] };
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
      projectId: z.string().describe('The project ID to operate on'),
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      role: z.string().optional(),
      shape: z.enum(['refines', 'relates']).optional().describe('The semantic relationship type: "refines" for hierarchical connections, "relates" for same-level connections'),
    },
    async ({ projectId, sourceId, targetId, role, shape }) => {
      console.log('🔗 TOOL: edge_create called', { projectId, sourceId, targetId, role, shape });

      try {
        const result = await graphOperations.edgeCreate({
          userId,
          projectId,
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
        const responseText = result.content?.text || 'Edge created successfully';
        const finalText = result.edgeId ? `${responseText} (ID: ${result.edgeId})` : responseText;
        return { content: [{ type: 'text', text: finalText }] };
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
      projectId: z.string().describe('The project ID to operate on'),
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
    },
    async ({ projectId, sourceId, targetId }) => {
      console.log('🗑️ TOOL: edge_delete called', { projectId, sourceId, targetId });

      try {
        const result = await graphOperations.edgeDelete({
          userId,
          projectId,
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
      projectId: z.string().describe('The project ID to operate on'),
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
    async ({ projectId, nodeId, title, prompt, type, level, comment, properties, position, metadata }) => {
      console.log('➕ TOOL: node_create called', { projectId, nodeId, title, type, comment: !!comment, position: !!position, metadata });

      try {
        const result = await graphOperations.nodeCreate({
          nodeId,
          userId,
          projectId,
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
        const responseText = result.content?.text || 'Node created successfully';
        const finalText = result.nodeId ? `${responseText} (ID: ${result.nodeId})` : responseText;
        return { content: [{ type: 'text', text: finalText }] };
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
      projectId: z.string().describe('The project ID to operate on'),
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
    async ({ projectId, nodeId, mode = 'replace', title, prompt, type, level, comment, properties, children, position, metadata }) => {
      console.log('✏️ TOOL: node_edit called', { projectId, nodeId, mode, title: !!title, prompt: !!prompt, type: !!type, level: !!level, comment: !!comment, propertiesCount: properties?.length, childrenCount: children?.length, position: !!position, hasMetadata: metadata !== undefined });

      try {
        const result = await graphOperations.nodeEdit({
          userId,
          projectId,
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
      projectId: z.string().describe('The project ID to operate on'),
      nodeId: z.string().min(1),
      files: z.array(z.string().min(1)).optional().describe('Project-relative file paths to associate with this node.'),
      bugs: z.array(z.string().min(1)).optional().describe('List of bugs that need to be fixed for this node.'),
      merge: z.boolean().optional().describe('If true, merge with existing metadata instead of replacing it.'),
    },
    async ({ projectId, nodeId, files, bugs, merge = false }) => {
      console.log('🗂️ TOOL: node_metadata_update called', { projectId, nodeId, filesCount: files?.length ?? 'undefined', bugsCount: bugs?.length ?? 'undefined', merge });

      try {
        const result = await graphOperations.nodeMetadataUpdate({
          userId,
          projectId,
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
    {
      projectId: z.string().describe('The project ID to operate on'),
      nodeId: z.string().min(1),
      recursive: z.boolean().optional().default(true)
    },
    async ({ projectId, nodeId, recursive }) => {
      console.log('🗑️ TOOL: node_delete called', { projectId, nodeId, recursive });

      try {
        const result = await graphOperations.nodeDelete({
          userId,
          projectId,
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
    {
      projectId: z.string().describe('The project ID to operate on'),
    },
    async ({ projectId }) => {
      console.log('🧹 TOOL: graph_clear called', { projectId });

      try {
        const result = await graphOperations.graphClear({ userId, projectId });

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

export const createGraphMcpServer = (baseUrl: string, userId: string) => {
  console.log('🔧 Creating graph MCP server', { baseUrl, userId });
  const tools = createGraphTools(baseUrl, userId);
  return createSdkMcpServer({ name: 'graph-tools', version: '1.0.0', tools });
};
