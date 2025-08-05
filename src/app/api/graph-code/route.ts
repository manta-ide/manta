import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { 
  Message, 
  ParsedMessage, 
  ClientChatRequestSchema,
  MessageVariablesSchema
} from '../lib/schemas';
import { buildConversationForAI, addMessageToSession } from '../lib/conversationStorage';
import { storeGraph } from '../lib/graphStorage';

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
          await storeGraph(sessionId, graph);

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

          // Add the user message with graph context to the session
          const userMessageWithGraph: Message = {
            role: 'user',
            content: userMessage.content,
            variables: userMessage.variables
          };
          addMessageToSession(sessionId, userMessageWithGraph);

          // Build the complete conversation with graph context
          const allMessages = await buildConversationForAI(sessionId, userMessageWithGraph);

          // Get templates
          const templates = {
            'user': await getTemplate('user-prompt-template'),
            'assistant': await getTemplate('assistant-prompt-template'),
            'system': await getTemplate('system-prompt-template')
          };

          // Parse all messages uniformly, with Zod validation on variables
          const parsedMessages: ParsedMessage[] = allMessages.map(message => {
            const template = templates[message.role];
            // Validate message variables against schema before using them
            const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
            const content = parseMessageWithTemplate(template, validatedVariables);
            return { role: message.role, content };
          });

          // Generate code using the main chat route
          const chatResponse = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userMessage: userMessageWithGraph,
              sessionId,
              parsedMessages
            }),
            signal: req.signal
          });

          if (!chatResponse.ok) {
            throw new Error(`Chat generation failed: ${chatResponse.statusText}`);
          }

          const reader = chatResponse.body?.getReader();
          if (!reader) {
            throw new Error('No response body from chat route');
          }

          let full = '';
          const toolCalls: any[] = [];
          const toolResults: any[] = [];

          // Process the streaming response from chat route
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  
                  switch (data.t) {
                    case 'token':
                      full += data.d;
                      controller.enqueue(
                        encoder.encode(JSON.stringify({ t: 'token', d: data.d }) + '\n')
                      );
                      break;

                    case 'tool_call':
                      toolCalls.push(data);
                      controller.enqueue(
                        encoder.encode(JSON.stringify({ 
                          t: 'tool_call', 
                          toolName: data.toolName,
                          args: data.args,
                          language: data.language
                        }) + '\n')
                      );
                      break;

                    case 'tool_result':
                      toolResults.push(data);
                      controller.enqueue(
                        encoder.encode(JSON.stringify(data) + '\n')
                      );
                      break;

                    case 'final':
                      // Final response from chat route
                      break;

                    case 'error':
                      throw new Error(data.error);
                  }
                } catch (parseErr) {
                  console.warn('Failed to parse chat response line:', line);
                }
              }
            }
          } finally {
            reader.releaseLock();
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