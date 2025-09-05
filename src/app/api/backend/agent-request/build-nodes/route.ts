import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';

const RequestSchema = z.object({
  userMessage: MessageSchema,
  nodeId: z.string().optional(),
  rebuildAll: z.boolean().optional().default(false)
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userMessage, nodeId, rebuildAll } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    console.log('🔄 Build nodes request received');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Build nodes request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
