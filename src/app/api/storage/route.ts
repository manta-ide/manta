import { NextRequest, NextResponse } from 'next/server';
import { storeGraph, getGraphSession } from '../lib/graph-service';
import { xmlToGraph } from '@/lib/graph-xml';
import { z } from 'zod';

// Schema for manual node edits
const EditNodeSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const nodeId = url.searchParams.get('nodeId');
    
    if (nodeId) {
      // Get specific node
      let node = getGraphNode(nodeId);
      
      // If not found in memory, try to load from graph-api
      if (!node) {
        try {
          const graphRes = await fetch(`${req.nextUrl.origin}/api/graph-api`, { headers: { Accept: 'application/xml' } });
          if (graphRes.ok) {
            const xml = await graphRes.text();
            if (xml && xml.includes('<graph')) {
              try { xmlToGraph(xml); /* side-effect: graph loaded via other routes later */ } catch {}
              // after fetching, try again to get node from in-memory session
              node = getGraphNode(nodeId);
            }
          }
        } catch (error) {
          console.log('ℹ️ No graph found when loading node (error: ', error, ')');
        }
      }

      if (!node) {
        return NextResponse.json(
          { error: 'Node not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ node });
    } else {
      // Get graph
      let graph = getGraphSession();
      if (!graph) {
        try {
          const graphRes = await fetch(`${req.nextUrl.origin}/api/graph-api`, { headers: { Accept: 'application/xml' } });
          if (graphRes.ok) {
            const xml = await graphRes.text();
            graph = xmlToGraph(xml) as any;
          }
        } catch (error) {
          console.log('ℹ️ No graph found when loading graph (error: ', error, ')');
        }
      }
      
      if (!graph) {
        return NextResponse.json(
          { error: 'Graph not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ graph });
    }
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { graph } = await req.json();
    
    if (!graph) {
      return NextResponse.json(
        { error: 'Graph is required' },
        { status: 400 }
      );
    }

    // Use default user for persistence
    await storeGraph(graph, 'default-user');
    
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

export async function PUT(req: NextRequest) {
  try {
    // Use default user

    const { nodeId, ...updateData } = await req.json();
    
    if (!nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    const parsed = EditNodeSchema.safeParse(updateData);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Ensure graph is loaded
    let graph = getGraphSession();
    if (!graph) {
      try {
        const graphRes = await fetch(`${req.nextUrl.origin}/api/graph-api`);
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          if (graphData.success && graphData.graph) {
            graph = graphData.graph;
          }
        }
      } catch (error) {
        console.log('ℹ️ No graph found when updating node (error: ', error, ')');
      }
    }
    if (!graph) {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 });
    }

    const idx = graph.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    const original = graph.nodes[idx];
    const updated = { ...original, ...parsed.data };
    const newGraph = { ...graph, nodes: [...graph.nodes] } as typeof graph;
    newGraph.nodes[idx] = updated;

    // Persist using default user context (no auth/session here)
    await storeGraph(newGraph, 'default-user');
    return NextResponse.json({ node: updated });
  } catch (error) {
    console.error('Error updating graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get graph node
function getGraphNode(nodeId: string) {
  const graph = getGraphSession();
  if (!graph) return null;
  return graph.nodes.find(n => n.id === nodeId) || null;
}
