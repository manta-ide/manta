import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { fileTools } from '@/app/api/lib/aiFileTools';
import { 
  Message, 
  ParsedMessage, 
  ClientChatRequestSchema,
  MessageVariablesSchema
} from '../lib/schemas';
import { buildConversationForAI, addMessageToSession } from '../lib/conversationStorage';
import { storeGraph, getGraphSession } from '../lib/graphStorage';

// Request schema for graph-code generation
const GraphCodeRequestSchema = z.object({
  userMessage: z.object({
    role: z.string(),
    content: z.string(),
    variables: z.object({
      USER_REQUEST: z.string(),
    }),
    messageContext: z.any().optional(),
  }),
  sessionId: z.string().optional(),
  // Graph generation parameters
  maxDepth: z.number().int().min(0).max(12).optional(),
  maxNodes: z.number().int().min(1).max(1000).optional(),
  childLimit: z.number().int().min(0).max(20).optional(),
  concurrency: z.number().int().min(1).max(16).optional(),
  batchSize: z.number().int().min(1).max(20).optional(),
  minChildComplexity: z.number().int().min(1).max(5).optional(),
  allowPrimitiveExpansion: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Parse and validate the request body
    const parsed = GraphCodeRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      userMessage,
      sessionId = 'default',
      maxDepth = 3,
      maxNodes = 120,
      childLimit = 3,
      concurrency = 4,
      batchSize = 4,
      minChildComplexity = 3,
      allowPrimitiveExpansion = false,
      model = 'gpt-4o',
      temperature = 0.2,
      topP = 1,
      seed,
    } = parsed.data;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Step 1: Generate graph
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'status', 
              message: 'Generating UI structure graph...' 
            }) + '\n')
          );

          const graphResponse = await fetch('http://localhost:3000/api/chat-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userMessage,
              maxDepth,
              maxNodes,
              childLimit,
              concurrency,
              batchSize,
              minChildComplexity,
              allowPrimitiveExpansion,
              model,
              temperature,
              topP,
              seed,
            }),
          });
          console.log('graphResponse', graphResponse);
          if (!graphResponse.ok) {
            throw new Error(`Graph generation failed: ${graphResponse.statusText}`);
          }

          const graph = await graphResponse.json();
          
          // Store the graph
          storeGraph(sessionId, graph);

          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'graph_generated', 
              graph: graph,
              message: 'Graph generated successfully. Generating code...' 
            }) + '\n')
          );

          // Step 2: Generate code based on the graph
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'status', 
              message: 'Generating code based on UI structure...' 
            }) + '\n')
          );

          // Create a system message that includes the graph context
          const systemMessage: Message = {
            role: 'system',
            variables: {
              PROJECT_FILES: userMessage.messageContext?.currentFile ? [{
                route: userMessage.messageContext.currentFile,
                lines: 0
              }] : [],
              CURRENT_FILE: userMessage.messageContext?.currentFile || '',
              CURRENT_FILE_CONTENT: '',
              GRAPH_CONTEXT: JSON.stringify(graph, null, 2)
            }
          };

          // Add the system message to the session
          addMessageToSession(sessionId, systemMessage);

          // Build conversation with graph context
          const allMessages = await buildConversationForAI(sessionId, userMessage as Message);

          // Get templates
          const templates = {
            'user': await getTemplate('user-prompt-template'),
            'assistant': await getTemplate('assistant-prompt-template'),
            'system': await getTemplate('system-prompt-template')
          };

          // Parse messages with graph context
          const parsedMessages: ParsedMessage[] = allMessages.map(message => {
            const template = templates[message.role];
            const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
            const content = parseMessageWithTemplate(template, validatedVariables);
            return { role: message.role, content };
          });

          // Generate code using the AI model
          const result = await streamText({
            model: azure('o4-mini'),
            messages: parsedMessages,
            tools: fileTools,
            maxSteps: 5,
            abortSignal: req.signal,
            providerOptions: {
              azure: {
                reasoning_effort: 'high'
              }
            }
          });

          let full = '';
          const toolCalls: any[] = [];
          const toolResults: any[] = [];

          // Process the streaming response
          for await (const chunk of result.fullStream) {
            switch (chunk.type) {
              case 'text-delta':
                full += chunk.textDelta;
                controller.enqueue(
                  encoder.encode(JSON.stringify({ t: 'token', d: chunk.textDelta }) + '\n')
                );
                break;

              case 'tool-call':
                toolCalls.push(chunk);
                controller.enqueue(
                  encoder.encode(JSON.stringify({ 
                    t: 'tool_call', 
                    toolName: chunk.toolName,
                    args: chunk.args,
                    language: chunk.toolName === 'readFile' ? `tool-status:readFile:calling:${chunk.args.path}` : undefined
                  }) + '\n')
                );
                break;

              case 'tool-result':
                toolResults.push(chunk);
                
                const resultData: any = { 
                  t: 'tool_result', 
                  toolName: chunk.toolName,
                  result: chunk.result 
                };

                // Handle file operations
                if (chunk.toolName === 'createFile' || chunk.toolName === 'updateFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: chunk.toolName === 'createFile' ? `create:${toolCall.args.path}` : `update:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.content
                    };
                  }
                } else if (chunk.toolName === 'readFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall && chunk.result?.success) {
                    resultData.codeBlock = {
                      language: `tool-status:readFile:completed:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: chunk.result.content
                    };
                  }
                } else if (chunk.toolName === 'patchFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: `patch:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.patch
                    };
                  }
                } else if (chunk.toolName === 'deleteFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: `delete:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: `File deleted: ${toolCall.args.path}`
                    };
                  }
                }

                controller.enqueue(
                  encoder.encode(JSON.stringify(resultData) + '\n')
                );
                break;

              case 'step-finish':
                break;

              case 'finish':
                break;
            }
          }

          // Add assistant response to session
          const assistantMessage: Message = {
            role: 'assistant',
            content: full,
            variables: {
              ASSISTANT_RESPONSE: full
            }
          };
          addMessageToSession(sessionId, assistantMessage);

          // Send final completion
          const allFileOperations = toolResults
            .map(tr => (tr.result as any)?.operation)
            .filter(Boolean);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ 
                t: 'final', 
                reply: full, 
                operations: allFileOperations,
                toolCalls: toolCalls.length,
                toolResults: toolResults.length,
                graph: graph // Include the generated graph in final response
              }) + '\n'
            )
          );

        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ t: 'error', error: String(err?.message || err) }) + '\n'
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (err: any) {
    console.error(err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
} 