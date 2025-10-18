import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile, storeGraph, registerStreamController, unregisterStreamController, storeCurrentGraph, storeBaseGraph, loadCurrentGraphFromFile, loadBaseGraphFromFile, storeCurrentGraphWithoutBroadcast, storeCurrentGraphFromAgent } from '../lib/graph-service';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { analyzeGraphDiff } from '@/lib/graph-diff';
import { GraphSchema, PropertySchema, NodeMetadataSchema } from '../lib/schemas';
import type { NodeMetadata } from '../lib/schemas';
import path from 'path';
import { z } from 'zod';

const LOCAL_MODE = process.env.NODE_ENV !== 'production';
const DEFAULT_USER_ID = 'default-user';

// Helper function to read base graph from filesystem
const cloneGraph = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

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

/**
 * Sanitizes and normalizes file path entries for node metadata.
 *
 * This function ensures all file paths are relative to the project root and properly formatted.
 * It handles both absolute paths and malformed relative paths, converting them all to
 * clean, project-root-relative paths (e.g., "src/components/Button.tsx").
 *
 * Examples:
 * - "/Users/project/src/Button.tsx" → "src/components/Button.tsx"
 * - "../../../../src/Button.tsx" → "src/components/Button.tsx"
 * - "./src/Button.tsx" → "src/components/Button.tsx"
 * - "src/Button.tsx" → "src/components/Button.tsx" (if already correct)
 *
 * @param entries Array of file path strings to sanitize
 * @returns Array of normalized relative file paths
 */
const sanitizeMetadataFileEntries = (entries: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const files: string[] = [];
  const projectRoot = process.cwd();

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    let candidate = trimmed;

    // Always convert to absolute path first, then make relative to project root
    // This ensures we handle both absolute paths and incorrectly formatted relative paths
    let absolutePath: string;
    if (path.isAbsolute(trimmed)) {
      absolutePath = trimmed;
    } else {
      // For relative paths, resolve them relative to the project root
      absolutePath = path.resolve(projectRoot, trimmed);
    }

    // Now make it relative to project root
    candidate = path.relative(projectRoot, absolutePath);

    // Normalize path separators and remove leading ./
    candidate = candidate.replace(/\\/g, '/');
    if (candidate.startsWith('./')) {
      candidate = candidate.substring(2);
    }

    // Skip if empty or already seen
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    files.push(candidate);
  }

  return files;
};

const MetadataInputSchema = z.union([
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

/**
 * Recursively extracts file paths from various nested metadata formats
 */
const extractFilesFromMetadata = (metadata: any): string[] => {
  if (!metadata) return [];

  // Direct array of strings
  if (Array.isArray(metadata)) {
    return metadata.flatMap(item => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object') {
        return extractFilesFromMetadata(item);
      }
      return [];
    });
  }

  // Single string
  if (typeof metadata === 'string') {
    return [metadata];
  }

  // Object with files property
  if (metadata && typeof metadata === 'object' && 'files' in metadata) {
    return extractFilesFromMetadata(metadata.files);
  }

  return [];
};

const normalizeNodeMetadata = (metadata: unknown): NodeMetadata | undefined => {
  if (metadata === undefined || metadata === null) return undefined;

  // Log input for debugging, but only in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🗂️ TOOL: normalizeNodeMetadata input:', typeof metadata, Array.isArray(metadata) ? 'array' : '', metadata);
  }

  // Try direct schema validation first
  if (!Array.isArray(metadata) && typeof metadata !== 'string') {
    const parsed = NodeMetadataSchema.safeParse(metadata);
    if (parsed.success) {
      return { files: sanitizeMetadataFileEntries(parsed.data.files), bugs: parsed.data.bugs || [] };
    }
    // Log warning if we have malformed metadata that needs extraction
    if (metadata && typeof metadata === 'object' && 'files' in metadata) {
      console.log('⚠️ TOOL: normalizeNodeMetadata detected nested metadata format, extracting files recursively');
    }
  }

  // Extract files using recursive extraction
  const rawFiles = extractFilesFromMetadata(metadata);

  const files = sanitizeMetadataFileEntries(rawFiles);

  if (files.length === 0) {
    return undefined;
  }
  return { files, bugs: [] };
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

    await storeCurrentGraphFromAgent(parsed.data, DEFAULT_USER_ID);
    console.log('✅ TOOL: saveGraph graph saved successfully via graph service');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('💥 TOOL: saveGraph error:', errorMessage);
    return { success: false, error: `Unexpected error while saving graph: ${errorMessage}` };
  }
}

// Get default user for all requests
async function getSessionFromRequest(req: NextRequest) {
  return { user: { id: DEFAULT_USER_ID } } as any;
}

export async function GET(req: NextRequest) {
  try {
    // Ensure default layer exists before any graph operations
    const { ensureLayersRoot, getLayersInfo, createLayer, setActiveLayer } = await import('@/lib/layers');
    ensureLayersRoot();
    const info = getLayersInfo();
    if (info.layers.length === 0) {
      const name = createLayer('graph1');
      setActiveLayer(name);
    }

    // Get current user session for all GET requests
    const session = await getSessionFromRequest(req);

    const user = session?.user || { id: 'default-user' };
    
    // Check if this is an SSE request
    const url = new URL(req.url);
    const isSSE = url.searchParams.get('sse') === 'true';
    const getUnbuiltNodes = url.searchParams.get('unbuilt') === 'true';
    const fresh = url.searchParams.get('fresh') === 'true'; // Force fresh read from filesystem
    const graphType = url.searchParams.get('type') || url.searchParams.get('graphType'); // 'current', 'base', 'diff', or undefined for default
    const nodeId = url.searchParams.get('nodeId'); // For reading specific nodes
    const accept = (req.headers.get('accept') || '').toLowerCase();
    const wantsJson = accept.includes('application/json') && !accept.includes('application/xml');
    
    if (isSSE) {
      // Set up SSE headers
      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      };

      const stream = new ReadableStream({
        start(controller) {
          // Register the controller for broadcasts
          registerStreamController(controller);

          // Send initial graph data
          const sendGraphData = async () => {
             try {
               let graph;
               if (LOCAL_MODE) {
                 // In development mode, always reload from file to pick up directory changes
                 try {
                   graph = await loadCurrentGraphFromFile(user.id);
                 } catch (loadError) {
                   console.log('ℹ️ No graph file found in dev mode, skipping SSE update (loadError: ', loadError, ')');
                   return; // Don't send any data if no graph exists
                 }
               } else {
                 // In production, use session cache for performance
                 graph = getGraphSession();
                 if (!graph) {
                   try {
                     await loadGraphFromFile(user.id);
                     graph = getGraphSession();
                   } catch (loadError) {
                     console.log('ℹ️ No graph file found, skipping SSE update (loadError: ', loadError, ')');
                     return; // Don't send any data if no graph exists
                   }
                 }
               }
               
               if (graph && graph.nodes) {
                 const xml = graphToXml(graph);
                 // Base64 encode the XML using UTF-8 bytes
                 const encodedXml = Buffer.from(xml, 'utf8').toString('base64');
                 const payload = `data: ${encodedXml}\n\n`;
                 controller.enqueue(new TextEncoder().encode(payload));
               }
             } catch (error) {
               console.error('Error sending SSE graph data:', error);
               // Don't throw the error, just log it and continue
             }
           };

          // Send initial data
          sendGraphData();

          // No periodic updates - only send data when broadcasts happen via the broadcast system

          // Clean up on close
          req.signal.addEventListener('abort', () => {
            unregisterStreamController(controller);
            controller.close();
          });
        }
      });

      return new Response(stream, { headers });
    }

    // Check if requesting unbuilt nodes only
    if (getUnbuiltNodes) {
      // Load both current and base graphs to compare
      const currentGraph = await loadCurrentGraphFromFile(user.id);
      const baseGraph = await loadBaseGraphFromFile(user.id);

      if (!currentGraph) {
        console.log('ℹ️ No current graph found in file system');
        return NextResponse.json(
          { error: 'Current graph not found' },
          { status: 404 }
        );
      }

      if (!baseGraph) {
        console.log('ℹ️ No base graph found - all nodes considered unbuilt');
        // If no base graph exists, all nodes are unbuilt
        const unbuiltNodeIds = currentGraph.nodes.map(node => node.id);
        return NextResponse.json({
          success: true,
          unbuiltNodeIds: unbuiltNodeIds,
          count: unbuiltNodeIds.length
        });
      }

      // Use graph diff to find unbuilt nodes (added or modified)
      const diff = analyzeGraphDiff(baseGraph, currentGraph);
      const unbuiltNodeIds = [...diff.addedNodes, ...diff.modifiedNodes];

      console.log(`✅ Returning ${unbuiltNodeIds.length} unbuilt node IDs (${diff.addedNodes.length} added, ${diff.modifiedNodes.length} modified)`);

      return NextResponse.json({
        success: true,
        unbuiltNodeIds: unbuiltNodeIds,
        count: unbuiltNodeIds.length
      });
    }

    // Handle diff request
    if (graphType === 'diff') {
      console.log('📊 Getting graph diff...');

      // Load both current and base graphs to compare
      const currentGraph = await loadCurrentGraphFromFile(user.id);
      const baseGraph = await loadBaseGraphFromFile(user.id);

      if (!currentGraph) {
        console.log('ℹ️ No current graph found');
        return NextResponse.json(
          { error: 'Current graph not found' },
          { status: 404 }
        );
      }

      if (!baseGraph) {
        console.log('ℹ️ No base graph found - all current nodes are new');
        // If no base graph exists, all current nodes are considered "added"
        const diff = {
          addedNodes: currentGraph.nodes.map(n => n.id),
          modifiedNodes: [],
          deletedNodes: [],
          addedEdges: [],
          deletedEdges: []
        };
        return NextResponse.json({
          success: true,
          diff,
          summary: `${diff.addedNodes.length} nodes added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted, ${diff.addedEdges.length} edges added, ${diff.deletedEdges.length} edges deleted`
        });
      }

      // Use graph diff to find differences
      const diff = analyzeGraphDiff(baseGraph, currentGraph);

      console.log(`✅ Diff calculated: ${diff.addedNodes.length} added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted`);

      return NextResponse.json({
        success: true,
        diff,
        summary: `${diff.addedNodes.length} nodes added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted, ${diff.addedEdges.length} edges added, ${diff.deletedEdges.length} edges deleted`
      });
    }

    // Regular GET request
    // Always try to load from file first to ensure we have the latest data
    let graph = null;
      if (fresh) {
        // Force fresh read from filesystem, bypass session cache
        if (graphType === 'base') {
          graph = await loadBaseGraphFromFile(user.id);
        } else {
          graph = await loadCurrentGraphFromFile(user.id);
        }
      } else {
        // For base graphs, always load from file (don't use session cache)
        if (graphType === 'base') {
          graph = await loadBaseGraphFromFile(user.id);
        } else {
          // In development mode, always reload from file to pick up directory changes
          // In production, use session cache for performance
          if (LOCAL_MODE) {
            graph = await loadCurrentGraphFromFile(user.id);
          } else {
            graph = getGraphSession();
            if (!graph) {
              await loadGraphFromFile(user.id);
              graph = getGraphSession();
            }
          }
        }
      }

      if (!graph) {
        console.log('ℹ️ No graph found in file system');
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }

      // Check if requesting a specific node
      if (nodeId) {
        console.log('🎯 GET: looking for specific node:', nodeId);
        const node = graph.nodes?.find((n: any) => n.id === nodeId);
        if (!node) {
          console.error('❌ GET: node not found:', nodeId);
          const availableNodes = graph.nodes?.map((n: any) => n.id).join(', ') || 'none';
          return NextResponse.json(
            { error: `Node with ID '${nodeId}' not found. Available nodes: ${availableNodes}` },
            { status: 404 }
          );
        }
        console.log('✅ GET: found node:', node.title);

        // Find all connections (edges) for this node
        const edges = graph.edges || [];
        const nodeConnections = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);

        // Create a map of node IDs to titles for better display
        const nodeTitleMap = new Map<string, string>();
        graph.nodes?.forEach((n: any) => {
          nodeTitleMap.set(n.id, n.title);
        });

        // Format the response with node data and connections
        let result = `**Node: ${node.title} (${nodeId})**\n\n`;
        result += `**Prompt:** ${node.prompt}\n\n`;

        // Add properties if they exist
        if (node.properties && node.properties.length > 0) {
          result += `**Properties:**\n`;
          node.properties.forEach((prop: any) => {
            const hasMinMax = (typeof prop.min === 'number') || (typeof prop.max === 'number');
            const rangeText = hasMinMax ? ` [${prop.min ?? ''}..${prop.max ?? ''}${typeof prop.step === 'number' ? `, step ${prop.step}` : ''}]` : '';
            result += `- ${prop.id}: ${JSON.stringify(prop.value)} (${prop.type}${rangeText})\n`;
          });
          result += '\n';
        }

        // Add connections
        if (nodeConnections.length > 0) {
          result += `**Connections (${nodeConnections.length}):**\n`;
          nodeConnections.forEach((edge: any) => {
            const isSource = edge.source === nodeId;
            const otherNodeId = isSource ? edge.target : edge.source;
            const otherNodeTitle = nodeTitleMap.get(otherNodeId) || otherNodeId;
            const direction = isSource ? '→' : '←';
            const role = edge.role ? ` (${edge.role})` : '';
            result += `- ${direction} ${otherNodeTitle} (${otherNodeId})${role}\n`;
          });
        } else {
          result += `**Connections:** None\n`;
        }

        console.log('📤 GET: returning formatted node data');
        return new Response(result, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

    if (!wantsJson) {
      const xml = graphToXml(graph);
      return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' } });
    }
    return NextResponse.json({ success: true, graph });
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

// Helper function to sync specific nodes/edges to base graph
async function syncToBaseGraph(nodeIds: string[], edgeIds: string[]): Promise<{ success: boolean; error?: string }> {
  console.log('🔄 TOOL: syncToBaseGraph called', { nodeIds, edgeIds });

  try {
    // Read both current and base graphs
    const currentGraphResult = await readLocalGraph();
    const baseGraphResult = await readBaseGraph();

    if (!currentGraphResult) {
      throw new Error('No current graph available to sync from');
    }

    let baseGraph = baseGraphResult?.graph;
    if (!baseGraph) {
      console.log('📝 TOOL: syncToBaseGraph creating new base graph');
      baseGraph = { nodes: [], edges: [] };
    }

    const currentGraph = currentGraphResult.graph;
    console.log('📊 TOOL: syncToBaseGraph - current:', currentGraph.nodes?.length || 0, 'nodes,', currentGraph.edges?.length || 0, 'edges');
    console.log('📊 TOOL: syncToBaseGraph - base:', baseGraph.nodes?.length || 0, 'nodes,', baseGraph.edges?.length || 0, 'edges');

    // Sync nodes
    if (nodeIds && nodeIds.length > 0) {
      for (const nodeId of nodeIds) {
        const currentNode = currentGraph.nodes?.find((n: any) => n.id === nodeId);
        const baseNodeIdx = baseGraph.nodes?.findIndex((n: any) => n.id === nodeId) ?? -1;

        if (currentNode) {
          // Node exists in current graph
          if (baseNodeIdx >= 0) {
            // Update existing node in base graph
            console.log('🔄 TOOL: syncToBaseGraph updating node:', nodeId);
            baseGraph.nodes[baseNodeIdx] = { ...currentNode };
          } else {
            // Add new node to base graph
            console.log('➕ TOOL: syncToBaseGraph adding node:', nodeId);
            baseGraph.nodes = baseGraph.nodes || [];
            baseGraph.nodes.push({ ...currentNode });
          }
        } else if (baseNodeIdx >= 0) {
          // Node doesn't exist in current but exists in base - remove from base
          console.log('🗑️ TOOL: syncToBaseGraph removing node from base:', nodeId);
          baseGraph.nodes.splice(baseNodeIdx, 1);
        }
      }
    }

    // Sync edges
    if (edgeIds && edgeIds.length > 0) {
      for (const edgeId of edgeIds) {
        const currentEdge = currentGraph.edges?.find((e: any) => e.id === edgeId);
        const baseEdgeIdx = baseGraph.edges?.findIndex((e: any) => e.id === edgeId) ?? -1;

        if (currentEdge) {
          // Edge exists in current graph
          if (baseEdgeIdx >= 0) {
            // Update existing edge in base graph
            console.log('🔄 TOOL: syncToBaseGraph updating edge:', edgeId);
            baseGraph.edges[baseEdgeIdx] = { ...currentEdge };
          } else {
            // Add new edge to base graph
            console.log('➕ TOOL: syncToBaseGraph adding edge:', edgeId);
            baseGraph.edges = baseGraph.edges || [];
            baseGraph.edges.push({ ...currentEdge });
          }
        }
      }
    }

    console.log('💾 TOOL: syncToBaseGraph saving synced base graph with', baseGraph.nodes?.length || 0, 'nodes,', baseGraph.edges?.length || 0, 'edges');
    await storeBaseGraph(baseGraph, DEFAULT_USER_ID);
    console.log('✅ TOOL: syncToBaseGraph base graph synced successfully');
    return { success: true };
  } catch (error) {
    console.error('💥 TOOL: syncToBaseGraph error:', error);
    const errorMsg = `Failed to sync to base graph: ${error instanceof Error ? error.message : String(error)}`;
    return { success: false, error: errorMsg };
  }
}

/**
 * Compares two nodes in detail and returns an array of difference descriptions
 */
function compareNodesDetailed(baseNode: any, currentNode: any): string[] {
  const differences: string[] = [];

  // Compare basic fields
  if (baseNode.title !== currentNode.title) {
    differences.push(`**Title changed:** "${baseNode.title}" → "${currentNode.title}"`);
  }

  if (baseNode.prompt !== currentNode.prompt) {
    differences.push(`**Prompt changed:**`);
    differences.push(`  From: "${baseNode.prompt}"`);
    differences.push(`  To: "${currentNode.prompt}"`);
  }

  // Compare properties
  const baseProps = Array.isArray(baseNode.properties) ? baseNode.properties : [];
  const currentProps = Array.isArray(currentNode.properties) ? currentNode.properties : [];

  const basePropMap = new Map(baseProps.map((p: any) => [p.id, p]));
  const currentPropMap = new Map(currentProps.map((p: any) => [p.id, p]));

  // Check for added properties
  for (const [propId, currentProp] of currentPropMap.entries()) {
    if (!basePropMap.has(propId)) {
      differences.push(`**Property added:** ${propId} = ${JSON.stringify((currentProp as any).value)} (${(currentProp as any).type})`);
    }
  }

  // Check for removed properties
  for (const [propId, baseProp] of basePropMap.entries()) {
    if (!currentPropMap.has(propId)) {
      differences.push(`**Property removed:** ${propId} (was: ${JSON.stringify((baseProp as any).value)})`);
    }
  }

  // Check for modified properties
  for (const [propId, currentProp] of currentPropMap.entries()) {
    const baseProp = basePropMap.get(propId);
    if (baseProp) {
      const propDifferences = comparePropertyDetailed(propId as string, baseProp as any, currentProp as any);
      differences.push(...propDifferences);
    }
  }

  return differences;
}

/**
 * Compares two properties in detail and returns difference descriptions
 */
function comparePropertyDetailed(propId: string, baseProp: any, currentProp: any): string[] {
  const differences: string[] = [];

  // Check if values are different
  const baseValue = baseProp.value;
  const currentValue = currentProp.value;

  const valuesEqual = (() => {
    if (baseValue === currentValue) return true;
    if (typeof baseValue === 'object' && baseValue !== null &&
        typeof currentValue === 'object' && currentValue !== null) {
      return JSON.stringify(baseValue) === JSON.stringify(currentValue);
    }
    return false;
  })();

  if (!valuesEqual) {
    differences.push(`**Property modified:** ${propId}`);
    differences.push(`  From: ${JSON.stringify(baseValue)}`);
    differences.push(`  To: ${JSON.stringify(currentValue)}`);
  }

  // Check other property fields
  if (baseProp.type !== currentProp.type) {
    differences.push(`**Property type changed:** ${propId} (${baseProp.type} → ${currentProp.type})`);
  }

  if (baseProp.title !== currentProp.title) {
    differences.push(`**Property title changed:** ${propId} ("${baseProp.title}" → "${currentProp.title}")`);
  }

  // Check fields for object properties
  if (baseProp.type === 'object' || currentProp.type === 'object') {
    const baseFields = Array.isArray(baseProp.fields) ? baseProp.fields : [];
    const currentFields = Array.isArray(currentProp.fields) ? currentProp.fields : [];

    const baseFieldMap = new Map(baseFields.map((f: any) => [f.id || f.name, f]));
    const currentFieldMap = new Map(currentFields.map((f: any) => [f.id || f.name, f]));

    // Added fields
    for (const [fieldId, currentField] of currentFieldMap.entries()) {
      if (!baseFieldMap.has(fieldId)) {
        differences.push(`**Object field added:** ${propId}.${fieldId} = ${JSON.stringify((currentField as any).value)}`);
      }
    }

    // Removed fields
    for (const [fieldId, baseField] of baseFieldMap.entries()) {
      if (!currentFieldMap.has(fieldId)) {
        differences.push(`**Object field removed:** ${propId}.${fieldId} (was: ${JSON.stringify((baseField as any).value)})`);
      }
    }

    // Modified fields
    for (const [fieldId, currentField] of currentFieldMap.entries()) {
      const baseField = baseFieldMap.get(fieldId);
      if (baseField) {
        if (JSON.stringify((baseField as any).value) !== JSON.stringify((currentField as any).value)) {
          differences.push(`**Object field modified:** ${propId}.${fieldId}`);
          differences.push(`  From: ${JSON.stringify((baseField as any).value)}`);
          differences.push(`  To: ${JSON.stringify((currentField as any).value)}`);
        }
      }
    }
  }

  return differences;
}

export async function POST(req: NextRequest) {
  try {
    // Get current user session
    const session = await getSessionFromRequest(req);

    const user = session?.user || { id: DEFAULT_USER_ID };

    const body = await req.json();
    const { action, ...params } = body;

    // Handle different actions
    if (action === 'refresh') {
      console.log('🔄 Refreshing graph from file...');
      // Force refresh the graph data from file
      await loadGraphFromFile(user.id);
      const graph = getGraphSession();

      if (!graph) {
        console.log('ℹ️ No graph found after refresh');
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }

      console.log(`✅ Refreshed graph with ${graph.nodes?.length || 0} nodes`);

      return NextResponse.json({
        success: true,
        graph: graph
      });
    }

    // Tool operations
    if (action === 'node_create') {
      console.log('➕ TOOL: node_create called', params);

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_create no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        const { nodeId, title, prompt, properties, position, alreadyImplemented, metadata } = params;

        console.log('🔍 TOOL: node_create checking if node already exists:', nodeId);
        const existingNode = validatedGraph.nodes.find((n: any) => n.id === nodeId);
        if (existingNode) {
          console.error('❌ TOOL: node_create node already exists:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' already exists. Please use a different node ID or use node_edit to modify the existing node.`;
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        console.log('✅ TOOL: node_create node ID is available');

        const node: any = {
          id: nodeId,
          title,
          prompt,
          properties: properties || [],
          ...(position ? { position: { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 } } : {})
        };
        const normalizedMetadata = normalizeNodeMetadata(metadata);
        if (normalizedMetadata) {
          node.metadata = normalizedMetadata;
        }
        console.log('🆕 TOOL: node_create creating new node:', { id: nodeId, title, propertiesCount: node.properties.length });

        validatedGraph.nodes.push(node);
        console.log('✅ TOOL: node_create added node, total nodes:', validatedGraph.nodes.length);

        console.log('💾 TOOL: node_create saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }
        console.log('✅ TOOL: node_create graph saved successfully');

        // If alreadyImplemented is true, sync this node to base graph immediately
        if (alreadyImplemented) {
          console.log('🔄 TOOL: node_create syncing to base graph due to alreadyImplemented=true');
          try {
            const syncResult = await syncToBaseGraph([nodeId], []);
            if (!syncResult.success) {
              console.log('⚠️ TOOL: node_create sync to base failed:', syncResult.error);
              return NextResponse.json({ error: `Warning: Node created but failed to sync to base: ${syncResult.error}` }, { status: 500 });
            }
            console.log('✅ TOOL: node_create successfully synced to base graph');
          } catch (syncError: unknown) {
            console.error('💥 TOOL: node_create sync error:', syncError);
            return NextResponse.json({ error: `Warning: Node created but failed to sync to base: ${syncError instanceof Error ? syncError.message : String(syncError)}` }, { status: 500 });
          }
        }

        const result = `Successfully added node "${nodeId}" with title "${title}". The node has ${node.properties.length} properties.${alreadyImplemented ? ' (synced to base graph)' : ''}`;
        console.log('📤 TOOL: node_create returning success:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_create unexpected error:', errorMessage);
        const errorMsg = `Unexpected error while adding node: ${errorMessage}`;
        return NextResponse.json({ error: errorMsg }, { status: 500 });
      }
    }

    if (action === 'node_edit') {
      console.log('✏️ TOOL: node_edit called', params);

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_edit no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_edit schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        const { nodeId, mode = 'replace', title, prompt, properties, children, position, metadata } = params;

        console.log('🔍 TOOL: node_edit looking for node:', nodeId);
        const idx = validatedGraph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) {
          console.error('❌ TOOL: node_edit node not found:', nodeId);
          return NextResponse.json({ error: `Node ${nodeId} not found` }, { status: 404 });
        }
        console.log('✅ TOOL: node_edit found node at index:', idx, 'title:', validatedGraph.nodes[idx].title);

        const existing = validatedGraph.nodes[idx];
        const next = { ...existing } as any;

        // Merge simple fields (only update if provided)
        if (title !== undefined) {
          console.log('📝 TOOL: node_edit updating title:', title);
          next.title = title;
        }
        if (prompt !== undefined) {
          console.log('📝 TOOL: node_edit updating prompt, length:', prompt.length);
          next.prompt = prompt;
        }
        if (children !== undefined) {
          console.log('👶 TOOL: node_edit updating children, count:', children.length);
          next.children = children;
        }
        if (position !== undefined) {
          console.log('📍 TOOL: node_edit updating position:', position);
          next.position = { x: position.x, y: position.y, z: typeof position.z === 'number' ? position.z : 0 };
        }
        if (metadata !== undefined) {
          const normalizedMetadata = normalizeNodeMetadata(metadata);
          console.log('🗂️ TOOL: node_edit updating metadata, files:', normalizedMetadata?.files?.length ?? 'undefined');
          if (normalizedMetadata) {
            next.metadata = normalizedMetadata;
          } else {
            delete next.metadata;
          }
        }

        // Handle properties based on mode
        if (properties !== undefined) {
          if (mode === 'merge') {
            console.log('🔧 TOOL: node_edit merging properties, count:', properties.length);
            // Normalize incoming properties first
            const normalizedProps = normalizeProperties(properties);
            console.log('🔧 TOOL: node_edit normalized properties, count:', normalizedProps.length);

            const existingProps = Array.isArray(existing.properties) ? existing.properties : [];
            console.log('🔧 TOOL: node_edit existing properties count:', existingProps.length);

            const byId = new Map<string, any>(existingProps.map((p: any) => [p.id, p]));

            // Merge new properties with existing ones
            for (const newProp of normalizedProps) {
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
          } else {
            // Replace mode
            console.log('🔧 TOOL: node_edit replacing properties, count:', properties.length);
            next.properties = properties;
          }
        }

        validatedGraph.nodes[idx] = next;
        console.log('💾 TOOL: node_edit saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }
        console.log('✅ TOOL: node_edit graph saved successfully');

        const result = mode === 'merge' ? `Merged changes into node ${nodeId}` : `Replaced node ${nodeId}`;
        console.log('📤 TOOL: node_edit returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });

      } catch (error) {
        console.error('💥 TOOL: node_edit error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    if (action === 'node_delete') {
      console.log('🗑️ TOOL: node_delete called', params);

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: node_delete no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: node_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        const { nodeId, recursive, alreadyImplemented } = params;

        console.log('🔍 TOOL: node_delete checking if node exists:', nodeId);
        const byId = new Map<string, any>(validatedGraph.nodes.map((n: any) => [n.id, n]));
        if (!byId.has(nodeId)) {
          console.error('❌ TOOL: node_delete node not found:', nodeId);
          const errorMsg = `Node with ID '${nodeId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          return NextResponse.json({ error: errorMsg }, { status: 404 });
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
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }
        console.log('✅ TOOL: node_delete graph saved successfully');

        // If alreadyImplemented is true, sync this deletion to base graph immediately
        if (alreadyImplemented) {
          console.log('🔄 TOOL: node_delete syncing to base graph due to alreadyImplemented=true');
          try {
            // Get the IDs of all nodes that were deleted
            const deletedNodeIds = Array.from(toDelete);
            const syncResult = await syncToBaseGraph(deletedNodeIds, []);
            if (!syncResult.success) {
              console.log('⚠️ TOOL: node_delete sync to base failed:', syncResult.error);
              return NextResponse.json({ error: `Warning: Node deleted but failed to sync to base: ${syncResult.error}` }, { status: 500 });
            }
            console.log('✅ TOOL: node_delete successfully synced to base graph');
          } catch (syncError: unknown) {
            console.error('💥 TOOL: node_delete sync error:', syncError);
            return NextResponse.json({ error: `Warning: Node deleted but failed to sync to base: ${syncError instanceof Error ? syncError.message : String(syncError)}` }, { status: 500 });
          }
        }

        const result = `Deleted node ${nodeId}${recursive ? ' (recursive)' : ''}${alreadyImplemented ? ' (synced to base graph)' : ''}`;
        console.log('📤 TOOL: node_delete returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });
      } catch (error) {
        console.error('💥 TOOL: node_delete error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    if (action === 'edge_create') {
      console.log('🔗 TOOL: edge_create called', params);

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: edge_create no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: edge_create schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        const { sourceId, targetId, role, alreadyImplemented } = params;

        // Validate that both nodes exist
        console.log('🔍 TOOL: edge_create validating source node:', sourceId);
        const sourceNode = validatedGraph.nodes.find((n: any) => n.id === sourceId);
        if (!sourceNode) {
          console.error('❌ TOOL: edge_create source node not found:', sourceId);
          const errorMsg = `Source node '${sourceId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          return NextResponse.json({ error: errorMsg }, { status: 404 });
        }
        console.log('✅ TOOL: edge_create found source node:', sourceNode.title);

        console.log('🔍 TOOL: edge_create validating target node:', targetId);
        const targetNode = validatedGraph.nodes.find((n: any) => n.id === targetId);
        if (!targetNode) {
          console.error('❌ TOOL: edge_create target node not found:', targetId);
          const errorMsg = `Target node '${targetId}' not found. Available nodes: ${validatedGraph.nodes.map((n: any) => n.id).join(', ')}`;
          return NextResponse.json({ error: errorMsg }, { status: 404 });
        }
        console.log('✅ TOOL: edge_create found target node:', targetNode.title);

        // Check if edge already exists
        console.log('🔍 TOOL: edge_create checking for existing edge');
        const existingEdge = (validatedGraph.edges || []).find((e: any) => e.source === sourceId && e.target === targetId);
        if (existingEdge) {
          console.error('❌ TOOL: edge_create edge already exists:', `${sourceId}-${targetId}`);
          const errorMsg = `Edge from '${sourceId}' to '${targetId}' already exists. Current role: ${existingEdge.role || 'none'}`;
          return NextResponse.json({ error: errorMsg }, { status: 400 });
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
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }
        console.log('✅ TOOL: edge_create graph saved successfully');

        // If alreadyImplemented is true, sync this edge to base graph immediately
        if (alreadyImplemented) {
          console.log('🔄 TOOL: edge_create syncing to base graph due to alreadyImplemented=true');
          try {
            const edgeId = newEdge.id;
            const syncResult = await syncToBaseGraph([], [edgeId]);
            if (!syncResult.success) {
              console.log('⚠️ TOOL: edge_create sync to base failed:', syncResult.error);
              return NextResponse.json({ error: `Warning: Edge created but failed to sync to base: ${syncResult.error}` }, { status: 500 });
            }
            console.log('✅ TOOL: edge_create successfully synced to base graph');
          } catch (syncError: unknown) {
            console.error('💥 TOOL: edge_create sync error:', syncError);
            return NextResponse.json({ error: `Warning: Edge created but failed to sync to base: ${syncError instanceof Error ? syncError.message : String(syncError)}` }, { status: 500 });
          }
        }

        const result = `Created edge from ${sourceId} to ${targetId}${role ? ` (${role})` : ''}${alreadyImplemented ? ' (synced to base graph)' : ''}`;
        console.log('📤 TOOL: edge_create returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });
      } catch (error) {
        console.error('💥 TOOL: edge_create error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    if (action === 'edge_delete') {
      console.log('🗑️ TOOL: edge_delete called', params);

      try {
        // Use local FS read only
        const localGraph = await readLocalGraph();
        if (!localGraph) {
          console.error('❌ TOOL: edge_delete no local graph found');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        let graph = localGraph.graph;
        const validatedGraph = graph;
        console.log('✅ TOOL: edge_delete schema validation passed, nodes:', validatedGraph.nodes?.length || 0);

        const { sourceId, targetId, alreadyImplemented } = params;

        // Check if edge exists
        console.log('🔍 TOOL: edge_delete checking for existing edge');
        const edgeIndex = (validatedGraph.edges || []).findIndex((e: any) => e.source === sourceId && e.target === targetId);
        if (edgeIndex === -1) {
          console.error('❌ TOOL: edge_delete edge not found:', `${sourceId}-${targetId}`);
          const errorMsg = `Edge from '${sourceId}' to '${targetId}' not found.`;
          return NextResponse.json({ error: errorMsg }, { status: 404 });
        }
        console.log('✅ TOOL: edge_delete found edge at index:', edgeIndex);

        // Remove the edge
        validatedGraph.edges.splice(edgeIndex, 1);
        console.log('✅ TOOL: edge_delete removed edge, total edges:', validatedGraph.edges.length);

        console.log('💾 TOOL: edge_delete saving updated graph');
        const saveResult = await saveGraph(validatedGraph);
        if (!saveResult.success) {
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }
        console.log('✅ TOOL: edge_delete graph saved successfully');

        // If alreadyImplemented is true, sync this deletion to base graph immediately
        if (alreadyImplemented) {
          console.log('🔄 TOOL: edge_delete syncing to base graph due to alreadyImplemented=true');
          try {
            const edgeId = `${sourceId}-${targetId}`;
            const syncResult = await syncToBaseGraph([], [edgeId]);
            if (!syncResult.success) {
              console.log('⚠️ TOOL: edge_delete sync to base failed:', syncResult.error);
              return NextResponse.json({ error: `Warning: Edge deleted but failed to sync to base: ${syncResult.error}` }, { status: 500 });
            }
            console.log('✅ TOOL: edge_delete successfully synced to base graph');
          } catch (syncError: unknown) {
            console.error('💥 TOOL: edge_delete sync error:', syncError);
            return NextResponse.json({ error: `Warning: Edge deleted but failed to sync to base: ${syncError instanceof Error ? syncError.message : String(syncError)}` }, { status: 500 });
          }
        }

        const result = `Deleted edge from ${sourceId} to ${targetId}${alreadyImplemented ? ' (synced to base graph)' : ''}`;
        console.log('📤 TOOL: edge_delete returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });
      } catch (error) {
        console.error('💥 TOOL: edge_delete error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    if (action === 'node_metadata_update') {
      console.log('🗂️ TOOL: node_metadata_update called', params);

      try {
        const graphData = await readLocalGraph();
        if (!graphData) {
          console.error('❌ TOOL: node_metadata_update no graph data available');
          const errorMsg = 'No graph data available. Please ensure the graph file exists.';
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }

        const graph = graphData.graph;
        const { nodeId, files, bugs, merge = false } = params;
        const idx = graph.nodes.findIndex((n: any) => n.id === nodeId);
        if (idx === -1) {
          console.error('❌ TOOL: node_metadata_update node not found', nodeId);
          return NextResponse.json({ error: `Error: Node '${nodeId}' not found.` }, { status: 404 });
        }

        if (!files && !bugs) {
          console.error('❌ TOOL: node_metadata_update missing files and bugs arrays');
          return NextResponse.json({ error: 'Error: Either files array or bugs array is required to update metadata.' }, { status: 400 });
        }

        const nextGraph = cloneGraph(graph);
        const nextNode = { ...nextGraph.nodes[idx] } as any;
        const existingMetadata = (graph.nodes[idx] as any)?.metadata || {};

        // Handle files
        let finalFiles: string[] = [];
        if (files !== undefined) {
          const sanitizedInput = sanitizeMetadataFileEntries(files);
          const existingFiles = Array.isArray(existingMetadata.files)
            ? sanitizeMetadataFileEntries(existingMetadata.files)
            : [];

          finalFiles = merge
            ? sanitizeMetadataFileEntries([...existingFiles, ...sanitizedInput])
            : sanitizedInput;
        } else if (merge) {
          // If merging and no files provided, keep existing files
          finalFiles = Array.isArray(existingMetadata.files)
            ? sanitizeMetadataFileEntries(existingMetadata.files)
            : [];
        }

        // Handle bugs
        let finalBugs: string[] = [];
        if (bugs !== undefined) {
          const existingBugs = Array.isArray(existingMetadata.bugs)
            ? existingMetadata.bugs.filter((b: string) => b && b.trim())
            : [];

          finalBugs = merge
            ? [...existingBugs, ...bugs.filter((b: string) => b && b.trim())]
            : bugs.filter((b: string) => b && b.trim());
        } else if (merge) {
          // If merging and no bugs provided, keep existing bugs
          finalBugs = Array.isArray(existingMetadata.bugs)
            ? existingMetadata.bugs.filter((b: string) => b && b.trim())
            : [];
        }

        // Set metadata only if we have files or bugs
        if (finalFiles.length > 0 || finalBugs.length > 0) {
          nextNode.metadata = {
            ...(finalFiles.length > 0 && { files: finalFiles }),
            ...(finalBugs.length > 0 && { bugs: finalBugs })
          } as NodeMetadata;
        } else {
          delete nextNode.metadata;
        }

        nextGraph.nodes[idx] = nextNode;

        console.log('💾 TOOL: node_metadata_update saving graph with metadata files:', finalFiles.length, 'bugs:', finalBugs.length);
        const saveResult = await saveGraph(nextGraph);
        if (!saveResult.success) {
          return NextResponse.json({ error: saveResult.error }, { status: 500 });
        }

        let summary = `Metadata updated for ${nodeId}.`;
        if (finalFiles.length > 0) {
          summary += ` Files (${finalFiles.length}): ${finalFiles.join(', ')}.`;
        }
        if (finalBugs.length > 0) {
          summary += ` Bugs (${finalBugs.length}): ${finalBugs.join(', ')}.`;
        }
        if (finalFiles.length === 0 && finalBugs.length === 0) {
          summary = `Metadata cleared for ${nodeId}.`;
        }
        console.log('📤 TOOL: node_metadata_update returning success:', summary);
        return NextResponse.json({ content: [{ type: 'text', text: summary }] });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: node_metadata_update error:', errorMessage);
        return NextResponse.json({ error: `Error: Failed to update metadata: ${errorMessage}` }, { status: 500 });
      }
    }

    if (action === 'sync_to_base_graph') {
      console.log('🔄 TOOL: sync_to_base_graph called', params);

      try {
        const { nodeIds, edgeIds } = params;

        const syncResult = await syncToBaseGraph(nodeIds || [], edgeIds || []);
        if (!syncResult.success) {
          return NextResponse.json({ error: syncResult.error }, { status: 500 });
        }

        const result = `Synced ${nodeIds?.length || 0} node(s) and ${edgeIds?.length || 0} edge(s) to base graph`;
        console.log('📤 TOOL: sync_to_base_graph returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });
      } catch (error: unknown) {
        console.error('💥 TOOL: sync_to_base_graph error:', error);
        const errorMsg = `Failed to sync to base graph: ${error instanceof Error ? error.message : String(error)}`;
        return NextResponse.json({ error: errorMsg }, { status: 500 });
      }
    }

    if (action === 'analyze_diff') {
      console.log('🔍 TOOL: analyze_diff called', params);

      try {
        const { nodeId } = params;

        // Read the diff from the graph API
        const currentGraphResult = await readLocalGraph();
        const baseGraphResult = await readBaseGraph();

        if (!currentGraphResult) {
          return NextResponse.json({ error: 'No current graph available' }, { status: 400 });
        }

        if (!baseGraphResult) {
          return NextResponse.json({ error: 'No base graph available' }, { status: 400 });
        }

        const currentGraph = currentGraphResult.graph;
        const baseGraph = baseGraphResult.graph;

        const diff = analyzeGraphDiff(baseGraph, currentGraph);

        // If nodeId is specified, show detailed differences for that specific node
        if (nodeId) {
          console.log('🎯 TOOL: analyze_diff showing detailed differences for node:', nodeId);

          const currentNode = currentGraph.nodes?.find((n: any) => n.id === nodeId);
          const baseNode = baseGraph.nodes?.find((n: any) => n.id === nodeId);

          // Check if node exists in either graph
          if (!currentNode && !baseNode) {
            const result = `Node Analysis: **${nodeId}**\n\n❌ **Node not found** in either current or base graph.\n`;
            console.log('📤 TOOL: analyze_diff node not found in either graph:', nodeId);
            return NextResponse.json({ content: [{ type: 'text', text: result }] });
          }

          // Format detailed node differences
          let result = `Node Analysis: **${nodeId}**\n\n`;

          // Handle different scenarios
          if (!baseNode && currentNode) {
            // Node was added
            result += `📍 **Node Added:**\n`;
            result += `**Title:** ${currentNode.title}\n`;
            result += `**Prompt:** ${currentNode.prompt}\n`;

            if (currentNode.properties && currentNode.properties.length > 0) {
              result += `**Properties:**\n`;
              currentNode.properties.forEach((prop: any) => {
                result += `  - ${prop.id}: ${JSON.stringify(prop.value)} (${prop.type})\n`;
              });
            }
            result += '\n';

          } else if (baseNode && !currentNode) {
            // Node was deleted
            result += `🗑️ **Node Deleted:**\n`;
            result += `**Previous Title:** ${baseNode.title}\n`;
            result += `**Previous Prompt:** ${baseNode.prompt}\n\n`;

          } else if (baseNode && currentNode) {
            // Node exists in both - compare in detail
            const differences = compareNodesDetailed(baseNode, currentNode);

            if (differences.length === 0) {
              result += `🎉 **No differences found!** This node matches perfectly between current and base graphs.\n`;
            } else {
              result += `✏️ **Node Modified:**\n\n`;

              differences.forEach(diff => {
                result += `${diff}\n`;
              });
              result += '\n';
            }
          }

          // Add edge differences for this node
          const nodeEdges = (diff.addedEdges || []).filter((edgeId: string) =>
            edgeId.startsWith(`${nodeId}-`) || edgeId.endsWith(`-${nodeId}`)
          );
          const deletedNodeEdges = (diff.deletedEdges || []).filter((edgeId: string) =>
            edgeId.startsWith(`${nodeId}-`) || edgeId.endsWith(`-${nodeId}`)
          );

          if (nodeEdges.length > 0) {
            result += `🔗 **Added Edges (${nodeEdges.length}):**\n`;
            nodeEdges.forEach((edgeId: string) => {
              result += `- ${edgeId}\n`;
            });
            result += '\n';
          }

          if (deletedNodeEdges.length > 0) {
            result += `🔌 **Deleted Edges (${deletedNodeEdges.length}):**\n`;
            deletedNodeEdges.forEach((edgeId: string) => {
              result += `- ${edgeId}\n`;
            });
            result += '\n';
          }

          result += '💡 **Next Steps:**\n';
          result += '1. Review the changes above for this node\n';
          result += '2. Use node_create, node_edit, or other tools to make necessary changes\n';
          result += '3. Use sync_to_base_graph to save completed changes\n';
          result += '4. Run analyze_diff again to verify all changes are complete\n';

          console.log('📤 TOOL: analyze_diff returning detailed node analysis:', nodeId);
          return NextResponse.json({ content: [{ type: 'text', text: result }] });
        }

        // Original full graph analysis
        // Format the diff information for the agent
        let result = `Graph Analysis Complete:\n${diff.addedNodes.length} nodes added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted, ${diff.addedEdges.length} edges added, ${diff.deletedEdges.length} edges deleted\n\n`;

        if (diff.addedNodes.length > 0) {
          result += `📍 **Added Nodes (${diff.addedNodes.length}):**\n`;
          diff.addedNodes.forEach((nodeId: string) => {
            const node = currentGraph.nodes.find((n: any) => n.id === nodeId);
            if (node) {
              result += `- **${node.title}** (${nodeId}): "${node.prompt}"\n`;
            }
          });
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

        if (diff.addedEdges.length > 0) {
          result += `🔗 **Added Edges (${diff.addedEdges.length}):**\n`;
          diff.addedEdges.forEach((edgeId: string) => {
            result += `- ${edgeId}\n`;
          });
          result += '\n';
        }

        if (diff.deletedEdges.length > 0) {
          result += `🔌 **Deleted Edges (${diff.deletedEdges.length}):**\n`;
          diff.deletedEdges.forEach((edgeId: string) => {
            result += `- ${edgeId}\n`;
          });
          result += '\n';
        }

        const hasDifferences = diff.addedNodes.length > 0 || diff.modifiedNodes.length > 0 || diff.deletedNodes.length > 0 ||
                              diff.addedEdges.length > 0 || diff.deletedEdges.length > 0;

        if (!hasDifferences) {
          result += '🎉 **No differences found!** The current graph matches the base graph perfectly.\n';
        } else {
          result += '💡 **Next Steps:**\n';
          result += '1. Review the changes above\n';
          result += '2. Use node_create, node_edit, or other tools to make necessary changes\n';
          result += '3. Use sync_to_base_graph to save completed changes\n';
          result += '4. Run analyze_diff again to verify all changes are complete\n';
        }

        console.log('📤 TOOL: analyze_diff returning result:', result);
        return NextResponse.json({ content: [{ type: 'text', text: result }] });

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('💥 TOOL: analyze_diff unexpected error:', errorMessage);
        return NextResponse.json({ error: `Error analyzing differences: ${errorMessage}` }, { status: 500 });
      }
    }

    // Default action: get specific node
    if (!params.nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    // Get graph data - always load from file first
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile(user.id);
      graph = getGraphSession();
    }

    if (!graph) {
      return NextResponse.json(
        { error: 'Graph not found' },
        { status: 404 }
      );
    }

    // Find the specific node
    const node = graph!.nodes?.find(n => n.id === params.nodeId);
    if (!node) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      node: node
    });
  } catch (error: unknown) {
    console.error('Error in graph API POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    // Ensure default layer exists before any graph operations
    const { ensureLayersRoot, getLayersInfo, createLayer, setActiveLayer } = await import('@/lib/layers');
    ensureLayersRoot();
    const info = getLayersInfo();
    if (info.layers.length === 0) {
      const name = createLayer('graph1');
      setActiveLayer(name);
    }

    // Get current user session
    const session = await getSessionFromRequest(req);

    const user = session?.user || { id: 'default-user' };
    
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    const url = new URL(req.url);
    const graphType = url.searchParams.get('type'); // 'current', 'base', or undefined for default
    const isAgentInitiated = req.headers.get('x-agent-initiated') === 'true';
    let graph: any;
    if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      const text = await req.text();
      graph = xmlToGraph(text);
    } else {
      const body = await req.json();
      graph = body?.graph;
    }
    if (!graph) return NextResponse.json({ error: 'Graph data is required' }, { status: 400 });

    console.log(`💾 Saving ${graphType || 'current'} graph for user ${user.id}${isAgentInitiated ? ' (agent-initiated)' : ''}...`);

    // Store the graph using the appropriate storage function
    if (graphType === 'base') {
      await storeBaseGraph(graph, user.id);
      console.log(`✅ Base graph saved successfully with ${graph.nodes?.length || 0} nodes`);
    } else {
      // Only broadcast if this is agent-initiated
      if (isAgentInitiated) {
        await storeCurrentGraph(graph, user.id);
        console.log(`✅ Current graph saved successfully with ${graph.nodes?.length || 0} nodes (broadcasted)`);
      } else {
        // For user-initiated changes, save without broadcasting
        const { storeCurrentGraphWithoutBroadcast } = await import('../lib/graph-service');
        await storeCurrentGraphWithoutBroadcast(graph, user.id);
        console.log(`✅ Current graph saved successfully with ${graph.nodes?.length || 0} nodes (no broadcast)`);
      }
    }

    return NextResponse.json({ success: true, message: 'Graph saved successfully' });
  } catch (error) {
    console.error('❌ Graph API PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Ensure default layer exists before any graph operations
    const { ensureLayersRoot, getLayersInfo, createLayer, setActiveLayer } = await import('@/lib/layers');
    ensureLayersRoot();
    const info = getLayersInfo();
    if (info.layers.length === 0) {
      const name = createLayer('graph1');
      setActiveLayer(name);
    }

    // Get current user session
    const session = await getSessionFromRequest(req);

    const user = { id: 'default-user' };
    
    const body = await req.json();
    const { nodeId, propertyId, value } = body;
    
    if (!nodeId || !propertyId) {
      return NextResponse.json(
        { error: 'Node ID and property ID are required' },
        { status: 400 }
      );
    }
    
    // Get current graph
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile(user.id);
      graph = getGraphSession();
    }
    
    if (!graph) {
      return NextResponse.json(
        { error: 'Graph not found' },
        { status: 404 }
      );
    }

    // Find the node and update the property
    const nodeIndex = graph.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    const node = graph.nodes[nodeIndex];
    const propertyIndex = node.properties?.findIndex(p => p.id === propertyId);

    if (propertyIndex === -1 || propertyIndex === undefined || !node.properties) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      );
    }

    // Update the property value directly in the graph
    node.properties[propertyIndex] = { ...node.properties[propertyIndex], value };

    // Save the updated graph without broadcasting (user-initiated change)
    await storeCurrentGraphWithoutBroadcast(graph, user.id);

    console.log(`✅ Property updated successfully`);

    return NextResponse.json({
      success: true,
      message: 'Property updated successfully',
      updatedNode: getGraphSession()?.nodes.find(n => n.id === nodeId) || null
    });
  } catch (error) {
    console.error('❌ Graph API PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Ensure default layer exists before any graph operations
    const { ensureLayersRoot, getLayersInfo, createLayer, setActiveLayer } = await import('@/lib/layers');
    ensureLayersRoot();
    const info = getLayersInfo();
    if (info.layers.length === 0) {
      const name = createLayer('graph1');
      setActiveLayer(name);
    }

    console.log('🗑️ Deleting graph...', req.body);

    // Import the clearGraphSession function
    const { clearGraphSession } = await import('../lib/graph-service');
    
    // Clear the graph from storage and delete the file
    await clearGraphSession();
    
    console.log('✅ Graph deleted successfully');
    
    return NextResponse.json({ 
      success: true,
      message: 'Graph deleted successfully'
    });
  } catch (error) {
    console.error('❌ Graph API DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
