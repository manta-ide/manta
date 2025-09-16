import { NextRequest } from 'next/server';
import { z } from 'zod';
import { graphToXml } from '@/lib/graph-xml';
import { Message, MessageSchema, ClaudeCodeOptions, McpServerConfig } from '@/app/api/lib/schemas';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { EDIT_GRAPH_TOOLS, getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';
import { formatTraceMessage } from '@/lib/chatService';

// No longer using template-based approach - using system prompt in Claude Code

const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
  // Build-nodes compatibility fields
  nodeId: z.string().optional(),
  selectedNodeIds: z.array(z.string()).optional(),
  rebuildAll: z.boolean().optional().default(false),
});

// Removed buildParsedMessages - now using system prompt approach in Claude Code

// Removed createSystemMessage - now using system prompt in Claude Code


export async function POST(req: NextRequest) {
  try {
    // Use default user for all requests
    const userId = 'default-user';
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Graph editor request schema error:', parsed.error.flatten());
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
      rebuildAll
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
    let graph = await fetchGraphFromApi(req);

    // If no graph exists, create a completely empty one
    if (!graph) {
      const emptyGraph = {
        nodes: []
      };

      await storeGraph(emptyGraph, userId);

      graph = emptyGraph;
    }

    // Always set the current graph (either existing or newly created)
    await setCurrentGraph(graph);

    // Determine target node IDs for build operations
    let targetNodeIds: string[] = [];
    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0) {
      targetNodeIds = selectedNodeIds;
    } else if (nodeId) {
      targetNodeIds = [nodeId];
    } else if (rebuildAll && graph?.nodes?.length) {
      targetNodeIds = graph.nodes.map((n: any) => n.id);
    }

    const variables = {
      GRAPH_DATA: JSON.stringify(graph, null, 2),
      SELECTED_NODE_ID: selectedNodeId,
      SELECTED_NODE_TITLE: selectedNodeTitle,
      SELECTED_NODE_PROMPT: selectedNodePrompt,
      SELECTED_NODE_IDS: JSON.stringify(targetNodeIds),
      REBUILD_ALL: rebuildAll ? '1' : '',
    };

    // Build system message for graph editor
    const customSystemPrompt = 
    `You are a graph editor agent.

    Rules:
    - Use unique IDs for all nodes
    - Never edit source code - graph changes only
    - Delete template nodes if request requires different structure
    - Create CMS-style properties when possible (colors, text, numbers, booleans, selects)
    - Set new nodes to "unbuilt" state

    Tools: graph_read, graph_node_add, graph_node_edit, graph_node_delete, graph_edge_create

    Keep responses brief, use the tools quickly and efficiently.`;

    let prompt = userMessage.content;

    // Add selected node info if available
    if (selectedNodeId) {
      prompt += `\n\nSelected Node: ${selectedNodeTitle} (ID: ${selectedNodeId})`;
      if (selectedNodePrompt) {
        prompt += `\nPrompt: ${selectedNodePrompt}`;
      }
    }

    console.log('🔧 Edit-graph: Generated prompt length:', prompt.length);
    console.log('🔧 Edit-graph: System message length:', customSystemPrompt.length);

    // Get base URL for MCP server tools
    const baseUrl = getBaseUrl(req);
    console.log('🌐 Edit-graph: Base URL for MCP tools:', baseUrl);

    // Create MCP server configuration that can be serialized
    const graphToolsServerConfig: McpServerConfig = {
      name: "graph-tools",
      baseUrl: baseUrl,
      tools: EDIT_GRAPH_TOOLS // Tools will be filtered by the claude-code endpoint
    };

    console.log('🎯 Edit-graph: MCP server config created successfully');

    // Build Claude Code options for graph editing
    const claudeOptions: ClaudeCodeOptions = {
      appendSystemPrompt: customSystemPrompt,
      mcpServers: {
        "graph-tools": graphToolsServerConfig,
      },
      allowedTools: EDIT_GRAPH_TOOLS,
      cwd: projectDir(),
      includePartialMessages: true, // Enable streaming for real-time updates
      permissionMode: 'bypassPermissions', // Allow internal operations
      abortController: new AbortController()
    };

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({prompt, options: claudeOptions})
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status} ${response.body?.toString()}`);
    }

    // If the response is already streaming, pass it through
    if (response.headers.get('content-type')?.includes('text/plain')) {
      console.log('🔄 Edit-graph: Processing streaming response from Claude Code');

      // Create a new stream that processes the Server-Sent Events from Claude Code
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();

          try {
            if (!reader) {
              console.log('❌ Edit-graph: No reader available');
              controller.close();
              return;
            }

            let buffer = '';
            let hasStarted = false;
            let totalContent = '';

            console.log('🎬 Edit-graph: Starting stream processing');

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                console.log('🏁 Edit-graph: Reader done, total content length:', totalContent.length);
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');

              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6); // Remove 'data: ' prefix
                  console.log('📦 Edit-graph: Received data:', data);

                  if (data === '[STREAM_START]') {
                    if (!hasStarted) {
                      hasStarted = true;
                      console.log('🎯 Edit-graph: Stream started');
                    }
                  } else if (data === '[STREAM_END]') {
                    console.log('🏁 Edit-graph: Stream ended, total content:', totalContent);
                    controller.close();
                    return;
                  } else {
                    try {
                      const parsed = JSON.parse(data);
                      console.log('📝 Edit-graph: Parsed content:', parsed);

                      if (parsed.type === 'result' && parsed.content) {
                        // Stream the final result
                        totalContent += parsed.content;
                        console.log('📤 Edit-graph: Sending final result:', parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.type === 'trace') {
                        // Stream trace information
                        const traceContent = formatTraceMessage(parsed.trace);
                        totalContent += traceContent;
                        console.log('📤 Edit-graph: Sending trace:', traceContent.trim());
                        controller.enqueue(enc.encode(traceContent));
                      } else if (parsed.content) {
                        // Stream regular content (backward compatibility)
                        totalContent += parsed.content;
                        console.log('📤 Edit-graph: Sending content:', parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.error) {
                        console.log('❌ Edit-graph: Error in content:', parsed.error);
                        controller.enqueue(enc.encode(`\n\nError: ${parsed.error}\n`));
                      }
                    } catch (e) {
                      // If it's not JSON, treat as plain text
                      console.log('📝 Edit-graph: Plain text content:', data);
                      totalContent += data;
                      controller.enqueue(enc.encode(data + '\n'));
                    }
                  }
                }
              }
            }

            // Close if we finish without [STREAM_END]
            console.log('🏁 Edit-graph: Stream completed without [STREAM_END]');
            controller.close();
          } catch (error) {
            console.error('❌ Edit-graph: Streaming error:', error);
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
