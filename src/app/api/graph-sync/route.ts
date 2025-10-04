import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentGraphFromFile, loadBaseGraphFromFile, storeBaseGraph } from '../lib/graph-service';

// Force Node.js runtime for file operations
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    console.log('🔄 Syncing graph to base via API...');

    // Read both current and base graphs
    const currentGraph = await loadCurrentGraphFromFile('default-user');
    const baseGraphResult = await loadBaseGraphFromFile('default-user');

    if (!currentGraph) {
      console.error('❌ No current graph available to sync from');
      return NextResponse.json({ error: 'No current graph available to sync from' }, { status: 400 });
    }

    let baseGraph = baseGraphResult;
    if (!baseGraph) {
      console.log('📝 Creating new base graph');
      baseGraph = { nodes: [], edges: [] };
    }

    console.log('📊 Sync stats - current:', currentGraph.nodes?.length || 0, 'nodes,', currentGraph.edges?.length || 0, 'edges');
    console.log('📊 Sync stats - base:', baseGraph.nodes?.length || 0, 'nodes,', baseGraph.edges?.length || 0, 'edges');

    let syncedNodes = 0;
    let syncedEdges = 0;

    // Sync all nodes
    if (currentGraph.nodes && currentGraph.nodes.length > 0) {
      for (const currentNode of currentGraph.nodes) {
        const baseNodeIdx = baseGraph.nodes?.findIndex((n: any) => n.id === currentNode.id) ?? -1;

        if (baseNodeIdx >= 0) {
          // Update existing node in base graph
          console.log('🔄 Updating node:', currentNode.id);
          baseGraph.nodes![baseNodeIdx] = { ...currentNode };
        } else {
          // Add new node to base graph
          console.log('➕ Adding node:', currentNode.id);
          baseGraph.nodes = baseGraph.nodes || [];
          baseGraph.nodes.push({ ...currentNode });
        }
        syncedNodes++;
      }
    }

    // Sync all edges
    if (currentGraph.edges && currentGraph.edges.length > 0) {
      for (const currentEdge of currentGraph.edges) {
        const baseEdgeIdx = baseGraph.edges?.findIndex((e: any) => e.id === currentEdge.id) ?? -1;

        if (baseEdgeIdx >= 0) {
          // Update existing edge in base graph
          console.log('🔄 Updating edge:', currentEdge.id);
          baseGraph.edges![baseEdgeIdx] = { ...currentEdge };
        } else {
          // Add new edge to base graph
          console.log('➕ Adding edge:', currentEdge.id);
          baseGraph.edges = baseGraph.edges || [];
          baseGraph.edges.push({ ...currentEdge });
        }
        syncedEdges++;
      }
    }

    // Save the synced base graph
    console.log('💾 Saving synced base graph with', baseGraph.nodes?.length || 0, 'nodes,', baseGraph.edges?.length || 0, 'edges');
    await storeBaseGraph(baseGraph, 'default-user');
    console.log('✅ Base graph synced successfully');

    return NextResponse.json({
      success: true,
      syncedNodes,
      syncedEdges,
      baseGraph: {
        nodesCount: baseGraph.nodes?.length || 0,
        edgesCount: baseGraph.edges?.length || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Error syncing graph:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync graph' },
      { status: 500 }
    );
  }
}
