import { NextRequest, NextResponse } from 'next/server';
import { storeGraph, getGraphSession } from '../lib/graphStorage';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (sessionId) {
      // Get specific graph
      const graph = getGraphSession(sessionId);
      if (!graph) {
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ graph });
    } else {
      // Get all graphs - return empty for now since getAllGraphs doesn't exist
      return NextResponse.json({ graphs: [] });
    }
  } catch (error) {
    console.error('Error fetching graph:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, graph } = await req.json();
    
    if (!sessionId || !graph) {
      return NextResponse.json(
        { error: 'Session ID and graph are required' },
        { status: 400 }
      );
    }

    await storeGraph(sessionId, graph);
    
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