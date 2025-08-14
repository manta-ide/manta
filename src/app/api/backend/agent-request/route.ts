import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';

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
      const response = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/generate-partial-code`, {
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
      // Edit the existing graph first
      const editRes = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/edit-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!editRes.ok) {
        console.warn('Graph edit failed, falling back to full graph generation');
        const genRes = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/generate-graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userMessage }),
        });
        if (!genRes.ok) {
          return NextResponse.json({ error: 'Failed to generate graph' }, { status: 500 });
        }
      }

      // After editing, generate code for only the unbuilt nodes
      const unbuiltNodeIds = await (async () => {
        try {
          const res = await fetch(`${req.nextUrl.origin}/api/backend/graph-api`);
          if (!res.ok) return [] as string[];
          const data = await res.json();
          if (!data.success || !data.graph) return [] as string[];
          const nodeIds = (data.graph.nodes || []).filter((n: any) => !n.built).map((n: any) => n.id);
          return nodeIds as string[];
        } catch { 
          return [] as string[]; 
        }
      })();

      if (unbuiltNodeIds.length > 0) {
        // Partial code generation for specific nodes
        const response = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/generate-partial-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userMessage, nodeIds: unbuiltNodeIds }),
        });
        
        if (!response.ok) {
          return NextResponse.json({ error: 'Failed to generate partial code' }, { status: 500 });
        }

        const result = await response.json();
        return NextResponse.json(result);
      } else {
        // Nothing to build
        return NextResponse.json({ message: 'No unbuilt nodes to generate code for' });
      }
    } else {
      // No graph: generate a full graph
      const genRes = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/generate-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!genRes.ok) {
        return NextResponse.json({ error: 'Failed to generate graph' }, { status: 500 });
      }

      // Now trigger code generation for the full graph
      const response = await fetch(`${req.nextUrl.origin}/api/agent-orchestrator/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
      }

      const result = await response.json();
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Agent request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
