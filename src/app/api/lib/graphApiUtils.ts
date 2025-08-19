import { NextRequest } from 'next/server';

export async function fetchGraphFromApi(req: NextRequest): Promise<any> {
  try {
    const graphRes = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
    if (graphRes.ok) {
      const graphData = await graphRes.json();
      if (graphData.success && graphData.graph) {
        console.log(`✅ Loaded graph with ${graphData.graph.nodes?.length || 0} nodes from storage API`);
        return graphData.graph;
      }
    }
    console.log('ℹ️ No graph found in storage API');
    return null;
  } catch (error) {
    console.log('ℹ️ Error fetching graph from storage API:', error);
    return null;
  }
}
