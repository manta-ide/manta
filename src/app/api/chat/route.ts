import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { promises as fs } from 'fs';
import path from 'path';
import { extractFirstJsx, extractAllDiffBlocks, applyAllDiffBlocks } from '@/app/diffHelpers';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  variables?: Record<string, string>;
}

interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function getTemplate(templateName: string) {
  const filePath = path.join(process.cwd(), 'src', 'lib', 'prompts', `${templateName}.txt`);
  return fs.readFile(filePath, 'utf-8');
}

function parseTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  
  // Handle conditional sections first
  Object.entries(variables).forEach(([key, value]) => {
    // Find conditional sections for this variable
    const sectionRegex = new RegExp(
      `\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, 
      'g'
    );
    
    result = result.replace(sectionRegex, (match, content) => {
      // If variable has a value, include the section content, otherwise remove it
      return value ? content : '';
    });
  });
  
  // Replace regular variables
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });
  
  return result;
}

function parseMessageWithTemplate(template: string, variables: Record<string, string>): string {
  return parseTemplate(template, variables);
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

          // Model is done -> derive code patch
          const systemMessage = messages.find(m => m.role === 'system');
          const currentCode = systemMessage?.variables?.CURRENT_CODE || '';
          let newCode = currentCode;
          const jsxBlock = extractFirstJsx(full);
          if (jsxBlock) {
            newCode = jsxBlock;
          } else if (currentCode) {
            const diffBlocks = extractAllDiffBlocks(full);
            if (diffBlocks.length > 0) {
              newCode = applyAllDiffBlocks(currentCode, diffBlocks);
            }
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ t: 'final', reply: full, code: newCode }) + '\n'
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
