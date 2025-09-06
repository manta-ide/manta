import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => { try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; } };
const writeJobs = (jobs: any[]) => { try { fs.mkdirSync(path.dirname(jobsPath()), { recursive: true }); fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {} };

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

export async function POST(req: NextRequest) {
  try {
    if (LOCAL_MODE) {
      const { id, status, errorMessage } = await req.json();
      if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });
      const jobs = readJobs();
      const idx = jobs.findIndex(j => j.id === id);
      if (idx === -1) return NextResponse.json({ ok: false }, { status: 404 });
      const now = new Date().toISOString();
      jobs[idx] = { ...jobs[idx], status, finished_at: now, updated_at: now, error_message: errorMessage ?? null };
      writeJobs(jobs);
      return NextResponse.json({ ok: true });
    }
    const session = await auth.api.getSession({ headers: withBearerToCookie(req.headers) });
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, status, errorMessage } = await req.json();
    if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase
      .from('cli_jobs')
      .update({ status, finished_at: new Date().toISOString(), error_message: errorMessage ?? null })
      .eq('id', id)
      .eq('user_id', session.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
