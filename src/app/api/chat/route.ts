import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { Pool } from 'pg';

// Create database connection with same config as Better Auth
const pool = new Pool({
  ssl: true,
  connectionString: process.env.DATABASE_URL,
});

// GET - Load user's chat history
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Load chat history from database
    let chatHistory = [];
    
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT chat_history FROM "user" WHERE id = $1',
          [session.user.id]
        );
        
        if (result.rows && result.rows.length > 0 && result.rows[0].chat_history) {
          // Parse JSON from text column
          chatHistory = JSON.parse(result.rows[0].chat_history);
        }
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error('Database error loading chat history:', dbError);
      // Return empty array if error - graceful fallback
      chatHistory = [];
    }
    
    return NextResponse.json({ 
      success: true, 
      chatHistory 
    });
  } catch (error) {
    console.error('Error loading chat history:', error);
    return NextResponse.json(
      { error: 'Failed to load chat history' },
      { status: 500 }
    );
  }
}

// POST - Save user's chat history
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { chatHistory } = await req.json();

    // Update chat history in database
    try {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE "user" SET chat_history = $1 WHERE id = $2',
          [JSON.stringify(chatHistory), session.user.id]
        );
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error('Database error saving chat history:', dbError);
      return NextResponse.json(
        { error: 'Failed to save chat history' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Chat history saved successfully' 
    });
  } catch (error) {
    console.error('Error saving chat history:', error);
    return NextResponse.json(
      { error: 'Failed to save chat history' },
      { status: 500 }
    );
  }
}

// DELETE - Clear user's chat history
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Clear chat history in database
    try {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE "user" SET chat_history = NULL WHERE id = $1',
          [session.user.id]
        );
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error('Database error clearing chat history:', dbError);
      return NextResponse.json(
        { error: 'Failed to clear chat history' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Chat history cleared successfully' 
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    );
  }
}
