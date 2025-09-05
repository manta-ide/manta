import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase
      .from('cli_jobs')
      .select('*')
      .eq('status', 'queued')
      .eq('user_id', session.user.id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
