import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';

const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userMessage, selectedNodeId, selectedNodeTitle, selectedNodePrompt } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    // Call the graph editor agent
    const graphEditorResponse = await fetch(`${req.nextUrl.origin}/api/agents/graph-editor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // forward cookies/auth so the inner route can read the session
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      },
      body: JSON.stringify({ 
        userMessage,
        selectedNodeId,
        selectedNodeTitle,
        selectedNodePrompt
      }),
    });

    if (!graphEditorResponse.ok) {
      return NextResponse.json({ error: 'Failed to process graph editor request' }, { status: 500 });
    }

    const graphEditorResult = await graphEditorResponse.json();
    
    return NextResponse.json(graphEditorResult);
  } catch (error) {
    console.error('❌ Edit graph request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
