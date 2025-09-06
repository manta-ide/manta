import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
    const session = await auth.api.getSession({ headers: withBearerToCookie(req.headers) });
    if (!LOCAL_MODE && !session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session?.user?.id as string | undefined;
    let jobs = readJobs().filter(j => j.status === 'queued');
    if (userId) jobs = jobs.filter(j => j.user_id === userId);
    jobs.sort((a, b) => (b.priority - a.priority) || ((a.created_at ?? '').localeCompare(b.created_at ?? '')));
    return NextResponse.json({ jobs });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
