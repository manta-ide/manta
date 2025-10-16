import { NextRequest } from 'next/server'
import { stopSession } from '@/app/api/claude-code/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(JSON.stringify({ error: 'sessionId required' }), { status: 400 })
    }
    const stopped = stopSession(sessionId)
    return new Response(JSON.stringify({ success: true, stopped }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to stop session' }), { status: 500 })
  }
}

