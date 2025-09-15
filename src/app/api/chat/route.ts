import { NextRequest, NextResponse } from 'next/server';

// GET - Load chat history (returns empty array - no DB support)
export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    chatHistory: []
  });
}

// POST - Save chat history (no-op - no DB support)
export async function POST(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Chat history saved (no DB support)'
  });
}

// DELETE - Clear chat history (no-op - no DB support)
export async function DELETE(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Chat history cleared (no DB support)'
  });
}
