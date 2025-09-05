import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { Pool } from 'pg';
import { clearConversationSession } from '@/app/api/lib/conversationStorage';
import { clearGraphSession } from '@/app/api/lib/graphStorage';
import { SandboxService } from '@/lib/blaxel-sandbox-service';
import { registerBlaxelProvider } from '@/lib/blaxel';

// Ensure Blaxel provider is registered
registerBlaxelProvider();
import { SupabaseGraphService } from '@/app/api/supabase/graph-service';

// Single shared pool, similar to /api/chat
const pool = new Pool({
  ssl: true,
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id as string;

    // 1) Reset chatting session (server-side in-memory)
    try {
      clearConversationSession();
    } catch (e) {
      console.warn('[reset] Failed to clear conversation session:', e);
    }

    // 2) Clear user chat history in DB (so client loads empty after reload)
    try {
      const client = await pool.connect();
      try {
        await client.query('UPDATE "user" SET chat_history = NULL WHERE id = $1', [userId]);
      } finally {
        client.release();
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

    // 4) Clear user graph data explicitly in Supabase to ensure a clean slate
    try {
      await SupabaseGraphService.clearUserGraphData(userId);
    } catch (e) {
      console.warn('[reset] Failed to clear Supabase graph data (continuing):', e);
    }

    // 5) Reset project to base template (files + sync graph to Supabase)
    //    This mirrors the previous behavior but consolidates under a single reset endpoint.
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
