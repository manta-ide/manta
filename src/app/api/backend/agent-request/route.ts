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
      // Use the new single multi-step graph editor agent
      const graphEditorResponse = await fetch(`${req.nextUrl.origin}/api/agents/graph-editor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });

      if (!graphEditorResponse.ok) {
        return NextResponse.json({ error: 'Failed to edit graph' }, { status: 500 });
      }

      const result = await graphEditorResponse.json();
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
