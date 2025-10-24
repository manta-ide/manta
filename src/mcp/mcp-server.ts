import { createMCPServer } from 'mcp-use/server';

// Create MCP server instance
const server = createMCPServer('manta-graph-reader', {
  version: '1.0.0',
  description: 'Read-only MCP server for Manta graph operations'
});

// Base URL for the local API (can be configured via environment)
const baseUrl = process.env.MANTA_BASE_URL || 'http://localhost:3002';


// Read tool - Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer.
server.tool({
  name: 'read',
  description: 'Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer.',
  inputs: [
    {
      name: 'nodeId',
      type: 'string',
      required: false,
      description: 'Optional node ID to read specific node details'
    },
    {
      name: 'layer',
      type: 'string',
      required: false,
      description: 'Optional C4 architectural layer filter: "system", "container", "component", or "code" (defaults to "system")'
    },
    {
      name: 'includeProperties',
      type: 'boolean',
      required: false,
      description: 'Whether to include node properties in the response'
    },
    {
      name: 'includeChildren',
      type: 'boolean',
      required: false,
      description: 'Whether to include child nodes in the response'
    }
  ],
  cb: async (params) => {
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
});

// Analyze diff tool - Analyze differences between current graph and base graph
server.tool({
  name: 'analyze_diff',
  description: 'Analyze differences between current graph and base graph to see what changes need to be made. Can analyze entire graph or focus on a specific node.',
  inputs: [
    {
      name: 'nodeId',
      type: 'string',
      required: false,
      description: 'Optional node ID to analyze differences for. If not provided, analyzes the entire graph.'
    }
  ],
  cb: async (params) => {
    console.log('🔍 MCP TOOL: analyze_diff called', params);

    try {
      const response = await fetch(`${baseUrl}/api/graph-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze_diff',
          nodeId: params.nodeId
        })
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        console.error('❌ MCP TOOL: analyze_diff API error:', result.error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${result.error}`
          }]
        };
      }

      console.log('📤 MCP TOOL: analyze_diff API success');
      return {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 MCP TOOL: analyze_diff API call error:', errorMessage);
      return {
        content: [{
          type: 'text',
          text: `Error: Failed to analyze diff via API: ${errorMessage}`
        }]
      };
    }
  }
});

// Resource for graph configuration
server.resource({
  name: 'graph-config',
  uri: 'config://graph',
  mimeType: 'application/json',
  description: 'Graph configuration and available operations',
  readCallback: async () => ({
    contents: [{
      uri: 'config://graph',
      mimeType: 'application/json',
      text: JSON.stringify({
        baseUrl,
        availableOperations: ['read', 'analyze_diff'],
        graphType: 'current',
        layers: ['system', 'container', 'component', 'code'],
        description: 'Read-only MCP server for Manta current graph operations'
      }, null, 2)
    }]
  })
});

// Start the server
const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3001;
server.listen(PORT);
console.log(`🚀 Manta Graph Reader MCP Server running on port ${PORT}`);
console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
console.log(`🔍 Inspector UI: http://localhost:${PORT}/inspector`);
