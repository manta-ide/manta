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
    const KNOWN_CLAUDE_COMMANDS: ApiCommand[] = [
      { id: 'add-dir', label: '/add-dir', description: 'Add additional working directories' },
      { id: 'agents', label: '/agents', description: 'Manage custom AI subagents for specialized tasks' },
      { id: 'bugReport', label: '/bugReport', description: 'Report bugs to Anthropic (shares conversation)' },
      { id: 'clear', label: '/clear', description: 'Clear conversation history' },
      { id: 'compact', label: '/compact', description: 'Compact conversation (optionally: /compact [instructions])' },
      { id: 'config', label: '/config', description: 'Open Settings (Config tab)' },
      { id: 'cost', label: '/cost', description: 'Show token usage statistics' },
      { id: 'doctor', label: '/doctor', description: 'Check health of Claude Code installation' },
      { id: 'help', label: '/help', description: 'Get usage help' },
      { id: 'init', label: '/init', description: 'Initialize project with CLAUDE.md guide' },
      { id: 'login', label: '/login', description: 'Switch Anthropic accounts' },
      { id: 'logout', label: '/logout', description: 'Sign out of your Anthropic account' },
      { id: 'mcp', label: '/mcp', description: 'Manage MCP server connections and OAuth' },
      { id: 'memory', label: '/memory', description: 'Edit CLAUDE.md memory files' },
      { id: 'model', label: '/model', description: 'Select or change the AI model' },
      { id: 'permissions', label: '/permissions', description: 'View or update permissions' },
      { id: 'pr_comments', label: '/pr_comments', description: 'View pull request comments' },
      { id: 'review', label: '/review', description: 'Request code review' },
      { id: 'rewind', label: '/rewind', description: 'Rewind the conversation and/or code' },
      { id: 'status', label: '/status', description: 'Open Status tab (version, model, account, connectivity)' },
      { id: 'terminal-setup', label: '/terminal-setup', description: 'Install Shift+Enter newline keybinding (iTerm2/VSCode)' },
      { id: 'usage', label: '/usage', description: 'Show plan usage limits and rate limits' },
      { id: 'vim', label: '/vim', description: 'Enter vim mode (insert/command)' },
    ]
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
      // Preferred: SDK helper
      const supported = await q.supportedCommands()
      if (supported && supported.length > 0) {
        commands = supported.map((c) => ({
          id: c.name,
          label: `/${c.name}`,
          description: c.argumentHint ? `${c.description} — ${c.argumentHint}` : c.description,
        }))
      }
    } catch (err) {
      // Ignore and try streaming fallback below
      console.warn('supportedCommands() failed, trying streaming fallback:', err)
    }

    // Fallback: parse from system init message (message.slash_commands)
    if (commands.length === 0) {
      try {
        for await (const message of q as any) {
          if ((message as any)?.type === 'system' && (message as any)?.subtype === 'init') {
            const sc: string[] = (message as any)?.slash_commands || []
            if (Array.isArray(sc) && sc.length > 0) {
              commands = sc.map((s) => ({ id: s.replace(/^\//, ''), label: s, description: '' }))
            }
            break
          }
        }
      } catch (err) {
        console.warn('Streaming fallback failed:', err)
      }
    }

    if (commands.length === 0) {
      // Final fallback: known catalog
      commands = KNOWN_CLAUDE_COMMANDS
    }

    try { await (q as any).interrupt?.() } catch {}

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
