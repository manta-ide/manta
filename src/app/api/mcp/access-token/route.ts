import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    // Generate a simple API key for MCP access
    const token = 'manta-api-key-' + Math.random().toString(36).substring(2, 15);

    return NextResponse.json({
      token,
      type: 'api_key',
      userId: 'default-user',
      note: 'Use as MCP_ACCESS_TOKEN for local MCP server. Treat as secret.',
    });
  } catch (error) {
    console.error('Error issuing MCP access token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
