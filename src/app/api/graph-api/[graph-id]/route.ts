import { NextRequest, NextResponse } from 'next/server';
import { xmlToGraph } from '@/lib/graph-xml';
import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';

export async function GET(
  req: NextRequest,
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

    // Get the graph directory path
    const devProjectDir = getDevProjectDir();
    const graphDir = path.join(devProjectDir, 'manta', 'graphs', graphId);
    const currentGraphPath = path.join(graphDir, 'current-graph.xml');

    // Check if the graph exists
    if (!fs.existsSync(currentGraphPath)) {
      return NextResponse.json(
        { error: `Graph "${graphId}" not found` },
        { status: 404 }
      );
    }

    // Read and parse the graph
    const xmlContent = fs.readFileSync(currentGraphPath, 'utf8');
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
