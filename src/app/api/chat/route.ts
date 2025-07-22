import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { getTemplate, parseMessageWithTemplate } from '@/lib/templateHelpers';
import { parseFileOperations } from '@/lib/fileOperationHelpers';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  variables?: Record<string, string>;
}

interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: Message[];
    };

    const templates = {
      'user': await getTemplate('user-prompt-template'),
      'assistant': await getTemplate('assistant-prompt-template'),
      'system': await getTemplate('system-prompt-template')
    };

    // Parse all messages uniformly
    const parsedMessages: ParsedMessage[] = messages.map(message => {
      const template = templates[message.role];
      const content = parseMessageWithTemplate(template, message.variables || {});
      return { role: message.role, content };
    });

    // Kick off model stream
    const result = await streamText({
      model: azure('o4-mini'),
      messages: parsedMessages,
    });

    const encoder = new TextEncoder();
    let full = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Consume text deltas
          for await (const delta of result.textStream) {
            full += delta;
            controller.enqueue(
              encoder.encode(JSON.stringify({ t: 'token', d: delta }) + '\n')
            );
          }

          // Model is done -> parse file operations
          const fileOperations = parseFileOperations(full);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ t: 'final', reply: full, operations: fileOperations }) + '\n'
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
