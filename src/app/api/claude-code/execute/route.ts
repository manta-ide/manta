import { NextRequest } from 'next/server';
import { query, createSdkMcpServer, type SDKMessage, type SDKAssistantMessage, type SDKUserMessage, type SDKResultMessage, type SDKSystemMessage, type SDKPartialAssistantMessage, type Options } from '@anthropic-ai/claude-code';
import { ClaudeCodeRequestSchema } from '@/app/api/lib/schemas';
import { createGraphTools } from '../../lib/claude-code-tools';
import { getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';

// Claude Code Execute Route
// This route handles Claude Code execution for different agent types.
// Working Directory Setup:
// - Development mode: Works in test-project directory (when developing Manta itself)
// - Production/User project mode: Works in the current user project directory
// The working directory is determined by MANTA_MODE and MANTA_PROJECT_DIR env vars

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
    let first = true;
    let lastLoggedLength = 0;
    // Note: Hooks are causing type issues, using simplified approach
    // Will rely on message streaming for trace information
    
    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Configure based on subagent
          const baseUrl = getBaseUrl(req as any);
          const tools = createGraphTools(baseUrl);
          logLine('🔧 Claude Code: Registering tools:', tools.map(t => t.name));
          const mcpServer = createSdkMcpServer({ name: 'graph-tools', version: '1.0.0', tools });

          // Log the working directory
          const workingDirectory = projectDir();
          const mode = process.env.MANTA_MODE === 'user-project' ? 'user project' : 'development';
          logLine(`📁 Claude Code: Working directory (${mode} mode): ${workingDirectory}`);

          logLine('🚀 Starting Claude Code query with prompt length:', prompt.length);

          // Create user message generator with the prompt
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
            //Required for claude code sdk to work. 1800000 = 30 minutes for max task length
            await new Promise(res => setTimeout(res, 1800000))
            first = false;
          }

          // Orchestrator system prompt - analyzes diffs and delegates specific tasks
          const orchestratorSystemPrompt = `You are the Manta orchestrator agent. Your role is to analyze the current state, identify what needs to be built, and delegate specific implementation tasks to specialized subagents. You are responsible for updating the base graph when all implementation work is complete.

CRITICAL RULES:
- You are an ORCHESTRATOR - you analyze, delegate tasks, coordinate, and finalize results
- NEVER edit graph structure (nodes, edges) directly
- NEVER write or modify code files
- You CAN use analyze_diff() to understand what needs to be done
- You CAN use update_base_graph() to finalize completed work

ORCHESTRATOR WORKFLOW:

Graph editing:
For graph structure editing (creating nodes, editing connections, deleting elements): Use the graph-editor subagent

There is current graph, which is the state of the codebase we need to achieve, and there is base graph, which is the current state of the codebase.
You need to get the difference, and implement the changes to make the base graph match the current graph, by using code-builder subagent and then syncing the changes to the base graph.
Make sure that if the elements get deleted, the appropriate code is gracefully deleted from the codebase.

Graph building:
1. Use analyze_diff() at the START to identify what changes need to be made
2. For each change:
   - Launch code-builder subagent with specific task: "Implement node [ID] - create properties and generate code"
   - Wait for completion of that specific task
   - Repeat for each change that needs work
   - Use sync_to_base_graph() to sync the completed nodes/edges to base graph
3. Use analyze_diff() at the END to verify that graphs are now in sync
4. Verify that properties are wired to the code properly. If not, use code-builder to fix it.

TASK DELEGATION:
- Give code-builder ONE SPECIFIC NODE at a time to work on
- Wait for each task to complete before starting the next
- Provide clear instructions: "Build node [ID] with title '[TITLE]' and prompt '[PROMPT]'"
- Monitor progress and ensure each task completes successfully

VERIFICATION PROCESS:
- Run analyze_diff() before starting any work to see the initial state
- Run analyze_diff() after sync_to_base_graph() to confirm all differences are resolved
- Only consider the task complete when analyze_diff() shows no remaining differences

ORCHESTRATOR RESPONSIBILITIES:
- Analyze the diff between current and base graphs to identify work needed
- Delegate specific implementation tasks to code-builder subagent
- Coordinate the workflow and ensure all tasks complete
- Use sync_to_base_graph() with specific node/edge IDs to sync completed work
- Use analyze_diff() before and after to verify sync status
- Provide high-level guidance and summarize results

Remember: You analyze what needs to be done, delegate specific tasks one by one, sync the results, and verify completion.`;

          // Generic query options with orchestrator prompt
          const queryOptions: Options = {
            includePartialMessages: true,
            customSystemPrompt: orchestratorSystemPrompt,
            permissionMode: 'bypassPermissions',
            //mcpServers: { 'graph-tools': mcpServer },
            abortController: new AbortController(),
            cwd: workingDirectory,
            strictMcpConfig: true,
          } as any;

          logLine('🔧 Claude Code: Starting query iteration');

          let messageCount = 0;
          try {

            

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
              if (VERBOSE && (message as any).type !== 'stream_event') {
                //logHeader(`SDK Message #${messageCount} (${(message as any).type})`);
                //logLine('📥 Full message payload:', pretty(message));
              }
              await handleMessage(message as SDKMessage, controller, encoder);
            }
          } catch (queryError) {
            logHeader('❌ Claude Code: Query error');
            logLine('', pretty(queryError));

            // Only send error and close if stream is still open
            if (!streamClosed) {
              streamClosed = true;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Query failed: ' + (queryError as Error).message })}\n\n`));
                controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
              } catch (enqueueError) {
                logLine('⚠️ Failed to enqueue error - stream may be closed:', enqueueError);
              }
              controller.close();
            }
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
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
              controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
            } catch (enqueueError) {
              console.error('⚠️ Failed to enqueue final error - stream may be closed:', enqueueError);
            }
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

          // Send tool call to UI for visibility only if stream is still open
          if (!streamClosed) {
            const traceData = {
              type: 'trace',
              trace: {
                type: 'tool_call',
                tool: toolName,
                arguments: call.function?.arguments,
                timestamp: new Date().toISOString()
              }
            };
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(traceData)}\n\n`));
            } catch (enqueueError) {
              logLine('⚠️ Failed to enqueue tool call trace - stream may be closed:', enqueueError);
              streamClosed = true;
            }
          } else {
            logLine('⚠️ Skipping tool call trace enqueue - stream already closed');
          }
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

          // Send tool result to UI only if stream is still open
          if (!streamClosed) {
            const resultData = {
              type: 'tool_result',
              tool_result: {
                content: toolResult.content,
                is_error: toolResult.is_error,
                tool_use_id: toolResult.tool_use_id,
                timestamp: new Date().toISOString()
              }
            };
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
            } catch (enqueueError) {
              logLine('⚠️ Failed to enqueue tool result - stream may be closed:', enqueueError);
              streamClosed = true;
            }
          } else {
            logLine('⚠️ Skipping tool result enqueue - stream already closed');
          }
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
        // Accumulate what Claude is saying in real-time
        const content = event.delta.text || '';
        if (content) {
          accumulatedThinking += content;

          // Mark that thinking has started (but don't send UI message - let chat handle it)
          if (!thinkingSent && accumulatedThinking.length > 5) {
            thinkingSent = true;
            logLine('🤔 Claude started writing...');
          }

          // Show continuous writing progress without line breaks
          const shouldLog = accumulatedThinking.length - lastLoggedLength >= 20 ||
                           ['\n', '.', '!', '?', ':'].some(char => content.includes(char));

          if (shouldLog && accumulatedThinking.length > lastLoggedLength) {
            const previewLength = 80;
            const preview = accumulatedThinking.length > previewLength
              ? '...' + accumulatedThinking.slice(-previewLength)
              : accumulatedThinking;
            logLine(`✨ Claude writing: ${preview}`);
            lastLoggedLength = accumulatedThinking.length;
          }

          // Don't send thinking content to UI - let chat handle its own thinking animation
          lastSentIndex = accumulatedThinking.length;
        }
      } else if (event?.type === 'content_block_stop') {
        // Show what Claude finished thinking as a combined log entry
        if (accumulatedThinking.length > 0) {
          logHeader('🟢 Claude finished thinking (combined content)');
          logLine('', accumulatedThinking);
        }
        logLine('📝 Claude Code: Content block completed');
        accumulatedThinking = ''; // Reset for next message
        lastSentIndex = 0;
        lastLoggedLength = 0;
      } else if (event?.type === 'message_stop') {
        // Message is complete
        logLine('📝 Claude Code: Message streaming completed');
        accumulatedThinking = ''; // Reset accumulated content
        thinkingSent = false; // Reset thinking flag
        lastSentIndex = 0;
        lastLoggedLength = 0;
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
