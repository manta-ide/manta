import { NextRequest, NextResponse } from 'next/server';
import { loadVarsSnapshot, publishVarsUpdate } from '../lib/vars-bus';

// GET endpoint to retrieve current variables
export async function GET(request: NextRequest) {
  try {
    const vars = loadVarsSnapshot();
    return NextResponse.json(vars);
  } catch (error) {
    console.error('Error loading vars:', error);
    return NextResponse.json({ error: 'Failed to load variables' }, { status: 500 });
  }
}

// POST endpoint to publish variable updates
export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();
    publishVarsUpdate(updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error publishing vars update:', error);
    return NextResponse.json({ error: 'Failed to publish update' }, { status: 500 });
  }
}
