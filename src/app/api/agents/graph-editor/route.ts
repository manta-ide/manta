import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { storeGraph } from '@/app/api/lib/graphStorage';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { GraphSchema } from '@/app/api/lib/schemas';
import { setCurrentGraph, resetPendingChanges } from '@/app/api/lib/graphEditorTools';

// Multi-step agent configuration for graph editing
const GRAPH_EDITOR_CONFIG = {
  model: 'gpt-4o',
  maxSteps: 15,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-editor-template',
  },
  structuredOutput: false,
  toolsetName: 'graph-editor'
} as const;

const RequestSchema = z.object({
  userMessage: MessageSchema,
});

async function buildParsedMessages(
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables?: Record<string, unknown>
): Promise<ParsedMessage[]> {
  const session = getConversationSession();
  const systemMessage = await createSystemMessage();
  addMessageToSession(userMessage);
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
      console.log('Graph editor request schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage } = parsed.data;
    const graph = await fetchGraphFromApi(req);
    if (!graph) {
      console.log('No graph found. Generate graph first.');
      return new Response(JSON.stringify({ error: 'No graph found. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize the graph editor tools with the current graph
    setCurrentGraph(graph);

    const variables = {
      GRAPH_DATA: JSON.stringify(graph, null, 2),
    };

    const parsedMessages = await buildParsedMessages(
      userMessage,
      GRAPH_EDITOR_CONFIG.promptTemplates,
      variables
    );

    const response = await callAgent(req, {
      sessionId: 'graph-editor',
      parsedMessages,
      config: GRAPH_EDITOR_CONFIG,
      operationName: 'graph-editor',
      metadata: {
        originalGraphId: graph.rootId,
        graphNodeCount: graph.nodes.length,
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Graph editor failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    
    // Check if the agent applied changes and saved the graph
    const finalGraph = await fetchGraphFromApi(req);
    const graphWasModified = finalGraph && JSON.stringify(finalGraph) !== JSON.stringify(graph);
    
    // Reset pending changes after the operation
    resetPendingChanges();
    
    return new Response(JSON.stringify({ 
      success: true,
      result: result.result,
      graphModified: graphWasModified,
      finalGraph: graphWasModified ? finalGraph : null,
      originalGraph: graph,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    // Reset pending changes on error
    resetPendingChanges();
    return new Response(JSON.stringify({ 
      error: err?.message || 'Server error',
      success: false 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
