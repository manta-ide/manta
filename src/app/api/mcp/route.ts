import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { auth } from '@clerk/nextjs/server';
import { graphOperations } from '../lib/graph-service';

const verifyToken = async (
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  try {
    // Try to authenticate with Clerk first
    const { userId } = await auth();

    if (userId) {
      return {
        token: `clerk-${userId}`,
        scopes: ['read:graph', 'write:graph'],
        clientId: 'manta-client',
        extra: {
          userId: userId,
        },
      };
    }

    // Fallback to MCP access token for backward compatibility
    if (bearerToken && bearerToken === process.env.MCP_ACCESS_TOKEN) {
      return {
        token: bearerToken,
        scopes: ['read:graph', 'write:graph'],
        clientId: 'manta-client',
        extra: {
          userId: 'default-user', // Use default user for token-based auth
        },
      };
    }

    return undefined;
  } catch (error) {
    console.error('MCP authentication error:', error);
    return undefined;
  }
};

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'read',
      'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer.',
      {
        nodeId: z.string().optional().describe('Optional node ID to read specific node details'),
        layer: z.string().optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'),
        includeProperties: z.boolean().optional().describe('Whether to include node properties in the response')
      },
      async (params) => {
        console.log('🔍 MCP TOOL: read called', params);

        try {
          const result = await graphOperations.read(params);

          if (!result.success) {
            console.error('❌ MCP TOOL: read error:', result.error);
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          console.log('📤 MCP TOOL: read success');

          if (params.nodeId) {
            // When nodeId is specified, return the full node details
            return {
              content: [{
                type: 'text',
                text: `Node Details:\n${JSON.stringify(result.node, null, 2)}`
              }]
            };
          } else {
            // When reading layers, return the grouped structure
            const layerInfo = params.layer || 'system';
            return {
              content: [{
                type: 'text',
                text: `Graph Layers (${layerInfo}):\n${JSON.stringify(result.layers, null, 2)}`
              }]
            };
          }
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

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ['read:graph'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
