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
function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function unescapeXml(text) {
    return String(text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}
function parseAttrBlock(attrs) {
    const out = {};
    const re = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrs)) !== null) {
        out[m[1]] = m[2];
    }
    return out;
}
function extractTagContent(xml, tag) {
    // More precise extraction that handles nested structures better
    const regex = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
    const match = regex.exec(xml);
    return match ? match[2] : null;
}
function collectTags(xml, tag) {
    const out = [];
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
        }
        else if (inTargetTag) {
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
function toPropTypeAttr(p) {
    const t = p?.type;
    if (!t)
        return 'string';
    // Preserve declared type; nested types are emitted with proper nested XML
    return String(t);
}
function valueToText(p) {
    const v = p?.value;
    if (v === undefined || v === null)
        return '';
    if (typeof v === 'string')
        return v;
    if (typeof v === 'number' || typeof v === 'boolean')
        return String(v);
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
function generateFieldXml(field, fieldValue) {
    const options = field?.options;
    // Handle any field type that has options
    if (Array.isArray(options) && options.length > 0) {
        // Field with options as XML elements
        const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
        return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">
          <value>${escapeXml(valueToText({ ...field, value: fieldValue }))}</value>
          <options>
${optionsXml}
          </options>
        </field>`;
    }
    else if ((field.type === 'object' && field.fields) || field.type === 'object-list') {
        // Nested object or object-list
        return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${generateNestedXml({ ...field, value: fieldValue })}</field>`;
    }
    else {
        // Simple field
        return `<field name="${escapeXml(field.id)}" title="${escapeXml(field.title)}" type="${escapeXml(field.type)}">${escapeXml(valueToText({ ...field, value: fieldValue }))}</field>`;
    }
}
function generateNestedXml(p) {
    const type = p?.type;
    if (type === 'object' && p?.fields) {
        // Generate nested object structure
        const fields = p.fields;
        const fieldXml = fields.map(field => {
            const fieldValue = p?.value?.[field.id];
            return generateFieldXml(field, fieldValue);
        }).join('\n        ');
        return `\n        ${fieldXml}\n      `;
    }
    else if (type === 'object-list') {
        // Generate nested array structure
        let items = Array.isArray(p?.value) ? p.value : [];
        let itemFields = Array.isArray(p?.itemFields) ? p.itemFields : [];
        // Support alternate schema: p.item as a map of fieldId -> fieldDef
        if ((!itemFields || itemFields.length === 0) && p?.item && typeof p.item === 'object' && !Array.isArray(p.item)) {
            const itemMap = p.item;
            itemFields = Object.keys(itemMap).map((key) => {
                const def = itemMap[key] || {};
                const t = def.type || 'text';
                const fld = { id: key, title: def.title || key, type: t };
                if (Array.isArray(def.options))
                    fld.options = def.options;
                if (def.fields)
                    fld.fields = def.fields;
                if (def.itemFields)
                    fld.itemFields = def.itemFields;
                if (def.value !== undefined)
                    fld.value = def.value;
                return fld;
            });
        }
        // Support alternate value shape: p.items is an array of objects with nested field definitions
        if (Array.isArray(p?.items) && p.items.length > 0) {
            const srcItems = p.items;
            // Build itemFields union from first occurrence of each field across items if not present
            if (!itemFields || itemFields.length === 0) {
                const fieldMap = {};
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
                itemFields = Object.values(fieldMap);
            }
            // Convert srcItems to plain values array aligned to itemFields
            items = srcItems.map((it) => {
                const obj = {};
                for (const field of itemFields) {
                    const cell = it?.[field.id];
                    obj[field.id] = (cell && typeof cell === 'object' && 'value' in cell) ? cell.value : (cell ?? '');
                }
                return obj;
            });
        }
        // If there are no items but we do have itemFields, emit a single template item for schema
        const effectiveItems = items.length > 0 ? items : (itemFields && itemFields.length > 0 ? [Object.fromEntries(itemFields.map((f) => [f.id, (f.value ?? '')]))] : []);
        const itemXml = effectiveItems.map((item, index) => {
            let fieldsToUse = itemFields;
            // If schema missing, infer per item keys minimally for round-trip
            if (!fieldsToUse || fieldsToUse.length === 0) {
                const keys = Object.keys(item || {});
                fieldsToUse = keys.map((k) => ({ id: k, title: k, type: typeof item[k] === 'number' ? 'number' : typeof item[k] === 'boolean' ? 'boolean' : (typeof item[k] === 'object' && item[k] !== null) ? (Array.isArray(item[k]) ? 'object-list' : 'object') : 'text' }));
            }
            const itemFieldXml = fieldsToUse.map(field => {
                const fieldValue = item ? item[field.id] : undefined;
                return generateFieldXml(field, fieldValue);
            }).join('\n          ');
            return `        <item index="${index}">\n          ${itemFieldXml}\n        </item>`;
        }).join('\n');
        return `\n${itemXml}\n      `;
    }
    else {
        // Simple value
        return escapeXml(valueToText(p));
    }
}
function optionsToText(p) {
    const options = p?.options;
    if (!options || !Array.isArray(options))
        return '';
    try {
        return JSON.stringify(options);
    }
    catch {
        return '';
    }
}
export function graphToXml(graph) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>`;
    const ns = `xmlns="urn:app:graph"`;
    const directed = `directed="true"`;
    const version = `version="1.0"`;
    // No longer tracking children since we use edges exclusively
    const nodes = (graph.nodes || []).map((n) => {
        const desc = n.prompt ? `\n      <description>${escapeXml(n.prompt)}</description>` : '';
        const buildStatus = n.state || 'unbuilt';
        const state = `\n      <state status="active">\n        <build status="${escapeXml(String(buildStatus))}"/>\n      </state>`;
        const props = Array.isArray(n.properties) && n.properties.length > 0
            ? `\n      <props>\n${n.properties.map((p) => {
                const propType = p?.type;
                const options = p?.options;
                if (propType === 'object' || propType === 'object-list') {
                    // Use nested XML structure for objects and arrays
                    const nestedContent = generateNestedXml(p);
                    return `        <prop name="${escapeXml(String(p.id || ''))}" title="${escapeXml(String(p.title || p.id || ''))}" type="${escapeXml(propType)}">${nestedContent}</prop>`;
                }
                else if (Array.isArray(options) && options.length > 0) {
                    // Property with options - use XML format
                    const optionsXml = options.map(option => `          <option>${escapeXml(String(option))}</option>`).join('\n');
                    return `        <prop name="${escapeXml(String(p.id || ''))}" title="${escapeXml(String(p.title || p.id || ''))}" type="${escapeXml(toPropTypeAttr(p))}">
          <value>${escapeXml(valueToText(p))}</value>
          <options>
${optionsXml}
          </options>
        </prop>`;
                }
                else {
                    // Simple property without options
                    return `        <prop name="${escapeXml(String(p.id || ''))}" title="${escapeXml(String(p.title || p.id || ''))}" type="${escapeXml(toPropTypeAttr(p))}">${escapeXml(valueToText(p))}</prop>`;
                }
            }).join("\n")}\n      </props>`
            : '';
        return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}">${desc}${state}${props}\n    </node>`;
    }).join('\n\n');
    const allEdges = graph.edges || [];
    const edges = allEdges.map((e) => {
        const role = e.role || 'links-to';
        const id = e.id || `${e.source}-${e.target}`;
        return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"/>`;
    }).join('\n');
    return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}
function parsePropValue(type, text) {
    const t = (type || '').toLowerCase();
    const raw = unescapeXml(text || '').trim();
    if (t === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : raw;
    }
    if (t === 'boolean') {
        if (raw.toLowerCase() === 'true')
            return true;
        if (raw.toLowerCase() === 'false')
            return false;
        return raw;
    }
    if (t === 'json') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return raw;
        }
    }
    return raw;
}
export function xmlToGraph(xml) {
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
        const nodes = nodeList.filter(Boolean).map((nodeData) => {
            const id = nodeData['@_id'] || '';
            const title = nodeData['@_title'] || '';
            if (!id) {
                throw new Error(`Node missing required id attribute: ${JSON.stringify(nodeData)}`);
            }
            const description = (nodeData.description?.['#text'] || nodeData.description || '').trim();
            const stateData = nodeData.state;
            let buildStatus;
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
            let properties = [];
            if (propsData?.prop) {
                const propList = Array.isArray(propsData.prop) ? propsData.prop : [propsData.prop];
                const parsedProperties = [];
                const propertyMap = new Map();
                // Helper: normalize xml option entries to strings
                const readOptions = (optContainer) => {
                    if (!optContainer)
                        return [];
                    const list = Array.isArray(optContainer.option) ? optContainer.option : [optContainer.option];
                    return list.filter(Boolean).map((o) => (typeof o === 'object' ? (o['#text'] ?? '') : o)).map((s) => String(s));
                };
                // Helper: coerce primitive by type
                const coerce = (t, v) => {
                    const str = typeof v === 'string' ? v : String(v ?? '');
                    return parsePropValue(t, str);
                };
                // Recursively parse a <field> element to a pair [value, fieldDef]
                const parseField = (fieldData) => {
                    const fieldName = fieldData['@_name'] || '';
                    const fieldTitle = fieldData['@_title'] || fieldName;
                    const fieldType = (fieldData['@_type'] || 'string');
                    // Select with nested <value> and <options>
                    if (fieldType === 'select') {
                        const fieldValue = coerce('string', fieldData.value?.['#text'] ?? fieldData.value ?? fieldData['#text'] ?? '');
                        const fieldOptions = readOptions(fieldData.options);
                        const def = { id: fieldName, title: fieldTitle, type: fieldType, value: fieldValue };
                        if (fieldOptions.length)
                            def.options = fieldOptions;
                        return { value: fieldValue, def };
                    }
                    // Nested object
                    if (fieldType === 'object') {
                        const obj = {};
                        const fields = [];
                        const fieldList = fieldData.field ? (Array.isArray(fieldData.field) ? fieldData.field : [fieldData.field]) : [];
                        fieldList.filter(Boolean).forEach((fd) => {
                            const parsed = parseField(fd);
                            obj[parsed.def.id] = parsed.value;
                            fields.push(parsed.def);
                        });
                        const def = { id: fieldName, title: fieldTitle, type: fieldType, value: obj };
                        if (fields.length)
                            def.fields = fields;
                        return { value: obj, def };
                    }
                    // Nested object list
                    if (fieldType === 'object-list') {
                        const items = [];
                        const itemFields = [];
                        const itemList = fieldData.item ? (Array.isArray(fieldData.item) ? fieldData.item : [fieldData.item]) : [];
                        if (itemList.length > 0 && itemList[0]?.field) {
                            const firstItemFields = Array.isArray(itemList[0].field) ? itemList[0].field : [itemList[0].field];
                            firstItemFields.filter(Boolean).forEach((fd) => {
                                const parsed = parseField(fd);
                                // Field defs for itemFields should not hold item values
                                const { value: _v, def } = parsed;
                                def.value = undefined;
                                itemFields.push(def);
                            });
                        }
                        itemList.filter(Boolean).forEach((it) => {
                            const itemObj = {};
                            const fieldsForItem = it.field ? (Array.isArray(it.field) ? it.field : [it.field]) : [];
                            fieldsForItem.filter(Boolean).forEach((fd) => {
                                const parsed = parseField(fd);
                                itemObj[parsed.def.id] = parsed.value;
                            });
                            items.push(itemObj);
                        });
                        const def = { id: fieldName, title: fieldTitle, type: fieldType, value: items };
                        if (itemFields.length)
                            def.itemFields = itemFields;
                        return { value: items, def };
                    }
                    // Simple types
                    const text = fieldData['#text'] ?? '';
                    const coerced = coerce(fieldType, text);
                    const def = { id: fieldName, title: fieldTitle, type: fieldType, value: coerced };
                    return { value: coerced, def };
                };
                propList.filter(Boolean).forEach((propData) => {
                    const name = propData['@_name'] || '';
                    const xmlTitle = propData['@_title'] || name;
                    const xmlType = propData['@_type'] || 'string';
                    const xmlOptions = propData['@_options'] || '';
                    let value;
                    let finalType = xmlType;
                    let fields = [];
                    let itemFields = [];
                    let options = [];
                    // Check if property has XML options structure
                    if (propData.value && propData.options) {
                        // Property with XML options structure
                        value = propData.value['#text'] || propData.value;
                        options = readOptions(propData.options);
                    }
                    else if (xmlOptions) {
                        // Fallback to old JSON format
                        try {
                            const unescapedOptions = unescapeXml(xmlOptions);
                            options = JSON.parse(unescapedOptions);
                        }
                        catch (e) {
                            console.warn(`Failed to parse options for property ${name}:`, e);
                        }
                        value = propData['#text'] || '';
                    }
                    else {
                        // Simple property
                        value = propData['#text'] || '';
                    }
                    if (xmlType === 'object') {
                        // Parse nested object structure using fast-xml-parser
                        const parsedObject = {};
                        const fieldList = propData.field ? (Array.isArray(propData.field) ? propData.field : [propData.field]) : [];
                        fieldList.filter(Boolean).forEach((fd) => {
                            const parsed = parseField(fd);
                            parsedObject[parsed.def.id] = parsed.value;
                            fields.push(parsed.def);
                        });
                        value = parsedObject;
                    }
                    else if (xmlType === 'object-list') {
                        // Parse nested array structure using fast-xml-parser
                        const parsedArray = [];
                        const itemList = propData.item ? (Array.isArray(propData.item) ? propData.item : [propData.item]) : [];
                        // Build itemFields from first item
                        if (itemList.length > 0 && itemList[0]?.field) {
                            const firstItemFields = Array.isArray(itemList[0].field) ? itemList[0].field : [itemList[0].field];
                            itemFields = firstItemFields.filter(Boolean).map((fd) => {
                                const parsed = parseField(fd);
                                const def = parsed.def;
                                def.value = undefined; // definitions don't store concrete item value
                                return def;
                            });
                        }
                        // Parse each item
                        itemList.filter(Boolean).forEach((it) => {
                            const itemObj = {};
                            const fieldsForItem = it.field ? (Array.isArray(it.field) ? it.field : [it.field]) : [];
                            fieldsForItem.filter(Boolean).forEach((fd) => {
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
                    const property = {
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
                    parsedProperties.push(property);
                    // Add to map for de-duplication (last value wins)
                    propertyMap.set(name, property);
                });
                // Use de-duplicated properties (last value wins)
                properties = Array.from(propertyMap.values());
            }
            return {
                id,
                title,
                prompt: unescapeXml(description),
                state: buildStatus || 'unbuilt',
                properties
            };
        });
        const edges = [];
        // Parse edges using fast-xml-parser
        if (edgesData?.edge) {
            const edgeList = Array.isArray(edgesData.edge) ? edgesData.edge : [edgesData.edge];
            edgeList.filter(Boolean).forEach((edgeData) => {
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
        const g = { nodes, edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) };
        return g;
    }
    catch (error) {
        throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
