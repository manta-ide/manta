import { NextRequest, NextResponse } from 'next/server';
import { initializeGraphsFromFiles } from '../../lib/graph-service';

export async function POST(_request: NextRequest) {
  try {
    console.log('🔄 Initializing graphs from filesystem...', _request.body);
    // Source of truth is filesystem; load graphs from disk into memory
    await initializeGraphsFromFiles();
    return NextResponse.json({ success: true, message: 'Graphs initialized from filesystem' });
  } catch (error) {
    console.error('Error initializing graphs from filesystem:', error);
    return NextResponse.json(
      { error: 'Failed to initialize graphs from filesystem' },
      { status: 500 }
    );
  }
}
