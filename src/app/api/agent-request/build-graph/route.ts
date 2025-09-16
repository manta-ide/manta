import { NextRequest } from 'next/server';
import { z } from 'zod';
import { graphToXml } from '@/lib/graph-xml';
import { MessageSchema, ClaudeCodeOptions, McpServerConfig } from '@/app/api/lib/schemas';
import { formatTraceMessage } from '@/lib/chatService';
import { storeGraph } from '@/app/api/lib/graph-service';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { loadBaseGraphFromFile, storeBaseGraph } from '@/app/api/lib/graph-service';
import { BUILD_GRAPH_TOOLS, getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';

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

    const {
      userMessage,
      graphDiff,
      currentGraph
    } = parsed.data;

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

    // Build system message for code implementation
    const appendSystemMessage = `You are the unified Manta code builder agent.

Goal: Build and implement code based on graph changes, ensuring properties are properly wired.

Rules:
- Use graph_analyze_diff() to understand what changed in the graph since the last build
- Focus exclusively on code generation and implementation - no graph structure editing
- Implement code based on node prompts and properties, keeping changes minimal and focused
- Property IDs must be globally unique and prefixed per node
- For nested object fields, use dot notation: e.g., "root-styles.background-color"
- Set node states to "built" after successful implementation
- Ensure all properties are properly wired and connected in the generated code
- When implementation is complete, set node state to "built"
- Summarize applied changes at the end

Available Tools:
- graph_read(nodeId?, includeProperties?, includeChildren?) - Read graph or specific nodes
- graph_analyze_diff() - Analyze what changed in the graph
- graph_node_set_state(nodeId, state) - Update node build state

Output: Short, single-sentence status updates during work. End with concise summary of what was accomplished.

This is a Vite project using TypeScript and Tailwind CSS. Focus on code implementation and property wiring.`;

    // Build user prompt for code implementation
    const prompt = `Please implement the code changes based on graph changes and ensure properties are properly wired.`;

    // Get base URL for MCP server tools
    const baseUrl = getBaseUrl(req);
    console.log('🌐 Build-graph: Base URL for MCP tools:', baseUrl);

    // Create MCP server configuration that can be serialized
    const graphToolsServerConfig: McpServerConfig = {
      name: "graph-tools",
      baseUrl: baseUrl,
      tools: BUILD_GRAPH_TOOLS // Tools will be filtered by the claude-code endpoint
    };

    console.log('🎯 Build-graph: MCP server config created successfully');

    // Build Claude Code options for graph building
    const claudeOptions: ClaudeCodeOptions = {
      appendSystemPrompt: appendSystemMessage,
      mcpServers: {
        "graph-tools": graphToolsServerConfig,
      },
      // No allowedTools - using disallowedTools instead
      disallowedTools: [], // Empty array means no tools are disallowed
      cwd: projectDir(),
      includePartialMessages: true, // Enable streaming for real-time updates
      permissionMode: 'bypassPermissions', // Allow internal operations
      abortController: new AbortController()
    };

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({prompt, options: claudeOptions}),
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status} ${response.body?.toString()}`);
    }

    // If the response is streaming, pass it through with trace handling
    if (response.headers.get('content-type')?.includes('text/plain')) {
      console.log('🔄 Build-graph: Processing streaming response from Claude Code');

      // Create a new stream that processes the Server-Sent Events from Claude Code
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();

          try {
            if (!reader) {
              console.log('❌ Build-graph: No reader available');
              controller.close();
              return;
            }

            let buffer = '';
            let hasStarted = false;
            let totalContent = '';

            console.log('🎬 Build-graph: Starting stream processing');

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                console.log('🏁 Build-graph: Reader done, total content length:', totalContent.length);
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');

              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6); // Remove 'data: ' prefix
                  console.log('📦 Build-graph: Received data:', data);

                  if (data === '[STREAM_START]') {
                    if (!hasStarted) {
                      hasStarted = true;
                      console.log('🎯 Build-graph: Stream started');
                    }
                  } else if (data === '[STREAM_END]') {
                    console.log('🏁 Build-graph: Stream ended, total content:', totalContent);
                    controller.close();
                    return;
                  } else {
                    try {
                      const parsed = JSON.parse(data);
                      console.log('📝 Build-graph: Parsed content:', parsed);

                      if (parsed.type === 'result' && parsed.content) {
                        // Stream the final result
                        totalContent += parsed.content;
                        console.log('📤 Build-graph: Sending final result:', parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.type === 'trace') {
                        // Stream trace information
                        const traceContent = formatTraceMessage(parsed.trace);
                        totalContent += traceContent;
                        console.log('📤 Build-graph: Sending trace:', traceContent.trim());
                        controller.enqueue(enc.encode(traceContent));
                      } else if (parsed.content) {
                        // Stream regular content (backward compatibility)
                        totalContent += parsed.content;
                        console.log('📤 Build-graph: Sending content:', parsed.content);
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.error) {
                        console.log('❌ Build-graph: Error in content:', parsed.error);
                        controller.enqueue(enc.encode(`\n\nError: ${parsed.error}\n`));
                      }
                    } catch (e) {
                      // If it's not JSON, treat as plain text
                      console.log('📝 Build-graph: Plain text content:', data);
                      totalContent += data;
                      controller.enqueue(enc.encode(data + '\n'));
                    }
                  }
                }
              }
            }

            // Save base graph when streaming completes
            console.log('💾 Build-graph: Saving base graph after streaming completion');
            try {
              await storeBaseGraph(currentGraph, 'default-user');
              console.log('✅ Base graph saved after successful build completion');
              controller.enqueue(enc.encode('\nBase graph updated with current state\n'));
            } catch (error) {
              console.error('❌ Failed to save base graph:', error);
              controller.enqueue(enc.encode('\nWarning: Failed to save base graph\n'));
            }

            controller.enqueue(enc.encode('\nGraph build completed successfully\n'));
            controller.close();
          } catch (error) {
            console.error('❌ Build-graph: Streaming error:', error);
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
          controller.enqueue(enc.encode(result + '\n'));
          controller.close();
        }
      });
    }
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
