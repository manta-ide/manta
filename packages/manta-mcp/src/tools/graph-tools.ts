import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Configure XML parser for MCP context
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  trimValues: true,
  parseTagValue: true,
  processEntities: true,
  stopNodes: ['*.#text', '*.@_value', '*.@_options']
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressBooleanAttributes: false
});

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
  const header = `<?xml version="1.0" encoding="UTF-8"?>`;
  const ns = `xmlns="urn:app:graph"`;
  const directed = `directed="true"`;
  const version = `version="1.0"`;

  const childrenSet = new Set<string>();
  for (const n of graph.nodes || []) {
    for (const c of (n.children || [])) {
      childrenSet.add(`${n.id}→${c.id}`);
    }
  }

  const nodes = (graph.nodes || []).map((n: any) => {
    const desc = n.prompt ? `\n      <description>${escapeXml(n.prompt)}</description>` : '';
    const buildStatus = n.state || 'unbuilt';
    const state = `\n      <state status="active">\n        <build status="${escapeXml(String(buildStatus))}"/>\n      </state>`;

    // Generate properties with proper XML structure
    let props = '';
    if (Array.isArray(n.properties) && n.properties.length > 0) {
      const propXmls = n.properties.map((p: any) => {
        const propType = (p as any)?.type;
        const options = (p as any)?.options;

        if (propType === 'object' || propType === 'object-list') {
          // Use nested XML structure for objects and arrays
          const nestedContent = generateNestedXml(p);
          return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(propType)}">${nestedContent}</prop>`;
        } else if (Array.isArray(options) && options.length > 0) {
          // Property with options - use XML format
          const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
          return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(toPropTypeAttr(p))}">
          <value>${escapeXml(valueToText(p))}</value>
          <options>
${optionsXml}
          </options>
        </prop>`;
        } else {
          // Simple property without options
          return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(toPropTypeAttr(p))}">${escapeXml(valueToText(p))}</prop>`;
        }
      });
      props = `\n      <props>\n${propXmls.join("\n")}\n      </props>`;
    }

    return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}">${desc}${state}${props}\n    </node>`;
  }).join('\n\n');

  const allEdges = (graph.edges || []) as Array<{ id?: string; source: string; target: string; role?: string }>;
  const edges = allEdges.map((e) => {
    const role = childrenSet.has(`${e.source}→${e.target}`) ? 'contains' : (e as any).role || 'links-to';
    const id = e.id || `${e.source}-${e.target}`;
    return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"/>`;
  }).join('\n');

  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}
function xmlToGraph(xml: string): any {
  try {
    // Parse XML using fast-xml-parser
    const parsedXml = xmlParser.parse(xml);

    // Extract graph data from parsed XML
    const graphData = parsedXml.graph;
    if (!graphData) {
      throw new Error('Invalid graph XML: missing <graph> root');
    }

    const nodesData = graphData.nodes;
    const edgesData = graphData.edges;

    if (!nodesData) {
      throw new Error('Invalid graph XML: missing <nodes> section');
    }

    // Handle both single node and array of nodes
    const nodeList = Array.isArray(nodesData.node) ? nodesData.node : [nodesData.node];
    const nodes: GraphNode[] = nodeList.filter(Boolean).map((nodeData: any) => {
      const id = nodeData['@_id'] || '';
      const title = nodeData['@_title'] || '';

      if (!id) {
        throw new Error(`Node missing required id attribute: ${JSON.stringify(nodeData)}`);
      }

      const description = (nodeData.description?.['#text'] || nodeData.description || '').trim();
      const stateData = nodeData.state;
      let buildStatus: string | undefined;

      // Extract build status from parsed state data
      if (stateData?.build) {
        buildStatus = stateData.build['@_status'] || stateData.build['#text'] || 'built';
      }

      // Default to 'built' if status is missing but state block exists
      if (!buildStatus && stateData) {
        buildStatus = 'built';
      }

      // Parse properties using fast-xml-parser
      const propsData = nodeData.props;
      let properties: Property[] = [];

      if (propsData?.prop) {
        const propList = Array.isArray(propsData.prop) ? propsData.prop : [propsData.prop];
        const parsedProperties: Property[] = [];
        const propertyMap = new Map<string, Property>();

        propList.filter(Boolean).forEach((propData: any) => {
          const name = propData['@_name'] || '';
          const xmlTitle = propData['@_title'] || name;
          const xmlType = propData['@_type'] || 'string';
          const xmlOptions = propData['@_options'] || '';

          let value: any;
          let finalType: any = xmlType;
          let fields: Property[] = [];
          let itemFields: Property[] = [];
          let options: any[] = [];

          // Check if property has XML options structure
          if (propData.value && propData.options) {
            // Property with XML options structure
            value = propData.value['#text'] || propData.value;
            const optionList = Array.isArray(propData.options.option) ? propData.options.option : [propData.options.option];
            options = optionList.filter(Boolean).map((opt: any) => opt['#text'] || opt);
          } else if (xmlOptions) {
            // Fallback to old JSON format
            try {
              const unescapedOptions = unescapeXml(xmlOptions);
              options = JSON.parse(unescapedOptions);
            } catch (e) {
              console.warn(`Failed to parse options for property ${name}:`, e);
            }
            value = propData['#text'] || '';
          } else {
            // Simple property
            value = propData['#text'] || '';
          }

          if (xmlType === 'object') {
            // Parse nested object structure using fast-xml-parser
            const parsedObject: any = {};

            if (propData.field) {
              const fieldList = Array.isArray(propData.field) ? propData.field : [propData.field];

              fieldList.filter(Boolean).forEach((fieldData: any) => {
                const fieldName = fieldData['@_name'] || '';
                const fieldTitle = fieldData['@_title'] || fieldName;
                const fieldType = fieldData['@_type'] || 'string';

                let fieldValue: any;
                let fieldOptionsArray: any[] = [];

                if (fieldType === 'select') {
                  // Parse select field with XML options structure
                  if (fieldData.value && fieldData.options) {
                    fieldValue = fieldData.value['#text'] || fieldData.value;
                    const optionList = Array.isArray(fieldData.options.option) ? fieldData.options.option : [fieldData.options.option];
                    fieldOptionsArray = optionList.filter(Boolean).map((opt: any) => opt['#text'] || opt);
                  } else {
                    fieldValue = fieldData['#text'] || '';
                  }
                } else {
                  // Simple field
                  fieldValue = fieldData['#text'] || '';
                }

                parsedObject[fieldName] = fieldValue;

                const fieldDef: any = {
                  id: fieldName,
                  title: fieldTitle,
                  type: fieldType,
                  value: fieldValue
                };

                if (fieldOptionsArray.length > 0) {
                  fieldDef.options = fieldOptionsArray;
                }

                fields.push(fieldDef as Property);
              });
            }

            value = parsedObject;
          } else if (xmlType === 'object-list') {
            // Parse nested array structure using fast-xml-parser
            const parsedArray: any[] = [];

            if (propData.item) {
              const itemList = Array.isArray(propData.item) ? propData.item : [propData.item];

              // Get field definitions from first item
              if (itemList.length > 0 && itemList[0].field) {
                const firstItemFields = Array.isArray(itemList[0].field) ? itemList[0].field : [itemList[0].field];
                itemFields = firstItemFields.filter(Boolean).map((fieldData: any) => {
                  const fieldName = fieldData['@_name'] || '';
                  const fieldTitle = fieldData['@_title'] || fieldName;
                  const fieldType = fieldData['@_type'] || 'string';

                  const fieldDef: any = {
                    id: fieldName,
                    title: fieldTitle,
                    type: fieldType,
                    value: ''
                  };

                  // Extract options if present
                  if (fieldData.options) {
                    const optionList = Array.isArray(fieldData.options.option) ? fieldData.options.option : [fieldData.options.option];
                    fieldDef.options = optionList.filter(Boolean).map((opt: any) => opt['#text'] || opt);
                  }

                  return fieldDef as Property;
                });
              }

              // Parse each item
              itemList.filter(Boolean).forEach((itemData: any) => {
                const itemObject: any = {};

                if (itemData.field) {
                  const fieldList = Array.isArray(itemData.field) ? itemData.field : [itemData.field];

                  fieldList.filter(Boolean).forEach((fieldData: any) => {
                    const fieldName = fieldData['@_name'] || '';
                    const fieldType = fieldData['@_type'] || 'string';

                    let fieldValue: any;
                    if (fieldType === 'select' && fieldData.value) {
                      fieldValue = fieldData.value['#text'] || fieldData.value;
                    } else {
                      fieldValue = fieldData['#text'] || '';
                    }

                    itemObject[fieldName] = fieldValue;
                  });
                }

                parsedArray.push(itemObject);
              });
            }

            value = parsedArray;
          }

          // Create property object
          const property: any = {
            id: name,
            title: xmlTitle,
            type: finalType,
            value
          };

          if (options.length > 0) {
            property.options = options;
          }

          if (fields.length > 0) {
            property.fields = fields;
          }

          if (itemFields.length > 0) {
            property.itemFields = itemFields;
          }

          // Add to parsed properties list
          parsedProperties.push(property as Property);

          // Add to map for de-duplication (last value wins)
          propertyMap.set(name, property as Property);
        });

        // Use de-duplicated properties (last value wins)
        properties = Array.from(propertyMap.values());
      }

      return {
        id,
        title,
        prompt: unescapeXml(description),
        state: (buildStatus as any) || 'unbuilt',
        properties
      } as GraphNode;
    });

    const edges: Array<{ id: string; source: string; target: string; role?: string }> = [];

    // Parse edges using fast-xml-parser
    if (edgesData?.edge) {
      const edgeList = Array.isArray(edgesData.edge) ? edgesData.edge : [edgesData.edge];

      edgeList.filter(Boolean).forEach((edgeData: any) => {
        const id = edgeData['@_id'] || `${edgeData['@_source']}-${edgeData['@_target']}`;
        const source = edgeData['@_source'] || '';
        const target = edgeData['@_target'] || '';
        const role = edgeData['@_role'];

        if (source && target) {
          edges.push({ id, source, target, role });
        }
      });
    }

    // Validate edges
    edges.forEach(edge => {
      if (!edge.source || !edge.target) {
        throw new Error(`Invalid edge: missing source or target: ${JSON.stringify(edge)}`);
      }
    });

    const g: Graph = { nodes, edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) as any } as Graph;
    return g;
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
}

interface Graph {
  nodes: GraphNode[];
  edges: Array<{ id: string; source: string; target: string }>;
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
  // Shared schemas loaded
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
      return { graph: parsed, rawXml: xml } as any; // Include rawXml for API XML responses
    }
    return res.json() as any;
  } catch (e) {
    const alt = withLocalhostFallback(url);
    if (alt) {
      // eslint-disable-next-line no-console
      // GET fallback attempted
      try {
        const headers = buildAuthHeaders(token);
        headers['Accept'] = 'application/xml,application/json;q=0.5';
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
        // eslint-disable-next-line no-console
        // GET alt fetch failed
      }
    }
    // Final fallback: read local graph from filesystem if available
    const local = readLocalGraph();
    if (local) {
      // eslint-disable-next-line no-console
      // GET local fallback: using _graph/graph.xml
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
      // eslint-disable-next-line no-console
      // POST fallback attempted
      try {
        const res = await fetch(alt, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`POST ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        // eslint-disable-next-line no-console
        // POST alt fetch failed
      }
    }
    // Local mode write: treat POST as PUT for local graph update if a graph is present
    if (body && body.graph) {
      try {
        writeLocalGraph(body.graph);
        // eslint-disable-next-line no-console
        // POST local fallback: wrote _graph/graph.xml
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
      // PUT fallback attempted
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
        const res = await fetch(alt, { method: 'PUT', headers, body: payload });
        if (!res.ok) throw new Error(`PUT ${alt} failed: ${res.status}`);
        return res.json() as any;
      } catch (e2) {
        // eslint-disable-next-line no-console
        // PUT alt fetch failed
      }
    }
    if (body && body.graph) {
      try {
        writeLocalGraph(body.graph);
        // eslint-disable-next-line no-console
        // PUT local fallback: wrote _graph/graph.xml
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

// Helper functions for XML generation
function toPropTypeAttr(p: Property): string {
  const t = (p as any)?.type;
  if (!t) return 'string';
  if (t === 'object' || t === 'object-list') return 'json';
  return String(t);
}

function valueToText(p: Property): string {
  const v = (p as any)?.value;
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function generateNestedXml(p: Property): string {
  const type = (p as any)?.type;

  if (type === 'object' && (p as any)?.fields) {
    // Generate nested object structure
    const fields = (p as any).fields as Property[];
    const fieldXml = fields.map(field => {
      const fieldValue = (p as any)?.value?.[field.id];
      return generateFieldXml(field, fieldValue);
    }).join('\n        ');
    return `\n        ${fieldXml}\n      `;
  } else if (type === 'object-list' && (p as any)?.itemFields) {
    // Generate nested array structure
    const items = Array.isArray((p as any)?.value) ? (p as any).value : [];
    const itemFields = (p as any).itemFields as Property[];
    const itemXml = items.map((item: any, index: number) => {
      const itemFieldXml = itemFields.map(field => {
        const fieldValue = item[field.id];
        return generateFieldXml(field, fieldValue);
      }).join('\n          ');
      return `        <item index="${index}">\n          ${itemFieldXml}\n        </item>`;
    }).join('\n');
    return `\n${itemXml}\n      `;
  } else {
    // Simple value
    return escapeXml(valueToText(p));
  }
}

function generateFieldXml(field: Property, fieldValue: any): string {
  const options = (field as any)?.options;

  // Handle any field type that has options
  if (Array.isArray(options) && options.length > 0) {
    // Field with options as XML elements
    const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">
          <value>${escapeXml(valueToText({...field, value: fieldValue}))}</value>
          <options>
${optionsXml}
          </options>
        </field>`;
  } else if (field.type === 'object' && field.fields) {
    // Nested object
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${generateNestedXml({...field, value: fieldValue})}</field>`;
  } else {
    // Simple field
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${escapeXml(valueToText({...field, value: fieldValue}))}</field>`;
  }
}

// Toolset is chosen at startup by the MCP based on env

export type Toolset = 'graph-editor' | 'read-only';

export function registerGraphTools(server: McpServer, toolset: Toolset) {
  // eslint-disable-next-line no-console
  // Registering graph tools
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
      // Check if we have raw XML (from local fallback) - return it directly
      if (data.rawXml) {
        return { content: [{ type: 'text', text: data.rawXml }] };
      }

      // Otherwise, parse and return JSON (for API responses)
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

  // graph_edge_create
  if (toolset === 'graph-editor') server.registerTool(
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
      const existingEdge = graph.edges.find((e: any) => e.source === sourceId && e.target === targetId);
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

  // add_node (graph-editor only)
  if (toolset === 'graph-editor') server.registerTool(
    'add_node',
    {
      title: 'Add Node',
      description: 'Create a new node and persist it to the graph.',
      inputSchema: {
        nodeId: z.string().min(1),
        title: z.string().min(1),
        prompt: z.string().min(1),
        properties: z.array(PropertySchema).optional(),
        state: z.enum(['built','unbuilt','building']).optional(),
      },
    },
    async ({ nodeId, title, prompt, properties, state }) => {
      const origin = resolveBaseUrl(); const token = resolveAccessToken(); const url = `${origin}/api/graph-api`;
      const data = await httpGet(url, token); const parsed = GraphSchema.safeParse(data.graph ?? data); if (!parsed.success) throw new Error('Graph schema validation failed');
      const graph = parsed.data;
      if (graph.nodes.find((n: any) => n.id === nodeId)) throw new Error(`Node ${nodeId} already exists`);
      const node: any = { id: nodeId, title, prompt, properties: Array.isArray(properties) ? properties : [], state: state ?? 'unbuilt' };
      graph.nodes.push(node);
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
