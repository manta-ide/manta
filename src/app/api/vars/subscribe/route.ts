import { NextRequest } from 'next/server';
import { subscribeVars, loadVarsSnapshot } from '../../lib/vars-bus';

export async function GET(req: NextRequest) {
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const safeEnqueue = (data: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(data)); }
        catch { closed = true; }
      };
      const send = (payload: any) => safeEnqueue(`data: ${JSON.stringify(payload)}\n\n`);

      // Send initial snapshot
      send({ type: 'vars', updates: loadVarsSnapshot() });

      const unsubscribe = subscribeVars((updates) => send({ type: 'vars', updates }));

      const ping = setInterval(() => safeEnqueue(': ping\n\n'), 25000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        try { unsubscribe(); } catch {}
        try { controller.close(); } catch {}
      };
      try { req.signal.addEventListener('abort', onAbort); } catch {}
    },
    cancel() {},
  });
  return new Response(stream, { headers });
}
