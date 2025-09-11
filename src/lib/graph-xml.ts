import type { Graph, GraphNode, Property } from '@/app/api/lib/schemas';
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
    const items = Array.isArray((p as any)?.value) ? (p as any).value : [];
    let itemFields = (p as any).itemFields as Property[];

    // If itemFields is not defined but we have items, infer from the first item
    if (!itemFields && items.length > 0) {
      const firstItem = items[0];
      if (firstItem && typeof firstItem === 'object') {
        itemFields = Object.keys(firstItem).map(key => ({
          id: key,
          title: key,
          type: typeof firstItem[key] === 'string' ? 'string' : 'text',
          value: ''
        })) as Property[];
      }
    }

    if (itemFields && itemFields.length > 0) {
      const itemXml = items.map((item: any, index: number) => {
        const itemFieldXml = itemFields!.map(field => {
          const fieldValue = item[field.id];
          return generateFieldXml(field, fieldValue);
        }).join('\n          ');
        return `        <item index="${index}">\n          ${itemFieldXml}\n        </item>`;
      }).join('\n');
      return `\n${itemXml}\n      `;
    } else {
      // Fallback: just serialize the array as JSON if we can't infer structure
      return escapeXml(valueToText(p));
    }
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

  const childrenSet = new Set<string>();
  for (const n of graph.nodes || []) {
    for (const c of (n.children || [])) {
      childrenSet.add(`${n.id}→${c.id}`);
    }
  }

  const nodes = (graph.nodes || []).map((n: GraphNode) => {
    const desc = n.prompt ? `\n      <description>${escapeXml(n.prompt)}</description>` : '';
    const buildStatus = (n.state as any) || 'unbuilt';
    const state = `\n      <state status="active">\n        <build status="${escapeXml(String(buildStatus))}"/>\n      </state>`;
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
    return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}">${desc}${state}${props}\n    </node>`;
  }).join('\n\n');

  const allEdges = (graph as any).edges || [] as Array<{ id?: string; source: string; target: string; role?: string }>;
  const edges = allEdges.map((e: { id?: string; source: string; target: string; role?: string }) => {
    const role = childrenSet.has(`${e.source}→${e.target}`) ? 'contains' : (e as any).role || 'links-to';
    const id = e.id || `${e.source}-${e.target}`;
    return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"/>`;
  }).join('\n');

  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}

function parsePropValue(type: string | undefined, text: string): any {
  const t = (type || '').toLowerCase();
  const raw = unescapeXml(text || '').trim();
  if (t === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (t === 'boolean') {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    return raw;
  }
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
          // Create scoped propInner for this property
          const propInner = JSON.stringify(propData); // For now, serialize back to handle nested parsing

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
        children: [],
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

    // Infer children from edges
    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const parent = byId.get(e.source);
      const child = byId.get(e.target);
      if (parent && child) {
        parent.children = parent.children || [];
        if (!parent.children.find(c => c.id === child.id)) parent.children.push({ id: child.id, title: child.title });
      }
    }

    const g: Graph = { nodes, edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) as any } as Graph;
    return g;
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

