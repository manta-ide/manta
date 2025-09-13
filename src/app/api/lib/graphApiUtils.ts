import { NextRequest } from 'next/server';

import { xmlToGraph } from '@/lib/graph-xml';

export async function fetchGraphFromApi(req: NextRequest): Promise<any> {
  try {
    const graphRes = await fetch(`${req.nextUrl.origin}/api/graph-api`, {
      headers: {
        Accept: 'application/xml',
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      },
    });
    if (graphRes.ok) {
      const xml = await graphRes.text();
      const graph = xmlToGraph(xml);
      if (graph?.nodes) {
        console.log(`✅ Loaded graph with ${graph.nodes?.length || 0} nodes from storage API`);
        return graph;
      }
    }
    console.log('ℹ️ No graph found in storage API');
    return null;
  } catch (error) {
    console.log('ℹ️ Error fetching graph from storage API:', error);
    return null;
  }
}

export async function fetchGraphXmlFromApi(req: NextRequest): Promise<string | null> {
  try {
    const res = await fetch(`${req.nextUrl.origin}/api/graph-api`, {
      headers: {
        Accept: 'application/xml',
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchUnbuiltNodeIdsFromApi(req: NextRequest): Promise<string[]> {
  try {
    const unbuiltRes = await fetch(`${req.nextUrl.origin}/api/graph-api?unbuilt=true`, {
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      },
    });
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
