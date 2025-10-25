import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';

// Base URL for the local API (can be configured via environment)
const baseUrl = process.env.MANTA_BASE_URL || 'http://localhost:3002';


const handler = createMcpHandler(
  (server) => {
    server.tool(
      'read',
      'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer.',
      {
        nodeId: z.string().optional().describe('Optional node ID to read specific node details'),
        layer: z.string().optional().describe('Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'),
        includeProperties: z.boolean().optional().describe('Whether to include node properties in the response'),
        includeChildren: z.boolean().optional().describe('Whether to include child nodes in the response')
      },
      async (params) => {
        console.log('🔍 MCP TOOL: read called', params);

        try {
          const response = await fetch(`${baseUrl}/api/graph-api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'read',
              nodeId: params.nodeId,
              layer: params.layer, // Will default to 'system' in the API if not provided
              includeProperties: params.includeProperties,
              includeChildren: params.includeChildren
            })
          });

          const result = await response.json();

          if (!response.ok || result.error) {
            console.error('❌ MCP TOOL: read API error:', result.error);
            return {
              content: [{
                type: 'text',
                text: `Error: ${result.error}`
              }]
            };
          }

          console.log('📤 MCP TOOL: read API success');

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
          console.error('💥 MCP TOOL: read API call error:', errorMessage);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to read graph via API: ${errorMessage}`
            }]
          };
        }
      }
    );
  },
  {},
  { basePath: '/api' },
);

export { handler as GET, handler as POST, handler as DELETE };
