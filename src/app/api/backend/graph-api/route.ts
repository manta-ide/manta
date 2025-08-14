import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile } from '../../lib/graphStorage';

export async function GET(req: NextRequest) {
  try {
    // Get graph data
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

    // Return graph with built status for each node
    const graphWithBuiltStatus = {
      ...graph,
      nodes: graph.nodes.map(node => ({
        ...node,
        built: !!node.built
      }))
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
    const { nodeId } = await req.json();
    
    if (!nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    // Get graph data
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
    const node = graph.nodes.find(n => n.id === nodeId);
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
    console.error('Error fetching node data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
