import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText, generateObject } from 'ai';
import { azure, google } from '@ai-sdk/azure';
import { fileTools } from '@/app/api/lib/fileTools';
import { GraphSchema } from '@/app/api/lib/schemas';
import { addMessageToSession } from '@/app/api/lib/conversationStorage';
import path from 'path';
import { createWriteStream } from 'fs';
import { promises as fsp } from 'fs';

// Agent configuration schema
const AgentConfigSchema = z.object({
  model: z.string(),
  maxSteps: z.number().optional(),
  streaming: z.boolean().optional(),
  temperature: z.number().optional(),
  provider: z.enum(['azure', 'google']).optional(),
  providerOptions: z.record(z.any()).optional(),
  promptTemplates: z.record(z.string()).optional(),
  structuredOutput: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
});

// Request schema with required configuration
const AgentRequestSchema = z.object({
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
    const { parsedMessages, config, operationName = 'agent', metadata } = AgentRequestSchema.parse(await req.json());
    // If no parsedMessages provided, create a simple message array
    const messages = parsedMessages;
    // Use the provided tools or default to fileTools
    const tools = config.tools || null;
    // Provider/model selection helpers
    const detectProvider = (modelId: string): 'azure' | 'google' => {
      const id = modelId.toLowerCase();
      if (
        id.includes('gemini') ||
        id.includes('gemma') ||
        id.includes('imagen') ||
        id.includes('text-embedding') ||
        id.includes('gemini-embedding')
      ) {
        return 'google';
      }
      return 'azure';
    };

    const selectModel = (modelId: string, provider?: 'azure' | 'google') => {
      const p = provider ?? detectProvider(modelId);
      return p === 'google' ? google(modelId) : azure(modelId);
    };

    // Prepare streamText options
    const streamOptions: any = {
      model: selectModel(config.model, config.provider) as any,
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
      `${operationName}-${Date.now()}.log`
    );
    const logStream = createWriteStream(logFilePath, { flags: 'a' });
    const writeLog = (s: string) => logStream.write(s.endsWith('\n') ? s : s + '\n');

    // Header
    writeLog(`[${operationName}]`);
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
        model: selectModel(config.model, config.provider) as any,
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
      }, null, 2));

      // Add assistant response to conversation
      const assistantMessage = {
        role: 'assistant' as const,
        content: JSON.stringify(result.object),
        variables: { ASSISTANT_RESPONSE: JSON.stringify(result.object) }
      };
      addMessageToSession(assistantMessage);

      logStream.end();
      return new Response(JSON.stringify({
        result: {
          object: result.object,
          finishReason: result.finishReason,
          usage: result.usage,
          warnings: result.warnings,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Streaming mode
    if (config.streaming) {
      const { textStream } = await streamText(streamOptions);

      // Log streaming start
      writeLog(`[${operationName}] streaming-start`);

      // Create a readable stream that logs and transforms the text stream
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of textStream.textStream) {
              // Log each chunk
              writeLog(`[${operationName}] chunk: ${chunk}`);
              
              // Send chunk to client
              controller.enqueue(new TextEncoder().encode(chunk));
            }

            // Log final result
            writeLog(`[${operationName}] streaming-complete`);
            writeLog(`[${operationName}] final-text: ${textStream.text}`);

            // Add assistant response to conversation
            const assistantMessage = {
              role: 'assistant' as const,
              content: textStream.text,
              variables: { ASSISTANT_RESPONSE: textStream.text }
            };
            addMessageToSession(assistantMessage);

            logStream.end();
            controller.close();
          } catch (error) {
            writeLog(`[${operationName}] error: ${error}`);
            logStream.end();
            controller.error(error);
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming mode
    const { text } = await streamText(streamOptions);

    // Log final result
    writeLog(`[${operationName}] non-streaming-complete`);
    writeLog(`[${operationName}] final-text: ${text}`);

    // Add assistant response to conversation
    const assistantMessage = {
      role: 'assistant' as const,
      content: text,
      variables: { ASSISTANT_RESPONSE: text }
    };
    addMessageToSession(assistantMessage);

    logStream.end();
    return new Response(JSON.stringify({
      result: {
        content: text,
        finishReason: 'stop',
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('LLM Agent error:', err);
    return new Response(
      JSON.stringify({ 
        error: err?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
