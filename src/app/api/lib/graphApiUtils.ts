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

export async function fetchUnbuiltNodeIdsFromApi(req: NextRequest): Promise<string[]> {
  try {
    const unbuiltRes = await fetch(`${req.nextUrl.origin}/api/backend/graph-api?unbuilt=true`);
    if (unbuiltRes.ok) {
      const unbuiltData = await unbuiltRes.json();
      if (unbuiltData.success && unbuiltData.unbuiltNodeIds) {
        console.log(`✅ Loaded ${unbuiltData.count} unbuilt node IDs from storage API`);
        return unbuiltData.unbuiltNodeIds;
      }
    }
    console.log('ℹ️ No unbuilt nodes found in storage API');
    return [];
  } catch (error) {
    console.log('ℹ️ Error fetching unbuilt node IDs from storage API:', error);
    return [];
  }
}
