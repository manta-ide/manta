import { NextRequest } from 'next/server'
import { query, type Options } from '@anthropic-ai/claude-agent-sdk'
import { projectDir } from '@/app/api/lib/claude-code-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ApiCommand = {
  id: string
  label: string
  description: string
}

export async function GET(_req: NextRequest) {
  try {
    const options: Options = {
      includePartialMessages: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      permissionMode: 'bypassPermissions',
      cwd: projectDir(),
      // Rely on SDK to locate executable; execute route sets a path explicitly,
      // but for discovery this default is sufficient in most environments.
    } as any

    const q = query({ prompt: '', options })

    let commands: ApiCommand[] = []
    try {
      const supported = await q.supportedCommands()
      commands = (supported || []).map((c) => ({
        id: c.name,
        label: `/${c.name}`,
        description: c.argumentHint ? `${c.description} — ${c.argumentHint}` : c.description,
      }))
    } catch (err) {
      // Fall back minimally to /rewind if discovery fails
      console.warn('Failed to discover Claude Code commands, using fallback:', err)
      commands = [
        { id: 'rewind', label: '/rewind', description: 'Rewind the last action' },
      ]
    } finally {
      // Best-effort: signal the query to stop if anything spun up
      try { await q.interrupt() } catch {}
    }

    return new Response(JSON.stringify({ commands }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error?.message || 'Failed to load commands'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

