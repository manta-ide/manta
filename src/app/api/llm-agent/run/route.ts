import { NextRequest } from 'next/server';
import { streamText, generateObject, zodSchema } from 'ai';
import { azure } from '@ai-sdk/azure';
import { z } from 'zod';
import { fileTools } from '@/app/api/lib/aiFileTools';
import { 
  Message, 
  ParsedMessage, 
  ClientChatRequestSchema
} from '../../lib/schemas';
import { addMessageToSession } from '../../lib/conversationStorage';


// Configuration schema for the agent
const AgentConfigSchema = z.object({
  model: z.string(),
  maxSteps: z.number().int().min(1),
  tools: z.any().optional(), // Allow any tool type
  streaming: z.boolean(),
  providerOptions: z.any().optional(),
  temperature: z.number().optional(),
  structuredOutput: z.boolean()
});

// Create a schema for graph generation results
export const GraphResultSchema = z.object({
  rootId: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    kind: z.enum(['page','section','group','component','primitive','behavior']),
    what: z.string(),
    how: z.string(),
    properties: z.array(z.string()),
    children: z.array(z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(['page','section','group','component','primitive','behavior']),
    })),
  }))
});



// Request schema with required configuration
const AgentRequestSchema = z.object({
  sessionId: z.string().optional(),
  parsedMessages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
  config: AgentConfigSchema,
});

export async function POST(req: NextRequest) {
  try {

    // Parse and valida
    // te the request body using Zod
    const {sessionId = 'default', parsedMessages, config } = AgentRequestSchema.parse(await req.json());
    // If no parsedMessages provided, create a simple message array
    const messages = parsedMessages;
    // Use the provided tools or default to fileTools
    const tools = config.tools || fileTools;
    // Prepare streamText options
    const streamOptions: any = {
      model: azure(config.model),
      messages: messages,
      tools: fileTools,
      maxSteps: config.maxSteps,
      abortSignal: req.signal,
      temperature: config.temperature
    };

    // Add provider options if provided
    if (config.providerOptions) {
      streamOptions.providerOptions = config.providerOptions;
    }

    // If structured output is requested, use generateObject instead
    if (config.structuredOutput) {

      console.log(GraphResultSchema);
      const result = await generateObject({
        model: azure(config.model),
        messages: messages,
        // Force JSON mode and ensure the schema is treated as an object JSON Schema
        mode: 'json',
        schema: GraphResultSchema,
        abortSignal: req.signal,
        providerOptions: config.providerOptions,
        temperature: config.temperature,
      });


      return new Response(JSON.stringify({
        type: 'structured',
        result: {
          object: result.object,
          finishReason: result.finishReason,
          usage: result.usage,
          warnings: result.warnings,
          providerMetadata: result.providerMetadata,
          experimental_providerMetadata: result.experimental_providerMetadata,
          response: result.response,
          request: result.request
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If streaming is disabled, use generateText instead
    if (!config.streaming) {
      const { generateText } = await import('ai');
      const result = await generateText({
        model: azure(config.model),
        messages: messages,
        tools: tools,
        maxSteps: config.maxSteps,
        abortSignal: req.signal,
        providerOptions: config.providerOptions,
        temperature: config.temperature
      });

      return new Response(JSON.stringify({
        type: 'text',
        result: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Kick off model stream with tools and abort signal support
    const result = await streamText(streamOptions);

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
              case 'error':
                controller.enqueue(
                  encoder.encode(JSON.stringify({ t: 'error', error: String(chunk.error) }) + '\n')
                );
                break;
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

              case 'tool-result' as any:
                toolResults.push(chunk);
                
                // Send tool result to UI, including any file content for code blocks
                const resultData: any = { 
                  t: 'tool_result', 
                  toolName: (chunk as any).toolName,
                  result: (chunk as any).result 
                };

                // For file operations, add code block data
                if ((chunk as any).toolName === 'createFile' || (chunk as any).toolName === 'updateFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === (chunk as any).toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: (chunk as any).toolName === 'createFile' ? `create:${toolCall.args.path}` : `update:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.content
                    };
                  }
                } else if ((chunk as any).toolName === 'readFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === (chunk as any).toolCallId);
                  if (toolCall && (chunk as any).result?.success) {
                    resultData.codeBlock = {
                      language: `tool-status:readFile:completed:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: (chunk as any).result.content
                    };
                  }
                } else if ((chunk as any).toolName === 'patchFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === (chunk as any).toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: `patch:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.patch
                    };
                  }
                } else if ((chunk as any).toolName === 'deleteFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === (chunk as any).toolCallId);
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
