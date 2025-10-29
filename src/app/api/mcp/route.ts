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
      'Read from current graph, or specific node(s) with their connections. Supports batching: pass a single nodeId/layer or arrays for batch operations. Use the project field to specify which project to read from.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.union([z.string(), z.array(z.string())]).optional().describe('Optional node ID(s) to read specific node details with all connections. Accepts a single string or an array of strings for batch reading'),
        layer: z.union([z.string(), z.array(z.string())]).optional().describe('Optional C4 architectural layer filter(s): "system", "container", "component", or "code". Accepts a single string or array for reading multiple layers (defaults to "system")'),
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

          // Handle batching for nodeIds and layers
          const nodeIds = Array.isArray(params.nodeId) ? params.nodeId : (params.nodeId ? [params.nodeId] : undefined);
          const layers = Array.isArray(params.layer) ? params.layer : (params.layer ? [params.layer] : ['system']);

          // If batching, make multiple requests
          if ((nodeIds && nodeIds.length > 1) || layers.length > 1) {
            const results: string[] = [];
            
            // For multiple layers without specific nodes
            if (!nodeIds || nodeIds.length === 0) {
              for (const layer of layers) {
                const url = new URL(currentRequest.url);
                const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
                graphApiUrl.searchParams.set('graphType', 'current');
                graphApiUrl.searchParams.set('projectId', projectId);
                graphApiUrl.searchParams.set('layer', layer);

                const graphResponse = await fetch(graphApiUrl.toString(), {
                  headers: {
                    'Accept': 'application/xml, application/json',
                    'MANTA_API_KEY': apiKey,
                  }
                });

                if (graphResponse.ok) {
                  const content = await graphResponse.text();
                  results.push(`=== Layer: ${layer} ===\n${content}\n`);
                }
              }
            } else {
              // For multiple nodes across layers
              for (const nodeId of nodeIds) {
                for (const layer of layers) {
                  const url = new URL(currentRequest.url);
                  const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
                  graphApiUrl.searchParams.set('graphType', 'current');
                  graphApiUrl.searchParams.set('projectId', projectId);
                  graphApiUrl.searchParams.set('nodeId', nodeId);
                  graphApiUrl.searchParams.set('layer', layer);

                  const graphResponse = await fetch(graphApiUrl.toString(), {
                    headers: {
                      'Accept': 'application/xml, application/json',
                      'MANTA_API_KEY': apiKey,
                    }
                  });

                  if (graphResponse.ok) {
                    const content = await graphResponse.text();
                    results.push(`=== Node: ${nodeId}, Layer: ${layer} ===\n${content}\n`);
                  }
                }
              }
            }

            console.log('📤 MCP TOOL: read batch success');
            return {
              content: [{
                type: 'text',
                text: results.join('\n')
              }]
            };
          }

          // Single request path
          const url = new URL(currentRequest.url);
          const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
          graphApiUrl.searchParams.set('graphType', 'current');
          graphApiUrl.searchParams.set('projectId', projectId);

          if (nodeIds && nodeIds.length === 1) {
            graphApiUrl.searchParams.set('nodeId', nodeIds[0]);
          }
          graphApiUrl.searchParams.set('layer', layers[0]);

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
      'Read from current graph, or specific node(s) with their connections. Supports batching: pass a single nodeId/layer or arrays for batch operations. Use the project field to specify which project to read from.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeId: z.union([z.string(), z.array(z.string())]).optional().describe('Optional node ID(s) to read specific node details with all connections. Accepts a single string or an array of strings for batch reading'),
        layer: z.union([z.string(), z.array(z.string())]).optional().describe('Optional C4 architectural layer filter(s): "system", "container", "component", or "code". Accepts a single string or array for reading multiple layers (defaults to "system")'),
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

          // Handle batching for nodeIds and layers
          const nodeIds = Array.isArray(params.nodeId) ? params.nodeId : (params.nodeId ? [params.nodeId] : undefined);
          const layers = Array.isArray(params.layer) ? params.layer : (params.layer ? [params.layer] : ['system']);

          // If batching, make multiple requests
          if ((nodeIds && nodeIds.length > 1) || layers.length > 1) {
            const results: string[] = [];
            
            // For multiple layers without specific nodes
            if (!nodeIds || nodeIds.length === 0) {
              for (const layer of layers) {
                const url = new URL(currentRequest.url);
                const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
                graphApiUrl.searchParams.set('graphType', 'current');
                graphApiUrl.searchParams.set('projectId', projectId);
                graphApiUrl.searchParams.set('layer', layer);

                const graphResponse = await fetch(graphApiUrl.toString(), {
                  headers: {
                    'Accept': 'application/xml, application/json',
                    'MANTA_API_KEY': apiKey,
                  }
                });

                if (graphResponse.ok) {
                  const content = await graphResponse.text();
                  results.push(`=== Layer: ${layer} ===\n${content}\n`);
                }
              }
            } else {
              // For multiple nodes across layers
              for (const nodeId of nodeIds) {
                for (const layer of layers) {
                  const url = new URL(currentRequest.url);
                  const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
                  graphApiUrl.searchParams.set('graphType', 'current');
                  graphApiUrl.searchParams.set('projectId', projectId);
                  graphApiUrl.searchParams.set('nodeId', nodeId);
                  graphApiUrl.searchParams.set('layer', layer);

                  const graphResponse = await fetch(graphApiUrl.toString(), {
                    headers: {
                      'Accept': 'application/xml, application/json',
                      'MANTA_API_KEY': apiKey,
                    }
                  });

                  if (graphResponse.ok) {
                    const content = await graphResponse.text();
                    results.push(`=== Node: ${nodeId}, Layer: ${layer} ===\n${content}\n`);
                  }
                }
              }
            }

            console.log('📤 MCP TOOL: read batch success');
            return {
              content: [{
                type: 'text',
                text: results.join('\n')
              }]
            };
          }

          // Single request path
          const url = new URL(currentRequest.url);
          const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
          graphApiUrl.searchParams.set('graphType', 'current');
          graphApiUrl.searchParams.set('projectId', projectId);

          if (nodeIds && nodeIds.length === 1) {
            graphApiUrl.searchParams.set('nodeId', nodeIds[0]);
          }
          graphApiUrl.searchParams.set('layer', layers[0]);

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
      'Create connection(s) (edge) between nodes in the graph. Supports batching: pass single edge properties or an array of edge objects for batch creation.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        edges: z.array(z.object({
          sourceId: z.string().min(1, 'Source node ID is required'),
          targetId: z.string().min(1, 'Target node ID is required'),
          role: z.string().optional(),
          shape: z.enum(['refines', 'relates']).optional().describe('The semantic relationship type: "refines" for hierarchical connections, "relates" for same-level connections'),
        })).optional().describe('Array of edge objects for batch creation. If provided, sourceId/targetId/role/shape at root level are ignored'),
        sourceId: z.string().optional().describe('Source node ID (used only if edges array is not provided)'),
        targetId: z.string().optional().describe('Target node ID (used only if edges array is not provided)'),
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

          // Normalize to array format
          const edgesToCreate = params.edges || (params.sourceId && params.targetId ? [{
            sourceId: params.sourceId,
            targetId: params.targetId,
            role: params.role,
            shape: params.shape
          }] : []);

          if (edgesToCreate.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No edges specified. Provide either edges array or sourceId/targetId'
              }]
            };
          }

          // Handle batch creation
          const results: string[] = [];
          const errors: string[] = [];

          for (const edge of edgesToCreate) {
            const result = await graphOperations.edgeCreate({
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              sourceId: edge.sourceId,
              targetId: edge.targetId,
              role: edge.role,
              shape: edge.shape
            });

            if (result.success) {
              const responseText = result.content?.text || 'Edge created successfully';
              const finalText = result.edgeId ? `${responseText} (ID: ${result.edgeId})` : responseText;
              results.push(`✓ ${edge.sourceId} → ${edge.targetId}: ${finalText}`);
            } else {
              errors.push(`✗ ${edge.sourceId} → ${edge.targetId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch edge creation completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
      'Delete connection(s) (edge) between nodes in the graph. Supports batching: pass single edge properties or an array of edge objects for batch deletion.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        edges: z.array(z.object({
          sourceId: z.string().min(1, 'Source node ID is required'),
          targetId: z.string().min(1, 'Target node ID is required'),
        })).optional().describe('Array of edge objects for batch deletion. If provided, sourceId/targetId at root level are ignored'),
        sourceId: z.string().optional().describe('Source node ID (used only if edges array is not provided)'),
        targetId: z.string().optional().describe('Target node ID (used only if edges array is not provided)'),
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

          // Normalize to array format
          const edgesToDelete = params.edges || (params.sourceId && params.targetId ? [{
            sourceId: params.sourceId,
            targetId: params.targetId,
          }] : []);

          if (edgesToDelete.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No edges specified. Provide either edges array or sourceId/targetId'
              }]
            };
          }

          // Handle batch deletion
          const results: string[] = [];
          const errors: string[] = [];

          for (const edge of edgesToDelete) {
            const result = await graphOperations.edgeDelete({
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              sourceId: edge.sourceId,
              targetId: edge.targetId
            });

            if (result.success) {
              const responseText = result.content?.text || 'Edge deleted successfully';
              results.push(`✓ ${edge.sourceId} → ${edge.targetId}: ${responseText}`);
            } else {
              errors.push(`✗ ${edge.sourceId} → ${edge.targetId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch edge deletion completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
      'Create node(s) and persist to the graph. Supports batching: pass single node properties or an array of node objects for batch creation.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodes: z.array(z.object({
          nodeId: z.string().min(1),
          title: z.string().min(1),
          description: z.string().optional().describe('Description or purpose of the node'),
          type: NodeTypeEnum.describe('The node type: system, container, component, or code'),
          level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
          properties: z.array(PropertySchema).optional(),
          position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
          metadata: MetadataInputSchema.optional(),
        })).optional().describe('Array of node objects for batch creation. If provided, nodeId/title/etc at root level are ignored'),
        nodeId: z.string().optional().describe('Node ID (used only if nodes array is not provided)'),
        title: z.string().optional().describe('Node title (used only if nodes array is not provided)'),
        description: z.string().optional().describe('Description or purpose of the node'),
        type: NodeTypeEnum.optional().describe('The node type: system, container, component, or code'),
        level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
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

          // Normalize to array format
          const nodesToCreate = params.nodes || (params.nodeId && params.title && params.type ? [{
            nodeId: params.nodeId,
            title: params.title,
            description: params.description,
            type: params.type,
            level: params.level,
            properties: params.properties,
            position: params.position,
            metadata: params.metadata
          }] : []);

          if (nodesToCreate.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No nodes specified. Provide either nodes array or nodeId/title/type'
              }]
            };
          }

          // Handle batch creation
          const results: string[] = [];
          const errors: string[] = [];

          for (const node of nodesToCreate) {
            const result = await graphOperations.nodeCreate({
              nodeId: node.nodeId,
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              title: node.title,
              description: node.description,
              type: node.type,
              level: node.level,
              properties: node.properties,
              position: node.position,
              metadata: node.metadata
            });

            if (result.success) {
              const responseText = result.content?.text || 'Node created successfully';
              const finalText = result.nodeId ? `${responseText} (ID: ${result.nodeId})` : responseText;
              results.push(`✓ ${node.nodeId}: ${finalText}`);
            } else {
              errors.push(`✗ ${node.nodeId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch node creation completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
      'Edit node(s) with two modes: replace (fully replaces node) or merge (merges properties with existing data). Supports batching: pass single node properties or an array of node edit objects.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodes: z.array(z.object({
          nodeId: z.string().min(1),
          mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
          title: z.string().optional(),
          description: z.string().optional(),
          type: NodeTypeEnum.optional().describe('The node type: system, container, component, or code'),
          level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
          properties: z.array(PropertySchema).optional(),
          children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
          position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
          metadata: MetadataInputSchema.optional(),
        })).optional().describe('Array of node edit objects for batch editing. If provided, nodeId/mode/etc at root level are ignored'),
        nodeId: z.string().optional().describe('Node ID (used only if nodes array is not provided)'),
        mode: z.enum(['replace', 'merge']).optional().describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
        title: z.string().optional(),
        description: z.string().optional(),
        type: NodeTypeEnum.optional().describe('The node type: system, container, component, or code'),
        level: C4LevelEnum.optional().describe('The C4 model level for architectural elements: system, container, component, or code'),
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

          // Normalize to array format
          const nodesToEdit = params.nodes || (params.nodeId ? [{
            nodeId: params.nodeId,
            mode: params.mode || 'replace',
            title: params.title,
            description: params.description,
            type: params.type,
            level: params.level,
            properties: params.properties,
            children: params.children,
            position: params.position,
            metadata: params.metadata
          }] : []);

          if (nodesToEdit.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No nodes specified. Provide either nodes array or nodeId'
              }]
            };
          }

          // Handle batch editing
          const results: string[] = [];
          const errors: string[] = [];

          for (const node of nodesToEdit) {
            const result = await graphOperations.nodeEdit({
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              nodeId: node.nodeId,
              mode: node.mode,
              title: node.title,
              description: node.description,
              type: node.type,
              level: node.level,
              properties: node.properties,
              children: node.children,
              position: node.position,
              metadata: node.metadata
            });

            if (result.success) {
              const responseText = result.content?.text || 'Node edited successfully';
              results.push(`✓ ${node.nodeId}: ${responseText}`);
            } else {
              errors.push(`✗ ${node.nodeId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch node editing completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
      'Update metadata for node(s), including implementation file references and bug tracking. Supports batching: pass single node properties or an array of metadata update objects.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodes: z.array(z.object({
          nodeId: z.string().min(1),
          files: z.array(z.string().min(1)).optional().describe('Project-relative file paths to associate with this node.'),
          bugs: z.array(z.string().min(1)).optional().describe('List of bugs that need to be fixed for this node.'),
          merge: z.boolean().optional().describe('If true, merge with existing metadata instead of replacing it.'),
        })).optional().describe('Array of metadata update objects for batch updates. If provided, nodeId/files/bugs at root level are ignored'),
        nodeId: z.string().optional().describe('Node ID (used only if nodes array is not provided)'),
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

          // Normalize to array format
          const nodesToUpdate = params.nodes || (params.nodeId ? [{
            nodeId: params.nodeId,
            files: params.files,
            bugs: params.bugs,
            merge: params.merge
          }] : []);

          if (nodesToUpdate.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No nodes specified. Provide either nodes array or nodeId'
              }]
            };
          }

          // Handle batch updates
          const results: string[] = [];
          const errors: string[] = [];

          for (const node of nodesToUpdate) {
            const result = await graphOperations.nodeMetadataUpdate({
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              nodeId: node.nodeId,
              files: node.files,
              bugs: node.bugs,
              merge: node.merge || false
            });

            if (result.success) {
              const responseText = result.content?.text || 'Metadata updated successfully';
              results.push(`✓ ${node.nodeId}: ${responseText}`);
            } else {
              errors.push(`✗ ${node.nodeId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch metadata update completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
      'Delete node(s) by id. Supports batching: pass single nodeId or an array of nodeIds/objects for batch deletion.',
      {
        project: z.string().describe('REQUIRED: Project name as it appears in your Manta projects'),
        nodeIds: z.union([
          z.string().min(1),
          z.array(z.string().min(1)),
          z.array(z.object({
            nodeId: z.string().min(1),
            recursive: z.boolean().optional().default(true)
          }))
        ]).optional().describe('Node ID(s) to delete. Accepts a single string, array of strings, or array of objects with nodeId and recursive flag. If provided, nodeId at root level is ignored'),
        nodeId: z.string().optional().describe('Node ID (used only if nodeIds is not provided)'),
        recursive: z.boolean().optional().default(true).describe('If true, recursively delete child nodes')
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

          // Normalize to array format
          let nodesToDelete: Array<{ nodeId: string; recursive: boolean }> = [];
          
          if (params.nodeIds) {
            if (typeof params.nodeIds === 'string') {
              nodesToDelete = [{ nodeId: params.nodeIds, recursive: params.recursive ?? true }];
            } else if (Array.isArray(params.nodeIds)) {
              if (params.nodeIds.length > 0 && typeof params.nodeIds[0] === 'string') {
                nodesToDelete = (params.nodeIds as string[]).map(id => ({ 
                  nodeId: id, 
                  recursive: params.recursive ?? true 
                }));
              } else {
                nodesToDelete = params.nodeIds as Array<{ nodeId: string; recursive: boolean }>;
              }
            }
          } else if (params.nodeId) {
            nodesToDelete = [{ nodeId: params.nodeId, recursive: params.recursive ?? true }];
          }

          if (nodesToDelete.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'Error: No nodes specified. Provide either nodeIds or nodeId'
              }]
            };
          }

          // Handle batch deletion
          const results: string[] = [];
          const errors: string[] = [];

          for (const node of nodesToDelete) {
            const result = await graphOperations.nodeDelete({
              userId: String(authInfo.extra.userId),
              projectId: projectData.id,
              nodeId: node.nodeId,
              recursive: node.recursive
            });

            if (result.success) {
              const responseText = result.content?.text || 'Node deleted successfully';
              results.push(`✓ ${node.nodeId}: ${responseText}`);
            } else {
              errors.push(`✗ ${node.nodeId}: ${result.error}`);
            }
          }

          const summary = [
            `Batch node deletion completed: ${results.length} succeeded, ${errors.length} failed`,
            ...results,
            ...errors
          ].join('\n');

          return {
            content: [{
              type: 'text',
              text: summary
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
