import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode, getGraphSession, loadGraphFromFile, storeGraph } from '../../../lib/graphStorage';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; nodeId: string }> }
) {
  try {
    const { sessionId, nodeId } = await params;

    if (!sessionId || !nodeId) {
      return NextResponse.json(
        { error: 'Session ID and Node ID are required' },
        { status: 400 }
      );
    }

    // Try to get node from memory first
    let node = getGraphNode(sessionId, nodeId);
    
    // If not found in memory, try to load from file
    if (!node) {
      await loadGraphFromFile(sessionId);
      node = getGraphNode(sessionId, nodeId);
    }

    if (!node) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ node });
  } catch (error) {
    console.error('Error fetching graph node:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 

// Schema for manual node edits
const EditNodeSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; nodeId: string }> }
) {
  try {
    const { sessionId, nodeId } = await params;
    if (!sessionId || !nodeId) {
      return NextResponse.json(
        { error: 'Session ID and Node ID are required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = EditNodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Ensure graph is loaded
    let graph = getGraphSession(sessionId);
    if (!graph) {
      await loadGraphFromFile(sessionId);
      graph = getGraphSession(sessionId);
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

    await storeGraph(sessionId, newGraph);
    return NextResponse.json({ node: updated });
  } catch (error) {
    console.error('Error updating graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}