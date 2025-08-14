import { NextRequest, NextResponse } from 'next/server';
import { clearConversationSession } from '../../lib/conversationStorage';

export async function POST(req: NextRequest) {
  try {
    await req.json(); // Ignore any body content
    
    clearConversationSession();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Conversation cleared successfully' 
    });
  } catch (error) {
    console.error('Error clearing conversation:', error);
    return NextResponse.json(
      { error: 'Failed to clear conversation' },
      { status: 500 }
    );
  }
} 