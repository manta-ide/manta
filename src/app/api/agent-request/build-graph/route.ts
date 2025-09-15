import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { graphToXml } from '@/lib/graph-xml';
import '@/app/api/lib/prompts/registry';
import { MessageSchema } from '@/app/api/lib/schemas';
import { storeGraph } from '@/app/api/lib/graph-service';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { loadBaseGraphFromFile, storeBaseGraph } from '@/app/api/lib/graph-service';
import { BUILD_GRAPH_TOOLS } from '@/app/api/lib/claude-code-utils';

const RequestSchema = z.object({
  userMessage: MessageSchema,
  graphDiff: z.any().optional(),
  currentGraph: z.any(),
});



export async function POST(req: NextRequest) {
  try {

    // Use default user for all requests
    const userId = 'default-user';
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Graph build request schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage, graphDiff, currentGraph } = parsed.data;

    // Get the base graph for comparison
    const baseGraph = await loadBaseGraphFromFile(userId);

    // forward auth headers for downstream API calls
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    // ensure absolute base url is used
    setGraphEditorBaseUrl(req.nextUrl.origin);

    // Set up save function for the graph editor
    setGraphEditorSaveFn(async (graph) => {
      const res = await fetch(`${req.nextUrl.origin}/api/graph-api`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml',
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

    // Set the current graph for the agent to work with
    await setCurrentGraph(currentGraph);

    // Get the system message template
    const systemMessageTemplate = await getTemplate('build-graph-template');
    const systemMessageVariables = {
      USER_REQUEST: userMessage.content || userMessage.variables?.USER_REQUEST || '',
      PROJECT_FILES: [],
      GRAPH_CONTEXT: JSON.stringify(currentGraph, null, 2),
      MAX_NODES: '50',
    } as Record<string, any>;
    const appendSystemMessage = parseMessageWithTemplate(systemMessageTemplate, systemMessageVariables);

    // Create a prompt that encourages Claude Code to use graph tools
    const userRequest = userMessage.content || userMessage.variables?.USER_REQUEST || '';
    const prompt = `${userRequest}

You have access to graph modification tools:
- graph_read: Read the current graph
- graph_node_add: Add new nodes to the graph
- graph_node_edit: Edit existing nodes
- graph_node_set_state: Change node states

Please use these tools as needed to fulfill the request.`;

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        allowedTools: BUILD_GRAPH_TOOLS,
        appendSystemMessage,
        authHeaders: {
          ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status}`);
    }

    const result = await response.text();

    // Stream the result with graph saving logic
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();

        // Send initial message
        controller.enqueue(enc.encode('Starting graph build...\n'));

        // Send result
        controller.enqueue(enc.encode(result + '\n'));

        // Save base graph only when build completes successfully
        (async () => {
          try {
            await storeBaseGraph(currentGraph, 'default-user');
            console.log('✅ Base graph saved after successful build completion');
            controller.enqueue(enc.encode('Base graph updated with current state\n'));
          } catch (error: any) {
            console.error('❌ Failed to save base graph after build completion:', error);
            controller.enqueue(enc.encode('Warning: Failed to save base graph\n'));
          }

          controller.enqueue(enc.encode('Graph build completed successfully\n'));
          controller.close();
        })();
      }
    });

    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (err: any) {
    console.error('Graph build error:', err);
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
