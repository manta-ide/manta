import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { PropertySchema, MetadataInputSchema, NodeTypeEnum, C4LevelEnum } from '../lib/schemas';
import { graphOperations } from '../lib/graph-service';

const verifyToken = async (
  req: Request,
  apiKey?: string,
): Promise<AuthInfo | undefined> => {
  try {
    // Check for API key authentication via MANTA_API_KEY header
    if (apiKey && apiKey.startsWith('manta_')) {
      // Hash the provided token
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Check against stored API keys in Supabase using service client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseServiceKey) {
        return undefined;
      }

      const client = createClient(supabaseUrl, supabaseServiceKey);

      const { data: apiKeyData, error } = await client
        .from('api_keys')
        .select('user_id, name, type')
        .eq('key_hash', keyHash)
        .single();

      if (!error && apiKeyData) {
        const isAdmin = apiKeyData.type === 'admin';
        return {
          token: `api-key-${apiKeyData.user_id}`,
          scopes: isAdmin ? ['read:graph', 'write:graph'] : ['read:graph'],
          clientId: 'manta-client',
          extra: {
            userId: apiKeyData.user_id,
            keyName: apiKeyData.name,
            keyType: apiKeyData.type,
          },
        };
      }
    }

    return undefined;
  } catch (error) {
    console.error('MCP authentication error:', error);
    return undefined;
  }
};

// Store the current request for use in tool handlers
let currentRequest: Request | null = null;

// Helper function to check if the API key has admin permissions
const checkAdminPermission = (authInfo: AuthInfo | undefined): boolean => {
  return authInfo?.extra?.keyType === 'admin';
};

// Create handler for USER (read-only) API keys - only list_projects and read tools
const userHandler = createMcpHandler(
  (server) => {
    server.tool(
      'list_projects',
      'List all available projects for the authenticated user.',
      {},
      async () => {
        console.log('🔍 MCP TOOL: list_projects called');

        try {
          // Extract API key from MANTA_API_KEY header only
          const apiKey = currentRequest?.headers.get('MANTA_API_KEY') || '';

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // Get the authenticated user
          const authInfo = await verifyToken(currentRequest!, apiKey);
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          // Get all projects for the user
          const { data: userProjects, error: projectsError } = await client
            .from('user_projects')
            .select('project_id, role')
            .eq('user_id', authInfo.extra.userId);

          if (projectsError) {
            return {
              content: [{
                type: 'text',
                text: `Error fetching user projects: ${projectsError.message}`
              }]
            };
          }

          if (!userProjects || userProjects.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No projects found for this user'
              }]
            };
          }

          const projectIds = userProjects.map(up => up.project_id);

          const { data: projects, error } = await client
            .from('projects')
            .select('id, name, description, created_at')
            .in('id', projectIds)
            .order('created_at', { ascending: false });

          if (error) {
            return {
              content: [{
                type: 'text',
                text: `Error fetching projects: ${error.message}`
              }]
            };
          }

          const projectList = (projects || []).map(project =>
            `- ${project.name} (ID: ${project.id})`
          ).join('\n');

          console.log('📤 MCP TOOL: list_projects success');

          return {
            content: [{
              type: 'text',
              text: `Available projects:\n${projectList}`
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: list_projects operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to list projects: ${errorMessage}`
            }]
          };
        }
      }
    );

    server.tool(
      'read',
      'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer. Use the project field to specify which project to read from.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.string().optional().describe('Optional node ID to read specific node details with all connections'),
        layer: z.string().optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'),
        includeProperties: z.boolean().optional().describe('Whether to include node properties in the response'),
      },
      async (params) => {
        console.log('🔍 MCP TOOL: read called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          // Extract API key from MANTA_API_KEY header only
          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';

          let projectId;

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // Resolve project name to project ID
          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            console.error('❌ Project lookup failed:', { projectName: params.project, error: projectError });
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          projectId = projectData.id;
          console.log('✅ Found project:', { name: params.project, id: projectId });

          // Call graph API directly with project ID
          const url = new URL(currentRequest.url);
          const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
          graphApiUrl.searchParams.set('graphType', 'current');
          graphApiUrl.searchParams.set('projectId', projectId);

          if (params.nodeId) {
            graphApiUrl.searchParams.set('nodeId', params.nodeId);
          }
          // Apply layer filtering if specified (defaults to 'system' if not provided)
          graphApiUrl.searchParams.set('layer', params.layer || 'system');

          // Always request XML format
          const acceptHeader = 'application/xml, application/json';

          console.log('🔍 Calling graph API:', graphApiUrl.toString());

          const graphResponse = await fetch(graphApiUrl.toString(), {
            headers: {
              'Accept': acceptHeader,
              'MANTA_API_KEY': apiKey,
            }
          });

          console.log('📊 Graph API response status:', graphResponse.status);

          if (!graphResponse.ok) {
            const errorText = await graphResponse.text();
            console.error('❌ Graph API error:', errorText);
            return {
              content: [{
                type: 'text',
                text: `Error: Failed to read graph (${graphResponse.status}): ${errorText}`
              }]
            };
          }

          // Always return as text (XML or formatted text for specific nodes)
          const content = await graphResponse.text();

          console.log('📄 Graph content length:', content.length, 'characters');
          if (content.length < 100) {
            console.log('📄 Graph content preview:', content.substring(0, 100));
          }

          console.log('📤 MCP TOOL: read success');

          return {
            content: [{
              type: 'text',
              text: content
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: read operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to read graph: ${errorMessage}`
            }]
          };
        }
      }
    );
  },
  {},
  { basePath: '/api' },
);

// Create handler for ADMIN API keys - includes all tools
const adminHandler = createMcpHandler(
  (server) => {
    server.tool(
      'list_projects',
      'List all available projects for the authenticated user.',
      {},
      async () => {
        console.log('🔍 MCP TOOL: list_projects called');

        try {
          // Extract API key from MANTA_API_KEY header only
          const apiKey = currentRequest?.headers.get('MANTA_API_KEY') || '';

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // Get the authenticated user
          const authInfo = await verifyToken(currentRequest!, apiKey);
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          // Get all projects for the user
          const { data: userProjects, error: projectsError } = await client
            .from('user_projects')
            .select('project_id, role')
            .eq('user_id', authInfo.extra.userId);

          if (projectsError) {
            return {
              content: [{
                type: 'text',
                text: `Error fetching user projects: ${projectsError.message}`
              }]
            };
          }

          if (!userProjects || userProjects.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No projects found for this user'
              }]
            };
          }

          const projectIds = userProjects.map(up => up.project_id);

          const { data: projects, error } = await client
            .from('projects')
            .select('id, name, description, created_at')
            .in('id', projectIds)
            .order('created_at', { ascending: false });

          if (error) {
            return {
              content: [{
                type: 'text',
                text: `Error fetching projects: ${error.message}`
              }]
            };
          }

          const projectList = (projects || []).map(project =>
            `- ${project.name} (ID: ${project.id})`
          ).join('\n');

          console.log('📤 MCP TOOL: list_projects success');

          return {
            content: [{
              type: 'text',
              text: `Available projects:\n${projectList}`
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: list_projects operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to list projects: ${errorMessage}`
            }]
          };
        }
      }
    );

    server.tool(
      'read',
      'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer. Use the project field to specify which project to read from.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.string().optional().describe('Optional node ID to read specific node details with all connections'),
        layer: z.string().optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'),
        includeProperties: z.boolean().optional().describe('Whether to include node properties in the response'),
      },
      async (params) => {
        console.log('🔍 MCP TOOL: read called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          // Extract API key from MANTA_API_KEY header only
          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';

          let projectId;

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // Resolve project name to project ID
          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            console.error('❌ Project lookup failed:', { projectName: params.project, error: projectError });
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          projectId = projectData.id;
          console.log('✅ Found project:', { name: params.project, id: projectId });

          // Call graph API directly with project ID
          const url = new URL(currentRequest.url);
          const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
          graphApiUrl.searchParams.set('graphType', 'current');
          graphApiUrl.searchParams.set('projectId', projectId);

          if (params.nodeId) {
            graphApiUrl.searchParams.set('nodeId', params.nodeId);
          }
          // Apply layer filtering if specified (defaults to 'system' if not provided)
          graphApiUrl.searchParams.set('layer', params.layer || 'system');

          // Always request XML format
          const acceptHeader = 'application/xml, application/json';

          console.log('🔍 Calling graph API:', graphApiUrl.toString());

          const graphResponse = await fetch(graphApiUrl.toString(), {
            headers: {
              'Accept': acceptHeader,
              'MANTA_API_KEY': apiKey,
            }
          });

          console.log('📊 Graph API response status:', graphResponse.status);

          if (!graphResponse.ok) {
            const errorText = await graphResponse.text();
            console.error('❌ Graph API error:', errorText);
            return {
              content: [{
                type: 'text',
                text: `Error: Failed to read graph (${graphResponse.status}): ${errorText}`
              }]
            };
          }

          // Always return as text (XML or formatted text for specific nodes)
          const content = await graphResponse.text();

          console.log('📄 Graph content length:', content.length, 'characters');
          if (content.length < 100) {
            console.log('📄 Graph content preview:', content.substring(0, 100));
          }

          console.log('📤 MCP TOOL: read success');

          return {
            content: [{
              type: 'text',
              text: content
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: read operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to read graph: ${errorMessage}`
            }]
          };
        }
      }
    );

    // edge_create
    server.tool(
      'edge_create',
      'Create a connection (edge) between two nodes in the graph.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        sourceId: z.string().min(1, 'Source node ID is required'),
        targetId: z.string().min(1, 'Target node ID is required'),
        role: z.string().optional(),
        shape: z.enum(['refines', 'relates']).optional().describe('The semantic relationship type: "refines" for hierarchical connections, "relates" for same-level connections'),
      },
      async (params) => {
        console.log('🔗 MCP TOOL: edge_create called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // Resolve project name to project ID
          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.edgeCreate({
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            sourceId: params.sourceId,
            targetId: params.targetId,
            role: params.role,
            shape: params.shape
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          const responseText = result.content?.text || 'Edge created successfully';
          const finalText = result.edgeId ? `${responseText} (ID: ${result.edgeId})` : responseText;
          return {
            content: [{
              type: 'text',
              text: finalText
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: edge_create operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to create edge: ${errorMessage}`
            }]
          };
        }
      }
    );

    // edge_delete
    server.tool(
      'edge_delete',
      'Delete a connection (edge) between two nodes in the graph.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        sourceId: z.string().min(1, 'Source node ID is required'),
        targetId: z.string().min(1, 'Target node ID is required'),
      },
      async (params) => {
        console.log('🗑️ MCP TOOL: edge_delete called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.edgeDelete({
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            sourceId: params.sourceId,
            targetId: params.targetId
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: result.content?.text || 'Edge deleted successfully'
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: edge_delete operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to delete edge: ${errorMessage}`
            }]
          };
        }
      }
    );

    // node_create
    server.tool(
      'node_create',
      'Create a new node and persist it to the graph.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
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
      async (params) => {
        console.log('➕ MCP TOOL: node_create called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.nodeCreate({
            nodeId: params.nodeId,
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            title: params.title,
            prompt: params.prompt,
            type: params.type,
            level: params.level,
            comment: params.comment,
            properties: params.properties,
            position: params.position,
            metadata: params.metadata
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          const responseText = result.content?.text || 'Node created successfully';
          const finalText = result.nodeId ? `${responseText} (ID: ${result.nodeId})` : responseText;
          return {
            content: [{
              type: 'text',
              text: finalText
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: node_create operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to create node: ${errorMessage}`
            }]
          };
        }
      }
    );

    // node_edit
    server.tool(
      'node_edit',
      'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
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
      async (params) => {
        console.log('✏️ MCP TOOL: node_edit called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.nodeEdit({
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            nodeId: params.nodeId,
            mode: params.mode,
            title: params.title,
            prompt: params.prompt,
            description: params.prompt, // Map prompt to description
            type: params.type,
            level: params.level,
            comment: params.comment,
            properties: params.properties,
            children: params.children,
            position: params.position,
            metadata: params.metadata
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: result.content?.text || 'Node edited successfully'
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: node_edit operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to edit node: ${errorMessage}`
            }]
          };
        }
      }
    );

    // node_metadata_update
    server.tool(
      'node_metadata_update',
      'Update metadata for a node, including implementation file references and bug tracking.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.string().min(1),
        files: z.array(z.string().min(1)).optional().describe('Project-relative file paths to associate with this node.'),
        bugs: z.array(z.string().min(1)).optional().describe('List of bugs that need to be fixed for this node.'),
        merge: z.boolean().optional().describe('If true, merge with existing metadata instead of replacing it.'),
      },
      async (params) => {
        console.log('🗂️ MCP TOOL: node_metadata_update called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.nodeMetadataUpdate({
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            nodeId: params.nodeId,
            files: params.files,
            bugs: params.bugs,
            merge: params.merge || false
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: result.content?.text || 'Metadata updated successfully'
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: node_metadata_update operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to update metadata: ${errorMessage}`
            }]
          };
        }
      }
    );

    // node_delete
    server.tool(
      'node_delete',
      'Delete a node by id.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.string().min(1),
        recursive: z.boolean().optional().default(true)
      },
      async (params) => {
        console.log('🗑️ MCP TOOL: node_delete called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.nodeDelete({
            userId: String(authInfo.extra.userId),
            projectId: projectData.id,
            nodeId: params.nodeId,
            recursive: params.recursive
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: result.content?.text || 'Node deleted successfully'
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: node_delete operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to delete node: ${errorMessage}`
            }]
          };
        }
      }
    );

    // graph_clear
    server.tool(
      'graph_clear',
      'Fully clear the graph, leaving only empty nodes and edges tags, and outer structure.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
      },
      async (params) => {
        console.log('🧹 MCP TOOL: graph_clear called', params);

        try {
          if (!currentRequest) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No request context available'
              }]
            };
          }

          const apiKey = currentRequest.headers.get('MANTA_API_KEY') || '';
          const authInfo = await verifyToken(currentRequest, apiKey);
          
          if (!authInfo?.extra?.userId) {
            return {
              content: [{
                type: 'text',
                text: 'Error: Unable to authenticate user'
              }]
            };
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          const { data: projectData, error: projectError } = await client
            .from('projects')
            .select('id')
            .eq('name', params.project)
            .single();

          if (projectError || !projectData) {
            return {
              content: [{
                type: 'text',
                text: `Error: Project "${params.project}" not found`
              }]
            };
          }

          const result = await graphOperations.graphClear({ 
            userId: String(authInfo.extra.userId), 
            projectId: projectData.id 
          });

          if (!result.success) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: result.content?.text || 'Graph cleared successfully'
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('💥 MCP TOOL: graph_clear operation error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to clear graph: ${errorMessage}`
            }]
          };
        }
      }
    );
  },
  {},
  { basePath: '/api' },
);

// Custom authentication wrapper that handles MANTA_API_KEY header
async function customAuthHandler(request: Request) {
  // Extract API key from MANTA_API_KEY header
  const apiKey = request.headers.get('MANTA_API_KEY');

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'invalid_token',
        error_description: 'No authorization provided'
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Verify the API key
  const authInfo = await verifyToken(request, apiKey);

  if (!authInfo) {
    return new Response(
      JSON.stringify({
        error: 'invalid_token',
        error_description: 'Invalid API key'
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Set the current request for use in tool handlers
  currentRequest = request;

  // Route to the appropriate handler based on API key type
  const isAdmin = checkAdminPermission(authInfo);
  const handler = isAdmin ? adminHandler : userHandler;

  console.log(`🔑 Using ${isAdmin ? 'ADMIN' : 'USER'} handler for API key type: ${authInfo.extra?.keyType}`);

  // Call the appropriate handler
  return handler(request);
}

export { customAuthHandler as GET, customAuthHandler as POST, customAuthHandler as DELETE };
