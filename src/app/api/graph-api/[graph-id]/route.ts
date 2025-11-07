import { NextRequest, NextResponse } from 'next/server';
import { xmlToGraph } from '@/lib/graph-xml';
import { GRAPHS_DATA, graphExists } from '@/data/graphs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ 'graph-id': string }> }
) {
  try {
    const resolvedParams = await params;
    const graphId = resolvedParams['graph-id'];

    if (!graphId) {
      return NextResponse.json(
        { error: 'Graph ID is required' },
        { status: 400 }
      );
    }

    // Check if the graph exists in memory
    if (!graphExists(graphId)) {
      return NextResponse.json(
        { error: `Graph "${graphId}" not found` },
        { status: 404 }
      );
    }

    // Read and parse the graph from memory
    const xmlContent = GRAPHS_DATA[graphId].current;
    const graph = xmlToGraph(xmlContent);

    return NextResponse.json({
      success: true,
      graph: graph
    });
  } catch (error) {
    console.error('Error fetching graph:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
