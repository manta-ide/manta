import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { azure, createAzure } from '@ai-sdk/azure';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { fileTools } from '@/app/api/lib/aiFileTools';
import { 
  Message, 
  ParsedMessage, 
  ClientChatRequestSchema,
  MessageVariablesSchema
} from '../lib/schemas';
import { buildConversationForAI, addMessageToSession } from '../lib/conversationStorage';

export async function POST(req: NextRequest) {
  try {
    // Parse and validate the request body using Zod
    const { userMessage, sessionId = 'default' } = ClientChatRequestSchema.parse(await req.json());

    const templates = {
      'user': await getTemplate('user-prompt-template'),
      'assistant': await getTemplate('assistant-prompt-template'),
      'system': await getTemplate('system-prompt-template')
    };

    // Build the complete conversation on the backend
    const allMessages = await buildConversationForAI(sessionId, userMessage);

    // Parse all messages uniformly, with Zod validation on variables
    const parsedMessages: ParsedMessage[] = allMessages.map(message => {
      const template = templates[message.role];
      // Validate message variables against schema before using them
      const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
      const content = parseMessageWithTemplate(template, validatedVariables);
      return { role: message.role, content };
    });
    console.log("PARSED MESSAGES");
    console.log(JSON.stringify(allMessages.map(m => m.variables), null, 2));
    // Kick off model stream with tools and abort signal support
    const result = await streamText({
      model: azure('o4-mini'),
      messages: parsedMessages,
      tools: fileTools,
      maxSteps: 5, // Allow up to 5 steps for multi-step operations
      abortSignal: req.signal, // Forward the abort signal for stream cancellation
      providerOptions: {
        azure: {
          reasoning_effort: 'high'
        }
      }
    });

    const encoder = new TextEncoder();
    let full = '';
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Consume full stream including tool calls
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
                // Send tool call info to UI for display
                controller.enqueue(
                  encoder.encode(JSON.stringify({ 
                    t: 'tool_call', 
                    toolName: chunk.toolName,
                    args: chunk.args,
                    // For readFile, include the filename in the language for proper display
                    language: chunk.toolName === 'readFile' ? `tool-status:readFile:calling:${chunk.args.path}` : undefined
                  }) + '\n')
                );
                break;

              case 'tool-result':
                toolResults.push(chunk);
                
                // Extract file operation from tool result (only for tools that have operations)
                if ((chunk.result as any)?.operation && ['createFile', 'updateFile', 'patchFile', 'deleteFile'].includes(chunk.toolName)) {
                  // The file operations are now collected from toolResults
                }
                
                // Send tool result to UI, including any file content for code blocks
                const resultData: any = { 
                  t: 'tool_result', 
                  toolName: chunk.toolName,
                  result: chunk.result 
                };

                // For file operations, add code block data
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
                // Step finished, continue to next step
                break;

              case 'finish':
                // All steps completed
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

          // Send final completion with file operations for the old system compatibility
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
                toolResults: toolResults.length 
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
