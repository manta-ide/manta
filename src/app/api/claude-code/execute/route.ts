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
    let lastLoggedLength = 0;
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
            //Required for claude code sdk to work. 1800000 = 30 minutes for max task length
            await new Promise(res => setTimeout(res, 1800000))
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

            // Log the working directory for the agent
            const workingDirectory = projectDir();
            const mode = process.env.MANTA_MODE === 'user-project' ? 'user project' : 'development';
            logLine(`📁 Claude Code: Working directory for ${agentType} (${mode} mode): ${workingDirectory}`);

            // Choose configuration based on agent type
            let customSystemPrompt: string;
            let allowedTools: string[];
            let disallowedTools: string[];
            let queryOptions: Options;

            if (agentType === 'edit-graph') {
              customSystemPrompt =
              `You are a graph editor agent.

              Rules:
              - Use unique IDs for all nodes
              - Never edit source code - graph changes only
              - Delete template nodes if request requires different structure
              - Create nodes WITHOUT properties (properties are handled by graph builders)
              - You can edit property values for existing nodes
              - Use clear, descriptive titles and prompts for nodes

              Tools: read(graphType="current"), node_create, node_edit, node_delete, edge_create, edge_delete

              IMPORTANT: Always use read(graphType="current") to work with the current graph structure.

              Keep responses brief, use the tools quickly and efficiently.
              Optimization rules:
              - For read-only queries ("what nodes are on the graph?"), call read(graphType="current") once and answer succinctly.
              - For deletions, call node_delete once per target node and avoid repeated attempts.
              - Avoid unnecessary thinking or extra tool calls when a single call is sufficient.`;

              allowedTools = ["mcp__graph-tools__read", "mcp__graph-tools__node_add", "mcp__graph-tools__node_edit", "mcp__graph-tools__node_delete", "mcp__graph-tools__edge_create", "mcp__graph-tools__edge_delete"];
              // No disallowedTools - only allowedTools are permitted

              // Edit operations work in the configured project directory (dev: test-project, prod: user project)
              const editGraphCwd = projectDir();

              queryOptions = {
                includePartialMessages: true,
                customSystemPrompt: customSystemPrompt,
                permissionMode: 'bypassPermissions',
                mcpServers: { 'graph-tools': mcpServer },
                allowedTools: allowedTools,
                abortController: new AbortController(),
                cwd: editGraphCwd,
                strictMcpConfig: true,
              } as any;
            } else if (agentType === 'build-graph') {
              customSystemPrompt = `You are the Manta code builder agent. Follow this 3-step pipeline:

              PIPELINE:
              1. GET DIFF - Use analyze_diff() to see what nodes need to be built or updated
              2. GENERATE PROPERTIES - Create/edit properties for new nodes and regenerate where changes are needed
              3. GENERATE CODE - Implement code and wire all properties to actual functionality

              Rules:
              - Always start with analyze_diff() to understand what work is needed
              - Use read(graphType="current") and read(graphType="base") to examine specific nodes that need building
              - Focus on properties first, then code implementation
              - Use node_edit() to add/modify properties on existing nodes
              - Only use update_base_graph() when implementation is complete and tested

              Property Guidelines:
              - Properties should correspond to real component attributes and be wired to the actual code for CMS-style customization
              - Make sure that all properties have values in the nodes
              - Use appropriate input types from the schema that make sense for the component's customization needs:
                * 'text' - for strings like titles, descriptions, labels
                * 'textarea' - for longer text content, descriptions, or formatted text
                * 'number' - for numeric values like sizes, padding, font sizes, quantities
                * 'color' - for color pickers (background-color, text-color, border-color, etc.)
                * 'boolean' - for true/false values like disabled, visible, required, clickable
                * 'select' - for predefined options like size scales, layout directions, font families
                * 'checkbox' - for multiple selections like features or categories
                * 'radio' - for single selections from mutually exclusive options
                * 'slider' - for ranged numeric values like opacity, border radius, spacing
                * 'font' - for font selection with family, size, weight options
                * 'object' - for nested properties and grouped settings
                * 'object-list' - for arrays of objects like social links, menu items, testimonials
              - Each property should have a clear 'title' and appropriate 'type' from the schema above
              - Properties should be functional and actually affect the component's behavior/appearance
              - Use CMS-style property categories:
                * Colors: background-color, text-color, border-color, hover-color, etc.
                * Sizes: width, height, padding, margin, font-size, border-radius, etc.
                * Behavior: disabled, visible, clickable, required, readonly, etc.
                * Content: title, description, placeholder, alt-text, label, etc.
                * Layout: position, flex-direction, justify-content, align-items, gap, etc.
                * Interactions: onClick, onHover, onChange handlers, etc.
              - Properties should use sensible defaults but be customizable through the CMS interface
              - IMPORTANT: Always use the correct property type - NEVER use "text" type for color properties, always use "color" type, etc.
              - Group related properties using 'object' type for better organization (e.g., "root-styles" with background-color, text-color, font-family)
              - Use 'object-list' for repeatable content structures with defined itemFields
              - Make sure that all properties are editable by a normal user without programming/css knowledge, for a gradient do an object with a few colors, etc.

              Available Tools:
              - analyze_diff() - Step 1: Get differences between current and base graphs
              - read(graphType, nodeId?) - Read from current or base graph, or specific nodes
              - node_edit(mode, properties) - Step 2: Generate/edit properties for nodes
              - node_add(nodeId, title, prompt) - Add new nodes to the graph
              - edge_delete(sourceId, targetId) - Delete edges between nodes
              - update_base_graph(nodes) - Step 3: Save completed implementations to base graph

              Output: Short, single-sentence status updates during work. End with concise summary of what was accomplished.

              This is a Vite project using TypeScript and Tailwind CSS. Focus on code implementation and property wiring.`;

              // Graph builders follow a 3-step pipeline:
              // 1. Get diff to see what needs to be built
              // 2. Generate properties for new nodes, regenerate where they need changes
              // 3. Generate code and wire properties

              // Use disallowedTools only - all tools allowed except these specific ones
              disallowedTools = ["mcp__graph-tools__node_create", "mcp__graph-tools__node_delete", "mcp__graph-tools__edge_create", "mcp__graph-tools__edge_delete",];
              // No allowedTools - using disallowedTools approach

              // Build operations work in the configured project directory (dev: test-project, prod: user project)
              const buildGraphCwd = projectDir();

              queryOptions = {
                includePartialMessages: true,
                customSystemPrompt: customSystemPrompt,
                permissionMode: 'bypassPermissions',
                mcpServers: { 'graph-tools': mcpServer },
                disallowedTools: disallowedTools,
                abortController: new AbortController(),
                cwd: buildGraphCwd,
                strictMcpConfig: true,
              } as any;
            } else {
              throw new Error(`Unknown agent type: ${agentType}`);
            }

            

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
