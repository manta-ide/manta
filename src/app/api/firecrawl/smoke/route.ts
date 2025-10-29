import { NextRequest } from 'next/server';
import { spawn } from 'child_process';

export async function GET(_req: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'FIRECRAWL_API_KEY not set' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const output: string[] = [];
    await new Promise<void>((resolve) => {
      const child = spawn('npx', ['-y', 'firecrawl-mcp', '--help'], {
        env: { ...process.env, FIRECRAWL_API_KEY: apiKey },
      });
      child.stdout.on('data', (d) => output.push(String(d)));
      child.stderr.on('data', (d) => output.push(String(d)));
      child.on('close', () => resolve());
      child.on('error', () => resolve());
      setTimeout(() => {
        try { child.kill(); } catch {}
        resolve();
      }, 8000);
    });

    const text = output.join('').slice(0, 2000);
    return new Response(JSON.stringify({ ok: true, help: text }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

