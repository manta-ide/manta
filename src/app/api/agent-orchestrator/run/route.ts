import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { 
  Message, 
  ParsedMessage, 
  MessageVariablesSchema,
  MessageSchema
} from '../../lib/schemas';
import { buildConversationForAI, createSystemMessage, addMessageToSession } from '../../lib/conversationStorage';
import { storeGraph } from '../../lib/graphStorage';
import { fileTools } from '../../lib/aiFileTools';

// Default configuration
const DEFAULT_CONFIG = {
  // Agent configuration
  agentModel: 'gpt-4o',
  agentMaxSteps: 20,
  agentStreaming: true,
  agentProviderOptions: {
    azure: {
      reasoning_effort: 'high'
    }
  }
} as const;

// Request schema for graph-code generation
const GraphCodeRequestSchema = z.object({
  userMessage: MessageSchema
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

    const { userMessage } = parsed.data;
    console.log('User Message');
    console.log(JSON.stringify(userMessage, null, 2));
    const sessionId = 'default';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Get templates
          const graphTemplates = {
            'user': await getTemplate('user-prompt-template'),
            'assistant': await getTemplate('assistant-prompt-template'),
            'system': await getTemplate('graph-generation-template') // Use graph generation template
          };

          const graphMessages = await buildConversationForAI(sessionId, userMessage);

          // Parse messages for graph generation
          const parsedGraphGenMessages: ParsedMessage[] = graphMessages.map(message => {
            const template = graphTemplates[message.role];
            const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
            const content = parseMessageWithTemplate(template, validatedVariables);
            return { role: message.role, content };
          });

          // Generate graph using structured output
          const graphGenResponse = await fetch('http://localhost:3000/api/llm-agent/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId,
              parsedMessages: parsedGraphGenMessages,
              config: {
                model: DEFAULT_CONFIG.agentModel,
                maxSteps: DEFAULT_CONFIG.agentMaxSteps,
                tools: undefined, // No tools needed for graph generation
                streaming: false, // Use non-streaming for structured output
                structuredOutput: true, // Enable structured output
                providerOptions: DEFAULT_CONFIG.agentProviderOptions,
              }
            }),
            signal: req.signal
          });

          if (!graphGenResponse.ok) {
            throw new Error(`Graph generation failed: ${graphGenResponse.statusText}`);
          }

          // Parse the structured graph response
          const graphGenResult = await graphGenResponse.json();
          const graph = graphGenResult.result.object || graphGenResult.result;
          
          // Store the graph
          await storeGraph(sessionId, graph);
        

          // Create unique session ID for graph code generation
          const graphSessionId = `${sessionId}-graph-code`;

          // Build conversation for graph code generation (only user messages)
          const graphCodeMessages = await buildConversationForAI(graphSessionId, userMessage);
          // Get templates
          const templates = {
            'user': await getTemplate('user-prompt-template'),
            'assistant': await getTemplate('assistant-prompt-template'),
            'system': await getTemplate('graph-code-generation-template') // Use graph-based template
          };

          // Parse messages for graph code generation
          const parsedGraphMessages: ParsedMessage[] = graphCodeMessages.map(message => {
            const template = templates[message.role];
            const validatedVariables = MessageVariablesSchema.parse({
              ...message.variables || {},
              GRAPH_DATA: JSON.stringify(graph, null, 2) // Pass the graph data to the code generation template
            });
            const content = parseMessageWithTemplate(template, validatedVariables);
            return { role: message.role, content };
          });
          console.log('>>>>>>>>>>>>>>>>>>>>>>> Parsed Graph Messages');
          console.log(JSON.stringify(parsedGraphMessages, null, 2));
          // Ensure a tool-capable chat model is used for codegen (reasoning models may not support tools)
          const codeGenModel = DEFAULT_CONFIG.agentModel;

          // Generate code for the entire graph
          const graphResponse = await fetch('http://localhost:3000/api/llm-agent/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: graphSessionId,
              parsedMessages: parsedGraphMessages,
              config: {
                model: codeGenModel,
                maxSteps: DEFAULT_CONFIG.agentMaxSteps,
                tools: fileTools, // Use fileTools for code generation
                streaming: DEFAULT_CONFIG.agentStreaming,
                structuredOutput: false,
                providerOptions: DEFAULT_CONFIG.agentProviderOptions,
              }
            }),
            signal: req.signal
          });

          if (!graphResponse.ok) {
            throw new Error(`Graph code generation failed: ${graphResponse.statusText}`);
          }

          // Process the streaming response for graph code generation
          const graphReader = graphResponse.body?.getReader();
          if (!graphReader) {
            throw new Error('No response body from graph generation');
          }

          let graphFull = '';
          const graphToolCalls: any[] = [];
          const graphToolResults: any[] = [];

          try {
            while (true) {
              const { done, value } = await graphReader.read();
              if (done) break;

              const chunk = new TextDecoder().decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  
                  switch (data.t) {
                    case 'token':
                      graphFull += data.d;
                      controller.enqueue(
                        encoder.encode(JSON.stringify({ t: 'token', d: data.d }) + '\n')
                      );
                      break;

                    case 'tool_call':
                      graphToolCalls.push(data);
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
                      graphToolResults.push(data);
                      controller.enqueue(
                        encoder.encode(JSON.stringify(data) + '\n')
                      );
                      break;

                    case 'final':
                      break;

                    case 'error':
                      throw new Error(data.error);
                  }
                } catch (parseErr) {
                  console.warn('Failed to parse graph response line:', line);
                }
              }
            }
          } finally {
            graphReader.releaseLock();
          }

          // Add assistant response for graph to session
          const graphAssistantMessage: Message = {
            role: 'assistant',
            content: graphFull,
            variables: {
              ASSISTANT_RESPONSE: graphFull
            }
          };
          addMessageToSession(graphSessionId, graphAssistantMessage);

          // Send final completion
          const allFileOperations = graphToolResults
            .map(tr => (tr.result as any)?.operation)
            .filter(Boolean);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ 
                t: 'final', 
                reply: graphFull, 
                operations: allFileOperations,
                toolCalls: graphToolCalls.length,
                toolResults: graphToolResults.length,
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