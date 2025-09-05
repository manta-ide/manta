import { NextRequest, NextResponse } from 'next/server';
import { loadGraphFromFile, getGraphSession, getUnbuiltNodeIds, getGraphNode } from '@/app/api/lib/graph-service';

// Public graph read endpoint
// - GET /api/public/graph?userId=...                     -> { success, graph }
// - GET /api/public/graph?userId=...&unbuilt=true        -> { success, unbuiltNodeIds, count }
// - GET /api/public/graph?userId=...&nodeId=...          -> { success, node }
// Notes:
// - This route is intentionally unauthenticated for MCP/local tooling.
// - It requires a userId query param to scope the graph load.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const unbuilt = searchParams.get('unbuilt') === 'true';
    const nodeId = searchParams.get('nodeId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Always ensure the latest graph is loaded for this user
    await loadGraphFromFile(userId);
    const graph = getGraphSession();

    if (!graph) {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 });
    }

    if (unbuilt) {
      const ids = getUnbuiltNodeIds();
      return NextResponse.json({ success: true, unbuiltNodeIds: ids, count: ids.length });
    }

    if (nodeId) {
      const node = getGraphNode(nodeId);
      if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      return NextResponse.json({ success: true, node });
    }

    return NextResponse.json({ success: true, graph });
  } catch (error) {
    console.error('Public graph API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
