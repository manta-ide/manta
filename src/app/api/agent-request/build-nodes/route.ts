import { NextRequest, NextResponse } from 'next/server';
import { MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => { try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; } };
const writeJobs = (jobs: any[]) => { try { fs.mkdirSync(path.dirname(jobsPath()), { recursive: true }); fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {} };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

const RequestSchema = z.object({
  userMessage: MessageSchema,
  nodeId: z.string().optional(),
  rebuildAll: z.boolean().optional().default(false)
});

export async function POST(req: NextRequest) {
  try {
    // Authenticate to associate the job with a user (skip in local mode)
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = (LOCAL_MODE ? 'local' : (session?.user?.id as string));
    if (!LOCAL_MODE && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userMessage, nodeId, rebuildAll } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    console.log('🔄 Build nodes request received');

    if (LOCAL_MODE) {
      const now = new Date().toISOString();
      const job = {
        id: uuid(),
        user_id: userId,
        job_name: 'run',
        status: 'queued',
        priority: rebuildAll ? 10 : 5,
        payload: {
          provider: 'codex',
          prompt,
          interactive: false,
          meta: { kind: 'build-nodes', nodeId: nodeId ?? null, rebuildAll: Boolean(rebuildAll), message: userMessage, requestedAt: now }
        },
        created_at: now,
        updated_at: now,
      };
      const jobs = readJobs();
      jobs.push(job);
      writeJobs(jobs);
      return NextResponse.json({ success: true, jobId: job.id });
    }
    // Supabase path
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error('❌ Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
      return NextResponse.json({ error: 'Server not configured for Supabase' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // Simple: run codex with a single string argument (the prompt).
    // You can override command/prompt via env: CLI_JOB_CMD, CLI_CODEX_PROMPT
    const prompt = process.env.CLI_CODEX_PROMPT || (userMessage?.content || 'explain this codebase to me');
    // Compose provider-driven job payload
    const payload = {
      provider: 'codex',
      prompt,
      interactive: false,
      meta: {
        kind: 'build-nodes',
        nodeId: nodeId ?? null,
        rebuildAll: Boolean(rebuildAll),
        message: userMessage,
        requestedAt: new Date().toISOString(),
      },
    };

    const { data, error } = await supabase
      .from('cli_jobs')
      .insert({
        user_id: userId,
        job_name: 'run',
        payload,
        priority: rebuildAll ? 10 : 5,
      })
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Failed to enqueue job:', error);
      return NextResponse.json({ error: 'Failed to enqueue job' }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId: data?.[0]?.id });
  } catch (error) {
    console.error('❌ Build nodes request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
