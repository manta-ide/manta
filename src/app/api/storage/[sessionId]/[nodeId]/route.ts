import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode, loadGraphFromFile } from '../../../lib/graphStorage';

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