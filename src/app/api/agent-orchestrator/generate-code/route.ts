import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { getGraphSession, markNodesBuilt } from '@/app/api/lib/graphStorage';

const CODE_GEN_CONFIG = {
  model: 'o3',
  maxSteps: 50,
  streaming: true,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-code-generation-template',
  },
  structuredOutput: false,
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
    const graph = getGraphSession(sessionId);
    if (!graph) {
      return new Response(JSON.stringify({ error: 'No graph found for session. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const graphSessionId = `${sessionId}-graph-code`;
    const parsedGraphCodeMessages = await buildParsedMessages(
      graphSessionId,
      userMessage,
      CODE_GEN_CONFIG.promptTemplates,
      { GRAPH_DATA: JSON.stringify(graph, null, 2) }
    );

    const graphResponse = await callAgent(req, {
      sessionId: graphSessionId,
      parsedMessages: parsedGraphCodeMessages,
      config: CODE_GEN_CONFIG,
    });

    if (!graphResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Graph code generation failed: ${graphResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream through to client and when done mark all nodes as built
    const stream = new ReadableStream({
      async start(controller) {
        const reader = graphResponse.body?.getReader();
        if (!reader) { controller.close(); return; }
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let buffered = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
            buffered += chunk;
          }
        } finally {
          controller.close();
          try {
            await markNodesBuilt(sessionId, graph.nodes.map(n => n.id));
          } catch {}
        }
      }
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


