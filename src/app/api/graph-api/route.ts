import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile, storeGraph, updatePropertyAndWriteVars, registerStreamController, unregisterStreamController, storeCurrentGraph, storeBaseGraph, loadCurrentGraphFromFile, loadBaseGraphFromFile } from '../lib/graph-service';
import { graphToXml, xmlToGraph } from '@/lib/graph-xml';
import { analyzeGraphDiff } from '@/lib/graph-diff';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

// Get default user for all requests
async function getSessionFromRequest(req: NextRequest) {
  return { user: { id: 'default-user' } } as any;
}

export async function GET(req: NextRequest) {
  try {
    // Get current user session for all GET requests
    const session = await getSessionFromRequest(req);
    
    const user = session?.user || { id: 'default-user' };
    
    // Check if this is an SSE request
    const url = new URL(req.url);
    const isSSE = url.searchParams.get('sse') === 'true';
    const getUnbuiltNodes = url.searchParams.get('unbuilt') === 'true';
    const fresh = url.searchParams.get('fresh') === 'true'; // Force fresh read from filesystem
    const graphType = url.searchParams.get('type') || url.searchParams.get('graphType'); // 'current', 'base', 'diff', or undefined for default
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
          summary: `${diff.addedNodes.length} nodes added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted`
        });
      }

      // Use graph diff to find differences
      const diff = analyzeGraphDiff(baseGraph, currentGraph);

      console.log(`✅ Diff calculated: ${diff.addedNodes.length} added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted`);

      return NextResponse.json({
        success: true,
        diff,
        summary: `${diff.addedNodes.length} nodes added, ${diff.modifiedNodes.length} modified, ${diff.deletedNodes.length} deleted`
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
          // Use session cache with fallback to filesystem for current graphs
          graph = getGraphSession();
          if (!graph) {
            await loadGraphFromFile(user.id);
            graph = getGraphSession();
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
    // Get current user session
    const session = await getSessionFromRequest(req);
    
    const user = session?.user || { id: 'default-user' };
    
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
