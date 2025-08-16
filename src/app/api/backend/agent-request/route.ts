import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema, Graph } from '@/app/api/lib/schemas';
import { z } from 'zod';

async function generatePropertiesForNodes(nodeIds: string[], generatedCode: string) {
  console.log(`🔄 generatePropertiesForNodes called with ${nodeIds.length} nodes and ${generatedCode.length} chars of code`);
  try {
    console.log(`🔄 Generating properties for ${nodeIds.length} nodes`);
    
    // Get current graph
    const graphRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/backend/graph-api`);
    if (!graphRes.ok) {
      console.warn('Failed to get graph for property generation');
      return;
    }
    
    const graphData = await graphRes.json();
    if (!graphData.success || !graphData.graph) {
      console.warn('No graph found for property generation');
      return;
    }
    
    const graph: Graph = graphData.graph;
    
    // Get current code content from the file system
    const codeRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/files?path=base-template/src/app/page.tsx`);
    let currentCode = generatedCode; // fallback to generated code
    if (codeRes.ok) {
      const codeData = await codeRes.json();
      currentCode = codeData.content || generatedCode;
    }
    
    // Generate properties for each node
    for (const nodeId of nodeIds) {
      try {
        console.log(`🔄 Generating properties for node: ${nodeId}`);
        
        const propertyRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/agents/generate-properties`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            graph,
            nodeId,
            generatedCode: currentCode,
            filePath: 'base-template/src/app/page.tsx' // Default file path
          }),
        });
        
        if (propertyRes.ok) {
          const propertyData = await propertyRes.json();
          if (propertyData.success && propertyData.properties && propertyData.properties.length > 0) {
            console.log(`✅ Generated ${propertyData.properties.length} properties for node ${nodeId}`);
            // Update the node with properties
            const node = graph.nodes.find(n => n.id === nodeId);
            if (node) {
              node.properties = propertyData.properties;
            }
          } else {
            console.log(`⚠️ No properties generated for node ${nodeId}`);
          }
        } else {
          console.error(`❌ Property generation failed for node ${nodeId}: ${propertyRes.status} ${propertyRes.statusText}`);
        }
      } catch (error) {
        console.error(`❌ Failed to generate properties for node ${nodeId}:`, error);
        console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      }
    }
    
    // Save the updated graph with properties using graph storage
    try {
      const { storeGraph } = await import('@/app/api/lib/graphStorage');
      await storeGraph(graph);
      console.log('✅ Graph saved with properties');
    } catch (error) {
      console.error('❌ Failed to save graph with properties:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
  } catch (error) {
    console.error('❌ Error generating properties:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
  }
}

const RequestSchema = z.object({
  userMessage: MessageSchema,
  nodeIds: z.array(z.string()).optional(),
  includeDescendants: z.boolean().optional(),
  editHints: z.record(z.object({
    previousPrompt: z.string(),
    newPrompt: z.string(),
  })).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userMessage, nodeIds, includeDescendants, editHints } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    // If specific nodeIds are provided (for node rebuilds), use partial code generation
    if (nodeIds && nodeIds.length > 0) {
      const response = await fetch(`${req.nextUrl.origin}/api/agents/generate-partial-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userMessage, 
          nodeIds, 
          includeDescendants, 
          editHints 
        }),
      });
      
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to generate partial code' }, { status: 500 });
      }

      const result = await response.json();
      return NextResponse.json(result);
    }

    // Check if a graph exists
    const graphExists = async () => {
      try {
        const res = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.success && data.graph;
      } catch {
        return false;
      }
    };

    const hasGraph = await graphExists();

    if (hasGraph) {
      // Load current graph (before edit) to compute diffs later
      const beforeGraph = await (async () => {
        try {
          const res = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.success ? data.graph : null;
        } catch {
          return null;
        }
      })();

      // Edit the existing graph first
      const editRes = await fetch(`${req.nextUrl.origin}/api/agents/edit-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!editRes.ok) {
        console.warn('Graph edit failed, falling back to full graph generation');
        const genRes = await fetch(`${req.nextUrl.origin}/api/agents/generate-graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userMessage }),
        });
        if (!genRes.ok) {
          return NextResponse.json({ error: 'Failed to generate graph' }, { status: 500 });
        }
      }

      // After editing, load updated graph and compute diffs
      const { unbuiltNodeIds, removedNodeIds, parentAnchorIds } = await (async () => {
        try {
          const res = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
          if (!res.ok) return { unbuiltNodeIds: [] as string[], removedNodeIds: [] as string[], parentAnchorIds: [] as string[] };
          const data = await res.json();
          if (!data.success || !data.graph) return { unbuiltNodeIds: [] as string[], removedNodeIds: [] as string[], parentAnchorIds: [] as string[] };

          const afterGraph = data.graph;

          const afterIds = new Set<string>((afterGraph.nodes || []).map((n: any) => n.id));
          const beforeIds = new Set<string>(Array.isArray(beforeGraph?.nodes) ? beforeGraph.nodes.map((n: any) => n.id) : []);
          const removed = Array.from(beforeIds).filter(id => !afterIds.has(id));

          // Build parent map from beforeGraph
          const parentMap = new Map<string, string | null>();
          if (beforeGraph && Array.isArray(beforeGraph.nodes)) {
            const byId = new Map(beforeGraph.nodes.map((n: any) => [n.id, n]));
            for (const node of beforeGraph.nodes) {
              for (const child of node.children || []) {
                parentMap.set(child.id, node.id);
              }
              // root has no parent
              if (!parentMap.has(node.id)) parentMap.set(node.id, null);
            }
          }

          // Choose anchor ids: nearest existing parent in afterGraph, or fall back to afterGraph.rootId
          const anchors = new Set<string>();
          for (const rid of removed) {
            let p = parentMap.get(rid) ?? null;
            while (p && !afterIds.has(p)) {
              p = parentMap.get(p) ?? null;
            }
            if (p && afterIds.has(p)) anchors.add(p);
          }
          if (anchors.size === 0 && afterGraph?.rootId) {
            anchors.add(afterGraph.rootId);
          }

          const unbuilt = (afterGraph.nodes || []).filter((n: any) => !n.built).map((n: any) => n.id);
          return { unbuiltNodeIds: unbuilt as string[], removedNodeIds: removed as string[], parentAnchorIds: Array.from(anchors) };
        } catch {
          return { unbuiltNodeIds: [] as string[], removedNodeIds: [] as string[], parentAnchorIds: [] as string[] };
        }
      })();

      if (unbuiltNodeIds.length > 0) {
        // Partial code generation for specific nodes
        const response = await fetch(`${req.nextUrl.origin}/api/agents/generate-partial-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userMessage, nodeIds: unbuiltNodeIds }),
        });
        
        if (!response.ok) {
          return NextResponse.json({ error: 'Failed to generate partial code' }, { status: 500 });
        }

        const result = await response.json();
        
        // Generate properties for the newly built nodes
        console.log(`🔄 Generating properties for ${unbuiltNodeIds.length} newly built nodes`);
        await generatePropertiesForNodes(unbuiltNodeIds, result.generatedCode || '');
        
        return NextResponse.json(result);
      } else if (removedNodeIds.length > 0) {
        // No unbuilt nodes, but nodes were removed from the graph. Trigger a cleanup pass.
        const response = await fetch(`${req.nextUrl.origin}/api/agents/generate-partial-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userMessage, 
            nodeIds: parentAnchorIds.length > 0 ? parentAnchorIds : [/* fallback will be handled above */],
            includeDescendants: true,
            removedNodeIds
          }),
        });

        if (!response.ok) {
          return NextResponse.json({ error: 'Failed to perform cleanup for removed nodes' }, { status: 500 });
        }

        const result = await response.json();
        return NextResponse.json({ ...result, removedNodeIds });
      } else {
        // Nothing to build or remove
        return NextResponse.json({ message: 'Graph updated. No unbuilt nodes or removals to process.' });
      }
    } else {
      // No graph: generate a full graph
      const genRes = await fetch(`${req.nextUrl.origin}/api/agents/generate-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!genRes.ok) {
        return NextResponse.json({ error: 'Failed to generate graph' }, { status: 500 });
      }

      // Now trigger code generation for the full graph
      const response = await fetch(`${req.nextUrl.origin}/api/agents/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Code generation failed with status ${response.status}: ${errorText}`);
        return NextResponse.json({ 
          error: `Failed to generate code: ${response.status} ${response.statusText}`,
          details: errorText
        }, { status: 500 });
      }

      const result = await response.json();
      
      console.log('📝 Code generation response:', JSON.stringify(result, null, 2));
      
      // Generate properties for all nodes in the new graph
      if (result.success) {
        console.log('🔄 Starting property generation for new graph');
        const graphRes = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          if (graphData.success && graphData.graph) {
            const allNodeIds = graphData.graph.nodes.map((n: any) => n.id);
            console.log(`🔄 Generating properties for ${allNodeIds.length} nodes in new graph`);
            await generatePropertiesForNodes(allNodeIds, result.generatedCode || '');
          } else {
            console.log('⚠️ No graph data found for property generation');
          }
        } else {
          console.log('⚠️ Failed to fetch graph for property generation');
        }
      } else {
        console.log('⚠️ Code generation was not successful, skipping property generation');
      }
      
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('❌ Agent request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
