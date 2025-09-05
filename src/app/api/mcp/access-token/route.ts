import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

// Allow either cookie-based auth or Authorization: Bearer <session_token>
async function getSessionFromRequest(req: NextRequest) {
  const headers = new Headers(req.headers);
  const authz = headers.get('authorization');
  if (authz && authz.toLowerCase().startsWith('bearer ')) {
    const token = authz.slice(7).trim();
    const existingCookie = headers.get('cookie') || '';
    const sessionCookie = `better-auth.session_token=${token}`;
    headers.set('cookie', existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie);
  }
  return auth.api.getSession({ headers });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
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
      userId: session.user.id,
      note: 'Use as MCP_ACCESS_TOKEN for local MCP server. Treat as secret.',
    });
  } catch (error) {
    console.error('Error issuing MCP access token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
