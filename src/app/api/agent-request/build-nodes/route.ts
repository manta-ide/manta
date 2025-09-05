import { NextRequest, NextResponse } from 'next/server';
import { MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';

const RequestSchema = z.object({
  userMessage: MessageSchema,
  nodeId: z.string().optional(),
  rebuildAll: z.boolean().optional().default(false)
});

export async function POST(req: NextRequest) {
  try {
    // Authenticate to associate the job with a user
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id as string;

    const body = await req.json();
    const { userMessage, nodeId, rebuildAll } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    console.log('🔄 Build nodes request received');

    // Read Supabase env
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
