import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { getGraphSession, storeGraph } from '@/app/api/lib/graphStorage';

// New prompt for editing graph
const EDIT_GRAPH_CONFIG = {
  model: 'gpt-4o',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-edit-template',
  },
  structuredOutput: true,
} as const;

const RequestSchema = z.object({
  userMessage: MessageSchema,
  sessionId: z.string().optional(),
  // optional constraints
  includeNodeIds: z.array(z.string()).optional(),
  removeNodeIds: z.array(z.string()).optional(),
});

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

    const { userMessage, includeNodeIds, removeNodeIds } = parsed.data;
    const sessionId = parsed.data.sessionId ?? 'default';
    const graph = getGraphSession(sessionId);
    if (!graph) {
      return new Response(JSON.stringify({ error: 'No graph found for session. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const variables = {
      GRAPH_DATA: JSON.stringify(graph, null, 2),
      INCLUDE_NODE_IDS: includeNodeIds?.join(', ') || '',
      REMOVE_NODE_IDS: removeNodeIds?.join(', ') || '',
    };

    const parsedMessages = await buildParsedMessages(
      sessionId,
      userMessage,
      EDIT_GRAPH_CONFIG.promptTemplates,
      variables
    );

    const response = await callAgent(req, {
      sessionId,
      parsedMessages,
      config: EDIT_GRAPH_CONFIG,
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Edit graph failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const newGraph = result.result.object;
    await storeGraph(sessionId, newGraph);
    return new Response(JSON.stringify({ graph: newGraph }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
}


