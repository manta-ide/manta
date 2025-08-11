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

import { GraphSchema } from '@/app/api/lib/graphStorage';
import { promises as fsp } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';

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

// Request schema with required configuration
const AgentRequestSchema = z.object({
  sessionId: z.string().optional(),
  parsedMessages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
  config: AgentConfigSchema,
  operationName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {

    // Parse and validate the request body using Zod
    const {sessionId = 'default', parsedMessages, config, operationName = 'agent', metadata } = AgentRequestSchema.parse(await req.json());
    // If no parsedMessages provided, create a simple message array
    const messages = parsedMessages;
    // Use the provided tools or default to fileTools
    const tools = config.tools || null;
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

    // Prepare logging (shared across all modes)
    const logsDir = path.join(process.cwd(), 'logs');
    await fsp.mkdir(logsDir, { recursive: true });
    const logFilePath = path.join(
      logsDir,
      `${operationName}-${sessionId}-${Date.now()}.log`
    );
    const logStream = createWriteStream(logFilePath, { flags: 'a' });
    const writeLog = (s: string) => logStream.write(s.endsWith('\n') ? s : s + '\n');

    // Header
    writeLog(`[${operationName}] session=${sessionId}`);
    if (metadata) writeLog(`[${operationName}] metadata=${JSON.stringify(metadata)}`);
    writeLog(`[${operationName}] messages:`);
    (messages || []).forEach((m, i) => {
      writeLog(`--- message[${i}] role=${m.role} ---`);
      writeLog(m.content);
      writeLog(`--- end message[${i}] ---`);
    });

    // If structured output is requested, use generateObject instead
    if (config.structuredOutput) {

      const result = await generateObject({
        model: azure(config.model),
        messages: messages,
        // Force JSON mode and ensure the schema is treated as an object JSON Schema
        mode: 'json',
        schema: GraphSchema,
        abortSignal: req.signal,
        providerOptions: config.providerOptions,
        temperature: config.temperature,
      });


      // Log structured result
      writeLog(`[${operationName}] structured-result:`);
      writeLog(JSON.stringify({
        object: result.object,
        finishReason: result.finishReason,
        usage: result.usage,
        warnings: result.warnings,
        providerMetadata: result.providerMetadata,
        experimental_providerMetadata: result.experimental_providerMetadata,
      }));
      logStream.end();

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

      // Log non-streaming result
      writeLog(`[${operationName}] text-result:`);
      writeLog(JSON.stringify(result));
      logStream.end();

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
                writeLog(JSON.stringify({ t: 'token', d: chunk.textDelta }));
                controller.enqueue(
                  encoder.encode(JSON.stringify({ t: 'token', d: chunk.textDelta }) + '\n')
                );
                break;

              case 'tool-call':
                toolCalls.push(chunk);
                writeLog(JSON.stringify({ t: 'tool_call', toolName: chunk.toolName, args: chunk.args }));
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
                writeLog(JSON.stringify({ t: 'tool_result', toolName: (chunk as any).toolName, result: (chunk as any).result }));
                
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

          writeLog(`[${operationName}] end of stream`);
          logStream.end();

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
          writeLog(`[${operationName}] error: ${String(err?.message || err)}`);
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
