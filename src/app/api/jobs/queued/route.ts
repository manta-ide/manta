import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => {
  try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; }
};

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
    if (LOCAL_MODE) {
      const jobs = readJobs().filter(j => j.status === 'queued');
      return NextResponse.json({ jobs });
    }
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
