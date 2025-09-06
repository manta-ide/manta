import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { Pool } from 'pg';
import { clearGraphSession } from '@/app/api/lib/graph-service';
import '@/lib/sandbox-provider';
import { SandboxService } from '@/lib/sandbox-service';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
// Single shared pool, similar to /api/chat (disabled in local mode)
const pool = !LOCAL_MODE ? new Pool({ ssl: true, connectionString: process.env.DATABASE_URL }) : null;

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() } as any);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id as string;

    // 1) Reset chatting session (server-side in-memory)
    try {
      const response = await fetch('/api/chat', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        console.warn('[reset] Failed to clear conversation session:', response.status, response.statusText);
      }
    } catch (e) {
      console.warn('[reset] Failed to clear conversation session:', e);
    }

    // 2) Clear user chat history in DB (so client loads empty after reload)
    try {
      if (LOCAL_MODE || !pool) {
        // No-op in local mode
      } else {
        const client = await pool.connect();
      try {
          await client.query('UPDATE "user" SET chat_history = NULL WHERE id = $1', [userId]);
        } finally {
          client.release();
        }
      }
    } catch (e) {
      console.warn('[reset] Failed to clear chat_history in DB:', e);
    }

    // 3) Clear any in-memory graph to avoid stale context leaking into agents
    try {
      await clearGraphSession();
    } catch (e) {
      console.warn('[reset] Failed to clear in-memory graph session:', e);
    }

    // 4) Reset project to base template (files)
    try {
      await SandboxService.setupBaseTemplate(userId);
    } catch (e) {
      console.error('[reset] Base template setup failed:', e);
      return NextResponse.json({ error: 'Failed to setup base template' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[reset] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to reset project' }, { status: 500 });
  }
}
