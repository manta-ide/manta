import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';

const RequestSchema = z.object({
  userMessage: MessageSchema,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userMessage } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
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
      // Step 1: Generate edit specification
      const editResponse = await fetch(`${req.nextUrl.origin}/api/agents/edit-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });

      if (!editResponse.ok) {
        return NextResponse.json({ error: 'Failed to generate edit specification' }, { status: 500 });
      }

      const editResult = await editResponse.json();
      const editSpecification = editResult.editSpecification;
      console.log("Sending edit specification to graph-quick-patch", editSpecification)
      // Step 2: Apply the edit specification
      const patchResponse = await fetch(`${req.nextUrl.origin}/api/agents/graph-quick-patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSpecification)
      });

      if (!patchResponse.ok) {
        return NextResponse.json({ error: 'Failed to apply graph patch' }, { status: 500 });
      }

      const result = await patchResponse.json();
      return NextResponse.json(result);
    } else {
      // No graph: generate a new graph
      const genResponse = await fetch(`${req.nextUrl.origin}/api/agents/generate-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      
      if (!genResponse.ok) {
        return NextResponse.json({ error: 'Failed to generate graph' }, { status: 500 });
      }

      const result = await genResponse.json();
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('❌ Agent request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
