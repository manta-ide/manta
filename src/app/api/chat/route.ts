import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { promises as fs } from 'fs';
import path from 'path';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function getSystemPrompt() {
    const filePath = path.join(process.cwd(), 'src', 'lib', 'prompts', 'edit-component.txt');
    return fs.readFile(filePath, 'utf-8');
}

function extractCode(text: string): string {
    const match = text.match(/```jsx\n([\s\S]*?)\n```/);
    return match ? match[1] : text;
}


export async function POST(req: NextRequest) {
  try {
    const { messages, code, selection } = (await req.json()) as { 
        messages: Message[], 
        code: string, 
        selection: { x: number, y: number, width: number, height: number } | null 
    };

    const lastUserMessage = messages[messages.length - 1].content;
    const systemPrompt = await getSystemPrompt();

    const selectionPrompt = selection 
        ? `The user has selected a specific area to edit with the following coordinates: x: ${Math.round(selection.x)}, y: ${Math.round(selection.y)}, width: ${Math.round(selection.width)}, height: ${Math.round(selection.height)}.`
        : '';

    const prompt = `${systemPrompt}

The user wants to make the following change: "${lastUserMessage}".
${selectionPrompt}
    
Here is the current code of the component:
\`\`\`jsx
${code}
\`\`\`
`;

    const { text: newCodeResponse } = await generateText({
      model: azure('gpt-4o'),
      prompt,
    });

    const newCode = extractCode(newCodeResponse);

    const assistantResponsePrompt = `The user wanted to "${lastUserMessage}". Briefly explain what you did.`;

    const { text: assistantMessage } = await generateText({
        model: azure('gpt-4o'),
        prompt: assistantResponsePrompt
    })


    return new Response(JSON.stringify({ reply: assistantMessage, code: newCode }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(err.message || 'Error generating text', { status: 500 });
  }
} 