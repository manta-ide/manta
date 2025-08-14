import { NextRequest, NextResponse } from 'next/server';
import { storeGraph, getGraphSession, loadGraphFromFile } from '../../lib/graphStorage';
import { z } from 'zod';

// Schema for manual node edits
const EditNodeSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get('nodeId');
    
    if (nodeId) {
      // Get specific node
      let node = getGraphNode(nodeId);
      
      // If not found in memory, try to load from file
      if (!node) {
        await loadGraphFromFile();
        node = getGraphNode(nodeId);
      }

      if (!node) {
        return NextResponse.json(
          { error: 'Node not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ node });
    } else {
      // Get graph
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
      return NextResponse.json({ graph });
    }
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
    const { graph } = await req.json();
    
    if (!graph) {
      return NextResponse.json(
        { error: 'Graph is required' },
        { status: 400 }
      );
    }

    await storeGraph(graph);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Graph stored successfully' 
    });
  } catch (error) {
    console.error('Error storing graph:', error);
    return NextResponse.json(
      { error: 'Failed to store graph' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { nodeId, ...updateData } = await req.json();
    
    if (!nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    const parsed = EditNodeSchema.safeParse(updateData);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Ensure graph is loaded
    let graph = getGraphSession();
    if (!graph) {
      await loadGraphFromFile();
      graph = getGraphSession();
    }
    if (!graph) {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 });
    }

    const idx = graph.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const original = graph.nodes[idx];
    const updated = { ...original, ...parsed.data, built: false };
    const newGraph = { ...graph, nodes: [...graph.nodes] } as typeof graph;
    newGraph.nodes[idx] = updated;

    await storeGraph(newGraph);
    return NextResponse.json({ node: updated });
  } catch (error) {
    console.error('Error updating graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get graph node
function getGraphNode(nodeId: string) {
  const graph = getGraphSession();
  if (!graph) return null;
  return graph.nodes.find(n => n.id === nodeId) || null;
}
