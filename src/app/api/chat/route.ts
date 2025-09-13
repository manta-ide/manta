import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

// Create database connection (disabled in local mode)
const pool = !LOCAL_MODE
  ? new Pool({ ssl: true, connectionString: process.env.DATABASE_URL })
  : null;

// GET - Load chat history
export async function GET(req: NextRequest) {
  try {

    // Load chat history from database (or stub in local mode)
    let chatHistory: any[] = [];
    
    try {
      if (LOCAL_MODE || !pool) {
        return NextResponse.json({ success: true, chatHistory: [] });
      }
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT chat_history FROM "user" WHERE id = $1',
          ['default-user']
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

// POST - Save chat history
export async function POST(req: NextRequest) {
  try {

    const { chatHistory } = await req.json();

    // Update chat history in database
    try {
      if (LOCAL_MODE || !pool) {
        return NextResponse.json({ success: true, message: 'Chat history saved (local noop)' });
      }
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE "user" SET chat_history = $1 WHERE id = $2',
          [JSON.stringify(chatHistory), 'default-user']
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

// DELETE - Clear chat history
export async function DELETE(req: NextRequest) {
  try {

    // Clear chat history in database
    try {
      if (LOCAL_MODE || !pool) {
        return NextResponse.json({ success: true, message: 'Chat history cleared (local noop)' });
      }
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE "user" SET chat_history = NULL WHERE id = $1',
          ['default-user']
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
