import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs';
import path from 'node:path';
import { graphToXml, xmlToGraph } from '../xml-utils.js';

// File logging setup
const LOG_FILE = path.join(process.cwd(), 'mcp-graph-tools.log');
let logStream: fs.WriteStream | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initLogger() {
  try {
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (error: any) {
    // If we can't create the log file, we'll silently fail to avoid interfering with MCP
  }
}

function logToFile(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;

  // Also try to write to file if available
  if (!logStream) return;

  try {
    logStream.write(logEntry + '\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
  }
}

function closeLogger() {
  if (logStream) {
    try {
      logStream.end();
    } catch (error) {
      // Silently fail
    }
    logStream = null;
  }
}

// Initialize logger when module loads
initLogger();

// Cleanup on process exit
process.on('exit', closeLogger);
process.on('SIGINT', closeLogger);
process.on('SIGTERM', closeLogger);

// Toolset is chosen at startup by the MCP based on env

export type Toolset = 'graph-editor' | 'read-only';

// Load schemas from shared-schemas package with fallback
let PropertySchema: any;
let GraphSchema: any;

try {
  const loaded = require('../../shared-schemas/dist/index.js');
  PropertySchema = loaded.PropertySchema;
  GraphSchema = loaded.GraphSchema;
} catch (e) {
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
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
    // Prefer XML for graph data to ensure we get the full XML representation
    headers['Accept'] = 'application/xml, application/json';
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('xml')) {
      const xml = await res.text();
      const parsed = xmlToGraph(xml);
      return { graph: parsed, rawXml: xml } as any; // Include rawXml for API XML responses
    }
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      logToFile(`GET fallback attempted: ${alt}`);
      try {
        const headers = buildAuthHeaders(token);
        headers['Accept'] = 'application/xml, application/json';
        const res = await fetch(alt, { method: 'GET', headers });
        if (!res.ok) throw new Error(`GET ${alt} failed: ${res.status}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('xml')) {
          const xml = await res.text();
          const parsed = xmlToGraph(xml);
          return { graph: parsed, rawXml: xml } as any; // Include rawXml for fallback XML responses
        }
        return res.json() as any;
      } catch (e2) {
        logToFile(`GET alt fetch failed: ${e2}`, 'ERROR');
      }
    }
    // Final fallback: read local graph from filesystem if available
    const local = readLocalGraph();
    if (local) {
      logToFile(`GET local fallback: using _graph/graph.xml`);
      return { graph: local.graph, rawXml: local.rawXml } as any;
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
      logToFile(`POST fallback attempted: ${alt}`);
      try {
        const res = await fetch(alt, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`POST ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        logToFile(`POST alt fetch failed: ${e2}`, 'ERROR');
      }
    }
    // Local mode write: treat POST as PUT for local graph update if a graph is present
    if (body && body.graph) {
      try {
        writeLocalGraph(body.graph);
        logToFile(`POST local fallback: wrote _graph/graph.xml`);
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
      logToFile(`PUT: Converting graph to XML for ${url}`, 'DEBUG');
      const xml = graphToXml(body.graph);
      logToFile(`PUT: XML length: ${xml.length} characters`, 'DEBUG');
      headers = { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' } as any;
      payload = xml;
    } else {
      payload = JSON.stringify(body);
    }
    logToFile(`PUT: Sending request to ${url}`, 'DEBUG');
    const res = await fetch(url, { method: 'PUT', headers, body: payload });
    logToFile(`PUT: Response status: ${res.status}`, 'DEBUG');
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    const result = res.json() as any;
    logToFile(`PUT: Request completed successfully`, 'DEBUG');
    return result;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      logToFile(`PUT fallback attempted: ${alt}`);
      try {
        let headers = buildAuthHeaders(token);
        let payload: any;
        if (body && body.graph) {
          const xml = graphToXml(body.graph);
          headers = { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' } as any;
          payload = xml;
        } else {
          payload = JSON.stringify(body);
        }
        const res = await fetch(alt, { method: 'PUT', headers, body: payload });
        if (!res.ok) throw new Error(`PUT ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        logToFile(`PUT alt fetch failed: ${e2}`, 'ERROR');
      }
    }
    if (body && body.graph) {
      try {
        logToFile(`PUT local fallback: Writing graph to _graph/graph.xml`, 'DEBUG');
        writeLocalGraph(body.graph);
        logToFile(`PUT local fallback: Successfully wrote _graph/graph.xml`);
        return { success: true } as any;
      } catch (error) {
        logToFile(`PUT local fallback: Failed to write graph: ${error}`, 'ERROR');
      }
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
    const rawXml = fs.readFileSync(p, 'utf8');
    // Return both the parsed graph and the raw XML for MCP responses
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchema.safeParse(g);
    const parsedGraph = parsed.success ? parsed.data : g;
    return { graph: parsedGraph, rawXml };
  } catch { return null; }
}
function writeLocalGraph(graph: any) {
  try {
    const p = graphPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, graphToXml(graph), 'utf8');
  } catch {}
}

// Define types for MCP
interface Property {
  id: string;
  title: string;
  type: string;
  value?: any;
  options?: any[];
  fields?: Property[];
  itemFields?: Property[];
}

interface GraphNode {
  id: string;
  title: string;
  prompt?: string;
  state?: string;
  properties: Property[];
  position?: { x: number; y: number; z?: number };
}

interface Graph {
  nodes: GraphNode[];
  edges: Array<{ id: string; source: string; target: string; role?: string }>;
}

export function registerGraphTools(server: McpServer, toolset: Toolset) {
    logToFile(`Registering graph tools with toolset: ${toolset}`);

  // Utility: normalize incoming property objects to consistent schema
  const normalizeProperty = (prop: any): any => {
    try {
      if (!prop || typeof prop !== 'object') return prop;
      const baseKeys = new Set([
        'id','title','type','value','options','fields','itemFields',
        'maxLength','min','max','step','itemTitle','addLabel'
      ]);

      // Collect extra keys that look like inline object fields (e.g., background-color, family, etc.)
      const extraEntries = Object.entries(prop).filter(([k]) => !baseKeys.has(k));

      // For object-typed properties, move extra keys into value object
      if (String(prop.type) === 'object') {
        if (extraEntries.length > 0) {
          const valueObj: Record<string, any> = { ...(prop.value && typeof prop.value === 'object' ? prop.value : {}) };
          for (const [k, v] of extraEntries) valueObj[k] = v;
          const cleaned: any = { ...prop, value: valueObj };
          // Remove extras from top-level to avoid duplication
          for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
          return cleaned;
        }
        return prop;
      }

      // For object-list, prefer provided value; support alternate 'items' key
      if (String(prop.type) === 'object-list') {
        const next: any = { ...prop };
        if (!Array.isArray(next.value) && Array.isArray((next as any).items)) {
          next.value = (next as any).items;
          delete (next as any).items;
        }
        return next;
      }

      // For non-object types: if no value but extra keys exist, pack them as a value object
      // This preserves data rather than dropping it; UI/consumers can decide how to render.
      if (prop.value === undefined && extraEntries.length > 0) {
        const valueObj = Object.fromEntries(extraEntries);
        const cleaned: any = { ...prop, value: valueObj };
        for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
        return cleaned;
      }
    } catch (err) {
      logToFile(`normalizeProperty failed: ${err}`, 'ERROR');
    }
    return prop;
  };

  const normalizeProperties = (properties?: any[]): any[] => {
    if (!Array.isArray(properties)) return [];
    return properties.map((p) => normalizeProperty(p));
  };
  // read_graph (rich read)
  server.registerTool(
    'graph_read',
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

      // Parse the graph data
      const parsed = GraphSchema.safeParse(data.graph ?? data);
      if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;

      if (nodeId) {
        // Return full node details when specific node is requested
        const node = graph.nodes.find((n: any) => n.id === nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);
        return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
      } else {
        // Return only node IDs when reading all nodes to avoid overwhelming responses
        const nodeIds = graph.nodes.map((n: any) => n.id);
        return { content: [{ type: 'text', text: JSON.stringify({ nodeIds }, null, 2) }] };
      }
    }
  );

  // graph_edge_create
  server.registerTool(
    'graph_edge_create',
    {
      title: 'Create Graph Edge',
      description: 'Create a connection (edge) between two nodes in the graph.',
      inputSchema: {
        sourceId: z.string().min(1, 'Source node ID is required'),
        targetId: z.string().min(1, 'Target node ID is required'),
        role: z.string().optional(),
      },
    },
    async ({ sourceId, targetId, role }) => {
      const origin = resolveBaseUrl();
      const token = resolveAccessToken();
      const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token);
      const parsed = GraphSchema.safeParse(data.graph ?? data);
      if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;

      // Validate that both nodes exist
      const sourceNode = graph.nodes.find((n: any) => n.id === sourceId);
      const targetNode = graph.nodes.find((n: any) => n.id === targetId);

      if (!sourceNode) throw new Error(`Source node ${sourceId} not found`);
      if (!targetNode) throw new Error(`Target node ${targetId} not found`);

      // Check if edge already exists
      const existingEdge = (graph.edges || []).find((e: any) => e.source === sourceId && e.target === targetId);
      if (existingEdge) {
        throw new Error(`Edge from ${sourceId} to ${targetId} already exists`);
      }

      // Create the edge
      const newEdge = {
        id: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        role: role || 'links-to'
      };

      graph.edges = graph.edges || [];
      graph.edges.push(newEdge);

      await httpPut(url, { graph }, token);
      return { content: [{ type: 'text', text: `Created edge from ${sourceId} to ${targetId}${role ? ` (${role})` : ''}` }] };
    }
  );

  // graph_node_add
  server.registerTool(
      'graph_node_add',
    {
      title: 'Add Node',
      description: 'Create a new node and persist it to the graph.',
      inputSchema: {
        nodeId: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
        properties: z.array(PropertySchema).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
        position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      },
    },
  async ({ nodeId, title, prompt, properties, state, position }) => {
    try {
      logToFile(`Adding node: ${nodeId}`, 'DEBUG');
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      logToFile(`Fetching graph from ${url}`, 'DEBUG');
      const data = await httpGet(url, token);
      const parsed = GraphSchema.safeParse(data.graph ?? data);
      if (!parsed.success) {
        logToFile(`Graph schema validation failed: ${parsed.error.message}`, 'ERROR');
        logToFile(`Graph validation errors: ${JSON.stringify(parsed.error.errors, null, 2)}`, 'ERROR');
        throw new Error('Graph schema validation failed');
      }
      const graph = parsed.data;
      logToFile(`Loaded graph with ${graph.nodes.length} nodes`, 'DEBUG');

      const existingNode = graph.nodes.find((n: any) => n.id === nodeId);
      if (existingNode) {
        logToFile(`Node ${nodeId} already exists`, 'ERROR');
        throw new Error(`Node ${nodeId} already exists`);
      }

      const node: any = {
        id: nodeId,
        title,
        prompt,
        properties: normalizeProperties(properties),
        state: state ?? 'unbuilt',
        ...(position ? { position: { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 } } : {})
      };
      logToFile(`Created node object with ${node.properties.length} properties`, 'DEBUG');

    // Validate each property individually for debugging
    if (Array.isArray(node.properties)) {
      node.properties.forEach((prop: any, index: number) => {
        const propValidation = PropertySchema.safeParse(prop);
        if (!propValidation.success) {
          logToFile(`Property ${index} (${prop.id || 'unknown'}) validation failed: ${JSON.stringify(propValidation.error.errors, null, 2)}`, 'ERROR');
          logToFile(`Property ${index} data: ${JSON.stringify(prop, null, 2)}`, 'ERROR');
        } else {
          logToFile(`Property ${index} (${prop.id}) validated successfully`, 'DEBUG');
        }
      });
    }

      graph.nodes.push(node);
      logToFile(`Added node to graph, total nodes: ${graph.nodes.length}`, 'DEBUG');

      logToFile(`Saving updated graph to ${url}`, 'DEBUG');
      await httpPut(url, { graph }, token);
      logToFile(`Successfully added node ${nodeId}`, 'DEBUG');
      return { content: [{ type: 'text', text: `Added node ${nodeId}` }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      logToFile(`Failed to add node ${nodeId}: ${errorMessage}`, 'ERROR');
      if (errorStack) {
        logToFile(`Error stack: ${errorStack}`, 'ERROR');
      }
      throw error;
    }
  }
    );

  // graph_node_edit
  server.registerTool(
    'graph_node_edit',
    {
      title: 'Edit Node',
      description: 'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
      inputSchema: {
        nodeId: z.string().min(1),
        mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
        title: z.string().optional(),
        prompt: z.string().optional(),
        properties: z.array(PropertySchema).optional(),
        children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
        position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      },
    },
    async ({ nodeId, mode = 'replace', title, prompt, properties, children, state, position }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      const idx = graph.nodes.findIndex((n: any) => n.id === nodeId); if (idx === -1) throw new Error(`Node ${nodeId} not found`);

      if (mode === 'merge') {
        // Merge mode: preserve existing data and merge properties
        const existing = graph.nodes[idx];
        const next = { ...existing } as any;

        // Merge simple fields (only update if provided)
        if (title !== undefined) next.title = title;
        if (prompt !== undefined) next.prompt = prompt;
        if (children !== undefined) next.children = children;
        if (state !== undefined) next.state = state;
        if (position !== undefined) next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };

        // Special handling for properties: merge instead of replace
        if (properties !== undefined) {
          // Normalize incoming properties first
          properties = normalizeProperties(properties);
          const existingProps = Array.isArray(existing.properties) ? existing.properties : [];
          const byId = new Map<string, any>(existingProps.map((p: any) => [p.id, p]));

          // Merge new properties with existing ones
          for (const newProp of properties) {
            if (!newProp || typeof newProp.id !== 'string') continue;

            // Handle dot-notation for nested properties (e.g., "root-styles.background-color")
            const dotIndex = newProp.id.indexOf('.');
            if (dotIndex > 0) {
              const parentId = newProp.id.substring(0, dotIndex);
              const fieldName = newProp.id.substring(dotIndex + 1);
              const existingParent = byId.get(parentId);


              if (existingParent && existingParent.type === 'object' && existingParent.fields) {
                // Update nested field within existing object property
                const existingFields = Array.isArray(existingParent.fields) ? existingParent.fields : [];

                const fieldMap = new Map<string, any>(existingFields.map((f: any) => [f.id || f.name, f]));
                const existingField = fieldMap.get(fieldName);


                // Ensure parent has a value object to store field values
                const parentValue = existingParent.value && typeof existingParent.value === 'object' ? { ...existingParent.value } : {};

                if (existingField) {
                  // Update existing field - preserve id/name and only update specified properties
                  fieldMap.set(fieldName, {
                    id: existingField.id || existingField.name, // Always preserve the original id/name
                    title: newProp.title !== undefined ? newProp.title : existingField.title,
                    type: newProp.type !== undefined ? newProp.type : existingField.type,
                    value: newProp.value !== undefined ? newProp.value : existingField.value,
                    ...(existingField.options ? { options: existingField.options } : {}),
                    ...(existingField.fields ? { fields: existingField.fields } : {})
                  });
                  // Also update the parent value object for XML serialization
                  if (newProp.value !== undefined) {
                    parentValue[fieldName] = newProp.value;
                  }
                } else {
                  // Add new field to object
                  fieldMap.set(fieldName, {
                    id: fieldName,
                    title: newProp.title || fieldName,
                    type: newProp.type || 'text',
                    value: newProp.value
                  });
                  // Also add to parent value object for XML serialization
                  parentValue[fieldName] = newProp.value;
                }

                byId.set(parentId, {
                  ...existingParent,
                  fields: Array.from(fieldMap.values()),
                  value: parentValue
                });
              } else if (existingParent) {
                // Parent exists but is not an object, replace it with object containing the field
                const initialValue: any = {};
                initialValue[fieldName] = newProp.value;
                byId.set(parentId, {
                  id: parentId,
                  title: existingParent.title || parentId,
                  type: 'object',
                  value: initialValue,
                  fields: [{
                    id: fieldName,
                    title: newProp.title || fieldName,
                    type: newProp.type || 'text',
                    value: newProp.value
                  }]
                });
              } else {
                // Create new object property with the field
                const initialValue: any = {};
                initialValue[fieldName] = newProp.value;
                byId.set(parentId, {
                  id: parentId,
                  title: parentId,
                  type: 'object',
                  value: initialValue,
                  fields: [{
                    id: fieldName,
                    title: newProp.title || fieldName,
                    type: newProp.type || 'text',
                    value: newProp.value
                  }]
                });
              }
            } else {
              // Regular property (no dot notation)
              const existingProp = byId.get(newProp.id);
              if (existingProp) {
                // Merge with existing property
                byId.set(newProp.id, { ...existingProp, ...newProp });
              } else {
                // Add new property
                byId.set(newProp.id, newProp);
              }
            }
          }

          next.properties = Array.from(byId.values());
        }

        graph.nodes[idx] = next;
        await httpPut(url, { graph }, token);
        return { content: [{ type: 'text', text: `Merged changes into node ${nodeId}` }] };

      } else {
        // Replace mode: fully replace the node (original behavior)
      const next = { ...graph.nodes[idx] } as any;
      if (title !== undefined) next.title = title;
      if (prompt !== undefined) next.prompt = prompt;
      if (properties !== undefined) next.properties = normalizeProperties(properties);
      if (children !== undefined) next.children = children;
      if (state !== undefined) next.state = state;
      if (position !== undefined) next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
      graph.nodes[idx] = next;
      await httpPut(url, { graph }, token);
        return { content: [{ type: 'text', text: `Replaced node ${nodeId}` }] };
      }
    }
  );

  // graph_node_set_position (convenience tool)
  server.registerTool(
    'graph_node_set_position',
    {
      title: 'Set Node Position',
      description: 'Set or update a node\'s position (x,y,z).',
      inputSchema: {
        nodeId: z.string().min(1),
        x: z.number(),
        y: z.number(),
        z: z.number().optional().default(0),
      },
    },
    async ({ nodeId, x, y, z = 0 }) => {
      const origin = resolveBaseUrl();
      const token = resolveAccessToken();
      const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token);
      const parsed = GraphSchema.safeParse((data as any).graph ?? data);
      if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data as any;
      const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
      if (idx === -1) throw new Error(`Node ${nodeId} not found`);
      graph.nodes[idx] = { ...graph.nodes[idx], position: { x, y, z: typeof z === 'number' ? z : 0 } };
      await httpPut(url, { graph }, token);
      return { content: [{ type: 'text', text: `Updated node ${nodeId} position -> (${x}, ${y}, ${typeof z === 'number' ? z : 0})` }] };
    }
  );

  // graph_node_delete
  server.registerTool(
    'graph_node_delete',
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

  // set node state
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
    'graph_node_set_state',
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
