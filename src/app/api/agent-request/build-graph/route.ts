import { NextRequest } from 'next/server';
import { z } from 'zod';
import { graphToXml } from '@/lib/graph-xml';
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

    // Build system message simply
    const maxNodes = 50;
    const appendSystemMessage = `You are a graph builder agent.

Goal: Create or modify graph nodes based on the user request.

Rules:
- Read the graph to check existence; never duplicate nodes.
- Change only what the user asks; keep other parts unchanged.
- Do not edit any source code while creating or updating the graph; code changes are handled by a separate build agent.
- Use simple IDs (e.g., "header", "hero", "footer").
- Property IDs must be globally unique and prefixed per node.
- For nested object fields, use dot notation: e.g., "root-styles.background-color".
- Size properties use select options from a fixed scale.
- When structure or prompts change, set node state to "unbuilt" (never set to "built").
- For any images set them as text (image URL) and link to placeholder images.
- If you start from template (simple app node) - then you can delete it if the request requires something different.
- Make sure to properly structure the nodes, so the sections of a website or components should be different nodes.
- Do not create components that are not in the schema.
- For any lists use object-list.
- Limit to ${maxNodes} nodes maximum.

Available Tools:
- graph_read(nodeId?)
- graph_node_add(parentId?, nodeId, title, prompt, properties?, children?)
- graph_node_edit(nodeId, mode?, title?, prompt?, properties?, children?, state?)
- graph_node_delete(nodeId, recursive?)
- graph_edge_create(sourceId, targetId, role?)

Output: Short, single-sentence status updates during work. End with one concise summary sentence.

This is a Vite project using TypeScript and Tailwind CSS. Complete the entire structure in one operation.`;

    // Build user prompt simply
    const userRequest = userMessage.content || userMessage.variables?.USER_REQUEST || '';
    const prompt = `${userRequest}

You have access to graph modification tools:
- graph_read: Read the current graph
- graph_node_add: Add new nodes to the graph
- graph_node_edit: Edit existing nodes
- graph_node_set_state: Change node states

Please use these tools as needed to fulfill the request.`;

    // Use system message directly (already has variables interpolated)
    const finalSystemMessage = appendSystemMessage;

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        allowedTools: BUILD_GRAPH_TOOLS,
        appendSystemMessage: finalSystemMessage,
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
