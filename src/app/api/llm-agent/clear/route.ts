import { NextRequest } from 'next/server';
import { clearConversationSession } from '../../lib/conversationStorage';

export async function POST(req: NextRequest) {
  try {
    const { sessionId = 'default' } = await req.json();
    
    // Clear the conversation session
    clearConversationSession(sessionId);
    
    return new Response(JSON.stringify({ success: true, message: 'Conversation cleared' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    console.error('Error clearing conversation:', err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to clear conversation' }), 
      { status: 500 }
    );
  }
} 