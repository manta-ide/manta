import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs';
import path from 'node:path';
// Lightweight XML converter duplicated for MCP context (no TS path aliases here)
function escapeXml(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
}
function unescapeXml(text: string): string {
  return String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function parseAttrBlock(attrs: string): Record<string, string> {
  const out: Record<string, string> = {}; const re = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g; let m: RegExpExecArray | null; while ((m = re.exec(attrs)) !== null) out[m[1]] = m[2]; return out;
}
function extractTagContent(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml); return m ? m[1] : null;
}
function collectTags(xml: string, tag: string): Array<{ attrs: Record<string,string>; inner: string }>{
  const out: Array<{ attrs: Record<string,string>; inner: string }> = []; const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi'); const self = new RegExp(`<${tag}([^>]*)\\/>`, 'gi'); let m: RegExpExecArray | null; while ((m = re.exec(xml)) !== null) out.push({ attrs: parseAttrBlock(m[1] || ''), inner: m[2] || '' }); while ((m = self.exec(xml)) !== null) out.push({ attrs: parseAttrBlock(m[1] || ''), inner: '' }); return out;
}
function graphToXml(graph: any): string {
  const header = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>`; const ns = `xmlns=\"urn:app:graph\"`; const directed = `directed=\"true\"`; const version = `version=\"1.0\"`;
  const childrenSet = new Set<string>(); for (const n of graph.nodes || []) for (const c of (n.children || [])) childrenSet.add(`${n.id}→${c.id}`);
  const nodes = (graph.nodes || []).map((n: any) => {
    const desc = n.prompt ? `\n      <description>${escapeXml(n.prompt)}</description>` : '';
    const buildStatus = n.state || 'unbuilt';
    const state = `\n      <state status=\"active\">\n        <build status=\"${escapeXml(String(buildStatus))}\"/>\n      </state>`;
    const props = Array.isArray(n.properties) && n.properties.length > 0 ? `\n      <props>\n${n.properties.map((p: any) => `        <prop name=\"${escapeXml(String(p.id || ''))}\" type=\"${escapeXml(String((p.type === 'object' || p.type === 'object-list') ? 'json' : p.type || 'string'))}\">${escapeXml(typeof p.value === 'string' ? p.value : (p.value === undefined || p.value === null ? '' : JSON.stringify(p.value)))}</prop>`).join("\n")}\n      </props>` : '';
    return `    <node id=\"${escapeXml(n.id)}\" title=\"${escapeXml(n.title)}\">${desc}${state}${props}\n    </node>`;
  }).join('\n\n');
  const allEdges = (graph.edges || []) as Array<{ id?: string; source: string; target: string; role?: string }>;
  const edges = allEdges.map((e) => { const role = childrenSet.has(`${e.source}→${e.target}`) ? 'contains' : (e as any).role || 'links-to'; const id = e.id || `${e.source}-${e.target}`; return `    <edge id=\"${escapeXml(id)}\" source=\"${escapeXml(e.source)}\" target=\"${escapeXml(e.target)}\" role=\"${escapeXml(role)}\"/>`; }).join('\n');
  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}
function xmlToGraph(xml: string): any {
  const nodesXml = extractTagContent(xml, 'nodes') || ''; const edgesXml = extractTagContent(xml, 'edges') || '';
  const nodeTags = collectTags(nodesXml, 'node');
  const nodes = nodeTags.map(({ attrs, inner }) => {
    const id = attrs['id'] || ''; const title = attrs['title'] || ''; const description = (extractTagContent(inner, 'description') || '').trim(); const stateBlock = extractTagContent(inner, 'state') || '';
    let buildStatus: string | undefined; const buildTags = collectTags(stateBlock, 'build'); if (buildTags.length > 0) buildStatus = (buildTags[0].attrs['status'] || '').trim(); else { const m = /<build\s+([^>]*)\/>/i.exec(stateBlock); if (m) buildStatus = (parseAttrBlock(m[1] || '')['status'] || '').trim(); }
    const propsBlock = extractTagContent(inner, 'props') || ''; const propTags = collectTags(propsBlock, 'prop'); const properties = propTags.map(({ attrs: pa, inner: pi }) => { const name = pa['name'] || ''; const type = (pa['type'] || 'string'); const raw = (pi || '').trim(); let value: any = raw; if (type === 'number') { const n = Number(raw); value = Number.isFinite(n) ? n : raw; } else if (type === 'boolean') { if (raw.toLowerCase() === 'true') value = true; else if (raw.toLowerCase() === 'false') value = false; } else if (type === 'json' || raw.startsWith('{') || raw.startsWith('[')) { try { value = JSON.parse(raw); } catch { value = raw; } } return { id: name, title: name, type, value }; });
    return { id, title, prompt: unescapeXml(description), children: [], state: buildStatus || 'unbuilt', properties };
  });
  const edges: Array<{ id: string; source: string; target: string; role?: string }> = []; let m: RegExpExecArray | null; const edgeSelf = new RegExp(`<edge([^>]*)\\/>`, 'gi'); const edgeOpen = new RegExp(`<edge([^>]*)>([\\s\\S]*?)<\\/edge>`, 'gi');
  while ((m = edgeSelf.exec(edgesXml)) !== null) { const a = parseAttrBlock(m[1] || ''); const id = a['id'] || `${a['source']}-${a['target']}`; edges.push({ id, source: a['source'] || '', target: a['target'] || '', role: a['role'] }); }
  while ((m = edgeOpen.exec(edgesXml)) !== null) { const a = parseAttrBlock(m[1] || ''); const id = a['id'] || `${a['source']}-${a['target']}`; edges.push({ id, source: a['source'] || '', target: a['target'] || '', role: a['role'] }); }
  const byId = new Map(nodes.map((n: any) => [n.id, n])); for (const e of edges) { const parent = byId.get(e.source); const child = byId.get(e.target); if (parent && child) { parent.children = parent.children || []; if (!parent.children.find((c: any) => c.id === child.id)) parent.children.push({ id: child.id, title: child.title }); } }
  return { nodes, edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) };
}
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
    const headers = buildAuthHeaders(token);
    headers['Accept'] = 'application/xml,application/json;q=0.5';
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('xml')) {
      const xml = await res.text();
      const parsed = xmlToGraph(xml);
      return { graph: parsed } as any;
    }
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] GET fallback: ${url} -> ${alt}`);
      try {
        const res = await fetch(alt, { method: 'GET', headers: buildAuthHeaders(token) });
        if (!res.ok) throw new Error(`GET ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error(`[manta-mcp] GET alt fetch failed: ${(e2 as any)?.message || e2}`);
      }
    }
    // Final fallback: read local graph from filesystem if available
    const local = readLocalGraph();
    if (local) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] GET local fallback: using _graph/graph.xml`);
      return { graph: local } as any;
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
      try {
        const res = await fetch(alt, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`POST ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error(`[manta-mcp] POST alt fetch failed: ${(e2 as any)?.message || e2}`);
      }
    }
    // Local mode write: treat POST as PUT for local graph update if a graph is present
    if (body && body.graph) {
      try {
        writeLocalGraph(body.graph);
        // eslint-disable-next-line no-console
        console.error(`[manta-mcp] POST local fallback: wrote _graph/graph.xml`);
        return { success: true } as any;
      } catch {}
    }
    throw e;
  }
}
async function httpPut(url: string, body: any, token?: string) {
  try {
    let headers = buildAuthHeaders(token);
    let payload: any;
    if (body && body.graph) {
      const xml = graphToXml(body.graph);
      headers = { ...headers, 'Content-Type': 'application/xml' };
      payload = xml;
    } else {
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method: 'PUT', headers, body: payload });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      console.error(`[manta-mcp] PUT fallback: ${url} -> ${alt}`);
      try {
        const res = await fetch(alt, { method: 'PUT', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`PUT ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error(`[manta-mcp] PUT alt fetch failed: ${(e2 as any)?.message || e2}`);
      }
    }
    if (body && body.graph) {
      try {
        writeLocalGraph(body.graph);
        // eslint-disable-next-line no-console
        console.error(`[manta-mcp] PUT local fallback: wrote _graph/graph.xml`);
        return { success: true } as any;
      } catch {}
    }
    throw e;
  }
}

// Local filesystem fallback helpers
function projectDir(): string {
  const envDir = process.env.MANTA_PROJECT_DIR;
  if (envDir && fs.existsSync(envDir)) return envDir;
  try {
    const cwd = process.cwd();
    return cwd;
  } catch { return process.cwd(); }
}
function graphPath(): string { return path.join(projectDir(), '_graph', 'graph.xml'); }
function readLocalGraph(): any | null {
  try {
    const p = graphPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(raw);
    const parsed = GraphSchema.safeParse(g);
    return parsed.success ? parsed.data : g;
  } catch { return null; }
}
function writeLocalGraph(graph: any) {
  try {
    const p = graphPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, graphToXml(graph), 'utf8');
  } catch {}
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
