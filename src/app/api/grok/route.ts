import { NextRequest } from 'next/server';
import { grokChat } from '@/lib/grok';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model } = body || {};
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages must be an array' }), { status: 400 });
    }
    const text = await grokChat(messages, model);
    return new Response(JSON.stringify({ text }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

