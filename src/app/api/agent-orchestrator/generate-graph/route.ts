import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { storeGraph } from '@/app/api/lib/graphStorage';

// Config for full graph generation
const GRAPH_GEN_CONFIG = {
  model: 'gpt-4o',
  maxSteps: 50,
  streaming: true,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-generation-template',
  },
  structuredOutput: true,
} as const;

const RequestSchema = z.object({ userMessage: MessageSchema, sessionId: z.string().optional() });

async function buildParsedMessages(
  sessionId: string,
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables?: Record<string, unknown>
): Promise<ParsedMessage[]> {
  const session = getConversationSession(sessionId);
  const systemMessage = await createSystemMessage(sessionId);
  addMessageToSession(sessionId, userMessage);
  const allMessages = [systemMessage, ...session];

  const parsed: ParsedMessage[] = await Promise.all(
    allMessages.map(async (message) => {
      const template = await getTemplate(promptTemplates[message.role]);
      const validatedVariables = MessageVariablesSchema.parse({
        ...(message.variables || {}),
        ...(extraVariables || {}),
      });
      const content = parseMessageWithTemplate(template, validatedVariables);
      return { role: message.role, content };
    })
  );
  return parsed;
}

async function callAgent(request: NextRequest, body: unknown): Promise<Response> {
  return fetch('http://localhost:3000/api/llm-agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage } = parsed.data;
    const sessionId = parsed.data.sessionId ?? 'default';

    // Build messages and run graph generation
    const parsedGraphGenMessages = await buildParsedMessages(
      sessionId,
      userMessage,
      GRAPH_GEN_CONFIG.promptTemplates
    );

    const graphGenResponse = await callAgent(req, {
      sessionId,
      parsedMessages: parsedGraphGenMessages,
      config: GRAPH_GEN_CONFIG,
    });

    if (!graphGenResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Graph generation failed: ${graphGenResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const graphGenResult = await graphGenResponse.json();
    const graph = graphGenResult.result.object;

    await storeGraph(sessionId, graph);

    return new Response(JSON.stringify({ graph }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
}


