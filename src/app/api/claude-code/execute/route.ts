import { NextRequest } from 'next/server';
import { query, createSdkMcpServer, type SDKMessage, type SDKAssistantMessage, type SDKUserMessage, type SDKResultMessage, type SDKSystemMessage, type SDKPartialAssistantMessage, type Options } from '@anthropic-ai/claude-code';
import { ClaudeCodeRequestSchema, McpServerConfig } from '@/app/api/lib/schemas';
import { createGraphTools } from '../../lib/claude-code-tools';

// ---- Logging helpers ----
const VERBOSE = process.env.VERBOSE_CLAUDE_LOGS !== '0';
function logHeader(title: string) {
  if (!VERBOSE) return; console.log(`\n====== ${title} ======`);
}
function logLine(prefix: string, message?: any) {
  if (!VERBOSE) return; console.log(prefix, message ?? '');
}
function pretty(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}






export async function POST(req: NextRequest) {
  try {
    const { prompt, options } = ClaudeCodeRequestSchema.parse(await req.json());

    logHeader('Claude Code Execute');
    logLine('🎯 Claude Code: User asked (full):', prompt);
    logLine('🎯 Claude Code: Options received (full):', pretty(options));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    logLine('🔑 Claude Code: ANTHROPIC_API_KEY present:', !!apiKey);

    // if (!apiKey) {
    //   throw new Error('ANTHROPIC_API_KEY environment variable is required');
    // }


    // Execute Claude Code with SDK and stream response
    let fullResponse = '';
    let hasStartedStreaming = false;
    let accumulatedThinking = '';
    let thinkingSent = false;
    let streamClosed = false;
    let lastSentIndex = 0;

    // Note: Hooks are causing type issues, using simplified approach
    // Will rely on message streaming for trace information

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          logLine('🚀 Starting Claude Code query with prompt length:', prompt.length);

          // Create user message generator with the dynamic prompt
          async function* generateUserMessage(): AsyncGenerator<SDKUserMessage> {
            yield {
              type: "user",
              message: {
                role: "user",
                content: prompt
              },
              parent_tool_use_id: null,
              session_id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };
            //Required for claude code sdk to work
            await new Promise(res => setTimeout(res, 10000))
          }

          logLine('🔧 Claude Code: Starting query iteration');

          let messageCount = 0;
          try {
            // Reconstruct MCP servers from configuration
            let reconstructedMcpServers: Record<string, any> | undefined;
            if (options?.mcpServers) {
              reconstructedMcpServers = {};
              for (const [serverName, serverConfig] of Object.entries(options.mcpServers)) {
                const config = serverConfig as McpServerConfig;
                logLine(`🔧 Claude Code: Reconstructing MCP server "${serverName}" with baseUrl:`, config.baseUrl);

                // Create tools for this server
                const toolsArray = createGraphTools(config.baseUrl);
                logLine(`🔧 Claude Code: Created ${toolsArray.length} tools for MCP server "${serverName}"`);

                // Expose all tools to avoid any filtering mismatches during execution
                const filteredTools = toolsArray;

                logLine(`🔧 Claude Code: Configured tools:`, config.tools);
                logLine(`🔧 Claude Code: Available tools:`, toolsArray.map(t => t.name));
                logLine(`🔧 Claude Code: Using ${filteredTools.length} filtered tools for MCP server "${serverName}"`);

                // Create the actual MCP server instance
                logLine(`🔧 Claude Code: Registering tools:`, filteredTools.map(t => t.name));
                const mcpServer = createSdkMcpServer({
                  name: config.name,
                  version: "1.0.0",
                  tools: filteredTools
                });

                reconstructedMcpServers[serverName] = mcpServer;
              }
            }

            // Normalize tool permissions and names
            // Relax tool gating to avoid permission stream issues
            const allowedTools: string[] | undefined = undefined;
            const disallowedTools: string[] | undefined = undefined;

            // Use the options directly as provided by build-graph/edit-graph
            // Reconstruct AbortController if it was serialized and MCP servers
            const queryOptions: Options = {
              ...options,
              permissionMode: (options as any)?.permissionMode || 'bypassPermissions',
              allowedTools,
              disallowedTools,
              abortController: options?.abortController instanceof AbortController
                ? options.abortController
                : new AbortController(),
              mcpServers: reconstructedMcpServers
            } as any;

            logLine('🔐 Permission mode:', (queryOptions as any).permissionMode);
            logLine('✅ Allowed tools:', allowedTools);
            logLine('🚫 Disallowed tools:', disallowedTools);

            logLine('🚀 Using Claude Code configuration from build-graph/edit-graph');

            for await (const message of query({
              prompt: generateUserMessage(),
              options: queryOptions
            })) {
              messageCount++;

              // Start streaming on first message
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
              }

              // Handle different message types with proper typing
              if (VERBOSE) {
                logHeader(`SDK Message #${messageCount} (${(message as any).type})`);
                logLine('📥 Full message payload:', pretty(message));
              }
              await handleMessage(message as SDKMessage, controller, encoder);
            }
          } catch (queryError) {
            logHeader('❌ Claude Code: Query error');
            logLine('', pretty(queryError));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Query failed: ' + (queryError as Error).message })}\n\n`));
            controller.close();
            return;
          }

          // If we get here without a result, send completion
          console.log('🏁 Claude Code: Query completed without result');
          console.log('🏁 Claude Code: Total messages processed:', messageCount);

          // Only close stream if not already closed
          if (!streamClosed) {
            streamClosed = true;

            if (!hasStartedStreaming) {
              console.log('🎯 Claude Code: No response generated, sending fallback');
              controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "I apologize, but I couldn't generate a response. Please try again." })}\n\n`));
            }

            controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
            controller.close();
          }

        } catch (error) {
          console.error('Streaming error:', error);

          // Only close stream if not already closed
          if (!streamClosed) {
            streamClosed = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
            controller.close();
          }
        }
      }
    });

    // Helper function to handle different message types
    async function handleMessage(message: SDKMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      switch (message.type) {
        case "assistant":
          await handleAssistantMessage(message as SDKAssistantMessage, controller, encoder);
          break;

        case "user":
          await handleUserMessage(message as SDKUserMessage, controller, encoder);
          break;

        case "system":
          await handleSystemMessage(message as SDKSystemMessage, controller, encoder);
          break;

        case "result":
          await handleResultMessage(message as SDKResultMessage, controller, encoder);
          break;

        case "stream_event":
          await handlePartialAssistantMessage(message as SDKPartialAssistantMessage, controller, encoder);
          break;

        default:
          // Reduce noise from stream_event messages unless they contain useful info
          if ((message as any).type !== 'stream_event') {
            console.log(`📝 Claude Code: Unhandled message type: ${(message as any).type}`);
          }
      }
    }

    // Handle assistant messages with tool calls and content
    async function handleAssistantMessage(message: SDKAssistantMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      // Handle tool calls - send to UI for visibility
      if ((message as any).tool_calls) {
        logLine('🔧 Claude wants to execute tools:', (message as any).tool_calls.length);
        (message as any).tool_calls.forEach((call: any, index: number) => {
          const toolName = call.function?.name?.replace('mcp__graph-tools__', '');
          logLine(`🔧 Claude tool call #${index + 1}: ${toolName} args:`, pretty(call.function?.arguments));

          // Send tool call to UI for visibility
          const traceData = {
            type: 'trace',
            trace: {
              type: 'tool_call',
              tool: toolName,
              arguments: call.function?.arguments,
              timestamp: new Date().toISOString()
            }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(traceData)}\n\n`));
        });
      }

      // Handle assistant content/thinking - log what Claude is saying
      if ((message as any).content) {
        const content = (message as any).content;
        logHeader('🤖 Assistant Message Content (full)');
        logLine('', content);
      }
    }

    // Handle user messages - don't send to UI to keep it clean
    async function handleUserMessage(message: SDKUserMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      // User messages are handled at the chat level, don't clutter the streaming with them
      logHeader('👤 User Message (full)');
      try {
        logLine('', pretty((message as any).message ?? message));
      } catch {
        logLine('', pretty(message));
      }
    }

    // Handle system messages - don't send to UI, just log
    async function handleSystemMessage(message: SDKSystemMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      logHeader('📝 System Message (full)');
      logLine('', pretty(message));
    }

    // Handle partial assistant messages for real-time streaming
    async function handlePartialAssistantMessage(message: SDKPartialAssistantMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      const event = (message as any).event;

      // Handle different streaming events
      if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
        // Accumulate and log what Claude is saying in real-time
        const content = event.delta.text || '';
        if (content) {
          accumulatedThinking += content;

          // Stream raw delta for full visibility
          logLine('🟡 STREAM Δ', content);

          // Mark that thinking has started (but don't send UI message - let chat handle it)
          if (!thinkingSent && accumulatedThinking.length > 5) {
            thinkingSent = true;
            logLine('🤔 Claude started thinking...');
          }

          // Don't send thinking content to UI - let chat handle its own thinking animation
          lastSentIndex = accumulatedThinking.length;
        }
      } else if (event?.type === 'content_block_start') {
        logLine('🤔 Claude started writing...');
      } else if (event?.type === 'content_block_stop') {
        // Show what Claude finished thinking
        if (accumulatedThinking.length > 0) {
          logHeader('🟢 Claude finished thinking (full)');
          logLine('', accumulatedThinking);
        }
        logLine('📝 Claude Code: Content block completed');
        accumulatedThinking = ''; // Reset for next message
        lastSentIndex = 0;
      } else if (event?.type === 'message_stop') {
        // Message is complete
        logLine('📝 Claude Code: Message streaming completed');
        accumulatedThinking = ''; // Reset accumulated content
        thinkingSent = false; // Reset thinking flag
        lastSentIndex = 0;
      }
    }

    // Handle result messages (final output)
    async function handleResultMessage(message: SDKResultMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      if ((message as any).result) {
        fullResponse = String((message as any).result);

        // Log Claude's final response (full)
        logHeader('🎯 Claude final response (full)');
        logLine('', fullResponse);
        logLine('✅ Claude Code: Response generated successfully');

        // Only close stream if not already closed
        if (!streamClosed) {
          streamClosed = true;

          const resultData = {
            type: 'result',
            content: fullResponse
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
          controller.close();
        }
      }
    }

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
