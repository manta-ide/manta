import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { promises as fs } from 'fs';
import path from 'path';
import { extractFirstJsx, extractAllDiffBlocks, applyAllDiffBlocks } from '@/app/diffHelpers';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function getSystemPrompt() {
  const filePath = path.join(process.cwd(), 'src', 'lib', 'prompts', 'system-prompt.txt');
  return fs.readFile(filePath, 'utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const { messages, currentCode, selection } = (await req.json()) as {
      messages: Message[];
      selection: { x: number; y: number; width: number; height: number } | null;
      currentCode?: string;
    };

    const lastUserMessage = messages[messages.length - 1]?.content ?? '';
    const systemPrompt = await getSystemPrompt();

    let prompt = '';
    if (currentCode) {
      prompt += `\n\nCurrent component code:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n`;
      console.log("currentCode", currentCode);
    }
    if (selection) {
      prompt += `\n\nThe user has selected an area (x:${Math.round(selection.x)}, y:${Math.round(selection.y)}, w:${Math.round(selection.width)}, h:${Math.round(selection.height)}).`;
    }
    prompt += `\n\nUser request: "${lastUserMessage}"`;

    // Kick off model stream
    const result = await streamText({
      model: azure('gpt-4o'),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
        { role: 'user', content: prompt },
      ],
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
          let newCode = currentCode ?? '';
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
