import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Utility to resolve base URL for API calls
function resolveBaseUrl(override?: string): string {
  return (
    override ||
    process.env.MCP_GRAPH_API_BASE_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

// Simple HTTP GET wrapper
async function httpGet(url: string) {
  const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

// Create an MCP server focused on graph reads
const server = new McpServer({ name: "graph-server", version: "1.0.0" });

// Tool: read full graph
server.registerTool(
  "graph_read",
  {
    title: "Read Graph",
    description: "Fetch the full graph for a user via the public API.",
    inputSchema: {
      userId: z.string().min(1, "userId is required"),
      includeEdges: z.boolean().optional().default(true),
      baseUrl: z.string().url().optional(),
    },
  },
  async ({ userId, includeEdges, baseUrl }) => {
    const origin = resolveBaseUrl(baseUrl);
    const url = `${origin}/api/public/graph?userId=${encodeURIComponent(userId)}`;
    const data = await httpGet(url);
    // Optionally strip edges if requested
    if (data?.graph && includeEdges === false) {
      const { graph } = data;
      if (graph.edges) delete graph.edges;
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data.graph ?? data, null, 2) }] };
  }
);

// Tool: read unbuilt node ids
server.registerTool(
  "graph_unbuilt",
  {
    title: "Unbuilt Node IDs",
    description: "Fetch IDs of nodes that are not built.",
    inputSchema: {
      userId: z.string().min(1, "userId is required"),
      baseUrl: z.string().url().optional(),
    },
  },
  async ({ userId, baseUrl }) => {
    const origin = resolveBaseUrl(baseUrl);
    const url = `${origin}/api/public/graph?userId=${encodeURIComponent(userId)}&unbuilt=true`;
    const data = await httpGet(url);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: read a specific node
server.registerTool(
  "graph_node",
  {
    title: "Read Graph Node",
    description: "Fetch a specific node by id.",
    inputSchema: {
      userId: z.string().min(1, "userId is required"),
      nodeId: z.string().min(1, "nodeId is required"),
      baseUrl: z.string().url().optional(),
    },
  },
  async ({ userId, nodeId, baseUrl }) => {
    const origin = resolveBaseUrl(baseUrl);
    const url = `${origin}/api/public/graph?userId=${encodeURIComponent(userId)}&nodeId=${encodeURIComponent(nodeId)}`;
    const data = await httpGet(url);
    return { content: [{ type: 'text', text: JSON.stringify(data.node ?? data, null, 2) }] };
  }
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
