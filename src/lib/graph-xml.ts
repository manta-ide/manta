import type { Graph, GraphNode, Property, NodeMetadata, NodeType } from '@/app/api/lib/schemas';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import path from 'path';

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

// Attempt to repair common UTF-8/Latin1 mojibake (e.g., â€™ -> ’)
function repairTextEncoding(text: string): string {
  try {
    if (!text) return text;
    // Quick heuristic: apply fix if we detect common mojibake markers
    if (/[ÃÂâ]/.test(text)) {
      const repaired = Buffer.from(text, 'latin1').toString('utf8');
      // Prefer repaired if it reduces mojibake markers
      const badBefore = (text.match(/Ã|Â|â/g) || []).length;
      const badAfter = (repaired.match(/Ã|Â|â/g) || []).length;
      return badAfter < badBefore ? repaired : text;
    }
  } catch {}
  return text;
}

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

function normalizeMetadataFiles(metadata?: NodeMetadata | null): string[] {
  if (!metadata || !Array.isArray(metadata.files)) return [];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const entry of metadata.files) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    files.push(cleaned);
  }
  return files;
}

function normalizeMetadataBugs(metadata?: NodeMetadata | null): string[] {
  if (!metadata || !Array.isArray(metadata.bugs)) return [];
  const seen = new Set<string>();
  const bugs: string[] = [];
  for (const entry of metadata.bugs) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    bugs.push(cleaned);
  }
  return bugs;
}


function filesFromXml(metadataNode: any): string[] {
  if (!metadataNode) return [];
  const rawFiles = metadataNode.file;
  const entries = Array.isArray(rawFiles) ? rawFiles : (rawFiles !== undefined ? [rawFiles] : []);
  const result: string[] = [];
  const seen = new Set<string>();
  const projectRoot = process.cwd();

  for (const entry of entries) {
    let value: string | undefined;
    if (typeof entry === 'string') {
      value = entry;
    } else if (entry && typeof entry === 'object') {
      if (typeof entry['#text'] === 'string') {
        value = entry['#text'];
      } else if (typeof entry['@_route'] === 'string') {
        value = entry['@_route'];
      }
    }

    if (!value) continue;
    let cleaned = unescapeXml(repairTextEncoding(String(value))).trim();
    if (!cleaned || seen.has(cleaned)) continue;

    // Normalize path to handle any malformed paths with excessive ../ segments
    if (!path.isAbsolute(cleaned)) {
      // Normalize relative paths by resolving and making relative again
      cleaned = path.relative(projectRoot, path.resolve(projectRoot, cleaned));
      cleaned = cleaned.replace(/\\/g, '/');
      if (cleaned.startsWith('./')) {
        cleaned = cleaned.substring(2);
      }
    }

    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
}

function bugsFromXml(metadataNode: any): string[] {
  if (!metadataNode) return [];
  const rawBugs = metadataNode.bug;
  const entries = Array.isArray(rawBugs) ? rawBugs : (rawBugs !== undefined ? [rawBugs] : []);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    let value: string | undefined;
    if (typeof entry === 'string') {
      value = entry;
    } else if (entry && typeof entry === 'object') {
      if (typeof entry['#text'] === 'string') {
        value = entry['#text'];
      }
    }

    if (!value) continue;
    const cleaned = unescapeXml(repairTextEncoding(String(value))).trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
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
  const min = (field as any)?.min;
  const max = (field as any)?.max;
  const step = (field as any)?.step;
  const rangeAttrs = `${typeof min === 'number' ? ` min="${escapeXml(String(min))}"` : ''}${typeof max === 'number' ? ` max="${escapeXml(String(max))}"` : ''}${typeof step === 'number' ? ` step="${escapeXml(String(step))}"` : ''}`;

  // Handle any field type that has options
  if (Array.isArray(options) && options.length > 0) {
    // Field with options as XML elements
    const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}"${rangeAttrs}>
          <value>${escapeXml(valueToText({...field, value: fieldValue}))}</value>
          <options>
${optionsXml}
          </options>
        </field>`;
  } else if ((field.type === 'object' && (field as any).fields) || field.type === 'object-list') {
    // Nested object or object-list
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}"${rangeAttrs}>${generateNestedXml({...field, value: fieldValue})}</field>`;
  } else {
    // Simple field
    return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}"${rangeAttrs}>${escapeXml(valueToText({...field, value: fieldValue}))}</field>`;
  }
}

function generateNestedXml(p: Property): string {
  const type = (p as any)?.type;

  if (type === 'object') {
    let fields = (p as any)?.fields;

    // If no fields are defined but we have a value object, infer fields from the value keys
    if (!fields && (p as any)?.value && typeof (p as any).value === 'object' && !Array.isArray((p as any).value)) {
      fields = Object.keys((p as any).value).map((key) => ({
        id: key,
        title: key,
        type: 'text'  // Default to text type, will be overridden if the value suggests otherwise
      }));
    }

    if (fields && fields.length > 0) {
      // Generate nested object structure
      const fieldXml = fields.map((field: any) => {
        const fieldValue = (p as any)?.value?.[field.id];
        return generateFieldXml(field, fieldValue);
      }).join('\n        ');
      return `\n        ${fieldXml}\n      `;
    }
    // If object has no fields, return empty string
    return '';
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
    const metadataFiles = normalizeMetadataFiles((n as any).metadata);
    const metadataBugs = normalizeMetadataBugs((n as any).metadata);

    const metadataParts: string[] = [];
    if (metadataFiles.length > 0) {
      metadataParts.push(
        `        <files>\n${metadataFiles.map(file => `          <file>${escapeXml(file)}</file>`).join('\n')}\n        </files>`
      );
    }
    if (metadataBugs.length > 0) {
      metadataParts.push(
        `        <bugs>\n${metadataBugs.map(bug => `          <bug>${escapeXml(bug)}</bug>`).join('\n')}\n        </bugs>`
      );
    }

    let metadataXml = '';
    if (metadataParts.length > 0) {
      metadataXml = `\n      <metadata>\n${metadataParts.join('\n')}\n      </metadata>`;
    }
    const props = Array.isArray((n as any).properties) && (n as any).properties.length > 0
      ? `\n      <props>\n${((n as any).properties as Property[]).map((p) => {
          const propType = (p as any)?.type;
          const options = (p as any)?.options;

          if (propType === 'object' || propType === 'object-list') {
            // Use nested XML structure for objects and arrays
            const nestedContent = generateNestedXml(p);
            const min = (p as any)?.min;
            const max = (p as any)?.max;
            const step = (p as any)?.step;
            const rangeAttrs = `${typeof min === 'number' ? ` min="${escapeXml(String(min))}"` : ''}${typeof max === 'number' ? ` max="${escapeXml(String(max))}"` : ''}${typeof step === 'number' ? ` step="${escapeXml(String(step))}"` : ''}`;
            return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(propType)}"${rangeAttrs}>${nestedContent}</prop>`;
          } else if (Array.isArray(options) && options.length > 0) {
            // Property with options - use XML format
            const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
            const min = (p as any)?.min;
            const max = (p as any)?.max;
            const step = (p as any)?.step;
            const rangeAttrs = `${typeof min === 'number' ? ` min="${escapeXml(String(min))}"` : ''}${typeof max === 'number' ? ` max="${escapeXml(String(max))}"` : ''}${typeof step === 'number' ? ` step="${escapeXml(String(step))}"` : ''}`;
            return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(toPropTypeAttr(p))}"${rangeAttrs}>
          <value>${escapeXml(valueToText(p))}</value>
          <options>
${optionsXml}
          </options>
        </prop>`;
          } else {
            // Simple property without options
            const min = (p as any)?.min;
            const max = (p as any)?.max;
            const step = (p as any)?.step;
            const rangeAttrs = `${typeof min === 'number' ? ` min="${escapeXml(String(min))}"` : ''}${typeof max === 'number' ? ` max="${escapeXml(String(max))}"` : ''}${typeof step === 'number' ? ` step="${escapeXml(String(step))}"` : ''}`;
            return `        <prop name="${escapeXml(String((p as any).id || ''))}" title="${escapeXml(String((p as any).title || (p as any).id || ''))}" type="${escapeXml(toPropTypeAttr(p))}"${rangeAttrs}>${escapeXml(valueToText(p))}</prop>`;
          }
        }).join("\n")}\n      </props>`
      : '';
    // Include position attributes if available (z defaults to 0)
    const hasPos = (n as any)?.position && typeof (n as any).position.x === 'number' && typeof (n as any).position.y === 'number';
    const xAttr = hasPos ? ` x="${escapeXml(String((n as any).position.x))}"` : '';
    const yAttr = hasPos ? ` y="${escapeXml(String((n as any).position.y))}"` : '';
    const zVal = hasPos ? (typeof (n as any).position.z === 'number' ? (n as any).position.z : 0) : undefined;
    const zAttr = hasPos ? ` z="${escapeXml(String(zVal))}"` : '';

    // Include shape and type attributes if present
    const shape = (n as any).shape;
    const shapeAttr = shape ? ` shape="${escapeXml(String(shape))}"` : '';
    const type = (n as any).type;
    const typeAttr = type ? ` type="${escapeXml(String(type))}"` : '';

    return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}"${xAttr}${yAttr}${zAttr}${shapeAttr}${typeAttr}>${desc}${metadataXml}${props}\n    </node>`;
  }).join('\n\n');

  const allEdges = (graph as any).edges || [] as Array<{ id?: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string; shape?: string }>;
  const edges = allEdges.map((e: { id?: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string; shape?: string }) => {
    const role = (e as any).role || 'links-to';
    const id = e.id || `${e.source}-${e.target}`;
    const sh = (e as any).sourceHandle ? ` sourceHandle="${escapeXml(String((e as any).sourceHandle))}"` : '';
    const th = (e as any).targetHandle ? ` targetHandle="${escapeXml(String((e as any).targetHandle))}"` : '';
    const shape = (e as any).shape;
    const validShape = shape === 'relates' || shape === 'refines' ? shape : undefined;
    const shapeAttr = validShape ? ` shape="${escapeXml(String(validShape))}"` : '';
    return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"${sh}${th}${shapeAttr}/>`;
  }).join('\n');

  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}

function parsePropValue(type: string | undefined, text: string): any {
  const t = (type || '').toLowerCase();
  const raw = unescapeXml((text || '').trim());

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

    // Handle empty nodes section - if nodesData doesn't exist or has no node property, treat as empty
    if (!nodesData || (typeof nodesData === 'object' && !nodesData.node)) {
      // Return empty graph if no nodes section or empty nodes
      return { nodes: [], edges: [] };
    }

    // Handle both single node and array of nodes
    const nodeList = Array.isArray(nodesData.node) ? nodesData.node : [nodesData.node];
  const nodes: GraphNode[] = nodeList.filter(Boolean).map((nodeData: any) => {
      const id = nodeData['@_id'] || '';
      const title = nodeData['@_title'] || '';

      if (!id) {
        throw new Error(`Node missing required id attribute: ${JSON.stringify(nodeData)}`);
      }

      const description = repairTextEncoding((nodeData.description?.['#text'] || nodeData.description || '').trim());

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
          return list
            .filter(Boolean)
            .map((o: any) => (typeof o === 'object' ? (o['#text'] ?? '') : o))
            .map((s: any) => repairTextEncoding(String(s)));
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
          const fieldMin = fieldData['@_min'];
          const fieldMax = fieldData['@_max'];
          const fieldStep = fieldData['@_step'];

          // Select with nested <value> and <options>
          if (fieldType === 'select') {
            const fieldValue = coerce('string', repairTextEncoding(fieldData.value?.['#text'] ?? fieldData.value ?? fieldData['#text'] ?? ''));
            const fieldOptions = readOptions(fieldData.options);
            const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: fieldValue };
            if (fieldMin !== undefined && fieldMin !== null && fieldMin !== '') def.min = Number(fieldMin);
            if (fieldMax !== undefined && fieldMax !== null && fieldMax !== '') def.max = Number(fieldMax);
            if (fieldStep !== undefined && fieldStep !== null && fieldStep !== '') def.step = Number(fieldStep);
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
            if (fieldMin !== undefined && fieldMin !== null && fieldMin !== '') def.min = Number(fieldMin);
            if (fieldMax !== undefined && fieldMax !== null && fieldMax !== '') def.max = Number(fieldMax);
            if (fieldStep !== undefined && fieldStep !== null && fieldStep !== '') def.step = Number(fieldStep);
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
            if (fieldMin !== undefined && fieldMin !== null && fieldMin !== '') def.min = Number(fieldMin);
            if (fieldMax !== undefined && fieldMax !== null && fieldMax !== '') def.max = Number(fieldMax);
            if (fieldStep !== undefined && fieldStep !== null && fieldStep !== '') def.step = Number(fieldStep);
            if (itemFields.length) def.itemFields = itemFields;
            return { value: items, def };
          }

          // Simple types
          const text = repairTextEncoding(fieldData['#text'] ?? '');
          const coerced = coerce(fieldType, text);
          const def: any = { id: fieldName, title: fieldTitle, type: fieldType, value: coerced };
          if (fieldMin !== undefined && fieldMin !== null && fieldMin !== '') def.min = Number(fieldMin);
          if (fieldMax !== undefined && fieldMax !== null && fieldMax !== '') def.max = Number(fieldMax);
          if (fieldStep !== undefined && fieldStep !== null && fieldStep !== '') def.step = Number(fieldStep);
          return { value: coerced, def };
        };

        propList.filter(Boolean).forEach((propData: any) => {
          const name = propData['@_name'] || '';
          const xmlTitle = propData['@_title'] || name;
          const xmlType = propData['@_type'] || 'string';
          const xmlOptions = propData['@_options'] || '';
          const propMin = propData['@_min'];
          const propMax = propData['@_max'];
          const propStep = propData['@_step'];

          let value: any;
          let finalType: any = xmlType;
          let fields: Property[] = [];
          let itemFields: Property[] = [];
          let options: any[] = [];

          // Check if property has XML options structure
          if (propData.value && propData.options) {
            // Property with XML options structure
            value = repairTextEncoding(propData.value['#text'] || propData.value);
            options = readOptions(propData.options);
          } else if (xmlOptions) {
            // Fallback to old JSON format
            try {
              const unescapedOptions = unescapeXml(xmlOptions);
              options = JSON.parse(unescapedOptions);
            } catch (e) {
              console.warn(`Failed to parse options for property ${name}:`, e);
            }
            value = repairTextEncoding(propData['#text'] || '');
          } else {
            // Simple property
            value = repairTextEncoding(propData['#text'] || '');
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

          if (propMin !== undefined && propMin !== null && propMin !== '') property.min = Number(propMin);
          if (propMax !== undefined && propMax !== null && propMax !== '') property.max = Number(propMax);
          if (propStep !== undefined && propStep !== null && propStep !== '') property.step = Number(propStep);

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

      // Parse position attributes if present
      let position: { x: number; y: number; z?: number } | undefined = undefined;
      try {
        const xRaw = (nodeData as any)['@_x'];
        const yRaw = (nodeData as any)['@_y'];
        const zRaw = (nodeData as any)['@_z'];
        const x = typeof xRaw === 'number' ? xRaw : (xRaw !== undefined ? Number(xRaw) : NaN);
        const y = typeof yRaw === 'number' ? yRaw : (yRaw !== undefined ? Number(yRaw) : NaN);
        const z = typeof zRaw === 'number' ? zRaw : (zRaw !== undefined ? Number(zRaw) : NaN);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          position = { x, y, z: Number.isFinite(z) ? z : 0 };
        }
      } catch {}

      const metadataFiles = filesFromXml(nodeData.metadata?.files);
      const metadataBugs = bugsFromXml(nodeData.metadata?.bugs);
      // Optional shape and type
      const shapeRaw = (nodeData as any)['@_shape'];
      const shape = typeof shapeRaw === 'string' ? shapeRaw : undefined;
      const typeRaw = (nodeData as any)['@_type'];
      const type = typeof typeRaw === 'string' && ['system', 'container', 'component', 'code'].includes(typeRaw) ? typeRaw as NodeType : 'component';

      // Build metadata object if we have files or bugs
      let metadata: NodeMetadata | undefined = undefined;
      if (metadataFiles.length > 0 || metadataBugs.length > 0) {
        metadata = {
          files: metadataFiles,
          bugs: metadataBugs
        };
      }

      return {
        id,
        title,
        description: description,
        properties,
        ...(metadata ? { metadata } : {}),
        ...(shape ? { shape: shape as any } : {}),
        ...(type ? { type } : {})
      } as GraphNode;
    });

    const edges: Array<{ id: string; source: string; target: string; role?: string; sourceHandle?: string; targetHandle?: string; shape?: string }> = [];

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
        const shapeRaw = edgeData['@_shape'];
        const shape = typeof shapeRaw === 'string' ? shapeRaw : undefined;

        if (source && target) {
          edges.push({
            id,
            source,
            target,
            role,
            sourceHandle,
            targetHandle,
            ...(shape === 'relates' || shape === 'refines' ? { shape } : {}),
          });
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
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        role: e.role,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        ...(e.shape ? { shape: e.shape as any } : {}),
      })) as any,
    } as Graph;
    return g;
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
