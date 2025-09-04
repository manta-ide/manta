import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Utility to resolve base URL for API calls
function resolveBaseUrl(override?: string): string {
  return (
    override ||
    process.env.MANTA_API_BASE_URL ||
    process.env.MANTA_BASE_URL ||
    process.env.MCP_GRAPH_API_BASE_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

// Resolve access token from input or env
function resolveAccessToken(override?: string): string | undefined {
  return (
    override ||
    process.env.MANTA_API_KEY ||
    process.env.MCP_ACCESS_TOKEN ||
    process.env.MCP_BEARER_TOKEN ||
    undefined
  );
}

function buildAuthHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// Simple HTTP helpers that send Bearer on every request
async function httpGet(url: string, token?: string) {
  const res = await fetch(url, { method: 'GET', headers: buildAuthHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

async function httpPost(url: string, body: any, token?: string) {
  const res = await fetch(url, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

// Create an MCP server focused on graph reads
const server = new McpServer({ name: "graph-server", version: "1.0.0" });

// Tool: read full graph (authenticated)
server.registerTool(
  "graph_read",
  {
    title: "Read Graph",
    description: "Fetch the full graph via the authenticated backend API. Sends Bearer on every request.",
    inputSchema: {
      // userId is not used by the backend endpoint; access is determined by the token's subject.
      userId: z.string().optional(),
      includeEdges: z.boolean().optional().default(true),
      accessToken: z.string().optional(),
    },
  },
  async ({ includeEdges, accessToken }) => {
    const origin = resolveBaseUrl();
    const token = resolveAccessToken(accessToken);
    const url = `${origin}/api/backend/graph-api`;
    const data = await httpGet(url, token);
    // Optionally strip edges if requested
    if (data?.graph && includeEdges === false) {
      const { graph } = data;
      if (graph.edges) delete graph.edges;
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data.graph ?? data, null, 2) }] };
  }
);

// Tool: read unbuilt node ids (authenticated)
server.registerTool(
  "graph_unbuilt",
  {
    title: "Unbuilt Node IDs",
    description: "Fetch IDs of nodes that are not built via authenticated backend API.",
    inputSchema: {
      userId: z.string().optional(),
      accessToken: z.string().optional(),
    },
  },
  async ({ accessToken }) => {
    const origin = resolveBaseUrl();
    const token = resolveAccessToken(accessToken);
    const url = `${origin}/api/backend/graph-api?unbuilt=true`;
    const data = await httpGet(url, token);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool: read a specific node (authenticated)
server.registerTool(
  "graph_node",
  {
    title: "Read Graph Node",
    description: "Fetch a specific node by id via authenticated backend API.",
    inputSchema: {
      nodeId: z.string().min(1, "nodeId is required"),
      accessToken: z.string().optional(),
    },
  },
  async ({ nodeId, accessToken }) => {
    const origin = resolveBaseUrl();
    const token = resolveAccessToken(accessToken);
    const url = `${origin}/api/backend/graph-api`;
    const data = await httpPost(url, { nodeId }, token);
    return { content: [{ type: 'text', text: JSON.stringify(data.node ?? data, null, 2) }] };
  }
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
