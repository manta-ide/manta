import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Expose the current Better Auth session token so the user can use it
    // as an API key for local MCP tooling. This token is scoped to the user session.
    const token = (await cookies()).get('better-auth.session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'No session token found' }, { status: 404 });
    }

    return NextResponse.json({
      token,
      type: 'session_token',
      note: 'Use as MCP_ACCESS_TOKEN for local MCP server. Treat as secret.',
    });
  } catch (error) {
    console.error('Error issuing MCP access token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

