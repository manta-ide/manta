import { tool } from '@anthropic-ai/claude-code';
import { z } from 'zod';
import { GraphSchema, PropertySchema } from './schemas';
import { loadCurrentGraphFromFile, loadGraphFromFile, loadBaseGraphFromFile, storeCurrentGraph, storeBaseGraph } from './graph-service';
import { analyzeGraphDiff } from '@/lib/graph-diff';

// Helper function to read base graph from filesystem
const DEFAULT_USER_ID = 'default-user';

const cloneGraph = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

async function readBaseGraph(): Promise<any | null> {
  try {
    console.log('🔍 TOOL: readBaseGraph via graph-service helpers');
    const baseGraph = await loadBaseGraphFromFile(DEFAULT_USER_ID);
    if (!baseGraph) {
      console.log('🔍 TOOL: Base graph file not found');
      return null;
    }

    const parsed = GraphSchema.safeParse(baseGraph);
    if (!parsed.success) {
      console.error('🔍 TOOL: Base graph schema validation failed:', parsed.error);
      return null;
    }

    return { graph: cloneGraph(parsed.data) };
  } catch (error) {
    console.error('🔍 TOOL: Error reading base graph:', error);
    return null;
  }
}

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
async function readLocalGraph(): Promise<any | null> {
  try {
    console.log('🔍 TOOL: readLocalGraph via graph-service helpers');
    const currentGraph = await loadCurrentGraphFromFile(DEFAULT_USER_ID);
    const fallbackGraph = currentGraph ?? (await loadGraphFromFile(DEFAULT_USER_ID));

    if (!fallbackGraph) {
      console.log('🔍 TOOL: No graph files found');
      return null;
    }

    const parsed = GraphSchema.safeParse(fallbackGraph);
    if (!parsed.success) {
      console.error('🔍 TOOL: Graph schema validation failed:', parsed.error);
      return null;
    }

    return { graph: cloneGraph(parsed.data) };
  } catch (error) {
    console.error('🔍 TOOL: Error reading local graph:', error);
    return null;
  }
}

// Tool definitions for Claude Code MCP server
export const createGraphTools = (baseUrl: string) => {
  console.log('🔧 Creating graph tools (graph-service backed)', { baseUrl });

  return [
  // read (rich read)
  tool(
    'read',
    'Read from current graph or base graph, or a specific node.',
    {
      graphType: z.enum(['current', 'base']).default('current').describe('Which graph to read from: "current" (working graph) or "base" (completed implementations)'),
      nodeId: z.string().optional(),
      includeProperties: z.boolean().optional(),
      includeChildren: z.boolean().optional(),
    },
    async ({ graphType = 'current', nodeId }) => {
      console.log('🔍 TOOL: read called', { graphType, nodeId });
      console.log('🔍 TOOL: process.cwd():', process.cwd());

      try {
        // Use local filesystem read only - choose graph based on type
        const graphData = graphType === 'base' ? await readBaseGraph() : await readLocalGraph();
        if (!graphData) {
          console.error(`❌ TOOL: read no ${graphType} graph found`);
          const errorMsg = `No ${graphType} graph data available. Please ensure the graph file exists.`;
          console.log('📤 TOOL: read returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        const validatedGraph = graphData.graph;
        console.log('✅ TOOL: read schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        if (nodeId) {
          console.log('🎯 TOOL: read looking for specific node:', nodeId);
          const node = validatedGraph.nodes.find((n: any) => n.id === nodeId);
          if (!node) {
            console.error('❌ TOOL: read node not found:', nodeId);
            const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
            console.log('📤 TOOL: read returning error:', errorMsg);
            return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
          }
          console.log('✅ TOOL: read found node:', node.title);
          const result = JSON.stringify(node, null, 2);
          console.log('📤 TOOL: read returning node data');
          return { content: [{ type: 'text', text: result }] };
        } else {
          console.log('📋 TOOL: read returning all nodes summary');
          const nodes = validatedGraph.nodes.map((n: any) => ({ id: n.id, title: n.title }));
          console.log('📋 TOOL: read found nodes:', nodes.length);
          const result = JSON.stringify({ nodes }, null, 2);
          console.log('📤 TOOL: read returning nodes summary');
          return { content: [{ type: 'text', text: result }] };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: read unexpected error:', errorMessage);
        const errorMsg = `Unexpected error while reading graph: ${errorMessage}`;
        return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
      }
    }
  ),

  // edge_create
  tool(
    'edge_create',
    'Create a connection (edge) between two nodes in the graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
      role: z.string().optional(),
    },
    async ({ sourceId, targetId, role }) => {
      console.log('🔗 TOOL: edge_create called', { sourceId, targetId, role });

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: edge_create no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          console.log('📤 TOOL: edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: edge_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        // Validate that both nodes exist
        console.log('🔍 TOOL: edge_create validating source node:', sourceId);
        const sourceNode = validatedGraph.nodes.find((n: any) => n.id === sourceId);
        if (!sourceNode) {
          console.error('❌ TOOL: edge_create source node not found:', sourceId);
          const errorMsg = `Source node '${sourceId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          console.log('📤 TOOL: edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: edge_create found source node:', sourceNode.title);

        console.log('🔍 TOOL: edge_create validating target node:', targetId);
        const targetNode = validatedGraph.nodes.find((n: any) => n.id === targetId);
        if (!targetNode) {
          console.error('❌ TOOL: edge_create target node not found:', targetId);
          const errorMsg = `Target node '${targetId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          console.log('📤 TOOL: edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: edge_create found target node:', targetNode.title);

        // Check if edge already exists
        console.log('🔍 TOOL: edge_create checking for existing edge');
        const existingEdge = (validatedGraph.edges || []).find((e: any) => e.source === sourceId && e.target === targetId);
        if (existingEdge) {
          console.error('❌ TOOL: edge_create edge already exists:', `${sourceId}-${targetId}`);
          const errorMsg = `Edge from '${sourceId}' to '${targetId}' already exists. Current role: ${existingEdge.role || 'none'}`;
          console.log('📤 TOOL: edge_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: edge_create no existing edge found');

        // Create the edge
        const newEdge = {
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          role: role || 'links-to'
        };
        console.log('🆕 TOOL: edge_create creating new edge:', newEdge);

        validatedGraph.edges = validatedGraph.edges || [];
        validatedGraph.edges.push(newEdge);
        console.log('✅ TOOL: edge_create added edge, total edges:', validatedGraph.edges.length);

        console.log('💾 TOOL: edge_create saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: edge_create returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: edge_create graph saved successfully');

        const result = `Created edge from ${sourceId} to ${targetId}${role ? ` (${role})` : ''}`;
        console.log('📤 TOOL: edge_create returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: edge_create error:', error);
        throw error;
      }
    }
  ),

  // edge_delete
  tool(
    'edge_delete',
    'Delete a connection (edge) between two nodes in the graph.',
    {
      sourceId: z.string().min(1, 'Source node ID is required'),
      targetId: z.string().min(1, 'Target node ID is required'),
    },
    async ({ sourceId, targetId }) => {
      console.log('🗑️ TOOL: edge_delete called', { sourceId, targetId });

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: edge_delete no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          console.log('📤 TOOL: edge_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: edge_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        // Check if edge exists
        console.log('🔍 TOOL: edge_delete checking for existing edge');
        const edgeIndex = (validatedGraph.edges || []).findIndex((e: any) => e.source === sourceId && e.target === targetId);
        if (edgeIndex === -1) {
          console.error('❌ TOOL: edge_delete edge not found:', `${sourceId}-${targetId}`);
          const errorMsg = `Edge from '${sourceId}' to '${targetId}' not found.`;
          console.log('📤 TOOL: edge_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: edge_delete found edge at index:', edgeIndex);

        // Remove the edge
        validatedGraph.edges.splice(edgeIndex, 1);
        console.log('✅ TOOL: edge_delete removed edge, total edges:', validatedGraph.edges.length);

        console.log('💾 TOOL: edge_delete saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: edge_delete returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: edge_delete graph saved successfully');

        const result = `Deleted edge from ${sourceId} to ${targetId}`;
        console.log('📤 TOOL: edge_delete returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: edge_delete error:', error);
        throw error;
      }
    }
  ),

  // node_create
  tool(
    'node_create',
    'Create a new node and persist it to the graph.',
    {
      nodeId: z.string().min(1),
      title: z.string().min(1),
      prompt: z.string().min(1),
      properties: z.array(PropertySchema).optional(),
      state: z.enum(['built','unbuilt']).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
    },
    async ({ nodeId, title, prompt, properties, state, position }) => {
      console.log('➕ TOOL: node_create called', { nodeId, title, state, position: !!position });

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_create no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          console.log('📤 TOOL: node_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: node_create checking if node already exists:', nodeId);
        const existingNode = validatedGraph.nodes.find((n: any) => n.id === nodeId);
        if (existingNode) {
          console.error('❌ TOOL: node_create node already exists:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' already exists. Please use a different node ID or use node_edit to modify the existing node.`;
          console.log('📤 TOOL: node_create returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: node_create node ID is available');

        const node: any = {
          id: nodeId,
          title,
          prompt,
          properties: properties || [],
          ...(position ? { position: { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 } } : {})
        };
        console.log('🆕 TOOL: node_create creating new node:', { id: nodeId, title, propertiesCount: node.properties.length });

        validatedGraph.nodes.push(node);
        console.log('✅ TOOL: node_create added node, total nodes:', validatedGraph.nodes.length);

        console.log('💾 TOOL: node_create saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: node_create returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: node_create graph saved successfully');

        const result = `Successfully added node "${nodeId}" with title "${title}". The node has ${node.properties.length} properties.`;
        console.log('📤 TOOL: node_create returning success:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_create unexpected error:', errorMessage);
        const errorMsg = `Unexpected error while adding node: ${errorMessage}`;
        return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
      }
    }
  ),

  // analyze_diff
  tool(
    'analyze_diff',
    'Analyze differences between current graph and base graph to see what changes need to be made.',
    {},
    async () => {
      console.log('🔍 TOOL: analyze_diff called');

      try {
        // Read the diff from the graph API
        const diffUrl = `${baseUrl}/api/graph-api?type=diff`;
        console.log('🔍 TOOL: analyze_diff fetching from:', diffUrl);
        const diffResponse = await fetch(diffUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (!diffResponse.ok) {
          console.error('❌ TOOL: analyze_diff failed to fetch diff:', diffResponse.status);
          const errorMsg = 'Failed to analyze graph differences';
          console.log('📤 TOOL: analyze_diff returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const diffData = await diffResponse.json();

        if (!diffData.success) {
          console.error('❌ TOOL: analyze_diff API returned error:', diffData.error);
          const errorMsg = diffData.error || 'Failed to analyze differences';
          console.log('📤 TOOL: analyze_diff returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }

        const { diff, summary } = diffData;

        // Format the diff information for the agent
        let result = `Graph Analysis Complete:\n${summary}\n\n`;

        if (diff.addedNodes.length > 0) {
          result += `📍 **Added Nodes (${diff.addedNodes.length}):**\n`;
          // For added nodes, we need to get their details from current graph
          const currentGraphUrl = `${baseUrl}/api/graph-api?type=current`;
          console.log('🔍 TOOL: analyze_diff fetching current graph from:', currentGraphUrl);
          const currentGraphResponse = await fetch(currentGraphUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (currentGraphResponse.ok) {
            const currentData = await currentGraphResponse.json();
            if (currentData.success && currentData.graph) {
              diff.addedNodes.forEach((nodeId: string) => {
                const node = currentData.graph.nodes.find((n: any) => n.id === nodeId);
                if (node) {
                  result += `- **${node.title}** (${nodeId}): "${node.prompt}"\n`;
                }
              });
            }
          }
          result += '\n';
        }

        if (diff.modifiedNodes.length > 0) {
          result += `✏️ **Modified Nodes (${diff.modifiedNodes.length}):**\n`;
          diff.modifiedNodes.forEach((nodeId: string) => {
            result += `- ${nodeId}\n`;
          });
          result += '\n';
        }

        if (diff.deletedNodes.length > 0) {
          result += `🗑️ **Deleted Nodes (${diff.deletedNodes.length}):**\n`;
          diff.deletedNodes.forEach((nodeId: string) => {
            result += `- ${nodeId}\n`;
          });
          result += '\n';
        }

        if (diff.addedNodes.length === 0 && diff.modifiedNodes.length === 0 && diff.deletedNodes.length === 0) {
          result += '🎉 **No differences found!** The current graph matches the base graph perfectly.\n';
        } else {
          result += '💡 **Next Steps:**\n';
          result += '1. Review the changes above\n';
          result += '2. Use node_create, node_edit, or other tools to make necessary changes\n';
          result += '3. Use update_base_graph to save completed changes\n';
          result += '4. Run analyze_diff again to verify all changes are complete\n';
        }

        console.log('📤 TOOL: analyze_diff returning result:', summary);
        return { content: [{ type: 'text', text: result }] };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: analyze_diff unexpected error:', errorMessage);
        return { content: [{ type: 'text', text: `Error analyzing differences: ${errorMessage}` }] };
      }
    }
  ),

  // node_edit
  tool(
    'node_edit',
    'Edit node fields with two modes: replace (fully replaces node) or merge (merges properties with existing data).',
    {
      nodeId: z.string().min(1),
      mode: z.enum(['replace', 'merge']).default('replace').describe('Edit mode: "replace" fully replaces the node, "merge" merges properties with existing data'),
      title: z.string().optional(),
      prompt: z.string().optional(),
      properties: z.array(PropertySchema).optional(),
      children: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
      position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
    },
    async ({ nodeId, mode = 'replace', title, prompt, properties, children, position }) => {
      console.log('✏️ TOOL: node_edit called', { nodeId, mode, title: !!title, prompt: !!prompt, propertiesCount: properties?.length, childrenCount: children?.length, position: !!position });

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_edit no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          console.log('📤 TOOL: node_edit returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_edit schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: node_edit looking for node:', nodeId);
        const idx = validatedGraph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) {
          console.error('❌ TOOL: node_edit node not found:', nodeId);
          throw new Error(`Node ${nodeId} not found`);
        }
        console.log('✅ TOOL: node_edit found node at index:', idx, 'title:', validatedGraph.nodes[idx].title);

        if (mode === 'merge') {
          console.log('🔄 TOOL: node_edit using MERGE mode');
          // Merge mode: preserve existing data and merge properties
          const existing = validatedGraph.nodes[idx];
          const next = { ...existing } as any;

          // Merge simple fields (only update if provided)
          if (title !== undefined) {
            console.log('📝 TOOL: node_edit merging title:', title);
            next.title = title;
          }
          if (prompt !== undefined) {
            console.log('📝 TOOL: node_edit merging prompt, length:', prompt.length);
            next.prompt = prompt;
          }
          if (children !== undefined) {
            console.log('👶 TOOL: node_edit merging children, count:', children.length);
            next.children = children;
          }
          if (position !== undefined) {
            console.log('📍 TOOL: node_edit merging position:', position);
            next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
          }

          // Special handling for properties: merge instead of replace
          if (properties !== undefined) {
            console.log('🔧 TOOL: node_edit merging properties, count:', properties.length);
            // Normalize incoming properties first
            properties = normalizeProperties(properties);
            console.log('🔧 TOOL: node_edit normalized properties, count:', properties.length);

            const existingProps = Array.isArray(existing.properties) ? existing.properties : [];
            console.log('🔧 TOOL: node_edit existing properties count:', existingProps.length);

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

          console.log('🔧 TOOL: node_edit merged properties, final count:', Array.from(byId.values()).length);
          next.properties = Array.from(byId.values());
        }

        validatedGraph.nodes[idx] = next;
        console.log('💾 TOOL: node_edit saving updated graph (merge mode)');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: node_edit returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: node_edit graph saved successfully');

        const result = `Merged changes into node ${nodeId}`;
        console.log('📤 TOOL: node_edit returning result:', result);
        return { content: [{ type: 'text', text: result }] };

      } else {
        console.log('🔄 TOOL: node_edit using REPLACE mode');
        // Replace mode: fully replace the node (original behavior)
        const next = { ...validatedGraph.nodes[idx] } as any;
        if (title !== undefined) {
          console.log('📝 TOOL: node_edit replacing title:', title);
          next.title = title;
        }
        if (prompt !== undefined) {
          console.log('📝 TOOL: node_edit replacing prompt, length:', prompt.length);
          next.prompt = prompt;
        }
        if (properties !== undefined) {
          console.log('🔧 TOOL: node_edit replacing properties, count:', properties.length);
          next.properties = properties;
        }
        if (children !== undefined) {
          console.log('👶 TOOL: node_edit replacing children, count:', children.length);
          next.children = children;
        }
        if (position !== undefined) {
          console.log('📍 TOOL: node_edit replacing position:', position);
          next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
        }
        validatedGraph.nodes[idx] = next;
        console.log('💾 TOOL: node_edit saving updated graph (replace mode)');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: node_edit returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: node_edit graph saved successfully');

        const result = `Replaced node ${nodeId}`;
        console.log('📤 TOOL: node_edit returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      }
    } catch (error) {
      console.error('💥 TOOL: node_edit error:', error);
      throw error;
    }
  }
  ),

  // update_base_graph
  tool(
    'update_base_graph',
    'Update the base graph with successfully built nodes. Use this after successfully implementing node code to save the built state to the base graph.',
    {
      nodes: z.array(z.object({
        id: z.string(),
        title: z.string().optional(),
        prompt: z.string().optional(),
        properties: z.array(PropertySchema).optional(),
        position: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }).optional(),
      })).min(1),
    },
    async ({ nodes }) => {
      console.log('💾 TOOL: update_base_graph called', { nodeCount: nodes.length, nodeIds: nodes.map(n => n.id) });

      try {
        // Read current base graph
        const baseGraphResult = await readBaseGraph();
        let baseGraph = baseGraphResult?.graph;

        if (!baseGraph) {
          console.log('📝 TOOL: update_base_graph creating new base graph');
          baseGraph = { nodes: [], edges: [] };
        }

        console.log('📊 TOOL: update_base_graph base graph has', baseGraph.nodes?.length || 0, 'nodes');

        // Update or add nodes to base graph
        for (const nodeUpdate of nodes) {
          const existingIdx = baseGraph.nodes.findIndex((n: any) => n.id === nodeUpdate.id);

          if (existingIdx >= 0) {
            // Update existing node
            console.log('🔄 TOOL: update_base_graph updating existing node:', nodeUpdate.id);
            baseGraph.nodes[existingIdx] = {
              ...baseGraph.nodes[existingIdx],
              ...nodeUpdate,
              // Preserve any existing properties not being updated
              properties: nodeUpdate.properties !== undefined ? nodeUpdate.properties : baseGraph.nodes[existingIdx].properties
            };
          } else {
            // Add new node
            console.log('➕ TOOL: update_base_graph adding new node:', nodeUpdate.id);
            const newNode = {
              id: nodeUpdate.id,
              title: nodeUpdate.title || nodeUpdate.id,
              prompt: nodeUpdate.prompt || '',
              properties: nodeUpdate.properties || [],
              position: nodeUpdate.position || { x: 0, y: 0, z: 0 },
              state: 'built' // Base graph nodes are always considered built
            };
            baseGraph.nodes.push(newNode);
          }
        }

        console.log('💾 TOOL: update_base_graph saving updated base graph with', baseGraph.nodes.length, 'nodes');
        await storeBaseGraph(baseGraph, DEFAULT_USER_ID);
        console.log('✅ TOOL: update_base_graph base graph saved successfully');

        const result = `Updated base graph with ${nodes.length} node(s): ${nodes.map(n => n.id).join(', ')}`;
        console.log('📤 TOOL: update_base_graph returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: update_base_graph error:', error);
        const errorMsg = `Failed to update base graph: ${error instanceof Error ? error.message : String(error)}`;
        return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
      }
    }
  ),

  // node_delete
  tool(
    'node_delete',
    'Delete a node by id.',
    { nodeId: z.string().min(1), recursive: z.boolean().optional().default(true) },
    async ({ nodeId, recursive }) => {
      console.log('🗑️ TOOL: node_delete called', { nodeId, recursive });

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_delete no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          console.log('📤 TOOL: node_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        console.log('🔍 TOOL: node_delete checking if node exists:', nodeId);
        const byId = new Map<string, any>(validatedGraph.nodes.map((n: any) => [n.id, n]));
        if (!byId.has(nodeId)) {
          console.error('❌ TOOL: node_delete node not found:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          console.log('📤 TOOL: node_delete returning error:', errorMsg);
          return { content: [{ type: 'text', text: `Error: ${errorMsg}` }] };
        }
        console.log('✅ TOOL: node_delete node found:', byId.get(nodeId).title);

        console.log('🔄 TOOL: node_delete cleaning up references');
        validatedGraph.nodes.forEach((n: any) => {
          if (Array.isArray(n.children)) n.children = n.children.filter((c: any) => c.id !== nodeId);
        });

        console.log('🗂️ TOOL: node_delete collecting nodes to delete');
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

        console.log('🗑️ TOOL: node_delete will delete nodes:', Array.from(toDelete));
        const originalCount = validatedGraph.nodes.length;
        validatedGraph.nodes = validatedGraph.nodes.filter((n: any) => !toDelete.has(n.id));
        console.log('✅ TOOL: node_delete removed nodes, count changed from', originalCount, 'to', validatedGraph.nodes.length);

        // Also remove any explicit edges that reference deleted nodes
        const beforeEdges = (validatedGraph.edges || []).length;
        if (Array.isArray(validatedGraph.edges)) {
          validatedGraph.edges = validatedGraph.edges.filter((e: any) => !toDelete.has(e.source) && !toDelete.has(e.target));
        }
        const afterEdges = (validatedGraph.edges || []).length;
        if (beforeEdges !== afterEdges) {
          console.log('✅ TOOL: node_delete removed edges connected to deleted nodes,', beforeEdges, '->', afterEdges);
        }

        console.log('💾 TOOL: node_delete saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          console.log('📤 TOOL: node_delete returning save error:', saveResult.error);
          return { content: [{ type: 'text', text: `Error: ${saveResult.error}` }] };
        }
        console.log('✅ TOOL: node_delete graph saved successfully');

        const result = `Deleted node ${nodeId}${recursive ? ' (recursive)' : ''}`;
        console.log('📤 TOOL: node_delete returning result:', result);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        console.error('💥 TOOL: node_delete error:', error);
        throw error;
      }
    }
  ),

  ];
};

// Helper function to save graph
async function saveGraph(graph: any): Promise<{ success: boolean; error?: string }> {
  console.log('💾 TOOL: saveGraph called, nodes:', graph.nodes?.length || 0, 'edges:', graph.edges?.length || 0);

  try {
    const parsed = GraphSchema.safeParse(graph);
    if (!parsed.success) {
      const errorMsg = parsed.error.message;
      console.error('💥 TOOL: saveGraph validation error:', errorMsg);
      return { success: false, error: `Graph validation failed: ${errorMsg}` };
    }

    await storeCurrentGraph(parsed.data, DEFAULT_USER_ID);
    console.log('✅ TOOL: saveGraph graph saved successfully via graph service');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('💥 TOOL: saveGraph error:', errorMessage);
    return { success: false, error: `Unexpected error while saving graph: ${errorMessage}` };
  }
}
