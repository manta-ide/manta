import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile, storeGraph, registerStreamController, unregisterStreamController, storeCurrentGraph, loadCurrentGraphFromFile, storeCurrentGraphWithoutBroadcast, storeCurrentGraphFromAgent, clearGraphSession } from '../lib/graph-service';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { GraphSchema } from '../lib/schemas';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const LOCAL_MODE = process.env.NODE_ENV !== 'production';

// Authentication helper that supports both Clerk and API key authentication
async function authenticateUser(req: NextRequest): Promise<{ userId: string } | null> {
  try {
    // Try API key authentication first
    const apiKey = req.headers.get('MANTA_API_KEY');
    if (apiKey && apiKey.startsWith('manta_')) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseServiceKey) {
        return null;
      }

      const client = createClient(supabaseUrl, supabaseServiceKey);
      const { data: apiKeyData, error } = await client
        .from('api_keys')
        .select('user_id')
        .eq('key_hash', keyHash)
        .single();

      if (!error && apiKeyData) {
        return { userId: apiKeyData.user_id };
      }
    }

    // Fallback to Clerk authentication
    const { userId } = await auth();
    if (userId) {
      return { userId };
    }

    return null;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // Authenticate user (supports both Clerk and API key authentication)
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = authResult;

    const user = { id: userId };
    
    // Check if this is an SSE request
    const url = new URL(req.url);
    const isSSE = url.searchParams.get('sse') === 'true';
    const getUnbuiltNodes = url.searchParams.get('unbuilt') === 'true';
    const fresh = url.searchParams.get('fresh') === 'true'; // Force fresh read from filesystem
    const nodeId = url.searchParams.get('nodeId'); // For reading specific nodes
    const layer = url.searchParams.get('layer'); // For filtering by C4 layer
    const projectId = url.searchParams.get('projectId'); // For filtering by project
    const accept = (req.headers.get('accept') || '').toLowerCase();
    const wantsJson = accept.includes('application/json') && !accept.includes('application/xml');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }
    
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
                   graph = await loadCurrentGraphFromFile(user.id, projectId);
                 } catch (loadError) {
                   console.log('ℹ️ No graph file found in dev mode, skipping SSE update (loadError: ', loadError, ')');
                   return; // Don't send any data if no graph exists
                 }
               } else {
                 // In production, use session cache for performance
                 graph = getGraphSession();
                 if (!graph) {
                   try {
                     await loadGraphFromFile(user.id, projectId);
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



    // Regular GET request
    // Always try to load from file first to ensure we have the latest data
    let graph = null;
      if (fresh) {
        // Force fresh read from filesystem, bypass session cache
        graph = await loadCurrentGraphFromFile(user.id, projectId);
      } else {
        // In development mode, always reload from file to pick up directory changes
        // In production, use session cache for performance
        if (LOCAL_MODE) {
          graph = await loadCurrentGraphFromFile(user.id, projectId);
        } else {
          graph = getGraphSession();
          if (!graph) {
            await loadCurrentGraphFromFile(user.id, projectId);
            graph = getGraphSession();
          }
        }
      }

    if (!graph) {
      console.log('ℹ️ No graph found in file system, creating empty graph');
      // Create an empty graph for new projects
      graph = { nodes: [], edges: [] };
      // Save it to file so future requests find it
      await storeCurrentGraph(graph, user.id, projectId);
    }

    // Apply layer filtering if specified
    if (layer) {
      console.log('🔍 Applying layer filter:', layer);
      const validLayers = ['system', 'container', 'component', 'code'];
      if (!validLayers.includes(layer)) {
        return NextResponse.json(
          { error: `Invalid layer: ${layer}. Valid layers are: ${validLayers.join(', ')}` },
          { status: 400 }
        );
      }

      // Filter nodes by layer (node type must match the layer)
      const filteredNodes = graph.nodes?.filter((node: any) => node.type === layer) || [];
      const filteredNodeIds = new Set(filteredNodes.map((node: any) => node.id));

      // Filter edges to only include those connecting filtered nodes
      const filteredEdges = graph.edges?.filter((edge: any) =>
        filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
      ) || [];

      // Create filtered graph
      graph = {
        ...graph,
        nodes: filteredNodes,
        edges: filteredEdges.length > 0 ? filteredEdges : undefined
      };

      console.log(`✅ Layer filter applied: ${filteredNodes.length} nodes, ${filteredEdges.length} edges`);
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
        result += `**Description:** ${node.description}\n\n`;

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





export async function POST(req: NextRequest) {
  try {
    // Authenticate user (supports both Clerk and API key authentication)
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = authResult;

    const user = { id: userId };

    const body = await req.json();
    const { action, ...params } = body;



    // Default action: get specific node
    if (!params.nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    // Get projectId from body
    const projectId = params.projectId;
    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get graph data - always load from file first
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile(user.id, projectId);
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
    // Authenticate user (supports both Clerk and API key authentication)
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = authResult;

    const user = { id: userId };
    
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
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

    console.log(`💾 Saving graph for user ${user.id}${isAgentInitiated ? ' (agent-initiated)' : ''}...`);

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Store the graph
    // Only broadcast if this is agent-initiated
    if (isAgentInitiated) {
      await storeCurrentGraph(graph, user.id, projectId);
      console.log(`✅ Graph saved successfully with ${graph.nodes?.length || 0} nodes (broadcasted)`);
    } else {
      // For user-initiated changes, save without broadcasting
      const { storeCurrentGraphWithoutBroadcast } = await import('../lib/graph-service');
      await storeCurrentGraphWithoutBroadcast(graph, user.id, projectId);
      console.log(`✅ Graph saved successfully with ${graph.nodes?.length || 0} nodes (no broadcast)`);
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
    // Authenticate user (supports both Clerk and API key authentication)
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = authResult;

    const user = { id: userId };
    
    const body = await req.json();
    const { nodeId, propertyId, value, projectId } = body;
    
    if (!nodeId || !propertyId) {
      return NextResponse.json(
        { error: 'Node ID and property ID are required' },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }
    
    // Get current graph
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile(user.id, projectId);
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
    await storeCurrentGraphWithoutBroadcast(graph, user.id, projectId);

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
    // Authenticate user (supports both Clerk and API key authentication)
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId } = authResult;

    console.log('🗑️ Deleting graph for user:', userId);

    // Get projectId from query params
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Clear the graph from storage and delete the file
    await clearGraphSession(userId, projectId);

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
