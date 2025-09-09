import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs';
import path from 'node:path';
// Load shared schemas synchronously to avoid delaying MCP handshake
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let PropertySchema: any;
let GraphSchema: any;
try {
  const loaded = require('../../shared-schemas/dist/index.js');
  PropertySchema = loaded.PropertySchema;
  GraphSchema = loaded.GraphSchema;
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] loaded shared schemas');
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] WARN: shared schemas not built, falling back to minimal validators:', (e as any)?.message || e);
  PropertySchema = z.object({ id: z.string(), title: z.string(), type: z.string() }).passthrough();
  GraphSchema = z.object({ nodes: z.array(z.any()), edges: z.array(z.any()).optional() });
}

function resolveBaseUrl(): string {
  const url = process.env.MANTA_API_URL || process.env.BACKEND_URL || 'http://localhost:3000';
  const trimmed = url.replace(/\/$/, '');
  try { new URL(trimmed); } catch { return 'http://localhost:3000'; }
  return trimmed;
}
function resolveAccessToken(): string | undefined {
  return process.env.MANTA_API_KEY || process.env.MCP_ACCESS_TOKEN || process.env.MCP_BEARER_TOKEN || undefined;
}
function buildAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}
function withLocalhostFallback(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost') { u.hostname = '127.0.0.1'; return u.toString(); }
    if (u.hostname === '127.0.0.1') { u.hostname = 'localhost'; return u.toString(); }
  } catch {}
  return null;
}
async function httpGet(url: string, token?: string) {
  try {
    const res = await fetch(url, { method: 'GET', headers: buildAuthHeaders(token) });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] GET fallback: ${url} -> ${alt}`);
      const res = await fetch(alt, { method: 'GET', headers: buildAuthHeaders(token) });
      if (!res.ok) throw new Error(`GET ${alt} failed: ${res.status}`);
      return res.json() as any;
    }
    throw e;
  }
}
async function httpPost(url: string, body: any, token?: string) {
  try {
    const res = await fetch(url, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] POST fallback: ${url} -> ${alt}`);
      const res = await fetch(alt, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`POST ${alt} failed: ${res.status}`);
      return res.json() as any;
    }
      throw e;
  }
}
async function httpPut(url: string, body: any, token?: string) {
  try {
    const res = await fetch(url, { method: 'PUT', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] PUT fallback: ${url} -> ${alt}`);
      const res = await fetch(alt, { method: 'PUT', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`PUT ${alt} failed: ${res.status}`);
      return res.json() as any;
    }
    throw e;
  }
}

// Toolset is chosen at startup by the MCP based on env

export type Toolset = 'graph-editor' | 'read-only';

export function registerGraphTools(server: McpServer, toolset: Toolset) {
  // eslint-disable-next-line no-console
  console.error(`[manta-mcp] registering graph tools, toolset=${toolset}`);
  // read_graph (rich read)
  server.registerTool(
    'read_graph',
    {
      title: 'Read Graph',
      description: 'Read the current graph or a specific node.',
      inputSchema: {
        nodeId: z.string().optional(),
        includeProperties: z.boolean().optional(),
        includeChildren: z.boolean().optional(),
      },
    },
    async ({ nodeId }) => {
      const origin = resolveBaseUrl();
      const token = resolveAccessToken();
      const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token);
      const parsed = GraphSchema.safeParse(data.graph ?? data);
      if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      if (nodeId) {
        const node = graph.nodes.find((n: any) => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);
        return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
    }
  );

  // add_node (graph-editor only)
  if (toolset === 'graph-editor') server.registerTool(
    'add_node',
    {
      title: 'Add Node',
      description: 'Create a new node and persist it to the graph.',
      inputSchema: {
        parentId: z.string().optional(),
        nodeId: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
        properties: z.array(PropertySchema).optional(),
        children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
      },
    },
    async ({ parentId, nodeId, title, prompt, properties, children, state }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      if (graph.nodes.find((n: any) => n.id === nodeId)) throw new Error(`Node ${nodeId} already exists`);
      const node: any = { id: nodeId, title, prompt, children: Array.isArray(children) ? children : [], properties: Array.isArray(properties) ? properties : [], state: state ?? 'unbuilt' };
      if (parentId) node.parentId = parentId;
      graph.nodes.push(node);
      if (parentId) {
        const parent = graph.nodes.find((n: any) => n.id === parentId);
        if (parent) {
          parent.children = Array.isArray(parent.children) ? parent.children : [];
          if (!parent.children.find((c: any) => c.id === nodeId)) parent.children.push({ id: nodeId, title });
        }
      }
      await httpPut(url, { graph }, token);
      return { content: [{ type: 'text', text: `Added node ${nodeId}` }] };
    }
  );

  // edit_node
  if (toolset === 'graph-editor') server.registerTool(
    'edit_node',
    {
      title: 'Edit Node',
      description: 'Replace node fields with provided values.',
      inputSchema: {
        nodeId: z.string().min(1),
        title: z.string().optional(),
        prompt: z.string().optional(),
        properties: z.array(PropertySchema).optional(),
        children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
      },
    },
    async ({ nodeId, title, prompt, properties, children, state }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      const idx = graph.nodes.findIndex((n: any) => n.id === nodeId); if (idx === -1) throw new Error(`Node ${nodeId} not found`);
      const next = { ...graph.nodes[idx] } as any;
      if (title !== undefined) next.title = title;
      if (prompt !== undefined) next.prompt = prompt;
      if (properties !== undefined) next.properties = properties;
      if (children !== undefined) next.children = children;
      if (state !== undefined) next.state = state;
      graph.nodes[idx] = next;
      await httpPut(url, { graph }, token);
      return { content: [{ type: 'text', text: `Edited node ${nodeId}` }] };
    }
  );

  // update_properties (merge by id)
  if (toolset === 'graph-editor') server.registerTool(
    'update_properties',
    {
      title: 'Update Properties',
      description: 'Merge and update node properties.',
      inputSchema: {
        nodeId: z.string().min(1),
        properties: z.array(PropertySchema).min(1),
        title: z.string().optional(),
        prompt: z.string().optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
      },
    },
    async ({ nodeId, properties, title, prompt, state }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      const idx = graph.nodes.findIndex((n: any) => n.id === nodeId); if (idx === -1) throw new Error(`Node ${nodeId} not found`);
      const node = { ...graph.nodes[idx] } as any;
      const byId = new Map<string, any>((Array.isArray(node.properties) ? node.properties : []).map((p: any) => [p.id, p]));
      for (const p of properties) {
        if (!p || typeof p.id !== 'string') continue;
        const existing = byId.get(p.id);
        if (existing) byId.set(p.id, { ...existing, ...p }); else byId.set(p.id, p);
      }
      node.properties = Array.from(byId.values());
      if (title !== undefined) node.title = title;
      if (prompt !== undefined) node.prompt = prompt;
      if (state !== undefined) node.state = state;
      graph.nodes[idx] = node;
      await httpPut(url, { graph }, token);
      return { content: [{ type: 'text', text: `Updated ${properties.length} properties on ${nodeId}` }] };
    }
  );

  // delete_node
  if (toolset === 'graph-editor') server.registerTool(
    'delete_node',
    {
      title: 'Delete Node',
      description: 'Delete a node by id.',
      inputSchema: { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
    },
    async ({ nodeId, recursive }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      const byId = new Map<string, any>(graph.nodes.map((n: any) => [n.id, n]));
      if (!byId.has(nodeId)) throw new Error(`Node ${nodeId} not found`);
      graph.nodes.forEach((n: any) => { if (Array.isArray(n.children)) n.children = n.children.filter((c: any) => c.id !== nodeId); });
      const toDelete = new Set<string>();
      const collect = (id: string) => {
        toDelete.add(id);
        if (recursive) {
          const n = byId.get(id);
          const kids = Array.isArray(n?.children) ? n.children : [];
          for (const k of kids) collect(k.id);
        }
      };
      collect(nodeId);
      graph.nodes = graph.nodes.filter((n: any) => !toDelete.has(n.id));
      await httpPut(url, { graph }, token);
    return { content: [{ type: 'text', text: `Deleted node ${nodeId}${recursive ? ' (recursive)' : ''}` }] };
  }
  );

  // set node state (allowed for both graph-editor and build-nodes jobs)
  const setStateHandler = async ({ nodeId, state }: { nodeId: string; state: 'built'|'unbuilt'|'building' }) => {
    const origin = resolveBaseUrl();
    const token = resolveAccessToken();
    const url = `${origin}/api/graph-api`;
    const data = await httpGet(url, token);
    const parsed = GraphSchema.safeParse((data as any).graph ?? data);
    if (!parsed.success) throw new Error('Graph schema validation failed');
    const graph = parsed.data as any;
    const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
    if (idx === -1) throw new Error(`Node ${nodeId} not found`);
    graph.nodes[idx] = { ...graph.nodes[idx], state };
    await httpPut(url, { graph }, token);
    return { content: [{ type: 'text', text: `Updated node ${nodeId} state -> ${state}` }] };
  };

  // Alias for convenience
  server.registerTool(
    'set_node_state',
    {
      title: 'Set Node State',
      description: 'Update a node\'s state (built/unbuilt/building).',
      inputSchema: {
        nodeId: z.string().min(1),
        state: z.enum(['built','unbuilt','building']),
      },
    },
    setStateHandler as any
  );
}
