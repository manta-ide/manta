import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';
import { GraphSchema, PropertySchema, GraphNodeSchema, graphToXml, xmlToGraph } from '../../lib/schemas';
import { getDevProjectDir } from '@/lib/project-config';

// Runtime schema references (same as imported schemas)
const PropertySchemaRuntime = PropertySchema;
const GraphSchemaRuntime = GraphSchema;

const RequestSchema = z.object({
  prompt: z.string(),
});


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
      return { graph: parsed, rawXml: xml };
    }
    return res.json();
  } catch (e) {
    const alt = resolveBaseUrl().replace('localhost', '127.0.0.1');
    if (alt !== resolveBaseUrl()) {
      try {
        const headers = buildAuthHeaders(token);
        headers['Accept'] = 'application/xml, application/json';
        const res = await fetch(url.replace(resolveBaseUrl(), alt), { method: 'GET', headers });
        if (!res.ok) throw new Error(`GET ${alt} failed: ${res.status}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('xml')) {
          const xml = await res.text();
          const parsed = xmlToGraph(xml);
          return { graph: parsed, rawXml: xml };
        }
        return res.json();
      } catch (e2) {
        // Continue to fallback
      }
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
      headers = { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' };
      payload = xml;
    } else {
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method: 'PUT', headers, body: payload });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  } catch (e) {
    const alt = resolveBaseUrl().replace('localhost', '127.0.0.1');
    if (alt !== resolveBaseUrl()) {
      try {
        let headers = buildAuthHeaders(token);
        let payload: any;
        if (body && body.graph) {
          const xml = graphToXml(body.graph);
          headers = { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' };
          payload = xml;
        } else {
          payload = JSON.stringify(body);
        }
        const res = await fetch(url.replace(resolveBaseUrl(), alt), { method: 'PUT', headers, body: payload });
        if (!res.ok) throw new Error(`PUT ${alt} failed: ${res.status}`);
        return res.json();
      } catch (e2) {
        // Continue to error
      }
    }
    throw e;
  }
}

// Utility function to normalize incoming property objects
const normalizeProperty = (prop: any): any => {
  try {
    if (!prop || typeof prop !== 'object') return prop;
    const baseKeys = new Set([
      'id','title','type','value','options','fields','itemFields',
      'maxLength','min','max','step','itemTitle','addLabel'
    ]);

    // Collect extra keys that look like inline object fields
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
    if (prop.value === undefined && extraEntries.length > 0) {
      const valueObj = Object.fromEntries(extraEntries);
      const cleaned: any = { ...prop, value: valueObj };
      for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
      return cleaned;
    }
  } catch (err) {
    console.error('normalizeProperty failed:', err);
  }
  return prop;
};

const normalizeProperties = (properties?: any[]): any[] => {
  if (!Array.isArray(properties)) return [];
  return properties.map((p) => normalizeProperty(p));
};

const graphToolsServer = createSdkMcpServer({
  name: "graph-tools",
  version: "1.0.0",
  tools: [
    // graph_read (rich read)
    tool(
      'graph_read',
      'Read the current graph or a specific node.',
      {
        nodeId: z.string().optional(),
        includeProperties: z.boolean().optional(),
        includeChildren: z.boolean().optional(),
      },
      async ({ nodeId }) => {
        const origin = resolveBaseUrl();
        const token = resolveAccessToken();
        const url = `${origin}/api/graph-api`;
        const data = await httpGet(url, token);

        // Parse the graph data
        const parsed = GraphSchemaRuntime.safeParse(data.graph ?? data);
        if (!parsed.success) throw new Error('Graph schema validation failed');
        const graph = parsed.data;

        if (nodeId) {
          // Return full node details when specific node is requested
          const node = graph.nodes.find((n: any) => n.id === nodeId);
          if (!node) throw new Error(`Node ${nodeId} not found`);
          return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
        } else {
          // Return node IDs and titles when reading all nodes
          const nodes = graph.nodes.map((n: any) => ({ id: n.id, title: n.title }));
          return { content: [{ type: 'text', text: JSON.stringify({ nodes }, null, 2) }] };
        }
      }
    ),

    // graph_edge_create
    tool(
      'graph_edge_create',
      'Create a connection (edge) between two nodes in the graph.',
      {
        sourceId: z.string().min(1, 'Source node ID is required'),
        targetId: z.string().min(1, 'Target node ID is required'),
        role: z.string().optional(),
      },
      async ({ sourceId, targetId, role }) => {
        const origin = resolveBaseUrl();
        const token = resolveAccessToken();
        const url = `${origin}/api/graph-api`;
        const data = await httpGet(url, token);
        const parsed = GraphSchemaRuntime.safeParse(data.graph ?? data);
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
    ),

    // graph_node_add
    tool(
      'graph_node_add',
      'Create a new node and persist it to the graph.',
      {
        nodeId: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
        properties: z.array(PropertySchema).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
        position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
      },
      async ({ nodeId, title, prompt, properties, state, position }) => {
        try {
          const origin = resolveBaseUrl();
          const token = resolveAccessToken();
          const url = `${origin}/api/graph-api`;
          const data = await httpGet(url, token);
          const parsed = GraphSchemaRuntime.safeParse(data.graph ?? data);
          if (!parsed.success) {
            throw new Error('Graph schema validation failed');
          }
          const graph = parsed.data;

          const existingNode = graph.nodes.find((n: any) => n.id === nodeId);
          if (existingNode) {
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

          graph.nodes.push(node);
          await httpPut(url, { graph }, token);
          return { content: [{ type: 'text', text: `Added node ${nodeId}` }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }
    ),

    // graph_node_edit
    tool(
      'graph_node_edit',
      'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
      {
        nodeId: z.string().min(1),
        mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
        title: z.string().optional(),
        prompt: z.string().optional(),
        properties: z.array(PropertySchema).optional(),
        children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
        position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      },
      async ({ nodeId, mode = 'replace', title, prompt, properties, children, state, position }) => {
        const origin = resolveBaseUrl();
        const token = resolveAccessToken();
        const url = `${origin}/api/graph-api`;
        const data = await httpGet(url, token);
        const parsed = GraphSchemaRuntime.safeParse(data.graph ?? data);
        if (!parsed.success) throw new Error('Graph schema validation failed');
        const graph = parsed.data;
        const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) throw new Error(`Node ${nodeId} not found`);

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

              // Handle dot-notation for nested properties
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
                      id: existingField.id || existingField.name,
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
    ),

    // graph_node_set_state
    tool(
      'graph_node_set_state',
      'Update a node\'s state (built/unbuilt/building).',
      {
        nodeId: z.string().min(1),
        state: z.enum(['built','unbuilt','building']),
      },
      async ({ nodeId, state }) => {
        const origin = resolveBaseUrl();
        const token = resolveAccessToken();
        const url = `${origin}/api/graph-api`;
        const data = await httpGet(url, token);
        const parsed = GraphSchemaRuntime.safeParse((data as any).graph ?? data);
        if (!parsed.success) throw new Error('Graph schema validation failed');
        const graph = parsed.data as any;
        const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) throw new Error(`Node ${nodeId} not found`);
        graph.nodes[idx] = { ...graph.nodes[idx], state };
        await httpPut(url, { graph }, token);
        return { content: [{ type: 'text', text: `Updated node ${nodeId} state -> ${state}` }] };
      }
    ),

    // graph_node_delete
    tool(
      'graph_node_delete',
      'Delete a node by id.',
      { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
      async ({ nodeId, recursive }) => {
        const origin = resolveBaseUrl();
        const token = resolveAccessToken();
        const url = `${origin}/api/graph-api`;
        const data = await httpGet(url, token);
        const parsed = GraphSchemaRuntime.safeParse(data.graph ?? data);
        if (!parsed.success) throw new Error('Graph schema validation failed');
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
    ),

    // graph_analyze_diff
    tool(
      'graph_analyze_diff',
      'Analyze the differences between base and current graphs to understand what changed.',
      {
        // No parameters needed - graphs are read from filesystem
      },
      async () => {
        // Read base and current graphs from filesystem
        const baseGraph = readLocalGraph();
        const currentGraph = readLocalGraph();

        if (!baseGraph || !currentGraph) {
          return { content: [{ type: 'text', text: 'Error: Cannot read graphs from filesystem' }] };
        }

        const diff: any = {
          changes: []
        };

        // Compare nodes
        const currentNodeMap = new Map(currentGraph.nodes.map((n: any) => [n.id, n]));
        const baseNodeMap = new Map(baseGraph.nodes.map((n: any) => [n.id, n]));

        // Find added/modified nodes
        for (const [nodeId, currentNode] of Array.from(currentNodeMap.entries())) {
          const baseNode = baseNodeMap.get(nodeId);
          if (!baseNode) {
            diff.changes.push({ type: 'node-added', node: currentNode });
          } else if (JSON.stringify(currentNode) !== JSON.stringify(baseNode)) {
            diff.changes.push({ type: 'node-modified', nodeId, oldNode: baseNode, newNode: currentNode });
          }
        }

        // Find deleted nodes
        for (const [nodeId, baseNode] of Array.from(baseNodeMap.entries())) {
          if (!currentNodeMap.has(nodeId)) {
            diff.changes.push({ type: 'node-deleted', nodeId, node: baseNode });
          }
        }

        // Compare edges
        const currentEdges = currentGraph.edges || [];
        const baseEdges = baseGraph.edges || [];
        const currentEdgeMap = new Map(currentEdges.map((e: any) => [`${e.source}-${e.target}`, e]));
        const baseEdgeMap = new Map(baseEdges.map((e: any) => [`${e.source}-${e.target}`, e]));

        // Find added edges
        for (const [edgeKey, currentEdge] of Array.from(currentEdgeMap.entries())) {
          if (!baseEdgeMap.has(edgeKey)) {
            diff.changes.push({ type: 'edge-added', edge: currentEdge });
          }
        }

        // Find deleted edges
        for (const [edgeKey, baseEdge] of Array.from(baseEdgeMap.entries())) {
          if (!currentEdgeMap.has(edgeKey)) {
            diff.changes.push({ type: 'edge-deleted', edge: baseEdge });
          }
        }

        return { content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }] };
      }
    )
  ]
});

// Local filesystem helpers
function projectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  try {
    return process.cwd();
  } catch {
    return process.cwd();
  }
}

function graphPath(): string { return path.join(projectDir(), '_graph', 'graph.xml'); }
function baseGraphPath(): string { return path.join(projectDir(), '_graph', 'base-graph.xml'); }

function readLocalGraph(): any | null {
  try {
    const p = graphPath();
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchemaRuntime.safeParse(g);
    return parsed.success ? { graph: parsed.data, rawXml } : null;
  } catch { return null; }
}

function readBaseGraph(): any | null {
  try {
    const p = baseGraphPath();
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchemaRuntime.safeParse(g);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

// Helper function to create async generator for streaming input
function createMessageGenerator(prompt: string) {
  async function* generateMessages() {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: prompt
      },
      parent_tool_use_id: null,
      session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }
  return generateMessages;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = RequestSchema.parse(await req.json());

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    // Execute Claude Code with SDK and stream response
    let fullResponse = '';
    let hasStartedStreaming = false;

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const message of query({
            prompt: createMessageGenerator(prompt)(),
            options: {
              mcpServers: {
                "graph-tools": graphToolsServer
              },
              allowedTools: [
                "mcp__graph-tools__graph_read",
                "mcp__graph-tools__graph_edge_create",
                "mcp__graph-tools__graph_node_add",
                "mcp__graph-tools__graph_node_edit",
                "mcp__graph-tools__graph_node_set_state",
                "mcp__graph-tools__graph_node_delete",
                "mcp__graph-tools__graph_analyze_diff"
              ],
              maxTurns: 10
            }
          })) {
            if (message.type === "assistant") {
              // Stream assistant messages in real-time
              const assistantContent = (message as any).content || '';
              if (assistantContent && !hasStartedStreaming) {
                hasStartedStreaming = true;
                // Send initial streaming indicator
                controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
              }

              if (assistantContent) {
                // Stream the assistant content
                fullResponse += assistantContent;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: assistantContent })}\n\n`));
              }
            } else if (message.type === "result" && message.subtype === "success") {
              // Handle successful result
              const resultContent = message.result || '';
              if (resultContent && !fullResponse.includes(resultContent)) {
                fullResponse += resultContent;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: resultContent })}\n\n`));
              }

              // Send completion signal
              controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
              controller.close();
              return;
            } else if (message.type === "stream_event") {
              // Handle streaming events from tools or other sources
              const streamContent = (message as any).content || '';
              if (streamContent) {
                fullResponse += streamContent;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: streamContent, type: 'stream_event' })}\n\n`));
              }
            }
          }

          // If we get here without a result, send completion
          if (!hasStartedStreaming) {
            controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
          }
          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
          controller.close();

        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('Claude Code API error:', error);
    return new Response(`Error: ${error?.message || String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
