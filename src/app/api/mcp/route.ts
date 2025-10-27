import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const verifyToken = async (
  req: Request,
  apiKey?: string,
): Promise<AuthInfo | undefined> => {
  try {
    // Check for API key authentication via MANTA-API-KEY header
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
        .select('user_id, name')
        .eq('key_hash', keyHash)
        .single();

      if (!error && apiKeyData) {
        return {
          token: `api-key-${apiKeyData.user_id}`,
          scopes: ['read:graph', 'write:graph'],
          clientId: 'manta-client',
          extra: {
            userId: apiKeyData.user_id,
            keyName: apiKeyData.name,
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

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'read',
      'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer. Returns XML by default. Use the project field to specify which project to read from (GitHub format: username/repository).',
      {
        project: z.string().describe('Project name in GitHub format (username/repository), e.g., "primefaces/primereact".'),
        nodeId: z.string().optional().describe('Optional node ID to read specific node details'),
        layer: z.string().optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'),
        includeProperties: z.boolean().optional().describe('Whether to include node properties in the response'),
        format: z.enum(['json', 'xml']).optional().describe('Output format: "json" or "xml" (defaults to "xml")')
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

          // Extract API key from MANTA-API-KEY header only
          const apiKey = currentRequest.headers.get('manta-api-key') || '';

          let projectId;

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const client = createClient(supabaseUrl, supabaseServiceKey!);

          // If project is specified, resolve it to a project ID
          if (params.project) {
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

            projectId = projectData.id;
          } else {
            // Get the default/most recent project for the authenticated user
            const authInfo = await verifyToken(currentRequest, apiKey);
            if (!authInfo?.extra?.userId) {
              return {
                content: [{
                  type: 'text',
                  text: 'Error: Unable to authenticate user'
                }]
              };
            }

            const { data: userProjects, error: projectsError } = await client
              .from('user_projects')
              .select('project_id')
              .eq('user_id', authInfo.extra.userId)
              .order('created_at', { ascending: false })
              .limit(1);

            if (projectsError || !userProjects || userProjects.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'Error: No projects found for user'
                }]
              };
            }

            projectId = userProjects[0].project_id;
          }

          // Call graph API directly with project ID
          const url = new URL(currentRequest.url);
          const graphApiUrl = new URL(`${url.protocol}//${url.host}/api/graph-api`);
          graphApiUrl.searchParams.set('graphType', 'current');
          graphApiUrl.searchParams.set('projectId', projectId);

          if (params.nodeId) {
            graphApiUrl.searchParams.set('nodeId', params.nodeId);
          }
          // When reading a project, always use system layer only
          graphApiUrl.searchParams.set('layer', 'system');

          const acceptHeader = params.format === 'json' ? 'application/json' : 'application/xml, application/json';

          const graphResponse = await fetch(graphApiUrl.toString(), {
            headers: {
              'Accept': acceptHeader,
              'MANTA-API-KEY': apiKey,
            }
          });

          if (!graphResponse.ok) {
            const errorText = await graphResponse.text();
            return {
              content: [{
                type: 'text',
                text: `Error: Failed to read graph (${graphResponse.status}): ${errorText}`
              }]
            };
          }

          const content = params.format === 'json'
            ? JSON.stringify(await graphResponse.json(), null, 2)
            : await graphResponse.text();

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

// Custom authentication wrapper that handles MANTA-API-KEY header
async function customAuthHandler(request: Request) {
  // Extract API key from MANTA-API-KEY header
  const apiKey = request.headers.get('manta-api-key');

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

  // Call the handler (which should now work since we have auth)
  return handler(request);
}

export { customAuthHandler as GET, customAuthHandler as POST, customAuthHandler as DELETE };
