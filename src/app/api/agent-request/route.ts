import { NextRequest } from 'next/server';
import { z } from 'zod';
import { graphToXml } from '@/lib/graph-xml';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { loadBaseGraphFromFile, storeBaseGraph } from '@/app/api/lib/graph-service';
import { formatTraceMessage } from '@/lib/chatService';

const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
  // Build-nodes compatibility fields
  nodeId: z.string().optional(),
  selectedNodeIds: z.array(z.string()).optional(),
  rebuildAll: z.boolean().optional().default(false),
  // Build-graph specific fields
  graphDiff: z.any().optional(),
  currentGraph: z.any().optional(),
});

// Removed buildParsedMessages - now using system prompt approach in Claude Code

// Removed createSystemMessage - now using system prompt in Claude Code


export async function POST(req: NextRequest) {
  try {
    // Use default user for all reqs
    const userId = 'default-user';
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Agent req schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      userMessage,
      selectedNodeId,
      selectedNodeTitle,
      selectedNodePrompt,
      nodeId,
      selectedNodeIds,
      rebuildAll,
      graphDiff,
      currentGraph
    } = parsed.data;
    // forward auth headers for downstream API calls
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    // ensure absolute base url is used
    setGraphEditorBaseUrl(req.nextUrl.origin);
    // As a fallback for environments where headers may be dropped, use a direct save function
    setGraphEditorSaveFn(async (graph) => {
      const res = await fetch(`${req.nextUrl.origin}/api/graph-api?graphType=current`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml',
          'X-Agent-Initiated': 'true', // Mark this as req-initiated to trigger SSE broadcasts
          ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
        },
        body: graphToXml(graph)
      });
      if (!res.ok) return false;
      let ok = true;
      try { const data = await res.json(); ok = !!data.success; } catch { ok = true; }
      return ok;
    });

    // Build prompt with context - subreqs will be chosen automatically based on content
    let prompt = userMessage.content;

    // Add selected node info if available
    if (selectedNodeId) {
      prompt += `\n\nSelected Node: ${selectedNodeTitle} (ID: ${selectedNodeId})`;
      if (selectedNodePrompt) {
        prompt += `\nPrompt: ${selectedNodePrompt}`;
      }
    }

    console.log(`🔧 Generated prompt length:`, prompt.length);

    // Call Claude Code API endpoint with the prompt - subreqs chosen automatically
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status} ${response.body?.toString()}`);
    }

    // If the response is already streaming, pass it through
    if (response.headers.get('content-type')?.includes('text/plain')) {
      console.log(`🔄 ${req}: Processing streaming response from Claude Code`);

      // Create a new stream that processes the Server-Sent Events from Claude Code
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();

          try {
            if (!reader) {
              console.log(`❌ ${req}: No reader available`);
              controller.close();
              return;
            }

            let buffer = '';
            let hasStarted = false;
            let totalContent = '';

            console.log(`🎬 ${req}: Starting stream processing`);

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                console.log(`🏁 ${req}: Reader done, total content length:`, totalContent.length);
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');

              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6); // Remove 'data: ' prefix
                  console.log(`📦 ${req}: Received data:`, data);

                  if (data === '[STREAM_START]') {
                    if (!hasStarted) {
                      hasStarted = true;
                      console.log(`🎯 ${req}: Stream started`);
                    }
                  } else if (data === '[STREAM_END]') {
                    console.log(`🏁 ${req}: Stream ended, total content:`, totalContent);
                    controller.close();
                    return;
                  } else {
                    try {
                      const parsed = JSON.parse(data);
                      console.log(`📝 ${req}: Parsed content:`, parsed);

                      if (parsed.type === 'result' && parsed.content) {
                        // Stream the final result
                        totalContent += parsed.content;
                        console.log(`📤 ${req}: Sending final result:`, parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.type === 'trace') {
                        // Stream trace information
                        const traceContent = formatTraceMessage(parsed.trace);
                        totalContent += traceContent;
                        console.log(`📤 ${req}: Sending trace:`, traceContent.trim());
                        controller.enqueue(enc.encode(traceContent));
                      } else if (parsed.content) {
                        // Stream regular content (backward compatibility)
                        totalContent += parsed.content;
                        console.log(`📤 ${req}: Sending content:`, parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.error) {
                        console.log(`❌ ${req}: Error in content:`, parsed.error);
                        controller.enqueue(enc.encode(`\n\nError: ${parsed.error}\n`));
                      }
                    } catch (e) {
                      // If it's not JSON, treat as plain text
                      console.log(`📝 ${req}: Plain text content:`, data);
                      totalContent += data;
                      controller.enqueue(enc.encode(data + '\n'));
                    }
                  }
                }
              }
            }

            // Subreqs handle their own completion logic
            console.log('🏁 Agent req completed');

            // Close if we finish without [STREAM_END]
            console.log(`🏁 ${req}: Stream completed without [STREAM_END]`);
            controller.close();
          } catch (error) {
            console.error(`❌ ${req}: Streaming error:`, error);
            controller.enqueue(enc.encode(`\n\nError: ${error instanceof Error ? error.message : String(error)}\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // Fallback for non-streaming responses
      const result = await response.text();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          // Append a newline to ensure downstream line-based parsers process the final chunk
          controller.enqueue(enc.encode(result + "\n"));
          controller.close();
        }
      });

      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  } catch (err: any) {
    console.error(err);
    // Reset pending changes on error
    resetPendingChanges();
    return new Response(JSON.stringify({
      error: err?.message || 'Server error',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
