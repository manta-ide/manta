import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile, storeGraph, updatePropertyAndWriteVars } from '../lib/graph-service';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { auth } from '@/lib/auth';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

// Map Authorization: Bearer <session_token> to Better Auth cookie for compatibility with MCP
async function getSessionFromRequest(req: NextRequest) {
  const headers = new Headers(req.headers);
  const authz = headers.get('authorization');
  if (authz && authz.toLowerCase().startsWith('bearer ')) {
    const token = authz.slice(7).trim();
    const existingCookie = headers.get('cookie') || '';
    const sessionCookie = `better-auth.session_token=${token}`;
    headers.set('cookie', existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie);
  }
  if (LOCAL_MODE) {
    return { user: { id: 'local' } } as any;
  }
  return auth.api.getSession({ headers });
}

export async function GET(req: NextRequest) {
  try {
    // Get current user session for all GET requests
    const session = await getSessionFromRequest(req);
    
    if (!LOCAL_MODE && (!session || !session.user)) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }
    const user = session?.user || { id: 'local' };
    
    // Check if this is an SSE request
    const url = new URL(req.url);
    const isSSE = url.searchParams.get('sse') === 'true';
    const getUnbuiltNodes = url.searchParams.get('unbuilt') === 'true';
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
                     // Send initial graph data
           const sendGraphData = async () => {
             try {
               let graph = getGraphSession();
               if (!graph) {
                 try {
                   await loadGraphFromFile(user.id);
                   graph = getGraphSession();
                 } catch (loadError) {
                   console.log('ℹ️ No graph file found, skipping SSE update (loadError: ', loadError, ')');
                   return; // Don't send any data if no graph exists
                 }
               }
               
               if (graph && graph.nodes) {
                 const xml = graphToXml(graph);
                 const payload = `data: ${xml}\n\n`;
                 controller.enqueue(new TextEncoder().encode(payload));
               }
             } catch (error) {
               console.error('Error sending SSE graph data:', error);
               // Don't throw the error, just log it and continue
             }
           };

          // Send initial data
          sendGraphData();

          // Set up periodic updates (every 500ms for more responsive updates)
          const interval = setInterval(sendGraphData, 500);

          // Clean up on close
          req.signal.addEventListener('abort', () => {
            clearInterval(interval);
            controller.close();
          });
        }
      });

      return new Response(stream, { headers });
    }

    // Check if requesting unbuilt nodes only
    if (getUnbuiltNodes) {
      // Always try to load from file first to ensure we have the latest data
      let graph = getGraphSession();
      if (!graph) {
        await loadGraphFromFile(user.id);
        graph = getGraphSession();
      }
      
      if (!graph) {
        console.log('ℹ️ No graph found in file system');
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }

      // Get unbuilt node IDs
      const unbuiltNodeIds = graph.nodes
        .filter(node => node.state !== 'built')
        .map(node => node.id);

      console.log(`✅ Returning ${unbuiltNodeIds.length} unbuilt node IDs`);

      return NextResponse.json({ 
        success: true,
        unbuiltNodeIds: unbuiltNodeIds,
        count: unbuiltNodeIds.length
      });
    }

    // Regular GET request
    // Always try to load from file first to ensure we have the latest data
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile(user.id);
      graph = getGraphSession();
    }
    
    if (!graph) {
      console.log('ℹ️ No graph found in file system');
      return NextResponse.json(
        { error: 'Graph not found' },
        { status: 404 }
      );
    }
    console.log('graph', graph);
    console.log(`✅ Returning graph with ${graph.nodes?.length || 0} nodes`);

    if (!wantsJson) {
      const xml = graphToXml(graph);
      console.log(' >>>>>>>>>>>>>>>>>>xml', xml);
      return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
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
    // Get current user session
    const session = await getSessionFromRequest(req);
    
    if (!LOCAL_MODE && (!session || !session.user)) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }
    const user = session?.user || { id: 'local' };
    
    const body = await req.json();
    const { nodeId, action } = body;
    
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
    
    // Default action: get specific node
    if (!nodeId) {
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
    const node = graph.nodes?.find(n => n.id === nodeId);
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
  } catch (error) {
    console.error('Error in graph API POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    // Get current user session
    const session = await getSessionFromRequest(req);
    
    if (!LOCAL_MODE && (!session || !session.user)) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }
    const user = session?.user || { id: 'local' };
    
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let graph: any;
    if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      const text = await req.text();
      graph = xmlToGraph(text);
    } else {
      const body = await req.json();
      graph = body?.graph;
    }
    if (!graph) return NextResponse.json({ error: 'Graph data is required' }, { status: 400 });

    console.log(`💾 Saving graph for user ${user.id}...`);
    
    // Store the graph using the storage function
    await storeGraph(graph, user.id);
    
    console.log(`✅ Graph saved successfully with ${graph.nodes?.length || 0} nodes`);
    
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
    // Get current user session
    const session = await getSessionFromRequest(req);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }

    const { user } = session;
    
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

    await updatePropertyAndWriteVars(nodeId, propertyId, value, user.id);
    
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
