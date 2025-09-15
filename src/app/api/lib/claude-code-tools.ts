import { tool } from '@anthropic-ai/claude-code';
import { z } from 'zod';
import { GraphSchema, PropertySchema } from './schemas';
import { graphToXml, xmlToGraph } from '../../../lib/graph-xml';
import * as fs from 'fs';
import * as path from 'path';

// Property normalization function
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

// Filesystem helpers
function projectDir(): string {
  try {
    const { getDevProjectDir } = require('../../../lib/project-config');
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }
  try {
    return process.cwd();
  } catch {
    return process.cwd();
  }
}

function graphPath(): string { return path.join(projectDir(), '_graph', 'graph.xml'); }

function readLocalGraph(): any | null {
  try {
    const p = graphPath();
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchema.safeParse(g);
    return parsed.success ? { graph: parsed.data, rawXml } : null;
  } catch { return null; }
}

// Tool definitions for Claude Code MCP server
export const createGraphTools = (baseUrl: string, authHeaders?: Record<string, string>) => {
  console.log('🔧 Creating graph tools with baseUrl:', baseUrl, 'authHeaders present:', !!authHeaders);

  // Helper function to build request headers
  const buildHeaders = (additionalHeaders?: Record<string, string>) => {
    return {
      'Accept': 'application/xml, application/json',
      ...authHeaders,
      ...additionalHeaders
    };
  };

  console.log('🔧 Graph tools created successfully');

  return [
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
      console.log('🔍 TOOL: graph_read called', { nodeId });

      try {
        console.log('📡 TOOL: graph_read making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_read response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_read request failed:', data.status);
          const errorMsg = `Failed to fetch graph data: HTTP ${data.status}`;
          console.log('📤 TOOL: graph_read returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_read content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_read received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_read received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        // Parse the graph data
        console.log('🔍 TOOL: graph_read validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_read schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_read returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_read schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        if (nodeId) {
          console.log('🎯 TOOL: graph_read looking for specific node:', nodeId);
          const node = validatedGraph.nodes.find((n: any) => n.id === nodeId);
          if (!node) {
            console.error('❌ TOOL: graph_read node not found:', nodeId);
            const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map(n => n.id).join(', ')}`;
            console.log('📤 TOOL: graph_read returning error:', errorMsg);
            return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
          }
          console.log('✅ TOOL: graph_read found node:', node.title);
          const result = JSON.stringify(node, null, 2);
          console.log('📤 TOOL: graph_read returning node data');
          return { content: [{ type: 'text', text: result }] };
        } else {
          console.log('📋 TOOL: graph_read returning all nodes summary');
          const nodes = validatedGraph.nodes.map((n: any) => ({ id: n.id, title: n.title }));
          console.log('📋 TOOL: graph_read found nodes:', nodes.length);
          const result = JSON.stringify({ nodes }, null, 2);
          console.log('📤 TOOL: graph_read returning nodes summary');
          return { content: [{ type: 'text', text: result }] };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: graph_read unexpected error:', errorMessage);
        const errorMsg = `Unexpected error while reading graph: ${errorMessage}`;
        return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
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
      console.log('🔗 TOOL: graph_edge_create called', { sourceId, targetId, role });

      try {
        console.log('📡 TOOL: graph_edge_create making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_edge_create response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_edge_create request failed:', data.status);
          throw new Error(`GET ${baseUrl}/api/graph-api failed: ${data.status}`);
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_edge_create content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_edge_create received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_edge_create received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        console.log('🔍 TOOL: graph_edge_create validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_edge_create schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_edge_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        // Validate that both nodes exist
        console.log('🔍 TOOL: graph_edge_create validating source node:', sourceId);
        const sourceNode = validatedGraph.nodes.find((n: any) => n.id === sourceId);
        if (!sourceNode) {
          console.error('❌ TOOL: graph_edge_create source node not found:', sourceId);
          const errorMsg = `Source node '${sourceId}' not found. Available nodes: ${validatedGraph.nodes.map(n => n.id).join(', ')}`;
          console.log('📤 TOOL: graph_edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_edge_create found source node:', sourceNode.title);

        console.log('🔍 TOOL: graph_edge_create validating target node:', targetId);
        const targetNode = validatedGraph.nodes.find((n: any) => n.id === targetId);
        if (!targetNode) {
          console.error('❌ TOOL: graph_edge_create target node not found:', targetId);
          const errorMsg = `Target node '${targetId}' not found. Available nodes: ${validatedGraph.nodes.map(n => n.id).join(', ')}`;
          console.log('📤 TOOL: graph_edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_edge_create found target node:', targetNode.title);

        // Check if edge already exists
        console.log('🔍 TOOL: graph_edge_create checking for existing edge');
        const existingEdge = (validatedGraph.edges || []).find((e: any) => e.source === sourceId && e.target === targetId);
        if (existingEdge) {
          console.error('❌ TOOL: graph_edge_create edge already exists:', `${sourceId}-${targetId}`);
          const errorMsg = `Edge from '${sourceId}' to '${targetId}' already exists. Current role: ${existingEdge.role || 'none'}`;
          console.log('📤 TOOL: graph_edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_edge_create no existing edge found');

        // Create the edge
        const newEdge = {
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          role: role || 'links-to'
        };
        console.log('🆕 TOOL: graph_edge_create creating new edge:', newEdge);

        validatedGraph.edges = validatedGraph.edges || [];
        validatedGraph.edges.push(newEdge);
        console.log('✅ TOOL: graph_edge_create added edge, total edges:', validatedGraph.edges.length);

        console.log('💾 TOOL: graph_edge_create saving updated graph');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_edge_create returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_edge_create graph saved successfully');

        const result = `Created edge from ${sourceId} to ${targetId}${role ? ` (${role})` : ''}`;
        console.log('📤 TOOL: graph_edge_create returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: graph_edge_create error:', error);
        throw error;
      }
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
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
    },
    async ({ nodeId, title, prompt, properties, state, position }) => {
      console.log('➕ TOOL: graph_node_add called', { nodeId, title, state, position: !!position });

      try {
        console.log('📡 TOOL: graph_node_add making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_node_add response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_node_add request failed:', data.status);
          const errorMsg = `Failed to fetch graph data: HTTP ${data.status}`;
          console.log('📤 TOOL: graph_node_add returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_node_add content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_node_add received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_node_add received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        console.log('🔍 TOOL: graph_node_add validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_node_add schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_node_add returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_node_add schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: graph_node_add checking if node already exists:', nodeId);
        const existingNode = validatedGraph.nodes.find((n: any) => n.id === nodeId);
        if (existingNode) {
          console.error('❌ TOOL: graph_node_add node already exists:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' already exists. Please use a different node ID or use graph_node_edit to modify the existing node.`;
          console.log('📤 TOOL: graph_node_add returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_node_add node ID is available');

        const node: any = {
          id: nodeId,
          title,
          prompt,
          properties: properties || [],
          state: state ?? 'unbuilt',
          ...(position ? { position: { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 } } : {})
        };
        console.log('🆕 TOOL: graph_node_add creating new node:', { id: nodeId, title, state: node.state, propertiesCount: node.properties.length });

        validatedGraph.nodes.push(node);
        console.log('✅ TOOL: graph_node_add added node, total nodes:', validatedGraph.nodes.length);

        console.log('💾 TOOL: graph_node_add saving updated graph');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_node_add returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_node_add graph saved successfully');

        const result = `Successfully added node "${nodeId}" with title "${title}". The node has ${node.properties.length} properties and is in "${node.state}" state.`;
        console.log('📤 TOOL: graph_node_add returning success:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: graph_node_add unexpected error:', errorMessage);
        const errorMsg = `Unexpected error while adding node: ${errorMessage}`;
        return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
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
      console.log('✏️ TOOL: graph_node_edit called', { nodeId, mode, title: !!title, prompt: !!prompt, propertiesCount: properties?.length, childrenCount: children?.length, state, position: !!position });

      try {
        console.log('📡 TOOL: graph_node_edit making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_node_edit response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_node_edit request failed:', data.status);
          const errorMsg = `Failed to fetch graph data: HTTP ${data.status}`;
          console.log('📤 TOOL: graph_node_edit returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_node_edit content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_node_edit received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_node_edit received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        console.log('🔍 TOOL: graph_node_edit validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_node_edit schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_node_edit returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_node_edit schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: graph_node_edit looking for node:', nodeId);
        const idx = validatedGraph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) {
          console.error('❌ TOOL: graph_node_edit node not found:', nodeId);
          throw new Error(`Node ${nodeId} not found`);
        }
        console.log('✅ TOOL: graph_node_edit found node at index:', idx, 'title:', validatedGraph.nodes[idx].title);

        if (mode === 'merge') {
          console.log('🔄 TOOL: graph_node_edit using MERGE mode');
          // Merge mode: preserve existing data and merge properties
          const existing = validatedGraph.nodes[idx];
          const next = { ...existing } as any;

          // Merge simple fields (only update if provided)
          if (title !== undefined) {
            console.log('📝 TOOL: graph_node_edit merging title:', title);
            next.title = title;
          }
          if (prompt !== undefined) {
            console.log('📝 TOOL: graph_node_edit merging prompt, length:', prompt.length);
            next.prompt = prompt;
          }
          if (children !== undefined) {
            console.log('👶 TOOL: graph_node_edit merging children, count:', children.length);
            next.children = children;
          }
          if (state !== undefined) {
            console.log('🏗️ TOOL: graph_node_edit merging state:', state);
            next.state = state;
          }
          if (position !== undefined) {
            console.log('📍 TOOL: graph_node_edit merging position:', position);
            next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
          }

          // Special handling for properties: merge instead of replace
          if (properties !== undefined) {
            console.log('🔧 TOOL: graph_node_edit merging properties, count:', properties.length);
            // Normalize incoming properties first
            properties = normalizeProperties(properties);
            console.log('🔧 TOOL: graph_node_edit normalized properties, count:', properties.length);

            const existingProps = Array.isArray(existing.properties) ? existing.properties : [];
            console.log('🔧 TOOL: graph_node_edit existing properties count:', existingProps.length);

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

          console.log('🔧 TOOL: graph_node_edit merged properties, final count:', Array.from(byId.values()).length);
          next.properties = Array.from(byId.values());
        }

        validatedGraph.nodes[idx] = next;
        console.log('💾 TOOL: graph_node_edit saving updated graph (merge mode)');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_node_edit returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_node_edit graph saved successfully');

        const result = `Merged changes into node ${nodeId}`;
        console.log('📤 TOOL: graph_node_edit returning result:', result);
        return { content: [{ type: 'text', text: result }] };

      } else {
        console.log('🔄 TOOL: graph_node_edit using REPLACE mode');
        // Replace mode: fully replace the node (original behavior)
        const next = { ...validatedGraph.nodes[idx] } as any;
        if (title !== undefined) {
          console.log('📝 TOOL: graph_node_edit replacing title:', title);
          next.title = title;
        }
        if (prompt !== undefined) {
          console.log('📝 TOOL: graph_node_edit replacing prompt, length:', prompt.length);
          next.prompt = prompt;
        }
        if (properties !== undefined) {
          console.log('🔧 TOOL: graph_node_edit replacing properties, count:', properties.length);
          next.properties = properties;
        }
        if (children !== undefined) {
          console.log('👶 TOOL: graph_node_edit replacing children, count:', children.length);
          next.children = children;
        }
        if (state !== undefined) {
          console.log('🏗️ TOOL: graph_node_edit replacing state:', state);
          next.state = state;
        }
        if (position !== undefined) {
          console.log('📍 TOOL: graph_node_edit replacing position:', position);
          next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
        }
        validatedGraph.nodes[idx] = next;
        console.log('💾 TOOL: graph_node_edit saving updated graph (replace mode)');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_node_edit returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_node_edit graph saved successfully');

        const result = `Replaced node ${nodeId}`;
        console.log('📤 TOOL: graph_node_edit returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      }
    } catch (error) {
      console.error('💥 TOOL: graph_node_edit error:', error);
      throw error;
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
      console.log('🏗️ TOOL: graph_node_set_state called', { nodeId, state });

      try {
        console.log('📡 TOOL: graph_node_set_state making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_node_set_state response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_node_set_state request failed:', data.status);
          const errorMsg = `Failed to fetch graph data: HTTP ${data.status}`;
          console.log('📤 TOOL: graph_node_set_state returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_node_set_state content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_node_set_state received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_node_set_state received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        console.log('🔍 TOOL: graph_node_set_state validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_node_set_state schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_node_set_state returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_node_set_state schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: graph_node_set_state looking for node:', nodeId);
        const idx = validatedGraph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) {
          console.error('❌ TOOL: graph_node_set_state node not found:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map(n => n.id).join(', ')}`;
          console.log('📤 TOOL: graph_node_set_state returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_node_set_state found node at index:', idx, 'current state:', validatedGraph.nodes[idx].state);

        console.log('🏗️ TOOL: graph_node_set_state updating state from', validatedGraph.nodes[idx].state, 'to', state);
        validatedGraph.nodes[idx] = { ...validatedGraph.nodes[idx], state };

        console.log('💾 TOOL: graph_node_set_state saving updated graph');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_node_set_state returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_node_set_state graph saved successfully');

        const result = `Updated node ${nodeId} state -> ${state}`;
        console.log('📤 TOOL: graph_node_set_state returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: graph_node_set_state error:', error);
        throw error;
      }
    }
  ),

  // graph_node_delete
  tool(
    'graph_node_delete',
    'Delete a node by id.',
    { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
    async ({ nodeId, recursive }) => {
      console.log('🗑️ TOOL: graph_node_delete called', { nodeId, recursive });

      try {
        console.log('📡 TOOL: graph_node_delete making GET request to /api/graph-api');
        const data = await fetch(`${baseUrl}/api/graph-api`, {
          method: 'GET',
          headers: buildHeaders(),
        });

        console.log('📡 TOOL: graph_node_delete response status:', data.status);
        if (!data.ok) {
          console.error('❌ TOOL: graph_node_delete request failed:', data.status);
          const errorMsg = `Failed to fetch graph data: HTTP ${data.status}`;
          console.log('📤 TOOL: graph_node_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const ct = data.headers.get('content-type') || '';
        console.log('📄 TOOL: graph_node_delete content-type:', ct);

        let graph;
        if (ct.includes('xml')) {
          const xml = await data.text();
          console.log('📄 TOOL: graph_node_delete received XML, length:', xml.length);
          graph = xmlToGraph(xml);
        } else {
          const json = await data.json();
          console.log('📄 TOOL: graph_node_delete received JSON:', !!json.graph ? 'with graph property' : 'direct graph');
          graph = json.graph ?? json;
        }

        console.log('🔍 TOOL: graph_node_delete validating graph schema');
        const parsed = GraphSchema.safeParse(graph);
        if (!parsed.success) {
          console.error('❌ TOOL: graph_node_delete schema validation failed:', parsed.error);
          const errorMsg = `Graph data validation failed: ${parsed.error.message}`;
          console.log('📤 TOOL: graph_node_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = parsed.data;
        console.log('✅ TOOL: graph_node_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: graph_node_delete checking if node exists:', nodeId);
        const byId = new Map<string, any>(validatedGraph.nodes.map((n: any) => [n.id, n]));
        if (!byId.has(nodeId)) {
          console.error('❌ TOOL: graph_node_delete node not found:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map(n => n.id).join(', ')}`;
          console.log('📤 TOOL: graph_node_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: graph_node_delete node found:', byId.get(nodeId).title);

        console.log('🔄 TOOL: graph_node_delete cleaning up references');
        validatedGraph.nodes.forEach((n: any) => {
          if (Array.isArray(n.children)) n.children = n.children.filter((c: any) => c.id !== nodeId);
        });

        console.log('🗂️ TOOL: graph_node_delete collecting nodes to delete');
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

        console.log('🗑️ TOOL: graph_node_delete will delete nodes:', Array.from(toDelete));
        const originalCount = validatedGraph.nodes.length;
        validatedGraph.nodes = validatedGraph.nodes.filter((n: any) => !toDelete.has(n.id));
        console.log('✅ TOOL: graph_node_delete removed nodes, count changed from', originalCount, 'to', validatedGraph.nodes.length);

        console.log('💾 TOOL: graph_node_delete saving updated graph');
        const saveResult = await saveGraph(validatedGraph, baseUrl, authHeaders);
        if (!saveResult.success) {
          console.log('📤 TOOL: graph_node_delete returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: graph_node_delete graph saved successfully');

        const result = `Deleted node ${nodeId}${recursive ? ' (recursive)' : ''}`;
        console.log('📤 TOOL: graph_node_delete returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: graph_node_delete error:', error);
        throw error;
      }
    }
  ),

  // graph_analyze_diff
  tool(
    'graph_analyze_diff',
    'Analyze the differences between base and current graphs to understand what changed.',
    {},
    async () => {
      console.log('🔍 TOOL: graph_analyze_diff called');

      try {
        console.log('📁 TOOL: graph_analyze_diff reading base and current graphs from filesystem');
        const baseGraph = readLocalGraph();
        const currentGraph = readLocalGraph();

        if (!baseGraph) {
          console.error('❌ TOOL: graph_analyze_diff base graph not found');
          return { content: [{ type: 'text', text: 'Error: Cannot read base graph from filesystem' }] };
        }
        if (!currentGraph) {
          console.error('❌ TOOL: graph_analyze_diff current graph not found');
          return { content: [{ type: 'text', text: 'Error: Cannot read current graph from filesystem' }] };
        }

        console.log('✅ TOOL: graph_analyze_diff successfully loaded both graphs');
        console.log('📊 TOOL: graph_analyze_diff base nodes:', baseGraph.graph?.nodes?.length || 0, 'current nodes:', currentGraph.graph?.nodes?.length || 0);

        const diff: any = {
          changes: []
        };

        // Compare nodes
        console.log('🔍 TOOL: graph_analyze_diff comparing nodes');
        const currentNodeMap = new Map(currentGraph.graph.nodes.map((n: any) => [n.id, n]));
        const baseNodeMap = new Map(baseGraph.graph.nodes.map((n: any) => [n.id, n]));

        // Find added/modified nodes
        for (const [nodeId, currentNode] of Array.from(currentNodeMap.entries())) {
          const baseNode = baseNodeMap.get(nodeId);
          if (!baseNode) {
            console.log('➕ TOOL: graph_analyze_diff found added node:', nodeId);
            diff.changes.push({ type: 'node-added', node: currentNode });
          } else if (JSON.stringify(currentNode) !== JSON.stringify(baseNode)) {
            console.log('✏️ TOOL: graph_analyze_diff found modified node:', nodeId);
            diff.changes.push({ type: 'node-modified', nodeId, oldNode: baseNode, newNode: currentNode });
          }
        }

        // Find deleted nodes
        for (const [nodeId, baseNode] of Array.from(baseNodeMap.entries())) {
          if (!currentNodeMap.has(nodeId)) {
            console.log('🗑️ TOOL: graph_analyze_diff found deleted node:', nodeId);
            diff.changes.push({ type: 'node-deleted', nodeId, node: baseNode });
          }
        }

        // Compare edges
        console.log('🔍 TOOL: graph_analyze_diff comparing edges');
        const currentEdges = currentGraph.graph.edges || [];
        const baseEdges = baseGraph.graph.edges || [];
        const currentEdgeMap = new Map(currentEdges.map((e: any) => [`${e.source}-${e.target}`, e]));
        const baseEdgeMap = new Map(baseEdges.map((e: any) => [`${e.source}-${e.target}`, e]));

        // Find added edges
        for (const [edgeKey, currentEdge] of Array.from(currentEdgeMap.entries())) {
          if (!baseEdgeMap.has(edgeKey)) {
            console.log('➕ TOOL: graph_analyze_diff found added edge:', edgeKey);
            diff.changes.push({ type: 'edge-added', edge: currentEdge });
          }
        }

        // Find deleted edges
        for (const [edgeKey, baseEdge] of Array.from(baseEdgeMap.entries())) {
          if (!currentEdgeMap.has(edgeKey)) {
            console.log('🗑️ TOOL: graph_analyze_diff found deleted edge:', edgeKey);
            diff.changes.push({ type: 'edge-deleted', edge: baseEdge });
          }
        }

        console.log('📊 TOOL: graph_analyze_diff analysis complete, found', diff.changes.length, 'changes');
        const result = JSON.stringify(diff, null, 2);
        console.log('📤 TOOL: graph_analyze_diff returning result, length:', result.length);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: graph_analyze_diff error:', error);
        return { content: [{ type: 'text', text: 'Error: Failed to analyze graph differences' }] };
      }
    }
  )
  ];
};

// Helper function to save graph
async function saveGraph(graph: any, baseUrl: string, authHeaders?: Record<string, string>): Promise<{ success: boolean; error?: string }> {
  console.log('💾 TOOL: saveGraph called, nodes:', graph.nodes?.length || 0, 'edges:', graph.edges?.length || 0);

  try {
    const xml = graphToXml(graph);
    console.log('📄 TOOL: saveGraph converted graph to XML, length:', xml.length);

    console.log('📡 TOOL: saveGraph making PUT request to /api/graph-api');
    const response = await fetch(`${baseUrl}/api/graph-api`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Accept-Charset': 'utf-8',
        ...authHeaders
      },
      body: xml
    });

    console.log('📡 TOOL: saveGraph PUT response status:', response.status);
    if (!response.ok) {
      console.error('❌ TOOL: saveGraph PUT request failed:', response.status);
      return { success: false, error: `Failed to save graph: HTTP ${response.status}` };
    }
    console.log('✅ TOOL: saveGraph graph saved successfully');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('💥 TOOL: saveGraph error:', errorMessage);
    return { success: false, error: `Unexpected error while saving graph: ${errorMessage}` };
  }
}
