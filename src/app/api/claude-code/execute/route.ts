import { NextRequest } from 'next/server';
import { query, createSdkMcpServer, type SDKMessage, type SDKAssistantMessage, type SDKUserMessage, type SDKResultMessage, type SDKSystemMessage, type SDKPartialAssistantMessage, type Options } from '@anthropic-ai/claude-code';
import { ClaudeCodeRequestSchema } from '@/app/api/lib/schemas';
import { createGraphTools } from '../../lib/claude-code-tools';
import { getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';

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
    const { prompt, agentType, options } = ClaudeCodeRequestSchema.parse(await req.json());

    logHeader('Claude Code Execute');
    logLine('🎯 Claude Code: User asked (full):', prompt);
    logLine('🎯 Claude Code: Agent type:', agentType);
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
    let first = true;
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
            //if(first)
            //Required for claude code sdk to work
            await new Promise(res => setTimeout(res, 10000))
            first = false;
          }

          logLine('🔧 Claude Code: Starting query iteration');

          let messageCount = 0;
          try {
            // Configure based on agent type
            const baseUrl = getBaseUrl(req as any);
            const tools = createGraphTools(baseUrl);
            logLine('🔧 Claude Code: Registering tools:', tools.map(t => t.name));
            const mcpServer = createSdkMcpServer({ name: 'graph-tools', version: '1.0.0', tools });

            // Choose configuration based on agent type
            let customSystemPrompt: string;
            let allowedTools: string[];
            let disallowedTools: string[];

            if (agentType === 'edit-graph') {
              customSystemPrompt =
              `You are a graph editor agent.

              Rules:
              - Use unique IDs for all nodes
              - Never edit source code - graph changes only
              - Delete template nodes if request requires different structure
              - Create CMS-style properties when possible (colors, text, numbers, booleans, selects)
              - Set new nodes to "unbuilt" state

              Tools: read, node_add, node_edit, node_delete, edge_create

              Keep responses brief, use the tools quickly and efficiently.
              Optimization rules:
              - For read-only queries ("what nodes are on the graph?"), call read once and answer succinctly.
              - For deletions, call node_delete once per target node and avoid repeated attempts.
              - Avoid unnecessary thinking or extra tool calls when a single call is sufficient.`;

              allowedTools = ["mcp__graph-tools__read", "mcp__graph-tools__node_add", "mcp__graph-tools__node_edit", "mcp__graph-tools__node_delete", "mcp__graph-tools__edge_create"];
              disallowedTools = ["Bash", "Glob", "Grep", "ExitPlanMode", "Read", "Edit", "MultiEdit", "Write", "NotebookEdit", "WebFetch", "TodoWrite", "BashOutput", "KillShell","Task"];

            } else if (agentType === 'build-graph') {
              customSystemPrompt = `You are the unified Manta code builder agent.

              Goal: Build and implement code based on graph changes, ensuring properties are properly wired.

              Rules:
              - Use analyze_diff() to understand what changed in the graph since the last build
              - Focus exclusively on code generation and implementation - no graph structure editing
              - Implement code based on node prompts and properties, keeping changes minimal and focused
              - Property IDs must be globally unique and prefixed per node
              - For nested object fields, use dot notation: e.g., "root-styles.background-color"
              - Set node states to "built" after successful implementation
              - Ensure all properties are properly wired and connected in the generated code
              - When implementation is complete, set node state to "built"
              - Summarize applied changes at the end

              Available Tools:
              - read(nodeId?, includeProperties?, includeChildren?) - Read graph or specific nodes
              - analyze_diff() - Analyze what changed in the graph
              - node_set_state(nodeId, state) - Update node build state

              Output: Short, single-sentence status updates during work. End with concise summary of what was accomplished.

              This is a Vite project using TypeScript and Tailwind CSS. Focus on code implementation and property wiring.`;

              allowedTools = ["mcp__graph-tools__read", "mcp__graph-tools__analyze_diff", "mcp__graph-tools__node_set_state"];
              disallowedTools = []; // Allow all tools for build-graph
            } else {
              throw new Error(`Unknown agent type: ${agentType}`);
            }

            const queryOptions: Options = {
              includePartialMessages: true,
              customSystemPrompt: customSystemPrompt,
              permissionMode: 'bypassPermissions',
              mcpServers: { 'graph-tools': mcpServer },
              allowedTools: allowedTools,
              disallowedTools: disallowedTools,
              abortController: new AbortController(),
              cwd: projectDir(),
              strictMcpConfig: true,
            } as any;

            logLine('🚀 Using simplified Claude Code configuration');

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

    // Handle user messages - including tool results
    async function handleUserMessage(message: SDKUserMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      logHeader('👤 User Message (full)');
      try {
        logLine('', pretty((message as any).message ?? message));
      } catch {
        logLine('', pretty(message));
      }

      // Check if this is a tool result message
      const msg = (message as any).message;
      if (msg && Array.isArray(msg.content)) {
        const toolResult = msg.content.find((c: any) => c.type === 'tool_result');
        if (toolResult) {
          let contentText: string;
          if (Array.isArray(toolResult.content)) {
            contentText = toolResult.content.map((c: any) => c.text || c.type).join(' ') || 'no content';
          } else {
            contentText = toolResult.content || 'no content';
          }
          logLine('🔧 Tool result detected:', `${contentText} (error: ${toolResult.is_error})`);

          // Send tool result to UI
          const resultData = {
            type: 'tool_result',
            tool_result: {
              content: toolResult.content,
              is_error: toolResult.is_error,
              tool_use_id: toolResult.tool_use_id,
              timestamp: new Date().toISOString()
            }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
        }
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
