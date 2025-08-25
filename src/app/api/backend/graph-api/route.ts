import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile, storeGraph } from '../../lib/graphStorage';

export async function GET(req: NextRequest) {
  try {
    // Check if this is an SSE request
    const url = new URL(req.url);
    const isSSE = url.searchParams.get('sse') === 'true';
    const getUnbuiltNodes = url.searchParams.get('unbuilt') === 'true';
    
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
                   await loadGraphFromFile();
                   graph = getGraphSession();
                 } catch (loadError) {
                   console.log('ℹ️ No graph file found, skipping SSE update (loadError: ', loadError, ')');
                   return; // Don't send any data if no graph exists
                 }
               }
               
               if (graph && graph.nodes) {
                 const graphWithBuiltStatus = {
                   ...graph,
                   nodes: graph.nodes.map(node => ({
                     ...node,
                     built: !!node.built
                   }))
                 };
                 
                 const data = `data: ${JSON.stringify({
                   type: 'graph-update',
                   graph: graphWithBuiltStatus
                 })}\n\n`;
                 
                 controller.enqueue(new TextEncoder().encode(data));
               }
             } catch (error) {
               console.error('Error sending SSE graph data:', error);
               // Don't throw the error, just log it and continue
             }
           };

          // Send initial data
          sendGraphData();

          // Set up periodic updates (every 2 seconds)
          const interval = setInterval(sendGraphData, 2000);

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
        await loadGraphFromFile();
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
        .filter(node => !node.built || node.built === undefined)
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
      await loadGraphFromFile();
      graph = getGraphSession();
    }
    
    if (!graph) {
      console.log('ℹ️ No graph found in file system');
      return NextResponse.json(
        { error: 'Graph not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Returning graph with ${graph.nodes?.length || 0} nodes`);

    // Return graph with built status for each node
    const graphWithBuiltStatus = {
      ...graph,
      nodes: graph.nodes?.map(node => ({
        ...node,
        built: !!node.built
      })) || []
    };

    return NextResponse.json({ 
      success: true,
      graph: graphWithBuiltStatus
    });
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
    const body = await req.json();
    const { nodeId, action } = body;
    
    // Handle different actions
    if (action === 'refresh') {
      console.log('🔄 Refreshing graph from file...');
      // Force refresh the graph data from file
      await loadGraphFromFile();
      const graph = getGraphSession();
      
      if (!graph) {
        console.log('ℹ️ No graph found after refresh');
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }

      console.log(`✅ Refreshed graph with ${graph.nodes?.length || 0} nodes`);

      const graphWithBuiltStatus = {
        ...graph,
        nodes: graph.nodes?.map(node => ({
          ...node,
          built: !!node.built
        })) || []
      };

      return NextResponse.json({ 
        success: true,
        graph: graphWithBuiltStatus
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
      await loadGraphFromFile();
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
      node: {
        ...node,
        built: !!node.built
      }
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
    const body = await req.json();
    const { graph } = body;
    
    if (!graph) {
      return NextResponse.json(
        { error: 'Graph data is required' },
        { status: 400 }
      );
    }

    console.log('💾 Saving graph...');
    
    // Store the graph using the storage function
    await storeGraph(graph);
    
    console.log(`✅ Graph saved successfully with ${graph.nodes?.length || 0} nodes`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Graph saved successfully',
      graph: graph
    });
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
    const body = await req.json();
    const { nodeId, propertyId, value } = body;
    
    if (!nodeId || !propertyId) {
      return NextResponse.json(
        { error: 'Node ID and property ID are required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Updating property ${propertyId} for node ${nodeId} to:`, value);
    
    // Get current graph
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile();
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

    // Update the property value; changing values does not affect built status
    graph.nodes[nodeIndex] = {
      ...node,
      properties: [
        ...node.properties.slice(0, propertyIndex),
        { ...node.properties[propertyIndex], value },
        ...node.properties.slice(propertyIndex + 1)
      ]
    };

    // Store the updated graph (this will also regenerate vars.json)
    await storeGraph(graph);
    
    console.log(`✅ Property updated successfully`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Property updated successfully',
      updatedNode: graph.nodes[nodeIndex]
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
    const { clearGraphSession } = await import('../../lib/graphStorage');
    
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
