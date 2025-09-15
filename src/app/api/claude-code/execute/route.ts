import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query, createSdkMcpServer } from '@anthropic-ai/claude-code';
import { createGraphTools } from '../../lib/claude-code-tools';
import { getBaseUrl, BUILD_GRAPH_TOOLS, EDIT_GRAPH_TOOLS, projectDir } from '../../lib/claude-code-utils';


const RequestSchema = z.object({
  prompt: z.string(),
  allowedTools: z.array(z.string()).optional(),
  appendSystemMessage: z.string().optional(),
  authHeaders: z.record(z.string()).optional(),
});






export async function POST(req: NextRequest) {
  try {
    const { prompt, allowedTools, appendSystemMessage, authHeaders } = RequestSchema.parse(await req.json());
    console.log('🎯 Claude Code: Received request with prompt length:', prompt.length);
    console.log('🎯 Claude Code: Prompt content:', prompt);
    console.log('🎯 Claude Code: Allowed tools:', allowedTools);
    console.log('🎯 Claude Code: System message present:', !!appendSystemMessage);
    console.log('🎯 Claude Code: Auth headers present:', !!authHeaders);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('🔑 Claude Code: ANTHROPIC_API_KEY present:', !!apiKey);

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    // Get base URL for MCP server tools
    const baseUrl = getBaseUrl(req);
    console.log('🌐 Claude Code: Base URL for MCP tools:', baseUrl);

    // Determine which tools to use - default to all if not specified
    const toolsToUse = allowedTools || [...BUILD_GRAPH_TOOLS, ...EDIT_GRAPH_TOOLS];
    console.log('🎯 Claude Code: Tools to use:', toolsToUse);

    // Create MCP server with tools from the tools file
    const toolsArray = createGraphTools(baseUrl, authHeaders);
    console.log('🎯 Claude Code: Created tools array with length:', toolsArray.length, '(should be 7 graph tools)');

    const graphToolsServerWithBaseUrl = createSdkMcpServer({
      name: "graph-tools",
      version: "1.0.0",
      tools: toolsArray
    });

    console.log('🎯 Claude Code: MCP server created successfully');

    // Execute Claude Code with SDK and stream response
    let fullResponse = '';
    let hasStartedStreaming = false;

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          console.log('🚀 Starting Claude Code query with prompt length:', prompt.length);

          // Create user message generator with the dynamic prompt
          async function* generateUserMessage() {
          yield {
                type: "user" as const,
                message: {
                  role: "user" as const,
                  content: prompt
                },
                parent_tool_use_id: null,
                session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
              };
              await new Promise(res => setTimeout(res, 10000))
            }

          console.log('🔧 Claude Code: Starting query iteration');

          let messageCount = 0;
          try {
            // Use the proven working minimal configuration
            console.log('🚀 Using minimal Claude Code configuration (proven to work)');
            console.log('🎯 Claude Code: System message length:', appendSystemMessage?.length || 0);
            console.log('🎯 Claude Code: System message preview:', appendSystemMessage?.substring(0, 200) + '...' || 'none');

              for await (const message of query({
                        prompt: generateUserMessage(),
                options: {
                          //maxTurns: 5,
                          ...(appendSystemMessage && { appendSystemPrompt: appendSystemMessage }),
                          mcpServers: {
                            "graph-tools": graphToolsServerWithBaseUrl,
                          },
                          allowedTools: toolsToUse,
                          cwd: projectDir()
                }
              })) {
              messageCount++;
              console.log(`📨 Claude Code: Message ${messageCount} - Type:`, message.type);

              // Log tool calls if any
              if (message.type === "assistant" && (message as any).tool_calls) {
                console.log('🔧 Claude Code: Tool calls detected:', (message as any).tool_calls.length);
                (message as any).tool_calls.forEach((call: any, index: number) => {
                  console.log(`🔧 Tool call ${index + 1}:`, call.function?.name);
                  if (call.function?.arguments) {
                    console.log(`🔧 Arguments:`, JSON.stringify(call.function.arguments, null, 2));
                  }
                });
              }

              if (message.type === "result" && (message as any).result) {
                console.log('✅ Claude Code: Response generated successfully');
                fullResponse = String((message as any).result);
                hasStartedStreaming = true;

                // Send the complete response
                controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fullResponse })}\n\n`));
                controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
                controller.close();
                return;
              }
            }
          } catch (queryError) {
            console.error('❌ Claude Code: Query error:', queryError);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Query failed: ' + (queryError as Error).message })}\n\n`));
            controller.close();
            return;
          }

          // If we get here without a result, send completion
          console.log('🏁 Claude Code: Query completed without result');
          console.log('🏁 Claude Code: Total messages processed:', messageCount);

          if (!hasStartedStreaming) {
            console.log('🎯 Claude Code: No response generated, sending fallback');
            controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "I apologize, but I couldn't generate a response. Please try again." })}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
          controller.close();

        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
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

  } catch (error: any) {
    console.error('Claude Code API error:', error);
    return new Response(`Error: ${error?.message || String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
