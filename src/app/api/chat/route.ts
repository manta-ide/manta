import { streamText } from 'ai';
import { azure } from '@ai-sdk/azure';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: azure('gpt-4o'), // You can change this to your Azure model
    messages,
  });

  return result.toDataStreamResponse();
} 