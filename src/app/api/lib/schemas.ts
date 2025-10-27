/**
 * Shared Schema Definitions
 * 
 * This file contains Zod schemas for message validation and type checking
 * used both by the frontend client and backend API.
 */

// Define shared schemas for graph + properties to keep UI, backend, and CLI in sync
import { z } from 'zod';

export const PropertyTypeEnum = z.enum([
  'color',
  'text',
  'number',
  'select',
  'boolean',
  'checkbox',
  'radio',
  'slider',
  'font',
  'object',
  'object-list'
]);
export type PropertyType = z.infer<typeof PropertyTypeEnum>;

export const PropertySchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string().describe('Unique identifier for the property (should follow pattern: property-name)'),
  title: z.string().describe('Human-readable title/name for the property'),
  type: PropertyTypeEnum.describe('The type of property'),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any()), z.record(z.any())]).optional(),
  options: z.array(z.string()).nullable().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  fields: z.array(z.lazy(() => PropertySchema)).optional(),
  itemFields: z.array(z.lazy(() => PropertySchema)).optional(),
  itemTitle: z.string().optional(),
  addLabel: z.string().optional(),
}));
export type Property = z.infer<typeof PropertySchema>;

export const NodeMetadataSchema = z.object({
  files: z.array(z.string().min(1).trim()).default([]),
  bugs: z.array(z.string().min(1).trim()).optional().default([])
});
export type NodeMetadata = z.infer<typeof NodeMetadataSchema>;

export const MetadataInputSchema = z.union([
  NodeMetadataSchema,
  z.array(z.string().min(1).trim()),
  z.string().min(1).trim(),
  // Allow more flexible nested structures that will be normalized
  z.object({
    files: z.union([
      z.array(z.string().min(1).trim()),
      z.object({ files: z.array(z.string().min(1).trim()) }),
      z.array(z.object({ files: z.array(z.string().min(1).trim()) }))
    ])
  })
]);
export type MetadataInput = z.infer<typeof MetadataInputSchema>;

export const C4LevelEnum = z.enum([
  'system',
  'container',
  'component',
  'code'
]);
export type C4Level = z.infer<typeof C4LevelEnum>;

export const NodeTypeEnum = z.enum([
  'system',
  'container',
  'component',
  'code',
  'comment'
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  comment: z.string().optional(),
  type: NodeTypeEnum,
  level: C4LevelEnum.optional(),
  shape: z.enum(['rectangle', 'circle', 'comment', 'diamond', 'hexagon', 'arrow-rectangle', 'cylinder', 'parallelogram', 'round-rectangle']).optional(),
  properties: z.array(PropertySchema).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  metadata: NodeMetadataSchema.optional()
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  role: z.string().optional(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  shape: z.enum(['refines', 'relates']).optional(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export const GraphSchema = z.object({ nodes: z.array(GraphNodeSchema), edges: z.array(GraphEdgeSchema).optional() });
export type Graph = z.infer<typeof GraphSchema>;

// Message context for providing file information
export const MessageContextSchema = z.object({
  currentFile: z.string().optional(),
});

export type MessageContext = z.infer<typeof MessageContextSchema>;

// Message variables for template substitution
export const MessageVariablesSchema = z.object({
  // User request
  USER_REQUEST: z.string().optional(),
  
  // File context
  PROJECT_FILES: z.array(
    z.union([
      z.string(),
      z.object({
        route: z.string(),
        lines: z.number().optional(),
      })
    ])
  ).optional(),
  CURRENT_FILE: z.string().optional(),
  CURRENT_FILE_CONTENT: z.string().optional(),
  
  // Graph context
  GRAPH_CONTEXT: z.string().optional(),
  GRAPH_DATA: z.string().optional(),
  GRAPH_NODE_COUNT: z.string().optional(),
  
  
  // Node-specific context
  NODE_ID: z.string().optional(),
  PREVIOUS_PROMPT: z.string().optional(),
  NEW_PROMPT: z.string().optional(),
  SELECTED_NODE_IDS: z.string().optional(),
  SELECTED_NODE_ID: z.string().optional(),
  SELECTED_NODE_TITLE: z.string().optional(),
  SELECTED_NODE_PROMPT: z.string().optional(),
  SELECTED_NODE_COUNT: z.string().optional(),
  STRICT_EDIT_MODE: z.string().optional(),
  EDIT_HINTS: z.string().optional(),
  
  // Assistant response
  ASSISTANT_RESPONSE: z.string().optional(),
  
  // Additional context
  MAX_NODES: z.string().optional(),
});

export type MessageVariables = z.infer<typeof MessageVariablesSchema>;

// Message schema
export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  variables: MessageVariablesSchema.optional(),
  messageContext: MessageContextSchema.optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// Parsed message for template processing
export const ParsedMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;


// Client chat request schema
export const ClientChatRequestSchema = z.object({
  message: z.string(),
  currentFile: z.string().optional(),
});

export type ClientChatRequest = z.infer<typeof ClientChatRequestSchema>;

// Property and Graph schemas are defined above

// Evaluation schemas
export const TestCaseSchema = z.object({
  id: z.string().optional(),
  input: z.string(),
  // Optional context for each test case
  currentFile: z.string().optional()
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const EvalDatasetSchema = z.object({
  dataset: z.array(TestCaseSchema),
});

export type EvalDataset = z.infer<typeof EvalDatasetSchema>;

export const EvalResultSchema = z.object({
  testCaseId: z.string(),
  input: z.string(),
  aiResponse: z.string(),
  judgeScore: z.number(),
  judgeReasoning: z.string(),
  toolCalls: z.array(z.any()).optional(),
  fileOperations: z.array(z.any()).optional(),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

export const EvalJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  progress: z.number(), // 0-100
  results: z.array(EvalResultSchema),
  statistics: z.object({
    average: z.number(),
    median: z.number(),
    standardDeviation: z.number(),
    count: z.number(),
  }).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
});

export type EvalJob = z.infer<typeof EvalJobSchema>;

export const EvalRequestSchema = z.object({
  dataset: z.array(TestCaseSchema),
});

export type EvalRequest = z.infer<typeof EvalRequestSchema>;

// Property generation schema - uses unified property type schema
export const PropertyGenerationSchema = z.object({
  properties: z.array(PropertySchema).optional(),
});

export type PropertyGeneration = z.infer<typeof PropertyGenerationSchema>;

// File system schemas
export const FileNodeSchema: z.ZodType<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: Array<any>;
    content?: string;
  }>;
  content?: string;
}> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.array(z.lazy(() => FileNodeSchema)).optional(),
  content: z.string().optional(),
});

export type FileNode = z.infer<typeof FileNodeSchema>;

// Chat service schemas
export const ChatServiceStateSchema = z.object({
  isConnected: z.boolean(),
  isConnecting: z.boolean(),
  error: z.string().nullable(),
  messages: z.array(MessageSchema),
  currentMessage: z.string(),
});

export type ChatServiceState = z.infer<typeof ChatServiceStateSchema>;

export const ChatServiceActionsSchema = z.object({
  sendMessage: z.function().args(z.string()).returns(z.promise(z.void())),
  clearMessages: z.function().returns(z.void()),
  setCurrentMessage: z.function().args(z.string()).returns(z.void()),
});

export type ChatServiceActions = z.infer<typeof ChatServiceActionsSchema>;

// MCP Server configuration for serialization
export const McpServerConfigSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
  tools: z.array(z.string()).optional(), // Tool names that should be enabled
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// Claude Code request schemas
// Import Options type from Claude SDK and use it directly
import type { Options } from '@anthropic-ai/claude-agent-sdk';

// Create a schema that uses the Claude SDK Options type
export const ClaudeCodeOptionsSchema = z.custom<Options>((val) => {
  // Basic validation that it's an object
  return typeof val === 'object' && val !== null;
}, {
  message: "Invalid Claude Code options"
});

export type ClaudeCodeOptions = z.infer<typeof ClaudeCodeOptionsSchema>;

export const ClaudeCodeRequestSchema = z.object({
  prompt: z.string(),
  userId: z.string(),
  options: ClaudeCodeOptionsSchema.optional(),
});

export type ClaudeCodeRequest = z.infer<typeof ClaudeCodeRequestSchema>;

// Property code service schemas
export const CodeUpdateSchema = z.object({
  file: z.string(),
  start: z.number(),
  end: z.number(),
  newCode: z.string(),
  newValue: z.string().optional(),
  propertyId: z.string().optional(),
});

export type CodeUpdate = z.infer<typeof CodeUpdateSchema>;

// Graph event schemas
export const GraphUpdateEventSchema = z.object({
  type: z.literal('graph-update'),
  graph: GraphSchema,
});

export type GraphUpdateEvent = z.infer<typeof GraphUpdateEventSchema>;

// Property generation request/response schemas
export const GeneratePropertiesRequestSchema = z.object({
  graph: GraphSchema,
  nodeId: z.string(),
  generatedCode: z.string(),
  filePath: z.string(),
});

export type GeneratePropertiesRequest = z.infer<typeof GeneratePropertiesRequestSchema>;

export const GeneratePropertiesResponseSchema = z.object({
  success: z.boolean(),
  properties: z.array(PropertySchema).optional(),
  error: z.string().optional(),
});

export type GeneratePropertiesResponse = z.infer<typeof GeneratePropertiesResponseSchema>;

// Project store schemas
export const ProjectStoreSchema = z.object({
  files: z.instanceof(Map),
  currentFile: z.string().nullable(),
  selectedFile: z.string().nullable(),
  fileTree: z.array(FileNodeSchema),
  refreshTrigger: z.number(),
  selectedNodeId: z.string().nullable(),
  selectedNode: GraphNodeSchema.nullable(),
  graph: GraphSchema.nullable(),
  graphLoading: z.boolean(),
  graphError: z.string().nullable(),
});

export type ProjectStore = z.infer<typeof ProjectStoreSchema>; 

// Graph quick patch schemas
export const GraphQuickPatchResponseSchema = z.object({
  success: z.boolean(),
  patched_graph: GraphSchema,
  error_message: z.string().optional(),
});

export type GraphQuickPatchResponse = z.infer<typeof GraphQuickPatchResponseSchema>;

// Partial code generation schemas
export const PartialCodeGenerationResponseSchema = z.object({
  success: z.boolean(),
  generated_code: z.string(),
  error_message: z.string().optional(),
});

export type PartialCodeGenerationResponse = z.infer<typeof PartialCodeGenerationResponseSchema>;

// XML conversion utilities
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Configure XML parser for our use case
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

// Lightweight XML helpers (no external deps)
function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(text: string): string {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAttrBlock(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function extractTagContent(xml: string, tag: string): string | null {
  // More precise extraction that handles nested structures better
  const regex = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[2] : null;
}

function collectTags(xml: string, tag: string): Array<{ attrs: Record<string,string>; inner: string }>
{
  const out: Array<{ attrs: Record<string,string>; inner: string }> = [];

  // Use a more targeted approach to find tags only at the current level
  // This prevents finding tags from nested content that shouldn't be included
  const lines = xml.split('\n');
  let currentDepth = 0;
  let currentTagContent = '';
  let currentAttrs = '';
  let inTargetTag = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes(`<${tag}`) && !inTargetTag) {
      // Start of target tag
      inTargetTag = true;
      currentDepth = 0;
      currentTagContent = line;

      // Extract attributes
      const attrMatch = line.match(new RegExp(`<${tag}(\\s[^>]*)`));
      currentAttrs = attrMatch ? attrMatch[1] || '' : '';

    } else if (inTargetTag) {
      currentTagContent += '\n' + line;

      // Count opening and closing tags
      const openTags = (line.match(new RegExp(`<[^/][^>]*>`, 'g')) || []).length;
      const closeTags = (line.match(new RegExp(`</[^>]*>`, 'g')) || []).length;
      const selfCloseTags = (line.match(new RegExp(`<[^>]+/>`, 'g')) || []).length;

      currentDepth += openTags - closeTags;

      if (line.includes(`</${tag}>`) && currentDepth <= 0) {
        // End of target tag
        const innerMatch = currentTagContent.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*)</${tag}>`));
        if (innerMatch) {
          out.push({
            attrs: parseAttrBlock(currentAttrs),
            inner: innerMatch[1] || ''
          });
        }
        inTargetTag = false;
        currentTagContent = '';
        currentAttrs = '';
      }
    }
  }

  return out;
}

function toPropTypeAttr(p: Property): string {
  const t = (p as any)?.type;
  if (!t) return 'string';
  // Preserve declared type; nested types are emitted with proper nested XML
  return String(t);
}

function valueToText(p: Property): string {
  const v = (p as any)?.value;
  const type = (p as any)?.type;

  if (v === undefined || v === null) return '';

  // For boolean properties, use "true"/"false" strings
  if (type === 'boolean') {
    return v === true || v === 'true' ? 'true' : 'false';
  }

  // For number properties, ensure it's stored as a string representation of the number
  if (type === 'number') {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') {
      const num = Number(v);
      return Number.isFinite(num) ? String(num) : v;
    }
    return String(v);
  }

  // For select properties, the value should be one of the options
  if (type === 'select' && typeof v === 'string') {
    return v;
  }

  // For color properties, store as-is (could be hex, rgba, etc.)
  if (type === 'color' && typeof v === 'string') {
    return v;
  }

  // For text and other string-based properties
  if (typeof v === 'string') return v;

  // For arrays and objects (object-list, object types handle this differently)
  try { return JSON.stringify(v); } catch { return String(v); }
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
  } else if ((field.type === 'object' && (field as any).fields) || field.type === 'object-list') {
    // Nested object or object-list
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${generateNestedXml({...field, value: fieldValue})}</field>`;
  } else {
    // Simple field
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${escapeXml(valueToText({...field, value: fieldValue}))}</field>`;
  }
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
  } else if (type === 'object-list') {
    // Generate nested array structure
    let items = Array.isArray((p as any)?.value) ? (p as any).value : [];
    let itemFields = Array.isArray((p as any)?.itemFields) ? (p as any).itemFields as Property[] : [];
    // Support alternate schema: p.item as a map of fieldId -> fieldDef
    if ((!itemFields || itemFields.length === 0) && (p as any)?.item && typeof (p as any).item === 'object' && !Array.isArray((p as any).item)) {
      const itemMap = (p as any).item as Record<string, any>;
      itemFields = Object.keys(itemMap).map((key) => {
        const def = itemMap[key] || {};
        const t = def.type || 'text';
        const fld: any = { id: key, title: def.title || key, type: t };
        if (Array.isArray(def.options)) fld.options = def.options;
        if (def.fields) fld.fields = def.fields;
        if (def.itemFields) fld.itemFields = def.itemFields;
        if (def.value !== undefined) fld.value = def.value;
        return fld as Property;
      });
    }
    // Support alternate value shape: p.items is an array of objects with nested field definitions
    if (Array.isArray((p as any)?.items) && (p as any).items.length > 0) {
      const srcItems: any[] = (p as any).items;
      // Build itemFields union from first occurrence of each field across items if not present
      if (!itemFields || itemFields.length === 0) {
        const fieldMap: Record<string, any> = {};
        for (const it of srcItems) {
          if (it && typeof it === 'object') {
            for (const key of Object.keys(it)) {
              if (!fieldMap[key]) {
                const fd = it[key] || {};
                fieldMap[key] = { id: key, title: fd.title || key, type: fd.type || 'text', options: Array.isArray(fd.options) ? fd.options : undefined };
              }
            }
          }
        }
        itemFields = Object.values(fieldMap) as any;
      }
      // Convert srcItems to plain values array aligned to itemFields
      items = srcItems.map((it) => {
        const obj: any = {};
        for (const field of itemFields) {
          const cell = it?.[field.id];
          obj[field.id] = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : (cell ?? '');
        }
        return obj;
      });
    }
    // If there are no items but we do have itemFields, emit a single template item for schema
    const effectiveItems = items.length > 0 ? items : (itemFields && itemFields.length > 0 ? [Object.fromEntries(itemFields.map((f: any) => [f.id, (f.value ?? '')]))] : []);
    const itemXml = effectiveItems.map((item: any, index: number) => {
      let fieldsToUse = itemFields;
      // If schema missing, infer per item keys minimally for round-trip
      if (!fieldsToUse || fieldsToUse.length === 0) {
        const keys = Object.keys(item || {});
        fieldsToUse = keys.map((k) => ({ id: k, title: k, type: typeof item[k] === 'number' ? 'number' : typeof item[k] === 'boolean' ? 'boolean' : (typeof item[k] === 'object' && item[k] !== null) ? (Array.isArray(item[k]) ? 'object-list' : 'object') : 'text' } as any));
      }
      const itemFieldXml = fieldsToUse.map(field => {
        const fieldValue = item ? item[field.id] : undefined;
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

function optionsToText(p: Property): string {
  const options = (p as any)?.options;
  if (!options || !Array.isArray(options)) return '';
  try { return JSON.stringify(options); } catch { return ''; }
}

export function graphToXml(graph: Graph): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>`;
  const ns = `xmlns="urn:app:graph"`;
  const directed = `directed="true"`;
  const version = `version="1.0"`;

  // No longer tracking children since we use edges exclusively

  const nodes = (graph.nodes || []).map((n: GraphNode) => {
    const desc = n.description ? `\n      <description>${escapeXml(n.description)}</description>` : '';
    const props = Array.isArray((n as any).properties) && (n as any).properties.length > 0
      ? `\n      <props>\n${((n as any).properties as Property[]).map((p) => {
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
        }).join("\n")}\n      </props>`
      : '';
    return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}">${desc}${props}\n    </node>`;
  }).join('\n\n');

  const allEdges = (graph as any).edges || [] as Array<{ id?: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string }>;
  const edges = allEdges.map((e: { id?: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string }) => {
    const role = (e as any).role || 'links-to';
    const id = e.id || `${e.source}-${e.target}`;
    const sh = (e as any).sourceHandle ? ` sourceHandle="${escapeXml(String((e as any).sourceHandle))}"` : '';
    const th = (e as any).targetHandle ? ` targetHandle="${escapeXml(String((e as any).targetHandle))}"` : '';
    return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"${sh}${th}/>`;
  }).join('\n');

  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}

function parsePropValue(type: string | undefined, text: string): any {
  const t = (type || '').toLowerCase();
  const raw = unescapeXml(text || '').trim();

  if (t === 'boolean') {
    if (raw.toLowerCase() === 'true' || raw === '1') return true;
    if (raw.toLowerCase() === 'false' || raw === '0') return false;
    // For legacy compatibility, check for other boolean-like strings
    if (raw.toLowerCase() === 'enabled' || raw.toLowerCase() === 'yes' || raw.toLowerCase() === 'on') return true;
    if (raw.toLowerCase() === 'disabled' || raw.toLowerCase() === 'no' || raw.toLowerCase() === 'off') return false;
    return raw; // fallback to original string if unclear
  }

  if (t === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }

  if (t === 'select') {
    // Select values should remain as strings
    return raw;
  }

  if (t === 'color') {
    // Color values should remain as strings (hex, rgba, etc.)
    return raw;
  }

  // Parse JSON content for json type or if it looks like JSON
  if (t === 'json' || raw.startsWith('{') || raw.startsWith('[')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }

  return raw;
}

export function xmlToGraph(xml: string): Graph {
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

      // Parse properties using fast-xml-parser
      const propsData = nodeData.props;
      let properties: Property[] = [];

      if (propsData?.prop) {
        const propList = Array.isArray(propsData.prop) ? propsData.prop : [propsData.prop];
        const parsedProperties: Property[] = [];
        const propertyMap = new Map<string, Property>();

        // Helper: normalize xml option entries to strings
        const readOptions = (optContainer: any): string[] => {
          if (!optContainer) return [];
          const list = Array.isArray(optContainer.option) ? optContainer.option : [optContainer.option];
          return list.filter(Boolean).map((o: any) => (typeof o === 'object' ? (o['#text'] ?? '') : o)).map((s: any) => String(s));
        };

        // Helper: coerce primitive by type
        const coerce = (t: string | undefined, v: any) => {
          const str = typeof v === 'string' ? v : String(v ?? '');
          return parsePropValue(t, str);
        };

        // Recursively parse a <field> element to a pair [value, fieldDef]
        const parseField = (fieldData: any): { value: any; def: Property } => {
          const fieldName = fieldData['@_name'] || '';
          const fieldTitle = fieldData['@_title'] || fieldName;
          const fieldType = (fieldData['@_type'] || 'string') as any;

          // Select with nested <value> and <options>
          if (fieldType === 'select') {
            const fieldValue = coerce('string', fieldData.value?.['#text'] ?? fieldData.value ?? fieldData['#text'] ?? '');
            const fieldOptions = readOptions(fieldData.options);
            const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: fieldValue };
            if (fieldOptions.length) def.options = fieldOptions;
            return { value: fieldValue, def };
          }

          // Nested object
          if (fieldType === 'object') {
            const obj: any = {};
            const fields: Property[] = [];
            const fieldList = fieldData.field ? (Array.isArray(fieldData.field) ? fieldData.field : [fieldData.field]) : [];
            fieldList.filter(Boolean).forEach((fd: any) => {
              const parsed = parseField(fd);
              obj[parsed.def.id] = parsed.value;
              fields.push(parsed.def);
            });
            const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: obj };
            if (fields.length) def.fields = fields;
            return { value: obj, def };
          }

          // Nested object list
          if (fieldType === 'object-list') {
            const items: any[] = [];
            const itemFields: Property[] = [];
            const itemList = fieldData.item ? (Array.isArray(fieldData.item) ? fieldData.item : [fieldData.item]) : [];
            if (itemList.length > 0 && itemList[0]?.field) {
              const firstItemFields = Array.isArray(itemList[0].field) ? itemList[0].field : [itemList[0].field];
              firstItemFields.filter(Boolean).forEach((fd: any) => {
                const parsed = parseField(fd);
                // Field defs for itemFields should not hold item values
                const { value: _v, def } = parsed;
                def.value = undefined as any;
                itemFields.push(def);
              });
            }
            itemList.filter(Boolean).forEach((it: any) => {
              const itemObj: any = {};
              const fieldsForItem = it.field ? (Array.isArray(it.field) ? it.field : [it.field]) : [];
              fieldsForItem.filter(Boolean).forEach((fd: any) => {
                const parsed = parseField(fd);
                itemObj[parsed.def.id] = parsed.value;
              });
              items.push(itemObj);
            });
            const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: items };
            if (itemFields.length) def.itemFields = itemFields;
            return { value: items, def };
          }

          // Simple types
          const text = fieldData['#text'] ?? '';
          const coerced = coerce(fieldType, text);
          const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: coerced };
          return { value: coerced, def };
        };

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
            options = readOptions(propData.options);
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
            const fieldList = propData.field ? (Array.isArray(propData.field) ? propData.field : [propData.field]) : [];
            fieldList.filter(Boolean).forEach((fd: any) => {
              const parsed = parseField(fd);
              parsedObject[parsed.def.id] = parsed.value;
              fields.push(parsed.def);
            });

            value = parsedObject;
          } else if (xmlType === 'object-list') {
            // Parse nested array structure using fast-xml-parser
            const parsedArray: any[] = [];
            const itemList = propData.item ? (Array.isArray(propData.item) ? propData.item : [propData.item]) : [];

            // Build itemFields from first item
            if (itemList.length > 0 && itemList[0]?.field) {
              const firstItemFields = Array.isArray(itemList[0].field) ? itemList[0].field : [itemList[0].field];
              itemFields = firstItemFields.filter(Boolean).map((fd: any) => {
                const parsed = parseField(fd);
                const def = parsed.def as any;
                def.value = undefined; // definitions don't store concrete item value
                return def as Property;
              });
            }

            // Parse each item
            itemList.filter(Boolean).forEach((it: any) => {
              const itemObj: any = {};
              const fieldsForItem = it.field ? (Array.isArray(it.field) ? it.field : [it.field]) : [];
              fieldsForItem.filter(Boolean).forEach((fd: any) => {
                const parsed = parseField(fd);
                itemObj[parsed.def.id] = parsed.value;
              });
              parsedArray.push(itemObj);
            });

            value = parsedArray;
          }

          // Coerce primitive property values for non-object types
          if (finalType !== 'object' && finalType !== 'object-list') {
            value = coerce(finalType, value);
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
        description: unescapeXml(description),
        properties
      } as GraphNode;
    });

    const edges: Array<{ id: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string }> = [];

    // Parse edges using fast-xml-parser
    if (edgesData?.edge) {
      const edgeList = Array.isArray(edgesData.edge) ? edgesData.edge : [edgesData.edge];

      edgeList.filter(Boolean).forEach((edgeData: any) => {
        const id = edgeData['@_id'] || `${edgeData['@_source']}-${edgeData['@_target']}`;
        const source = edgeData['@_source'] || '';
        const target = edgeData['@_target'] || '';
        const role = edgeData['@_role'];
        const sourceHandle = edgeData['@_sourceHandle'] || undefined;
        const targetHandle = edgeData['@_targetHandle'] || undefined;

        if (source && target) {
          edges.push({ id, source, target, role, sourceHandle, targetHandle });
        }
      });
    }

    // Validate edges
    edges.forEach(edge => {
      if (!edge.source || !edge.target) {
        throw new Error(`Invalid edge: missing source or target: ${JSON.stringify(edge)}`);
      }
    });

    const g: Graph = {
      nodes,
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, role: e.role, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })) as any,
    } as Graph;
    return g;
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
