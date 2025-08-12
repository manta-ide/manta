import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { getGraphSession, loadGraphFromFile, markNodesBuilt } from '@/app/api/lib/graphStorage';
import path from 'path';

// New prompt for partial code generation
const PARTIAL_CODE_CONFIG = {
  model: 'gpt-4.1-nano',
  maxSteps: 50,
  streaming: true,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'low' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-partial-code-generation-template',
  },
  structuredOutput: false,
} as const;

const EditHintSchema = z.object({ previousPrompt: z.string(), newPrompt: z.string() });
const RequestSchema = z.object({
  userMessage: MessageSchema,
  sessionId: z.string().optional(),
  nodeIds: z.array(z.string()).min(1),
  includeDescendants: z.boolean().optional(),
  editHints: z.record(z.string(), EditHintSchema).optional(),
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

    const { userMessage, nodeIds, includeDescendants = true, editHints } = parsed.data;
    const sessionId = parsed.data.sessionId ?? 'default';
    let graph = getGraphSession(sessionId);
    if (!graph) {
      await loadGraphFromFile(sessionId);
      graph = getGraphSession(sessionId);
      if (!graph) {
        return new Response(JSON.stringify({ error: 'No graph found for session. Generate graph first.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Extract subset of nodes for partial code gen (optionally include descendants)
    const idSet = new Set<string>();
    const queue = [...nodeIds];
    for (const id of queue) idSet.add(id);
    if (includeDescendants) {
      const byId = new Map(graph.nodes.map(n => [n.id, n]));
      for (let i = 0; i < queue.length; i++) {
        const currentId = queue[i];
        const node = byId.get(currentId);
        if (!node) continue;
        for (const child of node.children || []) {
          if (!idSet.has(child.id)) {
            idSet.add(child.id);
            queue.push(child.id);
          }
        }
      }
    }
    const partialGraph = {
      rootId: graph.rootId,
      nodes: graph.nodes.filter(n => idSet.has(n.id)),
    };

    const graphSessionId = `${sessionId}-partial-code`;
    const parsedMessages = await buildParsedMessages(
      graphSessionId,
      userMessage,
      PARTIAL_CODE_CONFIG.promptTemplates,
      {
        GRAPH_DATA: JSON.stringify(partialGraph, null, 2),
        SELECTED_NODE_IDS: JSON.stringify(Array.from(idSet)),
        STRICT_EDIT_MODE: '1',
        EDIT_HINTS: editHints ? JSON.stringify(editHints) : undefined,
      }
    );

    // Call agent with centralized logging
    const response = await callAgent(req, {
      sessionId: graphSessionId,
      parsedMessages,
      config: PARTIAL_CODE_CONFIG,
      operationName: 'partial-code',
      metadata: {
        nodeIds: Array.from(idSet),
        editHints: editHints ?? null
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Partial code generation failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream through to client while also marking nodes built at the end
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
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
          // After streaming completes, mark nodes as built
          try { await markNodesBuilt(sessionId, nodeIds); } catch {}
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


