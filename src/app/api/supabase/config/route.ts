import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

function withBearerToCookie(headersIn: Headers): Headers {
  const headers = new Headers(headersIn);
  const authz = headers.get('authorization');
  if (authz && authz.toLowerCase().startsWith('bearer ')) {
    const token = authz.slice(7).trim();
    const existingCookie = headers.get('cookie') || '';
    const sessionCookie = `better-auth.session_token=${token}`;
    headers.set('cookie', existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie);
  }
  return headers;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: withBearerToCookie(req.headers) });
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    return NextResponse.json({ url, anonKey });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
